from typing import List, Optional, Dict, Any
import json
import os
from uuid import UUID, uuid4
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.models import Preset, Pipeline, PipelineStatus

class PresetService:
    def __init__(self):
        self.presets_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "presets")

    async def load_builtin_presets(self, db: AsyncSession) -> List[Preset]:
        """Load all JSON presets from the presets directory into the database"""
        loaded_presets = []
        
        # Ensure directory exists
        if not os.path.exists(self.presets_dir):
            return []
            
        for filename in os.listdir(self.presets_dir):
            if filename.endswith(".json"):
                file_path = os.path.join(self.presets_dir, filename)
                try:
                    with open(file_path, "r", encoding="utf-8") as f:
                        preset_data = json.load(f)
                        
                        # Check if preset already exists by name/category
                        result = await db.execute(
                            select(Preset).where(
                                Preset.name == preset_data["name"],
                                Preset.category == preset_data["category"]
                            )
                        )
                        existing = result.scalar_one_or_none()
                        
                        if not existing:
                            preset = Preset(
                                name=preset_data["name"],
                                category=preset_data["category"],
                                description=preset_data.get("description"),
                                use_cases=preset_data.get("use_cases", []),
                                document_types=preset_data.get("document_types", []),
                                tags=preset_data.get("tags", []),
                                configuration=preset_data.get("configuration", {}),
                                expected_metrics=preset_data.get("expected_metrics", {}),
                                thumbnail_url=preset_data.get("thumbnail_url"),
                                is_public=True
                            )
                            db.add(preset)
                            loaded_presets.append(preset)
                        else:
                            # Update existing system preset
                            existing.configuration = preset_data.get("configuration", {})
                            existing.expected_metrics = preset_data.get("expected_metrics", {})
                            existing.use_cases = preset_data.get("use_cases", [])
                            existing.document_types = preset_data.get("document_types", [])
                            existing.tags = preset_data.get("tags", [])
                            existing.description = preset_data.get("description")
                            existing.thumbnail_url = preset_data.get("thumbnail_url")
                            loaded_presets.append(existing)
                            
                except Exception as e:
                    print(f"Error loading preset {filename}: {str(e)}")
                    continue
                    
        await db.commit()
        return loaded_presets

    async def get_all_presets(self, db: AsyncSession, category: Optional[str] = None) -> List[Preset]:
        """Fetch presets from database, optionally filtered by category"""
        query = select(Preset).where(Preset.is_public == True)
        
        if category:
            query = query.where(Preset.category == category)
            
        result = await db.execute(query)
        return list(result.scalars().all())

    async def get_preset_by_id(self, db: AsyncSession, preset_id: UUID) -> Optional[Preset]:
        """Fetch single preset by ID"""
        return await db.get(Preset, preset_id)

    async def apply_preset_to_pipeline(
        self,
        db: AsyncSession,
        preset_id: UUID,
        pipeline_name: Optional[str] = None,
        custom_config: Optional[Dict[str, Any]] = None,
        document_id: Optional[UUID] = None
    ) -> Pipeline:
        """Create a new pipeline based on a preset, with optional overrides and document linking"""
        preset = await self.get_preset_by_id(db, preset_id)
        if not preset:
            raise ValueError("Preset not found")
            
        # Use provided configuration or fallback to preset defaults
        config = custom_config if custom_config else preset.configuration.copy()
        
        # Store document_id in settings for the visualizer to find
        if document_id:
            config["document_id"] = str(document_id)
        
        # Generate nodes and edges from configuration
        nodes = self._generate_nodes_from_config(config)
        edges = self._generate_edges_from_nodes(nodes)
        
        pipeline = Pipeline(
            name=pipeline_name or f"{preset.name} Pipeline",
            description=f"Created from preset: {preset.name}" + (" (Analyzed)" if custom_config else ""),
            status=PipelineStatus.DRAFT,
            nodes=nodes,
            edges=edges,
            settings=config,
            preset_id=preset.id
        )
        
        db.add(pipeline)
        await db.commit()
        await db.refresh(pipeline)
        return pipeline

    def _generate_nodes_from_config(self, config: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Convert preset configuration to React Flow nodes"""
        nodes = []
        y_pos = 100
        x_pos = 250
        gap = 150
        
        # 1. Input Node
        nodes.append({
            "id": "input_node",
            "type": "loader",
            "position": {"x": x_pos, "y": y_pos},
            "data": {"label": "Document Input"}
        })
        y_pos += gap
        
        # 2. Chunking Node
        chunking_config = config.get("chunking", {})
        nodes.append({
            "id": "chunking_node",
            "type": "splitter",
            "position": {"x": x_pos, "y": y_pos},
            "data": {
                "label": f"{chunking_config.get('method', 'fixed').title()} Chunking",
                **chunking_config
            }
        })
        y_pos += gap
        
        # 3. Embedding Node
        embedding_config = config.get("embedding", {})
        nodes.append({
            "id": "embedding_node",
            "type": "embedder",
            "position": {"x": x_pos, "y": y_pos},
            "data": {
                "label": f"{embedding_config.get('provider', 'openai').title()} Embedding",
                **embedding_config
            }
        })
        y_pos += gap
        
        # 4. Storage Node
        storage_config = config.get("storage", {})
        nodes.append({
            "id": "storage_node",
            "type": "vector_db",
            "position": {"x": x_pos, "y": y_pos},
            "data": {
                "label": f"PGVector Store",
                **storage_config
            }
        })
        y_pos += gap
        
        # 5. Retrieval Node
        retrieval_config = config.get("retrieval", {})
        nodes.append({
            "id": "retrieval_node",
            "type": "search",
            "position": {"x": x_pos, "y": y_pos},
            "data": {
                "label": f"{retrieval_config.get('algorithm', 'similarity').replace('_', ' ').title()}",
                **retrieval_config
            }
        })
        
        # Optional: Reranking
        if config.get("reranking"):
            y_pos += gap
            rerank_config = config.get("reranking")
            if rerank_config is True:
                # Provide default dictionary if it was just a boolean
                rerank_config = {"provider": "cohere", "model": "rerank-english-v3.0", "return_k": 5}
                
            nodes.append({
                "id": "reranking_node",
                "type": "reranker",
                "position": {"x": x_pos, "y": y_pos},
                "data": {
                    "label": "Reranker",
                    **rerank_config
                }
            })
            
        # Optional: Augmentation
        if "augmentation" in config:
            y_pos += gap
            aug_config = config.get("augmentation", {})
            nodes.append({
                "id": "augmentation_node",
                "type": "hyde", # Use hyde as a representative for augmentation
                "position": {"x": x_pos, "y": y_pos},
                "data": {
                    "label": "Query Augmentation",
                    **aug_config
                }
            })
            
        # 6. Generation (LLM) Node
        y_pos += gap
        gen_config = config.get("generation", {})
        nodes.append({
            "id": "generation_node",
            "type": "llm",
            "position": {"x": x_pos, "y": y_pos},
            "data": {
                "label": f"{gen_config.get('llm', 'GPT-4')}",
                **gen_config
            }
        })
        
        return nodes

    def _generate_edges_from_nodes(self, nodes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Create edges connecting the nodes sequentially"""
        edges = []
        for i in range(len(nodes) - 1):
            source = nodes[i]["id"]
            target = nodes[i+1]["id"]
            edges.append({
                "id": f"e_{source}_{target}",
                "source": source,
                "target": target,
                "type": "smoothstep",
                "animated": True
            })
        return edges

preset_service = PresetService()

import asyncio
import logging
from collections import defaultdict, deque
from typing import List, Dict, Any, Optional, Set, Callable
from pydantic import BaseModel
from datetime import datetime
from pathlib import Path
import json
import os

# Lazy imports for heavy dependencies
try:
    import fitz
except ImportError:
    fitz = None


# Configure logging
logger = logging.getLogger(__name__)

# --- Data Models ---
class PipelineNode(BaseModel):
    id: str
    type: str
    config: Dict[str, Any] = {}

class PipelineEdge(BaseModel):
    source: str
    target: str

class PipelineStatus(BaseModel):
    pipeline_id: str
    status: str  # PENDING, RUNNING, COMPLETED, FAILED, CANCELLED
    progress: float
    current_nodes: List[str]
    results: Dict[str, Any]
    error: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

# --- Executor Service ---
class PipelineExecutor:
    """
    Executes a DAG of nodes efficiently using asyncio.
    Supports parallelism, progress tracking, and cancellation.
    """
    def __init__(
        self, 
        nodes: List[Dict[str, Any]], 
        edges: List[Dict[str, Any]], 
        pipeline_id: str = "default",
        progress_callback: Optional[Callable[[PipelineStatus], None]] = None
    ):
        self.nodes = {n['id']: PipelineNode(**n) for n in nodes}
        self.edges = [PipelineEdge(**e) for e in edges]
        self.pipeline_id = pipeline_id
        self.callback = progress_callback
        
        self.adj = defaultdict(list)
        self.in_degree = defaultdict(int)
        self.results = {}
        self.status = PipelineStatus(
            pipeline_id=pipeline_id,
            status="PENDING",
            progress=0.0,
            current_nodes=[],
            results={}
        )
        self._build_graph()

    def _build_graph(self):
        """Constructs adjacency list and calculates in-degrees."""
        # Initialize in-degree for all nodes to 0
        for node_id in self.nodes:
            self.in_degree[node_id] = 0
            
        for edge in self.edges:
            self.adj[edge.source].append(edge.target)
            self.in_degree[edge.target] += 1

    def _detect_cycle(self) -> bool:
        """Kahn's algorithm check for cycles."""
        temp_in_degree = self.in_degree.copy()
        queue = deque([n for n in self.nodes if temp_in_degree[n] == 0])
        count = 0
        
        while queue:
            u = queue.popleft()
            count += 1
            for v in self.adj[u]:
                temp_in_degree[v] -= 1
                if temp_in_degree[v] == 0:
                    queue.append(v)
                    
        return count != len(self.nodes)

    async def execute(self):
        """Main execution method with wave-based parallelism and checkpointing."""
        if self._detect_cycle():
            raise ValueError("Pipeline contains a cycle (circular dependency).")

        self.status.status = "RUNNING"
        self.status.started_at = datetime.utcnow()
        self._emit_status()

        # Semaphores for resource-heavy nodes (API calls)
        api_semaphore = asyncio.Semaphore(5)
        
        # Initial set of ready nodes (in-degree 0)
        ready_queue = [n for n in self.nodes if self.in_degree[n] == 0]
        completed_count = 0
        total_nodes = len(self.nodes)

        try:
            while ready_queue:
                # 1. Update status
                self.status.current_nodes = ready_queue
                self._emit_status()

                # 2. Execute current wave in parallel
                logger.info(f"Executing wave: {ready_queue}")
                
                # We wrap each node execution with the semaphore if it's an API type
                async def sem_execute(node_id):
                    node = self.nodes[node_id]
                    if node.type in ["embedder", "llm", "reranker"]:
                        async with api_semaphore:
                            return await self._execute_node(node_id)
                    return await self._execute_node(node_id)

                tasks = [sem_execute(node_id) for node_id in ready_queue]
                wave_results = await asyncio.gather(*tasks, return_exceptions=True)

                # 3. Process results & Update next wave
                next_wave_candidates = []
                
                for node_id, result in zip(ready_queue, wave_results):
                    if isinstance(result, Exception):
                        logger.error(f"Node {node_id} failed: {result}")
                        # Optional: Mark node specifically in status
                        raise result 
                    
                    self.results[node_id] = result
                    completed_count += 1
                    
                    # Decrement neighbors
                    for neighbor in self.adj[node_id]:
                        self.in_degree[neighbor] -= 1
                        if self.in_degree[neighbor] == 0:
                            next_wave_candidates.append(neighbor)
                
                # 4. Checkpoint after each wave
                self._save_checkpoint()

                # 5. Prepare next wave
                ready_queue = next_wave_candidates
                progress_pct = (completed_count / total_nodes) * 100
                self.status.progress = progress_pct
                self._emit_status()

            self.status.status = "COMPLETED"
            self.status.completed_at = datetime.utcnow()
            self.status.results = self.results
            self._emit_status()
            
            return self.results

        except asyncio.CancelledError:
            self.status.status = "CANCELLED"
            self.status.error = "Pipeline execution was cancelled."
            self._emit_status()
            raise
        except Exception as e:
            self.status.status = "FAILED"
            self.status.error = str(e)
            self._emit_status()
            raise

    def _save_checkpoint(self):
        """Saves current results to disk for resumability."""
        checkpoint_dir = ".pipelines"
        os.makedirs(checkpoint_dir, exist_ok=True)
        checkpoint_path = os.path.join(checkpoint_dir, f"{self.pipeline_id}.json")
        try:
            with open(checkpoint_path, 'w') as f:
                json.dump(self.results, f)
            logger.info(f"Checkpoint saved to {checkpoint_path}")
        except Exception as e:
            logger.warning(f"Failed to save checkpoint: {e}")

    async def _execute_node(self, node_id: str) -> Any:
        """
        Executes a specific node logic.
        Gathers inputs from all source nodes that point to this node.
        """
        node = self.nodes[node_id]
        logger.info(f"Starting node {node_id} ({node.type})")
        
        # 1. Gather inputs from parent nodes
        inputs = {}
        for edge in self.edges:
            if edge.target == node_id:
                # Get the result of the source node
                parent_result = self.results.get(edge.source)
                inputs[edge.source] = parent_result

        # 2. Extract specific data if needed? 
        # For now, we pass the raw dictionary of {parent_id: results}
        
        # 3. FAST PATH: Real Logic for Loader
        if node.type == "loader":
            # (Keeping existing loader logic...)
            # Check for path in config (from frontend) or assume inputs has it
            file_path = node.config.get("path")
            if not file_path:
                # Fallback to sample.pdf in frontend/public (relative to project root)
                base_dir = Path(__file__).resolve().parent.parent.parent.parent
                file_path = str(base_dir / "frontend" / "public" / "sample.pdf")
                logger.warning(f"No path provided for loader {node_id}, using default: {file_path}")
            
            # Sanitize: Remove surrounding quotes if user copied as path
            file_path = file_path.strip('"').strip("'")

            try:
                if not fitz:
                    raise ImportError("PyMuPDF (fitz) is not installed.")
                doc = fitz.open(file_path)
                text = ""
                for page in doc:
                    text += page.get_text()
                
                return {
                    "node_type": "loader",
                    "file_path": file_path,
                    "text_preview": text[:200] + "...",
                    "full_text": text,
                    "full_text_length": len(text)
                }
            except Exception as e:
                logger.error(f"Failed to load PDF: {e}")
                raise e

        # 4. FAST PATH: Real Logic for LLM Generator (via LiteLLM)
        if node.type == "llm":
            try:
                from app.services.llm_service import llm_service

                # Construct Context
                context_str = ""
                for parent_id, result in inputs.items():
                    if isinstance(result, dict):
                        if "full_text" in result:
                            context_str += f"\nSOURCE ({parent_id}):\n{result['full_text'][:2000]}...\n"
                        elif "text_preview" in result:
                            context_str += f"\nSOURCE ({parent_id}):\n{result['text_preview']}\n"
                        elif "response" in result:
                            context_str += f"\nPREV OUTPUT ({parent_id}):\n{result['response']}\n"
                        elif "chunks" in result:
                             # Flatten chunks for context (handle both dicts and ORM objects)
                             text_chunks = [
                                 c['text'] if isinstance(c, dict) else c.text
                                 for c in result['chunks'][:3]
                             ]  # Take first 3
                             context_str += f"\nCHUNKS ({parent_id}):\n{' '.join(text_chunks)}...\n"

                if not context_str:
                    context_str = "No specific context provided."

                system_prompt = node.config.get("systemPrompt", "You are a helpful assistant.")
                user_prompt = f"Context: {context_str}\n\nTask: Summarize this or answer user query."
                model = node.config.get("model", "gpt-4o-mini")

                response_text = await llm_service.generate(
                    prompt=user_prompt,
                    system_prompt=system_prompt,
                    model=model,
                    max_tokens=500,
                )

                return {
                    "node_type": "llm",
                    "response": response_text,
                    "model": model,
                }
            except Exception as e:
                logger.error(f"LLM Call Failed: {e}")
                raise e

        # 5. FAST PATH: Real Logic for Splitter
        if node.type == "splitter":
            try:
                from app.services.chunking_service import chunking_service
                from app.schemas.chunk import ChunkingConfig
                
                # Gather text from parents
                raw_text = ""
                for parent_id, result in inputs.items():
                   if result and "full_text" in result:
                       raw_text += result["full_text"] + "\n\n"
                
                if not raw_text:
                    logger.warning("No text input for splitter.")
                    return {"node_type": "splitter", "chunks": [], "count": 0}

                # Config
                config = ChunkingConfig(
                    method=node.config.get("method", "recursive"),
                    window_size=int(node.config.get("windowSize", 1)),
                    threshold=float(node.config.get("threshold", 0.5)),
                    min_chunk_size=int(node.config.get("minChunkSize", 100))
                )
                
                chunks = chunking_service.chunk(raw_text, config)
                
                return {
                    "node_type": "splitter",
                    "chunks": chunks,
                    "count": len(chunks)
                }
            except Exception as e:
                logger.error(f"Splitter Failed: {e}")
                raise e

        # 6. FAST PATH: Real Logic for Embedder
        if node.type == "embedder":
            try:
                from app.services.embeddings import get_embedder
                
                # Gather chunks from parents
                all_chunks = []
                for parent_id, result in inputs.items():
                    if result and "chunks" in result:
                        all_chunks.extend(result["chunks"])
                
                if not all_chunks:
                     logger.warning("No chunks input for embedder.")
                     return {"node_type": "embedder", "embeddings_count": 0}

                # Extract text list (handle both dicts and ORM Chunk objects)
                texts = [
                    c['text'] if isinstance(c, dict) else c.text
                    for c in all_chunks
                ]
                
                # Get provider and model from config
                provider = node.config.get("provider", "openai")
                model_name = node.config.get("model", "text-embedding-3-small")
                
                # Use the new factory
                embedder = get_embedder(provider, model_name)
                embeddings_list = await embedder.embed(texts)
                
                return {
                    "node_type": "embedder",
                    "provider": provider,
                    "model": model_name,
                    "embeddings_count": len(embeddings_list),
                    "dim": embedder.dimensions,
                    "cost_estimate": (len(texts) * 100 / 1_000_000) * embedder.cost_per_million_tokens, # Very rough token estimate (chars/10)
                    "preview": embeddings_list[0][:5] if embeddings_list else [] 
                }
            except Exception as e:
                logger.error(f"Embedder Failed: {e}")
                raise e

        # 6.5. FAST PATH: Real Logic for Retriever
        if node.type == "retriever":
            try:
                from app.core.database import async_session_maker
                from app.services.retrievers.hybrid_retriever import HybridRetriever
                from app.services.retrievers.mmr_retriever import MMRRetriever
                from app.services.retrievers.parent_document_retriever import ParentDocumentRetriever
                from app.services.retrievers.multi_query_retriever import MultiQueryRetriever
                from app.services.retrievers.hyde_retriever import HyDERetriever
                from app.services.retrievers.query_expansion_retriever import QueryExpansionRetriever

                # Gather query from parents (LLM or user input)
                query = node.config.get("query")
                for parent_id, result in inputs.items():
                    if result:
                         if "response" in result: # LLM output
                             query = result["response"]
                         elif "query" in result:
                             query = result["query"]
                
                if not query:
                    logger.warning(f"No query found for retriever node {node_id}, using default.")
                    query = "default query"

                async with async_session_maker() as db:
                    # 1. Base Retriever
                    retrieval_method = node.config.get("retrieval_method", "semantic")
                    base_retriever = None

                    if retrieval_method == "hybrid":
                        base_retriever = HybridRetriever(db, alpha=float(node.config.get("alpha", 0.7)))
                    elif retrieval_method == "mmr":
                        base_retriever = MMRRetriever(db, lambda_mult=float(node.config.get("lambda_mult", 0.5)))
                    elif retrieval_method == "parent_document":
                        base_retriever = ParentDocumentRetriever(db)
                    elif retrieval_method == "keyword":
                        base_retriever = HybridRetriever(db, alpha=0.0)
                    else: # Default Semantic/Vector
                        base_retriever = HybridRetriever(db, alpha=1.0) # Pure vector

                    # 2. Augmentation Wrapper
                    augmentation_method = node.config.get("augmentation_method")
                    retriever = base_retriever
                    
                    if augmentation_method == "multi_query":
                        num_variants = int(node.config.get("num_variants", 3))
                        retriever = MultiQueryRetriever(retriever, num_variants=num_variants)
                    elif augmentation_method == "hyde":
                        retriever = HyDERetriever(retriever)
                    elif augmentation_method == "expansion":
                        retriever = QueryExpansionRetriever(retriever)

                    # 3. Retrieve
                    top_k = int(node.config.get("top_k", 5))
                    results = await retriever.retrieve(query, top_k=top_k)
                    
                    return {
                        "node_type": "retriever",
                        "query": query,
                        "results": results,
                        "count": len(results),
                        "augmentation_method": augmentation_method,
                        # Include metadata from first result if available, or aggregate
                        "augmentations": results[0].get("metadata", {}).get("augmented_queries") if results and augmentation_method == "multi_query" else None
                    }

            except Exception as e:
                logger.error(f"Retriever Node Failed: {e}")
                raise e

        # 7. FAST PATH: Real Logic for Reranker
        if node.type == "reranker":
            try:
                from app.services.reranker import reranker_service
                
                # Gather documents from parents (usually from a retriever or splitter)
                documents = []
                query = node.config.get("query")
                
                for parent_id, result in inputs.items():
                    if result:
                        if "chunks" in result:
                            # Keep full chunk objects
                            documents.extend(result["chunks"])
                        elif "results" in result: # For retriever nodes
                            documents.extend(result["results"])
                        elif "full_text" in result:
                            documents.append({"text": result["full_text"]})

                if not documents:
                    logger.warning("No documents input for reranker.")
                    return {"node_type": "reranker", "results": [], "count": 0}

                if not query:
                    # Try to find a query in parent results (e.g. from an LLM or user input)
                    for parent_id, result in inputs.items():
                        if result and "query" in result:
                            query = result["query"]
                            break
                    
                    if not query:
                        logger.warning("No query found for reranker, using default.")
                        query = "Give me a summary of the most important parts."

                provider = node.config.get("provider", "cohere")
                model_name = node.config.get("model", "rerank-english-v3.0")
                
                # topK in node config usually refers to final count, but let's be flexible
                return_k = int(node.config.get("return_k") or node.config.get("topK") or 5)
                
                # Candidates already gathered in 'documents'
                # If we need to truncate candidates before sending to API:
                top_n = int(node.config.get("top_n") or 20)
                candidates = documents[:top_n]

                reranker = reranker_service.get_reranker(provider, model_name)
                reranked_results = await reranker.rerank(query, candidates, return_k)
                
                return {
                    "node_type": "reranker",
                    "provider": provider,
                    "model": model_name,
                    "query": query,
                    "results": reranked_results,
                    "count": len(reranked_results)
                }
            except Exception as e:
                logger.error(f"Reranker Failed: {e}")
                raise e

        # 8. Simulate others
        # In a production system, we would have a NodeHandler registry:
        # handler = self.registry.get(node.type)
        # return await handler.run(node.config, inputs)
        
        await asyncio.sleep(0.5) 
        
        return {
            "node_type": node.type,
            "processed_at": datetime.utcnow().isoformat(),
            "inputs_count": len(inputs)
        }

    def _emit_status(self):
        if self.callback:
            # fire and forget (or await if callback is async)
            try:
                if asyncio.iscoroutinefunction(self.callback):
                    asyncio.create_task(self.callback(self.status))
                else:
                    self.callback(self.status)
            except Exception as e:
                logger.error(f"Error in progress callback: {e}")

# --- Example Usage ---
# async def run_demo():
#     nodes = [
#         {"id": "A", "type": "LOADER"},
#         {"id": "B", "type": "CHUNKER"},
#         {"id": "C", "type": "EMBEDDER"}
#     ]
#     edges = [
#         {"source": "A", "target": "B"},
#         {"source": "B", "target": "C"}
#     ]
#     executor = PipelineExecutor(nodes, edges)
#     results = await executor.execute()
#     print(results)

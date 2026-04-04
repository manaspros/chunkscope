from typing import List, Dict, Any, Optional
from uuid import UUID
from app.services.retrievers.base import BaseRetriever
from app.services.query_augmentor import query_augmentor
from app.services.rerankers.rrf_reranker import ReciprocalRankFusionReranker

class MultiQueryRetriever(BaseRetriever):
    """
    Retriever that generates multiple queries and combines results using RRF.
    Generates embeddings for each variant query so vector search works.
    """

    def __init__(self, base_retriever: BaseRetriever, num_variants: int = 3):
        self.base_retriever = base_retriever
        self.num_variants = num_variants
        self.rrf = ReciprocalRankFusionReranker(k=60)

    async def retrieve(
        self,
        query: str,
        top_k: int = 10,
        document_id: Optional[UUID] = None,
        project_id: Optional[UUID] = None,
        query_embedding: List[float] = None,
        **kwargs
    ) -> List[Dict[str, Any]]:
        # 1. Generate query variants
        queries = await query_augmentor.augment_multi_query(query, self.num_variants)

        # 2. Generate embeddings for each variant
        from app.services.llm_service import llm_service
        try:
            all_embeddings = await llm_service.embed(queries)
        except Exception:
            # Fallback: use original embedding for all
            all_embeddings = [query_embedding] * len(queries) if query_embedding else [None] * len(queries)

        # 3. Retrieve for each variant SEQUENTIALLY (asyncpg doesn't support concurrent ops on same session)
        results_lists = []
        for q, emb in zip(queries, all_embeddings):
            try:
                r = await self.base_retriever.retrieve(
                    q, top_k=top_k, document_id=document_id,
                    project_id=project_id, query_embedding=emb, **kwargs
                )
                results_lists.append(r)
            except Exception:
                pass

        if not results_lists:
            # Fallback to original query
            return await self.base_retriever.retrieve(
                query, top_k=top_k, document_id=document_id,
                project_id=project_id, query_embedding=query_embedding, **kwargs
            )

        # 4. Combine results using RRF
        combined_results = await self.rrf.fuse(results_lists, top_k=top_k)

        # Add metadata about which queries were used
        for res in combined_results:
            res["metadata"] = res.get("metadata", {})
            res["metadata"]["augmented_queries"] = queries

        return combined_results

import asyncio
from typing import List, Dict, Any, Optional
from uuid import UUID

from app.services.retrievers.base import BaseRetriever
from app.services.rerankers.rrf_reranker import ReciprocalRankFusionReranker


class EnsembleRetriever(BaseRetriever):
    """
    Takes a list of retriever instances, runs all in parallel, and
    merges results using Reciprocal Rank Fusion (RRF). Deduplicates
    by chunk ID.
    """

    def __init__(
        self,
        retrievers: List[BaseRetriever],
        k: int = 60,
    ):
        self.retrievers = retrievers
        self.rrf = ReciprocalRankFusionReranker(k=k)

    async def retrieve(
        self,
        query: str,
        top_k: int = 10,
        document_id: Optional[UUID] = None,
        **kwargs,
    ) -> List[Dict[str, Any]]:
        # Run all retrievers in parallel
        tasks = [
            retriever.retrieve(query, top_k=top_k, document_id=document_id, **kwargs)
            for retriever in self.retrievers
        ]
        all_results = await asyncio.gather(*tasks)

        # Normalize results so each has an "id" key for the RRF fuser
        normalized_lists: List[List[Dict[str, Any]]] = []
        for results in all_results:
            normed = []
            for r in results:
                entry = dict(r)
                chunk_obj = r.get("chunk")
                if chunk_obj and hasattr(chunk_obj, "id"):
                    entry["id"] = str(chunk_obj.id)
                elif "id" not in entry:
                    # Fallback: use text hash
                    text = chunk_obj.text if hasattr(chunk_obj, "text") else str(chunk_obj)
                    entry["id"] = str(hash(text))
                normed.append(entry)
            normalized_lists.append(normed)

        # Fuse with RRF
        fused = await self.rrf.fuse(normalized_lists, top_k=top_k * 2)

        # Deduplicate by chunk ID
        seen_ids = set()
        deduplicated: List[Dict[str, Any]] = []
        for result in fused:
            rid = result.get("id")
            if rid in seen_ids:
                continue
            seen_ids.add(rid)

            result["score"] = result.pop("rerank_score", result.get("score", 0.0))
            result["metadata"] = {
                **(result.get("metadata") or {}),
                "strategy": "ensemble",
                "num_retrievers": len(self.retrievers),
            }
            deduplicated.append(result)

        return deduplicated[:top_k]

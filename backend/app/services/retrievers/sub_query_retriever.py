import asyncio
import json
from typing import List, Dict, Any, Optional
from uuid import UUID

from app.services.retrievers.base import BaseRetriever
from app.services.rerankers.rrf_reranker import ReciprocalRankFusionReranker
from app.services.llm_service import llm_service


class SubQueryRetriever(BaseRetriever):
    """
    Uses an LLM to decompose a complex query into 2-4 simpler
    sub-queries. Each sub-query is run through a base retriever
    and results are merged using RRF.
    """

    def __init__(
        self,
        base_retriever: BaseRetriever,
        model: str = "gpt-4o-mini",
        k: int = 60,
    ):
        self.base_retriever = base_retriever
        self.model = model
        self.rrf = ReciprocalRankFusionReranker(k=k)

    async def retrieve(
        self,
        query: str,
        top_k: int = 10,
        document_id: Optional[UUID] = None,
        **kwargs,
    ) -> List[Dict[str, Any]]:
        # Step 1: Decompose the query
        sub_queries = await self._decompose_query(query)

        # Step 2: Retrieve for each sub-query in parallel
        tasks = [
            self.base_retriever.retrieve(
                sq, top_k=top_k, document_id=document_id, **kwargs
            )
            for sq in sub_queries
        ]
        all_results = await asyncio.gather(*tasks)

        # Normalize with IDs for RRF
        normalized: List[List[Dict[str, Any]]] = []
        for results in all_results:
            normed = []
            for r in results:
                entry = dict(r)
                chunk_obj = r.get("chunk")
                if chunk_obj and hasattr(chunk_obj, "id"):
                    entry["id"] = str(chunk_obj.id)
                elif "id" not in entry:
                    text = chunk_obj.text if hasattr(chunk_obj, "text") else str(chunk_obj)
                    entry["id"] = str(hash(text))
                normed.append(entry)
            normalized.append(normed)

        # Step 3: Merge using RRF
        fused = await self.rrf.fuse(normalized, top_k=top_k)

        # Assign scores and metadata
        for result in fused:
            result["score"] = result.pop("rerank_score", result.get("score", 0.0))
            result["metadata"] = {
                **(result.get("metadata") or {}),
                "strategy": "sub_query",
                "sub_queries": sub_queries,
            }

        return fused[:top_k]

    async def _decompose_query(self, query: str) -> List[str]:
        """Use LLM to break a complex query into simpler sub-queries."""
        prompt = (
            "Break this complex question into 2-4 simpler, focused sub-questions "
            "that together cover all aspects:\n"
            f"Question: {query}\n"
            "Return as JSON array of strings."
        )

        response = await llm_service.generate(
            prompt=prompt,
            system_prompt="You are a query decomposition assistant. Return only valid JSON.",
            model=self.model,
            temperature=0.0,
            max_tokens=256,
        )

        try:
            response = response.strip()
            if response.startswith("```"):
                response = response.split("```")[1]
                if response.startswith("json"):
                    response = response[4:]
                response = response.strip()
            sub_queries = json.loads(response)
            if isinstance(sub_queries, list) and all(
                isinstance(q, str) for q in sub_queries
            ):
                return sub_queries
        except (json.JSONDecodeError, IndexError):
            pass

        # Fallback: just use the original query
        return [query]

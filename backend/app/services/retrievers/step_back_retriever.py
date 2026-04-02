import asyncio
from typing import List, Dict, Any, Optional
from uuid import UUID

from app.services.retrievers.base import BaseRetriever
from app.services.rerankers.rrf_reranker import ReciprocalRankFusionReranker
from app.services.llm_service import llm_service


class StepBackRetriever(BaseRetriever):
    """
    Step-Back Prompting retriever. Uses an LLM to generate a more
    abstract, general version of the query, then retrieves using both
    the original and the step-back query. Results are merged.
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
        # Step 1: Generate step-back query
        step_back_query = await self._generate_step_back(query)

        # Step 2: Retrieve with both queries in parallel
        original_task = self.base_retriever.retrieve(
            query, top_k=top_k, document_id=document_id, **kwargs
        )
        step_back_task = self.base_retriever.retrieve(
            step_back_query, top_k=top_k, document_id=document_id, **kwargs
        )
        original_results, step_back_results = await asyncio.gather(
            original_task, step_back_task
        )

        # Normalize with IDs for RRF
        def normalize(results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
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
            return normed

        # Step 3: Merge results with RRF
        fused = await self.rrf.fuse(
            [normalize(original_results), normalize(step_back_results)],
            top_k=top_k,
        )

        for result in fused:
            result["score"] = result.pop("rerank_score", result.get("score", 0.0))
            result["metadata"] = {
                **(result.get("metadata") or {}),
                "strategy": "step_back",
                "original_query": query,
                "step_back_query": step_back_query,
            }

        return fused[:top_k]

    async def _generate_step_back(self, query: str) -> str:
        """Use LLM to generate a more abstract version of the query."""
        prompt = (
            "Given this specific question, generate a more general, abstract "
            "version that captures the broader topic:\n"
            f"Question: {query}\n"
            "Abstract question:"
        )

        response = await llm_service.generate(
            prompt=prompt,
            system_prompt="You are a query abstraction assistant. Return only the abstract question.",
            model=self.model,
            temperature=0.3,
            max_tokens=128,
        )

        return response.strip()

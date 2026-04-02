import asyncio
from typing import List, Dict, Any, Optional
from uuid import UUID

from app.services.retrievers.base import BaseRetriever
from app.services.llm_service import llm_service


class CorrectiveRetriever(BaseRetriever):
    """
    Corrective RAG (CRAG) retriever. After retrieval, evaluates each
    chunk's relevance using an LLM:

    - RELEVANT: keep the chunk
    - AMBIGUOUS: refine the query and re-retrieve
    - IRRELEVANT: discard

    If all chunks are irrelevant, falls back to a broader search.
    """

    def __init__(
        self,
        base_retriever: BaseRetriever,
        model: str = "gpt-4o-mini",
        max_concurrent: int = 5,
    ):
        self.base_retriever = base_retriever
        self.model = model
        self.max_concurrent = max_concurrent

    async def retrieve(
        self,
        query: str,
        top_k: int = 10,
        document_id: Optional[UUID] = None,
        **kwargs,
    ) -> List[Dict[str, Any]]:
        # Step 1: Initial retrieval
        candidates = await self.base_retriever.retrieve(
            query, top_k=top_k, document_id=document_id, **kwargs
        )
        if not candidates:
            return []

        # Step 2: Evaluate relevance of each chunk
        evaluations = await self._evaluate_chunks(query, candidates)

        relevant = []
        ambiguous = []
        for result, rating in evaluations:
            if rating == "RELEVANT":
                relevant.append(result)
            elif rating == "AMBIGUOUS":
                ambiguous.append(result)
            # IRRELEVANT chunks are discarded

        # Step 3: Handle ambiguous chunks -- refine and re-retrieve
        if ambiguous and len(relevant) < top_k:
            refined_query = f"{query} (more specific context needed)"
            additional = await self.base_retriever.retrieve(
                refined_query,
                top_k=top_k - len(relevant),
                document_id=document_id,
                **kwargs,
            )
            # Deduplicate by checking existing chunk IDs
            existing_ids = set()
            for r in relevant:
                chunk_obj = r.get("chunk")
                if hasattr(chunk_obj, "id"):
                    existing_ids.add(str(chunk_obj.id))

            for r in additional:
                chunk_obj = r.get("chunk")
                cid = str(chunk_obj.id) if hasattr(chunk_obj, "id") else None
                if cid and cid not in existing_ids:
                    relevant.append(r)
                    existing_ids.add(cid)

        # Step 4: If all irrelevant, fall back to broader search
        if not relevant:
            broader_query = query.split()[0] if query.split() else query
            relevant = await self.base_retriever.retrieve(
                broader_query,
                top_k=top_k,
                document_id=document_id,
                **kwargs,
            )

        # Add metadata
        for result in relevant:
            result["metadata"] = {
                **(result.get("metadata") or {}),
                "strategy": "corrective_rag",
            }

        return relevant[:top_k]

    async def _evaluate_chunks(
        self, query: str, candidates: List[Dict[str, Any]]
    ) -> List[tuple]:
        """Evaluate relevance of each chunk using LLM."""
        semaphore = asyncio.Semaphore(self.max_concurrent)

        async def evaluate_one(result: Dict[str, Any]) -> tuple:
            async with semaphore:
                chunk_obj = result.get("chunk")
                chunk_text = (
                    chunk_obj.text if hasattr(chunk_obj, "text") else str(chunk_obj)
                )

                prompt = (
                    "Rate relevance of this document to the query "
                    "(RELEVANT/AMBIGUOUS/IRRELEVANT):\n"
                    f"Query: {query}\n"
                    f"Document: {chunk_text}\n"
                    "Rating:"
                )

                response = await llm_service.generate(
                    prompt=prompt,
                    system_prompt="You are a relevance evaluator. Respond with exactly one word: RELEVANT, AMBIGUOUS, or IRRELEVANT.",
                    model=self.model,
                    temperature=0.0,
                    max_tokens=16,
                )

                rating = response.strip().upper()
                if rating not in ("RELEVANT", "AMBIGUOUS", "IRRELEVANT"):
                    # Try to extract the rating from a longer response
                    for token in ("RELEVANT", "AMBIGUOUS", "IRRELEVANT"):
                        if token in rating:
                            rating = token
                            break
                    else:
                        rating = "AMBIGUOUS"

                return (result, rating)

        tasks = [evaluate_one(r) for r in candidates]
        return await asyncio.gather(*tasks)

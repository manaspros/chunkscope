import logging
import re
from typing import List, Dict, Any

from app.services.rerankers.base import BaseReranker

logger = logging.getLogger(__name__)


class PairwiseLLMReranker(BaseReranker):
    """
    Pairwise LLM reranker that uses tournament-style comparisons to rank
    documents.

    Uses a bubble-sort variant with the LLM as comparator, capped at
    O(n log n) comparisons to control cost.
    """

    def __init__(self, model: str = "gpt-4o-mini"):
        """
        Args:
            model: LLM model identifier for LiteLLM.
        """
        self.model = model

    async def rerank(
        self,
        query: str,
        documents: List[Dict[str, Any]],
        top_k: int = 5,
    ) -> List[Dict[str, Any]]:
        if not documents:
            return []
        if len(documents) == 1:
            doc = documents[0].copy()
            doc["rerank_score"] = 1.0
            return [doc]

        from app.services.llm_service import llm_service

        # Work with indices to avoid copying docs repeatedly
        indices = list(range(len(documents)))

        # Bubble sort with LLM comparator, limited passes
        n = len(indices)
        import math
        max_passes = int(math.ceil(math.log2(n))) + 1
        comparisons = 0
        max_comparisons = n * max_passes  # O(n log n) budget

        for _ in range(max_passes):
            swapped = False
            for j in range(n - 1):
                if comparisons >= max_comparisons:
                    break
                a_idx = indices[j]
                b_idx = indices[j + 1]
                winner = await self._compare(
                    query, documents[a_idx], documents[b_idx], llm_service
                )
                comparisons += 1
                if winner == "B":
                    indices[j], indices[j + 1] = indices[j + 1], indices[j]
                    swapped = True
            if not swapped or comparisons >= max_comparisons:
                break

        # Build results
        results = []
        for rank, idx in enumerate(indices):
            doc_copy = documents[idx].copy()
            doc_copy["rerank_score"] = 1.0 / (rank + 1)
            results.append(doc_copy)

        return results[:top_k]

    async def _compare(
        self,
        query: str,
        doc_a: Dict[str, Any],
        doc_b: Dict[str, Any],
        llm_service,
    ) -> str:
        """Compare two documents via LLM. Returns 'A' or 'B'."""
        text_a = doc_a.get("text", "")[:1500]
        text_b = doc_b.get("text", "")[:1500]

        prompt = (
            "Which passage is more relevant to the query?\n"
            f"Query: {query}\n"
            f"Passage A: {text_a}\n"
            f"Passage B: {text_b}\n"
            "More relevant (A or B):"
        )

        try:
            response = await llm_service.generate(
                prompt=prompt,
                model=self.model,
                temperature=0.0,
                max_tokens=5,
            )
            return self._parse_winner(response)
        except Exception as e:
            logger.warning(f"Pairwise comparison failed: {e}")
            return "A"  # Keep original order on failure

    @staticmethod
    def _parse_winner(response: str) -> str:
        """Extract 'A' or 'B' from the LLM response."""
        response = response.strip().upper()
        # Look for A or B in the response
        match = re.search(r"\b([AB])\b", response)
        if match:
            return match.group(1)
        # If response starts with A or B
        if response.startswith("A"):
            return "A"
        if response.startswith("B"):
            return "B"
        return "A"  # Default: keep current order

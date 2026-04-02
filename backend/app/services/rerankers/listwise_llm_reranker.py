import json
import logging
import re
from typing import List, Dict, Any

from app.services.rerankers.base import BaseReranker

logger = logging.getLogger(__name__)


class ListwiseLLMReranker(BaseReranker):
    """
    RankGPT-style listwise reranker that sends all candidate documents to an
    LLM and asks it to rank them by relevance.

    For large candidate lists a sliding window approach is used: windows of
    ``window_size`` documents are ranked from the end of the list toward the
    front, progressively bubbling the most relevant documents upward.
    """

    def __init__(
        self,
        model: str = "gpt-4o-mini",
        window_size: int = 10,
        step_size: int = 5,
    ):
        """
        Args:
            model: LLM model identifier for LiteLLM.
            window_size: Number of documents per ranking window.
            step_size: How many positions to slide the window each iteration.
        """
        self.model = model
        self.window_size = window_size
        self.step_size = step_size

    async def rerank(
        self,
        query: str,
        documents: List[Dict[str, Any]],
        top_k: int = 5,
    ) -> List[Dict[str, Any]]:
        if not documents:
            return []

        from app.services.llm_service import llm_service

        # Work with indices into a mutable list
        working = list(range(len(documents)))

        if len(documents) <= self.window_size:
            # Small enough to rank in one shot
            ranked_indices = await self._rank_window(
                query, documents, working, llm_service
            )
            working = ranked_indices
        else:
            # Sliding window from end to front
            end = len(working)
            while end > 0:
                start = max(0, end - self.window_size)
                window_indices = working[start:end]
                ranked_window = await self._rank_window(
                    query, documents, window_indices, llm_service
                )
                working[start:end] = ranked_window
                end -= self.step_size
                if start == 0:
                    break

        # Build result list
        results = []
        for rank, idx in enumerate(working):
            doc_copy = documents[idx].copy()
            # Assign a descending score based on rank
            doc_copy["rerank_score"] = 1.0 / (rank + 1)
            results.append(doc_copy)

        return results[:top_k]

    async def _rank_window(
        self,
        query: str,
        documents: List[Dict[str, Any]],
        indices: List[int],
        llm_service,
    ) -> List[int]:
        """Rank a window of document indices via the LLM."""
        # Build the prompt
        passages = []
        for i, idx in enumerate(indices, start=1):
            text = documents[idx].get("text", "")
            truncated = text[:1500] if len(text) > 1500 else text
            passages.append(f"[{i}] {truncated}")

        passages_text = "\n".join(passages)

        prompt = (
            "I will provide a query and a list of passages. Rank the passages "
            "by relevance to the query, from most to least relevant. Return "
            "ONLY a JSON array of passage numbers in order of relevance.\n\n"
            f"Query: {query}\n\n"
            f"Passages:\n{passages_text}"
        )

        try:
            response = await llm_service.generate(
                prompt=prompt,
                model=self.model,
                temperature=0.0,
                max_tokens=200,
            )
            ranking = self._parse_ranking(response, len(indices))
            return [indices[r - 1] for r in ranking]
        except Exception as e:
            logger.warning(f"Listwise LLM ranking failed for window: {e}")
            return indices  # Return unchanged on failure

    @staticmethod
    def _parse_ranking(response: str, n: int) -> List[int]:
        """
        Parse a JSON array of passage numbers from the LLM response.
        Falls back to regex extraction if JSON parsing fails.
        Returns 1-indexed passage numbers.
        """
        response = response.strip()

        # Try JSON parse first
        try:
            parsed = json.loads(response)
            if isinstance(parsed, list):
                ranking = [int(x) for x in parsed if 1 <= int(x) <= n]
                if ranking:
                    return _dedupe_ranking(ranking, n)
        except (json.JSONDecodeError, ValueError, TypeError):
            pass

        # Fallback: extract numbers from response
        numbers = re.findall(r"\d+", response)
        ranking = [int(x) for x in numbers if 1 <= int(x) <= n]
        if ranking:
            return _dedupe_ranking(ranking, n)

        # Last resort: original order
        return list(range(1, n + 1))


def _dedupe_ranking(ranking: List[int], n: int) -> List[int]:
    """Remove duplicates and append any missing passage numbers."""
    seen = set()
    deduped = []
    for r in ranking:
        if r not in seen:
            seen.add(r)
            deduped.append(r)
    # Append any missing numbers
    for i in range(1, n + 1):
        if i not in seen:
            deduped.append(i)
    return deduped

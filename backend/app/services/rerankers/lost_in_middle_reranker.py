import logging
from typing import List, Dict, Any

from app.services.rerankers.base import BaseReranker

logger = logging.getLogger(__name__)


class LostInMiddleReranker(BaseReranker):
    """
    Post-reranking step that reorders documents to exploit LLM attention patterns.

    Research shows LLMs attend more to the beginning and end of their context
    window ("lost in the middle" effect). This reranker places the most
    relevant documents at the beginning and end, with the least relevant
    documents in the middle.

    Interleave pattern:
        rank 1 -> position 0 (first)
        rank 2 -> position -1 (last)
        rank 3 -> position 1 (second)
        rank 4 -> position -2 (second-to-last)
        ...

    This is NOT a scorer -- it assumes documents are already sorted by
    relevance (e.g., via rerank_score) and only rearranges them.
    """

    def __init__(self, pre_reranker: BaseReranker | None = None):
        """
        Args:
            pre_reranker: Optional reranker to apply before reordering.
                          If None, input docs are assumed to already be
                          sorted by relevance.
        """
        self.pre_reranker = pre_reranker

    async def rerank(
        self,
        query: str,
        documents: List[Dict[str, Any]],
        top_k: int = 5,
    ) -> List[Dict[str, Any]]:
        if not documents:
            return []

        # Optionally run a pre-reranker first
        if self.pre_reranker is not None:
            documents = await self.pre_reranker.rerank(query, documents, top_k)
        else:
            documents = documents[:top_k]

        return self._interleave(documents)

    @staticmethod
    def _interleave(docs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Interleave documents so the most relevant are at the start and end.

        Input order (by relevance rank, 0=most relevant):
            [0, 1, 2, 3, 4, 5, 6, 7]

        Output order:
            [0, 2, 4, 6, 7, 5, 3, 1]
        """
        n = len(docs)
        if n <= 2:
            return list(docs)

        result = [None] * n
        left = 0
        right = n - 1

        for i, doc in enumerate(docs):
            if i % 2 == 0:
                result[left] = doc
                left += 1
            else:
                result[right] = doc
                right -= 1

        return result

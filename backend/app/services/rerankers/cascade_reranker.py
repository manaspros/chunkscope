import logging
from typing import List, Dict, Any, Tuple

from app.services.rerankers.base import BaseReranker

logger = logging.getLogger(__name__)


class CascadeReranker(BaseReranker):
    """
    Multi-stage reranking pipeline that progressively narrows the candidate
    set using increasingly expensive rerankers.

    Typical configuration:
        Stage 1: Fast lightweight reranker (BM25/FlashRank) on all N candidates -> top M
        Stage 2: Cross-encoder on top M candidates -> top K

    This maximizes quality while controlling latency by using cheap models
    for initial filtering and reserving expensive models for the final
    shortlist.
    """

    def __init__(
        self,
        stages: List[Tuple[BaseReranker, int]] | None = None,
    ):
        """
        Args:
            stages: List of (reranker, keep_top_n) tuples defining the
                    pipeline. Each stage reranks the output of the previous
                    stage and retains keep_top_n documents.
                    If None, a sensible two-stage default is constructed.
        """
        if stages is not None:
            self.stages = stages
        else:
            self.stages = self._default_stages()

    @staticmethod
    def _default_stages() -> List[Tuple[BaseReranker, int]]:
        """Build default two-stage cascade: FlashRank -> CrossEncoder."""
        from app.services.rerankers.flashrank_reranker import FlashRankReranker
        from app.services.rerankers.cross_encoder_reranker import CrossEncoderReranker

        return [
            (FlashRankReranker(), 20),
            (CrossEncoderReranker(), 5),
        ]

    async def rerank(
        self,
        query: str,
        documents: List[Dict[str, Any]],
        top_k: int = 5,
    ) -> List[Dict[str, Any]]:
        if not documents:
            return []

        current_docs = documents

        for i, (reranker, keep_n) in enumerate(self.stages):
            stage_name = type(reranker).__name__
            input_count = len(current_docs)

            try:
                current_docs = await reranker.rerank(
                    query, current_docs, top_k=keep_n
                )
                logger.debug(
                    f"Cascade stage {i + 1} ({stage_name}): "
                    f"{input_count} -> {len(current_docs)} docs"
                )
            except Exception as e:
                logger.warning(
                    f"Cascade stage {i + 1} ({stage_name}) failed: {e}. "
                    "Passing through previous stage results."
                )
                current_docs = current_docs[:keep_n]

        # Final trim to the requested top_k
        return current_docs[:top_k]

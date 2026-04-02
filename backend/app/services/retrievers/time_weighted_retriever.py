import math
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from uuid import UUID

from app.services.retrievers.base import BaseRetriever


class TimeWeightedRetriever(BaseRetriever):
    """
    Combines semantic similarity with a recency score so that more
    recently created chunks are boosted.

    final_score = alpha * similarity + (1 - alpha) * recency_decay
    recency_decay = exp(-decay_rate * hours_since_creation)
    """

    def __init__(
        self,
        base_retriever: BaseRetriever,
        alpha: float = 0.7,
        decay_rate: float = 0.01,
    ):
        self.base_retriever = base_retriever
        self.alpha = alpha
        self.decay_rate = decay_rate

    async def retrieve(
        self,
        query: str,
        top_k: int = 10,
        document_id: Optional[UUID] = None,
        **kwargs,
    ) -> List[Dict[str, Any]]:
        alpha = kwargs.pop("alpha", self.alpha)
        decay_rate = kwargs.pop("decay_rate", self.decay_rate)

        # Retrieve more candidates to allow re-ranking
        candidates = await self.base_retriever.retrieve(
            query, top_k=top_k * 2, document_id=document_id, **kwargs
        )
        if not candidates:
            return []

        now = datetime.now(timezone.utc)

        scored: List[Dict[str, Any]] = []
        for result in candidates:
            similarity = result.get("score", 0.0)

            # Extract creation time
            chunk_obj = result.get("chunk")
            created_at = self._get_created_at(chunk_obj)

            if created_at:
                if created_at.tzinfo is None:
                    created_at = created_at.replace(tzinfo=timezone.utc)
                hours_since = (now - created_at).total_seconds() / 3600.0
            else:
                # If no timestamp available, assume neutral recency
                hours_since = 0.0

            recency_decay = math.exp(-decay_rate * hours_since)
            final_score = alpha * similarity + (1 - alpha) * recency_decay

            scored.append(
                {
                    "chunk": result.get("chunk"),
                    "score": final_score,
                    "metadata": {
                        **(result.get("metadata") or {}),
                        "strategy": "time_weighted",
                        "similarity_score": similarity,
                        "recency_decay": recency_decay,
                        "hours_since_creation": hours_since,
                        "alpha": alpha,
                    },
                }
            )

        # Sort by time-weighted score
        scored.sort(key=lambda x: x["score"], reverse=True)
        return scored[:top_k]

    @staticmethod
    def _get_created_at(chunk_obj: Any) -> Optional[datetime]:
        """Try to extract a creation timestamp from the chunk."""
        if chunk_obj is None:
            return None

        # Direct attribute
        if hasattr(chunk_obj, "created_at") and chunk_obj.created_at:
            ts = chunk_obj.created_at
            if isinstance(ts, datetime):
                return ts

        # From metadata
        metadata = {}
        if hasattr(chunk_obj, "chunk_metadata"):
            metadata = chunk_obj.chunk_metadata or {}
        elif hasattr(chunk_obj, "metadata") and isinstance(
            getattr(chunk_obj, "metadata", None), dict
        ):
            metadata = chunk_obj.metadata or {}

        raw = metadata.get("created_at") or metadata.get("date")
        if raw and isinstance(raw, str):
            try:
                return datetime.fromisoformat(raw)
            except ValueError:
                pass

        return None

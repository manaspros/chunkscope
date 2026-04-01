import logging
import re
from typing import List, Dict, Any

from app.services.rerankers.base import BaseReranker

logger = logging.getLogger(__name__)


class LLMReranker(BaseReranker):
    """
    Reranker that uses an LLM (via LiteLLM) to score the relevance of each
    document to a query on a 0-10 scale, then sorts by score descending.
    """

    def __init__(self, model: str = "gpt-4o-mini"):
        self.model = model

    async def rerank(
        self,
        query: str,
        documents: List[Dict[str, Any]],
        top_k: int = 5,
    ) -> List[Dict[str, Any]]:
        if not documents:
            return []

        from app.services.llm_service import llm_service

        scored: List[Dict[str, Any]] = []

        for doc in documents:
            doc_text = doc.get("text", "") if isinstance(doc, dict) else getattr(doc, "text", "")
            # Truncate very long docs to keep prompt reasonable
            truncated = doc_text[:2000] if len(doc_text) > 2000 else doc_text

            prompt = (
                "Rate the relevance of this document to the query on a scale of 0-10. "
                f"Query: {query}. "
                f"Document: {truncated}. "
                "Reply with just the number."
            )

            try:
                response = await llm_service.generate(
                    prompt=prompt,
                    model=self.model,
                    temperature=0.0,
                    max_tokens=5,
                )
                score = self._parse_score(response)
            except Exception as e:
                logger.warning(f"LLM reranker scoring failed for a document: {e}")
                score = 0.0

            entry = doc.copy() if isinstance(doc, dict) else {"text": doc_text}
            entry["rerank_score"] = score
            scored.append(entry)

        # Sort by score descending
        scored.sort(key=lambda x: x["rerank_score"], reverse=True)
        return scored[:top_k]

    @staticmethod
    def _parse_score(response: str) -> float:
        """Extract a numeric score from the LLM response."""
        response = response.strip()
        match = re.search(r"(\d+(?:\.\d+)?)", response)
        if match:
            value = float(match.group(1))
            # Clamp to 0-10
            return min(max(value, 0.0), 10.0)
        return 0.0

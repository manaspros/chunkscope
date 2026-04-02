import logging
from typing import List, Dict, Any

from app.services.rerankers.base import BaseReranker

logger = logging.getLogger(__name__)


class ContextualReranker(BaseReranker):
    """
    Wrapper reranker that enriches document text with metadata before
    delegating to a base reranker.

    Prepends metadata fields (source, section, page, title, etc.) to each
    chunk's text so the underlying scorer can leverage contextual signals.
    """

    # Metadata keys to include, in display order
    DEFAULT_METADATA_KEYS = ("source", "title", "section", "page", "author", "date")

    def __init__(
        self,
        base_reranker: BaseReranker | None = None,
        metadata_keys: tuple | list | None = None,
    ):
        """
        Args:
            base_reranker: The reranker to delegate to after enrichment.
                           Defaults to CrossEncoderReranker if None.
            metadata_keys: Metadata keys to prepend. Defaults to
                           DEFAULT_METADATA_KEYS.
        """
        if base_reranker is None:
            from app.services.rerankers.cross_encoder_reranker import (
                CrossEncoderReranker,
            )
            self.base_reranker = CrossEncoderReranker()
        else:
            self.base_reranker = base_reranker

        self.metadata_keys = metadata_keys or self.DEFAULT_METADATA_KEYS

    async def rerank(
        self,
        query: str,
        documents: List[Dict[str, Any]],
        top_k: int = 5,
    ) -> List[Dict[str, Any]]:
        if not documents:
            return []

        # Enrich each document's text with metadata
        enriched_docs = []
        for doc in documents:
            enriched = doc.copy()
            enriched["text"] = self._enrich_text(doc)
            enriched["_original_text"] = doc.get("text", "")
            enriched_docs.append(enriched)

        # Delegate to the base reranker
        results = await self.base_reranker.rerank(query, enriched_docs, top_k)

        # Restore original text in the output
        for doc in results:
            if "_original_text" in doc:
                doc["text"] = doc.pop("_original_text")
            else:
                doc.pop("_original_text", None)

        return results

    def _enrich_text(self, doc: Dict[str, Any]) -> str:
        """Prepend metadata fields to the document text."""
        metadata = doc.get("metadata", {})
        prefix_parts = []

        for key in self.metadata_keys:
            # Check both top-level and metadata dict
            value = doc.get(key) or metadata.get(key)
            if value is not None and str(value).strip():
                prefix_parts.append(f"{key}: {value}")

        text = doc.get("text", "")
        if prefix_parts:
            prefix = " | ".join(prefix_parts)
            return f"[{prefix}] {text}"
        return text

from datetime import datetime
from typing import List, Dict, Any, Optional
from uuid import UUID

from app.services.retrievers.base import BaseRetriever


class MetadataFilterRetriever(BaseRetriever):
    """
    Pre-filters or post-filters results from a base retriever based on
    metadata tags. Supports filters: doc_type, date_range, file_type,
    min_chunk_size.
    """

    def __init__(
        self,
        base_retriever: BaseRetriever,
        filters: Optional[Dict[str, Any]] = None,
    ):
        """
        Args:
            base_retriever: The retriever to wrap.
            filters: Default filters to apply. Can be overridden per-call
                     via kwargs. Supported keys:
                     - doc_type (str): e.g. "pdf", "md"
                     - file_type (str): e.g. "code", "text"
                     - date_range (dict): {"after": "YYYY-MM-DD", "before": "YYYY-MM-DD"}
                     - min_chunk_size (int): minimum character count
        """
        self.base_retriever = base_retriever
        self.default_filters = filters or {}

    async def retrieve(
        self,
        query: str,
        top_k: int = 10,
        document_id: Optional[UUID] = None,
        **kwargs,
    ) -> List[Dict[str, Any]]:
        # Merge default filters with any provided in kwargs
        filters = {**self.default_filters, **kwargs.pop("filters", {})}

        # Retrieve more candidates than needed to allow for filtering losses
        candidates = await self.base_retriever.retrieve(
            query, top_k=top_k * 3, document_id=document_id, **kwargs
        )

        # Apply filters
        filtered = self._apply_filters(candidates, filters)

        # Add metadata
        for res in filtered:
            res["metadata"] = {
                **(res.get("metadata") or {}),
                "strategy": "metadata_filter",
                "applied_filters": filters,
            }

        return filtered[:top_k]

    @staticmethod
    def _apply_filters(
        results: List[Dict[str, Any]], filters: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Apply metadata filters to a list of retrieval results."""
        if not filters:
            return results

        filtered = []
        for result in results:
            chunk_obj = result.get("chunk")

            # Extract metadata from the chunk object
            metadata: Dict[str, Any] = {}
            if hasattr(chunk_obj, "chunk_metadata"):
                metadata = chunk_obj.chunk_metadata or {}
            elif hasattr(chunk_obj, "metadata") and isinstance(
                getattr(chunk_obj, "metadata", None), dict
            ):
                metadata = chunk_obj.metadata or {}

            # Extract text for size filtering
            text = ""
            if hasattr(chunk_obj, "text"):
                text = chunk_obj.text or ""

            if not MetadataFilterRetriever._matches(
                chunk_obj, metadata, text, filters
            ):
                continue

            filtered.append(result)

        return filtered

    @staticmethod
    def _matches(
        chunk_obj: Any,
        metadata: Dict[str, Any],
        text: str,
        filters: Dict[str, Any],
    ) -> bool:
        """Check if a chunk matches all filters."""
        # doc_type filter
        doc_type = filters.get("doc_type")
        if doc_type:
            chunk_doc_type = metadata.get("doc_type", "")
            if hasattr(chunk_obj, "document") and hasattr(
                chunk_obj.document, "file_type"
            ):
                chunk_doc_type = chunk_obj.document.file_type
            if chunk_doc_type and chunk_doc_type != doc_type:
                return False

        # file_type filter
        file_type = filters.get("file_type")
        if file_type:
            chunk_file_type = metadata.get("file_type", "")
            if chunk_file_type and chunk_file_type != file_type:
                return False

        # date_range filter
        date_range = filters.get("date_range")
        if date_range:
            created = metadata.get("created_at") or metadata.get("date")
            if hasattr(chunk_obj, "created_at") and chunk_obj.created_at:
                created = chunk_obj.created_at.isoformat() if isinstance(
                    chunk_obj.created_at, datetime
                ) else str(chunk_obj.created_at)
            if created:
                after = date_range.get("after")
                before = date_range.get("before")
                if after and str(created) < str(after):
                    return False
                if before and str(created) > str(before):
                    return False

        # min_chunk_size filter
        min_size = filters.get("min_chunk_size")
        if min_size and len(text) < min_size:
            return False

        return True

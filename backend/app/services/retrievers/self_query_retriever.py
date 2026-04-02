import json
from typing import List, Dict, Any, Optional
from uuid import UUID

from app.services.retrievers.base import BaseRetriever
from app.services.llm_service import llm_service


class SelfQueryRetriever(BaseRetriever):
    """
    Uses an LLM to analyze the user query and generate both a simplified
    semantic search query AND metadata filters. The simplified query is
    passed to a base (dense) retriever, and the filters are applied as
    post-retrieval WHERE clauses on chunk metadata.
    """

    def __init__(
        self,
        base_retriever: BaseRetriever,
        model: str = "gpt-4o-mini",
    ):
        self.base_retriever = base_retriever
        self.model = model

    async def retrieve(
        self,
        query: str,
        top_k: int = 10,
        document_id: Optional[UUID] = None,
        **kwargs,
    ) -> List[Dict[str, Any]]:
        # Step 1: Extract structured query + filters via LLM
        parsed = await self._parse_query(query)
        simplified_query = parsed.get("query", query)
        filters = parsed.get("filters", {})

        # Step 2: Retrieve using simplified query
        candidates = await self.base_retriever.retrieve(
            simplified_query,
            top_k=top_k * 2,
            document_id=document_id,
            **kwargs,
        )

        # Step 3: Apply metadata filters
        filtered = self._apply_filters(candidates, filters)

        # Add metadata
        for res in filtered:
            res["metadata"] = {
                **(res.get("metadata") or {}),
                "strategy": "self_query",
                "simplified_query": simplified_query,
                "extracted_filters": filters,
            }

        return filtered[:top_k]

    async def _parse_query(self, query: str) -> Dict[str, Any]:
        """Use LLM to extract a simplified query and metadata filters."""
        prompt = (
            "Given this user query, extract:\n"
            "1) A simplified search query\n"
            "2) Any metadata filters (doc_type, date_after, author).\n"
            'Return as JSON: {"query": "...", "filters": {"doc_type": "...", "date_after": "..."}}\n'
            "If no filters apply, return an empty filters object.\n"
            "Only return the JSON, nothing else.\n\n"
            f"User query: {query}"
        )

        response = await llm_service.generate(
            prompt=prompt,
            system_prompt="You are a query analysis assistant. Return only valid JSON.",
            model=self.model,
            temperature=0.0,
            max_tokens=256,
        )

        try:
            # Try to extract JSON from the response
            response = response.strip()
            if response.startswith("```"):
                response = response.split("```")[1]
                if response.startswith("json"):
                    response = response[4:]
                response = response.strip()
            return json.loads(response)
        except (json.JSONDecodeError, IndexError):
            return {"query": query, "filters": {}}

    @staticmethod
    def _apply_filters(
        results: List[Dict[str, Any]], filters: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Apply extracted metadata filters to candidate results."""
        if not filters:
            return results

        filtered = []
        for result in results:
            chunk_obj = result.get("chunk")
            metadata = {}
            if hasattr(chunk_obj, "chunk_metadata"):
                metadata = chunk_obj.chunk_metadata or {}
            elif hasattr(chunk_obj, "metadata"):
                metadata = chunk_obj.metadata or {}

            match = True
            for key, value in filters.items():
                if not value:
                    continue
                if key == "doc_type" and metadata.get("doc_type") != value:
                    match = False
                    break
                if key == "author" and metadata.get("author") != value:
                    match = False
                    break
                if key == "date_after":
                    doc_date = metadata.get("date", "")
                    if doc_date and doc_date < value:
                        match = False
                        break

            if match:
                filtered.append(result)

        return filtered

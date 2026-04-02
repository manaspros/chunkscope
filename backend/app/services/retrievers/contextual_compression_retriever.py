import asyncio
from typing import List, Dict, Any, Optional
from uuid import UUID

from app.services.retrievers.base import BaseRetriever
from app.services.llm_service import llm_service


class ContextualCompressionRetriever(BaseRetriever):
    """
    Wraps any base retriever and uses an LLM to extract only the
    relevant portions from each retrieved chunk, filtering out
    irrelevant content.
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
        # Step 1: Retrieve candidates from the base retriever
        candidates = await self.base_retriever.retrieve(
            query, top_k=top_k * 2, document_id=document_id, **kwargs
        )
        if not candidates:
            return []

        # Step 2: Compress each chunk in parallel (bounded concurrency)
        semaphore = asyncio.Semaphore(self.max_concurrent)

        async def compress(result: Dict[str, Any]) -> Optional[Dict[str, Any]]:
            async with semaphore:
                chunk_obj = result.get("chunk")
                chunk_text = chunk_obj.text if hasattr(chunk_obj, "text") else str(chunk_obj)

                prompt = (
                    f"Given the question: {query}\n"
                    f"Extract only the parts of the following text that are relevant "
                    f"to answering the question. If nothing is relevant, respond with "
                    f"'IRRELEVANT'.\n"
                    f"Text: {chunk_text}"
                )

                compressed = await llm_service.generate(
                    prompt=prompt,
                    system_prompt="You are a precise text extraction assistant.",
                    model=self.model,
                    temperature=0.0,
                    max_tokens=512,
                )

                compressed = compressed.strip()
                if compressed.upper() == "IRRELEVANT":
                    return None

                return {
                    "chunk": result.get("chunk"),
                    "score": result.get("score", 0.0),
                    "text": compressed,
                    "metadata": {
                        **(result.get("metadata") or {}),
                        "strategy": "contextual_compression",
                        "original_text": chunk_text,
                    },
                }

        tasks = [compress(r) for r in candidates]
        compressed_results = await asyncio.gather(*tasks)

        # Step 3: Filter out None (irrelevant) results
        filtered = [r for r in compressed_results if r is not None]
        return filtered[:top_k]

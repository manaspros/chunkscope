from typing import List, Dict, Any, Optional
from uuid import UUID
from app.services.retrievers.base import BaseRetriever
from app.services.query_augmentor import query_augmentor

class HyDERetriever(BaseRetriever):
    """
    Hypothetical Document Embedding (HyDE) retriever.
    Generates a hypothetical answer, embeds it, and uses that for semantic search.
    """

    def __init__(self, base_retriever: BaseRetriever):
        self.base_retriever = base_retriever

    async def retrieve(
        self,
        query: str,
        top_k: int = 10,
        document_id: Optional[UUID] = None,
        project_id: Optional[UUID] = None,
        query_embedding: List[float] = None,
        **kwargs
    ) -> List[Dict[str, Any]]:
        # 1. Generate hypothetical document
        hyde_doc = await query_augmentor.augment_hyde(query)

        # 2. Generate embedding for the hypothetical doc
        hyde_embedding = query_embedding  # fallback
        try:
            from app.services.llm_service import llm_service
            embeddings = await llm_service.embed([hyde_doc])
            hyde_embedding = embeddings[0]
        except Exception:
            pass  # Use original query embedding as fallback

        # 3. Retrieve using the hypothetical document embedding
        results = await self.base_retriever.retrieve(
            hyde_doc,
            top_k=top_k,
            document_id=document_id,
            project_id=project_id,
            query_embedding=hyde_embedding,
            **kwargs
        )

        # Add metadata
        for res in results:
            res["metadata"] = res.get("metadata", {})
            res["metadata"]["hyde_document"] = hyde_doc[:200]
            res["metadata"]["original_query"] = query

        return results

from typing import List, Dict, Any, Optional
from uuid import UUID
from app.services.retrievers.base import BaseRetriever
from app.services.query_augmentor import query_augmentor
from app.services.llm_service import llm_service

class QueryExpansionRetriever(BaseRetriever):
    """
    Retriever that expands the query with synonyms/terms before searching.
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
        # 1. Expand query
        expanded_query = await query_augmentor.augment_expansion(query)

        # 2. Generate embedding for expanded query
        exp_embedding = query_embedding
        try:
            from app.services.llm_service import llm_service
            embeddings = await llm_service.embed([expanded_query])
            exp_embedding = embeddings[0]
        except Exception:
            pass

        # 3. Retrieve using expanded query + its embedding
        results = await self.base_retriever.retrieve(
            expanded_query,
            top_k=top_k,
            document_id=document_id,
            project_id=project_id,
            query_embedding=exp_embedding,
            **kwargs
        )
        
        # Add metadata
        for res in results:
            res["metadata"] = res.get("metadata", {})
            res["metadata"]["expanded_query"] = expanded_query
            
        return results

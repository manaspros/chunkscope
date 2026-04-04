from typing import List, Dict, Any
from uuid import UUID
import numpy as np
from sqlalchemy import select, text
from app.models import Chunk, Document
from app.services.retrievers.base import BaseRetriever
from app.dependencies import DbSession

class MMRRetriever(BaseRetriever):
    """
    Maximal Marginal Relevance retriever.
    Balances relevance and diversity in the results.
    """
    
    def __init__(self, db: DbSession, lambda_mult: float = 0.5):
        """
        Initialize with DB session and lambda.
        lambda_mult = 1.0 is pure relevance.
        lambda_mult = 0.0 is pure diversity.
        """
        self.db = db
        self.lambda_mult = lambda_mult

    async def retrieve(
        self,
        query: str,
        top_k: int = 5,
        document_id: UUID = None,
        project_id: UUID = None,
        query_embedding: List[float] = None,
        fetch_k: int = 20,
        **kwargs
    ) -> List[Dict[str, Any]]:
        """Perform MMR retrieval."""
        if not query_embedding:
            return []

        lambda_mult = kwargs.get("lambda_mult", self.lambda_mult)

        # 1. Fetch more candidates than needed
        embedding_str = f"[{','.join(map(str, query_embedding))}]"

        stmt = (
            select(
                Chunk,
                (1 - Chunk.embedding.cosine_distance(text(f"'{embedding_str}'::vector"))).label("score")
            )
            .where(Chunk.embedding.isnot(None))
            .order_by(text("score DESC"))
            .limit(fetch_k)
        )

        if document_id:
            stmt = stmt.where(Chunk.document_id == document_id)
        elif project_id:
            stmt = stmt.join(Document, Chunk.document_id == Document.id).where(Document.project_id == project_id)
            
        result = await self.db.execute(stmt)
        candidates = result.all()
        
        if not candidates:
            return []
            
        # 2. Extract embeddings for candidate similarity calcs
        # (Assuming embeddings are already in the objects, but pgvector might return them as lists)
        candidate_embeddings = [np.array(c.Chunk.embedding) for c in candidates]
        query_emb = np.array(query_embedding)
        
        # 3. Apply MMR algorithm
        selected_indices = self._maximal_marginal_relevance(
            query_emb,
            candidate_embeddings,
            lambda_mult=lambda_mult,
            k=top_k
        )
        
        return [
            {"chunk": candidates[i].Chunk, "score": float(candidates[i].score)} 
            for i in selected_indices
        ]

    def _maximal_marginal_relevance(
        self,
        query_embedding: np.ndarray,
        doc_embeddings: List[np.ndarray],
        lambda_mult: float = 0.5,
        k: int = 5
    ) -> List[int]:
        """
        Core MMR algorithm.
        Returns indices of selected doc_embeddings.
        """
        if not doc_embeddings:
            return []
            
        # Initial scores vs query
        # Normalization might be needed if not using cosine distance directly
        # But here we already have similarity scores relative to query if we want,
        # or we can recalculate. Let's recalculate for consistency.
        
        def cosine_similarity(a, b):
            return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))

        similarities_to_query = [cosine_similarity(query_embedding, emb) for emb in doc_embeddings]
        
        # doc_similarities is a matrix of similarities between documents
        n = len(doc_embeddings)
        doc_similarities = np.zeros((n, n))
        for i in range(n):
            for j in range(i, n):
                sim = cosine_similarity(doc_embeddings[i], doc_embeddings[j])
                doc_similarities[i, j] = sim
                doc_similarities[j, i] = sim

        selected_indices = [np.argmax(similarities_to_query)]
        remaining_indices = [i for i in range(n) if i not in selected_indices]
        
        while len(selected_indices) < min(k, n):
            mmr_scores = []
            for i in remaining_indices:
                relevance = similarities_to_query[i]
                # Similarity to the most similar document already in selected_indices
                redundancy = max([doc_similarities[i, j] for j in selected_indices])
                
                mmr_score = lambda_mult * relevance - (1 - lambda_mult) * redundancy
                mmr_scores.append(mmr_score)
                
            best_remaining_index = remaining_indices[np.argmax(mmr_scores)]
            selected_indices.append(best_remaining_index)
            remaining_indices.remove(best_remaining_index)
            
        return selected_indices

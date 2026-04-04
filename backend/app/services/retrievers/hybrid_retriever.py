from typing import List, Dict, Any
from uuid import UUID
from sqlalchemy import select, text, func
from app.models import Chunk, Document
from app.services.retrievers.base import BaseRetriever
from app.dependencies import DbSession

class HybridRetriever(BaseRetriever):
    """
    Combines vector similarity search and keyword (BM25-style) search.
    Uses weighted score combination regulated by alpha.
    """
    
    def __init__(self, db: DbSession, alpha: float = 0.7):
        """
        Initialize with DB session and alpha.
        alpha = 1.0 is pure vector search.
        alpha = 0.0 is pure keyword search.
        """
        self.db = db
        self.alpha = alpha

    async def retrieve(
        self,
        query: str,
        top_k: int = 10,
        document_id: UUID = None,
        project_id: UUID = None,
        query_embedding: List[float] = None,
        **kwargs
    ) -> List[Dict[str, Any]]:
        """Perform hybrid retrieval."""
        alpha = kwargs.get("alpha", self.alpha)

        # 1. Get vector search results
        vector_results = []
        if alpha > 0 and query_embedding:
            vector_results = await self._vector_search(query_embedding, top_k * 2, document_id, project_id)

        # 2. Get keyword search results
        keyword_results = []
        if alpha < 1:
            keyword_results = await self._keyword_search(query, top_k * 2, document_id, project_id)

        # 3. Combine results
        combined = self._combine_results(vector_results, keyword_results, alpha, top_k)

        return combined

    async def _vector_search(self, embedding: List[float], limit: int, document_id: UUID = None, project_id: UUID = None) -> List[Dict]:
        """Vector similarity search using pgvector."""
        embedding_str = f"[{','.join(map(str, embedding))}]"

        query = (
            select(
                Chunk,
                (1 - Chunk.embedding.cosine_distance(text(f"'{embedding_str}'::vector"))).label("score")
            )
            .order_by(text("score DESC"))
            .limit(limit)
        )

        if document_id:
            query = query.where(Chunk.document_id == document_id)
        elif project_id:
            query = query.join(Document, Chunk.document_id == Document.id).where(Document.project_id == project_id)

        # Only search chunks that have embeddings
        query = query.where(Chunk.embedding.isnot(None))

        result = await self.db.execute(query)
        return [{"chunk": row.Chunk, "score": float(row.score)} for row in result.all()]

    async def _keyword_search(self, query_text: str, limit: int, document_id: UUID = None, project_id: UUID = None) -> List[Dict]:
        """Keyword search using PostgreSQL full-text search."""
        # Clean query for tsquery: join sanitized words with & operator
        words = [word.strip() for word in query_text.split() if word.strip()]
        query_words = " & ".join(words)
        if not query_words:
            return []

        ts_query = func.to_tsquery('english', query_words)

        rank_query = (
            select(
                Chunk,
                func.ts_rank_cd(Chunk.tsv, ts_query).label("score")
            )
            .where(Chunk.tsv.op('@@')(ts_query))
            .order_by(text("score DESC"))
            .limit(limit)
        )

        if document_id:
            rank_query = rank_query.where(Chunk.document_id == document_id)
        elif project_id:
            rank_query = rank_query.join(Document, Chunk.document_id == Document.id).where(Document.project_id == project_id)

        result = await self.db.execute(rank_query)
        return [{"chunk": row.Chunk, "score": float(row.score)} for row in result.all()]

    def _combine_results(
        self, 
        vector_results: List[Dict], 
        keyword_results: List[Dict], 
        alpha: float,
        top_k: int
    ) -> List[Dict]:
        """
        Weighted score combination.
        Normalizes scores from both methods before combining.
        """
        # Dictionary to store combined scores: {chunk_id: {"chunk": chunk, "score": total_score}}
        scores = {}
        
        # Helper to normalize scores to [0, 1]
        def normalize(results):
            if not results: return results
            max_s = max(r["score"] for r in results)
            min_s = min(r["score"] for r in results)
            if max_s == min_s:
                for r in results: r["norm_score"] = 1.0
            else:
                for r in results: r["norm_score"] = (r["score"] - min_s) / (max_s - min_s)
            return results

        vector_results = normalize(vector_results)
        keyword_results = normalize(keyword_results)
        
        # Add vector results
        for res in vector_results:
            cid = res["chunk"].id
            scores[cid] = {
                "chunk": res["chunk"],
                "score": res["norm_score"] * alpha
            }
            
        # Add keyword results
        for res in keyword_results:
            cid = res["chunk"].id
            if cid in scores:
                scores[cid]["score"] += res["norm_score"] * (1 - alpha)
            else:
                scores[cid] = {
                    "chunk": res["chunk"],
                    "score": res["norm_score"] * (1 - alpha)
                }
                
        # Sort and return top_k
        sorted_results = sorted(scores.values(), key=lambda x: x["score"], reverse=True)
        return sorted_results[:top_k]

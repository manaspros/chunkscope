from typing import List, Dict, Any
from app.services.rerankers.base import BaseReranker

class ReciprocalRankFusionReranker(BaseReranker):
    """
    Algorithmic reranker using Reciprocal Rank Fusion (RRF).
    Combines multiple rankings without an ML model.
    """
    
    def __init__(self, k: int = 60):
        self.k = k

    async def rerank(
        self, 
        query: str, 
        documents: List[Dict[str, Any]], 
        top_k: int = 5
    ) -> List[Dict[str, Any]]:
        """
        In a single-input scenario, RRF just preserves order but scales scores.
        RRF is most powerful when combining multiple lists of documents.
        However, for a single list, we'll treat it as a normalization step.
        """
        if not documents:
            return []
            
        # RRF Score formula: 1 / (k + rank)
        results = []
        for rank, doc in enumerate(documents):
            doc_copy = doc.copy()
            doc_copy["rerank_score"] = 1.0 / (self.k + rank + 1)
            results.append(doc_copy)
            
        return results[:top_k]

    async def fuse(self, rankings: List[List[Dict[str, Any]]], top_k: int = 5) -> List[Dict[str, Any]]:
        """
        Actually perform fusion on multiple ranking lists.
        """
        fused_scores = {}
        doc_map = {}
        
        for ranking in rankings:
            for rank, doc in enumerate(ranking):
                # Support both {"chunk": Chunk, "score": float} and {"id": ..., "text": ...} formats
                chunk = doc.get("chunk")
                if chunk and hasattr(chunk, "id"):
                    doc_id = str(chunk.id)
                else:
                    doc_id = doc.get("id") or doc.get("text")
                if not doc_id:
                    continue

                if doc_id not in fused_scores:
                    fused_scores[doc_id] = 0.0
                    doc_map[doc_id] = doc

                fused_scores[doc_id] += 1.0 / (self.k + rank + 1)

        # Sort by fused score
        sorted_ids = sorted(fused_scores.items(), key=lambda x: x[1], reverse=True)

        final_results = []
        for doc_id, fused_score in sorted_ids[:top_k]:
            doc_copy = doc_map[doc_id].copy()
            doc_copy["score"] = fused_score  # Use "score" key for consistency
            final_results.append(doc_copy)
            
        return final_results

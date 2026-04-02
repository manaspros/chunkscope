import logging
import math
from typing import List, Dict, Any

from app.services.rerankers.base import BaseReranker

logger = logging.getLogger(__name__)


class DiversityReranker(BaseReranker):
    """
    Maximal Marginal Relevance (MMR) reranker that balances relevance and
    diversity among selected documents.

    At each selection step the document maximizing

        lambda * relevance(doc) - (1 - lambda) * max_similarity(doc, selected)

    is chosen, where similarity is computed via cosine similarity of embeddings.

    This differs from an MMR *retriever* -- it operates as a post-retrieval
    reranker applied to an already-fetched candidate list.
    """

    def __init__(
        self,
        lambda_param: float = 0.7,
        embedding_model: str = "text-embedding-3-small",
    ):
        """
        Args:
            lambda_param: Trade-off between relevance (1.0) and diversity (0.0).
            embedding_model: Model identifier passed to llm_service.embed.
        """
        if not 0.0 <= lambda_param <= 1.0:
            raise ValueError("lambda_param must be between 0 and 1")
        self.lambda_param = lambda_param
        self.embedding_model = embedding_model

    async def rerank(
        self,
        query: str,
        documents: List[Dict[str, Any]],
        top_k: int = 5,
    ) -> List[Dict[str, Any]]:
        if not documents:
            return []

        top_k = min(top_k, len(documents))

        from app.services.llm_service import llm_service

        # Build texts list: query + all doc texts
        doc_texts = [doc.get("text", "") for doc in documents]
        all_texts = [query] + doc_texts

        try:
            embeddings = await llm_service.embed(all_texts, model=self.embedding_model)
        except Exception as e:
            logger.error(f"Diversity reranker embedding failed: {e}")
            # Fall back to returning docs in original order
            return documents[:top_k]

        query_emb = embeddings[0]
        doc_embs = embeddings[1:]

        # Pre-compute relevance scores (cosine similarity to query)
        relevance_scores = [
            self._cosine_similarity(query_emb, doc_emb) for doc_emb in doc_embs
        ]

        # Greedy MMR selection
        selected_indices: List[int] = []
        candidate_indices = list(range(len(documents)))

        for _ in range(top_k):
            best_idx = None
            best_mmr = -float("inf")

            for idx in candidate_indices:
                rel = relevance_scores[idx]

                # Max similarity to already-selected docs
                if selected_indices:
                    max_sim = max(
                        self._cosine_similarity(doc_embs[idx], doc_embs[sel])
                        for sel in selected_indices
                    )
                else:
                    max_sim = 0.0

                mmr = self.lambda_param * rel - (1 - self.lambda_param) * max_sim

                if mmr > best_mmr:
                    best_mmr = mmr
                    best_idx = idx

            if best_idx is None:
                break

            selected_indices.append(best_idx)
            candidate_indices.remove(best_idx)

        # Build results with scores
        results = []
        for rank, idx in enumerate(selected_indices):
            doc_copy = documents[idx].copy()
            doc_copy["rerank_score"] = relevance_scores[idx]
            doc_copy["mmr_rank"] = rank
            results.append(doc_copy)

        return results

    @staticmethod
    def _cosine_similarity(a: List[float], b: List[float]) -> float:
        dot = sum(x * y for x, y in zip(a, b))
        norm_a = math.sqrt(sum(x * x for x in a))
        norm_b = math.sqrt(sum(x * x for x in b))
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return dot / (norm_a * norm_b)

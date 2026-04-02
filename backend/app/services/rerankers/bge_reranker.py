import logging
from typing import List, Dict, Any

from app.services.rerankers.base import BaseReranker

logger = logging.getLogger(__name__)


class BGEReranker(BaseReranker):
    """
    Reranker using BAAI/bge-reranker-base cross-encoder model.

    Loads via sentence-transformers CrossEncoder. If the model cannot be
    loaded (missing dependencies, no GPU, etc.) falls back gracefully by
    returning documents in their original order with positional scores.
    """

    _models: dict = {}

    def __init__(self, model_name: str = "BAAI/bge-reranker-base"):
        """
        Args:
            model_name: HuggingFace model identifier for the BGE reranker.
        """
        self.model_name = model_name
        self._available = self._load_model()

    def _load_model(self) -> bool:
        if self.model_name in BGEReranker._models:
            return True
        try:
            from sentence_transformers import CrossEncoder
            logger.info(f"Loading BGE reranker model: {self.model_name}")
            BGEReranker._models[self.model_name] = CrossEncoder(self.model_name)
            return True
        except ImportError:
            logger.warning(
                "sentence-transformers not installed. BGE reranker unavailable. "
                "Install with: pip install sentence-transformers"
            )
            return False
        except Exception as e:
            logger.warning(
                f"Failed to load BGE model {self.model_name}: {e}. "
                "Falling back to passthrough."
            )
            return False

    @property
    def model(self):
        return BGEReranker._models.get(self.model_name)

    async def rerank(
        self,
        query: str,
        documents: List[Dict[str, Any]],
        top_k: int = 5,
    ) -> List[Dict[str, Any]]:
        if not documents:
            return []

        if not self._available or self.model is None:
            return self._fallback(documents, top_k)

        try:
            doc_texts = [doc.get("text", "") for doc in documents]
            pairs = [[query, text] for text in doc_texts]

            scores = self.model.predict(pairs)

            results = []
            for i, score in enumerate(scores):
                doc_copy = documents[i].copy()
                doc_copy["rerank_score"] = float(score)
                results.append(doc_copy)

            results.sort(key=lambda x: x["rerank_score"], reverse=True)
            return results[:top_k]

        except Exception as e:
            logger.error(f"BGE rerank failed: {e}")
            return self._fallback(documents, top_k)

    @staticmethod
    def _fallback(documents: List[Dict[str, Any]], top_k: int) -> List[Dict[str, Any]]:
        """Return documents in original order with descending positional scores."""
        results = []
        for i, doc in enumerate(documents[:top_k]):
            doc_copy = doc.copy()
            doc_copy["rerank_score"] = 1.0 / (i + 1)
            results.append(doc_copy)
        return results

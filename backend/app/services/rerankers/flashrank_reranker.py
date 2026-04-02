import logging
import math
from typing import List, Dict, Any

from app.services.rerankers.base import BaseReranker

logger = logging.getLogger(__name__)


class FlashRankReranker(BaseReranker):
    """
    Ultra-lightweight reranker using the flashrank library.

    FlashRank provides a ~4MB CPU-only model with sub-millisecond latency.
    If flashrank is not installed, falls back to a simple BM25-style scorer.
    """

    _ranker = None
    _using_flashrank = False

    def __init__(self, model_name: str = "ms-marco-TinyBERT-L-2-v2"):
        """
        Args:
            model_name: FlashRank model name.
        """
        self.model_name = model_name
        self._load_model()

    def _load_model(self):
        if FlashRankReranker._ranker is not None:
            return

        try:
            from flashrank import Ranker
            FlashRankReranker._ranker = Ranker(model_name=self.model_name)
            FlashRankReranker._using_flashrank = True
            logger.info(f"FlashRank loaded model: {self.model_name}")
        except ImportError:
            logger.warning(
                "flashrank not installed. Falling back to BM25-style scoring. "
                "Install with: pip install flashrank"
            )
            FlashRankReranker._using_flashrank = False
        except Exception as e:
            logger.warning(f"FlashRank model load failed ({e}). Falling back to BM25.")
            FlashRankReranker._using_flashrank = False

    async def rerank(
        self,
        query: str,
        documents: List[Dict[str, Any]],
        top_k: int = 5,
    ) -> List[Dict[str, Any]]:
        if not documents:
            return []

        if FlashRankReranker._using_flashrank:
            return self._rerank_flashrank(query, documents, top_k)
        else:
            return self._rerank_bm25_fallback(query, documents, top_k)

    def _rerank_flashrank(
        self,
        query: str,
        documents: List[Dict[str, Any]],
        top_k: int,
    ) -> List[Dict[str, Any]]:
        """Rerank using the flashrank library."""
        from flashrank import RerankRequest

        passages = []
        for doc in documents:
            passages.append({"text": doc.get("text", "")})

        request = RerankRequest(query=query, passages=passages)
        result = FlashRankReranker._ranker.rerank(request)

        # Map scores back to original documents
        results = []
        for item in result:
            idx = passages.index({"text": item["text"]}) if "text" in item else 0
            # flashrank returns results with 'text' and 'score' keys
            # Find matching original document
            for i, doc in enumerate(documents):
                if doc.get("text", "") == item.get("text", ""):
                    doc_copy = doc.copy()
                    doc_copy["rerank_score"] = float(item.get("score", 0.0))
                    results.append(doc_copy)
                    break

        # Sort by score descending
        results.sort(key=lambda x: x.get("rerank_score", 0), reverse=True)
        return results[:top_k]

    def _rerank_bm25_fallback(
        self,
        query: str,
        documents: List[Dict[str, Any]],
        top_k: int,
    ) -> List[Dict[str, Any]]:
        """Simple BM25-style fallback when flashrank is not available."""
        query_terms = set(query.lower().split())

        results = []
        for doc in documents:
            text = doc.get("text", "").lower()
            doc_terms = text.split()
            doc_len = len(doc_terms)
            avg_dl = sum(
                len(d.get("text", "").split()) for d in documents
            ) / max(len(documents), 1)

            score = 0.0
            k1 = 1.5
            b = 0.75

            term_freq: Dict[str, int] = {}
            for t in doc_terms:
                term_freq[t] = term_freq.get(t, 0) + 1

            for term in query_terms:
                tf = term_freq.get(term, 0)
                if tf == 0:
                    continue
                # Simplified IDF: count docs containing term
                df = sum(
                    1 for d in documents if term in d.get("text", "").lower()
                )
                n = len(documents)
                idf = math.log((n - df + 0.5) / (df + 0.5) + 1)
                # BM25 TF normalization
                tf_norm = (tf * (k1 + 1)) / (
                    tf + k1 * (1 - b + b * doc_len / max(avg_dl, 1))
                )
                score += idf * tf_norm

            doc_copy = doc.copy()
            doc_copy["rerank_score"] = score
            results.append(doc_copy)

        results.sort(key=lambda x: x["rerank_score"], reverse=True)
        return results[:top_k]

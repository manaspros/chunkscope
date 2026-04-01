"""
Evaluation Service Package
RAG evaluation metrics, chunk quality scoring, and the RAGEvaluator orchestrator.
"""
from app.services.evaluation.evaluator import RAGEvaluator
from app.services.evaluation.chunk_quality import score_chunk
from app.services.evaluation.metrics import (
    answer_relevancy_score,
    context_precision_score,
    context_recall_score,
    faithfulness_score,
    hit_rate_at_k,
    mrr_score,
)

__all__ = [
    "RAGEvaluator",
    "score_chunk",
    "answer_relevancy_score",
    "context_precision_score",
    "context_recall_score",
    "faithfulness_score",
    "hit_rate_at_k",
    "mrr_score",
]

"""
RAG Evaluator
Orchestrates all evaluation metrics for a given Q&A + context tuple.
"""
from __future__ import annotations

from typing import Any, Optional

from app.core.logging import get_logger
from app.services.evaluation.metrics import (
    answer_relevancy_score,
    context_precision_score,
    context_recall_score,
    faithfulness_score,
    hit_rate_at_k,
    mrr_score,
)

logger = get_logger(__name__)

# Metrics that do NOT require ground truth
_DEFAULT_METRICS = {"faithfulness", "answer_relevancy"}

# Metrics that require relevance labels on context chunks
_LABEL_METRICS = {"context_precision", "hit_rate", "mrr"}

# Metrics that require ground truth
_GT_METRICS = {"context_recall"}

ALL_METRICS = _DEFAULT_METRICS | _LABEL_METRICS | _GT_METRICS


class RAGEvaluator:
    """
    Evaluates RAG pipeline outputs across multiple metrics.

    Usage::

        evaluator = RAGEvaluator()
        result = await evaluator.evaluate(
            question="What is X?",
            answer="X is ...",
            context_chunks=["chunk1", "chunk2"],
            ground_truth="X is ...",
        )
    """

    async def evaluate(
        self,
        question: str,
        answer: str,
        context_chunks: list[str],
        ground_truth: Optional[str] = None,
        relevance_labels: Optional[list[bool]] = None,
        metrics: Optional[list[str]] = None,
        top_k: int = 5,
    ) -> dict[str, Any]:
        """
        Run selected evaluation metrics and return scores.

        Args:
            question: The user question.
            answer: The LLM-generated answer.
            context_chunks: Retrieved context chunks (in retrieval order).
            ground_truth: Optional reference answer for recall-based metrics.
            relevance_labels: Optional per-chunk relevance labels (same order as context_chunks).
            metrics: Specific metrics to compute. ``None`` = all applicable.
            top_k: k for hit_rate and MRR.

        Returns:
            Dict with ``"scores"`` (metric -> float) and ``"details"`` (metric -> breakdown).
        """
        requested = set(metrics) if metrics else ALL_METRICS

        # Filter to applicable metrics based on available inputs
        applicable = set()
        for m in requested:
            if m in _GT_METRICS and ground_truth is None:
                logger.info("skipping_metric_no_ground_truth", metric=m)
                continue
            if m in _LABEL_METRICS and relevance_labels is None:
                logger.info("skipping_metric_no_labels", metric=m)
                continue
            if m in ALL_METRICS:
                applicable.add(m)

        scores: dict[str, float] = {}
        details: dict[str, Any] = {}

        for metric_name in applicable:
            try:
                score, detail = await self._compute_metric(
                    metric_name,
                    question=question,
                    answer=answer,
                    context_chunks=context_chunks,
                    ground_truth=ground_truth,
                    relevance_labels=relevance_labels,
                    top_k=top_k,
                )
                scores[metric_name] = round(score, 4)
                details[metric_name] = detail
            except Exception:
                logger.exception("metric_computation_failed", metric=metric_name)
                scores[metric_name] = 0.0
                details[metric_name] = {"error": "computation failed"}

        return {"scores": scores, "details": details}

    async def evaluate_batch(
        self,
        items: list[dict],
        metrics: Optional[list[str]] = None,
        top_k: int = 5,
    ) -> dict[str, Any]:
        """
        Evaluate a batch of Q&A pairs and return averaged scores plus per-item results.

        Each item in *items* should be a dict with keys:
            question, answer, context_chunks, ground_truth (optional),
            relevance_labels (optional).

        Returns dict with ``"average_scores"`` and ``"per_item"``.
        """
        per_item: list[dict[str, Any]] = []
        all_score_names: set[str] = set()

        for item in items:
            relevance_labels = None
            context_chunks_raw = item.get("context_chunks", [])
            # Support both plain strings and dicts with text/relevance_label
            context_texts: list[str] = []
            labels: list[bool] = []
            for c in context_chunks_raw:
                if isinstance(c, dict):
                    context_texts.append(c.get("text", ""))
                    if c.get("relevance_label") is not None:
                        labels.append(bool(c["relevance_label"]))
                else:
                    context_texts.append(str(c))

            if labels and len(labels) == len(context_texts):
                relevance_labels = labels

            result = await self.evaluate(
                question=item["question"],
                answer=item["answer"],
                context_chunks=context_texts,
                ground_truth=item.get("ground_truth"),
                relevance_labels=relevance_labels,
                metrics=metrics,
                top_k=top_k,
            )
            per_item.append(result)
            all_score_names.update(result["scores"].keys())

        # Average scores
        average_scores: dict[str, float] = {}
        for name in all_score_names:
            values = [r["scores"][name] for r in per_item if name in r["scores"]]
            if values:
                average_scores[name] = round(sum(values) / len(values), 4)

        return {"average_scores": average_scores, "per_item": per_item}

    # ------------------------------------------------------------------
    # Private
    # ------------------------------------------------------------------

    async def _compute_metric(
        self,
        name: str,
        *,
        question: str,
        answer: str,
        context_chunks: list[str],
        ground_truth: Optional[str],
        relevance_labels: Optional[list[bool]],
        top_k: int,
    ) -> tuple[float, dict]:
        if name == "faithfulness":
            return await faithfulness_score(answer, context_chunks)
        elif name == "answer_relevancy":
            return await answer_relevancy_score(question, answer)
        elif name == "context_precision":
            return await context_precision_score(context_chunks, relevance_labels or [])
        elif name == "context_recall":
            return await context_recall_score(context_chunks, ground_truth or "")
        elif name == "hit_rate":
            return hit_rate_at_k(relevance_labels or [], k=top_k)
        elif name == "mrr":
            return mrr_score(relevance_labels or [])
        else:
            raise ValueError(f"Unknown metric: {name}")

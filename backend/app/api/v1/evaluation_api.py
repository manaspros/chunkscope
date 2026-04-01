"""
Evaluation Metrics API
Endpoints for running RAG evaluation metrics and chunk quality scoring.
"""
from fastapi import APIRouter, HTTPException

from app.core.logging import get_logger
from app.schemas.evaluation_schemas import (
    METRIC_DESCRIPTIONS,
    ChunkQualityRequest,
    ChunkQualityResponse,
    ChunkQualityScores,
    EvaluateBatchRequest,
    EvaluateBatchResponse,
    EvaluateRequest,
    EvaluateResponse,
    MetricInfo,
    MetricsListResponse,
)
from app.services.evaluation.chunk_quality import score_chunk
from app.services.evaluation.evaluator import RAGEvaluator

logger = get_logger(__name__)
router = APIRouter(prefix="/evaluate", tags=["Evaluation Metrics"])

_evaluator = RAGEvaluator()


# ---------------------------------------------------------------
# Run evaluation
# ---------------------------------------------------------------

@router.post("/run", response_model=EvaluateResponse)
async def run_evaluation(request: EvaluateRequest):
    """Run evaluation metrics on a single Q&A + context tuple."""
    try:
        context_texts = [c.text for c in request.context_chunks]
        relevance_labels = None
        if any(c.relevance_label is not None for c in request.context_chunks):
            relevance_labels = [
                bool(c.relevance_label) for c in request.context_chunks
            ]

        result = await _evaluator.evaluate(
            question=request.question,
            answer=request.answer,
            context_chunks=context_texts,
            ground_truth=request.ground_truth,
            relevance_labels=relevance_labels,
            metrics=request.metrics,
            top_k=request.top_k,
        )
        return EvaluateResponse(
            scores=result["scores"],
            details=result["details"],
        )
    except Exception as e:
        logger.exception("evaluation_run_failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/run/batch", response_model=EvaluateBatchResponse)
async def run_batch_evaluation(request: EvaluateBatchRequest):
    """Run evaluation over a batch of Q&A pairs and return averaged scores."""
    try:
        items = []
        for item in request.items:
            context_dicts = []
            for c in item.context_chunks:
                d = {"text": c.text}
                if c.relevance_label is not None:
                    d["relevance_label"] = c.relevance_label
                context_dicts.append(d)
            items.append({
                "question": item.question,
                "answer": item.answer,
                "context_chunks": context_dicts,
                "ground_truth": item.ground_truth,
            })

        result = await _evaluator.evaluate_batch(
            items=items,
            metrics=request.metrics,
            top_k=request.top_k,
        )
        per_item_responses = [
            EvaluateResponse(scores=r["scores"], details=r.get("details"))
            for r in result["per_item"]
        ]
        return EvaluateBatchResponse(
            average_scores=result["average_scores"],
            per_item=per_item_responses,
        )
    except Exception as e:
        logger.exception("evaluation_batch_failed")
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------
# Chunk quality
# ---------------------------------------------------------------

@router.post("/chunk-quality", response_model=ChunkQualityResponse)
async def evaluate_chunk_quality(request: ChunkQualityRequest):
    """Score quality for a set of chunks."""
    try:
        all_scores: list[ChunkQualityScores] = []
        for chunk in request.chunks:
            target = chunk.target_size if chunk.target_size is not None else request.target_size
            raw = await score_chunk(chunk.text, target_size=target)
            all_scores.append(ChunkQualityScores(**raw))

        # Compute average
        n = len(all_scores)
        if n == 0:
            avg = ChunkQualityScores(
                semantic_coherence=0,
                boundary_quality=0,
                size_appropriateness=0,
                overall=0,
            )
        else:
            avg = ChunkQualityScores(
                semantic_coherence=round(sum(s.semantic_coherence for s in all_scores) / n, 4),
                boundary_quality=round(sum(s.boundary_quality for s in all_scores) / n, 4),
                size_appropriateness=round(sum(s.size_appropriateness for s in all_scores) / n, 4),
                overall=round(sum(s.overall for s in all_scores) / n, 4),
            )

        return ChunkQualityResponse(chunks=all_scores, average=avg)
    except Exception as e:
        logger.exception("chunk_quality_evaluation_failed")
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------
# List available metrics
# ---------------------------------------------------------------

_REQUIRES_GT = {"context_recall"}

@router.get("/metrics", response_model=MetricsListResponse)
async def list_metrics():
    """List all available evaluation metrics with descriptions."""
    metrics = [
        MetricInfo(
            name=name,
            description=desc,
            requires_ground_truth=name in _REQUIRES_GT,
        )
        for name, desc in METRIC_DESCRIPTIONS.items()
    ]
    return MetricsListResponse(metrics=metrics)

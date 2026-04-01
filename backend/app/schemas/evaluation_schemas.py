"""
Evaluation Metrics Schemas
Request/response models for RAG evaluation and chunk quality endpoints.
"""
from typing import Any, Optional

from pydantic import BaseModel, Field


# ============================================
# Metric Descriptions
# ============================================

METRIC_DESCRIPTIONS: dict[str, str] = {
    "faithfulness": (
        "Fraction of answer claims that are supported by the retrieved context (0-1)."
    ),
    "answer_relevancy": (
        "Embedding similarity between the question and the generated answer (0-1)."
    ),
    "context_precision": (
        "Position-weighted precision of relevant chunks in the retrieval list (0-1)."
    ),
    "context_recall": (
        "Fraction of ground-truth claims covered by the retrieved context (0-1). "
        "Requires ground_truth."
    ),
    "hit_rate": (
        "Binary indicator: was any relevant chunk in the top-k results?"
    ),
    "mrr": (
        "Mean Reciprocal Rank: 1 / rank of the first relevant result."
    ),
}


# ============================================
# Evaluation Request / Response
# ============================================

class ContextChunk(BaseModel):
    """A single retrieved context chunk."""
    text: str = Field(..., description="Chunk text content")
    relevance_label: Optional[bool] = Field(
        default=None,
        description="Optional ground-truth relevance label for this chunk",
    )


class EvaluateRequest(BaseModel):
    """Run evaluation metrics on a single Q&A + context tuple."""
    question: str
    answer: str
    context_chunks: list[ContextChunk]
    ground_truth: Optional[str] = Field(
        default=None,
        description="Optional reference answer for recall-based metrics",
    )
    metrics: Optional[list[str]] = Field(
        default=None,
        description="Specific metrics to compute. None = all applicable.",
    )
    top_k: int = Field(default=5, ge=1, description="k for hit_rate and MRR")


class EvaluateResponse(BaseModel):
    """Scores returned for a single evaluation."""
    scores: dict[str, float] = Field(
        ..., description="Metric name -> score"
    )
    details: Optional[dict[str, Any]] = Field(
        default=None,
        description="Optional per-metric breakdown (e.g. per-claim verdicts)",
    )


class EvaluateBatchItem(BaseModel):
    """One item in a batch evaluation."""
    question: str
    answer: str
    context_chunks: list[ContextChunk]
    ground_truth: Optional[str] = None


class EvaluateBatchRequest(BaseModel):
    """Batch evaluation over multiple Q&A pairs."""
    items: list[EvaluateBatchItem]
    metrics: Optional[list[str]] = None
    top_k: int = Field(default=5, ge=1)


class EvaluateBatchResponse(BaseModel):
    """Averaged scores plus per-item breakdown."""
    average_scores: dict[str, float]
    per_item: list[EvaluateResponse]


# ============================================
# Chunk Quality
# ============================================

class ChunkQualityItem(BaseModel):
    """A single chunk to score for quality."""
    text: str
    target_size: Optional[int] = Field(
        default=None,
        description="Expected chunk size in characters for size-appropriateness scoring",
    )


class ChunkQualityRequest(BaseModel):
    """Score quality for a set of chunks."""
    chunks: list[ChunkQualityItem]
    target_size: int = Field(
        default=512,
        description="Default target chunk size in characters",
    )


class ChunkQualityScores(BaseModel):
    """Quality scores for a single chunk."""
    semantic_coherence: float = Field(..., ge=0, le=1)
    boundary_quality: float = Field(..., ge=0, le=1)
    size_appropriateness: float = Field(..., ge=0, le=1)
    overall: float = Field(..., ge=0, le=1)


class ChunkQualityResponse(BaseModel):
    """Quality scores for all submitted chunks."""
    chunks: list[ChunkQualityScores]
    average: ChunkQualityScores


# ============================================
# Available Metrics
# ============================================

class MetricInfo(BaseModel):
    """Description of a single available metric."""
    name: str
    description: str
    requires_ground_truth: bool
    range: str = "0-1"


class MetricsListResponse(BaseModel):
    """List of all available evaluation metrics."""
    metrics: list[MetricInfo]

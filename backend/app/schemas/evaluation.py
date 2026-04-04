"""
Evaluation Schemas
Request/response models for evaluation operations
"""
from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import BaseSchema, IDMixin, PaginatedResponse


# ============================================
# Request Schemas
# ============================================

class EvaluationCreate(BaseModel):
    """Create a new evaluation."""
    name: Optional[str] = Field(default=None, max_length=255)
    pipeline_id: UUID
    test_dataset_id: UUID
    comparison_pipeline_id: Optional[UUID] = Field(
        default=None,
        description="Optional pipeline for A/B comparison"
    )


# ============================================
# Response Schemas
# ============================================

class EvaluationResponse(BaseSchema, IDMixin):
    """Evaluation response."""
    name: Optional[str] = None
    pipeline_id: UUID
    test_dataset_id: Optional[UUID] = None
    status: str
    aggregate_scores: dict[str, Any] = Field(default_factory=dict)
    total_queries: int = 0
    completed_queries: int = 0
    total_latency_ms: int = 0
    total_cost_usd: float = 0.0
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime


class EvaluationResultResponse(BaseSchema, IDMixin):
    """Individual evaluation result."""
    evaluation_id: UUID
    query: str
    expected_answer: Optional[str] = None
    generated_answer: Optional[str] = None
    scores: dict[str, Any] = Field(default_factory=dict)
    latency_ms: Optional[int] = None
    cost_usd: Optional[float] = None
    created_at: datetime


class EvaluationListResponse(PaginatedResponse[EvaluationResponse]):
    """Paginated list of evaluations."""
    pass


class EvaluationResultListResponse(PaginatedResponse[EvaluationResultResponse]):
    """Paginated list of evaluation results."""
    pass

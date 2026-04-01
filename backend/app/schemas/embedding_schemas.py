"""
Embedding Model Registry Schemas
Request/response models for the embedding model registry endpoints.
"""
from typing import Optional

from pydantic import BaseModel, Field


class EmbeddingModelInfo(BaseModel):
    """Full metadata for one embedding model."""
    id: str
    provider: str
    name: str
    dimensions: int
    max_tokens: int
    cost_per_million_tokens: Optional[float] = Field(
        default=None, description="USD per 1M tokens. None for self-hosted models."
    )
    quality_tier: str = Field(
        ..., description="One of: budget, good, excellent, state-of-the-art"
    )
    speed_tier: str = Field(
        ..., description="One of: fast, medium, slow"
    )
    best_for: list[str] = Field(default_factory=list)
    supports_matryoshka: bool = False
    self_hostable: bool = False
    notes: Optional[str] = None


class EmbeddingModelsListResponse(BaseModel):
    """List all available embedding models."""
    models: list[EmbeddingModelInfo]
    total: int


class RecommendRequest(BaseModel):
    """Request a recommendation for a document type."""
    doc_type: str = Field(
        ...,
        description="Document type, e.g. 'legal', 'code', 'scientific', 'general', 'multilingual'",
    )


class RecommendResponse(BaseModel):
    """Ranked list of recommended models."""
    doc_type: str
    recommendations: list[EmbeddingModelInfo]


class CompareRequest(BaseModel):
    """Compare a set of models side by side."""
    model_ids: list[str] = Field(..., min_length=1)


class CompareResponse(BaseModel):
    """Side-by-side comparison of selected models."""
    models: list[EmbeddingModelInfo]

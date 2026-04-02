"""
Guide Schemas
Request/Response models for the Strategy Guide and Decision Engine APIs.
"""
from __future__ import annotations

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Strategy info response
# ---------------------------------------------------------------------------

class StrategyInfoResponse(BaseModel):
    """Full information about a single strategy."""

    id: str
    name: str
    category: str
    summary: str
    when_to_use: list[str]
    when_not_to_use: list[str]
    best_for: list[str]
    complexity: str
    latency: str
    cost: str
    requires_llm: bool
    requires_gpu: bool
    accuracy_tier: str
    pairs_well_with: list[str]
    example_config: dict
    decision_factors: list[str]
    tradeoffs: str
    pro_tip: str


class StrategyListResponse(BaseModel):
    """List of strategies, optionally filtered by category."""

    strategies: list[StrategyInfoResponse]
    total: int


class StrategyCompareResponse(BaseModel):
    """Side-by-side comparison of multiple strategies."""

    strategies: list[StrategyInfoResponse]
    comparison_fields: list[str] = Field(
        default=[
            "complexity",
            "latency",
            "cost",
            "requires_llm",
            "requires_gpu",
            "accuracy_tier",
        ],
        description="Fields highlighted in the comparison",
    )


# ---------------------------------------------------------------------------
# Pipeline recommendation
# ---------------------------------------------------------------------------

class RecommendRequest(BaseModel):
    """Input parameters for pipeline recommendation."""

    doc_type: str = Field(
        default="general",
        description="Document type: legal, medical, code, academic, financial, general",
    )
    corpus_size: str = Field(
        default="medium",
        description="Corpus size: small, medium, large",
    )
    query_type: str = Field(
        default="factoid",
        description="Query type: factoid, analytical, multi-hop, conversational",
    )
    priority: str = Field(
        default="accuracy",
        description="Optimization priority: accuracy, speed, cost",
    )
    has_metadata: bool = Field(
        default=False,
        description="Whether documents have rich structured metadata",
    )
    has_gpu: bool = Field(
        default=False,
        description="Whether GPU resources are available",
    )
    budget: str = Field(
        default="moderate",
        description="Budget level: free, low, moderate, unlimited",
    )


class StageRecommendationResponse(BaseModel):
    """A single pipeline stage recommendation."""

    method: str | None = Field(default=None, description="Recommended method/model ID")
    model: str | None = Field(default=None, description="Model identifier (for embedding stage)")
    strategy: str | None = Field(default=None, description="Strategy identifier")
    reason: str


class PipelineRecommendationResponse(BaseModel):
    """Complete pipeline recommendation with reasoning."""

    chunking: dict
    embedding: dict
    retrieval: dict
    reranking: dict
    post_processing: dict
    estimated_cost_per_query: str
    estimated_latency: str


# ---------------------------------------------------------------------------
# Decision tree
# ---------------------------------------------------------------------------

class DecisionTreeResponse(BaseModel):
    """A decision tree for a given category."""

    category: str
    tree: dict

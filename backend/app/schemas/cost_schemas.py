"""
Pydantic schemas for the Cost Calculator API.
"""
from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


# ------------------------------------------------------------------
# Ingestion cost
# ------------------------------------------------------------------

class IngestionCostRequest(BaseModel):
    """Request body for ingestion cost estimation."""

    doc_char_count: int = Field(..., ge=1, description="Total characters in the document")
    chunk_size: int = Field(default=512, ge=64, le=8192)
    overlap: int = Field(default=50, ge=0)
    embedding_model: str = Field(default="text-embedding-3-small")
    contextual_chunking: bool = Field(default=False)
    llm_model: str = Field(default="gpt-4o-mini")


class IngestionCostResponse(BaseModel):
    """Estimated cost of ingesting a document."""

    estimated_chunks: int
    embedding_cost: float
    contextual_chunking_cost: float
    total_ingestion_cost: float
    breakdown: dict[str, Any]


# ------------------------------------------------------------------
# Query cost
# ------------------------------------------------------------------

class QueryCostRequest(BaseModel):
    """Request body for per-query cost estimation."""

    embedding_model: str = Field(default="text-embedding-3-small")
    llm_model: str = Field(default="gpt-4o-mini")
    top_k: int = Field(default=5, ge=1, le=100)
    avg_chunk_tokens: int = Field(default=200, ge=1)
    use_reranking: bool = Field(default=False)
    use_hyde: bool = Field(default=False)
    use_multi_query: bool = Field(default=False)


class QueryCostResponse(BaseModel):
    """Estimated cost per query."""

    embedding_cost_per_query: float
    llm_cost_per_query: float
    reranking_cost: float
    hyde_cost: float
    multi_query_cost: float
    total_per_query: float
    monthly_estimate_1000_queries: float
    monthly_estimate_10000_queries: float
    breakdown: dict[str, Any]


# ------------------------------------------------------------------
# Compare
# ------------------------------------------------------------------

class CompareConfigItem(BaseModel):
    """A single pipeline configuration to compare."""

    label: Optional[str] = None
    embedding_model: str = Field(default="text-embedding-3-small")
    llm_model: str = Field(default="gpt-4o-mini")
    chunk_size: int = Field(default=512, ge=64, le=8192)
    overlap: int = Field(default=50, ge=0)
    top_k: int = Field(default=5, ge=1, le=100)
    avg_chunk_tokens: int = Field(default=200, ge=1)
    use_reranking: bool = Field(default=False)
    use_hyde: bool = Field(default=False)
    use_multi_query: bool = Field(default=False)
    contextual_chunking: bool = Field(default=False)


class CompareCostRequest(BaseModel):
    """Request body for cost comparison across configurations."""

    configs: list[CompareConfigItem] = Field(..., min_length=1)
    doc_char_count: int = Field(..., ge=1)


class CompareCostResponse(BaseModel):
    """Comparison results for multiple configs."""

    results: list[dict[str, Any]]


# ------------------------------------------------------------------
# Pricing info
# ------------------------------------------------------------------

class PricingResponse(BaseModel):
    """Current pricing data."""

    embedding_costs: dict[str, float]
    llm_costs: dict[str, dict[str, float]]

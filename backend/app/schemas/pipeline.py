"""
Pipeline Schemas
Request/response models for pipeline operations
"""
from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import BaseSchema, IDMixin, PaginatedResponse, TimestampMixin


# ============================================
# Node/Edge Schemas for Pipeline Graph
# ============================================

class PipelineNode(BaseModel):
    """A node in the pipeline graph."""
    id: str
    type: str = Field(description="Node type: chunker, embedder, retriever, etc.")
    position: dict[str, float] = Field(default_factory=lambda: {"x": 0, "y": 0})
    config: dict[str, Any] = Field(default_factory=dict)


class PipelineEdge(BaseModel):
    """An edge connecting two nodes."""
    id: str
    source: str
    target: str
    source_handle: Optional[str] = None
    target_handle: Optional[str] = None


# ============================================
# Request Schemas
# ============================================

class PipelineCreate(BaseModel):
    """Create a new pipeline."""
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    project_id: Optional[UUID] = None
    nodes: list[PipelineNode] = Field(default_factory=list)
    edges: list[PipelineEdge] = Field(default_factory=list)
    settings: dict[str, Any] = Field(default_factory=dict)


class PipelineUpdate(BaseModel):
    """Update pipeline fields."""
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    nodes: Optional[list[PipelineNode]] = None
    edges: Optional[list[PipelineEdge]] = None
    settings: Optional[dict[str, Any]] = None


# ============================================
# Response Schemas
# ============================================

class PipelineResponse(BaseSchema, IDMixin, TimestampMixin):
    """Pipeline response."""
    name: str
    description: Optional[str] = None
    project_id: Optional[UUID] = None
    status: str
    nodes: list[PipelineNode]
    edges: list[PipelineEdge]
    settings: dict[str, Any]


class PipelineListResponse(PaginatedResponse[PipelineResponse]):
    """Paginated list of pipelines."""
    pass

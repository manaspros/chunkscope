"""
Project Schemas
Request/response models for project operations
"""
from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import BaseSchema, IDMixin, TimestampMixin


# ============================================
# Request Schemas
# ============================================

class ProjectCreate(BaseModel):
    """Create a new project."""
    name: str = Field(max_length=255)
    description: Optional[str] = None


class ProjectUpdate(BaseModel):
    """Update an existing project."""
    name: Optional[str] = Field(default=None, max_length=255)
    description: Optional[str] = None
    status: Optional[str] = None


# ============================================
# Response Schemas
# ============================================

class ProjectResponse(BaseSchema, IDMixin, TimestampMixin):
    """Project response."""
    name: str
    description: Optional[str]
    total_files: int
    total_chunks: int
    dominant_doc_type: Optional[str]
    corpus_config: dict
    status: str


class ProjectFileInfo(BaseModel):
    """Minimal file info for project detail."""
    id: UUID
    filename: str
    original_filename: str
    file_type: str
    file_size_bytes: Optional[int]
    is_processed: bool


class ProjectDetailResponse(ProjectResponse):
    """Project response with file list."""
    files: list[ProjectFileInfo] = []


class ProjectListResponse(BaseModel):
    """List of projects."""
    projects: list[ProjectResponse]
    total: int

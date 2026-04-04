"""
Document Schemas
Request/response models for document operations
"""
from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import BaseSchema, IDMixin, PaginatedResponse, TimestampMixin


# ============================================
# Request Schemas
# ============================================

class DocumentCreate(BaseModel):
    """Document upload metadata."""
    original_filename: str = Field(max_length=255)
    file_type: str = Field(
        description="File type: pdf, txt, md, docx, doc, html, csv, json, xml, yaml, code, config, zip, unknown"
    )
    doc_metadata: dict[str, Any] = Field(default_factory=dict, alias="metadata")


# ============================================
# Response Schemas
# ============================================

class DocumentResponse(BaseSchema, IDMixin, TimestampMixin):
    """Document response."""
    filename: str
    original_filename: str
    file_path: str
    file_type: str
    file_size_bytes: Optional[int] = None
    doc_metadata: dict[str, Any] = Field(default_factory=dict, serialization_alias="metadata")
    is_processed: bool
    chunk_count: int = 0
    
    class Config:
        populate_by_name = True


class DocumentDetailResponse(DocumentResponse):
    """Detailed document response with extracted text."""
    extracted_text: Optional[str] = None

    class Config:
        populate_by_name = True


class DocumentListResponse(PaginatedResponse[DocumentResponse]):
    """Paginated list of documents."""
    pass


# ============================================
# Chunk Schemas
# ============================================

class ChunkResponse(BaseSchema, IDMixin):
    """Chunk response (without embedding)."""
    document_id: UUID
    text: str
    chunk_index: int
    chunking_method: Optional[str] = None
    chunk_size: Optional[int] = None
    chunk_overlap: Optional[int] = None
    chunk_metadata: dict[str, Any] = Field(default_factory=dict, serialization_alias="metadata")
    token_count: Optional[int] = None
    created_at: datetime
    
    class Config:
        populate_by_name = True


class ChunkListResponse(PaginatedResponse[ChunkResponse]):
    """Paginated list of chunks."""
    pass


class ChunkWithSimilarity(ChunkResponse):
    """Chunk with similarity score for search results."""
    similarity: float

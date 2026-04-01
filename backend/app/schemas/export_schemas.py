"""
Pydantic schemas for the Code Export API.
"""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class PipelineExportConfig(BaseModel):
    """Configuration describing the RAG pipeline to export."""

    chunking_method: str = Field(
        default="recursive",
        description='Chunking strategy: "fixed", "recursive", "sentence", "paragraph"',
    )
    chunk_size: int = Field(default=512, ge=64, le=8192)
    overlap: int = Field(default=50, ge=0)
    embedding_model: str = Field(
        default="text-embedding-3-small",
        description="Embedding model identifier",
    )
    retrieval_top_k: int = Field(default=5, ge=1, le=100)
    reranker: Optional[str] = Field(
        default="none",
        description='"none", "cohere", or "cross-encoder"',
    )
    llm_model: str = Field(default="gpt-4o-mini")


class CodeExportResponse(BaseModel):
    """Response containing all generated files as a JSON dict."""

    files: dict[str, str] = Field(
        description="Mapping of filename to file content"
    )


class DockerExportResponse(BaseModel):
    """Response containing only Docker-related files."""

    files: dict[str, str] = Field(
        description="Mapping of filename to file content (Dockerfile, docker-compose.yml, .env.example)"
    )

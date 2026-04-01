"""
ChunkScope SQLAlchemy Models
Defines all database tables with SQLAlchemy ORM
"""
from datetime import datetime
from enum import Enum as PyEnum
from typing import Any, Optional
from uuid import UUID

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    BigInteger,
    Boolean,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    Uuid,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin


# ============================================
# ENUMS
# ============================================

class DocumentType(str, PyEnum):
    PDF = "pdf"
    TXT = "txt"
    MD = "md"
    DOCX = "docx"
    HTML = "html"
    CODE = "code"


class PipelineStatus(str, PyEnum):
    DRAFT = "draft"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class EvaluationStatus(str, PyEnum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class ChunkingMethod(str, PyEnum):
    FIXED_SIZE = "fixed_size"
    RECURSIVE = "recursive"
    SEMANTIC = "semantic"
    SENTENCE = "sentence"
    PARAGRAPH = "paragraph"
    MARKDOWN = "markdown"
    CODE = "code"
    TABLE = "table"
    HEADING = "heading"
    AGENTIC = "agentic"
    CONTEXTUAL = "contextual"
    # Added for presets
    PARAGRAPH_BASED = "paragraph_based"
    HEADING_BASED = "heading_based"
    CODE_AWARE = "code_aware"
    SENTENCE_WINDOW = "sentence_window"
    FIXED = "fixed"


# ============================================
# HELPER FUNCTIONS
# ============================================

def get_enum_values(enum_class):
    """Helper for SQLAlchemy enums to use values instead of names"""
    return [e.value for e in enum_class]


# ============================================
# MODELS
# ============================================

class Pipeline(Base, TimestampMixin):
    """RAG pipeline configurations."""

    __tablename__ = "pipelines"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[PipelineStatus] = mapped_column(
        Enum(PipelineStatus, name='pipeline_status', values_callable=get_enum_values),
        default=PipelineStatus.DRAFT
    )

    # JSONB for flexible node/edge storage
    nodes: Mapped[list] = mapped_column(JSONB, default=list, server_default="[]")
    edges: Mapped[list] = mapped_column(JSONB, default=list, server_default="[]")

    # Link to preset if created from one
    preset_id: Mapped[Optional[UUID]] = mapped_column(Uuid, ForeignKey("presets.id"), nullable=True)

    # Pipeline-level settings
    settings: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")

    # Relationships
    versions: Mapped[list["PipelineVersion"]] = relationship(back_populates="pipeline", cascade="all, delete-orphan")
    evaluations: Mapped[list["Evaluation"]] = relationship(
        back_populates="pipeline",
        cascade="all, delete-orphan",
        primaryjoin="Pipeline.id == foreign(Evaluation.pipeline_id)"
    )
    execution_logs: Mapped[list["ExecutionLog"]] = relationship(back_populates="pipeline", cascade="all, delete-orphan")


class PipelineVersion(Base):
    """Immutable pipeline version snapshots."""

    __tablename__ = "pipeline_versions"

    pipeline_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("pipelines.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    config: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    # Unique constraint on (pipeline_id, version_number)
    __table_args__ = (
        {"schema": None},
    )

    # Relationships
    pipeline: Mapped["Pipeline"] = relationship(back_populates="versions")
    chunks: Mapped[list["Chunk"]] = relationship(back_populates="pipeline_version")


class Document(Base, TimestampMixin):
    """Uploaded documents."""

    __tablename__ = "documents"

    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(512), nullable=False)
    file_type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    file_size_bytes: Mapped[Optional[int]] = mapped_column(BigInteger)

    # JSONB for variable metadata (page_count, author, etc.)
    doc_metadata: Mapped[dict] = mapped_column('metadata', JSONB, default=dict, server_default="{}")

    # Extracted text (populated after processing)
    extracted_text: Mapped[Optional[str]] = mapped_column(Text)

    is_processed: Mapped[bool] = mapped_column(Boolean, default=False)

    # Relationships
    chunks: Mapped[list["Chunk"]] = relationship(back_populates="document", cascade="all, delete-orphan")


class Chunk(Base):
    """Text chunks with vector embeddings."""

    __tablename__ = "chunks"

    document_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    pipeline_version_id: Mapped[Optional[UUID]] = mapped_column(
        Uuid,
        ForeignKey("pipeline_versions.id", ondelete="SET NULL")
    )

    # Chunk content
    text: Mapped[str] = mapped_column(Text, nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)

    # Vector embedding (1536 for OpenAI text-embedding-3-small/large)
    embedding = mapped_column(Vector(1536))

    # Chunking configuration
    chunking_method: Mapped[Optional[ChunkingMethod]] = mapped_column(
        Enum(ChunkingMethod, name='chunking_method', values_callable=get_enum_values)
    )
    chunk_size: Mapped[Optional[int]] = mapped_column(Integer)
    chunk_overlap: Mapped[Optional[int]] = mapped_column(Integer)

    # JSONB for variable metadata
    chunk_metadata: Mapped[dict] = mapped_column('metadata', JSONB, default=dict, server_default="{}")

    # Token count for cost estimation
    token_count: Mapped[Optional[int]] = mapped_column(Integer)

    # Parent-child relationship for context retrieval
    parent_chunk_id: Mapped[Optional[UUID]] = mapped_column(
        Uuid,
        ForeignKey("chunks.id", ondelete="SET NULL"),
        index=True
    )

    # Full-text search vector
    tsv = mapped_column(TSVECTOR)

    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    # Relationships
    document: Mapped["Document"] = relationship(back_populates="chunks")
    pipeline_version: Mapped[Optional["PipelineVersion"]] = relationship(back_populates="chunks")

    # Self-referential relationship for parent-child
    parent: Mapped[Optional["Chunk"]] = relationship(
        "Chunk", remote_side="Chunk.id", back_populates="children"
    )
    children: Mapped[list["Chunk"]] = relationship(
        "Chunk", back_populates="parent", cascade="all, delete-orphan"
    )


class TestDataset(Base, TimestampMixin):
    """Golden Q&A pairs for evaluation."""
    __test__ = False

    __tablename__ = "test_datasets"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)

    # Array of Q&A pairs
    questions: Mapped[list] = mapped_column(JSONB, default=list, server_default="[]")

    # Relationships
    evaluations: Mapped[list["Evaluation"]] = relationship(back_populates="test_dataset")


class Evaluation(Base):
    """A/B test sessions."""

    __tablename__ = "evaluations"

    name: Mapped[Optional[str]] = mapped_column(String(255))

    # Pipeline being tested
    pipeline_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("pipelines.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    pipeline_version_id: Mapped[Optional[UUID]] = mapped_column(
        Uuid,
        ForeignKey("pipeline_versions.id")
    )

    # Test dataset used
    test_dataset_id: Mapped[Optional[UUID]] = mapped_column(
        Uuid,
        ForeignKey("test_datasets.id", ondelete="SET NULL")
    )

    # For A/B testing: compare against this pipeline
    comparison_pipeline_id: Mapped[Optional[UUID]] = mapped_column(
        Uuid,
        ForeignKey("pipelines.id", ondelete="SET NULL")
    )

    status: Mapped[EvaluationStatus] = mapped_column(
        Enum(EvaluationStatus, name='evaluation_status', values_callable=get_enum_values),
        default=EvaluationStatus.PENDING,
        index=True
    )

    # Aggregate scores
    aggregate_scores: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")

    # Execution metrics
    total_queries: Mapped[int] = mapped_column(Integer, default=0)
    completed_queries: Mapped[int] = mapped_column(Integer, default=0)
    total_latency_ms: Mapped[int] = mapped_column(BigInteger, default=0)
    total_cost_usd: Mapped[float] = mapped_column(Numeric(10, 6), default=0)

    started_at: Mapped[Optional[datetime]] = mapped_column()
    completed_at: Mapped[Optional[datetime]] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    # Relationships
    pipeline: Mapped["Pipeline"] = relationship(
        back_populates="evaluations",
        foreign_keys=[pipeline_id]
    )
    comparison_pipeline: Mapped[Optional["Pipeline"]] = relationship(
        foreign_keys=[comparison_pipeline_id]
    )
    test_dataset: Mapped[Optional["TestDataset"]] = relationship(back_populates="evaluations")
    results: Mapped[list["EvaluationResult"]] = relationship(back_populates="evaluation", cascade="all, delete-orphan")


class EvaluationResult(Base):
    """Individual query results within an evaluation."""

    __tablename__ = "evaluation_results"

    evaluation_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("evaluations.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    # Query details
    query: Mapped[str] = mapped_column(Text, nullable=False)
    expected_answer: Mapped[Optional[str]] = mapped_column(Text)

    # Retrieved chunks (array of chunk IDs)
    retrieved_chunk_ids: Mapped[list] = mapped_column(ARRAY(Uuid), default=list)

    # Generated response
    generated_answer: Mapped[Optional[str]] = mapped_column(Text)

    # LLM-as-Judge scores
    scores: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")

    # Performance metrics
    latency_ms: Mapped[Optional[int]] = mapped_column(Integer)
    cost_usd: Mapped[Optional[float]] = mapped_column(Numeric(10, 6))

    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    # Relationships
    evaluation: Mapped["Evaluation"] = relationship(back_populates="results")


class ExecutionLog(Base):
    """Pipeline execution logs for debugging."""

    __tablename__ = "execution_logs"

    pipeline_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("pipelines.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    pipeline_version_id: Mapped[Optional[UUID]] = mapped_column(
        Uuid,
        ForeignKey("pipeline_versions.id")
    )

    # Which node in the pipeline
    node_id: Mapped[Optional[str]] = mapped_column(String(255))
    node_type: Mapped[Optional[str]] = mapped_column(String(50))

    # Log level
    level: Mapped[str] = mapped_column(String(20), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)

    # Additional context
    details: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")

    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, index=True)

    # Relationships
    pipeline: Mapped["Pipeline"] = relationship(back_populates="execution_logs")


class Preset(Base, TimestampMixin):
    """Pre-configured RAG pipeline templates."""

    __tablename__ = "presets"

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text)

    # Array fields for filtering (using JSONB for SQLite compatibility)
    use_cases: Mapped[list] = mapped_column(JSONB, default=list)
    document_types: Mapped[list] = mapped_column(JSONB, default=list)
    tags: Mapped[list] = mapped_column(JSONB, default=list)

    # Configuration
    configuration: Mapped[dict] = mapped_column(JSONB, nullable=False)

    # Metadata
    expected_metrics: Mapped[dict] = mapped_column(JSONB, default=dict)
    thumbnail_url: Mapped[Optional[str]] = mapped_column(String(255))
    is_public: Mapped[bool] = mapped_column(Boolean, default=True)

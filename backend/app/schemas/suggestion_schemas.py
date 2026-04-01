"""
Suggestion Schemas
Request/Response models for the AI Suggestion Engine API.
"""
from __future__ import annotations

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Shared models
# ---------------------------------------------------------------------------

class DocumentProfileResponse(BaseModel):
    """Document profile response."""

    doc_type: str = Field(description="Classified document type")
    total_chars: int
    total_words: int
    total_sentences: int
    total_paragraphs: int
    avg_sentence_length: float
    avg_paragraph_length: float
    vocabulary_diversity: float = Field(description="Unique words / total words")
    heading_count: int
    table_count: int
    code_block_count: int
    list_count: int
    has_complex_structure: bool
    content_density: float = Field(description="Characters per paragraph")
    repetition_score: float = Field(description="0-1 repetition via shingling")
    language_complexity: str = Field(description="simple, moderate, or complex")
    top_topics: list[str] = Field(default_factory=list)


class RecommendationResponse(BaseModel):
    """A single RAG configuration recommendation."""

    chunking_method: str
    chunk_size: int
    chunk_overlap: int
    embedding_model: str
    retrieval_strategy: str
    reranker: str | None
    confidence: float = Field(ge=0, le=1)
    reasoning: str
    warnings: list[str] = Field(default_factory=list)


class SuggestionResultResponse(BaseModel):
    """Complete suggestion result."""

    primary: RecommendationResponse
    alternatives: list[RecommendationResponse]
    document_profile: DocumentProfileResponse


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class ProfileRequest(BaseModel):
    """Request to profile a document."""

    text: str = Field(
        ...,
        min_length=1,
        description="The document text to profile.",
    )
    doc_type: str | None = Field(
        default=None,
        description="Optional pre-classified document type. Auto-detected if omitted.",
    )


class RecommendRequest(BaseModel):
    """Request to get RAG recommendations. Provide either a profile or raw text."""

    text: str | None = Field(
        default=None,
        description="Raw document text. Will be profiled automatically.",
    )
    doc_type: str | None = Field(
        default=None,
        description="Optional pre-classified document type (used with text).",
    )
    profile: DocumentProfileResponse | None = Field(
        default=None,
        description="A previously computed document profile.",
    )


class ExplainRequest(BaseModel):
    """Request to get an LLM explanation for a recommendation."""

    profile: DocumentProfileResponse
    recommendation: RecommendationResponse

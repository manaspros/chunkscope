"""
Strategy Recommender
Takes a DocumentProfile and recommends optimal RAG configurations using a rule engine.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.core.logging import get_logger
from app.services.embedding_registry import embedding_registry
from app.services.suggestions.document_profiler import DocumentProfile

logger = get_logger(__name__)


@dataclass
class Recommendation:
    """A single RAG configuration recommendation."""

    chunking_method: str
    chunk_size: int
    chunk_overlap: int
    embedding_model: str
    retrieval_strategy: str
    reranker: str | None
    confidence: float  # 0-1
    reasoning: str  # short explanation
    warnings: list[str] = field(default_factory=list)


@dataclass
class SuggestionResult:
    """Complete suggestion result with primary and alternative recommendations."""

    primary: Recommendation
    alternatives: list[Recommendation]
    document_profile: DocumentProfile


# ---------------------------------------------------------------------------
# Rule engine
# ---------------------------------------------------------------------------

@dataclass
class _BaseRule:
    """A rule that produces a base recommendation for a document type."""

    doc_type: str
    chunking_method: str
    chunk_size_min: int
    chunk_size_max: int
    overlap_pct: float  # overlap as fraction of chunk size
    retrieval_strategy: str
    reranker: str | None
    confidence: float
    reasoning: str


# Base rules keyed by document type
_BASE_RULES: list[_BaseRule] = [
    _BaseRule(
        doc_type="legal",
        chunking_method="semantic",
        chunk_size_min=400,
        chunk_size_max=600,
        overlap_pct=0.15,
        retrieval_strategy="hybrid",
        reranker="cohere-rerank-v3",
        confidence=0.85,
        reasoning="Legal documents benefit from semantic chunking to preserve clause boundaries, with moderate overlap to maintain cross-reference context.",
    ),
    _BaseRule(
        doc_type="medical",
        chunking_method="paragraph",
        chunk_size_min=300,
        chunk_size_max=500,
        overlap_pct=0.20,
        retrieval_strategy="hybrid",
        reranker="cohere-rerank-v3",
        confidence=0.82,
        reasoning="Medical documents require paragraph-level chunking with higher overlap to preserve clinical context and terminology relationships.",
    ),
    _BaseRule(
        doc_type="code",
        chunking_method="code-aware",
        chunk_size_min=500,
        chunk_size_max=800,
        overlap_pct=0.10,
        retrieval_strategy="hybrid",
        reranker="cohere-rerank-v3",
        confidence=0.80,
        reasoning="Code documents need code-aware chunking that respects function/class boundaries, with minimal overlap to avoid splitting logical units.",
    ),
    _BaseRule(
        doc_type="academic",
        chunking_method="heading-based",
        chunk_size_min=500,
        chunk_size_max=700,
        overlap_pct=0.15,
        retrieval_strategy="hybrid",
        reranker="cohere-rerank-v3",
        confidence=0.83,
        reasoning="Academic papers benefit from heading-based chunking to keep sections coherent, preserving citation and methodology context.",
    ),
    _BaseRule(
        doc_type="financial",
        chunking_method="semantic",
        chunk_size_min=300,
        chunk_size_max=500,
        overlap_pct=0.25,
        retrieval_strategy="hybrid",
        reranker="cohere-rerank-v3",
        confidence=0.81,
        reasoning="Financial documents require semantic chunking with high overlap to maintain numerical relationships and contextual dependencies between figures.",
    ),
    _BaseRule(
        doc_type="general",
        chunking_method="recursive",
        chunk_size_min=500,
        chunk_size_max=500,
        overlap_pct=0.10,
        retrieval_strategy="hybrid",
        reranker="cohere-rerank-v3",
        confidence=0.75,
        reasoning="General documents work well with recursive chunking and balanced settings suitable for mixed content types.",
    ),
]

_RULE_INDEX: dict[str, _BaseRule] = {r.doc_type: r for r in _BASE_RULES}


@dataclass
class _Modifier:
    """A conditional modifier that adjusts a recommendation based on profile traits."""

    name: str
    condition: Any  # callable(DocumentProfile) -> bool
    adjustments: dict[str, Any]  # field -> value or callable(current_value) -> new_value
    warning: str | None = None
    reasoning_append: str | None = None


def _build_modifiers() -> list[_Modifier]:
    """Build the list of conditional modifiers."""
    return [
        _Modifier(
            name="high_repetition",
            condition=lambda p: p.repetition_score > 0.3,
            adjustments={"chunking_method": "semantic"},
            warning="High text repetition detected (>{:.0%}). Semantic chunking recommended to deduplicate meaning.".format(0.3),
            reasoning_append="Switched to semantic chunking due to high repetition.",
        ),
        _Modifier(
            name="complex_structure",
            condition=lambda p: p.has_complex_structure,
            adjustments={"chunking_method": "heading-based"},
            warning="Complex document structure detected (many tables/headings). Tables may be fragmented across chunks.",
            reasoning_append="Using heading-based chunking to respect document structure.",
        ),
        _Modifier(
            name="high_content_density",
            condition=lambda p: p.content_density > 2000,
            adjustments={"chunk_size_bump": 100},
            reasoning_append="Increased chunk size for high-density content.",
        ),
        _Modifier(
            name="complex_language",
            condition=lambda p: p.language_complexity == "complex",
            adjustments={"overlap_bump_pct": 0.05},
            reasoning_append="Increased overlap for complex language patterns.",
        ),
        _Modifier(
            name="short_document",
            condition=lambda p: p.total_words < 500,
            adjustments={"chunk_size_shrink": 200},
            warning="Very short document. Chunk sizes reduced to avoid near-empty retrieval.",
        ),
    ]


_MODIFIERS = _build_modifiers()


class StrategyRecommender:
    """Recommends RAG configurations based on a document profile using a rule engine."""

    def recommend(self, profile: DocumentProfile) -> SuggestionResult:
        """
        Produce primary and alternative recommendations for the given document profile.

        Args:
            profile: A DocumentProfile from the document profiler.

        Returns:
            SuggestionResult with primary recommendation and 2 alternatives.
        """
        # 1. Build primary recommendation from base rule
        primary = self._build_recommendation(profile, profile.doc_type)

        # 2. Apply modifiers to primary
        self._apply_modifiers(primary, profile)

        # 3. Build alternatives: pick two other doc_type strategies that might work
        alt_types = self._pick_alternative_types(profile)
        alternatives = []
        for alt_type in alt_types[:2]:
            alt = self._build_recommendation(profile, alt_type)
            self._apply_modifiers(alt, profile)
            # Lower confidence for alternatives
            alt.confidence = round(alt.confidence * 0.8, 2)
            alternatives.append(alt)

        return SuggestionResult(
            primary=primary,
            alternatives=alternatives,
            document_profile=profile,
        )

    def _build_recommendation(
        self, profile: DocumentProfile, doc_type: str
    ) -> Recommendation:
        """Build a base recommendation from the rule for the given doc_type."""
        rule = _RULE_INDEX.get(doc_type, _RULE_INDEX["general"])

        # Use midpoint of chunk size range
        chunk_size = (rule.chunk_size_min + rule.chunk_size_max) // 2
        chunk_overlap = int(chunk_size * rule.overlap_pct)

        # Get embedding model from registry
        embedding_model = self._get_embedding_model(doc_type)

        return Recommendation(
            chunking_method=rule.chunking_method,
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            embedding_model=embedding_model,
            retrieval_strategy=rule.retrieval_strategy,
            reranker=rule.reranker,
            confidence=rule.confidence,
            reasoning=rule.reasoning,
            warnings=[],
        )

    def _apply_modifiers(
        self, rec: Recommendation, profile: DocumentProfile
    ) -> None:
        """Apply conditional modifiers to a recommendation in-place."""
        reasoning_parts = [rec.reasoning]

        for mod in _MODIFIERS:
            if mod.condition(profile):
                # Apply adjustments
                for key, value in mod.adjustments.items():
                    if key == "chunking_method":
                        rec.chunking_method = value
                    elif key == "chunk_size_bump":
                        rec.chunk_size += value
                    elif key == "chunk_size_shrink":
                        rec.chunk_size = max(100, rec.chunk_size - value)
                    elif key == "overlap_bump_pct":
                        rec.chunk_overlap = int(
                            rec.chunk_overlap + rec.chunk_size * value
                        )

                if mod.warning:
                    rec.warnings.append(mod.warning)
                if mod.reasoning_append:
                    reasoning_parts.append(mod.reasoning_append)

        rec.reasoning = " ".join(reasoning_parts)

    def _get_embedding_model(self, doc_type: str) -> str:
        """Get the top recommended embedding model for the document type."""
        # Map our doc types to registry doc types
        registry_type_map = {
            "legal": "legal",
            "medical": "general",
            "code": "code",
            "academic": "scientific",
            "financial": "general",
            "general": "general",
        }
        registry_type = registry_type_map.get(doc_type, "general")
        ranked = embedding_registry.recommend_for_document_type(registry_type)
        if ranked:
            return ranked[0]["id"]
        return "text-embedding-3-small"

    def _pick_alternative_types(self, profile: DocumentProfile) -> list[str]:
        """Pick alternative doc types for generating alternative recommendations."""
        all_types = ["legal", "medical", "code", "academic", "financial", "general"]
        primary_type = profile.doc_type

        # Remove primary type
        candidates = [t for t in all_types if t != primary_type]

        # Rank alternatives by relevance heuristics
        scored: list[tuple[str, float]] = []
        for t in candidates:
            score = 0.0
            if t == "general":
                score = 0.5  # Always a reasonable fallback
            if profile.has_complex_structure and t == "academic":
                score += 0.3
            if profile.code_block_count > 0 and t == "code":
                score += 0.4
            if profile.language_complexity == "complex" and t in ("legal", "academic"):
                score += 0.2
            scored.append((t, score))

        scored.sort(key=lambda x: x[1], reverse=True)
        return [t for t, _s in scored]


# Singleton
strategy_recommender = StrategyRecommender()

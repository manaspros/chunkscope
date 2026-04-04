"""
Multi-Technique Pipeline Recommender
Maps corpus fingerprint signals to optimal RAG pipeline stacks.
Returns combinations of techniques, not single strategies.

This module is entirely self-contained -- it imports nothing from the
rest of the application and makes no LLM calls.  All decisions are
rule-based, driven by the content-signal dict produced by the document
analyzer.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


# ── dataclasses ──────────────────────────────────────────────────────


@dataclass
class TechniqueRecommendation:
    name: str
    category: str  # "chunking", "retrieval", "reranking", "embedding"
    confidence: float  # 0.0-1.0
    reasoning: str
    is_primary: bool = True  # False = augmentation
    config: dict = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "category": self.category,
            "confidence": round(self.confidence, 3),
            "reasoning": self.reasoning,
            "is_primary": self.is_primary,
            "config": self.config,
        }


@dataclass
class WhyNot:
    technique: str
    reason: str  # e.g., "Cross-ref ratio (0.02) below 0.05 threshold for Graph RAG"

    def to_dict(self) -> dict[str, str]:
        return {"technique": self.technique, "reason": self.reason}


@dataclass
class PipelineRecommendation:
    chunking: list[TechniqueRecommendation]
    retrieval: list[TechniqueRecommendation]
    reranking: list[TechniqueRecommendation]
    embedding: TechniqueRecommendation
    why_not: list[WhyNot]
    overall_confidence: float
    summary: str  # Human-readable summary

    def to_dict(self) -> dict[str, Any]:
        return {
            "chunking": [t.to_dict() for t in self.chunking],
            "retrieval": [t.to_dict() for t in self.retrieval],
            "reranking": [t.to_dict() for t in self.reranking],
            "embedding": self.embedding.to_dict(),
            "why_not": [w.to_dict() for w in self.why_not],
            "overall_confidence": round(self.overall_confidence, 3),
            "summary": self.summary,
        }


# ── hardcoded research / maturity scores ─────────────────────────────

# Research-backed scores from peer-reviewed benchmarks:
# - Vecta 2026: Recursive 512 = 69% accuracy (best of 7 strategies)
# - Vectara NAACL 2025: Fixed-size beats semantic on real datasets
# - Anthropic 2024: Contextual retrieval = -67% failures
# - AI21 2026: Multi-scale indexing = +1-37% retrieval
# - ICLR 2024: RAPTOR = +20% on QuALITY for multi-hop
# - EMNLP 2025: cAST code chunking = +4.3 Recall@5
# - HiChunk 2025: Hierarchical = 81 vs 74 evidence recall
_RESEARCH_BACKING: dict[str, float] = {
    "cross_encoder": 0.9,       # +10-20% MRR@10 (Nogueira & Cho 2019)
    "hybrid": 0.9,              # +5-12% Recall@10 (BGE M3 paper)
    "dense": 0.8,
    "bm25_boost": 0.75,
    "hierarchical": 0.85,       # 81 vs 74 evidence recall (HiChunk 2025)
    "heading_based": 0.8,
    "recursive": 0.9,           # 69% accuracy, best in Vecta benchmark
    "semantic": 0.55,           # DOWNGRADED: Vectara NAACL 2025 shows not worth cost on real docs
    "code_aware": 0.85,         # +4.3 Recall@5 (cAST EMNLP 2025)
    "sentence_window": 0.8,
    "parent_child": 0.8,        # -35 to -49% failures (Anthropic 2024)
    "summary_augmented": 0.65,
    "formula_preserving": 0.6,
    "contextual_retrieval": 0.9, # -67% retrieval failures (Anthropic 2024)
    "multi_scale_indexing": 0.8, # +1-37% retrieval (AI21 2026)
    "query_decomposition": 0.75, # +10-25% on multi-hop (HotpotQA)
    "hyde": 0.7,                # +3-12% NDCG@10 zero-shot, can HURT factual (Gao 2022)
    "graph_rag": 0.55,          # +20-70% global queries, <5% local (MS 2024)
    "multi_hop": 0.65,
    "metadata_filtering": 0.7,
    "document_summary_index": 0.75,
    "flashrank": 0.7,
    "bge": 0.75,
    "mmr_diversity": 0.8,
    "lost_in_middle": 0.9,
    "cascade": 0.8,
    "bge-m3": 0.75,
    "all-MiniLM-L6-v2": 0.7,
    "jina-embeddings-v3": 0.75,
    "voyage-3-large": 0.8,
    "text-embedding-3-small": 0.85,
}

_TECHNIQUE_MATURITY: dict[str, float] = {
    "recursive": 0.95,
    "hybrid": 0.9,
    "dense": 0.9,
    "heading_based": 0.9,
    "semantic": 0.7,              # Downgraded: over-fragments on real docs (Vecta: 54% vs recursive 69%)
    "code_aware": 0.8,
    "sentence_window": 0.85,
    "hierarchical": 0.8,
    "parent_child": 0.8,          # Production-proven (Dify v0.15, Anthropic stack)
    "summary_augmented": 0.65,
    "formula_preserving": 0.6,
    "contextual_retrieval": 0.85, # Production-proven (Anthropic)
    "multi_scale_indexing": 0.7,  # Newer technique (AI21 2026)
    "bm25_boost": 0.9,
    "query_decomposition": 0.7,
    "hyde": 0.65,
    "graph_rag": 0.6,
    "multi_hop": 0.65,
    "metadata_filtering": 0.85,
    "document_summary_index": 0.75,
    "cross_encoder": 0.9,
    "flashrank": 0.85,
    "bge": 0.8,
    "mmr_diversity": 0.85,
    "lost_in_middle": 0.95,
    "cascade": 0.8,
    "bge-m3": 0.75,
    "all-MiniLM-L6-v2": 0.9,
    "jina-embeddings-v3": 0.7,
    "voyage-3-large": 0.8,
    "text-embedding-3-small": 0.9,
}


# ── helpers ──────────────────────────────────────────────────────────

def _sig(signals: dict, key: str, default: float = 0.0) -> float:
    """Safely retrieve a signal value, defaulting to *default*."""
    return float(signals.get(key, default))


# ── recommender ──────────────────────────────────────────────────────


class PipelineRecommender:
    """Maps corpus fingerprint to multi-technique RAG pipeline."""

    # ── public API ───────────────────────────────────────────────────

    def recommend(
        self,
        signals: dict,
        doc_type: str = "general",
        corpus_size: str = "medium",
        priority: str = "accuracy",
        budget: str = "moderate",
        has_gpu: bool = False,
    ) -> PipelineRecommendation:
        chunking, chunk_why = self._select_chunking(signals, doc_type)
        retrieval, ret_why = self._select_retrieval(signals, corpus_size, doc_type)
        reranking, rank_why = self._select_reranking(signals, priority)
        embedding = self._select_embedding(signals, budget, has_gpu, doc_type)

        why_not = chunk_why + ret_why + rank_why

        all_techniques = chunking + retrieval + reranking + [embedding]
        if all_techniques:
            overall_confidence = sum(t.confidence for t in all_techniques) / len(
                all_techniques
            )
        else:
            overall_confidence = 0.5

        summary = self._build_summary(
            signals, doc_type, chunking, retrieval, reranking, embedding
        )

        return PipelineRecommendation(
            chunking=chunking,
            retrieval=retrieval,
            reranking=reranking,
            embedding=embedding,
            why_not=why_not,
            overall_confidence=overall_confidence,
            summary=summary,
        )

    # ── chunking ─────────────────────────────────────────────────────

    def _select_chunking(
        self, signals: dict, doc_type: str
    ) -> tuple[list[TechniqueRecommendation], list[WhyNot]]:
        techniques: list[TechniqueRecommendation] = []
        why_not: list[WhyNot] = []

        code_ratio = _sig(signals, "code_ratio")
        heading_depth = _sig(signals, "heading_depth")
        heading_density = _sig(signals, "heading_density")
        avg_sentence_length = _sig(signals, "avg_sentence_length")
        avg_paragraph_sentences = _sig(signals, "avg_paragraph_sentences")
        question_density = _sig(signals, "question_density")
        cross_ref_ratio = _sig(signals, "cross_ref_ratio")
        named_entity_density = _sig(signals, "named_entity_density")
        formula_ratio = _sig(signals, "formula_ratio")

        # ── PRIMARY (pick first matching) ────────────────────────────

        if code_ratio > 0.3:
            techniques.append(
                TechniqueRecommendation(
                    name="code_aware",
                    category="chunking",
                    confidence=self._compute_confidence(0.9, "code_aware"),
                    reasoning=(
                        f"High code density ({code_ratio:.0%}) - "
                        "code-aware chunking preserves function and class boundaries."
                    ),
                    is_primary=True,
                    config={"chunk_size": 400, "overlap": 0},
                )
            )
        elif heading_depth >= 3 and avg_paragraph_sentences > 3:
            techniques.append(
                TechniqueRecommendation(
                    name="hierarchical",
                    category="chunking",
                    confidence=self._compute_confidence(0.85, "hierarchical"),
                    reasoning=(
                        f"Deep heading hierarchy (depth {heading_depth:.0f}) with "
                        f"substantial paragraphs ({avg_paragraph_sentences:.1f} "
                        "sentences avg) - hierarchical chunking preserves document tree. "
                        "HiChunk 2025: 81 vs 74 evidence recall over flat chunking."
                    ),
                    is_primary=True,
                    config={"chunk_size": 512, "overlap": 64},
                )
            )
        elif heading_density > 0.03:
            techniques.append(
                TechniqueRecommendation(
                    name="heading_based",
                    category="chunking",
                    confidence=self._compute_confidence(0.8, "heading_based"),
                    reasoning=(
                        f"Clear heading structure (density {heading_density:.1%}) - "
                        "heading-based chunking aligns splits with section boundaries."
                    ),
                    is_primary=True,
                    config={"chunk_size": 600, "overlap": 75},
                )
            )
        elif avg_sentence_length > 25:
            techniques.append(
                TechniqueRecommendation(
                    name="semantic",
                    category="chunking",
                    confidence=self._compute_confidence(0.6, "semantic"),
                    reasoning=(
                        f"Dense prose with long sentences ({avg_sentence_length:.0f} "
                        "words avg) - semantic chunking detects topic boundaries. "
                        "Note: Vectara NAACL 2025 shows marginal gains over recursive "
                        "on real documents; consider recursive as alternative."
                    ),
                    is_primary=True,
                    config={"chunk_size": 512, "overlap": 80},
                )
            )
        elif question_density > 0.05:
            techniques.append(
                TechniqueRecommendation(
                    name="sentence_window",
                    category="chunking",
                    confidence=self._compute_confidence(0.8, "sentence_window"),
                    reasoning=(
                        f"High question density ({question_density:.1%}) - "
                        "sentence-window chunking keeps Q&A pairs focused."
                    ),
                    is_primary=True,
                    config={"chunk_size": 256, "overlap": 30},
                )
            )
        else:
            techniques.append(
                TechniqueRecommendation(
                    name="recursive",
                    category="chunking",
                    confidence=self._compute_confidence(0.7, "recursive"),
                    reasoning=(
                        "No dominant structural signal detected - "
                        "recursive chunking is the safe general-purpose default."
                    ),
                    is_primary=True,
                    config={"chunk_size": 512, "overlap": 50},
                )
            )

        # ── WHY NOT explanations for chunking primaries ──────────────

        # Hierarchical: needs heading_depth >= 3
        if heading_depth < 3 and not any(
            t.name == "hierarchical" for t in techniques
        ):
            why_not.append(
                WhyNot(
                    technique="hierarchical",
                    reason=(
                        f"Heading depth ({heading_depth:.0f}) below 3 - "
                        "hierarchical chunking needs deeper structure"
                    ),
                )
            )

        # Code-aware: needs code_ratio > 0.3
        if 0.1 < code_ratio <= 0.3 and not any(
            t.name == "code_aware" for t in techniques
        ):
            why_not.append(
                WhyNot(
                    technique="code_aware",
                    reason=(
                        f"Code ratio ({code_ratio:.0%}) moderate - "
                        "code_aware chunking optimal above 30%"
                    ),
                )
            )

        # Semantic: needs avg_sentence_length > 25
        if avg_sentence_length <= 25 and not any(
            t.name == "semantic" for t in techniques
        ):
            why_not.append(
                WhyNot(
                    technique="semantic",
                    reason=(
                        f"Average sentence length ({avg_sentence_length:.0f} words) "
                        "at or below 25. Also: Vectara NAACL 2025 peer-reviewed study "
                        "shows fixed-size chunking beats semantic on real (non-stitched) "
                        "documents across HotpotQA, MSMARCO, and ConditionalQA."
                    ),
                )
            )

        # Sentence window: needs question_density > 0.05
        if question_density <= 0.05 and not any(
            t.name == "sentence_window" for t in techniques
        ):
            why_not.append(
                WhyNot(
                    technique="sentence_window",
                    reason=(
                        f"Question density ({question_density:.1%}) at or below 5% - "
                        "sentence-window chunking best for Q&A-heavy content"
                    ),
                )
            )

        # ── AUGMENTATIONS (stack on top) ─────────────────────────────

        if heading_depth >= 2:
            techniques.append(
                TechniqueRecommendation(
                    name="parent_child",
                    category="chunking",
                    confidence=self._compute_confidence(0.75, "parent_child"),
                    reasoning=(
                        f"Heading depth ({heading_depth:.0f}) supports parent-child "
                        "linking for precise retrieval with broader context."
                    ),
                    is_primary=False,
                    config={},
                )
            )

        if cross_ref_ratio > 0.02 or named_entity_density > 0.03:
            parts = []
            if cross_ref_ratio > 0.02:
                parts.append(f"cross-references ({cross_ref_ratio:.1%})")
            if named_entity_density > 0.03:
                parts.append(f"named entities ({named_entity_density:.1%})")
            techniques.append(
                TechniqueRecommendation(
                    name="summary_augmented",
                    category="chunking",
                    confidence=self._compute_confidence(0.65, "summary_augmented"),
                    reasoning=(
                        f"Document has {' and '.join(parts)} - "
                        "summary augmentation helps retrieve related chunks."
                    ),
                    is_primary=False,
                    config={},
                )
            )

        if formula_ratio > 0.01:
            techniques.append(
                TechniqueRecommendation(
                    name="formula_preserving",
                    category="chunking",
                    confidence=self._compute_confidence(0.7, "formula_preserving"),
                    reasoning=(
                        f"Formula content detected ({formula_ratio:.1%}) - "
                        "formula-preserving chunking avoids splitting equations."
                    ),
                    is_primary=False,
                    config={},
                )
            )

        return techniques, why_not

    # ── retrieval ────────────────────────────────────────────────────

    def _select_retrieval(
        self, signals: dict, corpus_size: str, doc_type: str
    ) -> tuple[list[TechniqueRecommendation], list[WhyNot]]:
        techniques: list[TechniqueRecommendation] = []
        why_not: list[WhyNot] = []

        vocabulary_diversity = _sig(signals, "vocabulary_diversity")
        formula_ratio = _sig(signals, "formula_ratio")
        table_ratio = _sig(signals, "table_ratio")
        comparison_patterns = _sig(signals, "comparison_patterns")
        avg_sentence_length = _sig(signals, "avg_sentence_length")
        cross_ref_ratio = _sig(signals, "cross_ref_ratio")
        named_entity_density = _sig(signals, "named_entity_density")
        heading_depth = _sig(signals, "heading_depth")

        # ── BASE (primary) ───────────────────────────────────────────

        if corpus_size == "small" and vocabulary_diversity > 0.7:
            techniques.append(
                TechniqueRecommendation(
                    name="dense",
                    category="retrieval",
                    confidence=self._compute_confidence(0.7, "dense"),
                    reasoning=(
                        f"Small corpus with high vocabulary diversity "
                        f"({vocabulary_diversity:.0%}) - pure dense retrieval sufficient."
                    ),
                    is_primary=True,
                    config={},
                )
            )
        else:
            techniques.append(
                TechniqueRecommendation(
                    name="hybrid",
                    category="retrieval",
                    confidence=self._compute_confidence(0.85, "hybrid"),
                    reasoning=(
                        "Hybrid search combines semantic and keyword matching "
                        "for robust retrieval."
                    ),
                    is_primary=True,
                    config={},
                )
            )

        # ── WHY NOT for retrieval base ───────────────────────────────

        if not (corpus_size == "small" and vocabulary_diversity > 0.7):
            if corpus_size == "small":
                why_not.append(
                    WhyNot(
                        technique="dense",
                        reason=(
                            f"Vocabulary diversity ({vocabulary_diversity:.0%}) "
                            "at or below 70% for small corpus - hybrid search "
                            "provides better keyword coverage"
                        ),
                    )
                )

        # ── AUGMENTATIONS ────────────────────────────────────────────

        if formula_ratio > 0.01 or table_ratio > 0.1:
            parts = []
            if formula_ratio > 0.01:
                parts.append(f"formulas ({formula_ratio:.1%})")
            if table_ratio > 0.1:
                parts.append(f"tables ({table_ratio:.0%})")
            techniques.append(
                TechniqueRecommendation(
                    name="bm25_boost",
                    category="retrieval",
                    confidence=self._compute_confidence(0.7, "bm25_boost"),
                    reasoning=(
                        f"Document contains {' and '.join(parts)} - "
                        "BM25 boost improves exact-match retrieval for "
                        "structured content."
                    ),
                    is_primary=False,
                    config={},
                )
            )

        if comparison_patterns > 0.02:
            techniques.append(
                TechniqueRecommendation(
                    name="query_decomposition",
                    category="retrieval",
                    confidence=self._compute_confidence(0.75, "query_decomposition"),
                    reasoning=(
                        f"Comparison patterns detected ({comparison_patterns:.1%}) - "
                        "query decomposition retrieves evidence for each "
                        "comparison dimension."
                    ),
                    is_primary=False,
                    config={},
                )
            )

        if avg_sentence_length > 20 and doc_type in ("educational", "academic"):
            techniques.append(
                TechniqueRecommendation(
                    name="hyde",
                    category="retrieval",
                    confidence=self._compute_confidence(0.7, "hyde"),
                    reasoning=(
                        f"Educational/academic content with long sentences "
                        f"({avg_sentence_length:.0f} words) - HyDE generates "
                        "hypothetical answers for conceptual queries."
                    ),
                    is_primary=False,
                    config={},
                )
            )
        elif doc_type in ("educational", "academic") and avg_sentence_length <= 20:
            why_not.append(
                WhyNot(
                    technique="hyde",
                    reason=(
                        f"Average sentence length ({avg_sentence_length:.0f}) "
                        f"at or below 20 for {doc_type} content - HyDE most "
                        "effective with longer conceptual prose"
                    ),
                )
            )

        # Graph RAG requires both strong cross-refs AND entity density
        graph_rag_eligible = (
            cross_ref_ratio > 0.05 and named_entity_density > 0.03
        )
        if graph_rag_eligible:
            techniques.append(
                TechniqueRecommendation(
                    name="graph_rag",
                    category="retrieval",
                    confidence=self._compute_confidence(0.6, "graph_rag"),
                    reasoning=(
                        f"High cross-references ({cross_ref_ratio:.1%}) and "
                        f"entity density ({named_entity_density:.1%}) - "
                        "graph RAG captures relational knowledge."
                    ),
                    is_primary=False,
                    config={},
                )
            )
        else:
            # Explain why graph_rag was not selected
            reasons = []
            if cross_ref_ratio <= 0.05:
                reasons.append(
                    f"cross-ref ratio ({cross_ref_ratio:.1%}) at or below 5%"
                )
            if named_entity_density <= 0.03:
                reasons.append(
                    f"entity density ({named_entity_density:.1%}) at or below 3%"
                )
            why_not.append(
                WhyNot(
                    technique="graph_rag",
                    reason=(
                        f"{' and '.join(reasons).capitalize()} - "
                        "Graph RAG needs dense entity relationships"
                    ),
                )
            )

            # Multi-hop as a lighter alternative
            if cross_ref_ratio > 0.02:
                techniques.append(
                    TechniqueRecommendation(
                        name="multi_hop",
                        category="retrieval",
                        confidence=self._compute_confidence(0.65, "multi_hop"),
                        reasoning=(
                            f"Moderate cross-references ({cross_ref_ratio:.1%}) - "
                            "multi-hop retrieval follows reference chains without "
                            "full graph construction."
                        ),
                        is_primary=False,
                        config={},
                    )
                )

        if heading_depth >= 2:
            techniques.append(
                TechniqueRecommendation(
                    name="metadata_filtering",
                    category="retrieval",
                    confidence=self._compute_confidence(0.7, "metadata_filtering"),
                    reasoning=(
                        f"Heading depth ({heading_depth:.0f}) enables section-level "
                        "metadata for filtered retrieval."
                    ),
                    is_primary=False,
                    config={},
                )
            )

        if corpus_size == "large":
            techniques.append(
                TechniqueRecommendation(
                    name="document_summary_index",
                    category="retrieval",
                    confidence=self._compute_confidence(
                        0.75, "document_summary_index"
                    ),
                    reasoning=(
                        "Large corpus benefits from two-stage retrieval: "
                        "summary index narrows candidates before chunk-level search."
                    ),
                    is_primary=False,
                    config={},
                )
            )

        # Contextual retrieval (Anthropic): -67% failures with full stack
        # Recommend for medium+ corpora where accuracy matters
        if corpus_size in ("medium", "large"):
            techniques.append(
                TechniqueRecommendation(
                    name="contextual_retrieval",
                    category="retrieval",
                    confidence=self._compute_confidence(0.8, "contextual_retrieval"),
                    reasoning=(
                        "Contextual retrieval prepends document-level context to each chunk "
                        "before embedding, reducing retrieval failures by 49-67% "
                        "(Anthropic 2024). Cost: ~$1/M tokens at indexing time."
                    ),
                    is_primary=False,
                    config={"cost_per_million_tokens": 1.02},
                )
            )

        # Multi-scale indexing: index at 2-3 chunk sizes, merge with RRF
        # AI21 2026: +1-37% improvement, 2-5x storage
        total_words = _sig(signals, "total_words")
        if corpus_size in ("medium", "large") or total_words > 50000:
            techniques.append(
                TechniqueRecommendation(
                    name="multi_scale_indexing",
                    category="retrieval",
                    confidence=self._compute_confidence(0.7, "multi_scale_indexing"),
                    reasoning=(
                        "Multi-scale indexing stores chunks at 2-3 sizes "
                        "(128+512+1024 tokens) and merges results with RRF. "
                        "+1-37% retrieval improvement (AI21 2026). "
                        "Tradeoff: 2-5x storage cost."
                    ),
                    is_primary=False,
                    config={"chunk_sizes": [128, 512, 1024], "fusion": "rrf"},
                )
            )

        return techniques, why_not

    # ── reranking ────────────────────────────────────────────────────

    def _select_reranking(
        self, signals: dict, priority: str
    ) -> tuple[list[TechniqueRecommendation], list[WhyNot]]:
        techniques: list[TechniqueRecommendation] = []
        why_not: list[WhyNot] = []

        heading_density = _sig(signals, "heading_density")
        total_words = _sig(signals, "total_words")

        # ── CASCADE override ─────────────────────────────────────────
        if priority != "speed" and total_words > 50000:
            techniques.append(
                TechniqueRecommendation(
                    name="cascade",
                    category="reranking",
                    confidence=self._compute_confidence(0.85, "cascade"),
                    reasoning=(
                        f"Large document ({total_words:.0f} words) with "
                        "accuracy priority - cascade (flashrank -> cross-encoder) "
                        "balances throughput and precision."
                    ),
                    is_primary=True,
                    config={"stages": ["flashrank", "cross_encoder"]},
                )
            )
            why_not.append(
                WhyNot(
                    technique="cross_encoder",
                    reason=(
                        f"Document size ({total_words:.0f} words) exceeds 50k - "
                        "standalone cross-encoder replaced by cascade for efficiency"
                    ),
                )
            )
        else:
            # ── PRIMARY ──────────────────────────────────────────────
            if priority == "accuracy":
                techniques.append(
                    TechniqueRecommendation(
                        name="cross_encoder",
                        category="reranking",
                        confidence=self._compute_confidence(0.85, "cross_encoder"),
                        reasoning=(
                            "Accuracy priority - cross-encoder provides the "
                            "highest-quality reranking."
                        ),
                        is_primary=True,
                        config={},
                    )
                )
            elif priority == "speed":
                techniques.append(
                    TechniqueRecommendation(
                        name="flashrank",
                        category="reranking",
                        confidence=self._compute_confidence(0.8, "flashrank"),
                        reasoning=(
                            "Speed priority - FlashRank is an ultra-lightweight "
                            "CPU reranker with minimal latency."
                        ),
                        is_primary=True,
                        config={},
                    )
                )
            else:
                techniques.append(
                    TechniqueRecommendation(
                        name="bge",
                        category="reranking",
                        confidence=self._compute_confidence(0.75, "bge"),
                        reasoning=(
                            "Balanced priority - BGE reranker offers good accuracy "
                            "with reasonable compute cost."
                        ),
                        is_primary=True,
                        config={},
                    )
                )

        # ── AUGMENTATIONS ────────────────────────────────────────────

        if heading_density > 0.02:
            techniques.append(
                TechniqueRecommendation(
                    name="mmr_diversity",
                    category="reranking",
                    confidence=self._compute_confidence(0.7, "mmr_diversity"),
                    reasoning=(
                        f"Heading density ({heading_density:.1%}) suggests "
                        "multi-topic content - MMR diversity avoids redundant "
                        "results from the same section."
                    ),
                    is_primary=False,
                    config={},
                )
            )

        # Lost-in-the-middle is always beneficial
        techniques.append(
            TechniqueRecommendation(
                name="lost_in_middle",
                category="reranking",
                confidence=self._compute_confidence(0.9, "lost_in_middle"),
                reasoning=(
                    "Always applied - reorders context to place strongest "
                    "evidence at start and end, compensating for LLM "
                    "attention patterns."
                ),
                is_primary=False,
                config={},
            )
        )

        return techniques, why_not

    # ── embedding ────────────────────────────────────────────────────

    def _select_embedding(
        self, signals: dict, budget: str, has_gpu: bool, doc_type: str
    ) -> TechniqueRecommendation:
        code_ratio = _sig(signals, "code_ratio")
        avg_sentence_length = _sig(signals, "avg_sentence_length")
        total_words = _sig(signals, "total_words")

        if budget == "free" and has_gpu:
            return TechniqueRecommendation(
                name="bge-m3",
                category="embedding",
                confidence=self._compute_confidence(0.8, "bge-m3"),
                reasoning=(
                    "Free budget with GPU available - BGE-M3 is the best "
                    "open-source multilingual embedding model."
                ),
                is_primary=True,
                config={"device": "gpu"},
            )

        if budget == "free":
            return TechniqueRecommendation(
                name="all-MiniLM-L6-v2",
                category="embedding",
                confidence=self._compute_confidence(0.7, "all-MiniLM-L6-v2"),
                reasoning=(
                    "Free budget, CPU only - all-MiniLM-L6-v2 is lightweight "
                    "and runs well on CPU."
                ),
                is_primary=True,
                config={"device": "cpu"},
            )

        if code_ratio > 0.2:
            return TechniqueRecommendation(
                name="jina-embeddings-v3",
                category="embedding",
                confidence=self._compute_confidence(0.8, "jina-embeddings-v3"),
                reasoning=(
                    f"Significant code content ({code_ratio:.0%}) - "
                    "Jina Embeddings v3 handles code and natural language well."
                ),
                is_primary=True,
                config={},
            )

        if doc_type in ("legal",) or avg_sentence_length > 25:
            reason_parts = []
            if doc_type == "legal":
                reason_parts.append("legal domain")
            if avg_sentence_length > 25:
                reason_parts.append(
                    f"long sentences ({avg_sentence_length:.0f} words avg)"
                )
            return TechniqueRecommendation(
                name="voyage-3-large",
                category="embedding",
                confidence=self._compute_confidence(0.8, "voyage-3-large"),
                reasoning=(
                    f"{' with '.join(reason_parts).capitalize()} - "
                    "Voyage-3-Large excels at dense, specialized text."
                ),
                is_primary=True,
                config={},
            )

        if total_words > 500000:
            return TechniqueRecommendation(
                name="text-embedding-3-small",
                category="embedding",
                confidence=self._compute_confidence(0.75, "text-embedding-3-small"),
                reasoning=(
                    f"Very large corpus ({total_words:,.0f} words) - "
                    "text-embedding-3-small balances cost and quality at scale."
                ),
                is_primary=True,
                config={},
            )

        # Default
        return TechniqueRecommendation(
            name="text-embedding-3-small",
            category="embedding",
            confidence=self._compute_confidence(0.8, "text-embedding-3-small"),
            reasoning=(
                "General-purpose default - text-embedding-3-small offers "
                "excellent quality at low cost."
            ),
            is_primary=True,
            config={},
        )

    # ── confidence ───────────────────────────────────────────────────

    def _compute_confidence(
        self,
        signal_strength: float,
        technique: str | None = None,
        *,
        research_backing: float | None = None,
        technique_maturity: float | None = None,
    ) -> float:
        """Weighted confidence score.

        ``signal_strength`` is how strongly the data points to this
        technique (0-1).  ``research_backing`` and ``technique_maturity``
        can be provided explicitly or looked up from the hardcoded tables
        using *technique*.
        """
        if research_backing is None:
            research_backing = _RESEARCH_BACKING.get(technique or "", 0.7)
        if technique_maturity is None:
            technique_maturity = _TECHNIQUE_MATURITY.get(technique or "", 0.7)

        confidence = (
            signal_strength * 0.4
            + research_backing * 0.3
            + technique_maturity * 0.3
        )
        return round(min(max(confidence, 0.0), 1.0), 3)

    # ── summary ──────────────────────────────────────────────────────

    def _build_summary(
        self,
        signals: dict,
        doc_type: str,
        chunking: list[TechniqueRecommendation],
        retrieval: list[TechniqueRecommendation],
        reranking: list[TechniqueRecommendation],
        embedding: TechniqueRecommendation,
    ) -> str:
        """Build a human-readable summary of the recommendation."""
        parts: list[str] = []

        # ── corpus description ───────────────────────────────────────
        heading_depth = _sig(signals, "heading_depth")
        code_ratio = _sig(signals, "code_ratio")
        total_words = _sig(signals, "total_words")

        desc_tokens: list[str] = []
        if doc_type != "general":
            desc_tokens.append(doc_type.capitalize())
        else:
            desc_tokens.append("General")
        desc_tokens.append("corpus")
        if heading_depth >= 3:
            desc_tokens.append(
                f"with deep hierarchy (depth {heading_depth:.0f})"
            )
        elif heading_depth >= 1:
            desc_tokens.append(
                f"with heading structure (depth {heading_depth:.0f})"
            )
        if code_ratio > 0.2:
            desc_tokens.append(f"and significant code ({code_ratio:.0%})")
        if total_words > 100000:
            desc_tokens.append(f"({total_words:,.0f} words)")

        parts.append(" ".join(desc_tokens) + ".")

        # ── chunking ─────────────────────────────────────────────────
        primary_chunk = next((t for t in chunking if t.is_primary), None)
        augmentations_chunk = [t for t in chunking if not t.is_primary]
        if primary_chunk:
            chunk_desc = f"Recommending {primary_chunk.name} chunking"
            if augmentations_chunk:
                aug_names = [t.name for t in augmentations_chunk]
                chunk_desc += f" with {' + '.join(aug_names)}"
                if "parent_child" in aug_names:
                    chunk_desc += (
                        " for precise retrieval + broad context"
                    )
            chunk_desc += "."
            parts.append(chunk_desc)

        # ── retrieval ────────────────────────────────────────────────
        primary_ret = next((t for t in retrieval if t.is_primary), None)
        augmentations_ret = [t for t in retrieval if not t.is_primary]
        if primary_ret:
            ret_desc = f"{primary_ret.name.capitalize()} search"
            if augmentations_ret:
                aug_names = [t.name for t in augmentations_ret]
                ret_desc += f" with {', '.join(aug_names)}"
            ret_desc += "."
            parts.append(ret_desc)

        # ── reranking ────────────────────────────────────────────────
        primary_rank = next((t for t in reranking if t.is_primary), None)
        augmentations_rank = [t for t in reranking if not t.is_primary]
        if primary_rank:
            rank_desc = (
                f"{primary_rank.name.replace('_', '-').capitalize()} reranking"
            )
            if augmentations_rank:
                aug_names = [
                    t.name.replace("_", " ") for t in augmentations_rank
                ]
                rank_desc += f" with {' + '.join(aug_names)}"
            rank_desc += "."
            parts.append(rank_desc)

        return " ".join(parts)


# Module-level singleton
pipeline_recommender = PipelineRecommender()

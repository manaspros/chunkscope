"""
Tests for the multi-technique pipeline recommender.
Verifies that corpus fingerprint signals map to correct technique stacks.
"""
import pytest

from app.services.pipeline_recommender import (
    PipelineRecommender,
    PipelineRecommendation,
    TechniqueRecommendation,
    WhyNot,
    pipeline_recommender,
)


# ── Helpers ─────────────────────────────────────────────────────────────

def recommend(signals: dict, **kwargs) -> PipelineRecommendation:
    """Shortcut to get a recommendation."""
    return pipeline_recommender.recommend(signals=signals, **kwargs)


def primary_names(rec: PipelineRecommendation, category: str) -> list[str]:
    """Get primary technique names for a category."""
    techniques = getattr(rec, category)
    if isinstance(techniques, list):
        return [t.name for t in techniques if t.is_primary]
    return [techniques.name]


def all_names(rec: PipelineRecommendation, category: str) -> list[str]:
    """Get all technique names for a category."""
    techniques = getattr(rec, category)
    if isinstance(techniques, list):
        return [t.name for t in techniques]
    return [techniques.name]


def why_not_techniques(rec: PipelineRecommendation) -> list[str]:
    """Get list of why-not technique names."""
    return [w.technique for w in rec.why_not]


# ── Singleton ───────────────────────────────────────────────────────────

class TestSingleton:
    def test_singleton_exists(self):
        assert pipeline_recommender is not None
        assert isinstance(pipeline_recommender, PipelineRecommender)


# ── Dataclass serialization ─────────────────────────────────────────────

class TestSerialization:
    def test_to_dict_roundtrip(self):
        rec = recommend({"code_ratio": 0.5, "total_words": 1000})
        d = rec.to_dict()
        assert isinstance(d, dict)
        assert "chunking" in d
        assert "retrieval" in d
        assert "reranking" in d
        assert "embedding" in d
        assert "why_not" in d
        assert "overall_confidence" in d
        assert "summary" in d

    def test_all_confidences_in_range(self):
        rec = recommend({"heading_depth": 4, "avg_paragraph_sentences": 5, "total_words": 10000})
        for t in rec.chunking + rec.retrieval + rec.reranking + [rec.embedding]:
            assert 0.0 <= t.confidence <= 1.0

    def test_overall_confidence_in_range(self):
        rec = recommend({})
        assert 0.0 <= rec.overall_confidence <= 1.0


# ── Chunking selection ──────────────────────────────────────────────────

class TestChunkingSelection:
    def test_code_aware_for_high_code(self):
        rec = recommend({"code_ratio": 0.5})
        assert primary_names(rec, "chunking") == ["code_aware"]

    def test_hierarchical_for_deep_headings(self):
        rec = recommend({"heading_depth": 4, "avg_paragraph_sentences": 5})
        assert primary_names(rec, "chunking") == ["hierarchical"]

    def test_heading_based_for_moderate_headings(self):
        rec = recommend({"heading_density": 0.05, "heading_depth": 1})
        assert primary_names(rec, "chunking") == ["heading_based"]

    def test_semantic_for_dense_prose(self):
        rec = recommend({"avg_sentence_length": 30})
        assert primary_names(rec, "chunking") == ["semantic"]

    def test_sentence_window_for_qa(self):
        rec = recommend({"question_density": 0.1})
        assert primary_names(rec, "chunking") == ["sentence_window"]

    def test_recursive_as_fallback(self):
        rec = recommend({})
        assert primary_names(rec, "chunking") == ["recursive"]

    def test_parent_child_augmentation(self):
        rec = recommend({"heading_depth": 2})
        names = all_names(rec, "chunking")
        assert "parent_child" in names

    def test_summary_augmented_for_cross_refs(self):
        rec = recommend({"cross_ref_ratio": 0.05})
        names = all_names(rec, "chunking")
        assert "summary_augmented" in names

    def test_summary_augmented_for_entities(self):
        rec = recommend({"named_entity_density": 0.05})
        names = all_names(rec, "chunking")
        assert "summary_augmented" in names

    def test_formula_preserving(self):
        rec = recommend({"formula_ratio": 0.05})
        names = all_names(rec, "chunking")
        assert "formula_preserving" in names

    def test_code_priority_over_heading(self):
        """Code ratio > 0.3 takes priority even with deep headings."""
        rec = recommend({"code_ratio": 0.5, "heading_depth": 4, "avg_paragraph_sentences": 5})
        assert primary_names(rec, "chunking") == ["code_aware"]


# ── Retrieval selection ─────────────────────────────────────────────────

class TestRetrievalSelection:
    def test_dense_for_small_diverse_corpus(self):
        rec = recommend({"vocabulary_diversity": 0.8}, corpus_size="small")
        assert primary_names(rec, "retrieval") == ["dense"]

    def test_hybrid_as_default(self):
        rec = recommend({})
        assert primary_names(rec, "retrieval") == ["hybrid"]

    def test_bm25_boost_for_formulas(self):
        rec = recommend({"formula_ratio": 0.05})
        names = all_names(rec, "retrieval")
        assert "bm25_boost" in names

    def test_bm25_boost_for_tables(self):
        rec = recommend({"table_ratio": 0.15})
        names = all_names(rec, "retrieval")
        assert "bm25_boost" in names

    def test_query_decomposition_for_comparisons(self):
        rec = recommend({"comparison_patterns": 0.05})
        names = all_names(rec, "retrieval")
        assert "query_decomposition" in names

    def test_hyde_for_educational(self):
        rec = recommend({"avg_sentence_length": 25}, doc_type="educational")
        names = all_names(rec, "retrieval")
        assert "hyde" in names

    def test_hyde_not_for_general(self):
        rec = recommend({"avg_sentence_length": 25}, doc_type="general")
        names = all_names(rec, "retrieval")
        assert "hyde" not in names

    def test_graph_rag_for_entity_rich(self):
        rec = recommend({"cross_ref_ratio": 0.1, "named_entity_density": 0.05})
        names = all_names(rec, "retrieval")
        assert "graph_rag" in names

    def test_multi_hop_for_moderate_refs(self):
        rec = recommend({"cross_ref_ratio": 0.03, "named_entity_density": 0.01})
        names = all_names(rec, "retrieval")
        assert "multi_hop" in names
        assert "graph_rag" not in names

    def test_metadata_filtering_with_headings(self):
        rec = recommend({"heading_depth": 3})
        names = all_names(rec, "retrieval")
        assert "metadata_filtering" in names

    def test_document_summary_for_large_corpus(self):
        rec = recommend({}, corpus_size="large")
        names = all_names(rec, "retrieval")
        assert "document_summary_index" in names

    def test_contextual_retrieval_for_medium_corpus(self):
        rec = recommend({}, corpus_size="medium")
        names = all_names(rec, "retrieval")
        assert "contextual_retrieval" in names

    def test_multi_scale_indexing_for_large_corpus(self):
        rec = recommend({"total_words": 100000}, corpus_size="large")
        names = all_names(rec, "retrieval")
        assert "multi_scale_indexing" in names


# ── Reranking selection ─────────────────────────────────────────────────

class TestRerankingSelection:
    def test_cross_encoder_for_accuracy(self):
        rec = recommend({}, priority="accuracy")
        assert primary_names(rec, "reranking") == ["cross_encoder"]

    def test_flashrank_for_speed(self):
        rec = recommend({}, priority="speed")
        assert primary_names(rec, "reranking") == ["flashrank"]

    def test_bge_for_balanced(self):
        rec = recommend({}, priority="balanced")
        assert primary_names(rec, "reranking") == ["bge"]

    def test_cascade_for_large_docs(self):
        rec = recommend({"total_words": 60000}, priority="accuracy")
        assert primary_names(rec, "reranking") == ["cascade"]

    def test_mmr_diversity_for_structured(self):
        rec = recommend({"heading_density": 0.05})
        names = all_names(rec, "reranking")
        assert "mmr_diversity" in names

    def test_lost_in_middle_always(self):
        rec = recommend({})
        names = all_names(rec, "reranking")
        assert "lost_in_middle" in names


# ── Embedding selection ─────────────────────────────────────────────────

class TestEmbeddingSelection:
    def test_bge_m3_free_gpu(self):
        rec = recommend({}, budget="free", has_gpu=True)
        assert rec.embedding.name == "bge-m3"

    def test_minilm_free_cpu(self):
        rec = recommend({}, budget="free", has_gpu=False)
        assert rec.embedding.name == "all-MiniLM-L6-v2"

    def test_jina_for_code(self):
        rec = recommend({"code_ratio": 0.3})
        assert rec.embedding.name == "jina-embeddings-v3"

    def test_voyage_for_legal(self):
        rec = recommend({}, doc_type="legal")
        assert rec.embedding.name == "voyage-3-large"

    def test_voyage_for_long_sentences(self):
        rec = recommend({"avg_sentence_length": 30})
        assert rec.embedding.name == "voyage-3-large"

    def test_default_embedding(self):
        rec = recommend({})
        assert rec.embedding.name == "text-embedding-3-small"


# ── Why-not explanations ────────────────────────────────────────────────

class TestWhyNot:
    def test_graph_rag_why_not_low_refs(self):
        rec = recommend({"cross_ref_ratio": 0.01, "named_entity_density": 0.01})
        why_nots = why_not_techniques(rec)
        assert "graph_rag" in why_nots

    def test_hierarchical_why_not_shallow(self):
        rec = recommend({"heading_depth": 1})
        why_nots = why_not_techniques(rec)
        assert "hierarchical" in why_nots

    def test_semantic_why_not_short_sentences(self):
        rec = recommend({"avg_sentence_length": 15})
        why_nots = why_not_techniques(rec)
        assert "semantic" in why_nots

    def test_why_not_has_reasons(self):
        rec = recommend({})
        for wn in rec.why_not:
            assert len(wn.reason) > 10
            assert len(wn.technique) > 0


# ── Full scenario tests ────────────────────────────────────────────────

class TestFullScenarios:
    def test_ncert_textbook(self):
        """NCERT Physics textbook should get hierarchical + parent-child + formula-preserving."""
        rec = recommend(
            signals={
                "heading_depth": 4,
                "heading_density": 0.06,
                "formula_ratio": 0.08,
                "cross_ref_ratio": 0.04,
                "avg_sentence_length": 18,
                "avg_paragraph_sentences": 5,
                "question_density": 0.03,
                "named_entity_density": 0.02,
                "vocabulary_diversity": 0.6,
                "total_words": 50000,
            },
            doc_type="educational",
        )
        chunking_names = all_names(rec, "chunking")
        assert "hierarchical" in chunking_names
        assert "parent_child" in chunking_names
        assert "formula_preserving" in chunking_names

        retrieval_names = all_names(rec, "retrieval")
        assert "hybrid" in retrieval_names or "dense" in retrieval_names

    def test_legal_contracts(self):
        """50 NDAs should get semantic + hybrid + cross-encoder."""
        rec = recommend(
            signals={
                "heading_depth": 2,
                "heading_density": 0.02,
                "avg_sentence_length": 32,
                "cross_ref_ratio": 0.06,
                "named_entity_density": 0.05,
                "vocabulary_diversity": 0.45,
                "total_words": 80000,
            },
            doc_type="legal",
            corpus_size="small",
        )
        chunking_names = all_names(rec, "chunking")
        assert "semantic" in chunking_names

        retrieval_names = all_names(rec, "retrieval")
        assert "graph_rag" in retrieval_names  # high cross_ref + entity density

    def test_python_codebase(self):
        """200 Python files should get code-aware + hybrid + BGE/jina."""
        rec = recommend(
            signals={
                "code_ratio": 0.75,
                "heading_density": 0.01,
                "avg_sentence_length": 8,
                "cross_ref_ratio": 0.15,
                "named_entity_density": 0.01,
                "total_words": 150000,
            },
            doc_type="code",
            corpus_size="medium",
        )
        chunking_names = all_names(rec, "chunking")
        assert "code_aware" in chunking_names

        assert rec.embedding.name == "jina-embeddings-v3"

    def test_faq_document(self):
        """FAQ should get sentence-window chunking."""
        rec = recommend(
            signals={
                "question_density": 0.15,
                "dialogue_ratio": 0.3,
                "avg_sentence_length": 10,
                "avg_paragraph_sentences": 2,
                "heading_depth": 0,
                "total_words": 5000,
            },
            doc_type="support",
        )
        chunking_names = all_names(rec, "chunking")
        assert "sentence_window" in chunking_names

    def test_summary_is_readable(self):
        rec = recommend(
            signals={"heading_depth": 3, "avg_paragraph_sentences": 4, "total_words": 10000},
            doc_type="academic",
        )
        assert len(rec.summary) > 20
        assert "chunking" in rec.summary.lower() or "search" in rec.summary.lower()


# ── Confidence computation ──────────────────────────────────────────────

class TestConfidence:
    def test_compute_confidence_formula(self):
        r = PipelineRecommender()
        c = r._compute_confidence(1.0, research_backing=1.0, technique_maturity=1.0)
        assert c == 1.0

        c = r._compute_confidence(0.0, research_backing=0.0, technique_maturity=0.0)
        assert c == 0.0

    def test_compute_confidence_weighted(self):
        r = PipelineRecommender()
        # signal_strength * 0.4 + research * 0.3 + maturity * 0.3
        c = r._compute_confidence(0.5, research_backing=0.5, technique_maturity=0.5)
        assert abs(c - 0.5) < 0.01

    def test_confidence_clamped(self):
        r = PipelineRecommender()
        c = r._compute_confidence(2.0, research_backing=2.0, technique_maturity=2.0)
        assert c <= 1.0

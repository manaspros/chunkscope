"""
Tests for the new reranking strategies.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.rerankers.base import BaseReranker
from app.services.rerankers.lost_in_middle_reranker import LostInMiddleReranker
from app.services.rerankers.diversity_reranker import DiversityReranker
from app.services.rerankers.cascade_reranker import CascadeReranker
from app.services.rerankers.contextual_reranker import ContextualReranker


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

SAMPLE_QUERY = "What are the rules for data privacy?"

SAMPLE_DOCS = [
    {"id": f"doc{i}", "text": f"Document text number {i}"}
    for i in range(1, 9)
]


def _make_ranked_docs(n: int):
    """Return docs already sorted by relevance rank (0 = most relevant)."""
    return [
        {"id": f"doc{i}", "text": f"Relevance rank {i}", "rerank_score": 1.0 / (i + 1)}
        for i in range(n)
    ]


# ---------------------------------------------------------------------------
# Lost-in-the-Middle Reranker
# ---------------------------------------------------------------------------

class TestLostInMiddleReranker:
    """Test that the interleave pattern places the most relevant docs at the
    beginning and end, with the least relevant docs in the middle."""

    @pytest.mark.asyncio
    async def test_interleave_even_count(self):
        reranker = LostInMiddleReranker()
        docs = _make_ranked_docs(8)
        result = await reranker.rerank(SAMPLE_QUERY, docs, top_k=8)

        # Expected interleave for 8 docs (0-indexed ranks):
        #   Position: 0  1  2  3  4  5  6  7
        #   Rank:     0  2  4  6  7  5  3  1
        ids = [d["id"] for d in result]
        assert ids == ["doc0", "doc2", "doc4", "doc6", "doc7", "doc5", "doc3", "doc1"]

    @pytest.mark.asyncio
    async def test_interleave_odd_count(self):
        reranker = LostInMiddleReranker()
        docs = _make_ranked_docs(5)
        result = await reranker.rerank(SAMPLE_QUERY, docs, top_k=5)

        # Expected: [0, 2, 4, 3, 1]
        ids = [d["id"] for d in result]
        assert ids == ["doc0", "doc2", "doc4", "doc3", "doc1"]

    @pytest.mark.asyncio
    async def test_first_and_last_are_top_ranked(self):
        reranker = LostInMiddleReranker()
        docs = _make_ranked_docs(6)
        result = await reranker.rerank(SAMPLE_QUERY, docs, top_k=6)

        # First position should be rank 0 (most relevant)
        assert result[0]["id"] == "doc0"
        # Last position should be rank 1 (second most relevant)
        assert result[-1]["id"] == "doc1"

    @pytest.mark.asyncio
    async def test_small_list_passthrough(self):
        reranker = LostInMiddleReranker()
        docs = _make_ranked_docs(2)
        result = await reranker.rerank(SAMPLE_QUERY, docs, top_k=2)
        # Two docs should stay in original order
        assert [d["id"] for d in result] == ["doc0", "doc1"]

    @pytest.mark.asyncio
    async def test_empty_input(self):
        reranker = LostInMiddleReranker()
        result = await reranker.rerank(SAMPLE_QUERY, [], top_k=5)
        assert result == []

    @pytest.mark.asyncio
    async def test_with_pre_reranker(self):
        """Test that a pre-reranker is called before interleaving."""
        mock_reranker = AsyncMock(spec=BaseReranker)
        docs = _make_ranked_docs(4)
        # Pre-reranker reverses order
        mock_reranker.rerank.return_value = list(reversed(docs))

        reranker = LostInMiddleReranker(pre_reranker=mock_reranker)
        result = await reranker.rerank(SAMPLE_QUERY, docs, top_k=4)

        mock_reranker.rerank.assert_awaited_once()
        assert len(result) == 4


# ---------------------------------------------------------------------------
# Diversity Reranker
# ---------------------------------------------------------------------------

class TestDiversityReranker:
    """Test that the MMR-based diversity reranker reduces similarity between
    selected documents."""

    @pytest.mark.asyncio
    async def test_diversity_reduces_similarity(self):
        """With lambda=0 (pure diversity), the reranker should prefer
        dissimilar documents."""
        reranker = DiversityReranker(lambda_param=0.0, embedding_model="test-model")

        docs = [
            {"id": "doc1", "text": "Data privacy and GDPR compliance"},
            {"id": "doc2", "text": "Data privacy and GDPR regulations"},  # very similar to doc1
            {"id": "doc3", "text": "Machine learning model training"},     # different topic
        ]

        # Create embeddings where doc1 and doc2 are very similar, doc3 is different
        # query_emb, doc1_emb, doc2_emb, doc3_emb
        mock_embeddings = [
            [1.0, 0.0, 0.0],  # query
            [0.9, 0.1, 0.0],  # doc1 - similar to query
            [0.88, 0.12, 0.0],  # doc2 - very similar to doc1
            [0.0, 0.0, 1.0],  # doc3 - totally different
        ]

        with patch("app.services.llm_service.llm_service") as mock_llm:
            mock_llm.embed = AsyncMock(return_value=mock_embeddings)

            result = await reranker.rerank(SAMPLE_QUERY, docs, top_k=3)

            assert len(result) == 3
            # With pure diversity (lambda=0), after picking any first doc,
            # the reranker should pick the most dissimilar next
            selected_ids = [d["id"] for d in result]
            # doc1 and doc2 should NOT be adjacent in selection when diversity is maximized
            # If doc1 is first, doc3 should be second (most different from doc1)
            if selected_ids[0] == "doc1":
                assert selected_ids[1] == "doc3"

    @pytest.mark.asyncio
    async def test_diversity_with_high_lambda_prefers_relevance(self):
        """With lambda=1 (pure relevance), ordering should follow query similarity."""
        reranker = DiversityReranker(lambda_param=1.0, embedding_model="test-model")

        docs = [
            {"id": "doc1", "text": "Low relevance text"},
            {"id": "doc2", "text": "High relevance text"},
            {"id": "doc3", "text": "Medium relevance text"},
        ]

        mock_embeddings = [
            [1.0, 0.0],   # query
            [0.1, 0.9],   # doc1 - low relevance
            [0.95, 0.05], # doc2 - high relevance
            [0.5, 0.5],   # doc3 - medium
        ]

        with patch("app.services.llm_service.llm_service") as mock_llm:
            mock_llm.embed = AsyncMock(return_value=mock_embeddings)

            result = await reranker.rerank(SAMPLE_QUERY, docs, top_k=3)

            # With pure relevance, doc2 should be first (highest cosine sim to query)
            assert result[0]["id"] == "doc2"

    @pytest.mark.asyncio
    async def test_diversity_empty_input(self):
        reranker = DiversityReranker()
        result = await reranker.rerank(SAMPLE_QUERY, [], top_k=5)
        assert result == []

    @pytest.mark.asyncio
    async def test_invalid_lambda(self):
        with pytest.raises(ValueError):
            DiversityReranker(lambda_param=1.5)

    @pytest.mark.asyncio
    async def test_embedding_failure_fallback(self):
        """If embedding fails, should fall back to original order."""
        reranker = DiversityReranker(lambda_param=0.7, embedding_model="test-model")
        docs = _make_ranked_docs(3)

        with patch("app.services.llm_service.llm_service") as mock_llm:
            mock_llm.embed = AsyncMock(side_effect=Exception("Embedding API down"))
            result = await reranker.rerank(SAMPLE_QUERY, docs, top_k=3)

            assert len(result) == 3
            assert result[0]["id"] == "doc0"


# ---------------------------------------------------------------------------
# Cascade Reranker
# ---------------------------------------------------------------------------

class TestCascadeReranker:
    """Test that the cascade reranker reduces candidate count at each stage."""

    @pytest.mark.asyncio
    async def test_reduces_candidates_at_each_stage(self):
        """Each stage should pass fewer documents to the next."""
        # Stage 1: keep 5 out of 10
        stage1 = AsyncMock(spec=BaseReranker)
        stage1.rerank = AsyncMock(side_effect=lambda q, docs, top_k: docs[:top_k])

        # Stage 2: keep 3 out of 5
        stage2 = AsyncMock(spec=BaseReranker)
        stage2.rerank = AsyncMock(side_effect=lambda q, docs, top_k: docs[:top_k])

        reranker = CascadeReranker(stages=[(stage1, 5), (stage2, 3)])

        docs = _make_ranked_docs(10)
        result = await reranker.rerank(SAMPLE_QUERY, docs, top_k=3)

        # Stage 1 should receive all 10 docs
        stage1.rerank.assert_awaited_once()
        s1_args = stage1.rerank.call_args
        assert len(s1_args[0][1]) == 10  # documents argument
        assert s1_args[1]["top_k"] == 5

        # Stage 2 should receive only 5 docs
        stage2.rerank.assert_awaited_once()
        s2_args = stage2.rerank.call_args
        assert len(s2_args[0][1]) == 5
        assert s2_args[1]["top_k"] == 3

        # Final output should be 3 docs
        assert len(result) == 3

    @pytest.mark.asyncio
    async def test_stage_failure_passes_through(self):
        """If a stage fails, candidates from previous stage pass through."""
        stage1 = AsyncMock(spec=BaseReranker)
        stage1.rerank = AsyncMock(side_effect=lambda q, docs, top_k: docs[:top_k])

        stage2 = AsyncMock(spec=BaseReranker)
        stage2.rerank = AsyncMock(side_effect=Exception("Model crashed"))

        reranker = CascadeReranker(stages=[(stage1, 5), (stage2, 3)])

        docs = _make_ranked_docs(10)
        result = await reranker.rerank(SAMPLE_QUERY, docs, top_k=3)

        # Should still get results despite stage 2 failure
        assert len(result) == 3

    @pytest.mark.asyncio
    async def test_empty_input(self):
        reranker = CascadeReranker(stages=[])
        result = await reranker.rerank(SAMPLE_QUERY, [], top_k=5)
        assert result == []

    @pytest.mark.asyncio
    async def test_single_stage(self):
        stage = AsyncMock(spec=BaseReranker)
        stage.rerank = AsyncMock(side_effect=lambda q, docs, top_k: docs[:top_k])

        reranker = CascadeReranker(stages=[(stage, 3)])
        docs = _make_ranked_docs(8)
        result = await reranker.rerank(SAMPLE_QUERY, docs, top_k=3)

        assert len(result) == 3
        stage.rerank.assert_awaited_once()


# ---------------------------------------------------------------------------
# Contextual Reranker
# ---------------------------------------------------------------------------

class TestContextualReranker:
    """Test that the contextual reranker enriches text before delegating."""

    @pytest.mark.asyncio
    async def test_enriches_text_with_metadata(self):
        """Documents with metadata should have it prepended to their text."""
        mock_base = AsyncMock(spec=BaseReranker)

        # Capture deep copies of enriched docs (originals are mutated later)
        captured_texts = []

        async def capture_rerank(query, docs, top_k):
            captured_texts.extend(d["text"] for d in docs)
            return docs[:top_k]

        mock_base.rerank = AsyncMock(side_effect=capture_rerank)

        reranker = ContextualReranker(base_reranker=mock_base)

        docs = [
            {
                "id": "doc1",
                "text": "Original text about GDPR.",
                "metadata": {"source": "legal_db", "section": "Chapter 3", "page": "42"},
            },
        ]

        await reranker.rerank(SAMPLE_QUERY, docs, top_k=1)

        # The base reranker should have received enriched text
        assert len(captured_texts) == 1
        enriched_text = captured_texts[0]
        assert "source: legal_db" in enriched_text
        assert "section: Chapter 3" in enriched_text
        assert "page: 42" in enriched_text
        assert "Original text about GDPR." in enriched_text

    @pytest.mark.asyncio
    async def test_restores_original_text_in_output(self):
        """Output documents should have their original text restored."""
        mock_base = AsyncMock(spec=BaseReranker)

        async def passthrough_rerank(query, docs, top_k):
            return docs[:top_k]

        mock_base.rerank = AsyncMock(side_effect=passthrough_rerank)

        reranker = ContextualReranker(base_reranker=mock_base)

        original_text = "Original document text."
        docs = [
            {
                "id": "doc1",
                "text": original_text,
                "metadata": {"source": "test_source"},
            },
        ]

        result = await reranker.rerank(SAMPLE_QUERY, docs, top_k=1)

        assert result[0]["text"] == original_text

    @pytest.mark.asyncio
    async def test_no_metadata_passthrough(self):
        """Documents without metadata should pass through unchanged."""
        mock_base = AsyncMock(spec=BaseReranker)

        captured_docs = []

        async def capture_rerank(query, docs, top_k):
            captured_docs.extend(docs)
            return docs[:top_k]

        mock_base.rerank = AsyncMock(side_effect=capture_rerank)

        reranker = ContextualReranker(base_reranker=mock_base)

        docs = [{"id": "doc1", "text": "Plain text without metadata."}]

        await reranker.rerank(SAMPLE_QUERY, docs, top_k=1)

        # Text should be unchanged (no metadata to prepend)
        assert captured_docs[0]["text"] == "Plain text without metadata."

    @pytest.mark.asyncio
    async def test_custom_metadata_keys(self):
        """Only specified metadata keys should be included."""
        mock_base = AsyncMock(spec=BaseReranker)

        captured_texts = []

        async def capture_rerank(query, docs, top_k):
            captured_texts.extend(d["text"] for d in docs)
            return docs[:top_k]

        mock_base.rerank = AsyncMock(side_effect=capture_rerank)

        reranker = ContextualReranker(
            base_reranker=mock_base, metadata_keys=("source",)
        )

        docs = [
            {
                "id": "doc1",
                "text": "Some text.",
                "metadata": {"source": "wiki", "section": "Intro", "page": "1"},
            },
        ]

        await reranker.rerank(SAMPLE_QUERY, docs, top_k=1)

        enriched_text = captured_texts[0]
        assert "source: wiki" in enriched_text
        assert "section" not in enriched_text
        assert "page" not in enriched_text

    @pytest.mark.asyncio
    async def test_empty_input(self):
        mock_base = AsyncMock(spec=BaseReranker)
        reranker = ContextualReranker(base_reranker=mock_base)
        result = await reranker.rerank(SAMPLE_QUERY, [], top_k=5)
        assert result == []

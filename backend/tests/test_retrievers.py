"""
Tests for the new retrieval strategies.
Uses mock objects to avoid database and LLM dependencies.
"""
import asyncio
import math
from datetime import datetime, timezone, timedelta
from types import SimpleNamespace
from typing import List, Dict, Any, Optional
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest
import pytest_asyncio

from app.services.retrievers.base import BaseRetriever
from app.services.retrievers.ensemble_retriever import EnsembleRetriever
from app.services.retrievers.metadata_filter_retriever import MetadataFilterRetriever
from app.services.retrievers.time_weighted_retriever import TimeWeightedRetriever
from app.services.retrievers.sub_query_retriever import SubQueryRetriever
from app.services.retrievers.corrective_retriever import CorrectiveRetriever


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_chunk(
    text: str = "some text",
    chunk_id: Optional[UUID] = None,
    created_at: Optional[datetime] = None,
    metadata: Optional[dict] = None,
    file_type: Optional[str] = None,
):
    """Create a lightweight mock chunk object."""
    chunk = SimpleNamespace(
        id=chunk_id or uuid4(),
        text=text,
        created_at=created_at or datetime.now(timezone.utc),
        chunk_metadata=metadata or {},
    )
    if file_type:
        chunk.document = SimpleNamespace(file_type=file_type)
    return chunk


def _make_result(chunk, score: float = 0.8) -> Dict[str, Any]:
    return {"chunk": chunk, "score": score, "id": str(chunk.id)}


class StubRetriever(BaseRetriever):
    """A deterministic retriever that returns pre-set results."""

    def __init__(self, results: List[Dict[str, Any]]):
        self._results = results

    async def retrieve(self, query, top_k=10, document_id=None, **kwargs):
        return self._results[:top_k]


# ---------------------------------------------------------------------------
# Tests: EnsembleRetriever
# ---------------------------------------------------------------------------

class TestEnsembleRetriever:

    @pytest.mark.asyncio
    async def test_merges_results_from_multiple_retrievers(self):
        """Ensemble should combine results from all child retrievers."""
        c1 = _make_chunk(text="chunk A")
        c2 = _make_chunk(text="chunk B")
        c3 = _make_chunk(text="chunk C")

        r1 = StubRetriever([_make_result(c1, 0.9), _make_result(c2, 0.7)])
        r2 = StubRetriever([_make_result(c2, 0.8), _make_result(c3, 0.6)])

        ensemble = EnsembleRetriever(retrievers=[r1, r2])
        results = await ensemble.retrieve("test query", top_k=10)

        # All three unique chunks should appear
        result_ids = {r["id"] for r in results}
        assert str(c1.id) in result_ids
        assert str(c2.id) in result_ids
        assert str(c3.id) in result_ids

    @pytest.mark.asyncio
    async def test_deduplicates_by_chunk_id(self):
        """Ensemble should not return duplicate chunks."""
        c1 = _make_chunk(text="shared chunk")

        r1 = StubRetriever([_make_result(c1, 0.9)])
        r2 = StubRetriever([_make_result(c1, 0.8)])

        ensemble = EnsembleRetriever(retrievers=[r1, r2])
        results = await ensemble.retrieve("test", top_k=10)

        ids = [r["id"] for r in results]
        assert len(ids) == len(set(ids)), "Duplicate chunk IDs found"

    @pytest.mark.asyncio
    async def test_respects_top_k(self):
        chunks = [_make_chunk(text=f"c{i}") for i in range(10)]
        r1 = StubRetriever([_make_result(c) for c in chunks])
        ensemble = EnsembleRetriever(retrievers=[r1])
        results = await ensemble.retrieve("test", top_k=3)
        assert len(results) <= 3


# ---------------------------------------------------------------------------
# Tests: MetadataFilterRetriever
# ---------------------------------------------------------------------------

class TestMetadataFilterRetriever:

    @pytest.mark.asyncio
    async def test_filters_by_doc_type(self):
        """Only chunks matching the doc_type filter should be returned."""
        c_pdf = _make_chunk(text="pdf content", metadata={"doc_type": "pdf"})
        c_md = _make_chunk(text="markdown content", metadata={"doc_type": "md"})

        base = StubRetriever([_make_result(c_pdf), _make_result(c_md)])
        retriever = MetadataFilterRetriever(base, filters={"doc_type": "pdf"})

        results = await retriever.retrieve("test")

        for r in results:
            assert r["chunk"].chunk_metadata.get("doc_type") == "pdf"

    @pytest.mark.asyncio
    async def test_filters_by_min_chunk_size(self):
        """Chunks shorter than min_chunk_size should be filtered out."""
        c_short = _make_chunk(text="hi")
        c_long = _make_chunk(text="A" * 200)

        base = StubRetriever([_make_result(c_short), _make_result(c_long)])
        retriever = MetadataFilterRetriever(base, filters={"min_chunk_size": 50})

        results = await retriever.retrieve("test")

        for r in results:
            assert len(r["chunk"].text) >= 50

    @pytest.mark.asyncio
    async def test_no_filters_returns_all(self):
        """With no filters, all results should pass through."""
        chunks = [_make_chunk(text=f"c{i}") for i in range(5)]
        base = StubRetriever([_make_result(c) for c in chunks])
        retriever = MetadataFilterRetriever(base, filters={})

        results = await retriever.retrieve("test", top_k=10)
        assert len(results) == 5


# ---------------------------------------------------------------------------
# Tests: TimeWeightedRetriever
# ---------------------------------------------------------------------------

class TestTimeWeightedRetriever:

    @pytest.mark.asyncio
    async def test_boosts_recent_items(self):
        """More recent chunks should score higher (all else equal)."""
        now = datetime.now(timezone.utc)
        c_recent = _make_chunk(text="recent", created_at=now - timedelta(hours=1))
        c_old = _make_chunk(text="old", created_at=now - timedelta(hours=1000))

        # Same similarity score for both
        base = StubRetriever([
            _make_result(c_old, score=0.8),
            _make_result(c_recent, score=0.8),
        ])
        retriever = TimeWeightedRetriever(base, alpha=0.5, decay_rate=0.01)

        results = await retriever.retrieve("test", top_k=2)

        # The recent chunk should have a higher final score
        assert results[0]["chunk"].text == "recent"
        assert results[0]["score"] > results[1]["score"]

    @pytest.mark.asyncio
    async def test_alpha_one_ignores_recency(self):
        """With alpha=1.0, recency should have no effect."""
        now = datetime.now(timezone.utc)
        c_recent = _make_chunk(text="recent", created_at=now)
        c_old = _make_chunk(text="old", created_at=now - timedelta(hours=10000))

        base = StubRetriever([
            _make_result(c_old, score=0.9),
            _make_result(c_recent, score=0.5),
        ])
        retriever = TimeWeightedRetriever(base, alpha=1.0)

        results = await retriever.retrieve("test", top_k=2)

        # Pure similarity ordering
        assert results[0]["chunk"].text == "old"

    @pytest.mark.asyncio
    async def test_recency_decay_formula(self):
        """Verify the decay formula is applied correctly."""
        now = datetime.now(timezone.utc)
        hours_ago = 100
        c = _make_chunk(text="test", created_at=now - timedelta(hours=hours_ago))

        alpha = 0.7
        decay_rate = 0.01
        similarity = 0.8

        base = StubRetriever([_make_result(c, score=similarity)])
        retriever = TimeWeightedRetriever(base, alpha=alpha, decay_rate=decay_rate)

        results = await retriever.retrieve("test", top_k=1)

        expected_decay = math.exp(-decay_rate * hours_ago)
        expected_score = alpha * similarity + (1 - alpha) * expected_decay

        assert abs(results[0]["score"] - expected_score) < 0.05


# ---------------------------------------------------------------------------
# Tests: SubQueryRetriever
# ---------------------------------------------------------------------------

class TestSubQueryRetriever:

    @pytest.mark.asyncio
    async def test_decomposes_query_and_retrieves(self):
        """SubQueryRetriever should call LLM to decompose, then retrieve."""
        c1 = _make_chunk(text="answer part 1")
        c2 = _make_chunk(text="answer part 2")

        base = StubRetriever([_make_result(c1), _make_result(c2)])

        with patch(
            "app.services.retrievers.sub_query_retriever.llm_service"
        ) as mock_llm:
            mock_llm.generate = AsyncMock(
                return_value='["What is X?", "What is Y?"]'
            )

            retriever = SubQueryRetriever(base_retriever=base, model="test-model")
            results = await retriever.retrieve("What is X and Y?", top_k=5)

            # LLM should have been called once for decomposition
            mock_llm.generate.assert_called_once()

            # Should have results
            assert len(results) > 0

            # Metadata should record sub-queries
            for r in results:
                assert "sub_queries" in r.get("metadata", {})
                assert isinstance(r["metadata"]["sub_queries"], list)

    @pytest.mark.asyncio
    async def test_falls_back_on_invalid_llm_response(self):
        """If LLM returns invalid JSON, should fall back to original query."""
        c1 = _make_chunk(text="fallback result")
        base = StubRetriever([_make_result(c1)])

        with patch(
            "app.services.retrievers.sub_query_retriever.llm_service"
        ) as mock_llm:
            mock_llm.generate = AsyncMock(return_value="not valid json")

            retriever = SubQueryRetriever(base_retriever=base)
            results = await retriever.retrieve("complex question", top_k=5)

            # Should still return results (using original query as fallback)
            assert len(results) > 0


# ---------------------------------------------------------------------------
# Tests: CorrectiveRetriever
# ---------------------------------------------------------------------------

class TestCorrectiveRetriever:

    @pytest.mark.asyncio
    async def test_filters_irrelevant_chunks(self):
        """Chunks rated IRRELEVANT should be removed."""
        c_good = _make_chunk(text="relevant content")
        c_bad = _make_chunk(text="off-topic noise")

        base = StubRetriever([_make_result(c_good), _make_result(c_bad)])

        with patch(
            "app.services.retrievers.corrective_retriever.llm_service"
        ) as mock_llm:
            # First call rates "relevant content" as RELEVANT
            # Second call rates "off-topic noise" as IRRELEVANT
            mock_llm.generate = AsyncMock(
                side_effect=["RELEVANT", "IRRELEVANT"]
            )

            retriever = CorrectiveRetriever(base_retriever=base, model="test")
            results = await retriever.retrieve("find relevant info", top_k=5)

            # Only the relevant chunk should remain
            texts = [r["chunk"].text for r in results]
            assert "relevant content" in texts
            assert "off-topic noise" not in texts

    @pytest.mark.asyncio
    async def test_keeps_all_relevant_chunks(self):
        """All RELEVANT-rated chunks should be kept."""
        chunks = [_make_chunk(text=f"good {i}") for i in range(3)]
        base = StubRetriever([_make_result(c) for c in chunks])

        with patch(
            "app.services.retrievers.corrective_retriever.llm_service"
        ) as mock_llm:
            mock_llm.generate = AsyncMock(return_value="RELEVANT")

            retriever = CorrectiveRetriever(base_retriever=base)
            results = await retriever.retrieve("query", top_k=10)

            assert len(results) == 3

    @pytest.mark.asyncio
    async def test_handles_ambiguous_with_refinement(self):
        """AMBIGUOUS chunks should trigger a refined re-retrieval."""
        c1 = _make_chunk(text="ambiguous content")
        c2 = _make_chunk(text="refined result")

        # First retrieval returns c1; refined retrieval returns c2
        call_count = 0

        class TwoPhaseRetriever(BaseRetriever):
            async def retrieve(self, query, top_k=10, document_id=None, **kw):
                nonlocal call_count
                call_count += 1
                if call_count == 1:
                    return [_make_result(c1)]
                return [_make_result(c2)]

        with patch(
            "app.services.retrievers.corrective_retriever.llm_service"
        ) as mock_llm:
            mock_llm.generate = AsyncMock(return_value="AMBIGUOUS")

            retriever = CorrectiveRetriever(
                base_retriever=TwoPhaseRetriever(), model="test"
            )
            results = await retriever.retrieve("test query", top_k=5)

            # Should have attempted a second retrieval
            assert call_count == 2

    @pytest.mark.asyncio
    async def test_falls_back_when_all_irrelevant(self):
        """When all chunks are IRRELEVANT, broader search should be used."""
        c1 = _make_chunk(text="irrelevant")
        c2 = _make_chunk(text="broader fallback")

        call_count = 0

        class FallbackRetriever(BaseRetriever):
            async def retrieve(self, query, top_k=10, document_id=None, **kw):
                nonlocal call_count
                call_count += 1
                if call_count == 1:
                    return [_make_result(c1)]
                return [_make_result(c2)]

        with patch(
            "app.services.retrievers.corrective_retriever.llm_service"
        ) as mock_llm:
            mock_llm.generate = AsyncMock(return_value="IRRELEVANT")

            retriever = CorrectiveRetriever(
                base_retriever=FallbackRetriever(), model="test"
            )
            results = await retriever.retrieve("some query", top_k=5)

            # Should have triggered broader fallback
            assert call_count >= 2
            assert len(results) > 0

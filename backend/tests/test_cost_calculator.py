"""
Tests for the Cost Calculator service.
"""
import pytest

from app.services.cost_calculator import CostCalculator


@pytest.fixture
def calc():
    return CostCalculator()


class TestIngestionCost:
    """Test ingestion cost estimation."""

    def test_basic_ingestion(self, calc):
        result = calc.estimate_ingestion_cost(
            doc_char_count=10_000,
            chunk_size=500,
            overlap=50,
            embedding_model="text-embedding-3-small",
        )
        assert result["estimated_chunks"] > 0
        assert result["embedding_cost"] > 0
        assert result["contextual_chunking_cost"] == 0.0
        assert result["total_ingestion_cost"] == result["embedding_cost"]
        assert "breakdown" in result

    def test_contextual_chunking_adds_llm_cost(self, calc):
        without = calc.estimate_ingestion_cost(
            doc_char_count=10_000,
            chunk_size=500,
            overlap=50,
            embedding_model="text-embedding-3-small",
            contextual_chunking=False,
        )
        with_ctx = calc.estimate_ingestion_cost(
            doc_char_count=10_000,
            chunk_size=500,
            overlap=50,
            embedding_model="text-embedding-3-small",
            contextual_chunking=True,
            llm_model="gpt-4o-mini",
        )
        assert with_ctx["contextual_chunking_cost"] > 0
        assert with_ctx["total_ingestion_cost"] > without["total_ingestion_cost"]

    def test_estimated_chunks_scales_with_doc_size(self, calc):
        small = calc.estimate_ingestion_cost(
            doc_char_count=1_000,
            chunk_size=500,
            overlap=50,
            embedding_model="text-embedding-3-small",
        )
        large = calc.estimate_ingestion_cost(
            doc_char_count=100_000,
            chunk_size=500,
            overlap=50,
            embedding_model="text-embedding-3-small",
        )
        assert large["estimated_chunks"] > small["estimated_chunks"]

    def test_overlap_increases_chunk_count(self, calc):
        no_overlap = calc.estimate_ingestion_cost(
            doc_char_count=10_000,
            chunk_size=500,
            overlap=0,
            embedding_model="text-embedding-3-small",
        )
        with_overlap = calc.estimate_ingestion_cost(
            doc_char_count=10_000,
            chunk_size=500,
            overlap=200,
            embedding_model="text-embedding-3-small",
        )
        assert with_overlap["estimated_chunks"] > no_overlap["estimated_chunks"]

    def test_known_value_embedding_cost(self, calc):
        """Verify a hand-calculated example."""
        # 4_000_000 chars -> ~1_000_000 tokens at 4 chars/token
        # text-embedding-3-small costs $0.02 per 1M tokens
        result = calc.estimate_ingestion_cost(
            doc_char_count=4_000_000,
            chunk_size=500,
            overlap=0,
            embedding_model="text-embedding-3-small",
        )
        assert abs(result["embedding_cost"] - 0.02) < 0.001


class TestLocalModelsFreeCost:
    """Local embedding models should have zero cost."""

    @pytest.mark.parametrize(
        "model",
        ["all-MiniLM-L6-v2", "bge-m3", "nomic-embed-text-v1.5"],
    )
    def test_local_embedding_zero_cost(self, calc, model):
        result = calc.estimate_ingestion_cost(
            doc_char_count=100_000,
            chunk_size=500,
            overlap=50,
            embedding_model=model,
        )
        assert result["embedding_cost"] == 0.0

    @pytest.mark.parametrize(
        "model",
        ["all-MiniLM-L6-v2", "bge-m3", "nomic-embed-text-v1.5"],
    )
    def test_local_embedding_zero_query_cost(self, calc, model):
        result = calc.estimate_query_cost(
            embedding_model=model,
            llm_model="gpt-4o-mini",
        )
        assert result["embedding_cost_per_query"] == 0.0


class TestQueryCost:
    """Test per-query cost estimation."""

    def test_basic_query(self, calc):
        result = calc.estimate_query_cost(
            embedding_model="text-embedding-3-small",
            llm_model="gpt-4o-mini",
        )
        assert result["total_per_query"] > 0
        assert result["monthly_estimate_1000_queries"] == pytest.approx(
            result["total_per_query"] * 1000, rel=1e-3
        )
        assert result["monthly_estimate_10000_queries"] == pytest.approx(
            result["total_per_query"] * 10000, rel=1e-3
        )

    def test_reranking_adds_cost(self, calc):
        without = calc.estimate_query_cost(
            embedding_model="text-embedding-3-small",
            llm_model="gpt-4o-mini",
            use_reranking=False,
        )
        with_rerank = calc.estimate_query_cost(
            embedding_model="text-embedding-3-small",
            llm_model="gpt-4o-mini",
            use_reranking=True,
        )
        assert with_rerank["reranking_cost"] > 0
        assert with_rerank["total_per_query"] > without["total_per_query"]

    def test_hyde_adds_cost(self, calc):
        without = calc.estimate_query_cost(
            embedding_model="text-embedding-3-small",
            llm_model="gpt-4o-mini",
            use_hyde=False,
        )
        with_hyde = calc.estimate_query_cost(
            embedding_model="text-embedding-3-small",
            llm_model="gpt-4o-mini",
            use_hyde=True,
        )
        assert with_hyde["hyde_cost"] > 0
        assert with_hyde["total_per_query"] > without["total_per_query"]

    def test_multi_query_adds_cost(self, calc):
        without = calc.estimate_query_cost(
            embedding_model="text-embedding-3-small",
            llm_model="gpt-4o-mini",
            use_multi_query=False,
        )
        with_mq = calc.estimate_query_cost(
            embedding_model="text-embedding-3-small",
            llm_model="gpt-4o-mini",
            use_multi_query=True,
        )
        assert with_mq["multi_query_cost"] > 0
        assert with_mq["total_per_query"] > without["total_per_query"]

    def test_more_expensive_llm_costs_more(self, calc):
        cheap = calc.estimate_query_cost(
            embedding_model="text-embedding-3-small",
            llm_model="gpt-4o-mini",
        )
        expensive = calc.estimate_query_cost(
            embedding_model="text-embedding-3-small",
            llm_model="gpt-4o",
        )
        assert expensive["llm_cost_per_query"] > cheap["llm_cost_per_query"]


class TestCompareCosts:
    """Test cost comparison across configs."""

    def test_compare_returns_correct_count(self, calc):
        configs = [
            {"embedding_model": "text-embedding-3-small", "llm_model": "gpt-4o-mini"},
            {"embedding_model": "all-MiniLM-L6-v2", "llm_model": "gpt-4o"},
        ]
        results = calc.compare_costs(configs, doc_char_count=10_000)
        assert len(results) == 2

    def test_compare_has_ingestion_and_query(self, calc):
        configs = [
            {"embedding_model": "text-embedding-3-small", "llm_model": "gpt-4o-mini"},
        ]
        results = calc.compare_costs(configs, doc_char_count=10_000)
        assert "ingestion" in results[0]
        assert "query" in results[0]
        assert "label" in results[0]

    def test_local_cheaper_than_api(self, calc):
        configs = [
            {
                "label": "api",
                "embedding_model": "text-embedding-3-large",
                "llm_model": "gpt-4o",
            },
            {
                "label": "local",
                "embedding_model": "all-MiniLM-L6-v2",
                "llm_model": "gpt-4o-mini",
            },
        ]
        results = calc.compare_costs(configs, doc_char_count=50_000)
        api_total = results[0]["ingestion"]["total_ingestion_cost"]
        local_total = results[1]["ingestion"]["total_ingestion_cost"]
        assert local_total < api_total

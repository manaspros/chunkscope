"""
Tests for Strategy Guide, Decision Engine, and Guide API endpoints.
"""
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.services.strategy_guide import StrategyGuide, StrategyInfo, strategy_guide
from app.services.decision_engine import DecisionEngine, decision_engine


# =========================================================================
# Strategy Guide unit tests
# =========================================================================

class TestStrategyGuide:
    """Tests for the StrategyGuide knowledge base."""

    def test_all_strategies_non_empty(self):
        strategies = strategy_guide.all_strategies()
        assert len(strategies) > 0

    def test_expected_strategy_count(self):
        """We expect 8 chunking + 18 retrieval + 13 reranking = 39 strategies."""
        strategies = strategy_guide.all_strategies()
        assert len(strategies) == 39, (
            "Expected 39 strategies, got {}".format(len(strategies))
        )

    def test_all_strategies_have_complete_info(self):
        """Every strategy must have all fields populated (no empty strings or lists)."""
        for s in strategy_guide.all_strategies():
            assert s.id, "Strategy missing id"
            assert s.name, "Strategy {} missing name".format(s.id)
            assert s.category in ("chunking", "retrieval", "reranking"), (
                "Strategy {} has invalid category: {}".format(s.id, s.category)
            )
            assert s.summary, "Strategy {} missing summary".format(s.id)
            assert len(s.when_to_use) > 0, "Strategy {} has empty when_to_use".format(s.id)
            assert len(s.when_not_to_use) > 0, "Strategy {} has empty when_not_to_use".format(s.id)
            assert len(s.best_for) > 0, "Strategy {} has empty best_for".format(s.id)
            assert s.complexity in ("simple", "moderate", "advanced"), (
                "Strategy {} has invalid complexity: {}".format(s.id, s.complexity)
            )
            assert s.latency in ("fast", "moderate", "slow"), (
                "Strategy {} has invalid latency: {}".format(s.id, s.latency)
            )
            assert s.cost in ("free", "low", "moderate", "high"), (
                "Strategy {} has invalid cost: {}".format(s.id, s.cost)
            )
            assert s.accuracy_tier in ("baseline", "good", "excellent", "state-of-art"), (
                "Strategy {} has invalid accuracy_tier: {}".format(s.id, s.accuracy_tier)
            )
            assert isinstance(s.requires_llm, bool)
            assert isinstance(s.requires_gpu, bool)
            assert len(s.pairs_well_with) > 0, "Strategy {} has empty pairs_well_with".format(s.id)
            assert isinstance(s.example_config, dict), "Strategy {} example_config is not a dict".format(s.id)
            assert len(s.decision_factors) > 0, "Strategy {} has empty decision_factors".format(s.id)
            assert s.tradeoffs, "Strategy {} missing tradeoffs".format(s.id)
            assert s.pro_tip, "Strategy {} missing pro_tip".format(s.id)

    def test_category_counts(self):
        chunking = strategy_guide.by_category("chunking")
        retrieval = strategy_guide.by_category("retrieval")
        reranking = strategy_guide.by_category("reranking")
        assert len(chunking) == 8
        assert len(retrieval) == 18
        assert len(reranking) == 13

    def test_get_existing_strategy(self):
        info = strategy_guide.get("hybrid")
        assert info is not None
        assert info.name == "Hybrid Search (Dense + BM25)"
        assert info.category == "retrieval"

    def test_get_nonexistent_strategy(self):
        info = strategy_guide.get("nonexistent_xyz")
        assert info is None

    def test_by_category_invalid(self):
        result = strategy_guide.by_category("quantum")
        assert result == []

    def test_get_pairs_returns_strategies(self):
        pairs = strategy_guide.get_pairs("hybrid")
        assert len(pairs) > 0
        # All pairs should be valid StrategyInfo objects
        for p in pairs:
            assert isinstance(p, StrategyInfo)

    def test_get_pairs_nonexistent(self):
        pairs = strategy_guide.get_pairs("nonexistent_xyz")
        assert pairs == []

    def test_compare_returns_requested_strategies(self):
        result = strategy_guide.compare(["hybrid", "dense", "mmr"])
        assert len(result) == 3
        ids = {s.id for s in result}
        assert ids == {"hybrid", "dense", "mmr"}

    def test_compare_skips_unknown(self):
        result = strategy_guide.compare(["hybrid", "nonexistent_xyz"])
        assert len(result) == 1
        assert result[0].id == "hybrid"

    def test_unique_ids(self):
        """All strategy IDs must be unique."""
        ids = [s.id for s in strategy_guide.all_strategies()]
        assert len(ids) == len(set(ids)), "Duplicate strategy IDs found"


# =========================================================================
# Decision Engine unit tests
# =========================================================================

class TestDecisionEngine:
    """Tests for the DecisionEngine."""

    def test_recommend_pipeline_returns_all_stages(self):
        result = decision_engine.recommend_pipeline()
        assert "chunking" in result
        assert "embedding" in result
        assert "retrieval" in result
        assert "reranking" in result
        assert "post_processing" in result
        assert "estimated_cost_per_query" in result
        assert "estimated_latency" in result

    def test_recommend_pipeline_has_reasons(self):
        result = decision_engine.recommend_pipeline()
        assert "reason" in result["chunking"]
        assert "reason" in result["embedding"]
        assert "reason" in result["retrieval"]
        assert "reason" in result["reranking"]
        assert "reason" in result["post_processing"]

    def test_recommend_legal_docs(self):
        result = decision_engine.recommend_pipeline(doc_type="legal")
        assert result["chunking"]["method"] == "semantic"

    def test_recommend_code_docs(self):
        result = decision_engine.recommend_pipeline(doc_type="code")
        assert result["chunking"]["method"] == "code_aware"

    def test_recommend_speed_priority(self):
        result = decision_engine.recommend_pipeline(priority="speed")
        assert result["chunking"]["method"] == "recursive"
        assert result["retrieval"]["strategy"] == "dense"
        assert result["reranking"]["strategy"] == "flashrank"

    def test_recommend_free_budget(self):
        result = decision_engine.recommend_pipeline(budget="free")
        assert result["embedding"]["model"] == "all-MiniLM-L6-v2"

    def test_recommend_unlimited_budget_accuracy(self):
        result = decision_engine.recommend_pipeline(
            budget="unlimited", priority="accuracy"
        )
        assert result["chunking"]["method"] == "contextual"
        assert result["reranking"]["strategy"] == "listwise_llm"

    def test_recommend_multi_hop_queries(self):
        result = decision_engine.recommend_pipeline(query_type="multi-hop")
        assert result["retrieval"]["strategy"] == "sub_query"

    def test_recommend_large_corpus_with_metadata(self):
        result = decision_engine.recommend_pipeline(
            corpus_size="large", has_metadata=True
        )
        assert result["retrieval"]["strategy"] == "metadata_filter"

    def test_recommend_returns_valid_strategies(self):
        """All recommended strategies should exist in the strategy guide."""
        result = decision_engine.recommend_pipeline()
        # Chunking and retrieval methods should be known
        chunking_method = result["chunking"]["method"]
        retrieval_strategy = result["retrieval"]["strategy"]
        reranking_strategy = result["reranking"]["strategy"]

        all_ids = {s.id for s in strategy_guide.all_strategies()}
        assert chunking_method in all_ids, "{} not in strategy guide".format(chunking_method)
        assert retrieval_strategy in all_ids, "{} not in strategy guide".format(retrieval_strategy)
        assert reranking_strategy in all_ids, "{} not in strategy guide".format(reranking_strategy)

    def test_cost_estimate_format(self):
        result = decision_engine.recommend_pipeline()
        cost = result["estimated_cost_per_query"]
        assert cost.startswith("<$") or cost.startswith("~$")

    def test_latency_estimate_format(self):
        result = decision_engine.recommend_pipeline()
        latency = result["estimated_latency"]
        assert latency.startswith("~") and latency.endswith("ms")

    def test_decision_tree_chunking(self):
        tree = decision_engine.get_decision_tree("chunking")
        assert "question" in tree
        assert "options" in tree
        assert len(tree["options"]) > 0

    def test_decision_tree_retrieval(self):
        tree = decision_engine.get_decision_tree("retrieval")
        assert "question" in tree
        assert "options" in tree

    def test_decision_tree_reranking(self):
        tree = decision_engine.get_decision_tree("reranking")
        assert "question" in tree
        assert "options" in tree

    def test_decision_tree_invalid_category(self):
        with pytest.raises(ValueError):
            decision_engine.get_decision_tree("quantum")

    def test_decision_tree_leaf_nodes_have_recommendation(self):
        """Every leaf node in the tree should have a recommendation and reason."""
        for category in ("chunking", "retrieval", "reranking"):
            tree = decision_engine.get_decision_tree(category)
            self._check_tree_node(tree, category)

    def _check_tree_node(self, node: dict, path: str):
        if "recommendation" in node:
            assert "reason" in node, "Node at {} missing reason".format(path)
            assert node["recommendation"], "Empty recommendation at {}".format(path)
            assert node["reason"], "Empty reason at {}".format(path)
        elif "options" in node:
            assert "question" in node, "Non-leaf node at {} missing question".format(path)
            for key, child in node["options"].items():
                self._check_tree_node(child, "{} -> {}".format(path, key))


# =========================================================================
# API endpoint tests
# =========================================================================

@pytest_asyncio.fixture
async def guide_client():
    """Async test client for guide API endpoints."""
    from app.main import create_app

    app = create_app()
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        yield client


class TestGuideAPI:
    """Tests for the /api/v1/guide endpoints."""

    @pytest.mark.asyncio
    async def test_list_all_strategies(self, guide_client):
        resp = await guide_client.get("/api/v1/guide/strategies")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 39
        assert len(data["strategies"]) == 39

    @pytest.mark.asyncio
    async def test_list_strategies_by_category(self, guide_client):
        resp = await guide_client.get("/api/v1/guide/strategies?category=chunking")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 8
        for s in data["strategies"]:
            assert s["category"] == "chunking"

    @pytest.mark.asyncio
    async def test_list_strategies_invalid_category(self, guide_client):
        resp = await guide_client.get("/api/v1/guide/strategies?category=quantum")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_get_strategy(self, guide_client):
        resp = await guide_client.get("/api/v1/guide/strategies/hybrid")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == "hybrid"
        assert data["category"] == "retrieval"

    @pytest.mark.asyncio
    async def test_get_strategy_not_found(self, guide_client):
        resp = await guide_client.get("/api/v1/guide/strategies/nonexistent")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_get_pairs(self, guide_client):
        resp = await guide_client.get("/api/v1/guide/strategies/hybrid/pairs")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] > 0

    @pytest.mark.asyncio
    async def test_get_pairs_not_found(self, guide_client):
        resp = await guide_client.get("/api/v1/guide/strategies/nonexistent/pairs")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_compare_strategies(self, guide_client):
        resp = await guide_client.get("/api/v1/guide/compare?ids=hybrid,dense,mmr")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["strategies"]) == 3

    @pytest.mark.asyncio
    async def test_compare_too_few(self, guide_client):
        resp = await guide_client.get("/api/v1/guide/compare?ids=hybrid")
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_compare_not_found(self, guide_client):
        resp = await guide_client.get("/api/v1/guide/compare?ids=hybrid,nonexistent")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_recommend_pipeline(self, guide_client):
        resp = await guide_client.post(
            "/api/v1/guide/recommend",
            json={
                "doc_type": "legal",
                "corpus_size": "medium",
                "query_type": "factoid",
                "priority": "accuracy",
                "has_metadata": False,
                "has_gpu": False,
                "budget": "moderate",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "chunking" in data
        assert "embedding" in data
        assert "retrieval" in data
        assert "reranking" in data
        assert "estimated_cost_per_query" in data

    @pytest.mark.asyncio
    async def test_recommend_pipeline_defaults(self, guide_client):
        resp = await guide_client.post("/api/v1/guide/recommend", json={})
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_decision_tree(self, guide_client):
        for category in ("chunking", "retrieval", "reranking"):
            resp = await guide_client.get(
                "/api/v1/guide/decision-tree/{}".format(category)
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data["category"] == category
            assert "question" in data["tree"]
            assert "options" in data["tree"]

    @pytest.mark.asyncio
    async def test_decision_tree_invalid(self, guide_client):
        resp = await guide_client.get("/api/v1/guide/decision-tree/quantum")
        assert resp.status_code == 400

"""
Strategy Guide API
Endpoints for strategy information, pipeline recommendations, and decision trees.
"""
from dataclasses import asdict

from fastapi import APIRouter, HTTPException, Query

from app.schemas.guide_schemas import (
    DecisionTreeResponse,
    PipelineRecommendationResponse,
    RecommendRequest,
    StrategyCompareResponse,
    StrategyInfoResponse,
    StrategyListResponse,
)
from app.services.decision_engine import decision_engine
from app.services.strategy_guide import strategy_guide

router = APIRouter(prefix="/guide", tags=["Strategy Guide"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _to_response(info) -> StrategyInfoResponse:
    return StrategyInfoResponse(**asdict(info))


# ---------------------------------------------------------------------------
# Strategy endpoints
# ---------------------------------------------------------------------------

@router.get("/strategies", response_model=StrategyListResponse)
async def list_strategies(category: str | None = Query(default=None, description="Filter by category: chunking, retrieval, reranking")):
    """List all strategies, optionally filtered by category."""
    if category:
        strategies = strategy_guide.by_category(category)
        if not strategies:
            raise HTTPException(
                status_code=404,
                detail="No strategies found for category '{}'. Valid categories: chunking, retrieval, reranking".format(category),
            )
    else:
        strategies = strategy_guide.all_strategies()

    return StrategyListResponse(
        strategies=[_to_response(s) for s in strategies],
        total=len(strategies),
    )


@router.get("/strategies/{strategy_id}", response_model=StrategyInfoResponse)
async def get_strategy(strategy_id: str):
    """Get detailed info for a single strategy."""
    info = strategy_guide.get(strategy_id)
    if info is None:
        raise HTTPException(status_code=404, detail="Strategy '{}' not found".format(strategy_id))
    return _to_response(info)


@router.get("/strategies/{strategy_id}/pairs", response_model=StrategyListResponse)
async def get_pairs(strategy_id: str):
    """Get strategies that pair well with the given one."""
    info = strategy_guide.get(strategy_id)
    if info is None:
        raise HTTPException(status_code=404, detail="Strategy '{}' not found".format(strategy_id))
    pairs = strategy_guide.get_pairs(strategy_id)
    return StrategyListResponse(
        strategies=[_to_response(s) for s in pairs],
        total=len(pairs),
    )


@router.get("/compare", response_model=StrategyCompareResponse)
async def compare_strategies(ids: str = Query(..., description="Comma-separated strategy IDs to compare (2-3)")):
    """Compare 2-3 strategies side by side."""
    id_list = [s.strip() for s in ids.split(",") if s.strip()]
    if len(id_list) < 2 or len(id_list) > 3:
        raise HTTPException(status_code=400, detail="Provide 2 or 3 strategy IDs separated by commas")

    strategies = strategy_guide.compare(id_list)
    missing = set(id_list) - {s.id for s in strategies}
    if missing:
        raise HTTPException(status_code=404, detail="Strategies not found: {}".format(", ".join(sorted(missing))))

    return StrategyCompareResponse(
        strategies=[_to_response(s) for s in strategies],
    )


# ---------------------------------------------------------------------------
# Recommendation endpoint
# ---------------------------------------------------------------------------

@router.post("/recommend", response_model=PipelineRecommendationResponse)
async def recommend_pipeline(request: RecommendRequest):
    """Get a pipeline recommendation based on requirements."""
    result = decision_engine.recommend_pipeline(
        doc_type=request.doc_type,
        corpus_size=request.corpus_size,
        query_type=request.query_type,
        priority=request.priority,
        has_metadata=request.has_metadata,
        has_gpu=request.has_gpu,
        budget=request.budget,
    )
    return PipelineRecommendationResponse(**result)


# ---------------------------------------------------------------------------
# Decision tree endpoint
# ---------------------------------------------------------------------------

@router.get("/decision-tree/{category}", response_model=DecisionTreeResponse)
async def get_decision_tree(category: str):
    """Get decision tree for a category (chunking, retrieval, reranking)."""
    try:
        tree = decision_engine.get_decision_tree(category)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return DecisionTreeResponse(category=category, tree=tree)

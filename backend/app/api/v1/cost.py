"""
Cost Calculator API Endpoints
"""
from fastapi import APIRouter

from app.schemas.cost_schemas import (
    CompareCostRequest,
    CompareCostResponse,
    IngestionCostRequest,
    IngestionCostResponse,
    PricingResponse,
    QueryCostRequest,
    QueryCostResponse,
)
from app.services.cost_calculator import CostCalculator

router = APIRouter(prefix="/cost", tags=["Cost Calculator"])

_calculator = CostCalculator()


@router.post("/estimate-ingestion", response_model=IngestionCostResponse)
async def estimate_ingestion(req: IngestionCostRequest) -> IngestionCostResponse:
    """Estimate the dollar cost of ingesting a document."""
    result = _calculator.estimate_ingestion_cost(
        doc_char_count=req.doc_char_count,
        chunk_size=req.chunk_size,
        overlap=req.overlap,
        embedding_model=req.embedding_model,
        contextual_chunking=req.contextual_chunking,
        llm_model=req.llm_model,
    )
    return IngestionCostResponse(**result)


@router.post("/estimate-query", response_model=QueryCostResponse)
async def estimate_query(req: QueryCostRequest) -> QueryCostResponse:
    """Estimate the per-query cost for the given pipeline configuration."""
    result = _calculator.estimate_query_cost(
        embedding_model=req.embedding_model,
        llm_model=req.llm_model,
        top_k=req.top_k,
        avg_chunk_tokens=req.avg_chunk_tokens,
        use_reranking=req.use_reranking,
        use_hyde=req.use_hyde,
        use_multi_query=req.use_multi_query,
    )
    return QueryCostResponse(**result)


@router.post("/compare", response_model=CompareCostResponse)
async def compare_costs(req: CompareCostRequest) -> CompareCostResponse:
    """Compare ingestion + query costs across multiple pipeline configurations."""
    configs = [c.model_dump() for c in req.configs]
    results = _calculator.compare_costs(configs=configs, doc_char_count=req.doc_char_count)
    return CompareCostResponse(results=results)


@router.get("/pricing", response_model=PricingResponse)
async def get_pricing() -> PricingResponse:
    """Return current pricing data for all supported models."""
    return PricingResponse(
        embedding_costs=CostCalculator.EMBEDDING_COSTS,
        llm_costs=CostCalculator.LLM_COSTS,
    )

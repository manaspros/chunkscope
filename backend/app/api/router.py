"""
Main API Router Aggregator
Combines all API routers under /api/v1 prefix
"""
from fastapi import APIRouter

from app.api.v1 import (
    health_router,
    analysis_router,
    cost_router,
    documents_router,
    chunks_router,
    embeddings_router,
    evaluation_api_router,
    evaluations_router,
    export_router,
    guide_router,
    config_router,
    pipelines_router,
    presets_router,
    preview_router,
    pipeline_routes,
    projects_router,
    query_router,
    rerank_router,
    suggestions_router,
)

# Main API router
api_router = APIRouter(prefix="/api/v1")

# Include all v1 routers
api_router.include_router(health_router, tags=["health"])
api_router.include_router(analysis_router)
api_router.include_router(pipelines_router)
api_router.include_router(presets_router)
api_router.include_router(preview_router)
api_router.include_router(pipeline_routes, prefix="/pipeline", tags=["Pipeline Execution"])
api_router.include_router(documents_router, tags=["documents"])
api_router.include_router(chunks_router, tags=["chunks"])
api_router.include_router(evaluations_router, tags=["evaluations"])
api_router.include_router(query_router, tags=["query"])
api_router.include_router(config_router, tags=["config"])
api_router.include_router(rerank_router, prefix="/rerank", tags=["Reranking"])
api_router.include_router(evaluation_api_router, tags=["Evaluation Metrics"])
api_router.include_router(embeddings_router, tags=["Embedding Models"])
api_router.include_router(suggestions_router, tags=["Suggestions"])
api_router.include_router(export_router, tags=["Code Export"])
api_router.include_router(cost_router, tags=["Cost Calculator"])
api_router.include_router(projects_router, tags=["Projects"])
api_router.include_router(guide_router, tags=["Strategy Guide"])

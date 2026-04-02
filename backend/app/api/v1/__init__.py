"""
V1 Router Exports
"""
from app.api.v1.analysis import router as analysis_router
from app.api.v1.chunks import router as chunks_router
from app.api.v1.config import router as config_router
from app.api.v1.cost import router as cost_router
from app.api.v1.documents import router as documents_router
from app.api.v1.embeddings import router as embeddings_router
from app.api.v1.evaluation_api import router as evaluation_api_router
from app.api.v1.evaluations import router as evaluations_router
from app.api.v1.export import router as export_router
from app.api.v1.health import router as health_router
from app.api.v1.pipeline_routes import router as pipeline_routes
from app.api.v1.pipelines import router as pipelines_router
from app.api.v1.presets import router as presets_router
from app.api.v1.preview import router as preview_router
from app.api.v1.rerank import router as rerank_router
from app.api.v1.query import router as query_router
from app.api.v1.guide import router as guide_router
from app.api.v1.suggestions import router as suggestions_router
from app.api.v1.projects import router as projects_router

__all__ = [
    "analysis_router",
    "chunks_router",
    "config_router",
    "cost_router",
    "documents_router",
    "embeddings_router",
    "evaluation_api_router",
    "evaluations_router",
    "export_router",
    "guide_router",
    "health_router",
    "pipeline_routes",
    "pipelines_router",
    "presets_router",
    "preview_router",
    "projects_router",
    "query_router",
    "rerank_router",
    "suggestions_router",
]

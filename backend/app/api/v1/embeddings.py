"""
Embedding Model Registry API
Endpoints for browsing, comparing, and getting recommendations for embedding models.
"""
from fastapi import APIRouter, HTTPException

from app.core.logging import get_logger
from app.schemas.embedding_schemas import (
    CompareRequest,
    CompareResponse,
    EmbeddingModelInfo,
    EmbeddingModelsListResponse,
    RecommendRequest,
    RecommendResponse,
)
from app.services.embedding_registry import embedding_registry

logger = get_logger(__name__)
router = APIRouter(prefix="/embeddings", tags=["Embedding Models"])


@router.get("/models", response_model=EmbeddingModelsListResponse)
async def list_models():
    """List all embedding models in the registry."""
    models = embedding_registry.get_all_models()
    return EmbeddingModelsListResponse(
        models=[EmbeddingModelInfo(**m) for m in models],
        total=len(models),
    )


@router.get("/models/{model_id}", response_model=EmbeddingModelInfo)
async def get_model(model_id: str):
    """Get details for a specific embedding model."""
    model = embedding_registry.get_model(model_id)
    if model is None:
        raise HTTPException(status_code=404, detail=f"Model '{model_id}' not found")
    return EmbeddingModelInfo(**model)


@router.post("/recommend", response_model=RecommendResponse)
async def recommend_model(request: RecommendRequest):
    """Recommend embedding models for a given document type."""
    ranked = embedding_registry.recommend_for_document_type(request.doc_type)
    return RecommendResponse(
        doc_type=request.doc_type,
        recommendations=[EmbeddingModelInfo(**m) for m in ranked],
    )


@router.post("/compare", response_model=CompareResponse)
async def compare_models(request: CompareRequest):
    """Compare selected embedding models side by side."""
    models = embedding_registry.compare_models(request.model_ids)
    if not models:
        raise HTTPException(status_code=404, detail="None of the requested model IDs were found")
    return CompareResponse(models=[EmbeddingModelInfo(**m) for m in models])

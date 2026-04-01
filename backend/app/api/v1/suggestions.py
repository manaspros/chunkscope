"""
Suggestion API
Endpoints for AI-powered RAG configuration recommendations.
"""
from dataclasses import asdict

from fastapi import APIRouter, HTTPException

from app.core.logging import get_logger
from app.schemas.suggestion_schemas import (
    DocumentProfileResponse,
    ExplainRequest,
    ProfileRequest,
    RecommendationResponse,
    RecommendRequest,
    SuggestionResultResponse,
)
from app.services.suggestions import suggestion_service
from app.services.suggestions.document_profiler import DocumentProfile
from app.services.suggestions.strategy_recommender import Recommendation

logger = get_logger(__name__)
router = APIRouter(prefix="/suggest", tags=["Suggestions"])


def _profile_to_response(profile: DocumentProfile) -> DocumentProfileResponse:
    """Convert a DocumentProfile dataclass to a Pydantic response model."""
    return DocumentProfileResponse(**asdict(profile))


def _recommendation_to_response(rec: Recommendation) -> RecommendationResponse:
    """Convert a Recommendation dataclass to a Pydantic response model."""
    return RecommendationResponse(**asdict(rec))


def _response_to_profile(resp: DocumentProfileResponse) -> DocumentProfile:
    """Convert a DocumentProfileResponse back to a DocumentProfile dataclass."""
    return DocumentProfile(**resp.model_dump())


def _response_to_recommendation(resp: RecommendationResponse) -> Recommendation:
    """Convert a RecommendationResponse back to a Recommendation dataclass."""
    return Recommendation(**resp.model_dump())


@router.post("/profile", response_model=DocumentProfileResponse)
async def profile_document(request: ProfileRequest):
    """
    Profile a document and return detailed metrics.

    Accepts raw text and an optional pre-classified document type.
    If doc_type is not provided, it will be auto-detected.
    """
    try:
        profile = suggestion_service.profile(request.text, request.doc_type)
        return _profile_to_response(profile)
    except Exception as e:
        logger.error("profile_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"Profiling failed: {e}")


@router.post("/recommend", response_model=SuggestionResultResponse)
async def recommend_configuration(request: RecommendRequest):
    """
    Get RAG configuration recommendations.

    Accepts either raw text (which will be profiled first) or a
    previously computed document profile.
    """
    if request.profile is not None:
        profile = _response_to_profile(request.profile)
    elif request.text is not None:
        profile = suggestion_service.profile(request.text, request.doc_type)
    else:
        raise HTTPException(
            status_code=422,
            detail="Either 'text' or 'profile' must be provided.",
        )

    try:
        result = suggestion_service.recommend(profile)
        return SuggestionResultResponse(
            primary=_recommendation_to_response(result.primary),
            alternatives=[
                _recommendation_to_response(alt) for alt in result.alternatives
            ],
            document_profile=_profile_to_response(result.document_profile),
        )
    except Exception as e:
        logger.error("recommend_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"Recommendation failed: {e}")


@router.post("/explain", response_model=dict)
async def explain_recommendation(request: ExplainRequest):
    """
    Get an LLM-generated explanation for a recommendation.

    Requires both a document profile and a recommendation.
    """
    profile = _response_to_profile(request.profile)
    recommendation = _response_to_recommendation(request.recommendation)

    try:
        explanation = await suggestion_service.explain(profile, recommendation)
        return {"explanation": explanation}
    except Exception as e:
        logger.error("explain_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"Explanation failed: {e}")

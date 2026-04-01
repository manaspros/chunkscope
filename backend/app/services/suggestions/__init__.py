"""
Suggestion Engine
Analyzes documents and recommends optimal RAG configurations.
"""
from app.services.suggestions.document_profiler import (
    DocumentProfile,
    DocumentProfiler,
    document_profiler,
)
from app.services.suggestions.explanation_service import (
    ExplanationService,
    explanation_service,
)
from app.services.suggestions.strategy_recommender import (
    Recommendation,
    StrategyRecommender,
    SuggestionResult,
    strategy_recommender,
)


class SuggestionService:
    """
    Facade that combines document profiling, strategy recommendation,
    and LLM-powered explanations into a single service.
    """

    def __init__(self):
        self.profiler = document_profiler
        self.recommender = strategy_recommender
        self.explainer = explanation_service

    def profile(self, text: str, doc_type: str | None = None) -> DocumentProfile:
        """Profile a document."""
        return self.profiler.profile(text, doc_type)

    def recommend(self, profile: DocumentProfile) -> SuggestionResult:
        """Get RAG configuration recommendations for a document profile."""
        return self.recommender.recommend(profile)

    async def explain(
        self, profile: DocumentProfile, recommendation: Recommendation
    ) -> str:
        """Get an LLM-generated explanation for a recommendation."""
        return await self.explainer.explain(profile, recommendation)


# Singleton
suggestion_service = SuggestionService()

__all__ = [
    "DocumentProfile",
    "DocumentProfiler",
    "ExplanationService",
    "Recommendation",
    "StrategyRecommender",
    "SuggestionResult",
    "SuggestionService",
    "document_profiler",
    "explanation_service",
    "strategy_recommender",
    "suggestion_service",
]

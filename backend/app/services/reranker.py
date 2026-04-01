import logging
from typing import List, Dict, Any, Optional
from app.services.rerankers.base import BaseReranker
from app.services.rerankers.cohere_reranker import CohereReranker
from app.services.rerankers.cross_encoder_reranker import CrossEncoderReranker
from app.services.rerankers.rrf_reranker import ReciprocalRankFusionReranker
from app.services.rerankers.llm_reranker import LLMReranker

logger = logging.getLogger(__name__)

class RerankerService:
    """
    Factory service for obtaining reranker instances.
    """

    def get_reranker(
        self,
        provider: str = "cohere",
        model: str = "rerank-english-v3.0",
        **kwargs
    ) -> BaseReranker:
        """
        Get a reranker instance based on the provider.
        """
        if provider == "cohere":
            return CohereReranker(model=model, **kwargs)
        elif provider == "cross-encoder":
            return CrossEncoderReranker(model_name=model)
        elif provider == "rrf":
            k = kwargs.get("k", 60)
            return ReciprocalRankFusionReranker(k=k)
        elif provider == "llm":
            return LLMReranker(model=model)
        else:
            logger.error(f"Unsupported reranker provider: {provider}")
            raise ValueError(f"Unsupported reranker provider: {provider}")

reranker_service = RerankerService()

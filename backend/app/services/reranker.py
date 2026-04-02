import logging
from typing import List, Dict, Any, Optional
from app.services.rerankers.base import BaseReranker
from app.services.rerankers.cohere_reranker import CohereReranker
from app.services.rerankers.cross_encoder_reranker import CrossEncoderReranker
from app.services.rerankers.rrf_reranker import ReciprocalRankFusionReranker
from app.services.rerankers.llm_reranker import LLMReranker
from app.services.rerankers.lost_in_middle_reranker import LostInMiddleReranker
from app.services.rerankers.diversity_reranker import DiversityReranker
from app.services.rerankers.listwise_llm_reranker import ListwiseLLMReranker
from app.services.rerankers.pairwise_llm_reranker import PairwiseLLMReranker
from app.services.rerankers.flashrank_reranker import FlashRankReranker
from app.services.rerankers.bge_reranker import BGEReranker
from app.services.rerankers.contextual_reranker import ContextualReranker
from app.services.rerankers.cascade_reranker import CascadeReranker

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
        elif provider == "lost-in-middle":
            pre_reranker = kwargs.get("pre_reranker")
            return LostInMiddleReranker(pre_reranker=pre_reranker)
        elif provider == "diversity":
            lambda_param = kwargs.get("lambda_param", 0.7)
            embedding_model = kwargs.get("embedding_model", "text-embedding-3-small")
            return DiversityReranker(
                lambda_param=lambda_param, embedding_model=embedding_model
            )
        elif provider == "listwise-llm":
            window_size = kwargs.get("window_size", 10)
            step_size = kwargs.get("step_size", 5)
            return ListwiseLLMReranker(
                model=model, window_size=window_size, step_size=step_size
            )
        elif provider == "pairwise-llm":
            return PairwiseLLMReranker(model=model)
        elif provider == "flashrank":
            model_name = kwargs.get("model_name", "ms-marco-TinyBERT-L-2-v2")
            return FlashRankReranker(model_name=model_name)
        elif provider == "bge":
            model_name = kwargs.get("model_name", "BAAI/bge-reranker-base")
            return BGEReranker(model_name=model_name)
        elif provider == "contextual":
            base_reranker = kwargs.get("base_reranker")
            metadata_keys = kwargs.get("metadata_keys")
            return ContextualReranker(
                base_reranker=base_reranker, metadata_keys=metadata_keys
            )
        elif provider == "cascade":
            stages = kwargs.get("stages")
            return CascadeReranker(stages=stages)
        else:
            logger.error(f"Unsupported reranker provider: {provider}")
            raise ValueError(f"Unsupported reranker provider: {provider}")

reranker_service = RerankerService()

from __future__ import annotations
import logging
import asyncio
from typing import List, Optional
from app.services.embeddings.base import BaseEmbedder
try:
    from sentence_transformers import SentenceTransformer
except ImportError:  # pragma: no cover
    SentenceTransformer = None

logger = logging.getLogger(__name__)

class LocalHuggingFaceEmbedder(BaseEmbedder):
    """
    Local embedding provider using SentenceTransformers.
    Runs on CPU/GPU without API costs.
    """
    
    _model_cache = {}

    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        self._model_name = model_name
        self._model = None
        
        # Metadata
        self._meta = {
            "all-MiniLM-L6-v2": {"dim": 384},
            "BAAI/bge-large-en-v1.5": {"dim": 1024},
            "multi-qa-mpnet-base-dot-v1": {"dim": 768},
        }

    def _get_model(self, model_name: str) -> SentenceTransformer:
        if model_name not in LocalHuggingFaceEmbedder._model_cache:
            logger.info(f"Loading local embedding model: {model_name}")
            LocalHuggingFaceEmbedder._model_cache[model_name] = SentenceTransformer(model_name)
        return LocalHuggingFaceEmbedder._model_cache[model_name]

    @property
    def provider_name(self) -> str:
        return "local"

    @property
    def model_name(self) -> str:
        return self._model_name

    @property
    def dimensions(self) -> int:
        if self._model_name in self._meta:
            return self._meta[self._model_name]["dim"]
        
        # This will trigger a synchronous load if called!
        # Better to ensure _meta is comprehensive or load lazily.
        if self._model is None:
            self._model = self._get_model(self._model_name)
        return self._model.get_sentence_embedding_dimension()

    @property
    def cost_per_million_tokens(self) -> float:
        return 0.0  # Free!

    async def embed(self, texts: List[str]) -> List[List[float]]:
        # Ensure model is loaded (in a thread)
        if self._model is None:
            loop = asyncio.get_event_loop()
            self._model = await loop.run_in_executor(
                None, 
                lambda: self._get_model(self._model_name)
            )
            
        # SentenceTransformer.encode is synchronous, so we run it in a thread
        loop = asyncio.get_event_loop()
        embeddings = await loop.run_in_executor(
            None, 
            lambda: self._model.encode(texts, convert_to_numpy=True)
        )
        return embeddings.tolist()

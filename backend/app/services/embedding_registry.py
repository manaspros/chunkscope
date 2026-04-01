"""
Embedding Model Registry
Curated catalog of embedding models with metadata, recommendations, and comparison.
"""
from __future__ import annotations

from typing import Optional

from app.core.logging import get_logger

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Registry data
# ---------------------------------------------------------------------------

EMBEDDING_MODELS: list[dict] = [
    {
        "id": "text-embedding-3-small",
        "provider": "openai",
        "name": "OpenAI text-embedding-3-small",
        "dimensions": 1536,
        "max_tokens": 8191,
        "cost_per_million_tokens": 0.02,
        "quality_tier": "good",
        "speed_tier": "fast",
        "best_for": ["general", "prototyping", "low-cost"],
        "supports_matryoshka": True,
        "self_hostable": False,
        "notes": "Native Matryoshka support; dimensions can be reduced to 256/512/1024.",
    },
    {
        "id": "text-embedding-3-large",
        "provider": "openai",
        "name": "OpenAI text-embedding-3-large",
        "dimensions": 3072,
        "max_tokens": 8191,
        "cost_per_million_tokens": 0.13,
        "quality_tier": "excellent",
        "speed_tier": "medium",
        "best_for": ["general", "high-accuracy", "multilingual"],
        "supports_matryoshka": True,
        "self_hostable": False,
        "notes": "Matryoshka support; best OpenAI offering for retrieval quality.",
    },
    {
        "id": "embed-v4",
        "provider": "cohere",
        "name": "Cohere Embed v4",
        "dimensions": 1024,
        "max_tokens": 128000,
        "cost_per_million_tokens": 0.10,
        "quality_tier": "state-of-the-art",
        "speed_tier": "medium",
        "best_for": ["long-context", "multilingual", "multimodal", "code"],
        "supports_matryoshka": True,
        "self_hostable": False,
        "notes": (
            "128K context window; multimodal (text + images); int8/binary quantization; "
            "100+ languages; Matryoshka dimensionality reduction."
        ),
    },
    {
        "id": "voyage-3-large",
        "provider": "voyage",
        "name": "Voyage voyage-3-large",
        "dimensions": 1024,
        "max_tokens": 32000,
        "cost_per_million_tokens": 0.18,
        "quality_tier": "state-of-the-art",
        "speed_tier": "medium",
        "best_for": ["retrieval", "code", "legal", "scientific"],
        "supports_matryoshka": True,
        "self_hostable": False,
        "notes": (
            "Top-tier retrieval accuracy on MTEB; Matryoshka support; "
            "32K context; strong on domain-specific corpora."
        ),
    },
    {
        "id": "bge-m3",
        "provider": "baai",
        "name": "BAAI BGE-M3",
        "dimensions": 1024,
        "max_tokens": 8192,
        "cost_per_million_tokens": None,
        "quality_tier": "excellent",
        "speed_tier": "medium",
        "best_for": ["multilingual", "hybrid-search", "self-hosted"],
        "supports_matryoshka": False,
        "self_hostable": True,
        "notes": (
            "Dense + sparse + ColBERT multi-vector representations; "
            "supports 100+ languages; excellent for hybrid search pipelines."
        ),
    },
    {
        "id": "jina-embeddings-v3",
        "provider": "jina",
        "name": "Jina Embeddings v3",
        "dimensions": 1024,
        "max_tokens": 8192,
        "cost_per_million_tokens": 0.02,
        "quality_tier": "excellent",
        "speed_tier": "fast",
        "best_for": ["multilingual", "general", "code", "low-cost"],
        "supports_matryoshka": True,
        "self_hostable": True,
        "notes": (
            "Task-specific LoRA adapters (retrieval.query, retrieval.passage, "
            "classification, separation); Matryoshka; 89 languages."
        ),
    },
    {
        "id": "nomic-embed-text-v1.5",
        "provider": "nomic",
        "name": "Nomic Embed Text v1.5",
        "dimensions": 768,
        "max_tokens": 8192,
        "cost_per_million_tokens": 0.01,
        "quality_tier": "good",
        "speed_tier": "fast",
        "best_for": ["general", "prototyping", "low-cost", "self-hosted"],
        "supports_matryoshka": True,
        "self_hostable": True,
        "notes": (
            "Open-weights (Apache 2.0); Matryoshka support down to 64 dims; "
            "competitive with proprietary models at fraction of cost."
        ),
    },
    {
        "id": "all-MiniLM-L6-v2",
        "provider": "sentence-transformers",
        "name": "all-MiniLM-L6-v2",
        "dimensions": 384,
        "max_tokens": 256,
        "cost_per_million_tokens": None,
        "quality_tier": "budget",
        "speed_tier": "fast",
        "best_for": ["prototyping", "local", "low-latency"],
        "supports_matryoshka": False,
        "self_hostable": True,
        "notes": (
            "Tiny (80 MB); extremely fast inference; good baseline for local dev. "
            "Limited to 256 tokens; English-centric."
        ),
    },
]

# Build lookup index
_MODEL_INDEX: dict[str, dict] = {m["id"]: m for m in EMBEDDING_MODELS}

# ---------------------------------------------------------------------------
# Recommendation rules: doc_type -> ordered list of quality signals
# ---------------------------------------------------------------------------

_DOC_TYPE_TAGS: dict[str, list[str]] = {
    "general": ["general"],
    "legal": ["legal", "retrieval", "high-accuracy"],
    "scientific": ["scientific", "retrieval", "high-accuracy"],
    "code": ["code", "retrieval"],
    "multilingual": ["multilingual"],
    "long-context": ["long-context"],
    "prototyping": ["prototyping", "low-cost"],
    "local": ["self-hosted", "local", "prototyping"],
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

class EmbeddingModelRegistry:
    """Curated registry of embedding models with recommendations."""

    def get_all_models(self) -> list[dict]:
        """Return all models in the registry."""
        return list(EMBEDDING_MODELS)

    def get_model(self, model_id: str) -> Optional[dict]:
        """Retrieve metadata for a single model by ID. Returns None if not found."""
        return _MODEL_INDEX.get(model_id)

    def recommend_for_document_type(self, doc_type: str) -> list[dict]:
        """
        Return models ranked by relevance for a given document type.

        Ranking heuristic: number of matching ``best_for`` tags with the
        document type's preferred signals, breaking ties by quality tier.
        """
        tags = _DOC_TYPE_TAGS.get(doc_type.lower(), [doc_type.lower()])

        quality_order = {
            "state-of-the-art": 4,
            "excellent": 3,
            "good": 2,
            "budget": 1,
        }

        def _rank(model: dict) -> tuple[int, int]:
            tag_hits = sum(1 for t in tags if t in model["best_for"])
            quality = quality_order.get(model["quality_tier"], 0)
            return (tag_hits, quality)

        ranked = sorted(EMBEDDING_MODELS, key=_rank, reverse=True)
        return ranked

    def compare_models(self, model_ids: list[str]) -> list[dict]:
        """Return metadata for the requested models (preserving order)."""
        results: list[dict] = []
        for mid in model_ids:
            model = _MODEL_INDEX.get(mid)
            if model is not None:
                results.append(model)
        return results


# Singleton
embedding_registry = EmbeddingModelRegistry()

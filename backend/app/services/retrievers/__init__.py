"""
ChunkScope Retrievers Package

Provides a registry of all available retrieval strategies and a factory
function for instantiating them by name.
"""

from app.services.retrievers.base import BaseRetriever

# -- Original retrievers --
from app.services.retrievers.hybrid_retriever import HybridRetriever
from app.services.retrievers.hyde_retriever import HyDERetriever
from app.services.retrievers.mmr_retriever import MMRRetriever
from app.services.retrievers.multi_query_retriever import MultiQueryRetriever
from app.services.retrievers.parent_document_retriever import ParentDocumentRetriever
from app.services.retrievers.query_expansion_retriever import QueryExpansionRetriever

# -- New retrievers --
from app.services.retrievers.sentence_window_retriever import SentenceWindowRetriever
from app.services.retrievers.contextual_compression_retriever import ContextualCompressionRetriever
from app.services.retrievers.self_query_retriever import SelfQueryRetriever
from app.services.retrievers.metadata_filter_retriever import MetadataFilterRetriever
from app.services.retrievers.time_weighted_retriever import TimeWeightedRetriever
from app.services.retrievers.ensemble_retriever import EnsembleRetriever
from app.services.retrievers.sub_query_retriever import SubQueryRetriever
from app.services.retrievers.step_back_retriever import StepBackRetriever
from app.services.retrievers.adaptive_retriever import AdaptiveRetriever
from app.services.retrievers.corrective_retriever import CorrectiveRetriever
from app.services.retrievers.document_summary_retriever import DocumentSummaryRetriever

# Registry mapping strategy names to classes
RETRIEVER_REGISTRY = {
    # Original
    "hybrid": HybridRetriever,
    "hyde": HyDERetriever,
    "mmr": MMRRetriever,
    "multi_query": MultiQueryRetriever,
    "parent_document": ParentDocumentRetriever,
    "query_expansion": QueryExpansionRetriever,
    # New
    "sentence_window": SentenceWindowRetriever,
    "contextual_compression": ContextualCompressionRetriever,
    "self_query": SelfQueryRetriever,
    "metadata_filter": MetadataFilterRetriever,
    "time_weighted": TimeWeightedRetriever,
    "ensemble": EnsembleRetriever,
    "sub_query": SubQueryRetriever,
    "step_back": StepBackRetriever,
    "adaptive": AdaptiveRetriever,
    "corrective": CorrectiveRetriever,
    "document_summary": DocumentSummaryRetriever,
}


def get_retriever_class(name: str) -> type:
    """
    Look up a retriever class by strategy name.

    Raises:
        ValueError: If the name is not in the registry.
    """
    cls = RETRIEVER_REGISTRY.get(name)
    if cls is None:
        available = ", ".join(sorted(RETRIEVER_REGISTRY.keys()))
        raise ValueError(
            f"Unknown retriever strategy '{name}'. Available: {available}"
        )
    return cls


__all__ = [
    # Base
    "BaseRetriever",
    # Original
    "HybridRetriever",
    "HyDERetriever",
    "MMRRetriever",
    "MultiQueryRetriever",
    "ParentDocumentRetriever",
    "QueryExpansionRetriever",
    # New
    "SentenceWindowRetriever",
    "ContextualCompressionRetriever",
    "SelfQueryRetriever",
    "MetadataFilterRetriever",
    "TimeWeightedRetriever",
    "EnsembleRetriever",
    "SubQueryRetriever",
    "StepBackRetriever",
    "AdaptiveRetriever",
    "CorrectiveRetriever",
    "DocumentSummaryRetriever",
    # Factory
    "RETRIEVER_REGISTRY",
    "get_retriever_class",
]

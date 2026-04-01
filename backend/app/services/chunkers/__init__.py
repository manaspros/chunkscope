from .base import BaseChunker
from .recursive_chunker import RecursiveChunker
from .semantic_chunker import SemanticChunker
from .sentence_window_chunker import SentenceWindowChunker
from .paragraph_chunker import ParagraphChunker
from .code_aware_chunker import CodeAwareChunker
from .heading_based_chunker import HeadingBasedChunker
from .contextual_chunker import ContextualChunker
from app.core.errors import AppException

CHUNKER_REGISTRY = {
    "recursive": RecursiveChunker,
    "semantic": SemanticChunker,
    "sentence_window": SentenceWindowChunker,
    "paragraph": ParagraphChunker,
    "code_aware": CodeAwareChunker,
    "heading_based": HeadingBasedChunker,
    "contextual": ContextualChunker,
}

def get_chunker(method: str, **kwargs) -> BaseChunker:
    """
    Factory function to get a chunker instance.

    For the contextual chunker, pass ``base_chunker`` and optionally
    ``llm_fn`` as keyword arguments.
    """
    chunker_class = CHUNKER_REGISTRY.get(method.lower())
    if not chunker_class:
        raise AppException(f"Unknown chunking method: {method}", 400)

    if chunker_class is ContextualChunker:
        base_chunker = kwargs.get("base_chunker")
        if base_chunker is None:
            # Default to recursive chunker as the base
            base_chunker = RecursiveChunker()
        return ContextualChunker(
            base_chunker=base_chunker,
            llm_fn=kwargs.get("llm_fn"),
        )

    return chunker_class()

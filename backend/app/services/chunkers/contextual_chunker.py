from typing import Any, Callable, Dict, List, Optional

from app.schemas.chunk import ChunkingConfig
from .base import BaseChunker

CONTEXTUAL_PROMPT_TEMPLATE = """Here is the full document:
{document}

Here is a chunk from the document:
{chunk}

Give a short (2-3 sentence) context to situate this chunk within the overall document. Focus on what comes before/after this chunk and what section it belongs to. Be concise."""


class ContextualChunker(BaseChunker):
    """
    Implements Anthropic's Contextual Retrieval approach.

    Takes chunks produced by any other chunker and prepends a short
    LLM-generated contextual preamble to each chunk.  The preamble
    situates the chunk within the overall document so that embeddings
    and BM25 searches become more accurate.

    Parameters
    ----------
    base_chunker : BaseChunker
        The underlying chunker that produces the initial chunks.
    llm_fn : Callable[[str], str], optional
        A function that takes a prompt string and returns the LLM
        completion string.  When ``None``, the chunker falls back to
        returning the original chunks without contextual preambles.
    """

    def __init__(
        self,
        base_chunker: BaseChunker,
        llm_fn: Optional[Callable[[str], str]] = None,
    ):
        self.base_chunker = base_chunker
        self.llm_fn = llm_fn

    def chunk(self, text: str, config: ChunkingConfig) -> List[Dict[str, Any]]:
        """
        1. Chunk the text with the base chunker.
        2. For each chunk, call the LLM to generate a contextual preamble.
        3. Prepend the preamble to the chunk text.
        """
        base_chunks = self.base_chunker.chunk(text, config)

        if self.llm_fn is None:
            return base_chunks

        contextual_chunks: List[Dict[str, Any]] = []
        for chunk_dict in base_chunks:
            chunk_text = chunk_dict["text"]
            prompt = CONTEXTUAL_PROMPT_TEMPLATE.format(
                document=text,
                chunk=chunk_text,
            )

            try:
                preamble = self.llm_fn(prompt)
            except Exception:
                # If the LLM call fails, fall back to the original chunk
                contextual_chunks.append(chunk_dict)
                continue

            contextualised_text = f"{preamble.strip()}\n\n{chunk_text}"

            contextual_chunks.append({
                "text": contextualised_text,
                "start_char": chunk_dict.get("start_char", 0),
                "end_char": chunk_dict.get("end_char", 0),
                "metadata": {
                    **chunk_dict.get("metadata", {}),
                    "context_preamble": preamble.strip(),
                    "original_text": chunk_text,
                },
            })

        return contextual_chunks

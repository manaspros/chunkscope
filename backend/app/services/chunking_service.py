from typing import List, Dict, Any
from app.schemas.chunk import ChunkingConfig
from app.core.logging import get_logger
from app.services.chunkers import get_chunker

logger = get_logger(__name__)


class ChunkingService:
    """
    Service to handle text chunking using various strategies.
    Delegates to specific Chunker implementations.
    """

    def chunk(self, text: str, config: ChunkingConfig) -> List[Dict[str, Any]]:
        """
        Chunk text using the configured method.

        Returns a list of chunk dicts, each containing at least a 'text' key.
        """
        method = config.method if config.method else "recursive"
        text_length = len(text) if text else 0
        logger.info("chunking_start", method=method, input_length=text_length)

        if not text or not text.strip():
            logger.warning("chunking_empty_input", method=method)
            return []

        try:
            chunker = get_chunker(method)
            chunks = chunker.chunk(text, config)
        except Exception:
            logger.exception("chunking_failed", method=method, input_length=text_length)
            raise

        # Log chunk statistics
        count = len(chunks)
        if count > 0:
            sizes = [len(c.get("text", "")) for c in chunks]
            avg_size = sum(sizes) / count
            min_size = min(sizes)
            max_size = max(sizes)
            logger.info(
                "chunking_complete",
                method=method,
                count=count,
                avg_size=round(avg_size, 1),
                min_size=min_size,
                max_size=max_size,
            )
        else:
            logger.warning("chunking_no_chunks", method=method, input_length=text_length)

        return chunks


chunking_service = ChunkingService()

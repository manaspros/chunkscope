from typing import List, Dict, Any
import re
from app.schemas.chunk import ChunkingConfig
from .base import BaseChunker

class RecursiveChunker(BaseChunker):
    """
    Splits text recursively using a list of separators.
    Standard separators: ["\n\n", "\n", " ", ""]
    """

    def __init__(self):
        self.separators = ["\n\n", "\n", " ", ""]

    def chunk(self, text: str, config: ChunkingConfig) -> List[Dict[str, Any]]:
        return self._recursive_split(text, self.separators, config.chunk_size, config.overlap, base_offset=0)

    def _recursive_split(self, text: str, separators: List[str], chunk_size: int, overlap: int, base_offset: int = 0) -> List[Dict[str, Any]]:
        final_chunks = []
        if not separators:
            # Base case: if no separators left, hard split by character
            return self._create_chunks(text, chunk_size, overlap, base_offset)

        separator = separators[0]
        new_separators = separators[1:]

        # Split by current separator, tracking positions of each split
        if separator == "":
            splits = list(text)
            split_offsets = list(range(len(text)))
        else:
            splits = text.split(separator)
            # Calculate the offset of each split within `text`
            split_offsets = []
            pos = 0
            for i, split in enumerate(splits):
                split_offsets.append(pos)
                pos += len(split)
                if i < len(splits) - 1:
                    pos += len(separator)

        # Re-assemble chunks, tracking the offset of the first split in the group
        current_chunk = []
        current_len = 0
        current_chunk_start_offset = 0  # offset within `text` where current group starts

        for idx, split in enumerate(splits):
            split_len = len(split)
            if current_len + split_len + len(separator) > chunk_size:
                if current_chunk:
                    joined_text = separator.join(current_chunk)
                    abs_offset = base_offset + current_chunk_start_offset
                    if len(joined_text) > chunk_size:
                        # Recursively split this oversized chunk
                        sub_chunks = self._recursive_split(joined_text, new_separators, chunk_size, overlap, abs_offset)
                        final_chunks.extend(sub_chunks)
                    else:
                        final_chunks.append(self._make_chunk(joined_text, abs_offset))

                    current_chunk = []
                    current_len = 0
                    current_chunk_start_offset = split_offsets[idx]

            if not current_chunk:
                current_chunk_start_offset = split_offsets[idx]
            current_chunk.append(split)
            current_len += split_len + len(separator)

        # Handle last chunk
        if current_chunk:
            joined_text = separator.join(current_chunk)
            abs_offset = base_offset + current_chunk_start_offset
            if len(joined_text) > chunk_size:
                sub_chunks = self._recursive_split(joined_text, new_separators, chunk_size, overlap, abs_offset)
                final_chunks.extend(sub_chunks)
            else:
                final_chunks.append(self._make_chunk(joined_text, abs_offset))

        return final_chunks

    def _create_chunks(self, text: str, size: int, overlap: int, base_offset: int = 0) -> List[Dict[str, Any]]:
        """Hard split by character length"""
        chunks = []
        start = 0
        while start < len(text):
            end = min(start + size, len(text))
            chunk_text = text[start:end]
            chunks.append(self._make_chunk(chunk_text, base_offset + start))
            start += size - overlap
        return chunks

    def _make_chunk(self, chunk_text: str, start_index: int) -> Dict[str, Any]:
        return {
            "text": chunk_text,
            "start_char": start_index,
            "end_char": start_index + len(chunk_text)
        }

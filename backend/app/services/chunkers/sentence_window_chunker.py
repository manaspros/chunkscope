from __future__ import annotations
try:  # heavy optional dep: absent in the slim Vercel deployment
    import spacy
except ImportError:  # pragma: no cover
    spacy = None
from typing import List, Dict, Any, Optional
from app.schemas.chunk import ChunkingConfig
from app.core.logging import get_logger
from .base import BaseChunker

logger = get_logger(__name__)

class _Span:
    def __init__(self, start_char: int, end_char: int):
        self.start_char, self.end_char = start_char, end_char


class _RegexDoc:
    def __init__(self, text: str):
        import re
        self.sents = [_Span(m.start(), m.end()) for m in re.finditer(r"[^.!?
]+(?:[.!?]+|
|$)\s*", text) if m.group().strip()]


def _regex_nlp(text: str) -> _RegexDoc:
    """Fallback sentence splitter used when spaCy is not installed (slim Vercel build)."""
    return _RegexDoc(text)


class SentenceWindowChunker(BaseChunker):
    """
    Creates chunks by sliding a window of N sentences over the text.
    Allows for overlapping windows.
    """
    
    _nlp_instance: Optional[spacy.language.Language] = None
    
    def __init__(self):
        self._ensure_spacy_loaded()

    def _ensure_spacy_loaded(self):
        """Lazy load Spacy model."""
        if spacy is None:
            SentenceWindowChunker._nlp_instance = _regex_nlp
            return
        if SentenceWindowChunker._nlp_instance is None:
            try:
                SentenceWindowChunker._nlp_instance = spacy.load("en_core_web_sm")
            except OSError:
                logger.info("downloading_spacy_model", model="en_core_web_sm")
                from spacy.cli import download
                download("en_core_web_sm")
                SentenceWindowChunker._nlp_instance = spacy.load("en_core_web_sm")
    
    @property
    def nlp(self) -> spacy.language.Language:
        if self._nlp_instance is None:
            self._ensure_spacy_loaded()
        return self._nlp_instance # type: ignore

    def chunk(self, text: str, config: ChunkingConfig) -> List[Dict[str, Any]]:
        if not text.strip():
            return []
            
        doc = self.nlp(text)
        sentences = list(doc.sents)
        
        if not sentences:
            return []
            
        window_size = config.window_size if config.window_size > 0 else 3
        # Use chunk_overlap as step size? Or explicit stride?
        # Usually window chunking implies a stride of 1 or (size - overlap).
        # Let's assume stride = 1 for "Sentence Window" unless overlap controls it.
        # If config.chunk_overlap is used, stride = window_size - overlap.
        # Default stride = 1 for maximum context preservation if overlap not specified?
        # Let's use overlap logic: stride = max(1, window_size - overlap)
        
        overlap = config.overlap if config.overlap is not None else 1
        stride = max(1, window_size - overlap)
        
        chunks = []
        for i in range(0, len(sentences), stride):
            window = sentences[i : i + window_size]
            if not window:
                break
                
            start_char = window[0].start_char
            end_char = window[-1].end_char
            chunk_text = text[start_char:end_char]
            
            chunks.append({
                "text": chunk_text,
                "start_char": start_char,
                "end_char": end_char
            })
            
            if i + window_size >= len(sentences):
                break
                
        return chunks

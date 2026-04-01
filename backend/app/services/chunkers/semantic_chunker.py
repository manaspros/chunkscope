import threading

import numpy as np
import spacy
from typing import List, Optional, Dict, Any
from sentence_transformers import SentenceTransformer
from app.schemas.chunk import ChunkingConfig
from app.core.logging import get_logger
from app.core.errors import AppException
from .base import BaseChunker

logger = get_logger(__name__)

class SemanticChunker(BaseChunker):
    """
    Semantic chunking using SentenceTransformers and adaptive thresholding.
    follows the 'Percentile-Based Gradient Splitting' design.
    """

    _model_instance: Optional[SentenceTransformer] = None
    _nlp_instance: Optional[spacy.language.Language] = None
    _model_lock: threading.Lock = threading.Lock()
    _nlp_lock: threading.Lock = threading.Lock()

    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        self.model_name = model_name
        self._ensure_model_loaded()
        self._ensure_spacy_loaded()

    def _ensure_model_loaded(self):
        """Lazy load the embedding model with thread-safe double-checked locking."""
        if SemanticChunker._model_instance is None:
            with SemanticChunker._model_lock:
                if SemanticChunker._model_instance is None:
                    logger.info("loading_embedding_model", model=self.model_name)
                    try:
                        SemanticChunker._model_instance = SentenceTransformer(self.model_name)
                    except Exception as e:
                        logger.error("model_load_failed", error=str(e))
                        raise AppException(f"Failed to load embedding model: {str(e)}", 500)

    def _ensure_spacy_loaded(self):
        """Lazy load Spacy model with thread-safe double-checked locking."""
        if SemanticChunker._nlp_instance is None:
            with SemanticChunker._nlp_lock:
                if SemanticChunker._nlp_instance is None:
                    try:
                        SemanticChunker._nlp_instance = spacy.load("en_core_web_sm")
                    except OSError:
                        logger.info("downloading_spacy_model", model="en_core_web_sm")
                        from spacy.cli import download
                        download("en_core_web_sm")
                        SemanticChunker._nlp_instance = spacy.load("en_core_web_sm")

    @property
    def model(self) -> SentenceTransformer:
        if self._model_instance is None:
            self._ensure_model_loaded()
        return self._model_instance # type: ignore

    @property
    def nlp(self) -> spacy.language.Language:
        if self._nlp_instance is None:
            self._ensure_spacy_loaded()
        return self._nlp_instance # type: ignore

    def chunk(self, text: str, config: ChunkingConfig) -> List[Dict[str, Any]]:
        """
        Chunk text semantically. Returns list of dicts with text and offsets.
        """
        if not text.strip():
            return []

        # 1. Split Sentences with Spacy (preserves offsets)
        doc = self.nlp(text)
        sentences = [] 
        for sent in doc.sents:
            if sent.text.strip():
                sentences.append(sent)
        
        if not sentences:
            return []
            
        if len(sentences) == 1:
            sent = sentences[0]
            return [{"text": sent.text, "start_char": sent.start_char, "end_char": sent.end_char}]

        # 2. Embed Sentences Individually (Optimization: encode N sentences instead of N*Window tokens)
        # using batch_size for speed
        sentence_texts = [s.text for s in sentences]
        embeddings = self.model.encode(sentence_texts, batch_size=64, convert_to_numpy=True)
        # Normalize embeddings for fast cosine sim (dot product)
        norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
        embeddings = embeddings / norms

        # 3. Calculate Distance at each gap
        # We check the gap between sentence i and i+1
        # using config.window_size to aggregate context on Left and Right of the gap.
        window_size = max(1, config.window_size) # Ensure at least 1 sentence
        similarities = []
        
        for i in range(len(sentences) - 1):
            # Gap is after sentence i (i.e., between i and i+1)
            
            # Left Window: ends at i (inclusive)
            # range: [max(0, i - window + 1) : i + 1]
            start_left = max(0, i - window_size + 1)
            end_left = i + 1
            
            # Right Window: starts at i + 1
            # range: [i + 1 : min(N, i + 1 + window)]
            start_right = i + 1
            end_right = min(len(sentences), i + 1 + window_size)
            
            # Compute mean embeddings
            # Note: embeddings are already normalized individually, 
            # but mean of normalized vectors is not necessarily normalized.
            # However, for directionality, it works.
            emb_left = np.mean(embeddings[start_left:end_left], axis=0)
            emb_right = np.mean(embeddings[start_right:end_right], axis=0)
            
            # Cosine similarity
            sim = np.dot(emb_left, emb_right) / (np.linalg.norm(emb_left) * np.linalg.norm(emb_right))
            similarities.append(sim)
            
        # 5. Threshold (Local Minima / Valley Detection)
        # We only split if the similarity is a local minimum (valley) AND below threshold.
        # This prevents splitting on "slopes" where similarity is decreasing towards a topic shift,
        # ensuring we split exactly AT the shift (the lowest point).
        split_threshold = config.threshold
        
        chunks = []
        current_chunk_sents = [sentences[0]]
        
        n_sims = len(similarities)
        for i in range(n_sims):
            sim = similarities[i]
            
            # Check if this point is a local minimum (valley)
            # Valley if: (left is higher or None) AND (right is higher or None)
            val_left = similarities[i-1] if i > 0 else 1.0
            val_right = similarities[i+1] if i < n_sims - 1 else 1.0
            
            # Use <= to catch plateaus (though exact float equality is rare)
            is_valley = (sim <= val_left) and (sim <= val_right)
            
            # Check length constraint
            curr_start = current_chunk_sents[0].start_char
            curr_end = current_chunk_sents[-1].end_char
            
            should_split = (sim < split_threshold) and is_valley
            
            if should_split and (curr_end - curr_start) >= config.min_chunk_size:
                chunks.append({
                    "text": text[curr_start:curr_end],
                    "start_char": curr_start,
                    "end_char": curr_end
                })
                current_chunk_sents = []
            
            current_chunk_sents.append(sentences[i+1])
            
        # Add final chunk
        if current_chunk_sents:
            curr_start = current_chunk_sents[0].start_char
            curr_end = current_chunk_sents[-1].end_char
            chunks.append({
                "text": text[curr_start:curr_end],
                "start_char": curr_start,
                "end_char": curr_end
            })
            
        return chunks

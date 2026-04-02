import re
from typing import List, Dict, Any, Optional
from uuid import UUID

import numpy as np

from app.services.retrievers.base import BaseRetriever
from app.services.llm_service import llm_service


class SentenceWindowRetriever(BaseRetriever):
    """
    Retrieves the most relevant sentence, then expands by k sentences
    before and after to provide surrounding context.
    """

    def __init__(self, base_retriever: BaseRetriever, window_size: int = 3):
        """
        Args:
            base_retriever: A base retriever used to get initial chunks.
            window_size: Number of sentences to include before and after the
                         best-matching sentence.
        """
        self.base_retriever = base_retriever
        self.window_size = window_size

    async def retrieve(
        self,
        query: str,
        top_k: int = 10,
        document_id: Optional[UUID] = None,
        **kwargs,
    ) -> List[Dict[str, Any]]:
        """
        1. Retrieve candidate chunks via the base retriever.
        2. Split each chunk into sentences.
        3. Embed sentences and the query.
        4. Find the best-matching sentence and return a window around it.
        """
        # Step 1: Get candidate chunks
        candidates = await self.base_retriever.retrieve(
            query, top_k=top_k, document_id=document_id, **kwargs
        )
        if not candidates:
            return []

        # Step 2: Build a flat list of (sentence, chunk_index, sentence_index)
        all_sentences: List[str] = []
        sentence_map: List[Dict[str, Any]] = []  # tracks origin of each sentence

        for chunk_idx, result in enumerate(candidates):
            chunk_obj = result.get("chunk")
            text = chunk_obj.text if hasattr(chunk_obj, "text") else str(chunk_obj)
            sentences = self._split_sentences(text)
            for sent_idx, sent in enumerate(sentences):
                all_sentences.append(sent)
                sentence_map.append(
                    {
                        "chunk_idx": chunk_idx,
                        "sent_idx": sent_idx,
                        "total_sents": len(sentences),
                        "sentences": sentences,
                        "original_result": result,
                    }
                )

        if not all_sentences:
            return candidates[:top_k]

        # Step 3: Embed query and all sentences
        texts_to_embed = [query] + all_sentences
        embeddings = await llm_service.embed(texts_to_embed)
        query_emb = np.array(embeddings[0])
        sentence_embs = [np.array(e) for e in embeddings[1:]]

        # Step 4: Find best matching sentence per chunk
        similarities = []
        for i, sent_emb in enumerate(sentence_embs):
            norm_q = np.linalg.norm(query_emb)
            norm_s = np.linalg.norm(sent_emb)
            if norm_q == 0 or norm_s == 0:
                sim = 0.0
            else:
                sim = float(np.dot(query_emb, sent_emb) / (norm_q * norm_s))
            similarities.append((i, sim))

        # Sort by similarity descending
        similarities.sort(key=lambda x: x[1], reverse=True)

        # Step 5: Build windowed results, deduplicating by chunk
        seen_chunks = set()
        results: List[Dict[str, Any]] = []

        for sent_global_idx, sim_score in similarities:
            if len(results) >= top_k:
                break

            info = sentence_map[sent_global_idx]
            chunk_idx = info["chunk_idx"]
            if chunk_idx in seen_chunks:
                continue
            seen_chunks.add(chunk_idx)

            sent_idx = info["sent_idx"]
            sentences = info["sentences"]
            start = max(0, sent_idx - self.window_size)
            end = min(len(sentences), sent_idx + self.window_size + 1)
            window_text = " ".join(sentences[start:end])

            original = info["original_result"]
            results.append(
                {
                    "chunk": original.get("chunk"),
                    "score": sim_score,
                    "text": window_text,
                    "metadata": {
                        **(original.get("metadata") or {}),
                        "strategy": "sentence_window",
                        "window_size": self.window_size,
                        "best_sentence": sentences[sent_idx],
                        "sentence_index": sent_idx,
                    },
                }
            )

        return results

    @staticmethod
    def _split_sentences(text: str) -> List[str]:
        """Split text into sentences using a simple regex."""
        sentences = re.split(r"(?<=[.!?])\s+", text.strip())
        return [s for s in sentences if s.strip()]

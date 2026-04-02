from typing import List, Dict, Any, Optional
from uuid import UUID

import numpy as np
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Chunk, Document
from app.services.retrievers.base import BaseRetriever
from app.services.llm_service import llm_service


class DocumentSummaryRetriever(BaseRetriever):
    """
    Two-stage retriever that maintains a summary per document.

    Stage 1 (coarse): Retrieve relevant document summaries by embedding
    similarity to the query.
    Stage 2 (fine): Fetch chunks from the matched documents and rank
    them against the query.
    """

    def __init__(
        self,
        db: AsyncSession,
        model: str = "gpt-4o-mini",
    ):
        self.db = db
        self.model = model
        # In-memory cache: document_id -> summary text
        self._summary_cache: Dict[UUID, str] = {}

    async def retrieve(
        self,
        query: str,
        top_k: int = 10,
        document_id: Optional[UUID] = None,
        query_embedding: List[float] = None,
        **kwargs,
    ) -> List[Dict[str, Any]]:
        if not query_embedding:
            return []

        # If a specific document is given, skip coarse stage
        if document_id:
            return await self._fine_retrieval(
                query_embedding, [document_id], top_k
            )

        # Stage 1: Find relevant documents via summaries
        relevant_doc_ids = await self._coarse_retrieval(
            query, query_embedding, top_k=min(top_k, 5)
        )
        if not relevant_doc_ids:
            return []

        # Stage 2: Retrieve chunks from matched documents
        return await self._fine_retrieval(
            query_embedding, relevant_doc_ids, top_k
        )

    async def _coarse_retrieval(
        self,
        query: str,
        query_embedding: List[float],
        top_k: int = 5,
    ) -> List[UUID]:
        """
        Find the most relevant documents by comparing query embedding
        against document summary embeddings.
        """
        # Get all documents
        stmt = select(Document).where(Document.is_processed.is_(True))
        result = await self.db.execute(stmt)
        documents = result.scalars().all()

        if not documents:
            return []

        # Generate summaries for documents that don't have one cached
        summaries: List[str] = []
        doc_ids: List[UUID] = []
        for doc in documents:
            summary = await self._get_or_create_summary(doc)
            if summary:
                summaries.append(summary)
                doc_ids.append(doc.id)

        if not summaries:
            return [doc.id for doc in documents[:top_k]]

        # Embed summaries and compare with query
        summary_embeddings = await llm_service.embed(summaries)

        query_emb = np.array(query_embedding)
        scores = []
        for i, emb in enumerate(summary_embeddings):
            emb_arr = np.array(emb)
            norm_q = np.linalg.norm(query_emb)
            norm_e = np.linalg.norm(emb_arr)
            if norm_q > 0 and norm_e > 0:
                sim = float(np.dot(query_emb, emb_arr) / (norm_q * norm_e))
            else:
                sim = 0.0
            scores.append((doc_ids[i], sim))

        scores.sort(key=lambda x: x[1], reverse=True)
        return [doc_id for doc_id, _ in scores[:top_k]]

    async def _fine_retrieval(
        self,
        query_embedding: List[float],
        doc_ids: List[UUID],
        top_k: int,
    ) -> List[Dict[str, Any]]:
        """Retrieve chunks from specific documents ranked by similarity."""
        embedding_str = f"[{','.join(map(str, query_embedding))}]"

        stmt = (
            select(
                Chunk,
                (1 - Chunk.embedding.cosine_distance(
                    text(f"'{embedding_str}'::vector")
                )).label("score"),
            )
            .where(Chunk.document_id.in_(doc_ids))
            .order_by(text("score DESC"))
            .limit(top_k)
        )

        result = await self.db.execute(stmt)
        rows = result.all()

        return [
            {
                "chunk": row.Chunk,
                "score": float(row.score),
                "metadata": {
                    "strategy": "document_summary",
                    "matched_documents": [str(d) for d in doc_ids],
                },
            }
            for row in rows
        ]

    async def _get_or_create_summary(self, document: Document) -> Optional[str]:
        """Get a cached summary or generate one from the document text."""
        if document.id in self._summary_cache:
            return self._summary_cache[document.id]

        # Check document metadata for existing summary
        metadata = document.doc_metadata or {}
        if "summary" in metadata:
            self._summary_cache[document.id] = metadata["summary"]
            return metadata["summary"]

        # Generate summary from extracted text
        text_content = document.extracted_text
        if not text_content:
            return None

        # Truncate very long documents for summarization
        max_chars = 4000
        if len(text_content) > max_chars:
            text_content = text_content[:max_chars] + "..."

        prompt = (
            "Summarize the following document in 2-3 sentences, "
            "capturing the key topics and content:\n\n"
            f"{text_content}"
        )

        summary = await llm_service.generate(
            prompt=prompt,
            system_prompt="You are a document summarization assistant.",
            model=self.model,
            temperature=0.0,
            max_tokens=256,
        )

        summary = summary.strip()
        self._summary_cache[document.id] = summary
        return summary

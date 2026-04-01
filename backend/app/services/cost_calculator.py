"""
Cost Calculator for RAG pipeline operations.

Estimates ingestion and per-query costs based on embedding model,
LLM, chunk size, and optional features like contextual chunking,
reranking, HyDE, and multi-query expansion.
"""
from __future__ import annotations

import math


class CostCalculator:
    """Estimate dollar costs for RAG ingestion and querying."""

    # Prices per 1,000,000 tokens (as of 2026)
    EMBEDDING_COSTS: dict[str, float] = {
        "text-embedding-3-small": 0.02,
        "text-embedding-3-large": 0.13,
        "cohere-embed-v4": 0.10,
        "voyage-3-large": 0.06,
        "jina-embeddings-v3": 0.018,
        "all-MiniLM-L6-v2": 0.0,
        "bge-m3": 0.0,
        "nomic-embed-text-v1.5": 0.0,
    }

    LLM_COSTS: dict[str, dict[str, float]] = {
        "gpt-4o-mini": {"input": 0.15, "output": 0.60},
        "gpt-4o": {"input": 2.50, "output": 10.00},
        "claude-3-haiku": {"input": 0.25, "output": 1.25},
        "claude-3-sonnet": {"input": 3.00, "output": 15.00},
    }

    # Average chars-per-token ratio (roughly 4 chars per token for English)
    CHARS_PER_TOKEN = 4

    # Average tokens generated for a contextual-chunking preamble
    CONTEXTUAL_PREAMBLE_OUTPUT_TOKENS = 100
    # Average input tokens sent to the LLM per chunk for contextual chunking
    CONTEXTUAL_PREAMBLE_INPUT_TOKENS = 300

    # Average tokens in a user query
    AVG_QUERY_TOKENS = 30
    # Average tokens in a generated answer
    AVG_ANSWER_TOKENS = 200

    # Cohere rerank cost per 1000 searches
    RERANK_COST_PER_1000 = 1.00

    # ------------------------------------------------------------------
    # Ingestion cost
    # ------------------------------------------------------------------

    def estimate_ingestion_cost(
        self,
        doc_char_count: int,
        chunk_size: int,
        overlap: int,
        embedding_model: str,
        contextual_chunking: bool = False,
        llm_model: str = "gpt-4o-mini",
    ) -> dict:
        """
        Estimate the cost of ingesting a document.

        Returns a dict with estimated_chunks, embedding_cost,
        contextual_chunking_cost, total_ingestion_cost, and a breakdown.
        """
        # Estimate number of chunks
        step = max(chunk_size - overlap, 1)
        estimated_chunks = max(math.ceil(doc_char_count / step), 1)

        # Tokens in the document (approx)
        total_tokens = doc_char_count / self.CHARS_PER_TOKEN

        # Embedding cost
        cost_per_m = self.EMBEDDING_COSTS.get(embedding_model, 0.0)
        embedding_cost = (total_tokens / 1_000_000) * cost_per_m

        # Contextual chunking cost (an LLM call per chunk)
        contextual_cost = 0.0
        if contextual_chunking:
            llm = self.LLM_COSTS.get(llm_model, {"input": 0.0, "output": 0.0})
            input_tokens = estimated_chunks * self.CONTEXTUAL_PREAMBLE_INPUT_TOKENS
            output_tokens = estimated_chunks * self.CONTEXTUAL_PREAMBLE_OUTPUT_TOKENS
            contextual_cost = (
                (input_tokens / 1_000_000) * llm["input"]
                + (output_tokens / 1_000_000) * llm["output"]
            )

        total = embedding_cost + contextual_cost

        return {
            "estimated_chunks": estimated_chunks,
            "embedding_cost": round(embedding_cost, 6),
            "contextual_chunking_cost": round(contextual_cost, 6),
            "total_ingestion_cost": round(total, 6),
            "breakdown": {
                "doc_char_count": doc_char_count,
                "approx_tokens": int(total_tokens),
                "chunk_size": chunk_size,
                "overlap": overlap,
                "embedding_model": embedding_model,
                "embedding_cost_per_1m_tokens": cost_per_m,
                "contextual_chunking": contextual_chunking,
                "llm_model": llm_model if contextual_chunking else None,
            },
        }

    # ------------------------------------------------------------------
    # Query cost
    # ------------------------------------------------------------------

    def estimate_query_cost(
        self,
        embedding_model: str,
        llm_model: str,
        top_k: int = 5,
        avg_chunk_tokens: int = 200,
        use_reranking: bool = False,
        use_hyde: bool = False,
        use_multi_query: bool = False,
    ) -> dict:
        """
        Estimate the cost of a single query and monthly projections.
        """
        emb_cost_per_m = self.EMBEDDING_COSTS.get(embedding_model, 0.0)
        llm = self.LLM_COSTS.get(llm_model, {"input": 0.0, "output": 0.0})

        # Embedding the query
        query_embed_cost = (self.AVG_QUERY_TOKENS / 1_000_000) * emb_cost_per_m

        # Additional embedding calls for HyDE (generate + embed hypothetical doc)
        hyde_cost = 0.0
        if use_hyde:
            # LLM call to generate hypothetical answer
            hyde_cost += (self.AVG_QUERY_TOKENS / 1_000_000) * llm["input"]
            hyde_cost += (self.AVG_ANSWER_TOKENS / 1_000_000) * llm["output"]
            # Embed the hypothetical answer
            hyde_cost += (self.AVG_ANSWER_TOKENS / 1_000_000) * emb_cost_per_m

        # Multi-query: 3 extra query reformulations
        multi_query_cost = 0.0
        if use_multi_query:
            multi_query_cost += (self.AVG_QUERY_TOKENS / 1_000_000) * llm["input"]
            multi_query_cost += (self.AVG_QUERY_TOKENS * 3 / 1_000_000) * llm["output"]
            # Embed 3 extra queries
            multi_query_cost += 3 * (self.AVG_QUERY_TOKENS / 1_000_000) * emb_cost_per_m

        # LLM generation cost (context = top_k chunks + query)
        context_tokens = top_k * avg_chunk_tokens + self.AVG_QUERY_TOKENS
        llm_input_cost = (context_tokens / 1_000_000) * llm["input"]
        llm_output_cost = (self.AVG_ANSWER_TOKENS / 1_000_000) * llm["output"]
        llm_cost = llm_input_cost + llm_output_cost

        # Reranking
        rerank_cost = 0.0
        if use_reranking:
            rerank_cost = self.RERANK_COST_PER_1000 / 1000  # per query

        total = query_embed_cost + llm_cost + rerank_cost + hyde_cost + multi_query_cost

        return {
            "embedding_cost_per_query": round(query_embed_cost, 8),
            "llm_cost_per_query": round(llm_cost, 8),
            "reranking_cost": round(rerank_cost, 8),
            "hyde_cost": round(hyde_cost, 8),
            "multi_query_cost": round(multi_query_cost, 8),
            "total_per_query": round(total, 8),
            "monthly_estimate_1000_queries": round(total * 1_000, 4),
            "monthly_estimate_10000_queries": round(total * 10_000, 4),
            "breakdown": {
                "embedding_model": embedding_model,
                "llm_model": llm_model,
                "top_k": top_k,
                "avg_chunk_tokens": avg_chunk_tokens,
                "use_reranking": use_reranking,
                "use_hyde": use_hyde,
                "use_multi_query": use_multi_query,
            },
        }

    # ------------------------------------------------------------------
    # Compare multiple configs
    # ------------------------------------------------------------------

    def compare_costs(
        self,
        configs: list[dict],
        doc_char_count: int,
    ) -> list[dict]:
        """
        Compare ingestion + query costs across multiple pipeline configurations.

        Each config dict should include at least:
            embedding_model, llm_model, chunk_size, overlap,
        and optionally:
            top_k, use_reranking, use_hyde, use_multi_query,
            contextual_chunking, avg_chunk_tokens, label.
        """
        results: list[dict] = []
        for cfg in configs:
            ingestion = self.estimate_ingestion_cost(
                doc_char_count=doc_char_count,
                chunk_size=cfg.get("chunk_size", 512),
                overlap=cfg.get("overlap", 50),
                embedding_model=cfg.get("embedding_model", "text-embedding-3-small"),
                contextual_chunking=cfg.get("contextual_chunking", False),
                llm_model=cfg.get("llm_model", "gpt-4o-mini"),
            )
            query = self.estimate_query_cost(
                embedding_model=cfg.get("embedding_model", "text-embedding-3-small"),
                llm_model=cfg.get("llm_model", "gpt-4o-mini"),
                top_k=cfg.get("top_k", 5),
                avg_chunk_tokens=cfg.get("avg_chunk_tokens", 200),
                use_reranking=cfg.get("use_reranking", False),
                use_hyde=cfg.get("use_hyde", False),
                use_multi_query=cfg.get("use_multi_query", False),
            )
            results.append({
                "label": cfg.get("label", cfg.get("embedding_model", "unknown")),
                "ingestion": ingestion,
                "query": query,
            })
        return results

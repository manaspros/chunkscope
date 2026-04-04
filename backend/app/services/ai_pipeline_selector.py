"""
AI Pipeline Selector
Takes a ContentProfile (from ai_profiler) and the corpus fingerprint signals,
then uses an LLM to select the optimal pipeline from ChunkScope's available nodes.

The LLM sees:
  1. What the data IS (ContentProfile - semantic understanding)
  2. What the data LOOKS LIKE (fingerprint signals - structural metrics)
  3. What nodes are AVAILABLE (our actual chunking/retrieval/reranking strategies)

And returns a complete pipeline recommendation with reasoning.
"""
from __future__ import annotations

import json
from typing import Any

from app.core.logging import get_logger
from app.services.ai_profiler import ContentProfile
from app.services.pipeline_recommender import (
    PipelineRecommendation,
    TechniqueRecommendation,
    WhyNot,
)

logger = get_logger(__name__)


# ── Available nodes (what the LLM can choose from) ─────────────────────

_AVAILABLE_CHUNKING = {
    "fixed": "Splits text into equal-sized chunks. Fast, predictable. Best for homogeneous text.",
    "recursive": "Recursively splits using hierarchy of separators (paragraphs, sentences, words). Best general-purpose default.",
    "semantic": "Uses embedding similarity to detect topic boundaries. Best for long-form text with topic changes.",
    "sentence_window": "Chunks centered around individual sentences with surrounding context. Best for Q&A and factoid content.",
    "paragraph": "Splits at paragraph boundaries. Best when paragraphs are well-structured.",
    "code_aware": "Preserves function/class boundaries in code. Best for source code.",
    "heading_based": "Splits at markdown/HTML headings. Best for structured documents.",
    "contextual": "LLM generates contextual preamble per chunk (Anthropic approach). Highest quality, highest cost.",
}

_AVAILABLE_RETRIEVAL = {
    "dense": "Pure vector cosine/dot-product search. Fast, simple.",
    "hybrid": "Dense vectors + BM25 keyword search combined. Best overall default.",
    "multi_query": "LLM generates multiple query reformulations, retrieves for each, merges results.",
    "hyde": "LLM generates hypothetical answer, searches with that embedding. Best for conceptual queries.",
    "parent_document": "Searches small child chunks for precision, returns larger parent chunks for context.",
    "mmr": "Maximal Marginal Relevance - balances relevance with diversity.",
    "query_expansion": "Adds synonyms and related terms to broaden the query.",
    "sentence_window_retrieval": "Retrieves individual sentences, then expands to surrounding context.",
    "contextual_compression": "LLM extracts only relevant portions from retrieved chunks.",
    "self_query": "LLM parses query into semantic search + metadata filters.",
    "metadata_filter": "Pre-filters by metadata (type, date, section) before vector search.",
    "ensemble": "Runs multiple strategies in parallel, merges with Reciprocal Rank Fusion.",
    "sub_query": "Breaks complex questions into sub-questions, retrieves for each.",
    "step_back": "Generates a broader abstract query first for foundational context.",
    "adaptive": "Auto-classifies query complexity and routes to best strategy.",
    "corrective": "Self-correcting: evaluates result quality and re-retrieves if poor.",
    "document_summary": "Two-stage: finds docs via summaries, then searches within matched docs.",
}

_AVAILABLE_RERANKING = {
    "cross_encoder": "Neural cross-encoder scoring. Best accuracy, moderate speed.",
    "cohere": "Cohere's cloud reranking API. High quality, paid.",
    "bm25_rerank": "Keyword-based BM25 rescoring. Free, fast, complements semantic.",
    "rrf": "Reciprocal Rank Fusion to merge multiple ranked lists.",
    "llm_pointwise": "LLM scores each document independently. High quality, slow.",
    "lost_in_middle": "Reorders so best results are at start/end (LLM attention pattern). Free boost.",
    "diversity": "MMR-based reranking for diverse results. Prevents redundancy.",
    "listwise_llm": "LLM ranks entire candidate list holistically. Highest quality, expensive.",
    "pairwise_llm": "LLM compares document pairs in tournament bracket. Very precise.",
    "flashrank": "Ultra-lightweight CPU-only reranker. Fastest neural option.",
    "bge": "BAAI open-source cross-encoder. Good accuracy, free.",
    "contextual_rerank": "Enriches chunks with metadata context before scoring.",
    "cascade": "Multi-stage: fast cheap reranker filters, then precise reranker scores top-k.",
}

_AVAILABLE_EMBEDDING = {
    "text-embedding-3-small": "OpenAI, $0.02/1M tokens. Best general-purpose default.",
    "text-embedding-3-large": "OpenAI, $0.13/1M tokens. Higher quality, higher cost.",
    "voyage-3-large": "Voyage AI, $0.06/1M tokens. Best for legal/dense text.",
    "jina-embeddings-v3": "Jina, $0.018/1M tokens. Good for code + mixed content.",
    "cohere-embed-v4": "Cohere, $0.10/1M tokens. Strong multilingual support.",
    "bge-m3": "BAAI, free/local. Best open-source, supports dense+sparse+ColBERT.",
    "all-MiniLM-L6-v2": "Sentence Transformers, free/local. Lightweight CPU-friendly.",
    "nomic-embed-text-v1.5": "Nomic, free/local. Good all-round open-source model.",
}


# ── Selection prompt ────────────────────────────────────────────────────

_SYSTEM_PROMPT = """You are an expert RAG (Retrieval-Augmented Generation) system architect. You deeply understand when to use different chunking, retrieval, reranking, and embedding strategies.

Your job: given a detailed understanding of a document corpus, select the OPTIMAL combination of techniques from the available options. You must pick from the provided lists - do not invent techniques.

You must respond with ONLY valid JSON, no markdown, no explanation outside the JSON."""

_SELECTION_PROMPT = """## Corpus Understanding

**Semantic Profile** (from AI analysis of the actual content):
{profile_json}

**Structural Signals** (from automated text analysis):
{signals_json}

**Corpus Stats**: {total_files} files, {total_words:,} words, corpus_size: {corpus_size}

## Available Techniques

### Chunking Strategies
{chunking_options}

### Retrieval Strategies
{retrieval_options}

### Reranking Strategies
{reranking_options}

### Embedding Models
{embedding_options}

## Selection Instructions

For THIS specific corpus, select the optimal pipeline. You MUST provide:

### Chunking (REQUIRED: 1 primary + at least 1 augmentation technique)
- Pick the PRIMARY chunking strategy and explain why it's best for this data
- Pick 1-3 AUGMENTATION techniques that complement the primary (e.g., parent-child linking, formula preservation)
- For each, explain specifically how this data benefits from it

### Retrieval (REQUIRED: 1 primary + at least 2 augmentation techniques)
- Pick the PRIMARY retrieval strategy
- Pick 2-4 AUGMENTATION techniques (e.g., query expansion, metadata filtering, HyDE)
- Retrieval benefits most from stacking - more augmentations = better recall

### Reranking (REQUIRED: 1 primary + at least 1 augmentation)
- Pick the PRIMARY reranker
- Pick 1-2 AUGMENTATION rerankers (e.g., diversity + lost-in-middle is almost always beneficial)
- Always include lost_in_middle as an augmentation - it's free and always helps

### Embedding (REQUIRED: exactly 1, but explain why NOT the alternatives)
- Pick the best embedding model
- In why_not, explain why at least 2 other embedding models are worse for this data

### Alternatives (REQUIRED: at least 5 why_not entries)
- For each major technique you DID NOT select, explain specifically why it's not optimal for THIS corpus
- Be specific: reference actual content characteristics, not generic reasons

Think step by step:
1. What kind of data is this? What makes it unique?
2. How should it be chunked to preserve meaning?
3. What retrieval strategies match the expected query types?
4. What reranking helps for this content?
5. Which embedding model fits the domain and budget?

Respond with ONLY this JSON (note: arrays MUST contain multiple items as specified above):
{{
  "chunking": [
    {{"name": "heading_based", "is_primary": true, "confidence": 0.88, "reasoning": "...", "config": {{"chunk_size": 512, "overlap": 64}}}},
    {{"name": "parent_child", "is_primary": false, "confidence": 0.75, "reasoning": "..."}},
    {{"name": "formula_preserving", "is_primary": false, "confidence": 0.70, "reasoning": "..."}}
  ],
  "retrieval": [
    {{"name": "hybrid", "is_primary": true, "confidence": 0.90, "reasoning": "..."}},
    {{"name": "hyde", "is_primary": false, "confidence": 0.72, "reasoning": "..."}},
    {{"name": "metadata_filter", "is_primary": false, "confidence": 0.68, "reasoning": "..."}}
  ],
  "reranking": [
    {{"name": "cross_encoder", "is_primary": true, "confidence": 0.85, "reasoning": "..."}},
    {{"name": "diversity", "is_primary": false, "confidence": 0.75, "reasoning": "..."}},
    {{"name": "lost_in_middle", "is_primary": false, "confidence": 0.90, "reasoning": "Always beneficial - free accuracy boost"}}
  ],
  "embedding": {{
    "name": "text-embedding-3-small", "confidence": 0.82, "reasoning": "..."
  }},
  "why_not": [
    {{"technique": "semantic (chunking)", "reason": "Vectara NAACL 2025 shows it underperforms recursive on real documents..."}},
    {{"technique": "graph_rag (retrieval)", "reason": "Cross-reference density too low for entity graph benefits..."}},
    {{"technique": "voyage-3-large (embedding)", "reason": "Overkill for this corpus size and domain..."}},
    {{"technique": "listwise_llm (reranking)", "reason": "Too expensive for this use case..."}},
    {{"technique": "code_aware (chunking)", "reason": "No significant code content detected..."}}
  ],
  "summary": "2-3 sentence summary of the pipeline and why it's optimal for this data"
}}"""


def _format_options(options: dict[str, str]) -> str:
    """Format a dict of options for the prompt."""
    return "\n".join(f"- **{k}**: {v}" for k, v in options.items())


# ── Selector ────────────────────────────────────────────────────────────

class AIPipelineSelector:
    """Uses LLM to select optimal pipeline from available nodes."""

    async def select(
        self,
        profile: ContentProfile,
        signals: dict,
        total_files: int = 1,
        total_words: int = 0,
        corpus_size: str = "medium",
        model: str = "gpt-4o-mini",
    ) -> PipelineRecommendation:
        """
        Use LLM to select optimal pipeline based on corpus understanding.

        Args:
            profile: ContentProfile from ai_profiler
            signals: Fingerprint signals dict from document_analyzer
            total_files: Number of files in corpus
            total_words: Total word count
            corpus_size: "small" | "medium" | "large"
            model: LLM model to use

        Returns:
            PipelineRecommendation with LLM-selected techniques
        """
        from app.services.llm_service import llm_service

        # Build the prompt
        profile_json = json.dumps(profile.to_dict(), indent=2)

        # Clean signals for display (remove internal fields)
        display_signals = {
            k: v for k, v in signals.items()
            if k not in ("total_lines", "total_paragraphs")
        }
        signals_json = json.dumps(display_signals, indent=2)

        prompt = _SELECTION_PROMPT.format(
            profile_json=profile_json,
            signals_json=signals_json,
            total_files=total_files,
            total_words=total_words or signals.get("total_words", 0),
            corpus_size=corpus_size,
            chunking_options=_format_options(_AVAILABLE_CHUNKING),
            retrieval_options=_format_options(_AVAILABLE_RETRIEVAL),
            reranking_options=_format_options(_AVAILABLE_RERANKING),
            embedding_options=_format_options(_AVAILABLE_EMBEDDING),
        )

        logger.info("ai_pipeline_selection_started", model=model)

        try:
            response = await llm_service.generate(
                prompt=prompt,
                system_prompt=_SYSTEM_PROMPT,
                model=model,
                temperature=0.3,
                max_tokens=3000,
            )

            recommendation = self._parse_response(response)
            logger.info(
                "ai_pipeline_selection_complete",
                chunking=[t.name for t in recommendation.chunking],
                retrieval=[t.name for t in recommendation.retrieval],
            )
            return recommendation

        except Exception as e:
            logger.error("ai_pipeline_selection_failed", error=str(e))
            raise

    @staticmethod
    def _strip_markdown_fences(text: str) -> str:
        """Robustly strip markdown code fences from LLM response."""
        import re
        text = text.strip()
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
        return text.strip()

    def _parse_response(self, response: str) -> PipelineRecommendation:
        """Parse LLM JSON response into PipelineRecommendation."""
        text = self._strip_markdown_fences(response)

        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            start = text.find("{")
            end = text.rfind("}") + 1
            if start >= 0 and end > start:
                data = json.loads(text[start:end])
            else:
                raise ValueError(f"Could not parse pipeline selection response: {text[:200]}")

        # Parse chunking
        chunking = []
        for t in data.get("chunking", []):
            if t.get("name") in _AVAILABLE_CHUNKING:
                chunking.append(TechniqueRecommendation(
                    name=t["name"],
                    category="chunking",
                    confidence=min(1.0, max(0.0, float(t.get("confidence", 0.7)))),
                    reasoning=t.get("reasoning", ""),
                    is_primary=t.get("is_primary", False),
                    config=t.get("config", {}),
                ))

        # Parse retrieval
        retrieval = []
        for t in data.get("retrieval", []):
            if t.get("name") in _AVAILABLE_RETRIEVAL:
                retrieval.append(TechniqueRecommendation(
                    name=t["name"],
                    category="retrieval",
                    confidence=min(1.0, max(0.0, float(t.get("confidence", 0.7)))),
                    reasoning=t.get("reasoning", ""),
                    is_primary=t.get("is_primary", False),
                    config=t.get("config", {}),
                ))

        # Parse reranking
        reranking = []
        for t in data.get("reranking", []):
            if t.get("name") in _AVAILABLE_RERANKING:
                reranking.append(TechniqueRecommendation(
                    name=t["name"],
                    category="reranking",
                    confidence=min(1.0, max(0.0, float(t.get("confidence", 0.7)))),
                    reasoning=t.get("reasoning", ""),
                    is_primary=t.get("is_primary", False),
                    config=t.get("config", {}),
                ))

        # Parse embedding
        emb_data = data.get("embedding", {})
        emb_name = emb_data.get("name", "text-embedding-3-small")
        if emb_name not in _AVAILABLE_EMBEDDING:
            emb_name = "text-embedding-3-small"
        embedding = TechniqueRecommendation(
            name=emb_name,
            category="embedding",
            confidence=min(1.0, max(0.0, float(emb_data.get("confidence", 0.7)))),
            reasoning=emb_data.get("reasoning", ""),
            is_primary=True,
            config={},
        )

        # Parse why_not
        why_not = []
        for w in data.get("why_not", []):
            why_not.append(WhyNot(
                technique=w.get("technique", ""),
                reason=w.get("reason", ""),
            ))

        # Fallbacks if LLM returned empty lists
        if not chunking:
            chunking = [TechniqueRecommendation(
                name="recursive", category="chunking",
                confidence=0.7, reasoning="Fallback: LLM did not select a chunking strategy.",
                is_primary=True, config={"chunk_size": 512, "overlap": 50},
            )]
        if not retrieval:
            retrieval = [TechniqueRecommendation(
                name="hybrid", category="retrieval",
                confidence=0.7, reasoning="Fallback: LLM did not select a retrieval strategy.",
                is_primary=True,
            )]
        if not reranking:
            reranking = [TechniqueRecommendation(
                name="cross_encoder", category="reranking",
                confidence=0.7, reasoning="Fallback: LLM did not select a reranking strategy.",
                is_primary=True,
            )]

        # Validate minimum technique counts per stage
        _min_counts = {"chunking": 2, "retrieval": 3, "reranking": 2}
        for stage_name, min_count in _min_counts.items():
            stage_list = {"chunking": chunking, "retrieval": retrieval, "reranking": reranking}[stage_name]
            if len(stage_list) < min_count:
                logger.warning(
                    "ai_pipeline_selection_sparse_stage",
                    stage=stage_name,
                    expected_min=min_count,
                    actual=len(stage_list),
                    techniques=[t.name for t in stage_list],
                )

        # Compute overall confidence
        all_techniques = chunking + retrieval + reranking + [embedding]
        overall_confidence = sum(t.confidence for t in all_techniques) / len(all_techniques)

        summary = data.get("summary", "AI-selected pipeline based on semantic corpus analysis.")

        return PipelineRecommendation(
            chunking=chunking,
            retrieval=retrieval,
            reranking=reranking,
            embedding=embedding,
            why_not=why_not,
            overall_confidence=overall_confidence,
            summary=summary,
        )


# Singleton
ai_pipeline_selector = AIPipelineSelector()

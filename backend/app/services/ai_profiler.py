"""
AI Semantic Profiler
Analyzes corpus content using LLM to understand what the data actually IS,
not just surface-level regex patterns. This enables intelligent pipeline selection.

Flow:
  1. Collect document texts from project
  2. Smart sampling: stratified by length/type, pick diverse representatives
  3. Send samples to LLM with structured profiling prompt
  4. Parse response into ContentProfile
"""
from __future__ import annotations

import json
import random
import re
from dataclasses import dataclass, field, asdict
from typing import Any

from app.core.logging import get_logger

logger = get_logger(__name__)

# Maximum tokens to sample per document for the LLM call
_MAX_SAMPLE_CHARS = 1500
# Maximum total chars to send to LLM across all samples
_MAX_TOTAL_CHARS = 30000
# Target sample count per cluster/bucket
_SAMPLES_PER_BUCKET = 2


@dataclass
class ContentProfile:
    """Semantic understanding of a corpus, produced by LLM analysis."""

    # What kind of content this is
    content_types: list[str] = field(default_factory=list)
    # e.g. ["textbook", "exercises", "reference_tables"]

    domain: str = "general"
    # e.g. "physics", "legal", "software_engineering", "finance"

    structure_level: str = "flat"
    # "flat" | "sectioned" | "hierarchical" | "mixed"

    entity_density: str = "low"
    # "low" | "medium" | "high"

    relationship_type: str = "independent"
    # "independent" | "sequential" | "interconnected" | "hierarchical_concepts"

    expected_query_types: list[str] = field(default_factory=list)
    # e.g. ["explain_concept", "find_definition", "compare", "solve_problem"]

    language_complexity: str = "moderate"
    # "simple" | "moderate" | "dense" | "technical"

    has_formulas: bool = False
    has_code: bool = False
    has_tables: bool = False
    has_images_referenced: bool = False
    has_cross_references: bool = False

    # Free-form insights the LLM noticed
    key_observations: list[str] = field(default_factory=list)

    # Raw LLM reasoning
    reasoning: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# ── Sampling ────────────────────────────────────────────────────────────

def _stratified_sample(
    documents: list[dict],
    max_samples: int = 20,
) -> list[dict]:
    """
    Pick diverse document samples using stratified sampling by length and type.

    Each document dict must have:
      - "text": str (the document content)
      - "filename": str
      - "doc_type": str (optional)

    Returns a subset of documents with truncated text.
    """
    if not documents:
        return []

    # Bucket by doc_type
    buckets: dict[str, list[dict]] = {}
    for doc in documents:
        dtype = doc.get("doc_type", "unknown")
        buckets.setdefault(dtype, []).append(doc)

    # Within each bucket, sort by text length and pick diverse samples
    # (short, medium, long) to capture structural variety
    selected: list[dict] = []
    per_bucket = max(1, max_samples // max(len(buckets), 1))

    for dtype, docs in buckets.items():
        docs_sorted = sorted(docs, key=lambda d: len(d.get("text", "")))
        if len(docs_sorted) <= per_bucket:
            picks = docs_sorted
        elif per_bucket == 1:
            # Only want 1 sample from this bucket – take the middle one
            picks = [docs_sorted[len(docs_sorted) // 2]]
        else:
            # Pick evenly spaced samples (short, mid, long)
            indices = [
                int(i * (len(docs_sorted) - 1) / (per_bucket - 1))
                for i in range(per_bucket)
            ]
            picks = [docs_sorted[i] for i in indices]
        selected.extend(picks)

    # Truncate each sample and cap total
    result = []
    total_chars = 0
    for doc in selected:
        text = doc.get("text", "")[:_MAX_SAMPLE_CHARS]
        if total_chars + len(text) > _MAX_TOTAL_CHARS:
            break
        result.append({
            "filename": doc.get("filename", "unknown"),
            "doc_type": doc.get("doc_type", "unknown"),
            "text_sample": text,
            "full_length": len(doc.get("text", "")),
        })
        total_chars += len(text)

    return result


# ── Profiling prompt ────────────────────────────────────────────────────

_SYSTEM_PROMPT = """You are a data analysis expert specializing in document collections and RAG (Retrieval-Augmented Generation) systems. Your job is to deeply understand what a corpus of documents contains, how it's structured, and what kind of queries users would ask against it.

You must respond with ONLY valid JSON, no markdown, no explanation outside the JSON."""

_PROFILE_PROMPT_TEMPLATE = """Analyze these document samples from a corpus of {total_files} files ({total_words:,} total words).

## Document Samples

{samples_text}

## Analysis Instructions

Based on these samples, determine:

1. **content_types**: What kinds of content are in this corpus? (e.g., "textbook_chapters", "api_documentation", "legal_contracts", "research_papers", "faq", "code_with_comments", "meeting_notes", "financial_reports")

2. **domain**: What domain/field is this? (e.g., "physics", "computer_science", "law", "medicine", "finance", "general")

3. **structure_level**: How structured is the content?
   - "flat": Plain text, no clear sections
   - "sectioned": Has headings/sections but shallow
   - "hierarchical": Deep nested structure (chapters > sections > subsections)
   - "mixed": Different files have different structures

4. **entity_density**: How many named entities (people, organizations, specific terms)?
   - "low": Few specific entities, mostly conceptual
   - "medium": Regular references to specific things
   - "high": Entity-rich (legal parties, medical terms, API names)

5. **relationship_type**: How do concepts in the corpus relate to each other?
   - "independent": Each section/document stands alone
   - "sequential": Concepts build on previous ones (textbook-style)
   - "interconnected": Heavy cross-referencing between topics
   - "hierarchical_concepts": Concepts organized in a taxonomy/tree

6. **expected_query_types**: What queries would users ask? Pick ALL that apply:
   - "factual_lookup": Find specific facts/definitions
   - "explain_concept": Explain how something works
   - "compare": Compare two things
   - "solve_problem": Apply knowledge to solve a problem
   - "find_code": Find code examples or API usage
   - "summarize": Summarize a section or topic
   - "multi_hop": Questions requiring info from multiple sections
   - "temporal": Questions about dates, timelines, sequences

7. **language_complexity**: How complex is the language?
   - "simple": Short sentences, basic vocabulary
   - "moderate": Standard professional writing
   - "dense": Long sentences, complex clauses (legal, academic)
   - "technical": Heavy jargon, abbreviations, formulas

8. **has_formulas**: Does the content contain mathematical formulas/equations?
9. **has_code**: Does the content contain code snippets?
10. **has_tables**: Does the content contain tabular data?
11. **has_images_referenced**: Does the text reference figures/diagrams/images?
12. **has_cross_references**: Does the text reference other sections ("see Chapter 3", "as defined in Section 2.1")?

13. **key_observations**: List 3-5 specific observations about this corpus that would affect how a RAG system should be built for it. Be specific to THIS data, not generic advice.

14. **reasoning**: In 2-3 sentences, explain what this corpus is and why it needs specific RAG treatment.

Respond with ONLY this JSON structure:
{{
  "content_types": [...],
  "domain": "...",
  "structure_level": "...",
  "entity_density": "...",
  "relationship_type": "...",
  "expected_query_types": [...],
  "language_complexity": "...",
  "has_formulas": true/false,
  "has_code": true/false,
  "has_tables": true/false,
  "has_images_referenced": true/false,
  "has_cross_references": true/false,
  "key_observations": [...],
  "reasoning": "..."
}}"""


def _build_samples_text(samples: list[dict]) -> str:
    """Format samples for the prompt."""
    parts = []
    for i, s in enumerate(samples, 1):
        parts.append(
            f"### Sample {i}: {s['filename']} (type: {s['doc_type']}, "
            f"full length: {s['full_length']:,} chars)\n"
            f"```\n{s['text_sample']}\n```"
        )
    return "\n\n".join(parts)


# ── Profiler ────────────────────────────────────────────────────────────

class AIProfiler:
    """Profiles a corpus using LLM semantic analysis."""

    async def profile(
        self,
        documents: list[dict],
        total_files: int | None = None,
        total_words: int | None = None,
        model: str = "gpt-4o-mini",
    ) -> ContentProfile:
        """
        Profile a corpus by sampling documents and analyzing with LLM.

        Args:
            documents: List of dicts with keys: text, filename, doc_type
            total_files: Total file count (if different from len(documents))
            total_words: Total word count across corpus
            model: LLM model to use

        Returns:
            ContentProfile with semantic understanding of the corpus
        """
        from app.services.llm_service import llm_service

        if not documents:
            return ContentProfile()

        total_files = total_files or len(documents)
        if not total_words:
            total_words = sum(len(d.get("text", "").split()) for d in documents)

        # Sample documents
        samples = _stratified_sample(documents, max_samples=20)
        if not samples:
            return ContentProfile()

        logger.info(
            "ai_profiling_corpus",
            total_files=total_files,
            sampled_files=len(samples),
            total_words=total_words,
        )

        # Build prompt
        samples_text = _build_samples_text(samples)
        prompt = _PROFILE_PROMPT_TEMPLATE.format(
            total_files=total_files,
            total_words=total_words,
            samples_text=samples_text,
        )

        # Call LLM
        try:
            response = await llm_service.generate(
                prompt=prompt,
                system_prompt=_SYSTEM_PROMPT,
                model=model,
                temperature=0.3,
                max_tokens=2000,
            )

            # Parse JSON response
            profile = self._parse_response(response)
            logger.info("ai_profiling_complete", domain=profile.domain, structure=profile.structure_level)
            return profile

        except Exception as e:
            logger.error("ai_profiling_failed", error=str(e))
            raise

    @staticmethod
    def _strip_markdown_fences(text: str) -> str:
        """Robustly strip markdown code fences from LLM response."""
        text = text.strip()
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
        return text.strip()

    def _parse_response(self, response: str) -> ContentProfile:
        """Parse LLM JSON response into ContentProfile."""
        text = self._strip_markdown_fences(response)

        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            # Try to extract JSON from the response
            start = text.find("{")
            end = text.rfind("}") + 1
            if start >= 0 and end > start:
                data = json.loads(text[start:end])
            else:
                raise ValueError(f"Could not parse LLM response as JSON: {text[:200]}")

        return ContentProfile(
            content_types=data.get("content_types", []),
            domain=data.get("domain", "general"),
            structure_level=data.get("structure_level", "flat"),
            entity_density=data.get("entity_density", "low"),
            relationship_type=data.get("relationship_type", "independent"),
            expected_query_types=data.get("expected_query_types", []),
            language_complexity=data.get("language_complexity", "moderate"),
            has_formulas=data.get("has_formulas", False),
            has_code=data.get("has_code", False),
            has_tables=data.get("has_tables", False),
            has_images_referenced=data.get("has_images_referenced", False),
            has_cross_references=data.get("has_cross_references", False),
            key_observations=data.get("key_observations", []),
            reasoning=data.get("reasoning", ""),
        )


# Singleton
ai_profiler = AIProfiler()

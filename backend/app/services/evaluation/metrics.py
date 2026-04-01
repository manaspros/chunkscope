"""
RAG Evaluation Metrics
Implements faithfulness, answer relevancy, context precision/recall, hit rate, and MRR.
All LLM/embedding calls go through llm_service.
"""
from __future__ import annotations

import json
import math
import re
from typing import Optional

from app.core.logging import get_logger
from app.services.llm_service import llm_service

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two vectors."""
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


async def _decompose_into_claims(text: str) -> list[str]:
    """Use the LLM to split text into atomic claims/sentences."""
    prompt = (
        "Decompose the following text into a list of independent, atomic claims. "
        "Each claim should be a single factual statement that can be verified on its own.\n\n"
        "Return ONLY a JSON array of strings, no other text.\n\n"
        f"Text:\n{text}"
    )
    raw = await llm_service.generate(
        prompt=prompt,
        system_prompt="You are a precise text analyst. Respond only with valid JSON.",
        temperature=0.0,
        max_tokens=2048,
    )
    try:
        # Strip possible markdown fences
        cleaned = re.sub(r"^```(?:json)?\s*", "", raw.strip())
        cleaned = re.sub(r"\s*```$", "", cleaned)
        claims = json.loads(cleaned)
        if isinstance(claims, list):
            return [str(c) for c in claims if c]
    except (json.JSONDecodeError, TypeError):
        pass
    # Fallback: split on sentence boundaries
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]


async def _check_entailment(claim: str, context: str) -> bool:
    """Use the LLM to decide if *context* entails *claim*."""
    prompt = (
        "Determine whether the following context supports the given claim.\n\n"
        f"Context:\n{context}\n\n"
        f"Claim:\n{claim}\n\n"
        'Answer with exactly "yes" or "no".'
    )
    raw = await llm_service.generate(
        prompt=prompt,
        system_prompt="You are a precise NLI judge. Respond with exactly one word.",
        temperature=0.0,
        max_tokens=8,
    )
    return raw.strip().lower().startswith("yes")


# ---------------------------------------------------------------------------
# Metric implementations
# ---------------------------------------------------------------------------

async def faithfulness_score(
    answer: str,
    context_chunks: list[str],
) -> tuple[float, dict]:
    """
    Faithfulness: fraction of answer claims supported by the context.

    Returns (score, details) where details includes per-claim verdicts.
    """
    claims = await _decompose_into_claims(answer)
    if not claims:
        return 1.0, {"claims": [], "note": "no claims extracted"}

    merged_context = "\n\n".join(context_chunks)
    verdicts: list[dict] = []
    supported = 0
    for claim in claims:
        entailed = await _check_entailment(claim, merged_context)
        verdicts.append({"claim": claim, "supported": entailed})
        if entailed:
            supported += 1

    score = supported / len(claims)
    return score, {"claims": verdicts, "supported": supported, "total": len(claims)}


async def answer_relevancy_score(
    question: str,
    answer: str,
) -> tuple[float, dict]:
    """
    Answer relevancy: cosine similarity between question embedding and answer embedding.
    """
    embeddings = await llm_service.embed([question, answer])
    sim = _cosine_similarity(embeddings[0], embeddings[1])
    # Clamp to [0, 1]
    score = max(0.0, min(1.0, sim))
    return score, {"cosine_similarity": sim}


async def context_precision_score(
    context_chunks: list[str],
    relevance_labels: list[bool],
) -> tuple[float, dict]:
    """
    Context precision: position-weighted precision of relevant chunks.

    precision@k = (relevant in top-k) / k, weighted by 1/k.
    Final score = sum(precision@k * rel_k) / sum(rel_k)
    """
    if not context_chunks or not relevance_labels:
        return 0.0, {"note": "empty input"}

    n = min(len(context_chunks), len(relevance_labels))
    labels = relevance_labels[:n]

    total_relevant = sum(labels)
    if total_relevant == 0:
        return 0.0, {"note": "no relevant chunks"}

    cumulative_relevant = 0
    weighted_sum = 0.0
    per_position: list[dict] = []

    for k in range(1, n + 1):
        if labels[k - 1]:
            cumulative_relevant += 1
            precision_at_k = cumulative_relevant / k
            weighted_sum += precision_at_k
        per_position.append({
            "k": k,
            "relevant": labels[k - 1],
            "cumulative_relevant": cumulative_relevant,
        })

    score = weighted_sum / total_relevant
    return score, {"per_position": per_position}


async def context_recall_score(
    context_chunks: list[str],
    ground_truth: str,
) -> tuple[float, dict]:
    """
    Context recall: fraction of ground-truth claims covered by the retrieved context.
    """
    claims = await _decompose_into_claims(ground_truth)
    if not claims:
        return 1.0, {"claims": [], "note": "no ground-truth claims"}

    merged_context = "\n\n".join(context_chunks)
    covered = 0
    verdicts: list[dict] = []
    for claim in claims:
        entailed = await _check_entailment(claim, merged_context)
        verdicts.append({"claim": claim, "covered": entailed})
        if entailed:
            covered += 1

    score = covered / len(claims)
    return score, {"claims": verdicts, "covered": covered, "total": len(claims)}


def hit_rate_at_k(
    relevance_labels: list[bool],
    k: int = 5,
) -> tuple[float, dict]:
    """
    Hit Rate @ k: 1 if any relevant chunk appears in the top-k, else 0.
    """
    top_k_labels = relevance_labels[:k]
    hit = 1.0 if any(top_k_labels) else 0.0
    return hit, {"k": k, "hit": bool(hit)}


def mrr_score(
    relevance_labels: list[bool],
) -> tuple[float, dict]:
    """
    Mean Reciprocal Rank: 1 / rank of the first relevant result.
    """
    for i, rel in enumerate(relevance_labels):
        if rel:
            rank = i + 1
            return 1.0 / rank, {"first_relevant_rank": rank}
    return 0.0, {"first_relevant_rank": None}

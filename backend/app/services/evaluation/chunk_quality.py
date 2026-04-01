"""
Chunk Quality Scoring
Evaluates individual chunks for semantic coherence, boundary quality, and size appropriateness.
"""
from __future__ import annotations

import math
import re
from typing import Optional

from app.core.logging import get_logger
from app.services.llm_service import llm_service

logger = get_logger(__name__)


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def _split_sentences(text: str) -> list[str]:
    """Naive sentence splitter."""
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    return [s.strip() for s in sentences if s.strip()]


# ---------------------------------------------------------------------------
# Semantic Coherence
# ---------------------------------------------------------------------------

async def semantic_coherence(text: str) -> float:
    """
    Embed each sentence in the chunk, compute mean pairwise cosine similarity.
    Returns a score in [0, 1]. Low = sentences discuss unrelated topics.
    """
    sentences = _split_sentences(text)
    if len(sentences) <= 1:
        # A single sentence is trivially coherent.
        return 1.0

    embeddings = await llm_service.embed(sentences)

    total_sim = 0.0
    pairs = 0
    for i in range(len(embeddings)):
        for j in range(i + 1, len(embeddings)):
            total_sim += _cosine_similarity(embeddings[i], embeddings[j])
            pairs += 1

    if pairs == 0:
        return 1.0

    mean_sim = total_sim / pairs
    # Clamp to [0, 1] (cosine sim can be negative for dissimilar texts)
    return max(0.0, min(1.0, mean_sim))


# ---------------------------------------------------------------------------
# Boundary Quality
# ---------------------------------------------------------------------------

def boundary_quality(text: str) -> float:
    """
    Heuristic check for clean chunk boundaries.

    Deductions:
    - Starts mid-sentence (first non-whitespace char is lowercase) -> -0.5
    - Ends mid-sentence (last char is not terminal punctuation)    -> -0.5

    Returns score in [0, 1].
    """
    stripped = text.strip()
    if not stripped:
        return 0.0

    score = 1.0

    # Check start: first alphabetic char should be uppercase or a digit/symbol
    first_alpha = next((c for c in stripped if c.isalpha()), None)
    if first_alpha and first_alpha.islower():
        score -= 0.5

    # Check end: should end with terminal punctuation
    terminal = {'.', '!', '?', '"', "'", ')', ']'}
    if stripped[-1] not in terminal:
        score -= 0.5

    return max(0.0, score)


# ---------------------------------------------------------------------------
# Size Appropriateness
# ---------------------------------------------------------------------------

def size_appropriateness(text: str, target_size: int = 512) -> float:
    """
    Score based on how close the chunk length (in characters) is to the target.

    Uses a Gaussian-like decay: score = exp(-(deviation/target)^2).
    A chunk exactly at target_size gets 1.0. Very short or very long chunks
    score closer to 0.
    """
    if target_size <= 0:
        return 1.0

    length = len(text)
    deviation = abs(length - target_size)
    ratio = deviation / target_size
    return math.exp(-(ratio ** 2))


# ---------------------------------------------------------------------------
# Composite
# ---------------------------------------------------------------------------

async def score_chunk(
    text: str,
    target_size: int = 512,
) -> dict[str, float]:
    """
    Compute all quality scores for a single chunk.
    Returns dict with keys: semantic_coherence, boundary_quality, size_appropriateness, overall.
    """
    sc = await semantic_coherence(text)
    bq = boundary_quality(text)
    sa = size_appropriateness(text, target_size)
    overall = (sc + bq + sa) / 3.0
    return {
        "semantic_coherence": round(sc, 4),
        "boundary_quality": round(bq, 4),
        "size_appropriateness": round(sa, 4),
        "overall": round(overall, 4),
    }

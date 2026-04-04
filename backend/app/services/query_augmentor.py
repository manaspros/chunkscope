import logging
import json
from collections import OrderedDict
from typing import List, Optional

logger = logging.getLogger(__name__)

# Maximum number of entries in the LRU cache
_CACHE_MAX_SIZE = 1000


class _LRUCache:
    """Simple thread-safe-ish LRU cache backed by an OrderedDict."""

    def __init__(self, max_size: int = _CACHE_MAX_SIZE):
        self._cache: OrderedDict[str, str] = OrderedDict()
        self._max_size = max_size

    def get(self, key: str) -> Optional[str]:
        if key in self._cache:
            self._cache.move_to_end(key)
            return self._cache[key]
        return None

    def put(self, key: str, value: str) -> None:
        if key in self._cache:
            self._cache.move_to_end(key)
        self._cache[key] = value
        if len(self._cache) > self._max_size:
            self._cache.popitem(last=False)


class QueryAugmentor:
    """
    Service for augmenting user queries using LLMs.
    Supports Multi-Query generation, HyDE, and Query Expansion.
    Uses LiteLLM via the unified llm_service.
    """

    _cache = _LRUCache()

    async def _get_completion(self, system_prompt: str, user_prompt: str, cache_key: str) -> str:
        """Helper to get completion with bounded LRU caching."""
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        try:
            from app.services.llm_service import llm_service

            content = await llm_service.generate(
                prompt=user_prompt,
                system_prompt=system_prompt,
                model="gpt-4o-mini",
                temperature=0.0,
                max_tokens=300,
            )
            self._cache.put(cache_key, content)
            return content
        except Exception as e:
            logger.error(f"LLM augmentation failed: {e}")
            return user_prompt  # Fallback to original

    async def augment_multi_query(self, query: str, num_variants: int = 3) -> List[str]:
        """Generate multiple variants of the query."""
        system_prompt = (
            f"You are a search query optimizer. Generate {num_variants} different variations "
            "of the user's search query to improve retrieval coverage. "
            "Return ONLY a JSON list of strings."
        )
        user_prompt = f"Original Query: {query}"
        cache_key = f"multi_{query}_{num_variants}"

        response_text = await self._get_completion(system_prompt, user_prompt, cache_key)

        # Clean markdown fences from LLM response
        import re
        cleaned = re.sub(r"^```(?:json)?\s*", "", response_text.strip())
        cleaned = re.sub(r"\s*```$", "", cleaned)

        try:
            variants = json.loads(cleaned)
            if isinstance(variants, list):
                # Clean each variant
                variants = [str(v).strip().strip('"').strip("'").rstrip(",") for v in variants if str(v).strip()]
                variants = [v for v in variants if len(v) > 3]  # Filter garbage
                if query not in variants:
                    variants = [query] + variants[:num_variants - 1]
                return variants[:num_variants]
        except Exception:
            pass

        # Fallback: line-by-line parsing
        lines = cleaned.split('\n')
        variants = []
        for line in lines:
            line = line.strip().strip('"').strip("'").rstrip(",").strip()
            # Skip JSON artifacts
            if not line or line in ('[', ']', '```', '```json'):
                continue
            # Remove numbered prefixes like "1. " or "- "
            line = re.sub(r"^[\d]+\.\s*", "", line)
            line = re.sub(r"^[-*]\s*", "", line)
            if len(line) > 3:
                variants.append(line)

        if not variants:
            return [query]
        if query not in variants:
            variants = [query] + variants[:num_variants - 1]
        return variants[:num_variants]

    async def augment_hyde(self, query: str) -> str:
        """Generate a hypothetical document (HyDE)."""
        system_prompt = (
            "You are a helpful assistant. Provide a brief, hypothetical answer "
            "to the user's search query. This answer will be used to improve "
            "semantic search by matching against potential documents."
        )
        user_prompt = f"Query: {query}"
        cache_key = f"hyde_{query}"

        return await self._get_completion(system_prompt, user_prompt, cache_key)

    async def augment_expansion(self, query: str) -> str:
        """Expand the query with synonyms and related terms."""
        system_prompt = (
            "You are a search optimizer. Expand the user's query with relevant "
            "keywords, synonyms, and technical terms to improve recall. "
            "Return the original query followed by the expanded terms."
        )
        user_prompt = f"Query: {query}"
        cache_key = f"expand_{query}"

        return await self._get_completion(system_prompt, user_prompt, cache_key)


query_augmentor = QueryAugmentor()

"""
Unified LLM Service using LiteLLM
All LLM calls should go through this service for provider-agnostic access.
"""
from typing import AsyncGenerator, Optional

import litellm
from litellm import acompletion, aembedding

from app.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# Configure LiteLLM defaults
if settings.litellm_api_key:
    litellm.api_key = settings.litellm_api_key
if settings.litellm_base_url:
    litellm.api_base = settings.litellm_base_url

# Pass through provider keys if set
if settings.openai_api_key:
    import os
    os.environ.setdefault("OPENAI_API_KEY", settings.openai_api_key)
if settings.cohere_api_key:
    import os
    os.environ.setdefault("COHERE_API_KEY", settings.cohere_api_key)


class LLMService:
    """Unified LLM service wrapping LiteLLM for provider-agnostic access."""

    async def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        model: str = "gpt-4o-mini",
        temperature: float = 0.7,
        max_tokens: int = 1024,
    ) -> str:
        """
        Generate a completion from an LLM.

        Args:
            prompt: The user prompt.
            system_prompt: Optional system prompt.
            model: Model identifier (e.g. 'gpt-4o-mini', 'claude-3-haiku-20240307').
            temperature: Sampling temperature.
            max_tokens: Maximum tokens in response.

        Returns:
            Generated text string.
        """
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        try:
            response = await acompletion(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            return response.choices[0].message.content
        except Exception as e:
            logger.error("llm_generate_failed", model=model, error=str(e))
            raise

    async def generate_stream(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        model: str = "gpt-4o-mini",
        temperature: float = 0.7,
        max_tokens: int = 1024,
    ) -> AsyncGenerator[str, None]:
        """
        Stream a completion from an LLM.

        Yields:
            Text chunks as they arrive.
        """
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        try:
            response = await acompletion(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                stream=True,
            )
            async for chunk in response:
                delta = chunk.choices[0].delta
                if delta and delta.content:
                    yield delta.content
        except Exception as e:
            logger.error("llm_stream_failed", model=model, error=str(e))
            raise

    async def embed(
        self,
        texts: list[str],
        model: str = "text-embedding-3-small",
    ) -> list[list[float]]:
        """
        Generate embeddings for a list of texts.

        Args:
            texts: List of text strings to embed.
            model: Embedding model identifier.

        Returns:
            List of embedding vectors.
        """
        try:
            response = await aembedding(
                model=model,
                input=texts,
            )
            return [item["embedding"] for item in response.data]
        except Exception as e:
            logger.error("llm_embed_failed", model=model, error=str(e))
            raise


# Singleton instance
llm_service = LLMService()

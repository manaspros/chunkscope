import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from app.services.embeddings import get_embedder, OpenAIEmbedder, LocalHuggingFaceEmbedder

@pytest.mark.asyncio
async def test_openai_embedder_mock():
    # Mock AsyncOpenAI client
    mock_client = MagicMock()
    mock_client.embeddings.create = AsyncMock()
    
    # Mock response
    mock_response = MagicMock()
    mock_data = MagicMock()
    mock_data.embedding = [0.1, 0.2, 0.3]
    mock_response.data = [mock_data]
    mock_client.embeddings.create.return_value = mock_response
    
    with patch('app.services.embeddings.openai_embedder.AsyncOpenAI', return_value=mock_client):
        embedder = OpenAIEmbedder(api_key="test-key")
        embeddings = await embedder.embed(["test text"])
        
        assert len(embeddings) == 1
        assert embeddings[0] == [0.1, 0.2, 0.3]
        assert embedder.provider_name == "openai"
        assert embedder.dimensions == 1536

@pytest.mark.asyncio
async def test_local_embedder():
    # We can actually test the local embedder if sentence-transformers is installed
    # Use a very small model for testing if possible, but all-MiniLM-L6-v2 is already pretty small
    embedder = get_embedder("local", "all-MiniLM-L6-v2")
    
    texts = ["hello world", "this is a test"]
    embeddings = await embedder.embed(texts)
    
    assert len(embeddings) == 2
    assert len(embeddings[0]) == 384
    assert embedder.provider_name == "local"
    assert embedder.cost_per_million_tokens == 0.0

def test_embedder_factory():
    openai = get_embedder("openai", "text-embedding-ada-002", api_key="abc")
    assert isinstance(openai, OpenAIEmbedder)
    
    local = get_embedder("local", "all-MiniLM-L6-v2")
    assert isinstance(local, LocalHuggingFaceEmbedder)
    
    with pytest.raises(ValueError):
        get_embedder("invalid", "model")

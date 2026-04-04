"""
Configuration Endpoints Integration Tests
"""
import pytest
import pytest_asyncio
from httpx import AsyncClient
from uuid import uuid4

from app.models import Document, DocumentType


@pytest_asyncio.fixture
async def test_document(test_db) -> Document:
    """Create a test document."""
    doc = Document(
        filename="test123.pdf",
        original_filename="test.pdf",
        file_path="./uploads/test123.pdf",
        file_type=DocumentType.PDF,
        file_size_bytes=1024,
        doc_metadata={"page_count": 10, "word_count": 500},
        is_processed=True,
    )
    test_db.add(doc)
    await test_db.commit()
    await test_db.refresh(doc)
    return doc


# ============================================
# Document Analysis Tests
# ============================================

@pytest.mark.asyncio
async def test_analyze_document(
    client: AsyncClient,
    test_document: Document,
):
    """Test document analysis."""
    response = await client.post(
        "/api/v1/config/analyze-document",
        json={"document_id": str(test_document.id)},
    )
    
    assert response.status_code == 200
    data = response.json()
    assert "document_type" in data
    assert "structure" in data
    assert "characteristics" in data
    assert "recommendations" in data
    assert "chunker" in data["recommendations"]
    assert "chunk_size" in data["recommendations"]


@pytest.mark.asyncio
async def test_analyze_document_not_found(
    client: AsyncClient,
):
    """Test error when document doesn't exist."""
    fake_id = uuid4()
    response = await client.post(
        "/api/v1/config/analyze-document",
        json={"document_id": str(fake_id)},
    )
    
    assert response.status_code == 404


# ============================================
# Pipeline Validation Tests
# ============================================

@pytest.mark.asyncio
async def test_validate_valid_pipeline(
    client: AsyncClient,
):
    """Test validating a valid pipeline."""
    response = await client.post(
        "/api/v1/config/validate-pipeline",
        json={
            "nodes": [
                {"id": "n1", "type": "chunker"},
                {"id": "n2", "type": "embedder"},
            ],
            "edges": [
                {"id": "e1", "source": "n1", "target": "n2"},
            ],
        },
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["valid"] is True
    assert len(data["errors"]) == 0


@pytest.mark.asyncio
async def test_validate_empty_pipeline(
    client: AsyncClient,
):
    """Test validation error for empty pipeline."""
    response = await client.post(
        "/api/v1/config/validate-pipeline",
        json={"nodes": [], "edges": []},
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["valid"] is False
    assert any("at least one node" in e["message"] for e in data["errors"])


@pytest.mark.asyncio
async def test_validate_duplicate_node_ids(
    client: AsyncClient,
):
    """Test validation error for duplicate node IDs."""
    response = await client.post(
        "/api/v1/config/validate-pipeline",
        json={
            "nodes": [
                {"id": "n1", "type": "chunker"},
                {"id": "n1", "type": "embedder"},  # Duplicate ID
            ],
            "edges": [],
        },
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["valid"] is False
    assert any("unique" in e["message"] for e in data["errors"])


@pytest.mark.asyncio
async def test_validate_invalid_edge_target(
    client: AsyncClient,
):
    """Test validation error for edge pointing to non-existent node."""
    response = await client.post(
        "/api/v1/config/validate-pipeline",
        json={
            "nodes": [
                {"id": "n1", "type": "chunker"},
            ],
            "edges": [
                {"id": "e1", "source": "n1", "target": "n999"},  # Invalid target
            ],
        },
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["valid"] is False
    assert any("does not exist" in e["message"] for e in data["errors"])


@pytest.mark.asyncio
async def test_validate_cyclic_pipeline(
    client: AsyncClient,
):
    """Test validation error for pipeline with cycle."""
    response = await client.post(
        "/api/v1/config/validate-pipeline",
        json={
            "nodes": [
                {"id": "n1", "type": "chunker"},
                {"id": "n2", "type": "embedder"},
            ],
            "edges": [
                {"id": "e1", "source": "n1", "target": "n2"},
                {"id": "e2", "source": "n2", "target": "n1"},  # Creates cycle
            ],
        },
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["valid"] is False
    assert any("cycle" in e["message"].lower() for e in data["errors"])


@pytest.mark.asyncio
async def test_validate_orphan_node_warning(
    client: AsyncClient,
):
    """Test warning for orphan nodes."""
    response = await client.post(
        "/api/v1/config/validate-pipeline",
        json={
            "nodes": [
                {"id": "n1", "type": "chunker"},
                {"id": "n2", "type": "embedder"},
                {"id": "n3", "type": "retriever"},  # Orphan
            ],
            "edges": [
                {"id": "e1", "source": "n1", "target": "n2"},
            ],
        },
    )
    
    assert response.status_code == 200
    data = response.json()
    # Valid but with warnings
    assert len(data["warnings"]) >= 1
    assert any("not connected" in w["message"] for w in data["warnings"])


@pytest.mark.asyncio
async def test_validate_cost_estimation(
    client: AsyncClient,
):
    """Test cost estimation in validation response."""
    response = await client.post(
        "/api/v1/config/validate-pipeline",
        json={
            "nodes": [
                {"id": "n1", "type": "chunker"},
                {"id": "n2", "type": "embedder"},
                {"id": "n3", "type": "llm"},
            ],
            "edges": [
                {"id": "e1", "source": "n1", "target": "n2"},
                {"id": "e2", "source": "n2", "target": "n3"},
            ],
        },
    )
    
    assert response.status_code == 200
    data = response.json()
    assert "estimated_cost_per_1k_docs" in data
    assert data["estimated_cost_per_1k_docs"] > 0

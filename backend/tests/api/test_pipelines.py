"""
Pipeline Endpoints Integration Tests
"""
import pytest
import pytest_asyncio
from httpx import AsyncClient
from uuid import uuid4

from app.models import Document, Pipeline, DocumentType, PipelineStatus


@pytest_asyncio.fixture
async def test_pipeline(test_db) -> Pipeline:
    """Create a test pipeline."""
    pipeline = Pipeline(
        name="Test Pipeline",
        description="A test pipeline",
        nodes=[
            {"id": "n1", "type": "chunker", "position": {"x": 0, "y": 0}, "config": {}},
            {"id": "n2", "type": "embedder", "position": {"x": 100, "y": 0}, "config": {}},
        ],
        edges=[
            {"id": "e1", "source": "n1", "target": "n2"},
        ],
        settings={},
    )
    test_db.add(pipeline)
    await test_db.commit()
    await test_db.refresh(pipeline)
    return pipeline


@pytest_asyncio.fixture
async def test_document(test_db) -> Document:
    """Create a test document."""
    doc = Document(
        filename="test123.pdf",
        original_filename="test.pdf",
        file_path="./uploads/test123.pdf",
        file_type="pdf",
        file_size_bytes=1024,
        extracted_text="Test content",
        is_processed=True,
    )
    test_db.add(doc)
    await test_db.commit()
    await test_db.refresh(doc)
    return doc


# ============================================
# CRUD Tests
# ============================================

@pytest.mark.asyncio
async def test_create_pipeline(client: AsyncClient):
    """Test creating a pipeline."""
    response = await client.post(
        "/api/v1/pipelines",
        json={
            "name": "New Pipeline",
            "description": "Test description",
            "nodes": [
                {"id": "n1", "type": "chunker", "config": {}},
            ],
            "edges": [],
        },
    )
    
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "New Pipeline"
    assert len(data["nodes"]) == 1


@pytest.mark.asyncio
async def test_list_pipelines(client: AsyncClient, test_pipeline: Pipeline):
    """Test listing pipelines."""
    response = await client.get("/api/v1/pipelines")
    
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1


@pytest.mark.asyncio
async def test_get_pipeline(client: AsyncClient, test_pipeline: Pipeline):
    """Test getting a specific pipeline."""
    response = await client.get(
        f"/api/v1/pipelines/{test_pipeline.id}",
    )

    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Test Pipeline"


@pytest.mark.asyncio
async def test_update_pipeline(client: AsyncClient, test_pipeline: Pipeline):
    """Test updating a pipeline."""
    response = await client.patch(
        f"/api/v1/pipelines/{test_pipeline.id}",
        json={"name": "Updated Name"},
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Updated Name"


@pytest.mark.asyncio
async def test_delete_pipeline(client: AsyncClient, test_pipeline: Pipeline):
    """Test deleting a pipeline."""
    response = await client.delete(
        f"/api/v1/pipelines/{test_pipeline.id}",
    )

    assert response.status_code == 200


# ============================================
# Execute Tests
# ============================================

@pytest.mark.asyncio
async def test_execute_pipeline(
    client: AsyncClient,
    test_pipeline: Pipeline,
    test_document: Document,
):
    """Test executing a pipeline."""
    response = await client.post(
        f"/api/v1/pipelines/{test_pipeline.id}/execute",
        json={
            "document_id": str(test_document.id),
            "options": {
                "create_version": True,
                "notify_websocket": False,
            },
        },
    )
    
    assert response.status_code == 202
    data = response.json()
    assert data["status"] == "queued"
    assert "execution_id" in data


@pytest.mark.asyncio
async def test_execute_pipeline_empty_nodes(
    client: AsyncClient,
    test_db,
    test_document: Document,
):
    """Test error when pipeline has no nodes."""
    # Create empty pipeline
    empty_pipeline = Pipeline(
        name="Empty Pipeline",
        nodes=[],
        edges=[],
        settings={},
    )
    test_db.add(empty_pipeline)
    await test_db.commit()
    await test_db.refresh(empty_pipeline)
    
    response = await client.post(
        f"/api/v1/pipelines/{empty_pipeline.id}/execute",
        json={"document_id": str(test_document.id)},
    )
    
    assert response.status_code == 400
    assert "no nodes" in response.json()["error"]


@pytest.mark.asyncio
async def test_execute_pipeline_document_not_found(
    client: AsyncClient,
    test_pipeline: Pipeline,
):
    """Test error when document doesn't exist."""
    fake_id = uuid4()
    response = await client.post(
        f"/api/v1/pipelines/{test_pipeline.id}/execute",
        json={"document_id": str(fake_id)},
    )
    
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_list_executions(
    client: AsyncClient,
    test_pipeline: Pipeline,
):
    """Test listing pipeline executions."""
    response = await client.get(
        f"/api/v1/pipelines/{test_pipeline.id}/executions",
    )
    
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data

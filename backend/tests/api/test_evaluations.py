"""
Evaluation Endpoints Integration Tests
"""
import pytest
import pytest_asyncio
from httpx import AsyncClient
from uuid import uuid4

from app.models import Pipeline, TestDataset, Evaluation


@pytest_asyncio.fixture
async def test_pipeline(test_db) -> Pipeline:
    """Create a test pipeline."""
    pipeline = Pipeline(
        name="Test Pipeline",
        nodes=[{"id": "n1", "type": "chunker"}],
        edges=[],
        settings={},
    )
    test_db.add(pipeline)
    await test_db.commit()
    await test_db.refresh(pipeline)
    return pipeline


@pytest_asyncio.fixture
async def test_dataset(test_db) -> TestDataset:
    """Create a test dataset."""
    dataset = TestDataset(
        name="Test Dataset",
        description="Dataset for testing",
        questions=[
            {"question": "What is RAG?", "answer": "Retrieval-Augmented Generation"},
            {"question": "How does vector search work?", "answer": "Using embeddings"},
        ],
    )
    test_db.add(dataset)
    await test_db.commit()
    await test_db.refresh(dataset)
    return dataset


@pytest_asyncio.fixture
async def test_evaluation(test_db, test_pipeline: Pipeline, test_dataset: TestDataset) -> Evaluation:
    """Create a test evaluation."""
    evaluation = Evaluation(
        name="Test Evaluation",
        pipeline_id=test_pipeline.id,
        test_dataset_id=test_dataset.id,
    )
    test_db.add(evaluation)
    await test_db.commit()
    await test_db.refresh(evaluation)
    return evaluation


# ============================================
# CRUD Tests
# ============================================

@pytest.mark.asyncio
async def test_create_evaluation(
    client: AsyncClient,
    test_pipeline: Pipeline,
    test_dataset: TestDataset,
):
    """Test creating an evaluation."""
    response = await client.post(
        "/api/v1/evaluations",
        json={
            "name": "New Evaluation",
            "pipeline_id": str(test_pipeline.id),
            "test_dataset_id": str(test_dataset.id),
        },
    )
    
    assert response.status_code == 202
    data = response.json()
    assert data["name"] == "New Evaluation"
    assert data["status"] == "pending"


@pytest.mark.asyncio
async def test_create_evaluation_pipeline_not_found(
    client: AsyncClient,
    test_dataset: TestDataset,
):
    """Test error when pipeline doesn't exist."""
    fake_id = uuid4()
    response = await client.post(
        "/api/v1/evaluations",
        json={
            "pipeline_id": str(fake_id),
            "test_dataset_id": str(test_dataset.id),
        },
    )
    
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_create_evaluation_dataset_not_found(
    client: AsyncClient,
    test_pipeline: Pipeline,
):
    """Test error when dataset doesn't exist."""
    fake_id = uuid4()
    response = await client.post(
        "/api/v1/evaluations",
        json={
            "pipeline_id": str(test_pipeline.id),
            "test_dataset_id": str(fake_id),
        },
    )
    
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_list_evaluations(
    client: AsyncClient,
    test_evaluation: Evaluation,
):
    """Test listing evaluations."""
    response = await client.get("/api/v1/evaluations")
    
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1


@pytest.mark.asyncio
async def test_list_evaluations_filter_by_pipeline(
    client: AsyncClient,
    test_evaluation: Evaluation,
    test_pipeline: Pipeline,
):
    """Test filtering evaluations by pipeline."""
    response = await client.get(
        f"/api/v1/evaluations?pipeline_id={test_pipeline.id}",
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1


@pytest.mark.asyncio
async def test_get_evaluation(
    client: AsyncClient,
    test_evaluation: Evaluation,
):
    """Test getting a specific evaluation."""
    response = await client.get(
        f"/api/v1/evaluations/{test_evaluation.id}",
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Test Evaluation"


@pytest.mark.asyncio
async def test_get_evaluation_results(
    client: AsyncClient,
    test_evaluation: Evaluation,
):
    """Test getting evaluation results."""
    response = await client.get(
        f"/api/v1/evaluations/{test_evaluation.id}/results",
    )
    
    assert response.status_code == 200
    data = response.json()
    assert "items" in data


@pytest.mark.asyncio
async def test_delete_evaluation(
    client: AsyncClient,
    test_evaluation: Evaluation,
):
    """Test deleting an evaluation."""
    response = await client.delete(
        f"/api/v1/evaluations/{test_evaluation.id}",
    )
    
    assert response.status_code == 200

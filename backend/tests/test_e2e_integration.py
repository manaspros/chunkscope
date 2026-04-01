import pytest
import asyncio
from httpx import AsyncClient
from app.models import Document, Pipeline, ExecutionLog

@pytest.mark.asyncio
async def test_full_rag_pipeline_flow(
    client: AsyncClient,
):
    """
    Integration Test: Full user journey.
    1. Upload Document
    2. Create RAG Pipeline
    3. Execute Pipeline
    4. Verify Execution Success
    """

    # 1. Upload Document
    files = {
        "file": ("e2e_test.txt", b"This is an E2E test document for ChunkScope.", "text/plain")
    }

    doc_resp = await client.post("/api/v1/documents/upload", files=files)
    assert doc_resp.status_code == 201
    doc_id = doc_resp.json()["id"]

    # 2. Create Pipeline
    pipeline_data = {
        "name": "E2E RAG Pipeline",
        "description": "RAG flow for integration testing",
        "nodes": [
            {"id": "n1", "type": "loader", "position": {"x": 0, "y": 0}, "data": {"type": "pdf"}},
            {"id": "n2", "type": "splitter", "position": {"x": 200, "y": 0}, "data": {"method": "recursive"}}
        ],
        "edges": [{"id": "e1-2", "source": "n1", "target": "n2"}],
        "settings": {}
    }

    create_resp = await client.post("/api/v1/pipelines", json=pipeline_data)
    assert create_resp.status_code == 201
    pipeline_id = create_resp.json()["id"]

    # 3. Execute Pipeline
    exec_data = {
        "document_id": doc_id,
        "options": {"create_version": True}
    }
    exec_resp = await client.post(f"/api/v1/pipelines/{pipeline_id}/execute", json=exec_data)
    assert exec_resp.status_code == 202
    execution_id = exec_resp.json()["execution_id"]

    # 4. Monitor Execution (Poll)
    status_resp = await client.get(f"/api/v1/pipelines/{pipeline_id}/executions")
    assert status_resp.status_code == 200
    executions = status_resp.json()["items"]
    assert any(str(ex["id"]) == str(execution_id) for ex in executions)

    print(f"E2E Integration Success: Doc {doc_id} -> Pipeline {pipeline_id} -> Execution {execution_id}")

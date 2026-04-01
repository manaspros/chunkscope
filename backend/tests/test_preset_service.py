import pytest
import pytest_asyncio
from uuid import uuid4
from sqlalchemy import select
from app.models.models import Preset, Pipeline
from app.services.preset_service import preset_service
from httpx import AsyncClient

# Use 'client' fixture from conftest.py which provides AsyncClient

@pytest_asyncio.fixture
async def clean_presets(test_db):
    """Clean up presets before/after tests"""
    from sqlalchemy import delete
    await test_db.execute(delete(Preset))
    await test_db.commit()
    yield
    await test_db.execute(delete(Preset))
    await test_db.commit()

@pytest.mark.asyncio
async def test_load_builtin_presets(test_db, clean_presets):
    """Verify all 10 presets load correctly"""
    loaded = await preset_service.load_builtin_presets(test_db)

    assert len(loaded) >= 10

    names = [p.name for p in loaded]
    assert "Legal Document QA" in names
    assert "Customer Support Bot" in names
    assert "Medical Records QA" in names

    legal_preset = next(p for p in loaded if p.name == "Legal Document QA")
    assert legal_preset.category == "qa"
    assert "chunking" in legal_preset.configuration
    assert legal_preset.configuration["chunking"]["method"] == "paragraph_based"

@pytest.mark.asyncio
async def test_get_all_presets_filtering(test_db, clean_presets):
    """Test filtering by category"""
    await preset_service.load_builtin_presets(test_db)

    all_presets = await preset_service.get_all_presets(test_db)
    assert len(all_presets) >= 10

    qa_presets = await preset_service.get_all_presets(test_db, category="qa")
    assert len(qa_presets) > 0
    assert all(p.category == "qa" for p in qa_presets)

    chatbot_presets = await preset_service.get_all_presets(test_db, category="chatbot")
    assert len(chatbot_presets) > 0
    assert all(p.category == "chatbot" for p in chatbot_presets)

@pytest.mark.asyncio
async def test_apply_preset_to_pipeline(test_db, clean_presets):
    """Verify pipeline creation from preset"""
    await preset_service.load_builtin_presets(test_db)
    presets = await preset_service.get_all_presets(test_db)
    target_preset = presets[0]

    pipeline = await preset_service.apply_preset_to_pipeline(
        test_db,
        target_preset.id,
        pipeline_name="My Test Pipeline"
    )

    assert pipeline.name == "My Test Pipeline"
    assert pipeline.preset_id == target_preset.id
    assert pipeline.settings == target_preset.configuration

    assert len(pipeline.nodes) > 0
    node_types = [n["type"] for n in pipeline.nodes]
    assert "loader" in node_types
    assert "splitter" in node_types
    assert "embedder" in node_types

    assert len(pipeline.edges) == len(pipeline.nodes) - 1

@pytest.mark.asyncio
async def test_preset_api_endpoints(client: AsyncClient, test_db, clean_presets):
    """Test all API endpoints"""
    await preset_service.load_builtin_presets(test_db)
    all_presets = await preset_service.get_all_presets(test_db)
    target_preset = all_presets[0]

    # 1. GET /api/v1/presets
    response = await client.get("/api/v1/presets")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 10

    # 2. GET /api/v1/presets/{id}
    response = await client.get(f"/api/v1/presets/{target_preset.id}")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == target_preset.name
    assert "configuration" in data

    # 3. POST /api/v1/presets/{id}/apply
    response = await client.post(
        f"/api/v1/presets/{target_preset.id}/apply?pipeline_name=API_Pipeline",
    )
    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "Pipeline created successfully from preset"
    assert "pipeline_id" in data

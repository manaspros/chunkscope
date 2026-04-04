import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import uuid4

from app.models.models import Preset

@pytest.mark.asyncio
async def test_get_presets_empty(client: AsyncClient):
    """Test getting presets when none exist."""
    response = await client.get("/api/v1/presets")
    assert response.status_code == 200
    assert response.json() == []

@pytest.mark.asyncio
async def test_initialize_presets(client: AsyncClient):
    """Test initializing built-in presets."""
    response = await client.post("/api/v1/presets/initialize")
    assert response.status_code == 200
    assert "Loaded" in response.json()["message"]
    
    # Verify presets were actually loaded
    response = await client.get("/api/v1/presets")
    assert response.status_code == 200
    data = response.json()
    assert len(data) > 0
    
    # Check structure of the first preset
    preset = data[0]
    assert "id" in preset
    assert "name" in preset
    
@pytest.mark.asyncio
async def test_get_preset_details(client: AsyncClient):
    """Test getting full details of a preset."""
    # First initialize
    await client.post("/api/v1/presets/initialize")
    
    # Get all presets to find an ID
    list_response = await client.get("/api/v1/presets")
    presets = list_response.json()
    assert len(presets) > 0
    preset_id = presets[0]["id"]
    
    # Get details
    response = await client.get(f"/api/v1/presets/{preset_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == preset_id
    assert "configuration" in data  # configuration SHOULD be in details view

@pytest.mark.asyncio
async def test_get_preset_not_found(client: AsyncClient):
    """Test getting a non-existent preset."""
    random_id = str(uuid4())
    response = await client.get(f"/api/v1/presets/{random_id}")
    assert response.status_code == 404

@pytest.mark.asyncio
async def test_apply_preset(client: AsyncClient):
    """Test applying a preset to create a pipeline."""
    # Initialize presets
    await client.post("/api/v1/presets/initialize")
    list_response = await client.get("/api/v1/presets")
    preset_id = list_response.json()[0]["id"]
    
    # Apply preset
    response = await client.post(
        f"/api/v1/presets/{preset_id}/apply",
        params={"pipeline_name": "Test Pipeline from Preset"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "pipeline_id" in data
    assert data["pipeline_name"] == "Test Pipeline from Preset" 

from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.models import Preset, Pipeline
from app.services.preset_service import preset_service

router = APIRouter(prefix="/presets", tags=["presets"])


@router.post("/initialize", tags=["admin"])
async def initialize_presets(
    db: AsyncSession = Depends(get_db),
):
    """Manually trigger loading of built-in presets."""
    loaded = await preset_service.load_builtin_presets(db)
    return {"message": f"Loaded {len(loaded)} presets"}

@router.get("", response_model=List[dict])
async def get_presets(
    category: Optional[str] = Query(None, description="Filter presets by category"),
    db: AsyncSession = Depends(get_db),
):
    """List all available presets."""
    presets = await preset_service.get_all_presets(db, category)
    return [
        {
            "id": str(p.id),
            "name": p.name,
            "category": p.category,
            "description": p.description,
            "tags": p.tags,
            "use_cases": p.use_cases,
            "thumbnail_url": p.thumbnail_url,
            "expected_metrics": p.expected_metrics
        }
        for p in presets
    ]

@router.get("/{preset_id}", response_model=dict)
async def get_preset_details(
    preset_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get full details of a specific preset."""
    preset = await preset_service.get_preset_by_id(db, preset_id)
    if not preset:
        raise HTTPException(status_code=404, detail="Preset not found")

    return {
        "id": str(preset.id),
        "name": preset.name,
        "category": preset.category,
        "description": preset.description,
        "configuration": preset.configuration,
        "tags": preset.tags,
        "use_cases": preset.use_cases,
        "document_types": preset.document_types,
        "expected_metrics": preset.expected_metrics
    }


@router.post("/{preset_id}/apply", response_model=dict)
async def apply_preset(
    preset_id: str,
    pipeline_name: Optional[str] = Query(None, description="Name for the new pipeline"),
    document_id: Optional[UUID] = Query(None, description="ID of the document to associate with the pipeline"),
    config_override: Optional[dict] = None,
    db: AsyncSession = Depends(get_db),
):
    """Create a new pipeline from a preset, with optional config override and document association."""
    try:
        # Resolve 'default' keyword
        resolved_id = None
        if preset_id.lower() == "default":
            presets = await preset_service.get_all_presets(db)
            if presets:
                resolved_id = presets[0].id
            else:
                raise ValueError("No presets found to use as default")
        else:
            try:
                resolved_id = UUID(preset_id)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid UUID format for preset_id")

        pipeline = await preset_service.apply_preset_to_pipeline(
            db,
            resolved_id,
            pipeline_name,
            custom_config=config_override,
            document_id=document_id
        )

        # Debug logging
        debug_msg = f"\n=== PIPELINE CREATED ===\nPipeline ID: {pipeline.id}\nPipeline Name: {pipeline.name}\nDocument ID passed: {document_id}\nSettings stored: {pipeline.settings}\n========================\n"
        print(debug_msg, flush=True)
        with open("debug_log.txt", "a") as f:
            f.write(debug_msg)

        return {
            "message": "Pipeline created successfully from preset",
            "pipeline_id": str(pipeline.id),
            "pipeline_name": pipeline.name
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        import traceback
        print(f"\n!!! PRESET APPLY ERROR !!!\n{str(e)}\n{traceback.format_exc()}\n", flush=True)
        from app.core.logging import get_logger
        logger = get_logger(__name__)
        logger.exception("preset_apply_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

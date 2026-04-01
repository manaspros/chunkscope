"""
Pipeline Endpoints
CRUD operations for RAG pipelines
"""
from uuid import UUID

from fastapi import APIRouter, Query, status
from sqlalchemy import func, select

from app.core.errors import BadRequestError, NotFoundError
from app.core.logging import get_logger
from app.dependencies import DbSession
from app.models import Pipeline
from app.schemas import (
    PaginationParams,
    PipelineCreate,
    PipelineListResponse,
    PipelineResponse,
    PipelineUpdate,
    SuccessResponse,
    paginate,
)
from app.schemas.execution import (
    ExecutionStatusResponse,
    PipelineExecuteRequest,
    PipelineExecuteResponse,
)
from app.schemas.common import PaginatedResponse

logger = get_logger(__name__)

# ExecutionListResponse type
ExecutionListResponse = PaginatedResponse[ExecutionStatusResponse]

router = APIRouter(prefix="/pipelines", tags=["Pipelines"])


@router.get("", response_model=PipelineListResponse)
async def list_pipelines(
    db: DbSession,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
) -> PipelineListResponse:
    """List all pipelines."""
    params = PaginationParams(page=page, per_page=per_page)

    # Count total
    count_query = select(func.count(Pipeline.id))
    total = (await db.execute(count_query)).scalar() or 0

    # Fetch items
    query = (
        select(Pipeline)
        .order_by(Pipeline.updated_at.desc())
        .offset(params.offset)
        .limit(params.per_page)
    )
    result = await db.execute(query)
    pipelines = result.scalars().all()

    return paginate(
        items=[PipelineResponse.model_validate(p) for p in pipelines],
        total=total,
        params=params,
    )


@router.post("", response_model=PipelineResponse, status_code=201)
async def create_pipeline(
    request: PipelineCreate,
    db: DbSession,
) -> PipelineResponse:
    """Create a new pipeline."""
    pipeline = Pipeline(
        name=request.name,
        description=request.description,
        nodes=[node.model_dump() for node in request.nodes],
        edges=[edge.model_dump() for edge in request.edges],
        settings=request.settings,
    )
    db.add(pipeline)
    await db.flush()
    await db.refresh(pipeline)

    return PipelineResponse.model_validate(pipeline)


@router.get("/{pipeline_id}", response_model=PipelineResponse)
async def get_pipeline(
    pipeline_id: UUID,
    db: DbSession,
) -> PipelineResponse:
    """Get a specific pipeline by ID."""
    pipeline = await _get_pipeline(db, pipeline_id)
    return PipelineResponse.model_validate(pipeline)


@router.patch("/{pipeline_id}", response_model=PipelineResponse)
async def update_pipeline(
    pipeline_id: UUID,
    request: PipelineUpdate,
    db: DbSession,
) -> PipelineResponse:
    """Update a pipeline."""
    pipeline = await _get_pipeline(db, pipeline_id)

    # Update only provided fields
    update_data = request.model_dump(exclude_unset=True)

    if "nodes" in update_data:
        update_data["nodes"] = [n.model_dump() if hasattr(n, "model_dump") else n for n in update_data["nodes"]]
    if "edges" in update_data:
        update_data["edges"] = [e.model_dump() if hasattr(e, "model_dump") else e for e in update_data["edges"]]

    for field, value in update_data.items():
        setattr(pipeline, field, value)

    await db.flush()
    await db.refresh(pipeline)

    return PipelineResponse.model_validate(pipeline)


@router.delete("/{pipeline_id}", response_model=SuccessResponse)
async def delete_pipeline(
    pipeline_id: UUID,
    db: DbSession,
) -> SuccessResponse:
    """Delete a pipeline."""
    pipeline = await _get_pipeline(db, pipeline_id)
    await db.delete(pipeline)

    return SuccessResponse(message="Pipeline deleted successfully")


@router.post("/{pipeline_id}/execute", response_model=PipelineExecuteResponse, status_code=202)
async def execute_pipeline(
    pipeline_id: UUID,
    request: PipelineExecuteRequest,
    db: DbSession,
) -> PipelineExecuteResponse:
    """
    Execute a pipeline on a document.

    Returns 202 Accepted as execution runs in background.
    """
    from app.models import Document, ExecutionLog, PipelineVersion
    from app.config import settings

    # Verify pipeline exists
    pipeline = await _get_pipeline(db, pipeline_id)

    # Verify document exists
    doc_result = await db.execute(
        select(Document).where(Document.id == request.document_id)
    )
    document = doc_result.scalar_one_or_none()

    if not document:
        raise NotFoundError("Document", str(request.document_id))

    # Check if pipeline has nodes
    if not pipeline.nodes:
        raise BadRequestError("Pipeline has no nodes to execute")

    # Optionally create version snapshot
    version_id = None
    if request.options.create_version:
        version = PipelineVersion(
            pipeline_id=pipeline.id,
            version_number=1,  # TODO: Auto-increment
            config={
                "nodes": pipeline.nodes,
                "edges": pipeline.edges,
                "settings": pipeline.settings,
            },
        )
        db.add(version)
        await db.flush()
        version_id = version.id

    # Create execution log
    execution = ExecutionLog(
        pipeline_id=pipeline.id,
        pipeline_version_id=version_id,
        level="info",
        message="Pipeline execution queued",
        details={"document_id": str(request.document_id), "status": "queued"},
    )
    db.add(execution)
    await db.flush()
    await db.refresh(execution)

    # TODO: Queue background task

    logger.info(
        "pipeline_execution_queued",
        pipeline_id=str(pipeline_id),
        execution_id=str(execution.id),
        document_id=str(request.document_id),
    )

    websocket_url = None
    if request.options.notify_websocket:
        websocket_url = f"ws://localhost:8000/ws/executions/{execution.id}"

    return PipelineExecuteResponse(
        execution_id=execution.id,
        status="queued",
        estimated_time_seconds=30,
        websocket_url=websocket_url,
    )


@router.get("/{pipeline_id}/executions", response_model=ExecutionListResponse)
async def list_pipeline_executions(
    pipeline_id: UUID,
    db: DbSession,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
) -> ExecutionListResponse:
    """List execution history for a pipeline."""
    from app.models import ExecutionLog

    # Verify pipeline exists
    await _get_pipeline(db, pipeline_id)

    params = PaginationParams(page=page, per_page=per_page)

    count_query = select(func.count(ExecutionLog.id)).where(
        ExecutionLog.pipeline_id == pipeline_id
    )
    total = (await db.execute(count_query)).scalar() or 0

    query = (
        select(ExecutionLog)
        .where(ExecutionLog.pipeline_id == pipeline_id)
        .order_by(ExecutionLog.created_at.desc())
        .offset(params.offset)
        .limit(params.per_page)
    )
    result = await db.execute(query)
    executions = result.scalars().all()

    return paginate(
        items=[ExecutionStatusResponse.model_validate(e) for e in executions],
        total=total,
        params=params,
    )


async def _get_pipeline(db: DbSession, pipeline_id: UUID) -> Pipeline:
    """Helper to get a pipeline by ID."""
    result = await db.execute(
        select(Pipeline).where(Pipeline.id == pipeline_id)
    )
    pipeline = result.scalar_one_or_none()

    if not pipeline:
        raise NotFoundError("Pipeline", str(pipeline_id))

    return pipeline

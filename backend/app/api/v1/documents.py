"""
Document Endpoints
CRUD operations for uploaded documents
"""
from uuid import UUID
import pathlib

from fastapi import APIRouter, Query, UploadFile, File, HTTPException, status, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy import func, select

from app.core.errors import BadRequestError, NotFoundError
from app.core.logging import get_logger
from app.dependencies import DbSession
from app.models import Document, Chunk
from app.schemas import (
    DocumentListResponse,
    DocumentResponse,
    DocumentDetailResponse,
    PaginationParams,
    SuccessResponse,
    paginate,
)
from app.services.document_service import document_service

logger = get_logger(__name__)

router = APIRouter(prefix="/documents", tags=["Documents"])


@router.post("/upload", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    background_tasks: BackgroundTasks,
    db: DbSession,
    file: UploadFile = File(..., description="PDF, TXT, or MD file to upload"),
) -> DocumentResponse:
    """
    Upload a document for processing.

    Accepts PDF, TXT, and MD files up to 100MB.
    """
    # Validate file
    try:
        file_type = await document_service.validate_upload(file)
    except BadRequestError:
        raise
    except Exception as e:
        logger.error("upload_validation_failed", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File validation failed: {str(e)}"
        )

    # Save file to disk
    try:
        stored_filename, file_path, file_size = await document_service.save_file(file, file_type)
    except Exception as e:
        logger.error("upload_save_failed", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save file"
        )

    # Create database record
    document = Document(
        filename=stored_filename,
        original_filename=file.filename or "unknown",
        file_path=file_path,
        file_type=file_type.value,
        file_size_bytes=file_size,
        doc_metadata={},
        is_processed=False,
    )
    db.add(document)
    await db.flush()
    await db.refresh(document)

    logger.info(
        "document_uploaded",
        document_id=str(document.id),
        filename=file.filename,
        size_bytes=file_size,
    )

    # Trigger processing in background
    background_tasks.add_task(document_service.process_document, document.id)

    return DocumentResponse.model_validate(document)


@router.get("", response_model=DocumentListResponse)
async def list_documents(
    db: DbSession,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    file_type: str | None = Query(default=None, description="Filter by file type"),
) -> DocumentListResponse:
    """List all documents."""
    params = PaginationParams(page=page, per_page=per_page)

    # Base query
    base_query = select(Document)

    if file_type:
        base_query = base_query.where(Document.file_type == file_type)

    # Count total
    count_query = select(func.count()).select_from(base_query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # Fetch items with chunk counts
    chunk_count_subquery = (
        select(Chunk.document_id, func.count(Chunk.id).label("count"))
        .group_by(Chunk.document_id)
        .subquery()
    )

    query = (
        select(Document, func.coalesce(chunk_count_subquery.c.count, 0).label("chunk_count"))
        .outerjoin(chunk_count_subquery, Document.id == chunk_count_subquery.c.document_id)
    )

    if file_type:
        query = query.where(Document.file_type == file_type)

    query = (
        query
        .order_by(Document.created_at.desc())
        .offset(params.offset)
        .limit(params.per_page)
    )

    result = await db.execute(query)
    rows = result.all()

    # Map to response schema
    items = []
    for doc, chunk_count in rows:
        d_resp = DocumentResponse.model_validate(doc)
        d_resp.chunk_count = chunk_count
        items.append(d_resp)

    return paginate(
        items=items,
        total=total,
        params=params,
    )


@router.get("/{document_id}/content")
async def get_document_content(
    document_id: UUID,
    db: DbSession,
):
    """Get the actual file content of a document."""
    try:
        query = select(Document).where(Document.id == document_id)
        result = await db.execute(query)
        document = result.scalar_one_or_none()

        if not document:
            raise NotFoundError("Document", str(document_id))

        if not pathlib.Path(document.file_path).exists():
            raise NotFoundError("File", document.file_path)

        return FileResponse(
            path=document.file_path,
            filename=document.original_filename,
            media_type="application/pdf" if document.file_type == "pdf" else "application/octet-stream"
        )
    except Exception as e:
        import traceback
        with open("backend_error.log", "a") as f:
            f.write(f"Error in get_document_content: {str(e)}\n")
            f.write(traceback.format_exc())
            f.write("\n" + "="*30 + "\n")
        raise e


@router.get("/{document_id}", response_model=DocumentDetailResponse)
async def get_document(
    document_id: UUID,
    db: DbSession,
) -> DocumentDetailResponse:
    """Get a specific document by ID."""
    document = await _get_document(db, document_id)
    return DocumentDetailResponse.model_validate(document)


@router.delete("/{document_id}", response_model=SuccessResponse)
async def delete_document(
    document_id: UUID,
    db: DbSession,
) -> SuccessResponse:
    """Delete a document and its chunks."""
    document = await _get_document(db, document_id)
    await db.delete(document)

    return SuccessResponse(message="Document deleted successfully")


async def _get_document(db: DbSession, document_id: UUID) -> Document:
    """Helper to get a document by ID."""
    result = await db.execute(
        select(Document).where(Document.id == document_id)
    )
    document = result.scalar_one_or_none()

    if not document:
        raise NotFoundError("Document", str(document_id))

    return document

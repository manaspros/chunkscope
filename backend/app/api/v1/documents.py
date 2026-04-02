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
from app.models import Document, DocumentType, Chunk
from app.schemas import (
    DocumentListResponse,
    DocumentResponse,
    DocumentDetailResponse,
    PaginationParams,
    SuccessResponse,
    paginate,
)
from app.services.document_service import document_service, EXTENSION_TO_TYPE
from app.services.zip_processor import zip_processor

logger = get_logger(__name__)

router = APIRouter(prefix="/documents", tags=["Documents"])


@router.post("/upload", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    background_tasks: BackgroundTasks,
    db: DbSession,
    file: UploadFile = File(..., description="Any document file to upload"),
    project_id: UUID | None = Query(default=None, description="Optional project to link document to"),
) -> DocumentResponse:
    """
    Upload a document for processing.

    Accepts any common file type up to 100MB.
    ZIP files are auto-detected and routed to ZIP processing.
    Optionally link the document to a project via project_id query param.
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
        project_id=project_id,
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


@router.post("/upload-zip", status_code=status.HTTP_201_CREATED)
async def upload_zip(
    background_tasks: BackgroundTasks,
    db: DbSession,
    file: UploadFile = File(..., description="ZIP archive containing documents"),
):
    """
    Upload a ZIP file containing multiple documents.

    Extracts the archive and creates a Document record for each file inside.
    Returns a list of created documents.
    """
    # Validate that it is actually a ZIP
    if not file.filename:
        raise BadRequestError("Filename is required")

    ext = pathlib.Path(file.filename).suffix.lower()
    if ext != ".zip":
        raise BadRequestError("Only .zip files are accepted at this endpoint")

    # Validate via the normal pipeline (size check, magic bytes)
    try:
        await document_service.validate_upload(file)
    except BadRequestError:
        raise
    except Exception as e:
        logger.error("zip_upload_validation_failed", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"ZIP validation failed: {str(e)}",
        )

    # Save the ZIP to disk first
    try:
        zip_stored, zip_path, zip_size = await document_service.save_file(
            file, DocumentType.ZIP
        )
    except Exception as e:
        logger.error("zip_upload_save_failed", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save ZIP file",
        )

    # Extract files from ZIP into the upload directory
    upload_dir = str(document_service.upload_dir)
    try:
        extracted_files = zip_processor.extract_to_dir(zip_path, upload_dir)
    except ValueError as e:
        raise BadRequestError(str(e))
    except Exception as e:
        logger.error("zip_extraction_failed", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to extract ZIP archive",
        )

    # Create a Document record for each extracted file
    created_docs = []
    for entry in extracted_files:
        entry_ext = entry["extension"]
        entry_type = EXTENSION_TO_TYPE.get(entry_ext, DocumentType.UNKNOWN)

        doc = Document(
            filename=entry["safe_name"],
            original_filename=entry["filename"],
            file_path=entry["saved_path"],
            file_type=entry_type.value,
            file_size_bytes=entry["size"],
            doc_metadata={"source_zip": file.filename, "zip_path": entry["original_path"]},
            is_processed=False,
        )
        db.add(doc)
        await db.flush()
        await db.refresh(doc)

        # Trigger background processing for each file
        background_tasks.add_task(document_service.process_document, doc.id)
        created_docs.append(DocumentResponse.model_validate(doc))

    logger.info(
        "zip_uploaded",
        zip_filename=file.filename,
        extracted_count=len(created_docs),
    )

    return {"documents": created_docs, "count": len(created_docs)}


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

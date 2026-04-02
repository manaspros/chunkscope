"""
Project Endpoints
CRUD operations and file management for projects
"""
import pathlib
from collections import Counter
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, Query, UploadFile, status
from sqlalchemy import func, select

from app.core.errors import BadRequestError, NotFoundError
from app.core.logging import get_logger
from app.dependencies import DbSession
from app.models import Document, DocumentType, Chunk, Project
from app.schemas import (
    DocumentResponse,
    ProjectCreate,
    ProjectUpdate,
    ProjectResponse,
    ProjectFileInfo,
    ProjectDetailResponse,
    ProjectListResponse,
    SuccessResponse,
)
from app.services.document_service import document_service, EXTENSION_TO_TYPE
from app.services.zip_processor import zip_processor

logger = get_logger(__name__)

router = APIRouter(prefix="/projects", tags=["Projects"])


# ============================================
# Helpers
# ============================================

async def _get_project(db, project_id: UUID) -> Project:
    """Get a project by ID or raise 404."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise NotFoundError("Project", str(project_id))
    return project


async def _update_project_stats(db, project_id: UUID) -> None:
    """Recompute and save project aggregate stats."""
    # Count files
    file_count_q = select(func.count(Document.id)).where(Document.project_id == project_id)
    total_files = (await db.execute(file_count_q)).scalar() or 0

    # Count chunks across all project documents
    chunk_count_q = (
        select(func.count(Chunk.id))
        .join(Document, Chunk.document_id == Document.id)
        .where(Document.project_id == project_id)
    )
    total_chunks = (await db.execute(chunk_count_q)).scalar() or 0

    # Dominant doc type
    type_q = (
        select(Document.file_type, func.count(Document.id).label("cnt"))
        .where(Document.project_id == project_id)
        .group_by(Document.file_type)
        .order_by(func.count(Document.id).desc())
        .limit(1)
    )
    type_result = (await db.execute(type_q)).first()
    dominant = type_result[0] if type_result else None

    # Update project
    project = await _get_project(db, project_id)
    project.total_files = total_files
    project.total_chunks = total_chunks
    project.dominant_doc_type = dominant
    db.add(project)
    await db.flush()


# ============================================
# CRUD
# ============================================

@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    data: ProjectCreate,
    db: DbSession,
) -> ProjectResponse:
    """Create a new project."""
    project = Project(
        name=data.name,
        description=data.description,
    )
    db.add(project)
    await db.flush()
    await db.refresh(project)
    logger.info("project_created", project_id=str(project.id), name=data.name)
    return ProjectResponse.model_validate(project)


@router.get("", response_model=ProjectListResponse)
async def list_projects(
    db: DbSession,
    status_filter: Optional[str] = Query(default=None, alias="status", description="Filter by status"),
) -> ProjectListResponse:
    """List all projects."""
    query = select(Project).order_by(Project.created_at.desc())
    if status_filter:
        query = query.where(Project.status == status_filter)

    result = await db.execute(query)
    projects = result.scalars().all()

    return ProjectListResponse(
        projects=[ProjectResponse.model_validate(p) for p in projects],
        total=len(projects),
    )


@router.get("/{project_id}", response_model=ProjectDetailResponse)
async def get_project(
    project_id: UUID,
    db: DbSession,
) -> ProjectDetailResponse:
    """Get a project with its file list."""
    project = await _get_project(db, project_id)

    # Fetch documents
    doc_q = (
        select(Document)
        .where(Document.project_id == project_id)
        .order_by(Document.created_at.desc())
    )
    docs_result = await db.execute(doc_q)
    docs = docs_result.scalars().all()

    files = [
        ProjectFileInfo(
            id=d.id,
            filename=d.filename,
            original_filename=d.original_filename,
            file_type=d.file_type,
            file_size_bytes=d.file_size_bytes,
            is_processed=d.is_processed,
        )
        for d in docs
    ]

    resp = ProjectDetailResponse.model_validate(project)
    resp.files = files
    return resp


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: UUID,
    data: ProjectUpdate,
    db: DbSession,
) -> ProjectResponse:
    """Update a project's name/description/status."""
    project = await _get_project(db, project_id)

    if data.name is not None:
        project.name = data.name
    if data.description is not None:
        project.description = data.description
    if data.status is not None:
        if data.status not in ("active", "archived"):
            raise BadRequestError("Status must be 'active' or 'archived'")
        project.status = data.status

    db.add(project)
    await db.flush()
    await db.refresh(project)

    return ProjectResponse.model_validate(project)


@router.delete("/{project_id}", response_model=SuccessResponse)
async def delete_project(
    project_id: UUID,
    db: DbSession,
) -> SuccessResponse:
    """Delete a project and all its documents."""
    project = await _get_project(db, project_id)
    await db.delete(project)
    logger.info("project_deleted", project_id=str(project_id))
    return SuccessResponse(message="Project deleted successfully")


# ============================================
# File management
# ============================================

@router.post("/{project_id}/upload", status_code=status.HTTP_201_CREATED)
async def upload_file_to_project(
    project_id: UUID,
    background_tasks: BackgroundTasks,
    db: DbSession,
    file: UploadFile = File(..., description="File to upload into the project"),
):
    """Upload a single file to a project."""
    project = await _get_project(db, project_id)

    # Validate
    file_type = await document_service.validate_upload(file)

    # Save
    stored_filename, file_path, file_size = await document_service.save_file(file, file_type)

    # Create document linked to project
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

    # Update stats
    await _update_project_stats(db, project_id)

    # Background processing
    background_tasks.add_task(document_service.process_document, document.id)

    logger.info("file_uploaded_to_project", project_id=str(project_id), document_id=str(document.id))
    return DocumentResponse.model_validate(document)


@router.post("/{project_id}/upload-zip", status_code=status.HTTP_201_CREATED)
async def upload_zip_to_project(
    project_id: UUID,
    background_tasks: BackgroundTasks,
    db: DbSession,
    file: UploadFile = File(..., description="ZIP archive to extract into the project"),
):
    """Upload a ZIP file and extract all files into the project."""
    project = await _get_project(db, project_id)

    if not file.filename:
        raise BadRequestError("Filename is required")
    ext = pathlib.Path(file.filename).suffix.lower()
    if ext != ".zip":
        raise BadRequestError("Only .zip files are accepted at this endpoint")

    await document_service.validate_upload(file)

    zip_stored, zip_path, zip_size = await document_service.save_file(file, DocumentType.ZIP)

    upload_dir = str(document_service.upload_dir)
    try:
        extracted_files = zip_processor.extract_to_dir(zip_path, upload_dir)
    except ValueError as e:
        raise BadRequestError(str(e))

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
            project_id=project_id,
        )
        db.add(doc)
        await db.flush()
        await db.refresh(doc)
        background_tasks.add_task(document_service.process_document, doc.id)
        created_docs.append(DocumentResponse.model_validate(doc))

    await _update_project_stats(db, project_id)

    logger.info("zip_uploaded_to_project", project_id=str(project_id), extracted_count=len(created_docs))
    return {"documents": created_docs, "count": len(created_docs)}


@router.post("/{project_id}/upload-folder", status_code=status.HTTP_201_CREATED)
async def upload_folder_to_project(
    project_id: UUID,
    background_tasks: BackgroundTasks,
    db: DbSession,
    files: list[UploadFile] = File(..., description="Multiple files from a folder"),
):
    """Upload multiple files (folder upload) to a project."""
    project = await _get_project(db, project_id)

    created_docs = []
    for uploaded_file in files:
        try:
            file_type = await document_service.validate_upload(uploaded_file)
            stored_filename, file_path, file_size = await document_service.save_file(uploaded_file, file_type)

            doc = Document(
                filename=stored_filename,
                original_filename=uploaded_file.filename or "unknown",
                file_path=file_path,
                file_type=file_type.value,
                file_size_bytes=file_size,
                doc_metadata={},
                is_processed=False,
                project_id=project_id,
            )
            db.add(doc)
            await db.flush()
            await db.refresh(doc)
            background_tasks.add_task(document_service.process_document, doc.id)
            created_docs.append(DocumentResponse.model_validate(doc))
        except Exception as e:
            logger.error("folder_file_upload_failed", filename=uploaded_file.filename, error=str(e))

    await _update_project_stats(db, project_id)

    logger.info("folder_uploaded_to_project", project_id=str(project_id), file_count=len(created_docs))
    return {"documents": created_docs, "count": len(created_docs)}


@router.delete("/{project_id}/files/{file_id}", response_model=SuccessResponse)
async def remove_file_from_project(
    project_id: UUID,
    file_id: UUID,
    db: DbSession,
) -> SuccessResponse:
    """Remove a file from a project (deletes the document)."""
    await _get_project(db, project_id)

    result = await db.execute(
        select(Document).where(Document.id == file_id, Document.project_id == project_id)
    )
    document = result.scalar_one_or_none()
    if not document:
        raise NotFoundError("Document", str(file_id))

    await db.delete(document)
    await db.flush()

    await _update_project_stats(db, project_id)

    logger.info("file_removed_from_project", project_id=str(project_id), file_id=str(file_id))
    return SuccessResponse(message="File removed from project")


# ============================================
# Analysis & Chunking
# ============================================

@router.post("/{project_id}/analyze")
async def analyze_project(
    project_id: UUID,
    background_tasks: BackgroundTasks,
    db: DbSession,
):
    """Analyze all files in the project as a corpus and store recommendation."""
    project = await _get_project(db, project_id)

    # Get all project documents
    doc_q = select(Document).where(Document.project_id == project_id)
    docs_result = await db.execute(doc_q)
    docs = docs_result.scalars().all()

    if not docs:
        raise BadRequestError("Project has no files to analyze")

    from app.services.document_analyzer import document_analyzer

    doc_types = []
    all_confidences = []
    has_tables = False
    has_code = False
    has_headings = False
    per_file_signals: list[dict] = []
    total_words = 0
    file_results = []

    for doc in docs:
        try:
            result = await document_analyzer.analyze(doc.file_path)

            signals = result.get("content_signals", {})
            word_count = signals.get("total_words", 0) or (
                result.get("density", {}).get("avg_sentence_length", 0) * 50
            )
            if signals:
                per_file_signals.append(signals)

            structure = result.get("structure", {})
            if structure.get("has_tables"):
                has_tables = True
            if structure.get("has_code_blocks"):
                has_code = True
            if structure.get("has_headings"):
                has_headings = True

            doc_types.append(result["document_type"])
            all_confidences.append(result.get("confidence_score", 0.5))
            total_words += int(word_count)

            file_results.append({
                "filename": doc.original_filename,
                "document_id": str(doc.id),
                "document_type": result["document_type"],
                "word_count": int(word_count),
                "status": "done",
            })
        except Exception as e:
            logger.error("project_file_analysis_failed", filename=doc.original_filename, error=str(e))
            file_results.append({
                "filename": doc.original_filename,
                "document_id": str(doc.id),
                "document_type": "unknown",
                "status": "error",
                "error": str(e),
            })

    type_counts = Counter(doc_types)
    dominant_type = type_counts.most_common(1)[0][0] if type_counts else "general"
    avg_confidence = sum(all_confidences) / len(all_confidences) if all_confidences else 0.5

    corpus_size = "small" if len(docs) < 100 else "medium" if len(docs) < 1000 else "large"

    # Merge content signals across files and derive corpus recommendation
    if per_file_signals:
        total_weight = sum(s.get("total_words", 1) for s in per_file_signals) or 1
        merged_signals = {
            "heading_density": max(s.get("heading_density", 0) for s in per_file_signals),
            "code_ratio": max(s.get("code_ratio", 0) for s in per_file_signals),
            "table_ratio": max(s.get("table_ratio", 0) for s in per_file_signals),
            "list_ratio": max(s.get("list_ratio", 0) for s in per_file_signals),
            "avg_sentence_length": round(
                sum(
                    s.get("avg_sentence_length", 0) * s.get("total_words", 1)
                    for s in per_file_signals
                ) / total_weight,
                1,
            ),
            "avg_paragraph_sentences": round(
                sum(s.get("avg_paragraph_sentences", 0) for s in per_file_signals)
                / len(per_file_signals),
                1,
            ),
            "total_words": total_words,
            "total_lines": sum(s.get("total_lines", 0) for s in per_file_signals),
            "total_paragraphs": sum(s.get("total_paragraphs", 0) for s in per_file_signals),
        }
        best_config = document_analyzer._recommend_from_signals(merged_signals, dominant_type)
        reasoning_text = best_config.pop("reasoning", "")
        best_config.pop("signals_used", None)
    else:
        merged_signals = {}
        best_config = {"chunking_method": "recursive", "chunk_size": 512, "overlap": 50,
                       "embedding_model": "text-embedding-3-small"}
        reasoning_text = ""

    if len(docs) > 10:
        best_config["retrieval_strategy"] = "hybrid"

    reasoning = (
        f"Corpus of {len(docs)} files, predominantly {dominant_type} documents. "
        f"{'Contains tables. ' if has_tables else ''}"
        f"{'Contains code blocks. ' if has_code else ''}"
        f"{'Has structured headings. ' if has_headings else ''}"
        f"{reasoning_text} "
        f"Recommended {best_config.get('chunking_method', 'recursive')} chunking "
        f"with {best_config.get('chunk_size', 512)} token chunks."
    )

    # Store corpus config on project
    project.corpus_config = best_config
    project.dominant_doc_type = dominant_type
    db.add(project)
    await db.flush()

    return {
        "corpus_summary": {
            "total_files": len(docs),
            "successful_files": sum(1 for f in file_results if f["status"] == "done"),
            "failed_files": sum(1 for f in file_results if f["status"] == "error"),
            "dominant_doc_type": dominant_type,
            "doc_types": dict(type_counts),
            "has_tables": has_tables,
            "has_code": has_code,
            "has_headings": has_headings,
            "corpus_size": corpus_size,
        },
        "corpus_recommendation": best_config,
        "confidence_score": avg_confidence,
        "reasoning": reasoning,
        "files": file_results,
    }


@router.post("/{project_id}/chunk")
async def chunk_project(
    project_id: UUID,
    config: dict,
    background_tasks: BackgroundTasks,
    db: DbSession,
):
    """Chunk all files in the project with the given config."""
    project = await _get_project(db, project_id)

    doc_q = select(Document).where(Document.project_id == project_id, Document.is_processed == True)
    docs_result = await db.execute(doc_q)
    docs = docs_result.scalars().all()

    if not docs:
        raise BadRequestError("No processed files in the project to chunk")

    from app.services.chunker import apply_chunking

    method = config.get("chunking_method", config.get("method", "recursive"))
    chunk_size = config.get("chunk_size", 512)
    overlap = config.get("overlap", 50)

    total_new_chunks = 0
    results = []

    for doc in docs:
        if not doc.extracted_text:
            results.append({"document_id": str(doc.id), "filename": doc.original_filename, "chunks": 0, "status": "skipped"})
            continue

        # Remove existing chunks for this document
        existing_chunks_q = select(Chunk).where(Chunk.document_id == doc.id)
        existing_result = await db.execute(existing_chunks_q)
        for old_chunk in existing_result.scalars().all():
            await db.delete(old_chunk)

        chunks_data = apply_chunking(
            text=doc.extracted_text,
            method=method,
            chunk_size=chunk_size,
            overlap=overlap,
        )

        for i, c in enumerate(chunks_data):
            chunk = Chunk(
                document_id=doc.id,
                text=c["text"],
                chunk_index=i,
                chunking_method=method,
                chunk_size=chunk_size,
                chunk_overlap=overlap,
                chunk_metadata={},
                token_count=len(c["text"].split()),
            )
            db.add(chunk)

        total_new_chunks += len(chunks_data)
        results.append({
            "document_id": str(doc.id),
            "filename": doc.original_filename,
            "chunks": len(chunks_data),
            "status": "done",
        })

    await db.flush()

    # Update project stats
    await _update_project_stats(db, project_id)

    return {
        "total_chunks": total_new_chunks,
        "config": {"method": method, "chunk_size": chunk_size, "overlap": overlap},
        "files": results,
    }


@router.get("/{project_id}/chunks")
async def get_project_chunks(
    project_id: UUID,
    db: DbSession,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=200),
):
    """Get all chunks across the project."""
    await _get_project(db, project_id)

    # Get all document IDs in the project
    doc_ids_q = select(Document.id).where(Document.project_id == project_id)

    # Count
    count_q = (
        select(func.count(Chunk.id))
        .where(Chunk.document_id.in_(doc_ids_q))
    )
    total = (await db.execute(count_q)).scalar() or 0

    offset = (page - 1) * per_page
    chunks_q = (
        select(Chunk, Document.original_filename)
        .join(Document, Chunk.document_id == Document.id)
        .where(Document.project_id == project_id)
        .order_by(Document.original_filename, Chunk.chunk_index)
        .offset(offset)
        .limit(per_page)
    )
    result = await db.execute(chunks_q)
    rows = result.all()

    items = []
    for chunk, filename in rows:
        items.append({
            "id": str(chunk.id),
            "document_id": str(chunk.document_id),
            "filename": filename,
            "text": chunk.text,
            "chunk_index": chunk.chunk_index,
            "token_count": chunk.token_count,
            "chunking_method": chunk.chunking_method,
        })

    return {
        "items": items,
        "total": total,
        "page": page,
        "per_page": per_page,
    }

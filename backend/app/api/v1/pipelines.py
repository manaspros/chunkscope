"""
Pipeline Endpoints
CRUD operations for RAG pipelines
"""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Query, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func, select, text
import json
import asyncio
import os
from concurrent.futures import ProcessPoolExecutor

from app.core.errors import BadRequestError, NotFoundError
from app.core.logging import get_logger
from app.dependencies import DbSession
from app.models import Pipeline, Document, Chunk, Project
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
        project_id=request.project_id,
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


# ============================================
# Execute Step (node-by-node pipeline execution)
# ============================================

class ExecuteStepRequest(BaseModel):
    """Request body for executing a single pipeline step."""
    node_id: str
    node_type: Optional[str] = None
    config: Optional[dict] = None
    project_id: Optional[str] = None  # fallback if pipeline has no project_id


def _is_chunker_node(node_type: Optional[str]) -> bool:
    """Check if a node type represents a chunking/splitting step."""
    if not node_type:
        return False
    lower = node_type.lower()
    return any(kw in lower for kw in ("splitter", "chunk", "chunking", "chunker"))


def _chunk_document_sync(file_path: str, extracted_text: str, method: str, chunk_size: int, overlap: int):
    """CPU-bound chunking in a separate process."""
    from app.services.chunker import apply_chunking
    from app.services.document_analyzer import document_analyzer as _da

    text_content = extracted_text
    if not text_content and file_path:
        try:
            content = _da._extract_content(file_path)
            text_content = content.get("full_text", "")
        except Exception:
            return None, ""

    if not text_content:
        return None, ""

    chunks = apply_chunking(text=text_content, method=method, chunk_size=chunk_size, overlap=overlap)
    return chunks, text_content


# Process pool for CPU-bound work (text extraction + chunking)
_process_pool = ProcessPoolExecutor(max_workers=max(1, os.cpu_count() - 1))


@router.post("/{pipeline_id}/execute-step")
async def execute_pipeline_step(
    pipeline_id: UUID,
    request: ExecuteStepRequest,
    db: DbSession,
):
    """
    Execute a single pipeline step (node).

    For chunker/splitter nodes: chunks all project documents, generates
    embeddings, and builds tsvector for full-text search.

    For other node types (retriever, reranker, embedder, llm): these are
    query-time configurations and are simply acknowledged.
    """
    pipeline = await _get_pipeline(db, pipeline_id)

    # --- Non-chunker nodes: just acknowledge ---
    if not _is_chunker_node(request.node_type):
        logger.info(
            "execute_step_config_only",
            pipeline_id=str(pipeline_id),
            node_id=request.node_id,
            node_type=request.node_type,
        )
        return {
            "status": "success",
            "data": {
                "message": "Configuration saved",
                "node_id": request.node_id,
                "node_type": request.node_type,
            },
        }

    # --- Chunker node: need a project to find documents ---
    # Priority: request body > pipeline record > pipeline settings
    project_id = None
    if request.project_id:
        try:
            project_id = UUID(request.project_id)
        except (ValueError, TypeError):
            pass

    if not project_id:
        project_id = pipeline.project_id

    if not project_id:
        project_id_str = (pipeline.settings or {}).get("project_id")
        if project_id_str:
            try:
                project_id = UUID(project_id_str)
            except (ValueError, TypeError):
                pass

    if not project_id:
        raise BadRequestError(
            "Pipeline has no associated project. "
            "Pass project_id in the request or associate the pipeline with a project."
        )

    # Persist project_id on pipeline if it was missing
    if not pipeline.project_id and project_id:
        pipeline.project_id = project_id
        db.add(pipeline)
        await db.flush()

    # Verify project exists
    proj_result = await db.execute(select(Project).where(Project.id == project_id))
    project = proj_result.scalar_one_or_none()
    if not project:
        raise NotFoundError("Project", str(project_id))

    # Get all documents for the project
    doc_q = select(Document).where(Document.project_id == project_id)
    docs_result = await db.execute(doc_q)
    docs = docs_result.scalars().all()

    if not docs:
        raise BadRequestError("Project has no documents to chunk")

    # Extract chunking config from node data
    config = request.config or {}
    method = config.get("chunking_method", config.get("method", "recursive"))
    chunk_size = int(config.get("chunk_size", config.get("chunkSize", 512)))
    overlap = int(config.get("overlap", config.get("chunkOverlap", 50)))

    # Check if chunks already exist with embeddings — skip if so
    existing_chunk_q = (
        select(func.count(Chunk.id))
        .join(Document, Chunk.document_id == Document.id)
        .where(Document.project_id == project_id)
    )
    existing_count = (await db.execute(existing_chunk_q)).scalar() or 0

    embedded_q = (
        select(func.count(Chunk.id))
        .join(Document, Chunk.document_id == Document.id)
        .where(
            Document.project_id == project_id,
            Chunk.embedding.isnot(None),
        )
    )
    embedded_count = (await db.execute(embedded_q)).scalar() or 0

    if existing_count > 0 and embedded_count > 0:
        logger.info(
            "execute_step_skip_existing",
            project_id=str(project_id),
            existing_chunks=existing_count,
            embedded_chunks=embedded_count,
        )
        # Update project stats
        project.total_chunks = existing_count
        db.add(project)
        await db.flush()

        return {
            "status": "success",
            "data": {
                "chunks_created": existing_count,
                "embedded_chunks": embedded_count,
                "skipped": True,
                "message": f"Chunks already exist ({existing_count} chunks, {embedded_count} embedded). Skipped re-chunking.",
                "node_id": request.node_id,
                "config": {"method": method, "chunk_size": chunk_size, "overlap": overlap},
            },
        }

    from app.services.chunker import apply_chunking
    from app.services.document_analyzer import document_analyzer as _document_analyzer
    from sqlalchemy import delete as sa_delete

    total_new_chunks = 0
    loop = asyncio.get_event_loop()

    # Process documents in batches of 8
    doc_batch_size = 8
    for batch_start in range(0, len(docs), doc_batch_size):
        batch = docs[batch_start:batch_start + doc_batch_size]

        # Phase A: Extract text + chunk in parallel (CPU-bound, process pool)
        async def extract_and_chunk(doc):
            text_content = doc.extracted_text
            if not text_content:
                try:
                    content = await loop.run_in_executor(
                        _process_pool,
                        _document_analyzer._extract_content, doc.file_path
                    )
                    text_content = content.get("full_text", "") if isinstance(content, dict) else ""
                except Exception as e:
                    logger.warning(
                        "text_extraction_failed",
                        document_id=str(doc.id),
                        error=str(e),
                    )
                    return None
            if not text_content:
                return None
            chunks = await loop.run_in_executor(
                _process_pool,
                apply_chunking, text_content, method, chunk_size, overlap
            )
            return (doc, text_content, chunks)

        batch_results = await asyncio.gather(
            *[extract_and_chunk(d) for d in batch],
            return_exceptions=True,
        )

        # Phase B: DB writes sequentially (safe for shared session)
        for result in batch_results:
            if result is None or isinstance(result, Exception):
                if isinstance(result, Exception):
                    logger.warning("extract_and_chunk_failed", error=str(result))
                continue
            doc, text_content, chunks_data = result

            # Save extracted text if it was missing
            if not doc.extracted_text:
                doc.extracted_text = text_content
                db.add(doc)

            # Delete existing chunks for this document
            await db.execute(sa_delete(Chunk).where(Chunk.document_id == doc.id))

            # Bulk insert all chunks at once
            chunk_objects = []
            for i, c in enumerate(chunks_data):
                chunk_objects.append(Chunk(
                    document_id=doc.id,
                    text=c["text"],
                    chunk_index=i,
                    chunking_method=method,
                    chunk_size=chunk_size,
                    chunk_overlap=overlap,
                    chunk_metadata={},
                    token_count=len(c["text"].split()),
                ))
            db.add_all(chunk_objects)
            await db.flush()

            # Bulk tsvector UPDATE: single SQL statement per document
            try:
                await db.execute(text(
                    "UPDATE chunks SET tsv = to_tsvector('english', text) "
                    "WHERE document_id = :doc_id AND tsv IS NULL"
                ), {"doc_id": str(doc.id)})
            except Exception:
                pass

            total_new_chunks += len(chunks_data)

    await db.flush()

    # Generate embeddings for all new chunks (concurrent batches)
    embed_count = 0
    try:
        import asyncio
        from app.services.llm_service import llm_service

        all_chunks_q = (
            select(Chunk)
            .join(Document, Chunk.document_id == Document.id)
            .where(Document.project_id == project_id, Chunk.embedding.is_(None))
        )
        all_chunks_result = await db.execute(all_chunks_q)
        chunks_to_embed = all_chunks_result.scalars().all()

        if chunks_to_embed:
            batch_size = 100
            batches = [
                chunks_to_embed[i : i + batch_size]
                for i in range(0, len(chunks_to_embed), batch_size)
            ]

            logger.info(
                "execute_step_embedding_start",
                total_chunks=len(chunks_to_embed),
                batches=len(batches),
            )

            for batch in batches:
                try:
                    texts = [c.text for c in batch]
                    embeddings = await llm_service.embed(texts)
                    for chunk_obj, embedding in zip(batch, embeddings):
                        chunk_obj.embedding = embedding
                        db.add(chunk_obj)
                    await db.flush()
                    embed_count += len(batch)
                except Exception as e:
                    logger.warning("execute_step_batch_failed", error=str(e))

            await db.flush()
            logger.info(
                "execute_step_embeddings_generated",
                pipeline_id=str(pipeline_id),
                project_id=str(project_id),
                count=embed_count,
            )
    except Exception as e:
        logger.warning("execute_step_embedding_failed", error=str(e))
        # Chunking succeeded, embeddings failed -- still usable for keyword search

    # Update project stats
    total_chunks_q = (
        select(func.count(Chunk.id))
        .join(Document, Chunk.document_id == Document.id)
        .where(Document.project_id == project_id)
    )
    total_chunks = (await db.execute(total_chunks_q)).scalar() or 0
    project.total_chunks = total_chunks
    db.add(project)
    await db.flush()

    logger.info(
        "execute_step_chunking_complete",
        pipeline_id=str(pipeline_id),
        node_id=request.node_id,
        chunks_created=total_new_chunks,
        embedded=embed_count,
    )

    return {
        "status": "success",
        "data": {
            "chunks_created": total_new_chunks,
            "embedded_chunks": embed_count,
            "config": {"method": method, "chunk_size": chunk_size, "overlap": overlap},
            "node_id": request.node_id,
        },
    }


@router.post("/{pipeline_id}/execute-step-stream")
async def execute_pipeline_step_stream(
    pipeline_id: UUID,
    request: ExecuteStepRequest,
    db: DbSession,
):
    """
    SSE streaming version of execute-step. Reports progress in real-time.
    Events: progress, complete, error
    """

    async def event_stream():
        def send_event(event_type: str, data: dict):
            return f"event: {event_type}\ndata: {json.dumps(data)}\n\n"

        try:
            pipeline = await _get_pipeline(db, pipeline_id)

            # Non-chunker nodes: instant
            if not _is_chunker_node(request.node_type):
                yield send_event("progress", {"step": "config", "progress": 100, "message": "Configuration saved"})
                yield send_event("complete", {
                    "status": "success",
                    "chunks_created": 0, "embedded_chunks": 0,
                    "node_id": request.node_id,
                })
                return

            # Resolve project_id: request body > pipeline record > settings
            project_id = None
            if request.project_id:
                try:
                    project_id = UUID(request.project_id)
                except (ValueError, TypeError):
                    pass
            if not project_id:
                project_id = pipeline.project_id
            if not project_id:
                pid_str = (pipeline.settings or {}).get("project_id")
                if pid_str:
                    try:
                        project_id = UUID(pid_str)
                    except (ValueError, TypeError):
                        pass
            if not project_id:
                yield send_event("error", {"message": "No project associated with pipeline. Navigate from your project page."})
                return
            # Persist project_id on pipeline if missing
            if not pipeline.project_id and project_id:
                pipeline.project_id = project_id
                db.add(pipeline)
                await db.flush()

            proj_result = await db.execute(select(Project).where(Project.id == project_id))
            project = proj_result.scalar_one_or_none()
            if not project:
                yield send_event("error", {"message": "Project not found"})
                return

            doc_q = select(Document).where(Document.project_id == project_id)
            docs_result = await db.execute(doc_q)
            docs = docs_result.scalars().all()
            if not docs:
                yield send_event("error", {"message": "No documents to chunk"})
                return

            config = request.config or {}
            method = config.get("chunking_method", config.get("method", "recursive"))
            chunk_size = int(config.get("chunk_size", config.get("chunkSize", 512)))
            overlap = int(config.get("overlap", config.get("chunkOverlap", 50)))

            yield send_event("progress", {
                "step": "init", "progress": 0,
                "message": f"Starting: {len(docs)} documents, method={method}, size={chunk_size}",
            })

            # Check skip — if chunks with embeddings exist, don't re-chunk
            existing_chunk_q = (
                select(func.count(Chunk.id))
                .join(Document, Chunk.document_id == Document.id)
                .where(Document.project_id == project_id)
            )
            existing_count = (await db.execute(existing_chunk_q)).scalar() or 0
            embedded_q = (
                select(func.count(Chunk.id))
                .join(Document, Chunk.document_id == Document.id)
                .where(Document.project_id == project_id, Chunk.embedding.isnot(None))
            )
            embedded_count = (await db.execute(embedded_q)).scalar() or 0

            if existing_count > 0 and embedded_count > 0:
                project.total_chunks = existing_count
                db.add(project)
                await db.flush()
                yield send_event("progress", {"step": "skip", "progress": 100, "message": f"Cached: {existing_count} chunks, {embedded_count} embedded"})
                yield send_event("complete", {
                    "status": "success", "skipped": True,
                    "chunks_created": existing_count, "embedded_chunks": embedded_count,
                    "node_id": request.node_id,
                })
                return

            # Phase 1: Chunking (60% of progress)
            yield send_event("progress", {"step": "chunking", "progress": 5, "message": "Extracting text & chunking documents..."})

            from app.services.chunker import apply_chunking
            from app.services.document_analyzer import document_analyzer as _document_analyzer
            from sqlalchemy import delete as sa_delete

            total_new_chunks = 0
            loop = asyncio.get_event_loop()
            docs_processed = 0

            # Process documents in batches of 8
            doc_batch_size = 8
            for batch_start in range(0, len(docs), doc_batch_size):
                batch = docs[batch_start:batch_start + doc_batch_size]

                # Phase A: Extract text + chunk in parallel (CPU-bound, process pool)
                async def extract_and_chunk(doc):
                    text_content = doc.extracted_text
                    if not text_content:
                        try:
                            content = await loop.run_in_executor(
                                _process_pool,
                                _document_analyzer._extract_content, doc.file_path
                            )
                            text_content = content.get("full_text", "") if isinstance(content, dict) else ""
                        except Exception:
                            return None
                    if not text_content:
                        return None
                    chunks = await loop.run_in_executor(
                        _process_pool,
                        apply_chunking, text_content, method, chunk_size, overlap
                    )
                    return (doc, text_content, chunks)

                batch_results = await asyncio.gather(
                    *[extract_and_chunk(d) for d in batch],
                    return_exceptions=True,
                )

                # Phase B: DB writes sequentially (safe for shared session)
                for result in batch_results:
                    if result is None or isinstance(result, Exception):
                        docs_processed += 1
                        continue
                    doc, text_content, chunks_data = result

                    # Save extracted text if it was missing
                    if not doc.extracted_text:
                        doc.extracted_text = text_content
                        db.add(doc)

                    # Delete old chunks
                    await db.execute(sa_delete(Chunk).where(Chunk.document_id == doc.id))

                    # Bulk insert all chunks at once
                    chunk_objects = []
                    for i, c in enumerate(chunks_data):
                        chunk_objects.append(Chunk(
                            document_id=doc.id, text=c["text"], chunk_index=i,
                            chunking_method=method, chunk_size=chunk_size,
                            chunk_overlap=overlap, chunk_metadata={},
                            token_count=len(c["text"].split()),
                        ))
                    db.add_all(chunk_objects)
                    await db.flush()

                    # Bulk tsvector UPDATE: single SQL statement per document
                    try:
                        await db.execute(text(
                            "UPDATE chunks SET tsv = to_tsvector('english', text) "
                            "WHERE document_id = :doc_id AND tsv IS NULL"
                        ), {"doc_id": str(doc.id)})
                    except Exception:
                        pass

                    total_new_chunks += len(chunks_data)
                    docs_processed += 1

                pct = int(5 + docs_processed / len(docs) * 55)  # 5% to 60%
                yield send_event("progress", {
                    "step": "chunking", "progress": pct,
                    "message": f"Chunked {docs_processed}/{len(docs)} docs ({total_new_chunks} chunks)",
                })

            await db.flush()

            # Phase 2: Embedding (60% -> 95%)
            yield send_event("progress", {"step": "embedding", "progress": 60, "message": "Generating embeddings..."})

            embed_count = 0
            try:
                from app.services.llm_service import llm_service

                all_chunks_q = (
                    select(Chunk).join(Document, Chunk.document_id == Document.id)
                    .where(Document.project_id == project_id, Chunk.embedding.is_(None))
                )
                chunks_to_embed = (await db.execute(all_chunks_q)).scalars().all()

                if chunks_to_embed:
                    batch_size = 100
                    batches = [chunks_to_embed[i:i + batch_size] for i in range(0, len(chunks_to_embed), batch_size)]

                    for batch_idx, batch in enumerate(batches):
                        # API call (network I/O, safe)
                        try:
                            texts = [c.text for c in batch]
                            embeddings = await llm_service.embed(texts)
                            # DB writes (sequential, safe for asyncpg)
                            for chunk_obj, embedding in zip(batch, embeddings):
                                chunk_obj.embedding = embedding
                                db.add(chunk_obj)
                            await db.flush()
                            embed_count += len(batch)
                        except Exception as e:
                            logger.warning("batch_embed_failed", error=str(e))

                        pct = int(60 + (embed_count / len(chunks_to_embed)) * 35)
                        yield send_event("progress", {
                            "step": "embedding", "progress": pct,
                            "message": f"Embedded {embed_count}/{len(chunks_to_embed)} chunks",
                        })
            except Exception as e:
                logger.warning("embedding_failed", error=str(e))

            # Phase 3: Finalize (95% -> 100%)
            total_chunks_q = (
                select(func.count(Chunk.id)).join(Document, Chunk.document_id == Document.id)
                .where(Document.project_id == project_id)
            )
            total_chunks = (await db.execute(total_chunks_q)).scalar() or 0
            project.total_chunks = total_chunks
            db.add(project)
            await db.flush()

            yield send_event("progress", {"step": "done", "progress": 100, "message": "Complete!"})
            yield send_event("complete", {
                "status": "success",
                "chunks_created": total_new_chunks,
                "embedded_chunks": embed_count,
                "node_id": request.node_id,
                "config": {"method": method, "chunk_size": chunk_size, "overlap": overlap},
            })

        except Exception as e:
            logger.error("execute_step_stream_error", error=str(e))
            yield send_event("error", {"message": str(e)})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


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

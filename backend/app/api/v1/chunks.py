"""
Chunk Endpoints
Operations for text chunks and vector search
"""
import time
from uuid import UUID

from fastapi import APIRouter, Query
from sqlalchemy import func, select, text

from app.core.errors import BadRequestError, NotFoundError
from app.core.logging import get_logger
from app.dependencies import DbSession
from app.models import Chunk, Document
from app.schemas import (
    ChunkingConfig,
    ChunkListResponse,
    ChunkMetrics,
    ChunkResponse,
    ChunkVisualization,
    ChunkVisualizeRequest,
    ChunkVisualizeResponse,
    ChunkWithSimilarity,
    PaginationParams,
    paginate,
)

logger = get_logger(__name__)

router = APIRouter(prefix="/chunks", tags=["Chunks"])


@router.post("/visualize", response_model=ChunkVisualizeResponse)
async def visualize_chunks(
    request: ChunkVisualizeRequest,
    db: DbSession,
) -> ChunkVisualizeResponse:
    """
    Process a document with the specified chunking configuration.

    Returns chunks with bounding box coordinates for visualization.
    """
    start_time = time.time()

    # Verify document exists
    result = await db.execute(
        select(Document).where(Document.id == request.document_id)
    )
    document = result.scalar_one_or_none()

    if not document:
        raise NotFoundError("Document", str(request.document_id))

    # Check if file exists
    from pathlib import Path
    if not Path(document.file_path).exists():
        raise NotFoundError("File", document.file_path)

    config = request.chunking_config

    # Validate configuration
    if config.overlap >= config.chunk_size:
        raise BadRequestError("Overlap must be less than chunk_size")

    # ---------------------------------------------------------
    # 1. Extract Text with Character Coordinates
    # ---------------------------------------------------------
    from app.services.pdf_processor import pdf_processor
    from app.schemas.pdf_schemas import ExtractionOptions
    from app.schemas.chunk import BoundingBox as ChunkBBox

    try:
        extracted = pdf_processor.extract_document(
            document.file_path,
            options=ExtractionOptions(extract_characters=True)
        )
    except Exception as e:
        logger.error(f"Failed to re-extract PDF for visualization: {e}")
        raise BadRequestError(f"Failed to process PDF: {e}")

    flattened_chars = []
    full_text = ""

    for page in extracted.pages:
        page_num = page.page_number + 1

        sorted_blocks = sorted(page.blocks, key=lambda b: (b.bbox.y0, b.bbox.x0))

        for block in sorted_blocks:
            for line in block.lines:
                for span in line.spans:
                    if span.characters:
                        for char_info in span.characters:
                            full_text += char_info.char
                            flattened_chars.append({
                                "char": char_info.char,
                                "page": page_num,
                                "bbox": char_info
                            })
                    else:
                        full_text += span.text
                        for c in span.text:
                            flattened_chars.append(None)

                full_text += " "
                flattened_chars.append(None)

            full_text += "\n"
            flattened_chars.append(None)

    # ---------------------------------------------------------
    # 2. Apply Chunking
    # ---------------------------------------------------------
    from app.services.chunker import apply_chunking
    chunks_data = apply_chunking(
        text=full_text,
        method=config.method,
        chunk_size=config.chunk_size,
        overlap=config.overlap,
    )
    # ---------------------------------------------------------
    # 3. Map Chunks to BBoxes
    # ---------------------------------------------------------
    final_chunks = []

    for i, c in enumerate(chunks_data):
        start, end = c["start"], c["end"]
        chunk_text = c["text"]

        start = max(0, start)
        end = min(len(flattened_chars), end)

        segment_chars = flattened_chars[start:end]

        bboxes = []
        current_rect = None

        for item in segment_chars:
            if item is None:
                continue

            char_info = item["bbox"]
            page = item["page"]

            if current_rect and current_rect.page == page and abs(current_rect.y - char_info.y) < 5:
                curr_x0 = current_rect.x
                curr_x1 = current_rect.x + current_rect.width
                new_x0 = char_info.x
                new_x1 = char_info.x + char_info.width

                final_x0 = min(curr_x0, new_x0)
                final_x1 = max(curr_x1, new_x1)

                current_rect.x = final_x0
                current_rect.width = final_x1 - final_x0
                current_rect.height = max(current_rect.height, char_info.height)
            else:
                if current_rect:
                    bboxes.append(current_rect)

                current_rect = ChunkBBox(
                    page=page,
                    x=char_info.x,
                    y=char_info.y,
                    width=char_info.width,
                    height=char_info.height
                )

        if current_rect:
            bboxes.append(current_rect)

        primary_bbox = bboxes[0] if bboxes else None

        final_chunks.append(
            ChunkVisualization(
                id=f"chunk_{i}",
                text=chunk_text,
                bbox=primary_bbox,
                bboxes=bboxes,
                metadata={"char_start": start, "char_end": end},
            )
        )

    # Build response
    chunk_sizes = [len(c["text"]) for c in chunks_data]
    processing_time_ms = int((time.time() - start_time) * 1000)

    metrics = ChunkMetrics(
        total_chunks=len(final_chunks),
        avg_chunk_size=sum(chunk_sizes) / len(chunk_sizes) if chunk_sizes else 0,
        min_chunk_size=min(chunk_sizes) if chunk_sizes else 0,
        max_chunk_size=max(chunk_sizes) if chunk_sizes else 0,
        processing_time_ms=processing_time_ms,
    )

    logger.info(
        "chunks_visualized_with_bboxes",
        document_id=str(document.id),
        method=config.method,
        chunk_count=len(final_chunks),
        processing_time_ms=processing_time_ms,
    )

    return ChunkVisualizeResponse(
        document_id=document.id,
        chunks=final_chunks,
        metrics=metrics,
    )

@router.get("/document/{document_id}", response_model=ChunkListResponse)
async def list_document_chunks(
    document_id: UUID,
    db: DbSession,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=100),
) -> ChunkListResponse:
    """List all chunks for a document."""
    params = PaginationParams(page=page, per_page=per_page)

    # Verify document exists
    doc_result = await db.execute(
        select(Document).where(Document.id == document_id)
    )
    if not doc_result.scalar_one_or_none():
        raise NotFoundError("Document", str(document_id))

    # Count total
    count_query = select(func.count(Chunk.id)).where(Chunk.document_id == document_id)
    total = (await db.execute(count_query)).scalar() or 0

    # Fetch chunks
    query = (
        select(Chunk)
        .where(Chunk.document_id == document_id)
        .order_by(Chunk.chunk_index)
        .offset(params.offset)
        .limit(params.per_page)
    )
    result = await db.execute(query)
    chunks = result.scalars().all()

    return paginate(
        items=[ChunkResponse.model_validate(c) for c in chunks],
        total=total,
        params=params,
    )


@router.get("/{chunk_id}", response_model=ChunkResponse)
async def get_chunk(
    chunk_id: UUID,
    db: DbSession,
) -> ChunkResponse:
    """Get a specific chunk by ID."""
    result = await db.execute(
        select(Chunk).where(Chunk.id == chunk_id)
    )
    chunk = result.scalar_one_or_none()

    if not chunk:
        raise NotFoundError("Chunk", str(chunk_id))

    return ChunkResponse.model_validate(chunk)


@router.get("/search/similar", response_model=list[ChunkWithSimilarity])
async def search_similar_chunks(
    db: DbSession,
    query_embedding: str = Query(
        description="Comma-separated embedding vector (1536 dimensions)"
    ),
    document_id: UUID | None = Query(default=None, description="Limit to specific document"),
    limit: int = Query(default=10, ge=1, le=100),
) -> list[ChunkWithSimilarity]:
    """
    Search for similar chunks using vector similarity.
    Requires a pre-computed query embedding.
    """
    # Parse embedding from query param
    try:
        embedding_values = [float(x.strip()) for x in query_embedding.split(",")]
        if len(embedding_values) != 1536:
            raise ValueError(f"Expected 1536 dimensions, got {len(embedding_values)}")
    except ValueError as e:
        raise ValueError(f"Invalid embedding format: {e}")

    # Build query with cosine similarity
    embedding_str = f"[{','.join(map(str, embedding_values))}]"

    base_query = (
        select(
            Chunk,
            (1 - Chunk.embedding.cosine_distance(text(f"'{embedding_str}'::vector"))).label("similarity")
        )
        .join(Document)
    )

    if document_id:
        base_query = base_query.where(Chunk.document_id == document_id)

    query = (
        base_query
        .order_by(text("similarity DESC"))
        .limit(limit)
    )

    result = await db.execute(query)
    rows = result.all()

    return [
        ChunkWithSimilarity(
            **ChunkResponse.model_validate(row.Chunk).model_dump(),
            similarity=row.similarity,
        )
        for row in rows
    ]

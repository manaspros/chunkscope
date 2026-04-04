
"""
Document Analysis API Endpoints
"""
import tempfile
import traceback
from pathlib import Path
from typing import Dict, List, Optional
from uuid import UUID
from collections import Counter

from fastapi import APIRouter, File, HTTPException, UploadFile, status, Depends, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.core.errors import AppException
from app.services.document_analyzer import document_analyzer
from app.services.document_service import document_service
from app.models import Document
from app.core.database import get_db

logger = get_logger(__name__)

router = APIRouter(prefix="/analyze", tags=["analysis"])


class AnalysisResponse(BaseModel):
    """Response schema for document analysis."""
    document_id: Optional[UUID] = None
    document_type: str
    structure: Dict
    density: Dict
    recommended_config: Dict
    confidence_score: float
    reasoning: str
    content_signals: Optional[Dict] = None
    pipeline_recommendation: Optional[Dict] = None


class CorpusFileResult(BaseModel):
    filename: str
    document_id: Optional[UUID] = None
    document_type: str
    word_count: int = 0
    status: str = "done"
    error: Optional[str] = None


class CorpusAnalysisResponse(BaseModel):
    corpus_summary: Dict
    corpus_recommendation: Dict
    confidence_score: float
    reasoning: str
    files: List[CorpusFileResult]


@router.post("", response_model=AnalysisResponse)
async def analyze_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Analyze an uploaded document.

    Saves the document and returns analysis with recommended chunking config.
    """
    document_id = None
    temp_path = None

    try:
        # Validate and save file using document service
        file_type = await document_service.validate_upload(file)
        stored_filename, file_path, file_size = await document_service.save_file(file, file_type)
        temp_path = file_path

        # Create Document record
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
        await db.commit()
        await db.refresh(document)

        document_id = document.id

        # Start extraction in background
        background_tasks.add_task(document_service.process_document, document_id)

        # Analyze the document
        logger.info(f"Analyzing file: {file.filename}, document_id={document_id}")

        # Run analysis
        result = await document_analyzer.analyze(file_path)

        # Debug logging
        logger.info("analysis_complete", filename=file.filename, document_id=document_id)

        # Compute pipeline recommendation if content signals are available
        pipeline_rec = None
        try:
            from app.services.pipeline_recommender import pipeline_recommender
            signals = result.get("content_signals", {})
            if signals:
                rec = pipeline_recommender.recommend(
                    signals=signals,
                    doc_type=result["document_type"],
                )
                pipeline_rec = rec.to_dict()
        except Exception as e:
            logger.warning("pipeline_recommendation_failed", error=str(e))

        return AnalysisResponse(
            document_id=document_id,
            pipeline_recommendation=pipeline_rec,
            **result
        )

    except Exception as e:
        if isinstance(e, AppException):
            raise e

        logger.exception("analysis_failed", error=str(e), document_id=document_id)

        logger.error(f"Document analysis failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Analysis failed: {str(e)}"
        )


@router.post("/corpus", response_model=CorpusAnalysisResponse)
async def analyze_corpus(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Analyze multiple files as a single RAG corpus.
    Returns both per-file results and aggregated corpus-level recommendation.
    """
    file_results: list[CorpusFileResult] = []
    doc_types: list[str] = []
    total_words = 0
    has_tables = False
    has_code = False
    has_headings = False
    all_confidences: list[float] = []
    per_file_signals: list[dict] = []

    for uploaded_file in files:
        try:
            file_type = await document_service.validate_upload(uploaded_file)
            stored_filename, file_path, file_size = await document_service.save_file(uploaded_file, file_type)

            document = Document(
                filename=stored_filename,
                original_filename=uploaded_file.filename or "unknown",
                file_path=file_path,
                file_type=file_type.value,
                file_size_bytes=file_size,
                doc_metadata={},
                is_processed=False,
            )
            db.add(document)
            await db.commit()
            await db.refresh(document)

            background_tasks.add_task(document_service.process_document, document.id)

            result = await document_analyzer.analyze(file_path)

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

            file_results.append(CorpusFileResult(
                filename=uploaded_file.filename or "unknown",
                document_id=document.id,
                document_type=result["document_type"],
                word_count=int(word_count),
                status="done",
            ))

        except Exception as e:
            logger.error(f"Failed to analyze {uploaded_file.filename}: {e}")
            file_results.append(CorpusFileResult(
                filename=uploaded_file.filename or "unknown",
                document_type="unknown",
                status="error",
                error=str(e),
            ))

    # Aggregate
    type_counts = Counter(doc_types)
    dominant_type = type_counts.most_common(1)[0][0] if type_counts else "general"
    avg_confidence = sum(all_confidences) / len(all_confidences) if all_confidences else 0.5

    corpus_size = "small" if len(files) < 100 else "medium" if len(files) < 1000 else "large"

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

    if len(files) > 10:
        best_config["retrieval_strategy"] = "hybrid"

    reasoning = (
        f"Corpus of {len(files)} files, predominantly {dominant_type} documents. "
        f"{'Contains tables. ' if has_tables else ''}"
        f"{'Contains code blocks. ' if has_code else ''}"
        f"{'Has structured headings. ' if has_headings else ''}"
        f"{reasoning_text} "
        f"Recommended {best_config.get('chunking_method', 'recursive')} chunking "
        f"with {best_config.get('chunk_size', 512)} token chunks."
    )

    return CorpusAnalysisResponse(
        corpus_summary={
            "total_files": len(files),
            "successful_files": sum(1 for f in file_results if f.status == "done"),
            "failed_files": sum(1 for f in file_results if f.status == "error"),
            "total_words": total_words,
            "dominant_doc_type": dominant_type,
            "doc_types": dict(type_counts),
            "has_tables": has_tables,
            "has_code": has_code,
            "has_headings": has_headings,
            "corpus_size": corpus_size,
        },
        corpus_recommendation=best_config,
        confidence_score=avg_confidence,
        reasoning=reasoning,
        files=file_results,
    )

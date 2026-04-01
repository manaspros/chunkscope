
"""
Document Analysis API Endpoints
"""
import tempfile
import traceback
from pathlib import Path
from typing import Dict, Optional
from uuid import UUID

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

        return AnalysisResponse(
            document_id=document_id,
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

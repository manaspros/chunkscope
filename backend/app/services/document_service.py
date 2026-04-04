"""
Document Service
Business logic for document upload, validation, and processing
"""
import csv
import os
import uuid
from html.parser import HTMLParser
from pathlib import Path
from typing import BinaryIO

import aiofiles
from fastapi import UploadFile

from app.config import settings
from app.core.errors import BadRequestError
from app.core.logging import get_logger
from app.core.database import async_session_maker
from app.models import Document, DocumentType, Chunk, ChunkingMethod
from app.services.pdf_processor import pdf_processor
from app.services.chunker import apply_chunking
from sqlalchemy import select, update, func
from fastapi.concurrency import run_in_threadpool

logger = get_logger(__name__)

# PDF magic bytes
PDF_MAGIC_BYTES = b"%PDF"

# ZIP magic bytes
ZIP_MAGIC_BYTES = b"PK"

# File extension to DocumentType mapping (expanded for all common types)
EXTENSION_TO_TYPE = {
    # Documents
    ".pdf": DocumentType.PDF,
    ".txt": DocumentType.TXT,
    ".md": DocumentType.MD,
    ".markdown": DocumentType.MD,
    ".docx": DocumentType.DOCX,
    ".doc": DocumentType.DOC,
    ".html": DocumentType.HTML,
    ".htm": DocumentType.HTML,
    # Data formats
    ".csv": DocumentType.CSV,
    ".json": DocumentType.JSON,
    ".xml": DocumentType.XML,
    ".yaml": DocumentType.YAML,
    ".yml": DocumentType.YAML,
    # Code files
    ".py": DocumentType.CODE,
    ".js": DocumentType.CODE,
    ".ts": DocumentType.CODE,
    ".tsx": DocumentType.CODE,
    ".jsx": DocumentType.CODE,
    ".java": DocumentType.CODE,
    ".cpp": DocumentType.CODE,
    ".c": DocumentType.CODE,
    ".h": DocumentType.CODE,
    ".go": DocumentType.CODE,
    ".rs": DocumentType.CODE,
    ".rb": DocumentType.CODE,
    ".php": DocumentType.CODE,
    ".swift": DocumentType.CODE,
    ".kt": DocumentType.CODE,
    ".scala": DocumentType.CODE,
    ".r": DocumentType.CODE,
    ".sql": DocumentType.CODE,
    ".sh": DocumentType.CODE,
    ".bash": DocumentType.CODE,
    ".zsh": DocumentType.CODE,
    ".ps1": DocumentType.CODE,
    ".css": DocumentType.CODE,
    ".scss": DocumentType.CODE,
    ".less": DocumentType.CODE,
    # Config files
    ".toml": DocumentType.CONFIG,
    ".ini": DocumentType.CONFIG,
    ".cfg": DocumentType.CONFIG,
    ".env": DocumentType.CONFIG,
    ".properties": DocumentType.CONFIG,
    # Text variants
    ".rst": DocumentType.TXT,
    ".tex": DocumentType.TXT,
    ".rtf": DocumentType.TXT,
    ".log": DocumentType.TXT,
    # Archives
    ".zip": DocumentType.ZIP,
}


class DocumentService:
    """Service for document operations."""
    
    def __init__(self, upload_dir: str | None = None):
        self.upload_dir = Path(upload_dir or settings.upload_dir)
        self.max_size_bytes = settings.max_upload_size_mb * 1024 * 1024
    
    async def validate_upload(self, file: UploadFile) -> DocumentType:
        """
        Validate uploaded file.

        Accepts any file type. Known extensions get mapped to specific types;
        unknown extensions are allowed with type "unknown".

        Returns:
            DocumentType if valid

        Raises:
            BadRequestError: If file is invalid
        """
        # Check filename
        if not file.filename:
            raise BadRequestError("Filename is required")

        # Determine type from extension (unknown extensions are allowed)
        ext = Path(file.filename).suffix.lower()
        file_type = EXTENSION_TO_TYPE.get(ext, DocumentType.UNKNOWN)

        if file_type == DocumentType.UNKNOWN:
            logger.warning(
                "unknown_file_extension",
                filename=file.filename,
                extension=ext,
            )

        # For PDFs, validate magic bytes
        if ext == ".pdf":
            header = await file.read(4)
            await file.seek(0)

            if header != PDF_MAGIC_BYTES:
                raise BadRequestError("Invalid PDF file (corrupted or not a PDF)")

        # For ZIP files, validate magic bytes
        if ext == ".zip":
            header = await file.read(2)
            await file.seek(0)

            if header != ZIP_MAGIC_BYTES:
                raise BadRequestError("Invalid ZIP file (corrupted or not a ZIP)")

        # Check file size by reading chunks
        total_size = 0
        chunk_size = 64 * 1024  # 64KB chunks

        while True:
            chunk = await file.read(chunk_size)
            if not chunk:
                break
            total_size += len(chunk)

            if total_size > self.max_size_bytes:
                raise BadRequestError(
                    f"File too large. Maximum size: {settings.max_upload_size_mb}MB"
                )

        # Reset file position for later reading
        await file.seek(0)

        return file_type
    
    async def save_file(self, file: UploadFile, file_type: DocumentType) -> tuple[str, str, int]:
        """
        Save uploaded file to disk.
        
        Returns:
            Tuple of (stored_filename, file_path, file_size_bytes)
        """
        # Generate unique filename
        ext = Path(file.filename or "file").suffix.lower()
        stored_filename = f"{uuid.uuid4().hex}{ext}"
        
        # Ensure upload directory exists
        self.upload_dir.mkdir(parents=True, exist_ok=True)
        
        file_path = self.upload_dir / stored_filename
        
        # Stream file to disk
        total_bytes = 0
        async with aiofiles.open(file_path, "wb") as f:
            while True:
                chunk = await file.read(64 * 1024)  # 64KB chunks
                if not chunk:
                    break
                await f.write(chunk)
                total_bytes += len(chunk)
        
        logger.info(
            "file_saved",
            filename=stored_filename,
            original_filename=file.filename,
            size_bytes=total_bytes,
        )
        
        return stored_filename, str(file_path), total_bytes

    def delete_file(self, file_path: str) -> bool:
        """Delete a file from disk. Returns True if deleted, False if not found."""
        path = Path(file_path)
        if path.exists():
            path.unlink()
            logger.info("file_deleted", path=file_path)
            return True
        return False

    # ------------------------------------------------------------------
    # Text extraction helpers
    # ------------------------------------------------------------------

    def _extract_csv_text(self, file_path: str) -> str:
        lines = []
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            reader = csv.reader(f)
            for row in reader:
                lines.append(" | ".join(row))
        return "\n".join(lines)

    def _extract_html_text(self, file_path: str) -> str:
        class _TextExtractor(HTMLParser):
            def __init__(self):
                super().__init__()
                self.text_parts: list[str] = []
                self._skip = False

            def handle_starttag(self, tag, attrs):
                if tag in ("script", "style"):
                    self._skip = True

            def handle_endtag(self, tag):
                if tag in ("script", "style"):
                    self._skip = False

            def handle_data(self, data):
                if not self._skip:
                    stripped = data.strip()
                    if stripped:
                        self.text_parts.append(stripped)

        html = Path(file_path).read_text(encoding="utf-8", errors="replace")
        extractor = _TextExtractor()
        extractor.feed(html)
        return "\n".join(extractor.text_parts)

    def _extract_docx_text(self, file_path: str) -> str:
        try:
            from docx import Document as DocxDocument
            doc = DocxDocument(file_path)
            return "\n\n".join(
                para.text for para in doc.paragraphs if para.text.strip()
            )
        except ImportError:
            logger.warning("python-docx not installed, reading raw bytes as text")
            return Path(file_path).read_text(encoding="utf-8", errors="replace")
        except Exception:
            return ""

    async def _extract_text(self, file_path: str, file_type: str) -> str:
        """Extract text from any supported file type."""
        if file_type == DocumentType.PDF or file_type == "pdf":
            # PDF extraction handled separately in process_document
            return ""
        elif file_type in (
            DocumentType.TXT, DocumentType.MD, DocumentType.CONFIG,
            DocumentType.UNKNOWN, "txt", "md", "config", "unknown",
        ):
            return Path(file_path).read_text(encoding="utf-8", errors="replace")
        elif file_type in (DocumentType.CODE, "code"):
            text = Path(file_path).read_text(encoding="utf-8", errors="replace")
            filename = Path(file_path).name
            return f"# File: {filename}\n\n{text}"
        elif file_type in (DocumentType.CSV, "csv"):
            return self._extract_csv_text(file_path)
        elif file_type in (DocumentType.JSON, "json"):
            import json as json_mod
            data = json_mod.loads(
                Path(file_path).read_text(encoding="utf-8")
            )
            return json_mod.dumps(data, indent=2)
        elif file_type in (DocumentType.YAML, "yaml"):
            return Path(file_path).read_text(encoding="utf-8", errors="replace")
        elif file_type in (DocumentType.HTML, "html"):
            return self._extract_html_text(file_path)
        elif file_type in (DocumentType.DOCX, "docx"):
            return await run_in_threadpool(self._extract_docx_text, file_path)
        elif file_type in (DocumentType.XML, "xml"):
            return Path(file_path).read_text(encoding="utf-8", errors="replace")
        else:
            # Best-effort: try reading as text
            try:
                return Path(file_path).read_text(encoding="utf-8", errors="replace")
            except Exception:
                return ""

    # ------------------------------------------------------------------
    # Document processing
    # ------------------------------------------------------------------

    async def process_document(self, document_id: uuid.UUID) -> bool:
        """
        Process a document to extract text and metadata.

        NOTE: No longer called from upload endpoints. Uploads now set
        is_processed=True immediately and text is extracted on-demand
        at chunk time (see chunk_project in projects.py). This method
        is kept for the visualizer page and any other callers that may
        need standalone background extraction.

        This method is designed to run in the background.
        It manages its own database session.
        """
        logger.info("processing_started", document_id=str(document_id))

        async with async_session_maker() as db:
            try:
                # Fetch document
                result = await db.execute(select(Document).where(Document.id == document_id))
                document = result.scalar_one_or_none()

                if not document:
                    logger.error("processing_failed", error="Document not found", document_id=str(document_id))
                    return False

                # Verify file exists
                file_path = Path(document.file_path)
                if not file_path.exists():
                    logger.error("processing_failed", error="File not found", path=str(file_path))
                    return False

                file_type = document.file_type

                # Process based on type
                if file_type == DocumentType.PDF or file_type == "pdf":
                    # Run extraction in thread pool to avoid blocking
                    extracted_doc = await run_in_threadpool(
                        pdf_processor.extract_document,
                        file_path
                    )

                    # Update document
                    document.extracted_text = extracted_doc.full_text

                    # Merge metadata
                    current_metadata = document.doc_metadata or {}
                    new_metadata = extracted_doc.metadata.model_dump(mode='json', exclude_none=True)
                    current_metadata.update(new_metadata)

                    # Add processing stats
                    current_metadata["page_count"] = extracted_doc.page_count
                    current_metadata["extraction_time_ms"] = extracted_doc.extraction_time_ms
                    current_metadata["total_blocks"] = extracted_doc.total_blocks
                    current_metadata["total_tables"] = extracted_doc.total_tables

                    document.doc_metadata = current_metadata
                    document.is_processed = True

                elif file_type == DocumentType.ZIP or file_type == "zip":
                    # ZIP files are handled by the upload-zip endpoint;
                    # if one ends up here just mark as processed.
                    logger.info("zip_skip_processing", document_id=str(document_id))
                    document.is_processed = True

                else:
                    # All other types: extract text directly
                    extracted_text = await self._extract_text(
                        str(file_path), file_type
                    )
                    document.extracted_text = extracted_text
                    current_metadata = document.doc_metadata or {}
                    current_metadata["char_count"] = len(extracted_text)
                    document.doc_metadata = current_metadata
                    document.is_processed = True

                # NOTE: No default chunking on upload. Chunking happens
                # explicitly when the user selects a strategy (via /chunk endpoint
                # or "Apply All" from AI analysis). This avoids wasting time on
                # chunking that will be immediately replaced.

                # Save changes
                db.add(document)
                await db.commit()

                logger.info(
                    "processing_completed",
                    document_id=str(document_id),
                    file_type=file_type,
                )
                return True

            except Exception as e:
                logger.error("processing_failed", document_id=str(document_id), error=str(e))
                # Optionally update document status to failed if we had a status field
                # For now just log it
                return False


# Singleton instance
document_service = DocumentService()

"""
One-click demo: seeds (idempotently) a sample project with a bundled document and
chunks it, so a first-time visitor of the hosted prototype can query immediately.
"""
from pathlib import Path

from fastapi import APIRouter
from sqlalchemy import select

from app.api.v1.projects import _update_project_stats, chunk_project
from app.dependencies import DbSession
from app.models import Document, Project

router = APIRouter(prefix="/demo", tags=["Demo"])

SAMPLE_NAME = "Sample: FastAPI auth guide"
SAMPLE_FILE = Path(__file__).resolve().parents[3] / "static" / "sample" / "fastapi-auth-guide.md"
SAMPLE_QUERIES = ["JWT token", "password hashing", "refresh tokens", "rate limiting"]


@router.post("/seed")
async def seed_sample(db: DbSession):
    """Create (or reuse) the sample project and make sure it is chunked."""
    project = (await db.execute(select(Project).where(Project.name == SAMPLE_NAME))).scalars().first()
    if project is None:
        project = Project(name=SAMPLE_NAME, description="Bundled sample document for the hosted demo.")
        db.add(project)
        await db.flush()
        text_content = SAMPLE_FILE.read_text(encoding="utf-8")
        db.add(Document(
            filename=SAMPLE_FILE.name,
            original_filename=SAMPLE_FILE.name,
            file_path=str(SAMPLE_FILE),
            file_type="md",
            file_size_bytes=len(text_content.encode("utf-8")),
            doc_metadata={},
            extracted_text=text_content,
            is_processed=True,
            project_id=project.id,
        ))
        await db.flush()
        await _update_project_stats(db, project.id)
    if not project.total_chunks:
        await chunk_project(project.id, {"chunking_method": "recursive", "chunk_size": 500, "overlap": 50}, db)
        await db.refresh(project)
    return {"project_id": str(project.id), "name": project.name, "total_chunks": project.total_chunks, "sample_queries": SAMPLE_QUERIES}

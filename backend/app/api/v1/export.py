"""
Code Export API Endpoints
"""
from fastapi import APIRouter
from fastapi.responses import Response

from app.schemas.export_schemas import (
    CodeExportResponse,
    DockerExportResponse,
    PipelineExportConfig,
)
from app.services.code_generator import CodeGenerator, build_zip

router = APIRouter(prefix="/export", tags=["Code Export"])

_generator = CodeGenerator()


@router.post("/code", response_model=CodeExportResponse)
async def export_code(config: PipelineExportConfig) -> CodeExportResponse:
    """Generate all project files and return them as JSON (filename -> content)."""
    files = _generator.generate(config.model_dump())
    return CodeExportResponse(files=files)


@router.post("/download")
async def export_download(config: PipelineExportConfig) -> Response:
    """Generate all project files and return them as a downloadable ZIP archive."""
    files = _generator.generate(config.model_dump())
    zip_bytes = build_zip(files)
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=rag-pipeline.zip"},
    )


@router.post("/docker", response_model=DockerExportResponse)
async def export_docker(config: PipelineExportConfig) -> DockerExportResponse:
    """Generate only the Docker-related files (Dockerfile, docker-compose, .env)."""
    files = _generator.generate(config.model_dump())
    docker_files = {
        k: v
        for k, v in files.items()
        if k in ("Dockerfile", "docker-compose.yml", ".env.example")
    }
    return DockerExportResponse(files=docker_files)

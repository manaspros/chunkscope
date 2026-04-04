"""
Pipeline Execution Schemas
Request/response models for pipeline execution
"""
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.schemas.common import BaseSchema, IDMixin


# ============================================
# Execution Options
# ============================================

class ExecutionOptions(BaseModel):
    """Options for pipeline execution."""
    create_version: bool = Field(default=True, description="Create an immutable version snapshot")
    notify_websocket: bool = Field(default=True, description="Send progress updates via WebSocket")


# ============================================
# Request Schemas
# ============================================

class PipelineExecuteRequest(BaseModel):
    """Request to execute a pipeline."""
    document_id: UUID
    options: ExecutionOptions = Field(default_factory=ExecutionOptions)


class ExecuteStepRequest(BaseModel):
    """Request to execute a single pipeline step."""
    node_id: str
    node_type: str
    config: dict[str, Any] = Field(default_factory=dict)
    project_id: Optional[str] = Field(default=None, description="Project ID to find documents for chunking")


class ExecuteStepResponse(BaseModel):
    """Response from executing a single pipeline step."""
    node_id: str
    status: str = "complete"
    result: Optional[dict[str, Any]] = None
    error: Optional[str] = None
    chunks_created: int = 0
    embedded_chunks: int = 0


# ============================================
# Response Schemas
# ============================================

class PipelineExecuteResponse(BaseSchema):
    """Response for pipeline execution (queued)."""
    execution_id: UUID
    status: str = "queued"
    estimated_time_seconds: int = 30
    websocket_url: Optional[str] = None


class ExecutionStatusResponse(BaseSchema, IDMixin):
    """Detailed execution status."""
    pipeline_id: UUID
    document_id: Optional[UUID] = None
    status: str
    progress_percent: int = 0
    current_node: Optional[str] = None
    logs: list[dict[str, Any]] = Field(default_factory=list)
    error: Optional[str] = None
    result: Optional[dict[str, Any]] = None

    @model_validator(mode="before")
    @classmethod
    def extract_from_details(cls, data: Any) -> Any:
        """Extract missing fields from 'details' if available."""
        if isinstance(data, dict):
            details = data.get("details", {})
            if "document_id" not in data and "document_id" in details:
                data["document_id"] = details["document_id"]
            if "status" not in data and "status" in details:
                data["status"] = details["status"]
        else:
            # Handle ORM objects
            details = getattr(data, "details", {})
            if details and isinstance(details, dict):
                if not getattr(data, "document_id", None) and "document_id" in details:
                    try:
                        data.document_id = UUID(details["document_id"])
                    except (AttributeError, ValueError, TypeError):
                        pass
                if not getattr(data, "status", None) and "status" in details:
                    try:
                        data.status = details["status"]
                    except (AttributeError, ValueError, TypeError):
                        pass
        return data

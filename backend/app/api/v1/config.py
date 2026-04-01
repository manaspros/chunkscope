"""
Configuration Endpoints
Document analysis and pipeline validation
"""
from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import select

from app.core.errors import NotFoundError
from app.core.logging import get_logger
from app.dependencies import DbSession
from app.models import Document
from app.schemas import (
    DocumentAnalyzeRequest,
    DocumentAnalyzeResponse,
    DocumentCharacteristics,
    PipelineRecommendation,
    PipelineValidateRequest,
    PipelineValidateResponse,
    ValidationIssue,
)

logger = get_logger(__name__)

router = APIRouter(prefix="/config", tags=["Configuration"])


@router.post("/analyze-document", response_model=DocumentAnalyzeResponse)
async def analyze_document(
    request: DocumentAnalyzeRequest,
    db: DbSession,
) -> DocumentAnalyzeResponse:
    """
    Analyze a document and get pipeline recommendations.

    Detects document type, structure, and suggests optimal configuration.
    """
    # Verify document exists
    result = await db.execute(
        select(Document).where(Document.id == request.document_id)
    )
    document = result.scalar_one_or_none()

    if not document:
        raise NotFoundError("Document", str(request.document_id))

    # Analyze document (simplified rule-based for now)
    characteristics = DocumentCharacteristics(
        avg_sentence_length=20,
        vocabulary_richness=0.7,
        has_tables=False,
        has_code_blocks=False,
        has_lists=True,
        has_headings=True,
        page_count=document.doc_metadata.get("page_count", 1),
        word_count=document.doc_metadata.get("word_count", 0),
    )

    # Generate recommendations based on file type and characteristics
    doc_type, recommendation = _get_recommendations(
        str(document.file_type),
        characteristics,
    )

    logger.info(
        "document_analyzed",
        document_id=str(document.id),
        document_type=doc_type,
    )

    return DocumentAnalyzeResponse(
        document_id=document.id,
        document_type=doc_type,
        structure="hierarchical" if characteristics.has_headings else "flat",
        characteristics=characteristics,
        recommendations=recommendation,
    )


@router.post("/validate-pipeline", response_model=PipelineValidateResponse)
async def validate_pipeline(
    request: PipelineValidateRequest,
) -> PipelineValidateResponse:
    """
    Validate a pipeline configuration.

    Checks for errors, warnings, and estimates costs.
    """
    errors: list[ValidationIssue] = []
    warnings: list[ValidationIssue] = []

    nodes = request.nodes
    edges = request.edges

    # Check: At least one node
    if not nodes:
        errors.append(ValidationIssue(
            type="error",
            message="Pipeline must have at least one node"
        ))

    # Check: Node IDs are unique
    node_ids = [n.get("id") for n in nodes]
    if len(node_ids) != len(set(node_ids)):
        errors.append(ValidationIssue(
            type="error",
            message="Node IDs must be unique"
        ))

    # Check: All edge sources/targets exist
    node_id_set = set(node_ids)
    for edge in edges:
        source = edge.get("source")
        target = edge.get("target")

        if source not in node_id_set:
            errors.append(ValidationIssue(
                type="error",
                node_id=source,
                message=f"Edge source '{source}' does not exist"
            ))
        if target not in node_id_set:
            errors.append(ValidationIssue(
                type="error",
                node_id=target,
                message=f"Edge target '{target}' does not exist"
            ))

    # Check: No cycles (basic DFS)
    if _has_cycle(nodes, edges):
        errors.append(ValidationIssue(
            type="error",
            message="Pipeline contains a cycle"
        ))

    # Check: Orphan nodes (no incoming or outgoing edges)
    connected_nodes = set()
    for edge in edges:
        connected_nodes.add(edge.get("source"))
        connected_nodes.add(edge.get("target"))

    for node in nodes:
        if node.get("id") not in connected_nodes and len(nodes) > 1:
            warnings.append(ValidationIssue(
                type="warning",
                node_id=node.get("id"),
                message=f"Node '{node.get('id')}' is not connected to other nodes"
            ))

    # Estimate cost
    estimated_cost = _estimate_cost(nodes)

    return PipelineValidateResponse(
        valid=len(errors) == 0,
        errors=errors,
        warnings=warnings,
        estimated_cost_per_1k_docs=estimated_cost,
    )


def _get_recommendations(file_type: str, characteristics: DocumentCharacteristics) -> tuple[str, PipelineRecommendation]:
    """Generate recommendations based on document analysis."""

    # Default recommendation
    doc_type = "general"
    chunker = "fixed"
    chunk_size = 512
    overlap = 50

    # Rule-based classification
    if characteristics.has_code_blocks:
        doc_type = "technical"
        chunker = "code"
        chunk_size = 1024
    elif characteristics.has_headings:
        doc_type = "structured"
        chunker = "heading"
        chunk_size = 768
    elif characteristics.avg_sentence_length > 30:
        doc_type = "legal"
        chunker = "semantic"
        chunk_size = 1024
        overlap = 100

    explanation = f"Based on {doc_type} document type, "
    if chunker == "semantic":
        explanation += "semantic chunking preserves meaning boundaries."
    elif chunker == "heading":
        explanation += "heading-based chunking preserves document structure."
    elif chunker == "code":
        explanation += "code-aware chunking keeps functions intact."
    else:
        explanation += "fixed-size chunking provides consistent chunk sizes."

    return doc_type, PipelineRecommendation(
        chunker=chunker,
        chunk_size=chunk_size,
        overlap=overlap,
        embedding_model="text-embedding-3-small",
        retrieval_method="hybrid",
        confidence=0.75,
        explanation=explanation,
    )


def _has_cycle(nodes: list[dict], edges: list[dict]) -> bool:
    """Check if the graph has a cycle using DFS."""
    graph: dict[str, list[str]] = {n.get("id", ""): [] for n in nodes}
    for edge in edges:
        source = edge.get("source", "")
        target = edge.get("target", "")
        if source in graph:
            graph[source].append(target)

    visited = set()
    rec_stack = set()

    def dfs(node: str) -> bool:
        visited.add(node)
        rec_stack.add(node)

        for neighbor in graph.get(node, []):
            if neighbor not in visited:
                if dfs(neighbor):
                    return True
            elif neighbor in rec_stack:
                return True

        rec_stack.remove(node)
        return False

    for node in graph:
        if node not in visited:
            if dfs(node):
                return True

    return False


def _estimate_cost(nodes: list[dict]) -> float:
    """Estimate cost per 1K documents based on node types."""
    cost = 0.0

    for node in nodes:
        node_type = node.get("type", "")

        if node_type == "embedder":
            cost += 0.10
        elif node_type == "llm":
            cost += 0.50
        elif node_type == "reranker":
            cost += 0.05

    return round(cost, 2)

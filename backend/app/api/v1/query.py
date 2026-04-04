from uuid import UUID
from fastapi import APIRouter, HTTPException

from app.dependencies import DbSession
from app.schemas.query import QueryRequest, QueryResponse, ChunkWithScore
from app.services.llm_service import llm_service
from app.services.retrievers.hybrid_retriever import HybridRetriever
from app.services.retrievers.mmr_retriever import MMRRetriever
from app.services.retrievers.parent_document_retriever import ParentDocumentRetriever
from app.services.retrievers.base import BaseRetriever
from app.services.query_augmentor import query_augmentor
from app.core.logging import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/query", tags=["Query"])

@router.post("/", response_model=QueryResponse)
async def query_pipeline(
    request: QueryRequest,
    db: DbSession,
) -> QueryResponse:
    """
    Perform a retrieval query using the specified method.
    """
    try:
        # 1. Get query embedding via LiteLLM (uses LITELLM_API_KEY)
        embeddings = await llm_service.embed([request.query])
        query_embedding = embeddings[0]

        # 2. Select retriever
        retriever: BaseRetriever = None

        if request.retrieval_method == "hybrid":
            retriever = HybridRetriever(db, alpha=request.alpha)
        elif request.retrieval_method == "mmr":
            retriever = MMRRetriever(db, lambda_mult=request.lambda_mult)
        elif request.retrieval_method == "parent_document":
            retriever = ParentDocumentRetriever(db)
        elif request.retrieval_method == "keyword":
            retriever = HybridRetriever(db, alpha=0.0)
        else:
            retriever = HybridRetriever(db, alpha=1.0)

        # 2.5 Apply Query Augmentation Wrapper if requested
        if request.augmentation_method == "multi_query":
            from app.services.retrievers.multi_query_retriever import MultiQueryRetriever
            retriever = MultiQueryRetriever(retriever, num_variants=request.num_variants)
        elif request.augmentation_method == "hyde":
            from app.services.retrievers.hyde_retriever import HyDERetriever
            retriever = HyDERetriever(retriever)
        elif request.augmentation_method == "expansion":
            from app.services.retrievers.query_expansion_retriever import QueryExpansionRetriever
            retriever = QueryExpansionRetriever(retriever)

        # 3. Retrieve results
        results = await retriever.retrieve(
            query=request.query,
            top_k=request.top_k,
            document_id=request.document_id,
            query_embedding=query_embedding,
            fetch_k=request.fetch_k,
            lambda_mult=request.lambda_mult,
            alpha=request.alpha
        )

        # 4. Format response
        formatted_results = [
            ChunkWithScore(
                **row["chunk"].__dict__,
                score=row["score"],
                metadata=row.get("metadata")
            ) for row in results
        ]

        # Filter out SQLAlchemy specific internal state if present
        for res in formatted_results:
            if "_sa_instance_state" in res.__dict__:
                del res.__dict__["_sa_instance_state"]

        return QueryResponse(
            query=request.query,
            results=formatted_results,
            retrieval_method=request.retrieval_method,
            total_results=len(formatted_results)
        )

    except Exception as e:
        logger.error(f"Query failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

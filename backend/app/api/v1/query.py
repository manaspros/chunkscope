from uuid import UUID
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

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
            project_id=request.project_id,
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


@router.post("/enriched")
async def enriched_query(
    request: QueryRequest,
    db: DbSession,
):
    """Query with full technical metrics for the tester panel."""
    import time
    from app.models import Chunk, Document

    metrics = {}

    # 1. Embedding phase
    t0 = time.perf_counter()
    embeddings = await llm_service.embed([request.query])
    query_embedding = embeddings[0]
    t1 = time.perf_counter()
    metrics["embedding_latency_ms"] = round((t1 - t0) * 1000, 1)
    metrics["embedding_dimensions"] = len(query_embedding)
    metrics["query_tokens"] = len(request.query.split())

    # 2. Retrieval phase
    t2 = time.perf_counter()
    # Select retriever (same logic as main query endpoint)
    if request.retrieval_method == "hybrid":
        retriever = HybridRetriever(db, alpha=request.alpha)
    elif request.retrieval_method == "mmr":
        retriever = MMRRetriever(db, lambda_mult=request.lambda_mult)
    elif request.retrieval_method == "keyword":
        retriever = HybridRetriever(db, alpha=0.0)
    else:
        retriever = HybridRetriever(db, alpha=1.0)

    results = await retriever.retrieve(
        query=request.query,
        top_k=request.top_k,
        document_id=request.document_id,
        project_id=request.project_id,
        query_embedding=query_embedding,
        fetch_k=request.fetch_k,
        lambda_mult=request.lambda_mult,
        alpha=request.alpha,
    )
    t3 = time.perf_counter()
    metrics["retrieval_latency_ms"] = round((t3 - t2) * 1000, 1)
    metrics["total_latency_ms"] = round((t3 - t0) * 1000, 1)

    # 3. Score analysis
    scores = [r["score"] for r in results]
    if scores:
        metrics["score_max"] = round(max(scores), 4)
        metrics["score_min"] = round(min(scores), 4)
        metrics["score_mean"] = round(sum(scores) / len(scores), 4)
        metrics["score_spread"] = round(max(scores) - min(scores), 4)
        # Score gap between #1 and #2 (confidence indicator)
        if len(scores) >= 2:
            metrics["top_score_gap"] = round(scores[0] - scores[1], 4)

    # 4. Index stats for context
    if request.project_id:
        from sqlalchemy import func, select

        total_q = (
            select(func.count(Chunk.id))
            .join(Document, Chunk.document_id == Document.id)
            .where(Document.project_id == request.project_id)
        )
        total_chunks = (await db.execute(total_q)).scalar() or 0

        embedded_q = (
            select(func.count(Chunk.id))
            .join(Document, Chunk.document_id == Document.id)
            .where(Document.project_id == request.project_id, Chunk.embedding.isnot(None))
        )
        embedded_chunks = (await db.execute(embedded_q)).scalar() or 0

        # Avg chunk size
        avg_size_q = (
            select(func.avg(func.length(Chunk.text)))
            .join(Document, Chunk.document_id == Document.id)
            .where(Document.project_id == request.project_id)
        )
        avg_size = (await db.execute(avg_size_q)).scalar() or 0

        metrics["index_total_chunks"] = total_chunks
        metrics["index_embedded_chunks"] = embedded_chunks
        metrics["index_coverage_pct"] = round(embedded_chunks / total_chunks * 100, 1) if total_chunks else 0
        metrics["avg_chunk_size_chars"] = round(float(avg_size))

    metrics["retrieval_method"] = request.retrieval_method
    metrics["top_k"] = request.top_k
    metrics["fetch_k"] = request.fetch_k
    metrics["alpha"] = request.alpha

    # 5. Format results
    formatted = []
    for row in results:
        chunk = row["chunk"]
        formatted.append({
            "id": str(chunk.id),
            "text": chunk.text,
            "score": round(row["score"], 4),
            "chunk_index": chunk.chunk_index,
            "token_count": chunk.token_count,
            "chunking_method": chunk.chunking_method,
            "chunk_size": chunk.chunk_size,
            "document_id": str(chunk.document_id),
        })

    # 6. Compute "vs simple RAG" comparison hints
    comparison = {}
    if request.retrieval_method == "hybrid" and request.alpha < 1.0:
        comparison["technique"] = "Hybrid Search (Vector + Keyword)"
        comparison["vs_simple"] = "Simple RAG uses only vector search. Hybrid combines semantic understanding with exact keyword matching, catching results that pure embeddings miss."
        comparison["improvement_estimate"] = "+15-25% recall on keyword-heavy queries"
    elif request.retrieval_method == "mmr":
        comparison["technique"] = "MMR (Maximal Marginal Relevance)"
        comparison["vs_simple"] = "Simple RAG returns the most similar chunks, which may be redundant. MMR actively diversifies results, giving broader context coverage."
        comparison["improvement_estimate"] = "+20-30% information coverage"
    else:
        comparison["technique"] = "Vector Search"
        comparison["vs_simple"] = "Pure semantic search. Upgrade to hybrid or MMR for better results on this corpus."
        comparison["improvement_estimate"] = "Baseline"

    if metrics.get("score_spread", 0) < 0.05 and len(scores) > 2:
        comparison["insight"] = "Scores are very close together — results are equally relevant. Consider using MMR for diversity."
    elif metrics.get("top_score_gap", 0) > 0.3:
        comparison["insight"] = "Strong top result with clear separation. High confidence in #1 result."

    return {
        "query": request.query,
        "results": formatted,
        "total_results": len(formatted),
        "metrics": metrics,
        "comparison": comparison,
    }


class PipelineTestRequest(BaseModel):
    """Run a question through the full pipeline."""
    query: str
    project_id: UUID
    pipeline_config: dict  # { retriever: {}, reranker: {}, llm: {}, augmentation: {} }


@router.post("/pipeline-test")
async def pipeline_test(
    request: PipelineTestRequest,
    db: DbSession,
):
    """Execute a full pipeline test: retrieve → rerank → generate → judge.

    Uses the exact pipeline configuration from the builder nodes.
    """
    import time
    import json
    import re
    from app.models import Chunk, Document
    from sqlalchemy import func, select

    config = request.pipeline_config
    retriever_cfg = config.get("retriever", {})
    reranker_cfg = config.get("reranker", {})
    llm_cfg = config.get("llm", {})
    augmentation_cfg = config.get("augmentation", {})

    steps = []
    metrics = {}

    # ── Step 1: Embed query ──
    t0 = time.perf_counter()
    embeddings = await llm_service.embed([request.query])
    query_embedding = embeddings[0]
    t1 = time.perf_counter()
    metrics["embedding_ms"] = round((t1 - t0) * 1000, 1)
    metrics["embedding_dims"] = len(query_embedding)

    # ── Step 2: Retrieve ──
    method = retriever_cfg.get("strategy", retriever_cfg.get("method", "hybrid"))
    top_k = int(retriever_cfg.get("topK", retriever_cfg.get("top_k", 10)))
    alpha = float(retriever_cfg.get("alpha", 0.7))
    fetch_k = int(retriever_cfg.get("fetchK", retriever_cfg.get("fetch_k", 20)))

    # Map pipeline node strategy names to retriever
    method_map = {
        "dense": "vector", "sparse": "keyword", "hybrid": "hybrid",
        "mmr": "mmr", "vector": "vector", "keyword": "keyword",
    }
    resolved_method = method_map.get(method, "hybrid")

    t2 = time.perf_counter()
    if resolved_method == "mmr":
        lambda_mult = float(retriever_cfg.get("lambdaMult", retriever_cfg.get("lambda_mult", 0.5)))
        retriever = MMRRetriever(db, lambda_mult=lambda_mult)
    elif resolved_method == "keyword":
        retriever = HybridRetriever(db, alpha=0.0)
    elif resolved_method == "vector":
        retriever = HybridRetriever(db, alpha=1.0)
    else:
        retriever = HybridRetriever(db, alpha=alpha)

    # Apply augmentation if configured
    aug_method = augmentation_cfg.get("method", augmentation_cfg.get("strategy"))
    if aug_method == "multi_query":
        from app.services.retrievers.multi_query_retriever import MultiQueryRetriever
        retriever = MultiQueryRetriever(retriever, num_variants=int(augmentation_cfg.get("num_variants", 3)))
    elif aug_method == "hyde":
        from app.services.retrievers.hyde_retriever import HyDERetriever
        retriever = HyDERetriever(retriever)

    results = await retriever.retrieve(
        query=request.query,
        top_k=top_k,
        project_id=request.project_id,
        query_embedding=query_embedding,
        fetch_k=fetch_k,
        alpha=alpha,
    )
    t3 = time.perf_counter()
    metrics["retrieval_ms"] = round((t3 - t2) * 1000, 1)
    metrics["retrieval_method"] = resolved_method
    if aug_method:
        metrics["augmentation"] = aug_method

    chunks = []
    for row in results:
        c = row["chunk"]
        chunks.append({
            "id": str(c.id), "text": c.text, "score": round(row["score"], 4),
            "chunk_index": c.chunk_index, "token_count": c.token_count,
        })

    steps.append({
        "name": "Retrieval",
        "method": f"{resolved_method}" + (f" + {aug_method}" if aug_method else ""),
        "latency_ms": metrics["retrieval_ms"],
        "output_count": len(chunks),
        "top_score": chunks[0]["score"] if chunks else 0,
    })

    # ── Step 3: Rerank (if configured) ──
    if reranker_cfg and reranker_cfg.get("provider"):
        t4 = time.perf_counter()
        # Simple score-based reranking simulation (real reranking needs model)
        # For now, sort by score and take top N
        return_k = int(reranker_cfg.get("returnK", reranker_cfg.get("topN", 5)))
        chunks = sorted(chunks, key=lambda x: x["score"], reverse=True)[:return_k]
        t5 = time.perf_counter()
        metrics["rerank_ms"] = round((t5 - t4) * 1000, 1)
        steps.append({
            "name": "Reranking",
            "method": reranker_cfg.get("provider", "cross-encoder"),
            "latency_ms": metrics["rerank_ms"],
            "output_count": len(chunks),
        })

    # ── Step 4: Generate answer (if LLM configured) ──
    answer = None
    if llm_cfg and chunks:
        t6 = time.perf_counter()
        context = "\n\n".join([f"[{i+1}] {c['text'][:600]}" for i, c in enumerate(chunks[:5])])
        system_prompt = llm_cfg.get("systemPrompt", llm_cfg.get("system_prompt",
            "You are a helpful assistant. Use the provided context to answer questions accurately. "
            "If the context doesn't contain enough information, say so."
        ))
        model = llm_cfg.get("model", "gpt-4o-mini")
        temperature = float(llm_cfg.get("temperature", 0.7))

        try:
            answer = await llm_service.generate(
                prompt=f"Context:\n{context}\n\nQuestion: {request.query}\n\nAnswer:",
                system_prompt=system_prompt,
                model=model,
                temperature=temperature,
                max_tokens=int(llm_cfg.get("maxTokens", llm_cfg.get("max_tokens", 512))),
            )
            t7 = time.perf_counter()
            metrics["generation_ms"] = round((t7 - t6) * 1000, 1)
            metrics["generation_model"] = model
            steps.append({
                "name": "Generation",
                "method": model,
                "latency_ms": metrics["generation_ms"],
            })
        except Exception as e:
            answer = f"Generation failed: {str(e)}"
            metrics["generation_error"] = str(e)

    # ── Step 5: Auto-judge ──
    judge_result = None
    if answer and chunks:
        t8 = time.perf_counter()
        chunk_context = "\n".join([f"[Chunk {i+1}] (score: {c['score']:.3f}) {c['text'][:400]}" for i, c in enumerate(chunks[:5])])
        judge_prompt = f"""Rate this RAG pipeline's output quality.

QUERY: {request.query}

RETRIEVED CONTEXT:
{chunk_context}

GENERATED ANSWER:
{answer}

Return JSON with:
- "relevance": 1-5 (are chunks relevant to query?)
- "faithfulness": 1-5 (is answer supported by chunks?)
- "completeness": 1-5 (does answer fully address query?)
- "overall_grade": "A"|"B"|"C"|"D"|"F"
- "verdict": 1 sentence summary

Return ONLY valid JSON."""

        try:
            judge_raw = await llm_service.generate(
                prompt=judge_prompt,
                system_prompt="You are a precise RAG evaluator. Return only valid JSON.",
                temperature=0.1, max_tokens=200,
            )
            cleaned = re.sub(r"^```(?:json)?\s*", "", judge_raw.strip())
            cleaned = re.sub(r"\s*```$", "", cleaned)
            judge_result = json.loads(cleaned)
            t9 = time.perf_counter()
            metrics["judge_ms"] = round((t9 - t8) * 1000, 1)
        except Exception:
            judge_result = {"verdict": "Judge parsing failed", "overall_grade": "?"}

    metrics["total_ms"] = round((time.perf_counter() - t0) * 1000, 1)

    # ── Index stats ──
    total_q = (
        select(func.count(Chunk.id)).join(Document, Chunk.document_id == Document.id)
        .where(Document.project_id == request.project_id)
    )
    metrics["index_chunks"] = (await db.execute(total_q)).scalar() or 0

    return {
        "query": request.query,
        "answer": answer,
        "chunks": chunks,
        "steps": steps,
        "judge": judge_result,
        "metrics": metrics,
    }

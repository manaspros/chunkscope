<div align="center">
  <h1>ChunkScope</h1>
  <p><strong>The n8n for RAG.</strong> Build a retrieval pipeline visually, see exactly how your documents get chunked, test it with real queries, and export the code.</p>

  [![License: MIT](https://img.shields.io/badge/License-MIT-gold.svg)](https://opensource.org/licenses/MIT)
  [![Tech: FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688.svg?logo=fastapi)](https://fastapi.tiangolo.com/)
  [![Tech: Next.js](https://img.shields.io/badge/Frontend-Next.js-000000.svg?logo=next.js)](https://nextjs.org/)
  [![Vector: pgvector](https://img.shields.io/badge/Vector-pgvector-336791.svg?logo=postgresql)](https://github.com/pgvector/pgvector)
</div>

**Live demo: https://chunkscope-gamma.vercel.app** (click "Try the sample" on the home page)

> **Demo mode.** The hosted prototype runs the real app on Vercel + Neon Postgres (pgvector), but it has no embedding/LLM key and a slim Python bundle. Queries fall back to Postgres full-text keyword search, and semantic chunking, local embedding models and LLM answer generation are off. Details in [Prototype vs full deployment](#prototype-vs-full-deployment).

---

## The problem

Anyone shipping a RAG system (an app that answers questions from your documents) makes a stack of choices before a single query runs: how to split documents, which embedding model, vector or keyword or hybrid search, whether to rerank. The defaults are rarely right for your corpus. A legal contract, a code repo and a scanned paper each want different chunking.

Today you find out the hard way. You write ingestion code, run it, ask a few questions, and guess why the answers are bad. The chunks are invisible. The retrieval step is a black box. Comparing two configurations means rewriting scripts. Notebook frameworks (LangChain, LlamaIndex) give you building blocks but no view into what they produced. Vector databases store what you give them and do not tell you it was chunked badly.

## Why this is good

- **You can see the chunks.** Upload a document and the visualizer shows where each strategy cuts, with size metrics.
- **Pipelines are a graph, not a script.** Drag chunking, embedding, retrieval, reranking and LLM nodes in a React Flow editor; the same config drives execution and export.
- **It recommends a starting point.** A rule-based analyzer extracts content signals (code, tables, headings, density) and suggests a strategy; an optional LLM profiler goes deeper (`docs/how-it-works.md`).
- **Wide coverage in code:** 7 chunker classes (recursive, semantic, sentence-window, paragraph, code-aware, heading-based, contextual), 17+ retrievers (hybrid, MMR, parent-document, multi-query, HyDE and others), 13 rerankers, a 39-entry strategy guide. These are counts of what is in `backend/app/services/`, not claims about quality.
- **Test against the pipeline you built.** The tester panel runs embed, retrieve, rerank, generate, then an LLM-as-judge grade (relevance, faithfulness, completeness). Metric functions for faithfulness, context precision/recall, hit rate and MRR live in `backend/app/services/evaluation/metrics.py`.
- **Code export.** `POST /api/v1/export/code` renders a standalone FastAPI project (main, pipeline, requirements, env, README) from the pipeline config (`backend/app/services/code_generator/`).
- **Cost estimates** before you ingest (`/api/v1/cost/*`).

Evidence status: the docs claim "15-30% better retrieval accuracy" than simple RAG. That figure is **claimed, not yet benchmarked**: the only retrieval-eval script in the repo (`backend/scripts/evaluate_retrieval.py`) runs against a mock retriever. Unit tests exist for chunking, hybrid search, the code generator, cost calculator and rerankers (`backend/tests/`).

## How it works

```mermaid
flowchart LR
  B[Browser<br/>Next.js + React Flow] -->|REST| A[FastAPI]
  A --> AN[Analyzer + recommender]
  A --> CH[Chunkers]
  A --> RT[Retrievers + rerankers]
  A --> EV[Evaluator / LLM judge]
  A --> CG[Code generator]
  CH & RT --> DB[(Postgres + pgvector<br/>chunks, embeddings, tsvector)]
  A -->|embeddings, generation, judge| L[LiteLLM proxy]
  L --> P[OpenAI / Cohere / any provider]
```

1. Create a project and upload files (PDF, DOCX, TXT, MD, ZIP).
2. Analyze the corpus, then pick or accept a recommended pipeline.
3. Chunk: text goes into a `chunks` table with a pgvector `embedding` column and a `tsv` full-text column (kept current by a trigger).
4. Query: embed the query via LiteLLM, run the chosen retriever (vector, keyword, or a weighted hybrid of both), optionally rerank and generate.
5. Export the same pipeline as runnable Python.

More: [docs/architecture.md](docs/architecture.md), [docs/how-it-works.md](docs/how-it-works.md), [docs/strategies-guide.md](docs/strategies-guide.md), [docs/api-reference.md](docs/api-reference.md).

## Engineering tradeoffs

| Decision | Chosen | Alternative | Why | Cost accepted |
|---|---|---|---|---|
| Vector store | Postgres + pgvector, one DB for projects, chunks, vectors and full-text | Dedicated vector DB (Pinecone, Qdrant, Weaviate) | One system to run; SQL joins project/document filters with vector search; the same table serves hybrid keyword search | Less ANN tuning and scale headroom than a dedicated engine; the embedding column is fixed at 1536 dims (`models.py`), so other dimensions need a schema change |
| LLM access | LiteLLM as a single gateway for embeddings, generation, judge | Direct provider SDKs per feature | Swap models or route through a proxy (e.g. a cost/governance gateway) by changing `LITELLM_BASE_URL` | An extra network hop and a heavy dependency (about 170 MB installed) |
| Keyword search | Postgres `tsvector` + `ts_rank_cd` (GIN index, trigger-maintained) | In-process BM25 (`rank-bm25`) or an external search engine | Stays in the database, no extra index to sync | Not true BM25 scoring; `plainto_tsquery` ANDs terms, so long natural-language queries can return nothing |
| Hybrid scoring | Min-max normalise each list, then `alpha * vector + (1-alpha) * keyword` | Reciprocal rank fusion | Simple, one tunable knob exposed in the UI | Sensitive to score distributions; alpha must be tuned per corpus |
| Chunking | Many strategies behind one registry; recursive as default | One good default | The right split depends on document type (see strategy guide) | More surface to test; semantic/sentence chunkers need spaCy and sentence-transformers |
| Evaluation | LLM-as-judge in the tester plus RAGAS-style metric functions | Labelled ground-truth sets only | Works on any corpus with no labels, immediate feedback | Judge scores are noisy and cost tokens; no published benchmark yet |
| Code export | Template-rendered standalone FastAPI project from the pipeline config | Generate with an LLM | Deterministic, testable output (`test_code_generator.py`) | Templates cover only the node combinations they know |
| Schema management | `create_all` at startup, Alembic stamped (see `backend/scripts/bootstrap_db.py`) | Alembic as the only source of truth | Migrations drifted from the ORM models (user_id and enum columns), so a fresh DB built purely from them rejects inserts | Migrations are not authoritative until reconciled; see roadmap |

## Prototype vs full deployment

Live on Vercel as one project with two [Services](https://vercel.com/docs/services) (beta): the Next.js frontend and the FastAPI backend share one origin; the backend is reached at `/_/backend/*` (`vercel.json`).

| Piece | Prototype (Vercel) | Full / local |
|---|---|---|
| Database | Real: Neon Postgres with the `vector` extension, full schema | Same, or the Docker Postgres |
| Projects, upload, chunking (simple strategies), pipelines CRUD, presets, strategy guide, cost, code export, keyword search | Real | Real |
| Semantic chunking, local sentence-transformers embeddings, zero-shot document classification | Off: torch/spaCy exceed the function bundle limit. `sentence_window` uses a regex sentence splitter; semantic returns a clear 501 | On (`pip install -r requirements-full.txt`) |
| Query embeddings / vector and hybrid search | Falls back to keyword search (`demo_fallback: true` in the response) because no key is configured | Real, with `LITELLM_API_KEY` |
| LLM answer generation and judge | Off (no key); retrieval and metrics still return | Real |
| File uploads | Stored in `/tmp` (ephemeral, lost on cold start; extracted text is saved to the DB on first chunk) and capped at 4 MB (Vercel body limit). A durable fix would use Vercel Blob | Local disk / volume |
| Public guard | Per-IP in-memory rate limit (10 compute-heavy and 120 write requests per minute per instance), body size cap (`backend/app/core/guard.py`) | Same code, same defaults |
| Sample | `POST /api/v1/demo/seed` creates a project from a bundled doc and chunks it ("Try the sample" button) | Same |

## Run locally

```bash
git clone https://github.com/manaspros/chunkscope.git
cd chunkscope
cp .env.example .env     # set LITELLM_API_KEY / LITELLM_BASE_URL
docker compose up
```

UI at http://localhost:3000, API docs at http://localhost:8000/api/docs.

Without Docker:

```bash
# backend (needs Postgres with pgvector)
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-full.txt        # or requirements.txt for the slim set used on Vercel
export DATABASE_URL=postgresql://chunkscope:chunkscope@localhost:5432/chunkscope
python scripts/bootstrap_db.py              # enables pgvector, creates tables, stamps Alembic
uvicorn app.main:app --reload --port 8000

# frontend
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

Environment variables: `DATABASE_URL`, `LITELLM_API_KEY`, `LITELLM_BASE_URL`, `NEXT_PUBLIC_API_URL`; optional `OPENAI_API_KEY`, `COHERE_API_KEY`, `UPLOAD_DIR`, `MAX_UPLOAD_SIZE_MB`, `DEBUG`, `GUARD_LLM_PER_MIN`, `GUARD_WRITE_PER_MIN`, `GUARD_MAX_BODY_MB`.

Deploy your own copy: `vercel link`, add Neon with `vercel integration add neon`, run `python backend/scripts/bootstrap_db.py` against the Neon URL, set `NEXT_PUBLIC_API_URL=/_/backend`, then `vercel deploy --prod`. Add `LITELLM_API_KEY` and `LITELLM_BASE_URL` with `vercel env add` to turn on embeddings and generation.

## Status / roadmap

Working prototype: the backend has tests, the UI covers the full flow, and it is deployed. Not done:

- Reconcile Alembic migrations with the ORM models so `alembic upgrade head` is authoritative.
- A real retrieval benchmark (replace the mock in `evaluate_retrieval.py`) to back or drop the accuracy claim.
- Durable uploads (Vercel Blob) for the hosted version.
- Bring semantic chunking to serverless (remote embedding instead of local models).
- Visualizer: the `/chunks/visualize` endpoint currently returns the same chunk set regardless of the chosen method; the live `/preview/chunking` endpoint does vary.

## License

MIT, see `LICENSE.md`.

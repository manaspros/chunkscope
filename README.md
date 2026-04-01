<div align="center">
  <h1>ChunkScope</h1>
  <p><strong>The n8n for RAG.</strong> Visual pipeline builder with AI suggestions, code export, and live evaluation.</p>

  [![License: MIT](https://img.shields.io/badge/License-MIT-gold.svg)](https://opensource.org/licenses/MIT)
  [![Tech: FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688.svg?logo=fastapi)](https://fastapi.tiangolo.com/)
  [![Tech: Next.js](https://img.shields.io/badge/Frontend-Next.js-000000.svg?logo=next.js)](https://nextjs.org/)
  [![Vector: pgvector](https://img.shields.io/badge/Vector-pgvector-336791.svg?logo=postgresql)](https://github.com/pgvector/pgvector)
</div>

---

## Key Features

- **Visual Pipeline Builder** -- n8n-style drag-and-drop interface to assemble chunking, embedding, and retrieval stages
- **AI Suggestion Engine** -- auto-recommend chunking strategy, chunk size, embedding model, and retrieval method based on your documents
- **Code Export** -- generate framework-agnostic Python / FastAPI code from any pipeline configuration
- **Live Evaluation Dashboard** -- RAGAS-style metrics (faithfulness, relevance, context precision) computed in real time
- **Side-by-Side Comparison** -- run two pipeline configurations against the same queries and diff the results
- **Cost Calculator** -- estimate token and API costs before committing to a pipeline
- **8 Chunking Strategies** -- Recursive, Semantic, Sentence-Window, Code-Aware, Fixed, Paragraph, Agentic, and Custom
- **Multiple Embedding Providers** -- OpenAI, Cohere, HuggingFace, and any provider reachable through LiteLLM
- **Hybrid Retrieval + Reranking** -- vector search, BM25, HyDE, Multi-Query, MMR, with optional cross-encoder reranking

---

## Quick Start

```bash
git clone https://github.com/1Ash0/chunkscope.git
cd chunkscope
cp .env.example .env
# Add your API keys to .env
docker compose up
```

Open [http://localhost:3000](http://localhost:3000) to launch the UI.
The API docs are at [http://localhost:8000/api/docs](http://localhost:8000/api/docs).

---

## Architecture

```
Frontend (Next.js :3000)
    |
    | REST / WebSocket
    v
Backend (FastAPI :8000)
    |
    | SQLAlchemy + asyncpg
    v
PostgreSQL + pgvector (:5432)
```

The frontend sends pipeline configurations and queries to the backend API.
The backend orchestrates document processing, chunking, embedding, retrieval, and evaluation,
storing vectors and metadata in PostgreSQL with the pgvector extension.

---

## Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | Next.js 14, TypeScript, Tailwind CSS, React Flow, Zustand, Framer Motion |
| Backend | FastAPI, SQLAlchemy (async), Pydantic, LiteLLM, LangChain |
| Database | PostgreSQL 16, pgvector |
| Infra | Docker Compose, Alembic migrations |

---

## API Endpoints

All routes are under `/api/v1`. Main groups:

| Group | Description |
|---|---|
| `/health` | Liveness check |
| `/documents` | Upload and manage PDF/text documents |
| `/chunks` | Chunk documents with configurable strategies |
| `/embeddings` | Generate and store embeddings |
| `/pipelines` | Create, update, and execute full pipelines |
| `/presets` | Built-in and custom pipeline presets |
| `/query` | Run retrieval queries against a pipeline |
| `/rerank` | Cross-encoder reranking |
| `/evaluations` | RAGAS-style evaluation metrics |
| `/suggestions` | AI-powered configuration recommendations |
| `/export` | Generate Python code from pipeline config |
| `/cost` | Estimate token and API costs |
| `/config` | Available models, strategies, and providers |

Full OpenAPI spec: `http://localhost:8000/api/docs`

---

## Development Setup (without Docker)

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt    # or: uv pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

Requires PostgreSQL with pgvector. Set `DATABASE_URL` in `.env`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Opens on [http://localhost:3000](http://localhost:3000).

---

## License

MIT -- see `LICENSE.md`.

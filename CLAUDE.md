# ChunkScope - Project Context for Claude

## What This Is
ChunkScope is an **"n8n for RAG"** - a visual pipeline builder that lets developers plug in documents and get either optimized code or an API for their RAG system. It combines pipeline building, chunk visualization, AI-powered recommendations, code export, and live evaluation in one tool.

**Repo**: https://github.com/manaspros/chunkscope
**Owner**: Manas (manaspros)
**Purpose**: Portfolio project (primary) + usable tool (secondary)

## Tech Stack
- **Frontend**: Next.js 14 (App Router), React 18, Tailwind CSS, Shadcn/ui, Zustand, React Flow
- **Backend**: FastAPI, SQLAlchemy 2.0 async, PostgreSQL + pgvector (SQLite for dev)
- **LLM**: LiteLLM (unified proxy - all LLM calls go through `llm_service`)
- **Package Manager**: uv (Python), npm (Frontend)
- **Deployment**: Docker Compose (postgres + backend + frontend)

## Key Architecture Decisions
- **No auth** - removed for frictionless portfolio demos
- **No Celery/Redis** - FastAPI BackgroundTasks instead
- **No Three.js** - removed for performance, CSS animations instead
- **No LangChain in exports** - generated code is framework-agnostic
- **JSON not JSONB** - SQLite compatibility for dev mode
- **LiteLLM for everything** - single service, swap providers via config
- **Zustand selectors** - individual field selectors to prevent re-renders

## Project Structure
```
backend/
  app/
    api/v1/          # 63+ REST endpoints
    services/
      chunkers/      # 8 chunking strategies
      retrievers/    # 19 retrieval strategies  
      rerankers/     # 13 reranking strategies
      evaluation/    # RAGAS-style metrics (implemented from scratch)
      suggestions/   # AI suggestion engine (profiler + recommender + explainer)
      code_generator/ # Framework-agnostic Python code export
      strategy_guide.py    # 39 strategy knowledge base entries
      decision_engine.py   # Pipeline recommendation engine
      llm_service.py       # Unified LLM service (LiteLLM)
      embedding_registry.py # 8 embedding models with metadata
      cost_calculator.py   # Ingestion + query cost estimation
    models/          # SQLAlchemy ORM (Pipeline, Document, Chunk, etc.)
    schemas/         # Pydantic request/response models
  tests/             # 162 tests

frontend/
  src/
    app/             # 12 Next.js pages
    components/
      pipeline/      # Visual builder (nodes, palette, config, wizard, health, cost ticker)
      suggestions/   # AI recommendation UI
      evaluation/    # Metrics, comparison, quality score
      cost/          # Cost estimator
      visualizer/    # Chunk visualization
    stores/          # Zustand (pipeline, suggestion, evaluation, config, chunk)
    lib/             # API client, pipeline node definitions
```

## Environment Variables
```
LITELLM_API_KEY=...          # Required - LLM proxy key
LITELLM_BASE_URL=...         # Required - LLM proxy URL
DATABASE_URL=sqlite:///./test.db  # Default for dev (use postgresql for prod)
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Running Locally
```bash
# Backend
cd backend && uv venv .venv && source .venv/bin/activate
uv pip install -r requirements.txt
cp ../.env .env
uvicorn app.main:app --port 8000 --reload

# Frontend
cd frontend
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env
npm install && npm run dev

# Or Docker
docker compose up
```

## Running Tests
```bash
cd backend
.venv/bin/python -m pytest tests/test_chunking_methods.py tests/test_suggestions.py \
  tests/test_code_generator.py tests/test_cost_calculator.py tests/test_retrievers.py \
  tests/test_rerankers.py tests/test_strategy_guide.py -v
```
Pre-existing API tests (tests/api/) require a running database.

## Key Services

### LLM Service (`services/llm_service.py`)
All LLM calls go through: `from app.services.llm_service import llm_service`
- `await llm_service.generate(prompt, system_prompt, model, temperature, max_tokens)`
- `await llm_service.generate_stream(...)` 
- `await llm_service.embed(texts, model)`

### Strategy Guide (`services/strategy_guide.py`)
39 strategies with: when_to_use, when_not_to_use, best_for, complexity, latency, cost, pairs_well_with, pro_tip, example_config.

### Decision Engine (`services/decision_engine.py`)
Takes doc_type + corpus_size + query_type + priority + budget -> returns full pipeline recommendation with reasoning.

## Conventions
- Backend services are async where possible
- Chunkers are sync (CPU-bound)
- All new retrieval/reranking strategies inherit from base classes in retrievers/base.py and rerankers/base.py
- Frontend uses Shadcn/ui components + Tailwind
- API client methods grouped by domain in lib/api.ts
- Zustand stores use individual selectors (not destructuring)

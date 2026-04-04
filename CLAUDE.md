# ChunkScope - Project Context for Claude

## What This Is
ChunkScope is an **"n8n for RAG"** - a visual pipeline builder that lets developers upload documents and get an optimized RAG pipeline. It combines corpus fingerprinting, AI-powered analysis, multi-technique pipeline recommendation, visual pipeline building, code export, and live evaluation in one tool.

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
- **On-demand processing** - uploads are instant (just saves file); text extraction happens at chunk time
- **Dual analysis** - regex signals (free, fast) + LLM profiling (semantic, ~$0.01-0.05)
- **Analysis persistence** - results stored in Project.analysis_result / Project.content_profile JSON columns

## Project Structure
```
backend/
  app/
    api/v1/          # REST endpoints
      projects.py    # Project CRUD, file upload, analysis, chunking
      analysis.py    # Standalone document/corpus analysis
      query.py       # Query execution (LiteLLM-powered)
      pipelines.py   # Pipeline CRUD + execution
      guide.py       # Strategy knowledge base
      ... (12 more route files)
    services/
      chunkers/      # 8 chunking strategies
      retrievers/    # 17+ retrieval strategies
      rerankers/     # 13 reranking strategies
      evaluation/    # RAGAS-style metrics (implemented from scratch)
      suggestions/   # AI suggestion engine (profiler + recommender + explainer)
      code_generator/ # Framework-agnostic Python code export
      document_analyzer.py   # Corpus fingerprinting (20 regex signals)
      pipeline_recommender.py # Rule-based multi-technique recommender
      ai_profiler.py          # LLM semantic corpus profiling
      ai_pipeline_selector.py # LLM pipeline selection from available nodes
      strategy_guide.py       # 39 strategy knowledge base entries
      decision_engine.py      # Pipeline recommendation engine
      llm_service.py          # Unified LLM service (LiteLLM)
      document_service.py     # File upload/save/delete
      embedding_registry.py   # 8 embedding models with metadata
      cost_calculator.py      # Ingestion + query cost estimation
    models/          # SQLAlchemy ORM (Project, Pipeline, Document, Chunk, etc.)
    schemas/         # Pydantic request/response models
  tests/             # 162+ tests (including 83 new: fingerprinting + pipeline recommender)

frontend/
  src/
    app/             # Next.js pages
      projects/      # Projects list + [id] detail page
      pipeline/      # Visual pipeline builder
      dashboard/     # Project overview with stats
      guide/         # Strategy knowledge base
      analyze/       # AI-powered corpus analysis
      visualizer/    # Chunk visualization page
    components/
      analysis/      # PipelineFlow (React Flow), PipelineRecommendation, AnalysisResultOverlay
      pipeline/      # Visual builder (nodes, palette, config, wizard, health)
                     # TesterPanel.tsx - Slide-out RAG testing panel with full pipeline execution
      visualizer/    # Chunk visualization
      layout/        # Navbar (Projects, Pipeline Builder, Strategy Guide, Dashboard)
    stores/          # Zustand (pipeline, config, chunk)
    lib/             # API client, pipeline node definitions
```

## Core User Flow
1. **Create project** -> Upload documents (single, ZIP, folder)
2. **Analyze corpus** -> AI-powered analysis (LLM reads samples, picks optimal techniques)
3. **View recommendation** -> PipelineFlow shows recommended techniques per stage
4. **Build pipeline** -> "Build Pipeline" navigates to /pipeline with recommendation pre-loaded
5. **Run pipeline** -> Chunks documents, generates embeddings, auto-validates
6. **Test & evaluate** -> Tester panel runs queries through exact pipeline, LLM judges quality
7. **Export** -> Download standalone Python code for the pipeline

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

# All tests (excluding API tests that need a running DB)
.venv/bin/python -m pytest tests/test_chunking_methods.py tests/test_suggestions.py \
  tests/test_code_generator.py tests/test_cost_calculator.py tests/test_retrievers.py \
  tests/test_rerankers.py tests/test_strategy_guide.py \
  tests/test_fingerprinting.py tests/test_pipeline_recommender.py -v

# New fingerprinting tests (50 tests - all 20 content signals + scenarios)
.venv/bin/python -m pytest tests/test_fingerprinting.py -v

# New pipeline recommender tests (33 tests - technique selection + full pipeline scenarios)
.venv/bin/python -m pytest tests/test_pipeline_recommender.py -v
```
Pre-existing API tests (tests/api/) require a running database.

## Key Services

### LLM Service (`services/llm_service.py`)
All LLM calls go through: `from app.services.llm_service import llm_service`
- `await llm_service.generate(prompt, system_prompt, model, temperature, max_tokens)`
- `await llm_service.generate_stream(...)`
- `await llm_service.embed(texts, model)`

### Document Analyzer (`services/document_analyzer.py`)
Corpus fingerprinting with 20 regex-based content signals. Zero LLM tokens.
- `heading_density`, `code_ratio`, `table_ratio`, `list_ratio`, `formula_ratio`
- `cross_ref_ratio`, `named_entity_density`, `question_density`, `dialogue_ratio`
- `heading_depth`, `forward_references`, `back_references`
- `comparison_patterns`, `causal_chains`, `vocabulary_diversity`
- `avg_sentence_length`, `avg_paragraph_sentences`, `total_words`, `total_lines`, `total_paragraphs`

### Pipeline Recommender (`services/pipeline_recommender.py`)
Rule-based engine. Returns STACKS of techniques (primary + augmentations), not single strategies.
- 40+ strategies: 8 chunking, 17 retrieval, 13 reranking, 8 embedding
- Confidence scoring: `signal_strength * 0.4 + research_backing * 0.3 + maturity * 0.3`
- "Why not" explanations for rejected alternatives
- No LLM calls - pure rules calibrated against research papers

### AI Profiler (`services/ai_profiler.py`)
LLM-based semantic corpus understanding. Returns `ContentProfile`.
- Stratified sampling: picks diverse documents by type/length
- Sends samples to LLM -> returns domain, structure, relationships, query types
- Cost: ~$0.01-0.05 per analysis

### AI Pipeline Selector (`services/ai_pipeline_selector.py`)
LLM picks optimal pipeline from available nodes.
- Takes ContentProfile + signals + ALL available nodes
- Returns 2-3+ techniques per stage with reasoning
- 5+ "why not" explanations

### LLM Judge (in query.py pipeline-test endpoint)
Runs query through full pipeline (retrieve → rerank → generate), then a separate LLM grades the output:
- Relevance (1-5): Are retrieved chunks relevant to the query?
- Faithfulness (1-5): Is the answer supported by the chunks (no hallucination)?
- Completeness (1-5): Does the answer fully address the query?
- Overall grade: A/B/C/D/F

### Strategy Guide (`services/strategy_guide.py`)
39 strategies with: when_to_use, when_not_to_use, best_for, complexity, latency, cost, pairs_well_with, pro_tip, example_config.

### Decision Engine (`services/decision_engine.py`)
Takes doc_type + corpus_size + query_type + priority + budget -> returns full pipeline recommendation with reasoning.

## API Endpoint Highlights

### Project Endpoints (`/api/v1/projects`)
- `POST /projects` - Create project
- `GET /projects` - List projects (filterable by status)
- `GET /projects/{id}` - Get project with file list
- `POST /projects/{id}/upload` - Upload file
- `POST /projects/{id}/upload-zip` - Upload and extract ZIP
- `POST /projects/{id}/upload-folder` - Upload multiple files
- `POST /projects/{id}/analyze` - Rule-based corpus analysis (regex signals + pipeline recommender)
- `POST /projects/{id}/smart-analyze` - Focused pipeline recommendation from corpus fingerprint
- `POST /projects/{id}/ai-analyze` - AI-powered analysis (LLM profiler + LLM pipeline selector)
- `POST /projects/{id}/chunk` - On-demand chunking with text extraction
- `GET /projects/{id}/chunks` - Get all chunks (paginated)
- `GET /projects/{id}/chunk-status` - Check chunk/embedding completion status
- `GET /projects/{id}/sample-queries` - Auto-generate test queries from content
- `POST /projects/{id}/validate` - Auto-validate RAG pipeline (retrieval accuracy)
- `POST /projects/{id}/llm-judge` - LLM evaluates retrieval quality (grades A-F)

### Query Endpoint (`/api/v1/query`)
- `POST /query/` - Execute retrieval query (uses LiteLLM for embeddings)
- `POST /query/enriched` - Query with technical metrics (latency, scores, index stats)
- `POST /query/pipeline-test` - Full pipeline test (retrieve → rerank → generate → judge)

### Pipeline Endpoints (`/api/v1/pipelines`)
- `POST /pipelines/{id}/execute-step` - Execute single pipeline node
- `POST /pipelines/{id}/execute-step-stream` - SSE streaming execution with progress

## Conventions
- Backend services are async where possible
- Chunkers are sync (CPU-bound)
- All new retrieval/reranking strategies inherit from base classes in retrievers/base.py and rerankers/base.py
- Frontend uses Shadcn/ui components + Tailwind
- API client methods grouped by domain in lib/api.ts
- Zustand stores use individual selectors (not destructuring)
- Light theme: bg-gray-50 pages, bg-white cards, border-gray-200, shadow-sm (Linear/Notion style)
- Analysis results persist to database (Project.analysis_result, Project.content_profile JSON columns)

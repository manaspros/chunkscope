# ChunkScope - "n8n for RAG" Design Specification

**Date**: 2026-04-02
**Status**: Approved
**Goal**: Transform ChunkScope from a chunking visualizer into a full RAG pipeline builder with code/API export, AI suggestions, and live evaluation.

---

## 1. Positioning

ChunkScope is the only tool that combines:
- Visual RAG pipeline building (n8n-style drag-and-drop)
- Chunk-level debugging and visualization
- Framework-agnostic code export (standalone Python/FastAPI)
- Deployable API generation (Docker Compose)
- Live evaluation scoring while building
- AI-powered configuration recommendations
- Side-by-side pipeline comparison
- Cost estimation

No competitor (Flowise, Langflow, Dify, RAGFlow) offers chunk visualization, clean code export, or live evaluation.

---

## 2. Architecture Overview

```
Frontend (Next.js 14)          Backend (FastAPI)
========================       ========================
React Flow Pipeline Builder -> Pipeline API
Chunk Visualizer            -> Chunking Service
AI Suggestions Panel        -> Suggestion Engine
Comparison View             -> Evaluation Service
Code Export UI              -> Code Generator
Cost Calculator             -> Cost Service
                               |
                               v
                         PostgreSQL + pgvector
```

### Tech Stack (Keep)
- **Frontend**: Next.js 14, React 18, Tailwind, Shadcn/ui, Zustand, React Flow
- **Backend**: FastAPI, SQLAlchemy 2.0 async, Alembic, PostgreSQL + pgvector
- **PDF Processing**: PyMuPDF (fitz)
- **State Management**: Zustand
- **Package Manager**: uv (Python), npm (Frontend)

### Tech Stack (Change)
- **Remove**: Auth (JWT, bcrypt, login/signup) - unnecessary for portfolio demo
- **Remove**: Three.js/React Three Fiber - overkill for 2D text visualization
- **Remove**: Celery + Redis - use FastAPI background tasks instead
- **Add**: LiteLLM for unified LLM access
- **Add**: uv for Python package management
- **Keep but fix**: All chunking strategies (fix offset bug, thread safety)

---

## 3. RAG Pipeline Components

### 3.1 Chunking Strategies (8 methods)

| Method | Status | Notes |
|--------|--------|-------|
| Fixed Size | Keep | Baseline, works |
| Recursive | Fix | Offset tracking bug at line 90 |
| Semantic | Fix | Thread safety issue with model caching |
| Sentence Window | Keep | Clean implementation |
| Paragraph | Keep | Simple, works |
| Code-Aware | Keep | Useful for code docs |
| Heading-Based | Keep | Good for structured docs |
| Contextual (NEW) | Build | Anthropic's approach - prepend LLM-generated context to each chunk |

### 3.2 Embedding Providers

| Provider | Model | Dimensions | Notes |
|----------|-------|------------|-------|
| LiteLLM (default) | Configurable | Varies | Via proxy |
| SentenceTransformers | all-MiniLM-L6-v2 | 384 | Free, local, fast prototyping |
| OpenAI | text-embedding-3-large | 3072 | Via LiteLLM |
| Cohere | embed-v4 | 1536 | 128K context, multimodal |
| Voyage | voyage-3-large | 2048 | Best cost/accuracy |
| BGE-M3 | bge-m3 | 1024 | Dense + sparse + ColBERT in one |
| Jina | jina-embeddings-v3 | 1024 | Cheapest API |

### 3.3 Retrieval Strategies

| Strategy | Description |
|----------|-------------|
| Dense Vector | Standard cosine similarity search via pgvector |
| BM25 Keyword | Full-text search with PostgreSQL tsvector |
| Hybrid (Dense + BM25) | Reciprocal Rank Fusion combining both |
| Multi-Query | LLM generates 3-5 query variants, fuse results |
| HyDE | Generate hypothetical answer, embed that instead |
| Parent-Child | Small chunks for retrieval, return parent context |

### 3.4 Reranking

| Reranker | Type | Notes |
|----------|------|-------|
| Cross-Encoder | Local | ms-marco-MiniLM-L-12-v2 |
| Cohere Rerank | API | rerank-english-v3.0 |
| BM25 Rerank | Local | Keyword-based rescoring |
| LLM Rerank | API | Via LiteLLM - score relevance with LLM |

### 3.5 Generation

- LLM generation via LiteLLM (supports any model through proxy)
- Configurable system prompt, temperature, max tokens
- Citation generation (reference chunk IDs in response)
- Streaming support

---

## 4. New Features

### 4.1 AI Suggestion Engine

**Flow**: Upload document -> Profile document -> Recommend config -> LLM explains why

**Document Profiling** (runs on upload, no LLM):
- Document type classification (legal, medical, code, academic, financial, general)
- Structure analysis: heading density, paragraph length distribution, table count
- Content density scoring
- Language complexity: avg sentence length, vocabulary diversity
- Repetition detection: duplicate passages that break naive chunking

**Strategy Recommendation** (rule-based):
- Chunking method + chunk size + overlap
- Embedding model recommendation from registry
- Retrieval strategy recommendation
- Each with confidence score (0-1)

**LLM Explanation** (via LiteLLM):
- Human-readable explanation of why these settings
- Flags potential problems (tables that may fragment, dense clauses, etc.)
- Specific warnings per document region

**Embedding Model Registry**:
- Curated metadata: name, dimensions, max tokens, speed, quality tier, cost
- Best-fit document types per model
- Cost tier (free/local vs. API)

### 4.2 Visual Pipeline Builder (n8n-style)

**Node Types**:
- Document Source (upload/URL/text input)
- Chunking (select strategy + configure)
- Embedding (select provider + model)
- Vector Store (pgvector config)
- Retrieval (select strategy)
- Reranking (select reranker)
- Generation (LLM config)
- Evaluation (metrics selection)

**UX**:
- Left panel: node palette (drag to canvas)
- Center: React Flow canvas with connections
- Right panel: node configuration
- Bottom: data preview at selected node (see actual data flowing through)

**Data Transparency**:
- Click any node to see input/output data
- Chunk node: shows all chunks with boundaries highlighted
- Embedding node: shows vector dimensions, sample similarities
- Retrieval node: shows retrieved chunks ranked by score
- Generation node: shows final prompt + response

### 4.3 Code Export

**What it generates**: A standalone Python project that replicates the visual pipeline.

```
exported_pipeline/
  main.py           # FastAPI server with /query endpoint
  pipeline.py       # The RAG pipeline logic
  chunker.py        # Chunking implementation
  embedder.py       # Embedding logic
  retriever.py      # Retrieval logic
  requirements.txt  # Minimal deps (no frameworks)
  Dockerfile        # Ready to deploy
  docker-compose.yml # With PostgreSQL
  .env.example      # Required API keys
  README.md         # Setup instructions
```

**Key principle**: Generated code is framework-agnostic. No LangChain, no LlamaIndex. Just clean Python with FastAPI, psycopg2/asyncpg, and direct API calls. A junior dev should be able to read every line.

### 4.4 API Deployment

- Generate Docker Compose (FastAPI + PostgreSQL + pgvector)
- Auto-generated `/query` endpoint that accepts a question and returns answer + sources
- Auto-generated `/ingest` endpoint to add documents
- Health check endpoint
- OpenAPI docs included

### 4.5 Side-by-Side Comparison

- Compare 2 pipeline configs against the same document + queries
- Visual diff: which chunks are different, which retrievals differ
- Metric comparison: faithfulness, relevance, context precision
- "Winner" badge per metric

### 4.6 Live Evaluation Dashboard

**Metrics** (implemented from research, not just calling RAGAS library):
- Faithfulness: claim decomposition + entailment check against context
- Answer Relevancy: semantic similarity between answer and question
- Context Precision: position-weighted relevance of retrieved chunks
- Context Recall: coverage of ground truth claims in retrieved context
- Hit Rate@k: was any relevant chunk in top-k
- MRR: reciprocal rank of first relevant chunk

**UI**:
- Metrics panel alongside pipeline builder
- Updates as you change config
- Color-coded (green/yellow/red) per metric
- Trend chart showing how metrics change with config adjustments

### 4.7 Cost Calculator

- Estimated cost per document ingestion (embedding API calls)
- Estimated cost per query (embedding + LLM generation)
- Comparison across embedding providers
- Monthly projection based on expected query volume

---

## 5. Implementation Order

### Phase 1: Foundation
1. Remove auth system
2. Set up uv for Python
3. Fix chunking bugs (recursive offset, semantic thread safety)
4. Integrate LiteLLM
5. Add contextual chunking strategy

### Phase 2: RAG Depth
6. Implement all retrieval strategies (hybrid, multi-query, HyDE, parent-child)
7. Implement all rerankers (cross-encoder, LLM rerank)
8. Implement evaluation metrics
9. Add embedding model registry

### Phase 3: AI Suggestions
10. Document profiling engine
11. Strategy recommendation engine
12. LLM explanation layer
13. Frontend suggestions panel

### Phase 4: Pipeline Builder
14. n8n-style node system with React Flow
15. Data transparency (node I/O preview)
16. Pipeline execution engine updates

### Phase 5: Export & Deploy
17. Code generator (Python/FastAPI)
18. Docker Compose generator
19. API deployment generation

### Phase 6: Comparison & Evaluation
20. Side-by-side comparison view
21. Live evaluation dashboard
22. Cost calculator

### Phase 7: Polish
23. Docker Compose for ChunkScope itself
24. Test coverage
25. Frontend polish

---

## 6. Database Schema Changes

### Remove
- `User` model (no auth)
- `user_id` foreign keys from all tables

### Add
- `embedding_model_registry` - curated model metadata
- `evaluation_run` - stores eval results per pipeline config
- `comparison` - stores A/B comparison results
- `suggestion` - stores AI suggestions per document

### Modify
- `Pipeline` - add `exported_code` field, remove `user_id`
- `Document` - add profiling fields (doc_type, structure_score, complexity_score)
- `Chunk` - add `contextual_preamble` field for contextual chunking

---

## 7. API Endpoints (New/Modified)

### Suggestions
- `POST /api/v1/suggest/profile` - Profile a document
- `POST /api/v1/suggest/recommend` - Get recommendations for a document
- `POST /api/v1/suggest/explain` - Get LLM explanation

### Export
- `POST /api/v1/export/code` - Generate Python code from pipeline
- `POST /api/v1/export/docker` - Generate Docker Compose
- `POST /api/v1/export/api` - Generate API server

### Evaluation
- `POST /api/v1/evaluate/run` - Run evaluation on a pipeline config
- `POST /api/v1/evaluate/compare` - Compare two configs
- `GET /api/v1/evaluate/metrics` - Get available metrics

### Cost
- `POST /api/v1/cost/estimate` - Estimate costs for a config
- `GET /api/v1/cost/models` - Get model pricing data

### Pipeline (Modified)
- Remove auth middleware from all endpoints
- Add data preview endpoints per node

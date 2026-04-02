# ChunkScope Architecture

## System Overview

```
User Browser (localhost:3000)
    |
    v
Next.js 14 Frontend (React, Tailwind, Shadcn/ui)
    |
    v  REST API calls (axios)
    |
FastAPI Backend (localhost:8000)
    |
    ├── Services Layer
    │   ├── Chunkers (8 strategies)
    │   ├── Retrievers (19 strategies)
    │   ├── Rerankers (13 strategies)
    │   ├── Evaluation (6 metrics + chunk quality)
    │   ├── Suggestions (profiler + recommender + explainer)
    │   ├── Code Generator (Python/FastAPI export)
    │   ├── Cost Calculator
    │   ├── Strategy Guide (39 entries)
    │   ├── Decision Engine
    │   └── LLM Service (LiteLLM)
    |
    ├── PostgreSQL + pgvector (production)
    └── SQLite (development)
```

## Backend Architecture

### API Layer (`app/api/v1/`)
RESTful endpoints grouped by domain. 63+ endpoints total.

| Group | Endpoints | Purpose |
|-------|-----------|---------|
| `/health` | 2 | Health checks |
| `/pipelines` | 6 | Pipeline CRUD + execution |
| `/documents` | 5 | Document upload + management |
| `/chunks` | 4 | Chunk visualization + search |
| `/presets` | 4 | Industry template presets |
| `/evaluate` | 4 | RAG evaluation metrics |
| `/embeddings` | 4 | Embedding model registry |
| `/suggest` | 3 | AI suggestions engine |
| `/export` | 3 | Code/Docker export |
| `/cost` | 4 | Cost estimation |
| `/guide` | 6 | Strategy knowledge base |
| `/query` | 1 | Query execution |
| `/analyze` | 1 | Document analysis |
| `/config` | 2 | Pipeline validation |
| `/rerank` | 1 | Reranking |

### Services Layer

#### Chunking (`services/chunkers/`)
Factory pattern. `get_chunker(method)` returns the right chunker.

| Strategy | File | How It Works |
|----------|------|-------------|
| Fixed Size | `chunker.py` | Split every N characters |
| Recursive | `recursive_chunker.py` | Recursive split by separators (\n\n, \n, " ", "") |
| Semantic | `semantic_chunker.py` | Embed sentences, split at topic boundaries (valleys in similarity curve) |
| Sentence Window | `sentence_window_chunker.py` | Sliding window of N sentences |
| Paragraph | `paragraph_chunker.py` | Group paragraphs by size |
| Code-Aware | `code_aware_chunker.py` | Preserve code block integrity |
| Heading-Based | `heading_based_chunker.py` | Split at markdown headings |
| Contextual | `contextual_chunker.py` | Any base chunker + LLM-generated preamble per chunk |

#### Retrieval (`services/retrievers/`)
Registry pattern. `get_retriever_class(name)` returns the class.

| Strategy | Type | Key Idea |
|----------|------|----------|
| Dense Vector | Baseline | Cosine similarity via pgvector |
| Hybrid | Gold standard | Dense + BM25 with RRF fusion |
| Multi-Query | LLM-augmented | Generate 3-5 query variants, fuse results |
| HyDE | LLM-augmented | Embed a hypothetical answer instead of the query |
| Parent-Child | Hierarchical | Small chunks for search, big chunks for context |
| MMR | Diversity | Maximal Marginal Relevance |
| Query Expansion | LLM-augmented | Add synonyms/related terms |
| Sentence Window | Precision | Sentence-level retrieval + context expansion |
| Contextual Compression | LLM-filtered | LLM extracts only relevant portions |
| Self-Query | LLM + metadata | LLM generates search query + metadata filters |
| Metadata Filter | Filter | Pre/post-filter by doc_type, date, etc. |
| Time-Weighted | Recency | Exponential decay favoring recent docs |
| Ensemble | Multi-retriever | Run multiple retrievers in parallel, fuse with RRF |
| Sub-Query | LLM-augmented | Decompose complex query into simpler sub-queries |
| Step-Back | LLM-augmented | Generate abstract query for broader context |
| Adaptive | Auto-routing | Classify query complexity, route to appropriate strategy |
| Corrective RAG | Self-correcting | Evaluate retrieval quality, re-retrieve if needed |
| Document Summary | Two-stage | Coarse doc-level then fine chunk-level retrieval |

#### Reranking (`services/rerankers/`)
Factory pattern via `RerankerService.get_reranker(provider, model)`.

| Strategy | Type | Key Idea |
|----------|------|----------|
| Cross-Encoder | Neural | ms-marco-MiniLM joint query-doc scoring |
| Cohere Rerank | API | Managed reranking service |
| BM25 | Keyword | Term-frequency rescoring |
| RRF | Fusion | Merge multiple ranked lists |
| LLM Pointwise | LLM | Score each doc 0-10 with LLM |
| Lost-in-Middle | Positional | Reorder for LLM attention patterns (relevant at start+end) |
| Diversity | MMR | Reduce redundancy in results |
| Listwise LLM | LLM | RankGPT-style: LLM ranks entire list at once |
| Pairwise LLM | LLM | Tournament-style A vs B comparison |
| FlashRank | Lightweight | ~4MB model, CPU-only, sub-ms latency |
| BGE | Neural | BAAI/bge-reranker-base cross-encoder |
| Contextual | Enriched | Prepend metadata before scoring |
| Cascade | Multi-stage | Fast filter (FlashRank) -> precise rerank (cross-encoder) |

#### Evaluation (`services/evaluation/`)
Implemented from scratch (not calling RAGAS library).

| Metric | What It Measures |
|--------|-----------------|
| Faithfulness | Is answer grounded in retrieved context? (claim decomposition + entailment) |
| Answer Relevancy | Does answer address the question? (embedding similarity) |
| Context Precision | Are relevant chunks ranked at top? (position-weighted) |
| Context Recall | Was all needed info retrieved? (claim coverage) |
| Hit Rate@k | Was any relevant chunk in top-k? |
| MRR | Rank of first relevant result |

Chunk quality: semantic coherence, boundary quality, size appropriateness.

### Database Models (`models/models.py`)
- **Pipeline**: name, nodes (JSON), edges (JSON), settings (JSON)
- **PipelineVersion**: immutable snapshot of a pipeline
- **Document**: filename, file_path, file_type, extracted_text, doc_metadata (JSON)
- **Chunk**: text, chunk_index, embedding (Vector/Text), chunk_metadata (JSON)
- **Evaluation**: pipeline comparison with aggregate_scores (JSON)
- **Preset**: industry templates with configuration (JSON)

## Frontend Architecture

### Pages (12)
| Route | Purpose |
|-------|---------|
| `/` | Landing page |
| `/pipeline` | Visual pipeline builder (main feature) |
| `/suggestions` | AI-powered configuration recommendations |
| `/evaluation` | RAG metrics + comparison |
| `/guide` | Strategy knowledge base + comparison |
| `/visualizer` | Chunk visualization on documents |
| `/dashboard` | Document management + stats |
| `/presets` | Industry template gallery |
| `/analyze` | Document analysis |
| `/get-started` | Onboarding |

### State Management (Zustand)
- `usePipelineStore` - nodes, edges, execution state, selected node, preview data
- `useSuggestionStore` - profile, recommendations, explanation
- `useEvaluationStore` - metrics, chunk quality, comparison
- `useConfigStore` - chunking config, selected documents
- `useChunkStore` - chunks, selected/hovered chunk

### Key Components
- **PipelineNode** - Universal React Flow node for all 8 node types
- **ConfigPanel** - Dynamic config form per node type
- **StrategyInfoDrawer** - Slide-in panel with strategy details
- **PipelineWizard** - 4-step guided pipeline creation
- **QuickTestSidebar** - Test queries inline in the builder
- **CostTicker** - Real-time cost estimation footer
- **PipelineHealth** - Green/yellow/red health indicator
- **QualityScoreCard** - Score out of 100 with improvement tips

# ChunkScope Architecture

## System Overview

```
User Browser (localhost:3000)
    |
    v
Next.js 14 Frontend (React, Tailwind, Shadcn/ui, React Flow)
    |
    v  REST API calls (axios)
    |
FastAPI Backend (localhost:8000)
    |
    ├── Services Layer
    │   ├── Document Analyzer (20 regex content signals)
    │   ├── Pipeline Recommender (rule-based, 40+ strategies)
    │   ├── AI Profiler (LLM semantic corpus profiling)
    │   ├── AI Pipeline Selector (LLM pipeline selection)
    │   ├── Chunkers (8 strategies)
    │   ├── Retrievers (17+ strategies)
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

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                          USER WORKFLOW                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. CREATE PROJECT         2. UPLOAD FILES                          │
│  POST /projects     ──>    POST /projects/{id}/upload               │
│                            POST /projects/{id}/upload-zip           │
│                            POST /projects/{id}/upload-folder        │
│                            (instant save, no processing)            │
│                                                                     │
│  3. ANALYZE CORPUS (choose one)                                     │
│                                                                     │
│  ┌─ Rule-Based Path ──────────────────────────────────────────┐    │
│  │  POST /projects/{id}/analyze                                │    │
│  │  Document Analyzer (regex) ──> Pipeline Recommender (rules) │    │
│  │  Cost: $0.00 | Speed: <1s | Depth: structural only          │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌─ Smart-Analyze Path ───────────────────────────────────────┐    │
│  │  POST /projects/{id}/smart-analyze                          │    │
│  │  Document Analyzer (signals only) ──> Pipeline Recommender  │    │
│  │  Cost: $0.00 | Speed: <1s | Depth: fingerprint-focused      │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌─ AI-Powered Path ──────────────────────────────────────────┐    │
│  │  POST /projects/{id}/ai-analyze                             │    │
│  │  Document Analyzer (signals)                                │    │
│  │    ──> AI Profiler (LLM understands content semantics)      │    │
│  │    ──> AI Pipeline Selector (LLM picks optimal pipeline)    │    │
│  │  Cost: ~$0.01-0.05 | Speed: 5-15s | Depth: semantic         │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  4. VIEW RECOMMENDATION                                             │
│  PipelineFlow (React Flow) shows:                                   │
│  Your Data ──> Chunking ──> Retrieval ──> Reranking ──> Embedding   │
│  Each stage shows primary + augmentation techniques with confidence  │
│                                                                     │
│  5. BUILD PIPELINE                                                  │
│  "Build Pipeline" ──> /pipeline?projectId={id}                      │
│  Recommended nodes pre-loaded into React Flow builder               │
│                                                                     │
│  6. CHUNK ON DEMAND                                                 │
│  POST /projects/{id}/chunk                                          │
│  Extracts text (if needed) ──> Applies chunking strategy            │
│                                                                     │
│  7. QUERY & TEST                                                    │
│  POST /query/                                                       │
│  Embeds query (LiteLLM) ──> Retrieves ──> Returns ranked results    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Service Dependency Map

```
                    ┌──────────────┐
                    │  llm_service │  (LiteLLM - all LLM/embedding calls)
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
    ┌─────────▼──┐  ┌──────▼─────┐  ┌──▼──────────────┐
    │ ai_profiler │  │ ai_pipeline│  │ query endpoint   │
    │ (LLM)      │  │ _selector  │  │ (embed + search) │
    └─────────┬──┘  │ (LLM)     │  └──────────────────┘
              │     └──────┬─────┘
              │            │
              │     Reads: ContentProfile
              │     + merged signals
              │     + available nodes
              │
    ┌─────────▼──────────────────┐
    │   document_analyzer        │  (20 regex signals, no LLM)
    │   - _extract_content()     │
    │   - _compute_content_signals()
    │   - _quick_classify()      │
    │   - _recommend_from_signals()
    └─────────┬──────────────────┘
              │
    ┌─────────▼──────────────────┐
    │   pipeline_recommender     │  (rule-based, no LLM)
    │   - recommend(signals,     │
    │     doc_type, corpus_size, │
    │     priority, budget)      │
    │   Returns:                 │
    │     PipelineRecommendation │
    │     (chunking[], retrieval[],
    │      reranking[], embedding,
    │      why_not[])            │
    └────────────────────────────┘

    ┌────────────────────────────┐
    │   document_service         │  (file upload/save/delete)
    └─────────┬──────────────────┘
              │
    ┌─────────▼──────────────────┐
    │   chunkers/                │  (8 strategies, sync CPU-bound)
    │   retrievers/              │  (17+ strategies, async)
    │   rerankers/               │  (13 strategies)
    └────────────────────────────┘
```

## Backend Architecture

### API Layer (`app/api/v1/`)
RESTful endpoints grouped by domain.

| Group | File | Key Endpoints | Purpose |
|-------|------|---------------|---------|
| `/health` | `health.py` | 2 | Health + readiness checks |
| `/projects` | `projects.py` | 11 | Project CRUD, file upload, analysis, chunking |
| `/pipelines` | `pipelines.py` | 6 | Pipeline CRUD + execution |
| `/documents` | `documents.py` | 5 | Document upload + management |
| `/chunks` | `chunks.py` | 4 | Chunk visualization + search |
| `/presets` | `presets.py` | 4 | Industry template presets |
| `/evaluate` | `evaluation_api.py` | 4 | RAG evaluation metrics |
| `/embeddings` | `embeddings.py` | 4 | Embedding model registry |
| `/suggest` | `suggestions.py` | 3 | AI suggestions engine |
| `/export` | `export.py` | 3 | Code/Docker export |
| `/cost` | `cost.py` | 4 | Cost estimation |
| `/guide` | `guide.py` | 6 | Strategy knowledge base |
| `/query` | `query.py` | 1 | Query execution (LiteLLM) |
| `/analyze` | `analysis.py` | 2 | Standalone document/corpus analysis |
| `/config` | `config.py` | 2 | Pipeline validation |
| `/rerank` | `rerank.py` | 1 | Reranking |
| `/preview` | `preview.py` | 1 | Chunking preview |

### Services Layer

#### Document Analyzer (`services/document_analyzer.py`)
Corpus fingerprinting with 20 regex-based content signals. Zero LLM tokens.

| Signal | What It Detects |
|--------|----------------|
| `heading_density` | Markdown/HTML headings per line |
| `code_ratio` | Code fences and indented blocks |
| `table_ratio` | Markdown/HTML tables |
| `list_ratio` | Ordered/unordered lists |
| `formula_ratio` | LaTeX formulas and math notation |
| `cross_ref_ratio` | Cross-references (Fig., Table, Section) |
| `named_entity_density` | Capitalized multi-word entities |
| `question_density` | Questions (? and interrogative patterns) |
| `dialogue_ratio` | Dialogue/conversation patterns |
| `heading_depth` | Maximum heading nesting level |
| `forward_references` | Forward references (see below, later) |
| `back_references` | Back references (as mentioned, above) |
| `comparison_patterns` | Comparison language (vs., compared to) |
| `causal_chains` | Causal language (because, therefore, leads to) |
| `vocabulary_diversity` | Type-token ratio (unique words / total words) |
| `avg_sentence_length` | Average words per sentence |
| `avg_paragraph_sentences` | Average sentences per paragraph |
| `total_words` | Total word count |
| `total_lines` | Total line count |
| `total_paragraphs` | Total paragraph count |

#### Pipeline Recommender (`services/pipeline_recommender.py`)
Rule-based engine that maps signals to technique stacks.

- **40+ strategies**: 8 chunking, 17 retrieval, 13 reranking, 8 embedding
- **Confidence formula**: `signal_strength * 0.4 + research_backing * 0.3 + maturity * 0.3`
- **Research calibration**: Vecta 2026, Vectara NAACL 2025, Anthropic 2024, HiChunk/cAST EMNLP 2025
- **"Why not" explanations** for rejected alternatives
- No LLM calls

#### AI Profiler (`services/ai_profiler.py`)
LLM-based semantic corpus understanding.

- Stratified sampling: picks diverse documents by type and length
- Sends samples to LLM with structured prompt
- Returns `ContentProfile` dataclass:
  - `content_types`, `domain`, `structure_level`, `entity_density`
  - `relationship_type`, `expected_query_types`, `language_complexity`
  - `has_formulas`, `has_code`, `has_tables`, `has_diagrams`
  - `summary` (human-readable)
- Cost: ~$0.01-0.05 per analysis

#### AI Pipeline Selector (`services/ai_pipeline_selector.py`)
LLM picks optimal pipeline from all available nodes.

- Takes ContentProfile + merged signals + available nodes catalog
- Available nodes: 8 chunking, 17 retrieval, 13 reranking, 8 embedding
- Returns `PipelineRecommendation` with 2-3+ techniques per stage
- Includes reasoning and 5+ "why not" explanations

#### Chunking (`services/chunkers/`)
Factory pattern. `get_chunker(method)` returns the right chunker.

| Strategy | File | How It Works |
|----------|------|-------------|
| Fixed Size | `chunker.py` | Split every N characters |
| Recursive | `recursive_chunker.py` | Recursive split by separators (\n\n, \n, " ", "") |
| Semantic | `semantic_chunker.py` | Embed sentences, split at topic boundaries |
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
| Lost-in-Middle | Positional | Reorder for LLM attention patterns |
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
| Faithfulness | Is answer grounded in retrieved context? |
| Answer Relevancy | Does answer address the question? |
| Context Precision | Are relevant chunks ranked at top? |
| Context Recall | Was all needed info retrieved? |
| Hit Rate@k | Was any relevant chunk in top-k? |
| MRR | Rank of first relevant result |

Chunk quality: semantic coherence, boundary quality, size appropriateness.

### Database Models (`models/models.py`)

#### Project (NEW)
Core entity. Everything flows through projects.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key |
| `name` | String(255) | Project name |
| `description` | Text | Optional description |
| `total_files` | Integer | File count (auto-updated) |
| `total_chunks` | Integer | Chunk count (auto-updated) |
| `dominant_doc_type` | String(50) | Most common file type |
| `corpus_config` | JSON | Recommended RAG config |
| `analysis_result` | JSON | Full analysis output (persisted for page refresh) |
| `content_profile` | JSON | AI profiler output (persisted for page refresh) |
| `status` | String(20) | "active" or "archived" |

#### Document
| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key |
| `filename` | String(255) | Stored filename |
| `original_filename` | String(255) | Original upload name |
| `file_path` | String(512) | Disk path |
| `file_type` | String(20) | File extension type |
| `file_size_bytes` | BigInteger | File size |
| `doc_metadata` | JSON | Variable metadata |
| `extracted_text` | Text | Extracted text (populated on-demand) |
| `is_processed` | Boolean | Processing status |
| `project_id` | UUID FK | Link to project |

#### Chunk
| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key |
| `document_id` | UUID FK | Link to document |
| `text` | Text | Chunk content |
| `chunk_index` | Integer | Position in document |
| `embedding` | Vector(1536) / Text | pgvector on Postgres, Text on SQLite |
| `chunking_method` | Enum | Method used |
| `chunk_size` | Integer | Configured size |
| `chunk_overlap` | Integer | Configured overlap |
| `chunk_metadata` | JSON | Variable metadata |
| `token_count` | Integer | For cost estimation |
| `parent_chunk_id` | UUID FK | Parent-child for hierarchical |
| `tsv` | TSVECTOR / Text | Full-text search (Postgres only) |

#### Other Models
- **Pipeline**: name, nodes (JSON), edges (JSON), settings (JSON), status
- **PipelineVersion**: immutable snapshot of a pipeline
- **Evaluation**: A/B test sessions with aggregate_scores (JSON)
- **EvaluationResult**: Individual query results within an evaluation
- **TestDataset**: Golden Q&A pairs for evaluation
- **ExecutionLog**: Pipeline execution logs for debugging
- **Preset**: Pre-configured RAG pipeline templates

## Frontend Architecture

### Pages
| Route | Purpose |
|-------|---------|
| `/` | Landing page |
| `/projects` | Project list (Active/Archived tabs) |
| `/projects/[id]` | Project detail: files, analysis, recommendations |
| `/pipeline` | Visual pipeline builder (main feature) |
| `/dashboard` | Project overview with stats |
| `/guide` | Strategy knowledge base + comparison |
| `/suggestions` | AI-powered configuration recommendations |
| `/evaluation` | RAG metrics + comparison |
| `/visualizer` | Chunk visualization on documents |
| `/presets` | Industry template gallery |
| `/analyze` | Standalone document analysis |
| `/get-started` | Onboarding |

### Navigation
Simplified navbar: **Projects** | **Pipeline Builder** | **Strategy Guide** | **Dashboard**

### Key Components
- **PipelineFlow** (`components/analysis/PipelineFlow.tsx`) - React Flow diagram showing recommended pipeline stages (Data -> Chunking -> Retrieval -> Reranking -> Embedding -> RAG Ready) with custom StageNode and TechniqueNode types
- **PipelineRecommendation** - Displays recommendation details and "Build Pipeline" button
- **AnalysisResultOverlay** - Shows analysis results overlay
- **PipelineNode** - Universal React Flow node for all 8 node types in the builder
- **ConfigPanel** - Dynamic config form per node type
- **StrategyInfoDrawer** - Slide-in panel with strategy details
- **PipelineWizard** - 4-step guided pipeline creation
- **QuickTestSidebar** - Test queries inline in the builder
- **CostTicker** - Real-time cost estimation footer
- **PipelineHealth** - Green/yellow/red health indicator
- **QualityScoreCard** - Score out of 100 with improvement tips

### State Management (Zustand)
- `usePipelineStore` - nodes, edges, execution state, selected node, preview data
- `useSuggestionStore` - profile, recommendations, explanation
- `useEvaluationStore` - metrics, chunk quality, comparison
- `useConfigStore` - chunking config, selected documents
- `useChunkStore` - chunks, selected/hovered chunk

### Design System
Professional light theme (Linear/Notion style):
- Pages: `bg-gray-50`
- Cards: `bg-white`
- Borders: `border-gray-200`
- Shadows: `shadow-sm`
- Accent: `amber-600`

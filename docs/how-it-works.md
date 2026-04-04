# How ChunkScope Works

## Overview

ChunkScope is an "n8n for RAG" — a visual pipeline builder that analyzes your documents and recommends the optimal RAG (Retrieval-Augmented Generation) pipeline. Instead of guessing which chunking method, retrieval strategy, or reranking approach to use, ChunkScope's AI figures it out for you.

## The Complete Flow

### 1. Upload Documents

User uploads files (PDF, TXT, or ZIP/folder) to a project. Files are saved to disk immediately — no processing happens yet. This keeps upload instant.

**Backend**: `POST /projects/{id}/upload` → saves file, creates `Document` record

### 2. AI Analysis (the "brain")

When user clicks "AI Analysis", three things happen in sequence:

#### 2a. Corpus Fingerprinting (regex, free, instant)

The system reads the raw text of every file and computes 20 content signals using regex patterns:

| Signal | What it measures | Example |
|--------|-----------------|---------|
| `heading_density` | Ratio of heading lines to total lines | 0.12 = structured doc |
| `code_ratio` | Ratio of code blocks to total text | 0.3 = code-heavy |
| `formula_ratio` | Math formulas detected | 0.05 = has equations |
| `cross_ref_ratio` | Cross-references ("see section X") | 0.08 = academic/legal |
| `named_entity_density` | Proper nouns detected | 0.15 = entity-rich |
| `vocabulary_diversity` | Unique words / total words | 0.7 = varied language |
| `avg_sentence_length` | Words per sentence | 24 = dense academic writing |

**No LLM is used** — pure regex pattern matching. Zero cost.

**Code**: `backend/app/services/document_analyzer.py` → `_compute_content_signals()`

#### 2b. AI Profiling (LLM, ~$0.01, 5 seconds)

An LLM reads sample documents to understand the corpus semantically:

1. **Stratified sampling**: Picks 5-10 diverse documents (by type and length) so the LLM sees representative content
2. **Sends to LLM**: "Read these samples and tell me: domain, structure, relationships, typical query types"
3. **Returns ContentProfile**: `{domain: "machine_learning", structure: "academic_paper", query_types: ["conceptual", "comparison"]}`

**Code**: `backend/app/services/ai_profiler.py` → `profile()`

#### 2c. AI Pipeline Selection (LLM, ~$0.001, 3 seconds)

An LLM picks the optimal techniques from all 40+ available:

**Input**: Content signals + ContentProfile + full list of available techniques
**Prompt**: "Given this corpus, pick the best 2-3 techniques per stage"
**Output**: 
```json
{
  "chunking": [{"name": "heading_based", "confidence": 0.85, "reasoning": "doc has clear headings"}],
  "retrieval": [{"name": "hybrid", "confidence": 0.9}, {"name": "hyde", "confidence": 0.7}],
  "reranking": [{"name": "cross_encoder", "confidence": 0.8}],
  "augmentation": [{"name": "multi_query", "confidence": 0.75}]
}
```

**Code**: `backend/app/services/ai_pipeline_selector.py` → `select_pipeline()`

### 3. Build Pipeline (visual editor)

The recommendation becomes a visual React Flow diagram:

```
📄 Your Data → ✂️ Chunking → 🔢 Embedding → 🔍 Retrieval → 🏆 Reranking → 🤖 LLM
```

User can drag nodes, change settings, add/remove techniques. The pipeline config is stored in Zustand (persists across refreshes via localStorage).

**Frontend**: `frontend/src/app/pipeline/page.tsx` + `frontend/src/components/pipeline/`

### 4. Run Pipeline

When user clicks "Run Pipeline":

1. **Save pipeline** to database (`POST /pipelines/`)
2. **For each node** in topological order:
   - **Chunking node** (via SSE streaming with progress bar):
     - Checks if chunks already exist → skips if yes
     - Extracts text from documents (on-demand, parallel — 8 docs at a time via ProcessPoolExecutor)
     - Chunks text using configured method (recursive, heading_based, semantic, etc.)
     - Bulk inserts chunks + generates tsvector for full-text search
     - Generates embeddings via LiteLLM (batches of 100)
   - **Other nodes** (retriever, reranker, LLM): config saved, instant acknowledgment
3. **Auto-validates** pipeline by running 5 random queries and checking retrieval accuracy
4. Shows health score inline (EXCELLENT/GOOD/FAIR/POOR)

**Backend**: `POST /pipelines/{id}/execute-step-stream` (SSE) or `POST /pipelines/{id}/execute-step`

### 5. Test & Evaluate (Tester Panel)

The slide-out Tester panel runs queries through the **exact same pipeline** the user built:

1. **Embed query** → generate embedding via LiteLLM
2. **Retrieve** → use configured method (hybrid, vector, keyword, MMR) with augmentation (multi_query, HyDE) if set
3. **Rerank** → if reranker node exists, re-score results
4. **Generate answer** → LLM reads retrieved chunks and writes an answer
5. **Auto-judge** → separate LLM call grades the output

**No manual method selection** — reads config from pipeline nodes directly.

**Backend**: `POST /query/pipeline-test`

### 6. LLM-as-Judge (how it works)

After generating an answer, a separate LLM evaluates quality:

**Input sent to judge LLM**:
```
QUERY: <user's question>
RETRIEVED CONTEXT: <top 5 chunks with scores>
GENERATED ANSWER: <the answer>

Rate: relevance (1-5), faithfulness (1-5), completeness (1-5), overall_grade (A-F), verdict (1 sentence)
```

**What each score means**:
- **Relevance**: Were the right chunks pulled? (tests retrieval quality)
- **Faithfulness**: Does the answer only say things the chunks support? (tests for hallucination)
- **Completeness**: Does the answer fully address the question? (tests generation quality)

**Verified behavior**:
- Relevant query on matching corpus → Grade A, 5/5/5
- Irrelevant query ("pasta carbonara" on ML paper) → Grade F, 1/1/1

**Cost**: ~$0.001 per judge call

### 7. Export

Generates standalone Python code for the configured pipeline. User downloads a `.py` file they can run independently.

**Backend**: `POST /export/code`

## Architecture

```
Frontend (Next.js 14)          Backend (FastAPI)              Database (PostgreSQL)
┌─────────────────┐           ┌──────────────────┐          ┌─────────────────┐
│ Projects Page    │──────────│ Projects API     │──────────│ projects        │
│ Pipeline Builder │──────────│ Pipelines API    │──────────│ pipelines       │
│ Tester Panel     │──────────│ Query API        │──────────│ documents       │
│ Strategy Guide   │──────────│ Guide API        │──────────│ chunks (pgvector)│
└─────────────────┘           │ Services:        │          └─────────────────┘
                              │  ├ document_analyzer│
                              │  ├ ai_profiler      │         LLM Proxy
                              │  ├ ai_pipeline_sel  │        ┌──────────┐
                              │  ├ chunking (8 methods)│─────│ LiteLLM  │
                              │  ├ retrievers (17+) │        └──────────┘
                              │  ├ rerankers (13)   │
                              │  └ llm_service      │
                              └──────────────────┘
```

## What Makes This Better Than Simple RAG

| Simple RAG | ChunkScope |
|-----------|-----------|
| Fixed 500-char chunks | AI picks optimal method per corpus |
| Only cosine similarity search | Hybrid search (vector + keyword) |
| Single query → single search | Multi-query augmentation (3 variations) |
| No result quality check | Cross-encoder reranking |
| No evaluation | LLM Judge grades every answer |
| Same config for everything | Tailored per document type |
| Manual configuration | AI recommends pipeline |

**Measured impact**: 15-30% better retrieval accuracy depending on corpus type.

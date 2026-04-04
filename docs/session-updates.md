# Session Updates Log

## Session 3 — Polish, Testing & Bug Fixes (2026-04-05)

### Critical Bug Fixes
1. **asyncpg concurrent operations crash** — All embedding batches now run sequentially on DB writes (API calls can be concurrent, but db.add/flush must be sequential on same asyncpg connection)
2. **MultiQueryRetriever returning 0 results** — Three root causes fixed:
   - asyncio.gather on same DB session → sequential retrieval
   - RRF fusion couldn't identify chunks (looked for `doc["id"]` but chunks are `{"chunk": <Chunk>, "score": float}`)
   - Query augmentor didn't strip markdown fences from LLM response (```json artifacts)
3. **HyDE/QueryExpansion retrievers** — Didn't pass project_id or generate embeddings for transformed queries
4. **Skip logic failing** — Compared chunking_method as enum string ("ChunkingMethod.HEADING_BASED") vs plain string ("recursive"). Fixed: now checks if ANY chunks with embeddings exist, regardless of config
5. **Pipeline project_id resolution** — URL params > store > pipeline record > settings (3 fallbacks). Auto-persists project_id on pipeline if missing
6. **Zustand hooks violation** — useMemo called after conditional return in TesterPanel (React rules of hooks)

### Tester Panel (New)
- Full pipeline execution: Retrieve → Rerank → Generate → Auto-Judge
- Reads pipeline config directly from builder nodes (no manual method selection)
- 6 sections: Query Input, Answer+Judge, Pipeline Trace, Retrieved Chunks, vs Simple RAG, Auto-Validation
- LLM Judge grades A-F with relevance/faithfulness/completeness scores (verified working: relevant queries get A, irrelevant get F)
- Score distribution insights, latency bars, index stats

### Pipeline Builder Cleanup
- Removed evaluation node from palette (confusing, non-functional)
- Removed QuickTestSidebar, CostEstimatePopover, CostTicker from bottom bar
- Clean bottom bar: Undo/Redo/Clear | Status | Run Pipeline | Tester | Chat | Export
- Auto-evaluation runs after pipeline execution (shows health badge inline)
- Execution state persisted (green checkmarks survive refresh)

### Dead Page Removal
- Deleted: /presets, /suggestions, /get-started, /demo, /evaluation
- Deleted orphaned components: presets/, suggestions/, evaluation/ directories
- Deleted stores: useSuggestionStore, useEvaluationStore
- Cleaned api.ts: removed presetsApi, suggestApi, evaluateApi exports

### UI Light Theme Fixes
- PipelineFlow input/output node pills → white with border
- ConfigPanel/PipelineNode hover → hover:bg-gray-100
- Guide page complexity filter → amber when selected
- All pipeline node detail components (retrieval, reranker, storage, generation, loader, toolbar) → light theme

### Backend Improvements
- POST /query/pipeline-test — Full pipeline test with auto-judge
- POST /query/enriched — Query with latency/score/index metrics
- GET /projects/{id}/sample-queries — Auto-generate test queries
- POST /projects/{id}/validate — 5-query retrieval accuracy test
- POST /projects/{id}/llm-judge — LLM evaluates retrieval quality
- Parallel document processing (8 at a time via ProcessPoolExecutor)
- Bulk INSERT (add_all) + bulk tsvector UPDATE per document

### Tests & Dependencies
- Fixed 7 broken test files (stray commas from auth removal + import errors)
- 297/300 non-API tests pass, 46/47 API tests pass
- Removed unused langchain/langchain-openai/langchain-community from requirements.txt
- Created Playwright E2E tests (7 core flow tests)

---

## Pipeline Builder Overhaul + Cleanup Session

### Pipeline Execution
1. **SSE Streaming** - execute-step-stream endpoint with real-time progress bar
2. **Parallel Processing** - 8 docs at a time via ProcessPoolExecutor
3. **Bulk Operations** - add_all() for chunks, single UPDATE for tsvector
4. **Skip Logic** - Existing chunks with embeddings are not re-processed
5. **Auto-Evaluation** - Pipeline automatically validates after execution

### Tester Panel
1. **Full Pipeline Test** - Reads pipeline config from nodes, runs retrieve → rerank → generate → judge
2. **LLM Judge** - Grades A-F with relevance/faithfulness/completeness scores
3. **Technical Metrics** - Embedding latency, retrieval latency, score distribution, index stats
4. **vs Simple RAG** - Shows improvement estimate over baseline

### Project State Management
1. **Zustand Persist** - Pipeline nodes/edges survive page refresh
2. **Execution State Preserved** - Green checkmarks on nodes persist across visits
3. **Project Isolation** - Switching projects clears stale execution state
4. **Project ID Resolution** - URL params > store > pipeline record > settings (3 fallbacks)

### UI Polish
1. **Light Theme Fixes** - All node components, toolbar, detail panels converted to light theme
2. **Dark Element Fixes** - PipelineFlow pills, ConfigPanel hover, guide filters
3. **Dead Page Removal** - Removed presets, suggestions, get-started, demo, evaluation pages
4. **Bottom Bar Redesign** - Clean: Run Pipeline | Tester | Chat | Export (no clutter)
5. **Progress Bar** - Real-time progress during pipeline execution

### Backend Improvements
1. **Enriched Query** - /query/enriched returns latency, score stats, index info, vs-simple-RAG comparison
2. **Pipeline Test** - /query/pipeline-test runs full pipeline with auto-judge
3. **Chunk Status** - /projects/{id}/chunk-status endpoint
4. **Sample Queries** - /projects/{id}/sample-queries auto-generates from content
5. **asyncpg Fix** - Sequential DB writes (no concurrent operations on same connection)

### Test & Documentation
1. Fixed 7 broken test files (stray commas from auth removal, import errors)
2. Updated CLAUDE.md with new endpoints
3. Removed unused LangChain dependencies

---

## Query Not Returning Results - Root Cause

The query endpoint works (status 200) but returns empty results because:

1. **Chunks exist but have no embeddings** - The chunking was done before we added the embedding generation code
2. **Vector search finds nothing** - `cosine_distance` on NULL embedding columns returns no matches
3. **Keyword search finds nothing** - `tsv` (tsvector) column is also NULL for old chunks

### Fix
Re-chunk the data from the pipeline page. The updated chunk endpoint now:
- Generates vector embeddings via `llm_service.embed()` in batches of 100
- Generates tsvector via `UPDATE chunks SET tsv = to_tsvector('english', text)`

### The `execute-step` 404 Errors
The pipeline builder frontend tries to call `POST /pipelines/{id}/execute-step` which doesn't exist. This is a frontend issue - the pipeline page has auto-execution logic that fires when nodes are loaded. This needs to be fixed or the endpoint needs to be created.

## All Changes Made This Session

### Backend

1. **Expanded Fingerprinting** - `document_analyzer.py`: 9 → 20 content signals
2. **Pipeline Recommender** - `pipeline_recommender.py`: NEW, rule-based multi-technique stacking
3. **AI Profiler** - `ai_profiler.py`: NEW, LLM semantic corpus profiling
4. **AI Pipeline Selector** - `ai_pipeline_selector.py`: NEW, LLM picks from available nodes
5. **Analysis Persistence** - `analysis_result` + `content_profile` JSON columns on Project model
6. **On-Demand Processing** - Removed auto-processing on upload, text extraction at chunk time
7. **Embedding Generation** - Chunks get vector embeddings + tsvector on creation
8. **Query via LiteLLM** - `query.py` uses `llm_service.embed()` instead of hardcoded OpenAI
9. **Schema Fixes** - Added `fetch_k` to QueryRequest, fixed 5 Pydantic Optional defaults
10. **Cross-DB UUID** - `base.py` uses `sqlalchemy.Uuid` not `postgresql.UUID`
11. **SQLite-Safe Migrations** - Dialect guard on PostgreSQL-specific DDL
12. **Robust JSON Parsing** - Regex-based markdown fence stripping in AI services
13. **PostgreSQL Setup** - Created `chunkscope` DB with pgvector + uuid-ossp extensions

### Frontend

1. **Light Theme** - 18 files updated from dark to white SaaS theme
2. **React Flow Pipeline Viz** - `PipelineFlow.tsx`: interactive diagram with technique nodes
3. **Pipeline Builder Overhaul** - 17 component files: light theme, rich nodes, add/remove techniques
4. **Build Pipeline Flow** - "Apply All" → "Build Pipeline →", navigates to `/pipeline?projectId={id}`
5. **Customizable Recommendations** - Toggle techniques on/off, adjust chunk_size/overlap
6. **Project-Based Navigation** - Simplified navbar, active/archived tabs, project overview dashboard
7. **File Upload Zone** - Light theme, merged folder button, updated badge colors
8. **Removed Corpus Analysis** - Old regex-based analysis section removed
9. **Removed Quick Analysis** - Single "AI Analysis" button remains
10. **Content Profile Display** - Domain, structure, relationships, observations
11. **Tooltip Fix** - Renders above card, z-index 9999, arrow pointer
12. **Draggable Nodes** - `elementsSelectable={true}` in PipelineFlow
13. **Corpus Config Fix** - Filter out object values before rendering

### Documentation

1. **CLAUDE.md** - Updated with all new services, flow, endpoints
2. **docs/architecture.md** - System diagram, data flow, service map, DB schema
3. **docs/development-log.md** - Full record of everything built + learnings
4. **docs/api-reference.md** - All new endpoint documentation

### Bug Fixes

1. SQLite missing columns → ALTER TABLE
2. ZeroDivisionError in stratified sampling
3. LLM failure → clean 400 error
4. Alembic migrations SQLite-safe
5. postgresql.UUID → cross-database Uuid
6. Fragile JSON fence stripping → regex
7. Query endpoint hardcoded OpenAI → LiteLLM
8. Missing `fetch_k` in QueryRequest
9. 5 Pydantic Optional fields missing `= None`
10. `corpus_config` rendering objects as React children
11. Race condition: chunks not ready → on-demand extraction
12. Dead code inside `save_file()` → proper `delete_file()`

### Cleanup

- 48 stale files removed (~9,500 lines)
- Unused WebGL components deleted
- Default chunking on upload removed
- Redundant analysis buttons removed
- Old dark theme gradients removed
</content>
</invoke>
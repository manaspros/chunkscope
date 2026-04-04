# ChunkScope Development Log

This document records the transformation of ChunkScope from a basic chunking visualizer into a full "n8n for RAG" -- a visual pipeline builder where users upload data and get an optimized RAG pipeline.

## What Was Built

### 1. Expanded Corpus Fingerprinting

**File**: `backend/app/services/document_analyzer.py`
**What**: Expanded from 9 to 20 content signals, all regex-based, zero LLM tokens.
**Why**: The original 9 signals (headings, code, tables, lists, sentence length, paragraph length, word count, lines, paragraphs) were too coarse. A code-heavy textbook with formulas looked the same as a plain code repo. More signals = better pipeline differentiation without spending LLM tokens.

**New signals added**:
- `formula_ratio` -- LaTeX and math notation density
- `cross_ref_ratio` -- Cross-references (Fig., Table, Section references)
- `named_entity_density` -- Capitalized multi-word entities
- `question_density` -- Question marks and interrogative patterns
- `dialogue_ratio` -- Dialogue/conversation patterns
- `heading_depth` -- Maximum heading nesting level (h1 vs h4)
- `forward_references` -- "see below", "later in this section"
- `back_references` -- "as mentioned above", "previously"
- `comparison_patterns` -- "vs.", "compared to", "in contrast"
- `causal_chains` -- "because", "therefore", "leads to", "results in"
- `vocabulary_diversity` -- Type-token ratio (unique words / total words)

**Tests**: 50 tests in `tests/test_fingerprinting.py` covering all 20 signals individually plus document type scenarios (code, textbook, legal, FAQ).

### 2. Multi-Technique Pipeline Recommender

**File**: `backend/app/services/pipeline_recommender.py` (NEW)
**What**: Rule-based engine that returns STACKS of techniques (primary + augmentations), not single strategies.
**Why**: Real RAG systems use multiple techniques together. "Use recursive chunking" is useless advice. "Use recursive 512 + hybrid retrieval + BM25 reranking + contextual augmentation for structured docs" is actionable. The recommender outputs a complete pipeline stack.

**Key design decisions**:
- Confidence scoring formula: `signal_strength * 0.4 + research_backing * 0.3 + maturity * 0.3`
- Scores calibrated against published research: Vecta 2026, Vectara NAACL 2025, Anthropic 2024, HiChunk/cAST EMNLP 2025
- 40+ strategies available: 8 chunking, 17 retrieval, 13 reranking, 8 embedding
- "Why not" explanations for rejected alternatives (e.g., "Semantic chunking rejected: Vectara NAACL 2025 shows fixed-size beats semantic on real datasets")
- Entirely self-contained -- imports nothing from the rest of the app, makes no LLM calls

**Tests**: 33 tests in `tests/test_pipeline_recommender.py` covering technique selection, confidence computation, and full pipeline scenarios (NCERT textbook, legal contracts, Python codebase).

### 3. AI Semantic Profiler

**File**: `backend/app/services/ai_profiler.py` (NEW)
**What**: LLM-based corpus understanding -- not regex pattern matching but actual semantic understanding.
**Why**: Regex signals can tell you "this document has headings" but cannot tell you "this is an introductory physics textbook where concepts build on each other and students will ask explain/compare/solve questions." The AI profiler fills that gap.

**How it works**:
1. Collects all document texts from the project
2. Stratified sampling: buckets by document type and length, picks diverse representatives
3. Sends representative samples to LLM with a structured profiling prompt
4. Parses response into `ContentProfile` dataclass (domain, structure, relationships, query types, etc.)

**Cost**: ~$0.01-0.05 per analysis depending on corpus size and model.

### 4. AI Pipeline Selector

**File**: `backend/app/services/ai_pipeline_selector.py` (NEW)
**What**: Takes the ContentProfile + corpus fingerprint signals + catalog of ALL available nodes, and asks an LLM to pick the optimal pipeline.
**Why**: The rule-based recommender handles common patterns well but cannot reason about novel combinations or edge cases. The AI selector sees the semantic profile AND the structural signals AND knows every available technique -- it can make nuanced decisions like "this is a physics textbook with exercises, so use heading-based chunking for theory sections but sentence-window for problem sets."

**Returns**:
- 2-3+ techniques per stage (chunking, retrieval, reranking, embedding)
- Reasoning for each selection
- 5+ "why not" explanations for rejected alternatives
- Available nodes catalog: 8 chunking, 17 retrieval, 13 reranking, 8 embedding

### 5. Analysis Persistence

**What**: Added `analysis_result` (JSON) and `content_profile` (JSON) columns to the Project model.
**Why**: Analysis results were stored in React state only. Users lost everything on page refresh. This was the single most frustrating UX issue -- you wait 10 seconds for AI analysis, navigate away, come back, and it's gone.

Both `/analyze` and `/ai-analyze` endpoints now save results to the database. The frontend reads from the persisted data on page load.

### 6. React Flow Pipeline Visualization

**File**: `frontend/src/components/analysis/PipelineFlow.tsx` (NEW)
**What**: Interactive flow diagram showing the recommended pipeline.
**Why**: A wall of text listing "chunking: recursive, retrieval: hybrid, reranking: cross-encoder" is hard to understand. A visual flow diagram showing Your Data -> Chunking -> Retrieval -> Reranking -> Embedding -> RAG Ready with technique nodes hanging below each stage is instantly comprehensible.

**Implementation**:
- Custom React Flow node types: `StageNode` (with confidence bar) and `TechniqueNode` (with reasoning tooltip)
- Technique nodes hang below their parent stage
- Primary techniques visually distinct from augmentation techniques
- Confidence bars show how strong each recommendation is
- Clicking a technique shows its reasoning

### 7. Professional Light Theme

**What**: Switched from dark hacker theme to clean white SaaS design (Linear/Notion style).
**Why**: The dark theme looked impressive in screenshots but was hard to read for actual use. A clean light theme with proper typography, subtle shadows, and consistent spacing is more professional and usable.

**Design system**:
- Pages: `bg-gray-50`
- Cards: `bg-white`
- Borders: `border-gray-200`
- Shadows: `shadow-sm`
- Accent: `amber-600`
- Updated 18 files (all pages + components)

### 8. On-Demand Processing

**What**: Removed automatic background processing from uploads. Upload is now instant (just saves file). Text extraction happens on-demand at chunk time.
**Why**: The original flow uploaded a file, immediately started extracting text, and ran default chunking. This was wasteful because:
1. The user hasn't decided what chunking strategy to use yet
2. Default chunking would be thrown away when they pick a different strategy
3. Large files would block the upload response
4. Race condition: if user triggered chunking before background processing finished, the text wasn't available

On-demand extraction at chunk time (`POST /projects/{id}/chunk`) eliminates all these issues.

### 9. Build Pipeline Flow

**What**: Replaced "Apply All & Chunk" button with "Build Pipeline ->" which navigates to `/pipeline?projectId={id}` with the recommendation pre-loaded.
**Why**: The old button just chunked everything with the recommended config, which was a dead end. The new flow takes the recommendation and opens it in the visual pipeline builder where users can customize, test, and export.

### 10. Project-Based Architecture

**What**: Everything now flows through projects. Dashboard shows project overview with stats. Projects page has Active/Archived tabs.
**Why**: The original design had documents floating independently. A project groups related documents (e.g., "Company Knowledge Base" or "NCERT Physics Textbook") and carries the analysis results and pipeline configuration as a unit.

**Navigation simplified**: Projects | Pipeline Builder | Strategy Guide | Dashboard

### 11. Cleanup

**What**: Removed 48 stale files (~9,500 lines of cruft).
**Why**: Accumulated debug logs, test dumps, unused WebGL components, old uploads, and dead code. Removed redundant "Quick Analysis" / "Analyze Only" buttons and old corpus analysis display that duplicated the new project-based analysis.

---

## Key Technical Decisions

### Why dual analysis (regex + LLM)?
Rule-based analysis (regex) is fast (~100ms) and free but shallow -- it counts headings and code blocks but cannot understand that a document is a "physics textbook with exercises." LLM-based analysis understands semantics but costs tokens and takes 5-15 seconds. The best approach: use both. Regex for structural signals, LLM for semantic understanding. The pipeline recommender works with either.

### Why on-demand text extraction?
Background processing on upload was wasteful. If the user uploads 50 files but only analyzes them, we extracted text 50 times for nothing. On-demand extraction means text is extracted exactly once, exactly when needed (at chunk time).

### Why persist analysis results in the database?
Storing analysis results in React state only means users lose everything on page refresh. This was the number one UX complaint. Adding two JSON columns (`analysis_result`, `content_profile`) to the Project model costs nothing and solves it completely.

### Why JSON not JSONB?
SQLite (used for development) doesn't support JSONB. Using plain JSON works on both SQLite and PostgreSQL. The performance difference is negligible for our use case (we never query inside the JSON).

### Why robust LLM JSON parsing?
LLM responses often come wrapped in markdown fences (```json ... ```), have missing keys, or contain malformed output. Every LLM response parser strips fences with regex, uses `json.loads()` with fallback, and provides defaults for missing keys.

### Why LiteLLM for everything?
A single service (`llm_service`) handles all LLM calls. Swap providers (OpenAI, Anthropic, local) by changing environment variables. The query endpoint was originally hardcoded to OpenAI -- now it uses LiteLLM like everything else.

### Why `Uuid` not `postgresql.UUID`?
`sqlalchemy.dialects.postgresql.UUID` crashes on SQLite. `sqlalchemy.Uuid` is cross-database compatible.

---

## Research Findings

These research papers and industry reports directly influenced the pipeline recommender's scoring and strategy selection.

### 1. Recursive 512 is the benchmark king
**Source**: Vecta 2026 evaluation (50 academic papers)
**Finding**: Recursive chunking with 512-token chunks achieved 69% accuracy, the best of 7 strategies tested.
**Impact**: Recursive 512 is the default recommendation. Other strategies must demonstrate clear advantages for their specific use case to override it.

### 2. Semantic chunking is overrated
**Source**: Vectara NAACL 2025 (peer-reviewed)
**Finding**: Fixed-size chunking beats semantic chunking on ALL real (non-stitched) datasets. Semantic only wins on artificial datasets where different documents are concatenated.
**Impact**: Semantic chunking gets a low confidence score. It's only recommended when there are clear topic boundary signals AND the corpus is large enough to justify the embedding cost.

### 3. Contextual retrieval is the biggest single win
**Source**: Anthropic 2024 research
**Finding**: Full contextual retrieval stack (contextual embeddings + BM25 + reranking) reduces retrieval failures by 67%.
**Impact**: Contextual chunking + hybrid retrieval is the top recommendation for "accuracy" priority. The -67% figure is cited in the recommender's reasoning.

### 4. Multi-scale indexing gives 1-37% improvement
**Source**: AI21 2026
**Finding**: Indexing at 2-3 chunk sizes with Reciprocal Rank Fusion gives 1-37% improvement for minimal extra storage.
**Impact**: Multi-scale indexing is recommended as an augmentation when the query type is "mixed" (both factoid and analytical).

### 5. Hierarchical chunking for structured documents
**Source**: HiChunk EMNLP 2025
**Finding**: 81 vs 74 evidence recall compared to flat chunking on structured documents.
**Impact**: Heading-based chunking + parent-child retrieval is recommended for documents with `heading_density > 0.1`.

### 6. AST code chunking
**Source**: cAST EMNLP 2025
**Finding**: +4.3 Recall@5 on code repositories compared to naive splitting.
**Impact**: Code-aware chunking is recommended when `code_ratio > 0.3`.

### 7. ChunkScope fills an open research gap
**Finding**: No existing tool does corpus-aware automatic RAG configuration.
- AutoRAG (2024): brute-forces all combinations, doesn't analyze the corpus
- DSPy: optimizes prompts, not infrastructure
- RAGAs: evaluates only, doesn't recommend
- ChunkScope: analyzes corpus -> recommends pipeline -> lets you build it

### 8. The 80% rule
**Source**: kapa.ai (from 100+ production RAG teams)
**Finding**: "80% of RAG failures trace back to ingestion and chunking, not the LLM."
**Impact**: This validates ChunkScope's entire thesis -- getting chunking right matters more than model selection.

### 9. Chunk size is query-dependent
**Source**: AI21 2026
**Finding**: No single chunk size works for all query types. Multi-scale indexing with RRF gives 1-37% improvement.
**Impact**: The recommender considers query type when selecting chunk size. Factoid queries get smaller chunks (256-512), analytical queries get larger (512-1024).

### 10. Overlap sweet spot: 10-15%
**Source**: NVIDIA FinanceBench evaluation
**Finding**: 15% overlap was optimal with 1024-token chunks.
**Impact**: Default overlap is set to 10-15% of chunk size.

---

## Bugs Found and Fixed

### 1. SQLite missing columns crash
**Symptom**: Server crashed on startup because `analysis_result` and `content_profile` columns didn't exist.
**Cause**: Alembic migration added columns for PostgreSQL but SQLite doesn't support `ALTER TABLE ADD COLUMN` through Alembic the same way.
**Fix**: Added columns manually via `ALTER TABLE` and added SQLite dialect guard in migrations.

### 2. ZeroDivisionError in stratified sampling
**Symptom**: AI profiler crashed when analyzing projects with 20+ document types.
**Cause**: `_SAMPLES_PER_BUCKET` calculation divided by number of buckets, which could produce 0 samples per bucket.
**Fix**: Added `max(1, ...)` floor to ensure at least 1 sample per bucket.

### 3. LLM failure returns opaque 500
**Symptom**: When LiteLLM was misconfigured, users saw "Internal Server Error" with no useful information.
**Cause**: LLM exceptions weren't caught at the endpoint level.
**Fix**: Wrapped LLM calls in try/except at the endpoint level, returning 400 with a descriptive message: "AI profiling failed: LLM service unavailable or returned invalid response."

### 4. Alembic migrations Postgres-only
**Symptom**: `alembic upgrade head` crashed on SQLite with "type JSONB is not supported."
**Cause**: Migration files used PostgreSQL-specific types.
**Fix**: Added dialect guard: `if context.get_dialect().name == 'sqlite': return`.

### 5. postgresql.UUID import crash
**Symptom**: `from sqlalchemy.dialects.postgresql import UUID` crashed on SQLite.
**Cause**: Direct import of PostgreSQL dialect types fails when PostgreSQL driver isn't installed.
**Fix**: Replaced with cross-database `sqlalchemy.Uuid` type.

### 6. Fragile JSON fence stripping
**Symptom**: LLM responses wrapped in ```json ... ``` caused JSON parse failures.
**Cause**: Simple string stripping (`response.strip('`')`) didn't handle all fence variations.
**Fix**: Robust regex: `re.sub(r'^```(?:json)?\s*\n?', '', text).rstrip('`').strip()`

### 7. Query endpoint hardcoded OpenAI
**Symptom**: Query endpoint failed when using non-OpenAI LLM providers.
**Cause**: Embedding call was `openai.embeddings.create(...)` instead of using `llm_service`.
**Fix**: Replaced with `await llm_service.embed([request.query])`.

### 8. Race condition: files not processed when chunking
**Symptom**: Chunking returned empty results for recently uploaded files.
**Cause**: Upload triggered background text extraction, but chunking could start before extraction finished.
**Fix**: Removed background processing. Text extraction now happens on-demand within the chunking endpoint. If `doc.extracted_text` is empty, extract first, then chunk.

### 9. Dead code inside save_file()
**Symptom**: `document_service.save_file()` contained inline file deletion logic that was never called correctly.
**Cause**: Deletion code was embedded inside the save function instead of being a separate method.
**Fix**: Extracted to proper `delete_file()` method.

---

## What We Learned

### Engineering Learnings

**Rule-based + LLM is better than either alone.**
Regex analysis is fast (~100ms) and free but cannot understand semantics. LLM analysis understands meaning but costs tokens and is slow. Use regex for structural signals (heading counts, code ratios), LLM for semantic understanding (domain classification, relationship types). The pipeline recommender accepts signals from either source.

**On-demand beats eager processing.**
Background processing on upload is wasteful if the user hasn't decided what to do yet. Files should be saved instantly; processing should happen when the user explicitly requests it. This also eliminates race conditions.

**Persist everything that takes time to compute.**
Analysis results MUST be stored in the database. Storing in React state means users lose everything on page refresh. Two JSON columns on the Project model cost zero performance and save enormous frustration.

**Abstract database differences at the ORM level.**
SQLite and PostgreSQL need careful abstraction. Use `JSON` not `JSONB`, `Uuid` not `postgresql.UUID`, and guard Alembic migrations with dialect checks. Test both databases or you will ship PostgreSQL-only code by accident.

**LLM JSON responses are unreliable.**
Always handle markdown fences, missing keys, and malformed output. Every LLM response parser needs: fence stripping, `json.loads()` with fallback, and default values for missing keys. Never trust raw LLM output.

**The "80% rule" is real.**
Most RAG quality issues come from chunking and ingestion, not the LLM. Getting the right chunking strategy and chunk size matters as much as, or more than, the choice of embedding model or LLM.

### RAG/ML Learnings

**Semantic chunking is not worth the cost for most real documents.**
Vectara's NAACL 2025 paper (peer-reviewed) shows fixed-size chunking beats semantic on all real datasets. Semantic only wins on artificial stitched datasets. Use recursive or fixed-size as the default. Semantic is an expensive niche tool.

**Recursive 512 tokens with 10-15% overlap is the universally safe default.**
Vecta 2026 tested 7 strategies on 50 academic papers. Recursive 512 won at 69% accuracy. When in doubt, use this.

**Contextual retrieval is the single highest-ROI improvement.**
Anthropic's 2024 research shows -67% retrieval failures with the full stack (contextual embeddings + BM25 + reranking). This is the biggest single improvement you can make to a RAG system.

**Multi-scale indexing is underrated.**
AI21 2026 shows indexing at 2-3 chunk sizes with RRF fusion gives 1-37% improvement for minimal extra storage. The cost is just 2-3x storage. The benefit scales with query diversity.

**Hierarchical chunking + parent-child retrieval is the best for structured documents.**
HiChunk 2025 shows 81 vs 74 evidence recall. For textbooks, documentation, and legal documents with clear heading structure, this combination significantly outperforms flat chunking.

**The choice of chunking strategy matters as much as the choice of embedding model.**
Teams spend weeks evaluating embedding models but pick chunking strategies arbitrarily. The research shows chunking strategy has equal or greater impact on retrieval quality.

**No existing tool does what ChunkScope does.**
Corpus-aware automatic RAG configuration is an open research gap. AutoRAG brute-forces all combinations (expensive, slow). DSPy optimizes prompts, not infrastructure. RAGAs evaluates but doesn't recommend. ChunkScope analyzes the corpus, recommends a pipeline, and lets you build it visually.

---

## Test Coverage

### New Tests (83 total)

**`tests/test_fingerprinting.py`** (50 tests)
- Individual signal tests for all 20 content signals
- Document type scenarios: code, textbook, legal, FAQ, general
- Edge cases: empty text, very short text, unicode content
- Signal combination tests: documents with mixed characteristics

**`tests/test_pipeline_recommender.py`** (33 tests)
- Technique selection per category (chunking, retrieval, reranking, embedding)
- Confidence computation accuracy
- Full pipeline scenarios:
  - NCERT physics textbook (hierarchical + parent-child + cross-encoder)
  - Legal contracts (paragraph + hybrid + BM25 + reranking)
  - Python codebase (code-aware + metadata filter + BGE)
- "Why not" explanation generation
- Priority/budget parameter effects
- Edge cases: empty signals, unknown doc types

### Pre-existing Tests
- `test_chunking_methods.py` -- All 8 chunking strategies
- `test_suggestions.py` -- Suggestion engine
- `test_code_generator.py` -- Code export
- `test_cost_calculator.py` -- Cost estimation
- `test_retrievers.py` -- Retrieval strategies
- `test_rerankers.py` -- Reranking strategies
- `test_strategy_guide.py` -- Strategy knowledge base
- `tests/api/` -- API integration tests (require running DB)

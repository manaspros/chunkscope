# ChunkScope API Reference

Base URL: `http://localhost:8000`
Interactive docs: `http://localhost:8000/api/docs`

## Project Endpoints

The primary entry point for the application. All document management, analysis, and chunking flows through projects.

### CRUD

- `POST /api/v1/projects` - Create project
  - Body: `{ "name": "...", "description": "..." }`
  - Returns: ProjectResponse

- `GET /api/v1/projects` - List projects
  - Query: `?status=active` or `?status=archived`
  - Returns: ProjectListResponse

- `GET /api/v1/projects/{id}` - Get project with file list
  - Returns: ProjectDetailResponse (includes files array)

- `PATCH /api/v1/projects/{id}` - Update project
  - Body: `{ "name": "...", "description": "...", "status": "active|archived" }`

- `DELETE /api/v1/projects/{id}` - Delete project and all its documents

### File Upload

- `POST /api/v1/projects/{id}/upload` - Upload single file
  - Form: `file` (multipart)
  - Supported: PDF, TXT, MD, DOCX, HTML, CSV, JSON, XML, YAML, code files
  - Upload is instant (no background processing; text extracted on-demand at chunk time)

- `POST /api/v1/projects/{id}/upload-zip` - Upload and extract ZIP
  - Form: `file` (multipart, .zip only)
  - Extracts all supported file types from the archive

- `POST /api/v1/projects/{id}/upload-folder` - Upload multiple files
  - Form: `files` (multipart, multiple)
  - Skips files that fail validation, returns count of successful uploads

- `DELETE /api/v1/projects/{id}/files/{file_id}` - Remove file from project

### Analysis

Three analysis modes with increasing depth and cost:

- `POST /api/v1/projects/{id}/analyze` - **Rule-based corpus analysis**
  - Cost: $0.00 | Speed: <1s
  - Runs document analyzer (20 regex content signals) on all files
  - Feeds merged signals into pipeline recommender (rule-based)
  - Persists result to `project.analysis_result`
  - Returns: corpus summary, recommendation, confidence, reasoning, pipeline recommendation, per-file results

- `POST /api/v1/projects/{id}/smart-analyze` - **Focused pipeline recommendation**
  - Query: `?priority=accuracy&budget=moderate`
  - Cost: $0.00 | Speed: <1s
  - Computes content signals and feeds directly into pipeline recommender
  - Priority options: `accuracy`, `speed`, `cost`
  - Budget options: `low`, `moderate`, `high`
  - Returns: corpus fingerprint, doc type, corpus size, full recommendation with techniques per stage

- `POST /api/v1/projects/{id}/ai-analyze` - **AI-powered analysis**
  - Query: `?model=gpt-4o-mini`
  - Cost: ~$0.01-0.05 | Speed: 5-15s
  - Step 1: Computes content signals (regex)
  - Step 2: AI Profiler (LLM) -- stratified sampling + semantic understanding -> ContentProfile
  - Step 3: AI Pipeline Selector (LLM) -- picks optimal pipeline from all available nodes
  - Persists result to `project.analysis_result` and `project.content_profile`
  - Returns: corpus fingerprint, content profile, doc type, corpus size, recommendation with reasoning and "why not" explanations

### Chunking

- `POST /api/v1/projects/{id}/chunk` - **On-demand chunking**
  - Body: `{ "chunking_method": "recursive", "chunk_size": 512, "overlap": 50 }`
  - Extracts text on-demand if not already done (no background processing needed)
  - Removes existing chunks before re-chunking
  - Returns: total chunks, config used, per-file results

- `GET /api/v1/projects/{id}/chunks` - **Get all chunks** (paginated)
  - Query: `?page=1&per_page=50`
  - Returns: items (with filename, text, index, token count), total, page, per_page

## Query

- `POST /api/v1/query/` - Execute retrieval query
  - Uses LiteLLM for query embedding (not hardcoded to OpenAI)
  - Body:
    ```json
    {
      "query": "What is...",
      "retrieval_method": "hybrid|mmr|parent_document|keyword|dense",
      "augmentation_method": "multi_query|hyde|expansion",
      "top_k": 5,
      "document_id": "optional-uuid",
      "alpha": 0.5,
      "lambda_mult": 0.5,
      "fetch_k": 20,
      "num_variants": 3
    }
    ```
  - Returns: query, results (chunks with scores), retrieval method, total results

## Standalone Analysis

These endpoints work without projects (upload files directly).

- `POST /api/v1/analyze` - Analyze single document
  - Form: `file` (multipart)
  - Saves document, runs analysis, includes pipeline recommendation
  - Returns: AnalysisResponse (document_id, document_type, structure, density, recommended_config, confidence, reasoning, pipeline_recommendation)

- `POST /api/v1/analyze/corpus` - Analyze multiple files as corpus
  - Form: `files` (multipart, multiple)
  - Returns: CorpusAnalysisResponse (corpus_summary, corpus_recommendation, confidence, reasoning, per-file results)

## Core Endpoints (Unchanged)

### Health
- `GET /api/v1/health` - Health check
- `GET /api/v1/health/ready` - Readiness check (includes DB)

### Pipelines
- `POST /api/v1/pipelines` - Create pipeline
- `GET /api/v1/pipelines` - List pipelines
- `GET /api/v1/pipelines/{id}` - Get pipeline
- `PATCH /api/v1/pipelines/{id}` - Update pipeline
- `DELETE /api/v1/pipelines/{id}` - Delete pipeline
- `POST /api/v1/pipelines/{id}/execute` - Execute pipeline

### Documents
- `POST /api/v1/documents/upload` - Upload document (PDF/TXT/MD)
- `GET /api/v1/documents` - List documents
- `GET /api/v1/documents/{id}` - Get document
- `GET /api/v1/documents/{id}/content` - Get extracted text
- `DELETE /api/v1/documents/{id}` - Delete document

### AI Suggestions
- `POST /api/v1/suggest/profile` - Profile a document `{text: "..."}`
- `POST /api/v1/suggest/recommend` - Get recommendations `{text: "..."}`
- `POST /api/v1/suggest/explain` - Get LLM explanation for recommendation

### Evaluation
- `POST /api/v1/evaluate/run` - Run evaluation `{question, answer, context_chunks, ground_truth?}`
- `POST /api/v1/evaluate/run/batch` - Batch evaluation
- `POST /api/v1/evaluate/chunk-quality` - Score chunk quality
- `GET /api/v1/evaluate/metrics` - List available metrics

### Embedding Registry
- `GET /api/v1/embeddings/models` - List all 8 models with metadata
- `GET /api/v1/embeddings/models/{id}` - Get model details
- `POST /api/v1/embeddings/recommend` - Recommend model for doc type
- `POST /api/v1/embeddings/compare` - Compare models side-by-side

### Code Export
- `POST /api/v1/export/code` - Generate Python project files as JSON
- `POST /api/v1/export/download` - Generate as ZIP download
- `POST /api/v1/export/docker` - Generate Docker files only

### Cost Calculator
- `POST /api/v1/cost/estimate-ingestion` - Estimate ingestion costs
- `POST /api/v1/cost/estimate-query` - Estimate per-query costs
- `POST /api/v1/cost/compare` - Compare costs across configs
- `GET /api/v1/cost/pricing` - Get pricing data

### Strategy Guide
- `GET /api/v1/guide/strategies` - All 39 strategies with full info
- `GET /api/v1/guide/strategies/{id}` - Single strategy details
- `GET /api/v1/guide/strategies/{id}/pairs` - Compatible strategies
- `GET /api/v1/guide/compare?ids=x,y,z` - Compare strategies
- `POST /api/v1/guide/recommend` - Pipeline recommendation
- `GET /api/v1/guide/decision-tree/{category}` - Decision trees

### Chunks
- `POST /api/v1/chunks/visualize` - Visualize chunking
- `GET /api/v1/chunks/document/{id}` - Get chunks for document
- `GET /api/v1/chunks/{id}` - Get single chunk
- `GET /api/v1/chunks/search/similar` - Similarity search

### Presets
- `GET /api/v1/presets` - List industry presets
- `GET /api/v1/presets/{id}` - Get preset
- `POST /api/v1/presets/{id}/apply` - Apply preset to create pipeline
- `POST /api/v1/presets/initialize` - Load built-in presets

### Other
- `POST /api/v1/rerank/` - Rerank documents
- `POST /api/v1/preview/chunking` - Preview chunking config
- `GET /api/v1/config/validation-rules` - Pipeline validation rules
- `GET /api/v1/config/available-models` - Available models

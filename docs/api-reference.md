# ChunkScope API Reference

Base URL: `http://localhost:8000`
Interactive docs: `http://localhost:8000/api/docs`

## Core Endpoints

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
- `POST /api/v1/query/` - Execute query against pipeline
- `POST /api/v1/analyze` - Analyze document
- `POST /api/v1/preview/chunking` - Preview chunking config
- `POST /api/v1/rerank/` - Rerank documents

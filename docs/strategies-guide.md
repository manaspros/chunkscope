# ChunkScope Strategy Guide

## Quick Decision Matrix

### Which Chunking Strategy?

| Document Type | Recommended | Chunk Size | Overlap | Why |
|--------------|-------------|------------|---------|-----|
| Legal contracts | Semantic | 400-600 | 15% | Dense clause-heavy text needs topic-boundary splitting |
| Medical/scientific | Heading-based | 500-700 | 15% | Structured sections (Abstract, Methods, Results) |
| Code/technical docs | Code-aware | 500-800 | 10% | Must preserve code block integrity |
| Academic papers | Heading-based | 500-700 | 15% | Section structure matters |
| Financial reports | Semantic | 300-500 | 25% | Tables + dense numbers need high overlap |
| General/mixed | Recursive | 500 | 50 tokens | Best general-purpose default |
| Short docs (<5 pages) | Fixed | Full doc | 0 | No need to chunk small docs |

### Which Retrieval Strategy?

| Scenario | Recommended | Why |
|----------|-------------|-----|
| Default / starting point | Hybrid | Dense + BM25 catches both semantic and keyword matches |
| Ambiguous queries | Multi-Query | LLM generates clearer variants |
| Factoid questions | HyDE | Hypothetical answer is in the same semantic space as docs |
| Multi-faceted questions | Sub-Query | Breaks complex question into parts |
| High-stakes / accuracy-critical | Corrective RAG | Self-corrects bad retrievals |
| Large corpus (1000+ docs) | Document Summary + Hybrid | Two-stage: narrow by doc, then by chunk |
| Rich metadata available | Self-Query | LLM auto-generates metadata filters |
| Evolving knowledge base | Time-Weighted | Boosts recent documents |
| Need maximum recall | Ensemble | Multiple retrievers in parallel |

### Which Reranker?

| Scenario | Recommended | Why |
|----------|-------------|-----|
| Default / good tradeoff | Cross-Encoder | Best accuracy/speed balance |
| Production / high throughput | Cascade | Fast filter then precise rerank |
| Budget-conscious | FlashRank or BGE | Free, local, fast |
| Maximum quality | Listwise LLM | RankGPT-style, highest accuracy |
| Redundant results | Diversity | MMR reduces similar chunks |
| Always (as final step) | Lost-in-Middle | Free accuracy boost for LLM attention |

### Which Embedding Model?

| Constraint | Recommended | Dims | Cost/1M |
|-----------|-------------|------|---------|
| Best free/local | all-MiniLM-L6-v2 | 384 | $0 |
| Best cheap API | Jina embeddings-v3 | 1024 | $0.018 |
| Best cost/accuracy | Voyage voyage-3-large | 2048 | $0.06 |
| Best overall API | text-embedding-3-large | 3072 | $0.13 |
| 128K context / multimodal | Cohere embed-v4 | 1536 | $0.10 |
| Self-hosted, multi-purpose | BGE-M3 | 1024 | $0 |

## Recommended Pipelines

### "Just Works" Pipeline (Best Default)
```
Document -> Recursive Chunking (512, 50 overlap)
         -> text-embedding-3-small
         -> Hybrid Retrieval (top_k=5)
         -> Cross-Encoder Rerank (top_n=3)
         -> Lost-in-Middle Reorder
         -> GPT-4o-mini Generation
```
Cost: ~$0.003/query. Latency: ~1.5s. Good for most use cases.

### "Maximum Accuracy" Pipeline
```
Document -> Semantic Chunking (400, 15% overlap)
         -> Contextual Preamble (LLM enrichment)
         -> voyage-3-large embedding
         -> Corrective RAG (hybrid + self-correction)
         -> Cascade Rerank (FlashRank -> Cross-Encoder)
         -> Lost-in-Middle Reorder
         -> GPT-4o Generation
```
Cost: ~$0.02/query. Latency: ~3s. Best for high-stakes applications.

### "Budget" Pipeline
```
Document -> Recursive Chunking (512, 50 overlap)
         -> all-MiniLM-L6-v2 (free, local)
         -> Dense Retrieval (top_k=5)
         -> FlashRank Rerank (free, CPU)
         -> GPT-4o-mini Generation
```
Cost: ~$0.0005/query. Latency: ~1s. Good for prototyping.

### "Speed" Pipeline
```
Document -> Fixed Size Chunking (256, 0 overlap)
         -> all-MiniLM-L6-v2 (local)
         -> Dense Retrieval (top_k=3)
         -> No Reranker
         -> GPT-4o-mini Generation
```
Cost: ~$0.0003/query. Latency: ~500ms. When speed matters most.

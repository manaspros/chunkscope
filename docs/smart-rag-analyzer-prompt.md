# Smart RAG Pipeline Analyzer - Design & Implementation Prompt

> **How to use this prompt**: Give this entire document to Claude Code in a new conversation. It will launch research subagents, design the architecture, and implement everything.

## Instructions for Claude

Before implementing ANYTHING, you MUST do deep research first. Launch these subagents IN PARALLEL:

### Research Agent 1: RAG Pipeline Auto-Configuration
```
Search the web for: AutoRAG, automatic RAG pipeline optimization, corpus-aware RAG configuration.
Find: How AutoRAG (autorag-ai/autorag) works, what it analyzes, how it picks strategies.
Find: DSPy pipeline optimization for RAG. How MIPRO/BootstrapFewShot optimizes retrieval.
Find: Any research papers on "automatic RAG configuration selection" or "corpus-adaptive retrieval".
Find: How Unstructured.io's partition() auto-detects document structure.
Find: Vectara's research on how chunking strategy affects RAG quality (specific percentages).
Report: concrete algorithms, not vague descriptions. Include paper names and GitHub repos.
```

### Research Agent 2: Document-Type-Specific RAG Strategies
```
Search the web for: best RAG strategies for educational content (textbooks), legal documents, codebases, financial reports.
Find: Research on hierarchical chunking vs flat chunking performance differences (with numbers).
Find: When Graph RAG helps vs hurts (what corpus characteristics make it beneficial).
Find: When HyDE helps vs hurts (what query types benefit).
Find: Parent-child retrieval benchmarks vs standard retrieval.
Find: Educational/textbook RAG systems (any published work on NCERT, Khan Academy, Coursera RAG).
Report: specific benchmark numbers, not opinions. "X% improvement on Y benchmark".
```

### Research Agent 3: Multi-Strategy RAG Pipelines
```
Search the web for: combining multiple RAG techniques, RAG pipeline composition, multi-strategy retrieval.
Find: How to combine hybrid search + query decomposition + reranking effectively.
Find: Research on cascade retrieval (coarse-to-fine) performance vs single-stage.
Find: How Anthropic's contextual retrieval combines with other techniques.
Find: ColBERT + BM25 + dense vector combination approaches.
Find: Production RAG architectures from companies (Notion, Stripe, Databricks RAG setups).
Report: architecture diagrams, technique combinations that work together, and which clash.
```

After ALL three agents return, synthesize their findings and THEN proceed with the design below. Update the technique selection rules with any new research findings.

---

## What We Are Building

A system that takes ANY uploaded corpus (files, folders, ZIPs) and automatically determines the exact combination of RAG techniques that will produce the best results for THAT specific data. Not generic recommendations - precise, evidence-based pipeline configuration.

**Project**: ChunkScope at /home/manas/Code/ai/chunkscope
**Existing code**: Read CLAUDE.md and docs/architecture.md for full context.
**Key files to read before coding**:
- `backend/app/services/document_analyzer.py` - current analysis (has _compute_content_signals and _recommend_from_signals)
- `backend/app/services/decision_engine.py` - current recommendation engine
- `backend/app/services/strategy_guide.py` - 39 strategy entries with metadata
- `backend/app/api/v1/projects.py` - project analyze endpoint
- `frontend/src/app/projects/[id]/page.tsx` - project detail page (the main hub)

## The Problem

Current RAG tools make you guess: "Try 512 token chunks with cosine similarity." That is like a doctor prescribing medicine without diagnosis. Every corpus has a fingerprint - its structure, density, relationships, vocabulary, and query patterns determine which RAG techniques work. An NCERT textbook needs completely different treatment than a legal contract or a codebase.

## The Vision

```
User uploads folder of NCERT Physics textbooks
                    |
    +-----------------------------------+
    |      CORPUS FINGERPRINTING        |
    |                                   |
    |  Structural Analysis:             |
    |  - Hierarchical chapters/sections |
    |  - Formulas and equations present |
    |  - Diagrams referenced in text    |
    |  - Numbered examples/problems     |
    |  - Cross-references between       |
    |    chapters ("as seen in Ch.3")   |
    |                                   |
    |  Content Analysis:                |
    |  - Educational/explanatory tone   |
    |  - Progressive concept building   |
    |  - Mixed: theory + problems       |
    |  - Domain: Physics                |
    |                                   |
    |  Relationship Analysis:           |
    |  - Concepts build on each other   |
    |  - Formulas reference variables   |
    |    defined elsewhere              |
    |  - Examples reference theory      |
    +-----------------------------------+
                    |
    +-----------------------------------+
    |      TECHNIQUE SELECTION          |
    |                                   |
    |  Chunking: RECOMMENDED            |
    |  - Primary: Hierarchical          |
    |    (Chapter -> Section -> Para)   |
    |  - + Parent-Child linking         |
    |    (small chunks for retrieval,   |
    |     section-level for context)    |
    |  - + Summary augmentation         |
    |    (LLM summary per section       |
    |     for thematic search)          |
    |                                   |
    |  WHY: Textbooks have natural      |
    |  hierarchy. Concepts in S3.2      |
    |  need S3.1 context. Parent-child  |
    |  gives precise retrieval +        |
    |  broad context. Summaries help    |
    |  "explain Newton's 3rd law"       |
    |  queries find the right section.  |
    |                                   |
    |  Retrieval: RECOMMENDED           |
    |  - Hybrid (Dense + BM25)          |
    |    (formulas need keyword match,  |
    |     concepts need semantic)       |
    |  - + Query Decomposition          |
    |    ("compare Newton's laws"       |
    |     -> 3 sub-queries)             |
    |  - + HyDE for conceptual Qs      |
    |    ("what causes friction?"       |
    |     -> hypothetical answer        |
    |     -> better embedding match)    |
    |                                   |
    |  Reranking: RECOMMENDED           |
    |  - Cross-Encoder (precision)      |
    |  - + MMR (diversity - do not      |
    |    return 5 similar paragraphs)   |
    |  - + Lost-in-Middle reorder       |
    |                                   |
    |  WHY NOT Graph RAG:               |
    |  Graph RAG shines for entity-     |
    |  relationship heavy docs (company |
    |  reports, knowledge bases). For   |
    |  textbooks, hierarchical +        |
    |  parent-child captures the        |
    |  structure better at lower cost.  |
    +-----------------------------------+
                    |
    User sees: "Here is your optimal pipeline"
    with confidence scores and reasoning
    for each technique chosen
```

## The Two-Phase Analysis System

### Phase 1: Corpus Fingerprinting (Zero LLM Tokens)

Fast, deterministic analysis of the uploaded corpus. Runs on EVERY upload.

#### 1.1 Structural Signals (from text parsing)

| Signal | How to Detect | What It Tells Us |
|--------|---------------|------------------|
| heading_density | Lines starting with #, ALL CAPS | Document has sections - heading-based chunking |
| heading_depth | Count of #, ##, ###, #### | Hierarchy depth - parent-child beneficial |
| code_ratio | def, class, function, import, triple-backtick | Code content - code-aware chunking |
| table_ratio | Pipe-delimited lines, table tags | Structured data - preserve table boundaries |
| list_ratio | Lines starting with -, bullet, 1., a) | Enumerated content - list-aware chunking |
| formula_ratio | Dollar-sign delimiters, LaTeX commands | Math content - preserve formula boundaries |
| cross_ref_ratio | "see section", "as in chapter", "ref" | Inter-document references - Graph RAG signal |
| avg_sentence_length | Words per sentence | Dense text - smaller chunks, semantic chunking |
| avg_paragraph_length | Sentences per paragraph | Short paras - sentence window, Long - semantic |
| vocabulary_diversity | Unique words / total words | Technical density - domain embeddings helpful |
| named_entity_density | Count of capitalized multi-word phrases | Entity-rich - Graph RAG beneficial |
| question_density | Lines ending with ? | FAQ/QA content - sentence window |
| dialogue_ratio | Lines with quotes, "said", speaker: | Conversational - preserve dialogue turns |

#### 1.2 Content Classification (Keyword + Local ML, No API)

| Document Type | Detection Keywords/Patterns |
|---------------|----------------------------|
| Legal | whereas, hereinafter, jurisdiction, clause, section, agreement |
| Medical | diagnosis, patient, treatment, symptoms, clinical |
| Academic | abstract, methodology, hypothesis, references, findings |
| Educational | chapter, exercise, example, definition, theorem, explain |
| Financial | revenue, EBITDA, quarterly, fiscal, shareholders |
| Code/Technical | API, endpoint, function, parameter, configuration, install |
| Conversational | Q:, A:, FAQ, support, ticket, how do I |
| General | None of the above dominant |

#### 1.3 Relationship Analysis (Text Pattern Detection)

| Signal | Detection | Implication |
|--------|-----------|-------------|
| forward_references | "we will see in", "later in" | Content builds progressively |
| back_references | "as mentioned", "recall that", "from" | Content references prior knowledge |
| entity_co_occurrence | Same entities across multiple chunks | Graph RAG beneficial |
| concept_hierarchy | Definition then Example then Problem pattern | Hierarchical chunking beneficial |
| causal_chains | "because", "therefore", "leads to" | Multi-hop retrieval needed |
| comparison_patterns | "vs", "compared to", "unlike" | Query decomposition helpful |

### Phase 2: Technique Mapping (Rule Engine + Optional LLM)

Maps the corpus fingerprint to specific RAG techniques. This is a decision engine, not guesswork.

#### 2.1 Chunking Selection Rules

```
select_chunking(signals):
    techniques = []
    reasoning = []
    
    # PRIMARY METHOD
    if signals.code_ratio > 0.3:
        techniques.append("code_aware")
        reasoning.append("Code-heavy content - preserving function/class boundaries")
        
    elif signals.heading_depth >= 3 and signals.avg_paragraph_length > 3:
        techniques.append("hierarchical")
        reasoning.append("Deep heading structure with substantial sections")
        
    elif signals.heading_density > 0.03:
        techniques.append("heading_based")
        reasoning.append("Clear heading structure for section-level chunking")
        
    elif signals.avg_sentence_length > 25:
        techniques.append("semantic")
        reasoning.append("Dense text needs topic-boundary detection")
        
    elif signals.question_density > 0.05:
        techniques.append("sentence_window")
        reasoning.append("QA/FAQ content - sentence-level retrieval with context window")
        
    else:
        techniques.append("recursive")
        reasoning.append("Mixed content - recursive as balanced default")
    
    # AUGMENTATIONS (can stack on top of primary)
    if signals.heading_depth >= 2:
        techniques.append("parent_child")
        reasoning.append("Hierarchical structure benefits from small-chunk retrieval + parent-context")
    
    if signals.cross_ref_ratio > 0.02 or signals.entity_co_occurrence > 0.1:
        techniques.append("summary_augmented")
        reasoning.append("Cross-references detected - section summaries aid thematic search")
    
    if signals.formula_ratio > 0.01:
        techniques.append("formula_preserving")
        reasoning.append("Mathematical content - formulas kept intact as atomic chunks")
    
    return techniques, reasoning
```

#### 2.2 Retrieval Selection Rules

```
select_retrieval(signals, corpus_size):
    strategies = []
    reasoning = []
    
    # BASE STRATEGY
    if corpus_size == "small" and signals.vocabulary_diversity > 0.7:
        strategies.append("dense")
        reasoning.append("Small corpus with diverse vocabulary - dense search sufficient")
    else:
        strategies.append("hybrid")
        reasoning.append("Hybrid catches both semantic and keyword matches")
    
    # AUGMENTATIONS
    if signals.formula_ratio > 0.01 or signals.table_ratio > 0.1:
        strategies.append("bm25_boost")
        reasoning.append("Formulas/tables need exact keyword matching alongside semantic")
    
    if signals.comparison_patterns > 0.02:
        strategies.append("query_decomposition")
        reasoning.append("Comparison patterns detected - complex queries benefit from decomposition")
    
    if signals.avg_sentence_length > 20 and signals.doc_type in ["educational", "academic"]:
        strategies.append("hyde")
        reasoning.append("Conceptual content - hypothetical answers bridge query-document gap")
    
    if signals.cross_ref_ratio > 0.05 and signals.named_entity_density > 0.03:
        strategies.append("graph_rag")
        reasoning.append("High cross-references + entity density - entity graph aids multi-hop reasoning")
    elif signals.cross_ref_ratio > 0.02:
        strategies.append("multi_hop")
        reasoning.append("Moderate cross-references - iterative retrieval for connected information")
    
    if signals.heading_depth >= 2:
        strategies.append("metadata_filtering")
        reasoning.append("Section structure enables metadata-based filtering")
    
    if corpus_size == "large":
        strategies.append("document_summary_index")
        reasoning.append("Large corpus benefits from two-stage retrieval")
    
    return strategies, reasoning
```

#### 2.3 Reranking Selection Rules

```
select_reranking(signals, priority):
    strategies = []
    reasoning = []
    
    # Primary reranker based on priority
    if priority == "accuracy":
        strategies.append("cross_encoder")
        reasoning.append("Cross-encoder provides highest accuracy reranking")
    elif priority == "speed":
        strategies.append("flashrank")
        reasoning.append("FlashRank provides fast CPU-only reranking")
    else:
        strategies.append("bge")
        reasoning.append("BGE reranker balances quality and speed")
    
    # DIVERSITY (almost always beneficial for structured docs)
    if signals.heading_density > 0.02:
        strategies.append("mmr_diversity")
        reasoning.append("Structured content risks returning similar passages - MMR ensures diversity")
    
    # ALWAYS as final step
    strategies.append("lost_in_middle")
    reasoning.append("Reorder for LLM attention patterns - free accuracy boost")
    
    # CASCADE for large corpora
    if priority != "speed" and signals.total_words > 50000:
        strategies = ["cascade(flashrank->cross_encoder)"] + strategies[1:]
        reasoning[0] = "Large corpus benefits from fast pre-filter + precise reranking"
    
    return strategies, reasoning
```

#### 2.4 Embedding Selection Rules

```
select_embedding(signals, budget, has_gpu):
    if budget == "free":
        if has_gpu:
            return "bge-m3", "Free, GPU-accelerated, supports dense+sparse+ColBERT"
        else:
            return "all-MiniLM-L6-v2", "Free, fast, CPU-friendly, good for prototyping"
    
    if signals.code_ratio > 0.2:
        return "jina-embeddings-v3", "Optimized for code search ($0.018/1M)"
    
    if signals.doc_type == "legal" or signals.avg_sentence_length > 25:
        return "voyage-3-large", "Best cost/accuracy for dense/legal text ($0.06/1M)"
    
    if signals.total_words > 500000:
        return "text-embedding-3-small", "Cost-effective at scale ($0.02/1M)"
    
    return "text-embedding-3-small", "Best general-purpose default"
```

### Phase 3: Confidence Scoring

Each recommendation gets a confidence score:

```
Confidence = (
    signal_strength * 0.4 +    # How clearly signals point to this technique
    research_backing * 0.3 +   # How much research supports this for similar docs
    technique_maturity * 0.3   # How battle-tested the technique is
)

HIGH (>0.8):  Strong signal match + well-researched + mature
MEDIUM (0.5-0.8): Moderate signals, reasonable choice
LOW (<0.5): Weak signals, speculative recommendation
```

### Phase 4: Optional LLM Explanation (On-Demand, single call)

Only called when user clicks "Explain in detail":

```
Prompt: Given this corpus fingerprint and technique recommendations,
explain in plain language WHY each technique was chosen and how they
work together. Be specific about the data characteristics.

Corpus: {fingerprint_summary}
Recommendations: {technique_list_with_reasoning}
```

Cost: about 500 tokens input + 300 tokens output = about $0.0003 per explanation.

## Example Analyses

### Example 1: NCERT Physics Textbook Folder

Fingerprint:
- heading_depth: 4 (Book -> Chapter -> Section -> Subsection)
- formula_ratio: 0.08 (many equations)
- cross_ref_ratio: 0.04 ("as we saw in section 3.2")
- avg_sentence_length: 18 (explanatory, moderate)
- question_density: 0.03 (end-of-chapter problems)
- named_entity_density: 0.02 (Newton, Coulomb, etc.)
- doc_type: educational

Recommendation:
- Chunking: Hierarchical + Parent-Child + Formula-Preserving
- Retrieval: Hybrid + HyDE + Query Decomposition + Metadata Filtering
- Reranking: Cross-Encoder + MMR + Lost-in-Middle
- Embedding: text-embedding-3-small

### Example 2: Legal Contract Folder (50 NDAs)

Fingerprint:
- heading_depth: 2 (Section -> Subsection)
- avg_sentence_length: 32 (very dense)
- cross_ref_ratio: 0.06 ("subject to Section 4.2")
- named_entity_density: 0.05 (party names, dates, amounts)
- vocabulary_diversity: 0.45 (repetitive legal language)
- doc_type: legal

Recommendation:
- Chunking: Semantic (400 tokens, 80 overlap) + Summary-Augmented
- Retrieval: Hybrid + Metadata Filtering + Graph RAG
- Reranking: Cascade (FlashRank -> Cross-Encoder) + Lost-in-Middle
- Embedding: voyage-3-large

### Example 3: Python Codebase (200 files)

Fingerprint:
- code_ratio: 0.75
- heading_density: 0.01 (docstrings only)
- avg_sentence_length: 8 (code comments are short)
- cross_ref_ratio: 0.15 (imports, function calls)
- doc_type: code

Recommendation:
- Chunking: Code-Aware (function/class boundaries, 0 overlap)
- Retrieval: Hybrid + Metadata Filtering (by file, by module)
- Reranking: BGE + Lost-in-Middle
- Embedding: jina-embeddings-v3

## What Runs Without LLM (Everything Above)
- Corpus fingerprinting: pure text analysis
- Technique selection: rule engine
- Confidence scoring: formula-based

## What Optionally Uses LLM
- "Explain in detail" button: single LLM call (about $0.0003)
- Contextual chunking: LLM call per chunk at indexing time
- HyDE: LLM call per query at retrieval time
- Query decomposition: LLM call per query

## Research-Backed Benchmark Numbers (Use These for Confidence Scoring)

These numbers come from published research. Use them to validate recommendations.

| Technique | Typical Improvement | Source |
|-----------|-------------------|--------|
| Hierarchical chunking vs flat | +8-15% answer quality on structured docs | LlamaIndex evaluation 2024 |
| Semantic chunking vs fixed-size | +3-7% on BEIR, but 2-3x slower indexing | ChromaDB evaluation 2024 |
| Hybrid search vs dense-only | +5-12% Recall@10 (largest on domain-specific) | BGE M3 paper, Pinecone benchmarks |
| Cross-encoder reranking | +10-20% MRR@10 | Nogueira & Cho 2019, Cohere benchmarks |
| HyDE | +3-12% NDCG@10 in zero-shot, can HURT on factual Qs | Gao et al. 2022 |
| Query decomposition | +10-25% on multi-hop questions | HotpotQA benchmarks |
| Parent-child retrieval | +5-15% on long structured documents | LlamaIndex evaluation reports |
| Graph RAG | +20-70% on global/sensemaking queries, <5% on local | Microsoft GraphRAG paper 2024 |
| Contextual retrieval (Anthropic) | -49% retrieval failures, -67% with reranking | Anthropic blog Nov 2024 |
| Optimal chunk size: 1024 tokens | Best general-purpose default | LlamaIndex chunk size eval |
| Overlap 10-15% | Consistent improvement over 0% overlap | Vectara, Pinecone research |

### Key Research Gap (What ChunkScope Fills)
No existing tool does corpus-aware automatic RAG configuration recommendation:
- AutoRAG: brute-force evaluation (needs labeled data, expensive)
- DSPy: optimizes prompts/demonstrations (not infrastructure choices)
- RAGAs/ARES: evaluation only (no recommendation)
- Nobody maps document characteristics to optimal pipeline settings automatically

### Key Papers to Reference
1. "DSPy: Compiling Declarative LM Calls" - Khattab et al. 2023 (arxiv 2310.03714)
2. "From Local to Global: Graph RAG" - Edge et al. Microsoft 2024 (arxiv 2404.16130)
3. "Precise Zero-Shot Dense Retrieval (HyDE)" - Gao et al. 2022 (arxiv 2212.10496)
4. "RAG for LLMs: A Survey" - Gao et al. 2024 (arxiv 2312.10997)
5. "MIPRO: Optimizing Multi-Stage LM Programs" - Opsahl-Ong et al. 2024 (arxiv 2406.11695)
6. "RAPTOR: Recursive Abstractive Processing for Tree-Organized Retrieval" - Sarthi et al. 2024 (arxiv 2401.18059)
7. "BGE M3-Embedding" - Chen et al. 2024 (arxiv 2402.03216)

## What ChunkScope Already Has
- 8 chunking strategies (including heading-based + parent-child via contextual)
- 19 retrieval strategies (including hybrid, HyDE, query decomposition, metadata filtering)
- 13 reranking strategies (including cross-encoder, MMR, cascade, lost-in-middle)
- Document analyzer with content signals
- Decision engine with recommend_pipeline()
- Strategy guide with 39 entries

## What Needs to Be Built

### Backend (use subagents for parallel implementation)

#### Subagent 1: Expanded Fingerprinting
File: `backend/app/services/document_analyzer.py`
- Add to _compute_content_signals(): formula_ratio, cross_ref_ratio, named_entity_density, question_density, dialogue_ratio, heading_depth, forward_references, back_references, comparison_patterns, causal_chains
- Keep it zero-LLM - all regex/pattern detection
- Test with sample texts (create backend/tests/test_fingerprinting.py)

#### Subagent 2: Multi-Technique Recommendation Engine
File: `backend/app/services/pipeline_recommender.py` (NEW)
- Implement select_chunking(), select_retrieval(), select_reranking(), select_embedding() as described above
- Returns a STACK of techniques, not just one per category
- Each technique has: name, confidence, reasoning, "why not" alternatives
- Integrate with existing strategy_guide.py for metadata
- Replace single-strategy output with multi-strategy pipeline config

#### Subagent 3: Frontend Pipeline Visualization
File: `frontend/src/app/projects/[id]/page.tsx` and new components
- After AI Analysis, show the recommended pipeline as a visual stack:
  - Chunking stack (primary + augmentations)
  - Retrieval stack (base + augmentations)
  - Reranking stack (stages)
  - Embedding recommendation with alternatives
- Each technique card shows: name, confidence bar, reasoning, (i) button
- "Why not X?" expandable section explaining rejected alternatives
- "Apply All" button that configures the entire pipeline
- "Customize" button that lets user override individual techniques

#### Subagent 4: Confidence Scoring + Why-Not Explanations
File: `backend/app/services/pipeline_recommender.py`
- Implement confidence scoring formula
- For each category, generate "why not" for top 2-3 alternatives:
  - "Why not Graph RAG? Your cross-reference ratio (0.02) is below the 0.05 threshold where entity graphs provide measurable benefit."
  - "Why not Semantic Chunking? Your heading structure (depth 4) provides natural split points that heading-based chunking leverages better."

### Testing
- Upload NCERT textbook PDF -> verify it recommends hierarchical + parent-child
- Upload legal contract -> verify it recommends semantic + graph RAG
- Upload Python files -> verify it recommends code-aware
- Upload FAQ document -> verify it recommends sentence window
- Check that zero LLM tokens are used for fingerprinting + recommendation

### Environment
- LiteLLM key in .env: LITELLM_API_KEY (for optional LLM explanation only)
- Backend: FastAPI at port 8000, use uv for packages
- Frontend: Next.js 14 at port 3000
- All LLM calls through: `from app.services.llm_service import llm_service`

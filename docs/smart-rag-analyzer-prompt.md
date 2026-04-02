# Smart RAG Pipeline Analyzer - Design Prompt

## What We Are Building

A system that takes ANY uploaded corpus (files, folders, ZIPs) and automatically determines the exact combination of RAG techniques that will produce the best results for THAT specific data. Not generic recommendations - precise, evidence-based pipeline configuration.

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

## What ChunkScope Already Has
- 8 chunking strategies (including heading-based + parent-child via contextual)
- 19 retrieval strategies (including hybrid, HyDE, query decomposition, metadata filtering)
- 13 reranking strategies (including cross-encoder, MMR, cascade, lost-in-middle)
- Document analyzer with content signals
- Decision engine with recommend_pipeline()
- Strategy guide with 39 entries

## What Needs to Be Built
1. Expanded fingerprinting (add formula_ratio, cross_ref_ratio, named_entity_density, question_density)
2. Multi-technique stacking (recommend combinations, not single strategies)
3. Confidence scoring per recommendation
4. Pipeline visualization showing the recommended stack
5. "Why not X?" explanations (why Graph RAG was not recommended, etc.)

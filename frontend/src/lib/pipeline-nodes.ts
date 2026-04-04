// Pipeline node type definitions and default configs

export type NodeCategory = 'source' | 'processing' | 'retrieval' | 'output';

export interface PipelineNodeDef {
    type: string;
    label: string;
    category: NodeCategory;
    icon: string; // lucide icon name
    description: string;
    defaultConfig: Record<string, any>;
}

export const CATEGORY_COLORS: Record<NodeCategory, {
    border: string;
    bg: string;
    text: string;
    accent: string;
    handle: string;
}> = {
    source: {
        border: 'border-blue-300',
        bg: 'bg-blue-50',
        text: 'text-blue-600',
        accent: 'bg-blue-500',
        handle: '#3b82f6',
    },
    processing: {
        border: 'border-purple-300',
        bg: 'bg-purple-50',
        text: 'text-purple-600',
        accent: 'bg-purple-500',
        handle: '#a855f7',
    },
    retrieval: {
        border: 'border-emerald-300',
        bg: 'bg-emerald-50',
        text: 'text-emerald-600',
        accent: 'bg-emerald-500',
        handle: '#10b981',
    },
    output: {
        border: 'border-orange-300',
        bg: 'bg-orange-50',
        text: 'text-orange-600',
        accent: 'bg-orange-500',
        handle: '#f97316',
    },
};

export const CATEGORY_LABELS: Record<NodeCategory, string> = {
    source: 'Source',
    processing: 'Processing',
    retrieval: 'Retrieval',
    output: 'Output',
};

export const NODE_DEFINITIONS: PipelineNodeDef[] = [
    // Source Nodes
    {
        type: 'document_upload',
        label: 'Document Upload',
        category: 'source',
        icon: 'FileUp',
        description: 'Upload a file or paste text',
        defaultConfig: {
            uploadMode: 'file',
            text: '',
            fileName: '',
            documentId: null,
        },
    },

    // Processing Nodes
    {
        type: 'chunking',
        label: 'Chunking',
        category: 'processing',
        icon: 'Scissors',
        description: 'Split documents into chunks',
        defaultConfig: {
            method: 'recursive',
            chunkSize: 500,
            overlap: 50,
            threshold: 0.5,
        },
    },
    {
        type: 'embedding',
        label: 'Embedding',
        category: 'processing',
        icon: 'BrainCircuit',
        description: 'Generate vector embeddings',
        defaultConfig: {
            provider: 'openai',
            model: 'text-embedding-3-small',
        },
    },
    {
        type: 'vector_store',
        label: 'Vector Store',
        category: 'processing',
        icon: 'Database',
        description: 'Store vectors in pgvector',
        defaultConfig: {
            provider: 'pgvector',
            collection: 'default',
            indexType: 'hnsw',
        },
    },

    // Retrieval Nodes
    {
        type: 'retriever',
        label: 'Retriever',
        category: 'retrieval',
        icon: 'Search',
        description: 'Retrieve relevant chunks',
        defaultConfig: {
            strategy: 'dense',
            topK: 5,
            alpha: 0.7,
        },
    },
    {
        type: 'reranker',
        label: 'Reranker',
        category: 'retrieval',
        icon: 'ArrowUpDown',
        description: 'Re-score and reorder results',
        defaultConfig: {
            provider: 'cross-encoder',
            model: 'cross-encoder/ms-marco-MiniLM-L-12-v2',
            topN: 10,
            returnK: 5,
        },
    },

    // Output Nodes
    {
        type: 'llm_generation',
        label: 'LLM Generation',
        category: 'output',
        icon: 'MessageSquare',
        description: 'Generate answers with an LLM',
        defaultConfig: {
            model: 'gpt-4o',
            temperature: 0.7,
            maxTokens: 1024,
            systemPrompt: 'You are a helpful assistant. Use the provided context to answer questions.',
        },
    },
];

export function getNodeDef(type: string): PipelineNodeDef | undefined {
    return NODE_DEFINITIONS.find((n) => n.type === type);
}

export function getNodesByCategory(category: NodeCategory): PipelineNodeDef[] {
    return NODE_DEFINITIONS.filter((n) => n.category === category);
}

// Embedding model registry
export const EMBEDDING_MODELS: Record<string, { name: string; models: { id: string; name: string; dimensions: number; cost: number; quality: string }[] }> = {
    openai: {
        name: 'OpenAI',
        models: [
            { id: 'text-embedding-3-small', name: 'text-embedding-3-small', dimensions: 1536, cost: 0.02, quality: 'Good' },
            { id: 'text-embedding-3-large', name: 'text-embedding-3-large', dimensions: 3072, cost: 0.13, quality: 'Best' },
        ],
    },
    cohere: {
        name: 'Cohere',
        models: [
            { id: 'embed-english-v3.0', name: 'embed-english-v3.0', dimensions: 1024, cost: 0.10, quality: 'Great' },
            { id: 'embed-multilingual-v3.0', name: 'embed-multilingual-v3.0', dimensions: 1024, cost: 0.10, quality: 'Great' },
        ],
    },
    voyage: {
        name: 'Voyage AI',
        models: [
            { id: 'voyage-large-2', name: 'voyage-large-2', dimensions: 1536, cost: 0.12, quality: 'Best' },
            { id: 'voyage-code-2', name: 'voyage-code-2', dimensions: 1536, cost: 0.12, quality: 'Best (Code)' },
        ],
    },
    jina: {
        name: 'Jina AI',
        models: [
            { id: 'jina-embeddings-v2-base-en', name: 'jina-v2-base', dimensions: 768, cost: 0.01, quality: 'Good' },
        ],
    },
    local: {
        name: 'Local (Free)',
        models: [
            { id: 'BAAI/bge-m3', name: 'BGE-M3', dimensions: 1024, cost: 0, quality: 'Great' },
            { id: 'all-MiniLM-L6-v2', name: 'MiniLM-L6', dimensions: 384, cost: 0, quality: 'Fair' },
            { id: 'nomic-ai/nomic-embed-text-v1.5', name: 'Nomic Embed', dimensions: 768, cost: 0, quality: 'Good' },
        ],
    },
};

// Chunking strategy options
export const CHUNKING_STRATEGIES = [
    { id: 'fixed', label: 'Fixed Size', description: 'Split at exact character count' },
    { id: 'recursive', label: 'Recursive', description: 'Smart splitting with separators' },
    { id: 'semantic', label: 'Semantic', description: 'Split by meaning similarity' },
    { id: 'sentence', label: 'Sentence', description: 'Split at sentence boundaries' },
    { id: 'paragraph', label: 'Paragraph', description: 'Split at paragraph boundaries' },
    { id: 'code', label: 'Code-Aware', description: 'Respects code structure' },
    { id: 'heading', label: 'Heading', description: 'Split at document headings' },
    { id: 'contextual', label: 'Contextual', description: 'Context-aware splitting' },
];

// Retrieval strategy options
export const RETRIEVAL_STRATEGIES = [
    { id: 'dense', label: 'Dense', description: 'Vector similarity search' },
    { id: 'hybrid', label: 'Hybrid', description: 'Vector + keyword search' },
    { id: 'multi-query', label: 'Multi-Query', description: 'Generate multiple search queries' },
    { id: 'hyde', label: 'HyDE', description: 'Hypothetical document embeddings' },
    { id: 'parent-child', label: 'Parent-Child', description: 'Retrieve parent chunks' },
];

// Reranker options
export const RERANKER_PROVIDERS = [
    { id: 'cross-encoder', label: 'Cross-Encoder', description: 'Local cross-encoder model' },
    { id: 'cohere', label: 'Cohere', description: 'Cohere Rerank API' },
    { id: 'bm25', label: 'BM25', description: 'Keyword-based scoring' },
    { id: 'llm', label: 'LLM Reranker', description: 'Use LLM to score relevance' },
];

// LLM model options
export const LLM_MODELS = [
    { id: 'gpt-4o', label: 'GPT-4o', provider: 'OpenAI', cost: 'Medium' },
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'OpenAI', cost: 'Low' },
    { id: 'claude-3.5-sonnet', label: 'Claude 3.5 Sonnet', provider: 'Anthropic', cost: 'Medium' },
    { id: 'claude-3-haiku', label: 'Claude 3 Haiku', provider: 'Anthropic', cost: 'Low' },
    { id: 'llama-3-70b', label: 'Llama 3 70B', provider: 'Groq', cost: 'Low' },
    { id: 'mixtral-8x7b', label: 'Mixtral 8x7B', provider: 'Groq', cost: 'Very Low' },
];

// Connection validation rules
export const CONNECTION_RULES: Record<string, string[]> = {
    document_upload: ['chunking', 'llm_generation'],
    chunking: ['embedding', 'vector_store', 'llm_generation'],
    embedding: ['vector_store'],
    vector_store: ['retriever'],
    retriever: ['reranker', 'llm_generation'],
    reranker: ['llm_generation'],
    llm_generation: [],
};

// Helper to build pipeline config for API
export function buildPipelineConfig(
    nodes: readonly { id: string; type?: string; data: any; position: { x: number; y: number }; [key: string]: any }[],
    edges: readonly { source: string; target: string; [key: string]: any }[]
) {
    const steps = nodes.map((node) => ({
        id: node.id,
        type: node.type,
        config: node.data,
        position: node.position,
    }));

    const connections = edges.map((edge) => ({
        source: edge.source,
        target: edge.target,
    }));

    return { steps, connections };
}

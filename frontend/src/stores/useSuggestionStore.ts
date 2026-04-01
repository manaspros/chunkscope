import { create } from 'zustand';
import { suggestApi, embeddingsApi } from '@/lib/api';

export interface DocumentProfile {
    word_count: number;
    sentence_count: number;
    paragraph_count: number;
    avg_sentence_length: number;
    vocabulary_diversity: number;
    repetition_score: number;
    complexity: 'simple' | 'moderate' | 'complex';
    doc_type: string;
    structure_elements: {
        headings: number;
        tables: number;
        code_blocks: number;
        lists: number;
    };
}

export interface Recommendation {
    chunking_method: string;
    chunk_size: number;
    overlap: number;
    embedding_model: string;
    retrieval_strategy: string;
    confidence: number;
    warnings: string[];
}

export interface SuggestionResponse {
    primary: Recommendation;
    alternatives: Recommendation[];
}

export interface EmbeddingModel {
    name: string;
    dimensions: number;
    cost: string;
    quality_tier: string;
    speed: string;
}

interface SuggestionState {
    documentText: string;
    profile: DocumentProfile | null;
    recommendations: SuggestionResponse | null;
    explanation: string | null;
    embeddingModels: EmbeddingModel[];
    isProfilingLoading: boolean;
    isRecommendationLoading: boolean;
    isExplanationLoading: boolean;
    isEmbeddingsLoading: boolean;
    error: string | null;

    setDocumentText: (text: string) => void;
    analyzeDocument: (text: string) => Promise<void>;
    getRecommendations: (text: string) => Promise<void>;
    getExplanation: (recommendation: Recommendation) => Promise<void>;
    fetchEmbeddingModels: () => Promise<void>;
    reset: () => void;
}

export const useSuggestionStore = create<SuggestionState>((set, get) => ({
    documentText: '',
    profile: null,
    recommendations: null,
    explanation: null,
    embeddingModels: [],
    isProfilingLoading: false,
    isRecommendationLoading: false,
    isExplanationLoading: false,
    isEmbeddingsLoading: false,
    error: null,

    setDocumentText: (text) => set({ documentText: text }),

    analyzeDocument: async (text: string) => {
        set({ isProfilingLoading: true, error: null, profile: null, recommendations: null, explanation: null });
        try {
            const profile = await suggestApi.profileDocument(text);
            set({ profile, isProfilingLoading: false });
            // Auto-fetch recommendations after profiling
            get().getRecommendations(text);
        } catch (err: any) {
            set({
                isProfilingLoading: false,
                error: err?.response?.data?.detail || err?.message || 'Failed to profile document',
            });
        }
    },

    getRecommendations: async (text: string) => {
        set({ isRecommendationLoading: true, error: null });
        try {
            const data = await suggestApi.recommend(text);
            set({ recommendations: data, isRecommendationLoading: false });
            // Auto-fetch explanation for primary
            if (data?.primary) {
                get().getExplanation(data.primary);
            }
        } catch (err: any) {
            set({
                isRecommendationLoading: false,
                error: err?.response?.data?.detail || err?.message || 'Failed to get recommendations',
            });
        }
    },

    getExplanation: async (recommendation: Recommendation) => {
        set({ isExplanationLoading: true });
        try {
            const data = await suggestApi.explain(recommendation);
            set({ explanation: data?.explanation || data, isExplanationLoading: false });
        } catch (err: any) {
            set({
                isExplanationLoading: false,
                error: err?.response?.data?.detail || err?.message || 'Failed to get explanation',
            });
        }
    },

    fetchEmbeddingModels: async () => {
        set({ isEmbeddingsLoading: true });
        try {
            const data = await embeddingsApi.getModels();
            const models = Array.isArray(data) ? data : data?.models || [];
            set({ embeddingModels: models, isEmbeddingsLoading: false });
        } catch (err: any) {
            set({ isEmbeddingsLoading: false });
        }
    },

    reset: () =>
        set({
            documentText: '',
            profile: null,
            recommendations: null,
            explanation: null,
            error: null,
            isProfilingLoading: false,
            isRecommendationLoading: false,
            isExplanationLoading: false,
        }),
}));

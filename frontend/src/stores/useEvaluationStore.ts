import { create } from 'zustand';
import { evaluateApi } from '@/lib/api';

export interface EvalMetrics {
    faithfulness?: number;
    answer_relevancy?: number;
    context_precision?: number;
    context_recall?: number;
    hit_rate?: number;
    mrr?: number;
    [key: string]: number | undefined;
}

export interface ChunkQualityItem {
    chunk_index: number;
    text: string;
    semantic_coherence: number;
    boundary_quality: number;
    size_appropriateness: number;
}

export interface ComparisonResult {
    config_a: string;
    config_b: string;
    metrics_a: EvalMetrics;
    metrics_b: EvalMetrics;
}

interface EvaluationState {
    metrics: EvalMetrics | null;
    evalQuestion: string;
    evalGroundTruth: string;
    chunkQuality: ChunkQualityItem[];
    comparisonResult: ComparisonResult | null;
    isEvalLoading: boolean;
    isChunkQualityLoading: boolean;
    isComparisonLoading: boolean;
    error: string | null;

    setEvalQuestion: (q: string) => void;
    setEvalGroundTruth: (gt: string) => void;
    runEvaluation: (question: string, groundTruth?: string) => Promise<void>;
    evaluateChunkQuality: () => Promise<void>;
    setComparisonResult: (result: ComparisonResult | null) => void;
    reset: () => void;
}

export const useEvaluationStore = create<EvaluationState>((set) => ({
    metrics: null,
    evalQuestion: '',
    evalGroundTruth: '',
    chunkQuality: [],
    comparisonResult: null,
    isEvalLoading: false,
    isChunkQualityLoading: false,
    isComparisonLoading: false,
    error: null,

    setEvalQuestion: (q) => set({ evalQuestion: q }),
    setEvalGroundTruth: (gt) => set({ evalGroundTruth: gt }),

    runEvaluation: async (question: string, groundTruth?: string) => {
        set({ isEvalLoading: true, error: null, metrics: null });
        try {
            const data = await evaluateApi.run({
                question,
                ground_truth: groundTruth || undefined,
            });
            const metrics = data?.metrics || data;
            set({ metrics, isEvalLoading: false });
        } catch (err: any) {
            set({
                isEvalLoading: false,
                error: err?.response?.data?.detail || err?.message || 'Evaluation failed',
            });
        }
    },

    evaluateChunkQuality: async () => {
        set({ isChunkQualityLoading: true, error: null, chunkQuality: [] });
        try {
            const data = await evaluateApi.chunkQuality();
            const items = Array.isArray(data) ? data : data?.chunks || data?.results || [];
            set({ chunkQuality: items, isChunkQualityLoading: false });
        } catch (err: any) {
            set({
                isChunkQualityLoading: false,
                error: err?.response?.data?.detail || err?.message || 'Chunk quality evaluation failed',
            });
        }
    },

    setComparisonResult: (result) => set({ comparisonResult: result }),

    reset: () =>
        set({
            metrics: null,
            evalQuestion: '',
            evalGroundTruth: '',
            chunkQuality: [],
            comparisonResult: null,
            error: null,
            isEvalLoading: false,
            isChunkQualityLoading: false,
            isComparisonLoading: false,
        }),
}));

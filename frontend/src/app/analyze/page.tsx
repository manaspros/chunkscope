'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { analyzerApi } from '@/lib/api';
import {
    Upload,
    FileText,
    CheckCircle,
    Loader2,
    ArrowRight,
    Sparkles
} from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useToast } from '@/components/ui/use-toast';
import { getErrorMessage } from '@/lib/utils';
import { AnalysisResultOverlay } from '@/components/analysis/AnalysisResultOverlay';
import { useConfigStore } from '@/stores/useConfigStore';
import { AnimatePresence } from 'framer-motion';

interface AnalysisResult {
    document_id: string | null;
    chunks_count: number;
    preview_chunks: any[];
}

export default function AnalyzePage() {
    const [file, setFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [analysisResult, setAnalysisResult] = useState<any | null>(null);
    const setSelectedDocId = useConfigStore((state) => state.setSelectedDocId);
    const router = useRouter();
    const { toast } = useToast();

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const handleAnalyze = async () => {
        if (!file) return;

        setIsUploading(true);
        try {
            // 1. Analyze Document
            const result = await analyzerApi.analyzeDocument(file);
            setAnalysisResult(result);
            setSelectedDocId(result.document_id);

            toast({
                title: "Scan Complete",
                description: "Forensic report generated.",
            });
        } catch (error) {
            console.error(error);
            toast({
                title: "Analysis Failed",
                description: getErrorMessage(error),
                variant: "destructive"
            });
        } finally {
            setIsUploading(false);
        }
    };

    const handleConfirmAnalysis = (config: any) => {
        if (!analysisResult) return;

        // Map backend 'character' to frontend 'recursive'
        const method = config.chunking_method === 'character' ? 'recursive' : config.chunking_method as any;

        // Update store with recommended config
        useConfigStore.getState().setMethod(method);
        useConfigStore.getState().setChunkSize(config.chunk_size);
        useConfigStore.getState().setOverlap(config.overlap);
        if (config.threshold) {
             useConfigStore.getState().setThreshold(config.threshold);
        }

        router.push(`/visualizer?docId=${analysisResult.document_id}&auto=true`);
        setAnalysisResult(null);
    };

    return (
        <div className="relative min-h-screen bg-transparent font-sans text-white">

                <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 py-12">
                    <div className="w-full max-w-3xl space-y-12">

                        {/* Header */}
                        <div className="text-center space-y-6">
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-electric/10 border border-electric/20 text-xs font-medium text-electric uppercase tracking-widest">
                                <Sparkles className="w-3 h-3" />
                                Semantic Inspector
                            </div>
                            <h1 className="text-5xl md:text-6xl font-black tracking-tight text-white font-heading">
                                Chunk Analyzer
                            </h1>
                            <p className="text-xl text-zinc-400 font-light max-w-2xl mx-auto">
                                Upload your PDF to inspect how different chunking strategies affect semantic integrity.
                            </p>
                        </div>

                        {/* Upload Card */}
                        <div className="p-10 rounded-[2.5rem] bg-black/40 border border-white/10 backdrop-blur-md shadow-2xl">
                            <div className="border-2 border-dashed border-white/10 rounded-3xl p-12 text-center transition-all hover:border-gold/50 hover:bg-white/5 group cursor-pointer relative">
                                <input
                                    type="file"
                                    className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                    onChange={handleFileChange}
                                    accept=".pdf"
                                />

                                <div className="flex flex-col items-center gap-6 pointer-events-none">
                                    <div className="w-20 h-20 rounded-2xl bg-zinc-900/50 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 border border-white/5">
                                        {file ? (
                                            <FileText className="w-10 h-10 text-gold" />
                                        ) : (
                                            <Upload className="w-10 h-10 text-zinc-500 group-hover:text-gold transition-colors" />
                                        )}
                                    </div>

                                    <div className="space-y-2">
                                        <h3 className="text-xl font-bold text-white">
                                            {file ? file.name : "Drop PDF here or click to browse"}
                                        </h3>
                                        <p className="text-zinc-500 text-sm">
                                            {file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : "Support for standard PDF documents"}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Actions */}
                            {file && (
                                <div className="mt-8 flex justify-center animate-in fade-in slide-in-from-bottom-4">
                                    <button
                                        onClick={handleAnalyze}
                                        disabled={isUploading}
                                        className="h-14 px-8 rounded-full bg-gold hover:bg-gold/90 text-black font-bold text-lg transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 flex items-center gap-2 shadow-[0_0_20px_rgba(245,183,0,0.3)] hover:shadow-[0_0_30px_rgba(245,183,0,0.5)]"
                                    >
                                        {isUploading ? (
                                            <>
                                                <LoadingSpinner size="sm" />
                                                Processing...
                                            </>
                                        ) : (
                                            <>
                                                Start Analysis
                                                <ArrowRight className="w-5 h-5" />
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Analysis Report Overlay */}
                        <AnimatePresence>
                            {analysisResult && (
                                <AnalysisResultOverlay
                                    result={analysisResult}
                                    onClose={() => setAnalysisResult(null)}
                                    onConfirm={handleConfirmAnalysis}
                                />
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>
    );
}

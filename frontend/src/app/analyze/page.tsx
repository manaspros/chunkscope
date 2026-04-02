'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { analyzerApi, documentsApi } from '@/lib/api';
import {
    ArrowRight,
    Sparkles
} from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useToast } from '@/components/ui/use-toast';
import { getErrorMessage } from '@/lib/utils';
import { useConfigStore } from '@/stores/useConfigStore';
import { FileUploadZone, isZipFile } from '@/components/ui/file-upload-zone';
import { AnalysisResultOverlay } from '@/components/analysis/AnalysisResultOverlay';

export default function AnalyzePage() {
    const [files, setFiles] = useState<File[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [analysisResult, setAnalysisResult] = useState<any | null>(null);
    const setSelectedDocId = useConfigStore((state) => state.setSelectedDocId);
    const router = useRouter();
    const { toast } = useToast();

    const handleFiles = useCallback((incoming: File[]) => {
        setFiles(incoming);
    }, []);

    const handleAnalyze = async () => {
        if (files.length === 0) return;

        setIsUploading(true);
        try {
            // Analyze each file; for ZIPs, upload via the zip endpoint first
            for (const file of files) {
                let result;

                if (isZipFile(file)) {
                    // Upload zip first, then analyze
                    await documentsApi.uploadZip(file);
                    result = await analyzerApi.analyzeDocument(file);
                } else {
                    result = await analyzerApi.analyzeDocument(file);
                }

                // Use the last result for the overlay
                setAnalysisResult(result);
                if (result.document_id) {
                    setSelectedDocId(result.document_id);
                }
            }

            toast({
                title: "Scan Complete",
                description: `Forensic report generated for ${files.length} file${files.length > 1 ? 's' : ''}.`,
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
                                Upload any document to inspect how different chunking strategies affect semantic integrity.
                            </p>
                        </div>

                        {/* Upload Card */}
                        <div className="p-10 rounded-[2.5rem] bg-black/40 border border-white/10 backdrop-blur-md shadow-2xl">
                            <FileUploadZone
                                onFiles={handleFiles}
                                multiple
                                allowFolder
                                helpText="Drop any document here or click to browse"
                                supportedText="PDF, TXT, MD, DOCX, CSV, JSON, XML, YAML, HTML, Python, JS, TS, ZIP, and more"
                                uploading={isUploading}
                            />

                            {/* Actions */}
                            {files.length > 0 && (
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
                        {analysisResult && (
                            <AnalysisResultOverlay
                                result={analysisResult}
                                onClose={() => setAnalysisResult(null)}
                                onConfirm={handleConfirmAnalysis}
                            />
                        )}
                    </div>
                </div>
            </div>
    );
}

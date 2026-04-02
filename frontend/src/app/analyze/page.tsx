'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { analyzerApi, documentsApi, projectsApi } from '@/lib/api';
import {
    ArrowRight,
    Sparkles,
    FileText,
    FolderOpen,
    CheckCircle2,
    XCircle,
    Loader2,
    ChevronDown,
    ChevronUp,
    Save,
} from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useToast } from '@/components/ui/use-toast';
import { getErrorMessage } from '@/lib/utils';
import { useConfigStore } from '@/stores/useConfigStore';
import { FileUploadZone, isZipFile } from '@/components/ui/file-upload-zone';
import { AnalysisResultOverlay } from '@/components/analysis/AnalysisResultOverlay';

interface FileStatus {
    filename: string;
    status: 'pending' | 'analyzing' | 'done' | 'error';
    result?: any;
    error?: string;
}

export default function AnalyzePage() {
    const [files, setFiles] = useState<File[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [progress, setProgress] = useState('');
    const [fileStatuses, setFileStatuses] = useState<FileStatus[]>([]);
    const [analysisResult, setAnalysisResult] = useState<any | null>(null);
    const [corpusResult, setCorpusResult] = useState<any | null>(null);
    const [showFileList, setShowFileList] = useState(false);
    const [savingProject, setSavingProject] = useState(false);
    const setSelectedDocId = useConfigStore((state) => state.setSelectedDocId);
    const router = useRouter();
    const { toast } = useToast();

    const handleSaveAsProject = async () => {
        if (!corpusResult && !analysisResult) return;
        setSavingProject(true);
        try {
            const name = `Analysis - ${new Date().toLocaleDateString()}`;
            const project = await projectsApi.create({
                name,
                description: corpusResult
                    ? `Corpus of ${corpusResult.corpus_summary?.total_files || files.length} files (${corpusResult.corpus_summary?.dominant_doc_type || 'mixed'})`
                    : `Single file analysis`,
            });
            // Upload files to the project
            if (files.length === 1 && !isZipFile(files[0])) {
                await projectsApi.uploadFile(project.id, files[0]);
            } else if (files.length === 1 && isZipFile(files[0])) {
                await projectsApi.uploadZip(project.id, files[0]);
            } else {
                await projectsApi.uploadFiles(project.id, files);
            }
            toast({ title: 'Saved as project', description: `Created project "${name}"` });
            router.push(`/projects/${project.id}`);
        } catch (error) {
            toast({ title: 'Failed to save project', description: getErrorMessage(error), variant: 'destructive' });
        } finally {
            setSavingProject(false);
        }
    };

    const handleFiles = useCallback((incoming: File[]) => {
        setFiles(incoming);
        setFileStatuses([]);
        setCorpusResult(null);
        setAnalysisResult(null);
    }, []);

    const handleAnalyze = async () => {
        if (files.length === 0) return;

        setIsUploading(true);
        setFileStatuses(files.map(f => ({ filename: f.name, status: 'pending' })));

        try {
            if (files.length === 1 && !isZipFile(files[0])) {
                // Single file - use simple endpoint
                setProgress('Analyzing...');
                setFileStatuses([{ filename: files[0].name, status: 'analyzing' }]);

                const result = await analyzerApi.analyzeDocument(files[0]);

                setFileStatuses([{ filename: files[0].name, status: 'done', result }]);
                setAnalysisResult(result);
                if (result.document_id) {
                    setSelectedDocId(result.document_id);
                }
            } else {
                // Multiple files or ZIP - use corpus endpoint
                setProgress(`Analyzing ${files.length} files as corpus...`);

                // For ZIP files, we need to handle differently
                let filesToAnalyze = files;
                if (files.length === 1 && isZipFile(files[0])) {
                    // Upload ZIP first, then analyze the extracted files
                    setProgress('Extracting ZIP archive...');
                    await documentsApi.uploadZip(files[0]);
                    // Still use corpus endpoint with the zip file
                    filesToAnalyze = files;
                }

                const corpusData = await analyzerApi.analyzeCorpus(filesToAnalyze);
                setCorpusResult(corpusData);

                // Update per-file statuses
                const statuses: FileStatus[] = (corpusData.files || []).map((f: any) => ({
                    filename: f.filename,
                    status: f.status === 'error' ? 'error' : 'done',
                    result: f,
                    error: f.error,
                }));
                setFileStatuses(statuses);

                // Set first successful document as selected
                const firstDone = corpusData.files?.find((f: any) => f.document_id);
                if (firstDone?.document_id) {
                    setSelectedDocId(firstDone.document_id);
                }
            }

            toast({
                title: "Analysis Complete",
                description: `Analyzed ${files.length} file${files.length > 1 ? 's' : ''}.`,
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
            setProgress('');
        }
    };

    const handleConfirmAnalysis = (config: any) => {
        if (!analysisResult && !corpusResult) return;

        const method = config.chunking_method === 'character' ? 'recursive' : config.chunking_method as any;
        useConfigStore.getState().setMethod(method);
        useConfigStore.getState().setChunkSize(config.chunk_size || 512);
        useConfigStore.getState().setOverlap(config.overlap || 50);
        if (config.threshold) {
            useConfigStore.getState().setThreshold(config.threshold);
        }

        if (analysisResult?.document_id) {
            router.push(`/visualizer?docId=${analysisResult.document_id}&auto=true`);
        } else {
            router.push('/pipeline');
        }
        setAnalysisResult(null);
        setCorpusResult(null);
    };

    const doneCount = fileStatuses.filter(f => f.status === 'done').length;
    const errorCount = fileStatuses.filter(f => f.status === 'error').length;

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
                            Upload any document, folder, or ZIP to analyze your RAG corpus.
                        </p>
                    </div>

                    {/* Upload Card */}
                    <div className="p-10 rounded-[2.5rem] bg-black/40 border border-white/10 backdrop-blur-md shadow-2xl">
                        <FileUploadZone
                            onFiles={handleFiles}
                            multiple
                            allowFolder
                            helpText="Drop files, a folder, or a ZIP archive here"
                            supportedText="PDF, TXT, MD, DOCX, CSV, JSON, XML, YAML, HTML, Python, JS, TS, ZIP, and more"
                            uploading={isUploading}
                        />

                        {/* Progress */}
                        {isUploading && progress && (
                            <div className="mt-4 flex items-center gap-2 justify-center text-sm text-amber-400">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                {progress}
                            </div>
                        )}

                        {/* Actions */}
                        {files.length > 0 && !corpusResult && !analysisResult && (
                            <div className="mt-8 flex flex-col items-center gap-3 animate-in fade-in slide-in-from-bottom-4">
                                <div className="flex items-center gap-2 text-sm text-zinc-500">
                                    {files.length === 1 ? (
                                        <><FileText className="w-4 h-4" /> 1 file selected</>
                                    ) : (
                                        <><FolderOpen className="w-4 h-4" /> {files.length} files selected (corpus mode)</>
                                    )}
                                </div>
                                <button
                                    onClick={handleAnalyze}
                                    disabled={isUploading}
                                    className="h-14 px-8 rounded-full bg-gold hover:bg-gold/90 text-black font-bold text-lg transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 flex items-center gap-2 shadow-[0_0_20px_rgba(245,183,0,0.3)] hover:shadow-[0_0_30px_rgba(245,183,0,0.5)]"
                                >
                                    {isUploading ? (
                                        <><LoadingSpinner size="sm" /> Processing...</>
                                    ) : (
                                        <>
                                            {files.length > 1 ? 'Analyze Corpus' : 'Start Analysis'}
                                            <ArrowRight className="w-5 h-5" />
                                        </>
                                    )}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Corpus Result */}
                    {corpusResult && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                            {/* Corpus Summary Card */}
                            <div className="p-8 rounded-3xl bg-black/40 border border-white/10 backdrop-blur-md">
                                <h2 className="text-xl font-black text-white mb-6 flex items-center gap-2">
                                    <FolderOpen className="w-5 h-5 text-amber-400" />
                                    Corpus Analysis
                                </h2>

                                {/* Stats Grid */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                                    <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                                        <div className="text-[9px] uppercase tracking-widest text-zinc-500 mb-1">Total Files</div>
                                        <div className="text-2xl font-black text-white">{corpusResult.corpus_summary.total_files}</div>
                                    </div>
                                    <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                                        <div className="text-[9px] uppercase tracking-widest text-zinc-500 mb-1">Successful</div>
                                        <div className="text-2xl font-black text-green-400">{corpusResult.corpus_summary.successful_files}</div>
                                    </div>
                                    <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                                        <div className="text-[9px] uppercase tracking-widest text-zinc-500 mb-1">Doc Type</div>
                                        <div className="text-lg font-bold text-white capitalize">{corpusResult.corpus_summary.dominant_doc_type}</div>
                                    </div>
                                    <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                                        <div className="text-[9px] uppercase tracking-widest text-zinc-500 mb-1">Confidence</div>
                                        <div className="text-2xl font-black text-amber-400">{Math.round(corpusResult.confidence_score * 100)}%</div>
                                    </div>
                                </div>

                                {/* Structure badges */}
                                <div className="flex gap-2 flex-wrap mb-6">
                                    {corpusResult.corpus_summary.has_tables && (
                                        <span className="px-2 py-1 rounded text-[10px] bg-green-500/10 border border-green-500/20 text-green-400">Has Tables</span>
                                    )}
                                    {corpusResult.corpus_summary.has_code && (
                                        <span className="px-2 py-1 rounded text-[10px] bg-blue-500/10 border border-blue-500/20 text-blue-400">Has Code</span>
                                    )}
                                    {corpusResult.corpus_summary.has_headings && (
                                        <span className="px-2 py-1 rounded text-[10px] bg-purple-500/10 border border-purple-500/20 text-purple-400">Has Headings</span>
                                    )}
                                    {Object.entries(corpusResult.corpus_summary.doc_types || {}).map(([type, count]) => (
                                        <span key={type} className="px-2 py-1 rounded text-[10px] bg-white/5 border border-white/10 text-zinc-400 capitalize">
                                            {type}: {String(count)}
                                        </span>
                                    ))}
                                </div>

                                {/* Recommendation */}
                                <div className="p-4 rounded-xl bg-orange-500/5 border border-orange-500/20 mb-6">
                                    <div className="text-[10px] uppercase tracking-widest text-orange-400 mb-2 font-bold">Corpus Recommendation</div>
                                    <div className="flex gap-4 flex-wrap text-sm">
                                        <span className="text-white">Method: <strong>{corpusResult.corpus_recommendation.chunking_method}</strong></span>
                                        <span className="text-white">Size: <strong>{corpusResult.corpus_recommendation.chunk_size}</strong></span>
                                        <span className="text-white">Overlap: <strong>{corpusResult.corpus_recommendation.overlap || 50}</strong></span>
                                    </div>
                                    <p className="text-[11px] text-orange-200/70 mt-2 italic">{corpusResult.reasoning}</p>
                                </div>

                                {/* Per-file breakdown */}
                                <button
                                    onClick={() => setShowFileList(!showFileList)}
                                    className="flex items-center gap-2 text-xs text-zinc-400 hover:text-white transition-colors mb-2"
                                >
                                    {showFileList ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                    {showFileList ? 'Hide' : 'Show'} per-file breakdown ({corpusResult.files?.length || 0} files)
                                </button>

                                {showFileList && (
                                    <div className="max-h-60 overflow-y-auto rounded-xl border border-white/5 bg-black/20">
                                        {(corpusResult.files || []).map((f: any, i: number) => (
                                            <div key={i} className="flex items-center gap-3 px-4 py-2 border-b border-white/5 last:border-0">
                                                {f.status === 'done' ? (
                                                    <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                                                ) : (
                                                    <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                                                )}
                                                <span className="text-[11px] text-zinc-300 truncate flex-1">{f.filename}</span>
                                                <span className="text-[10px] text-zinc-500 capitalize">{f.document_type}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Actions */}
                                <div className="flex gap-3 mt-6">
                                    <button
                                        onClick={() => { setCorpusResult(null); setFiles([]); setFileStatuses([]); }}
                                        className="px-6 py-3 text-zinc-500 text-[10px] font-black uppercase tracking-widest hover:text-white transition-colors"
                                    >
                                        Dismiss
                                    </button>
                                    <button
                                        onClick={handleSaveAsProject}
                                        disabled={savingProject}
                                        className="py-3 px-5 border border-amber-500/30 text-amber-400 font-black text-[11px] uppercase tracking-widest rounded-2xl hover:bg-amber-500/10 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        {savingProject ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                        Save as Project
                                    </button>
                                    <button
                                        onClick={() => handleConfirmAnalysis(corpusResult.corpus_recommendation)}
                                        className="flex-1 py-3 bg-gradient-to-r from-orange-400 to-amber-600 text-black font-black text-[11px] uppercase tracking-widest rounded-2xl hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
                                    >
                                        Build Pipeline <ArrowRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Single file result overlay */}
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

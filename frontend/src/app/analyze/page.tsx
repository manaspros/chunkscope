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
        <div className="relative min-h-screen bg-gray-50 font-sans text-gray-900">
            <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 py-12">
                <div className="w-full max-w-3xl space-y-12">

                    {/* Header */}
                    <div className="text-center space-y-6">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-50 border border-purple-200 text-xs font-medium text-purple-700 uppercase tracking-widest">
                            <Sparkles className="w-3 h-3" />
                            Semantic Inspector
                        </div>
                        <h1 className="text-5xl md:text-6xl font-black tracking-tight text-gray-900 font-heading">
                            Chunk Analyzer
                        </h1>
                        <p className="text-xl text-gray-500 font-light max-w-2xl mx-auto">
                            Upload any document, folder, or ZIP to analyze your RAG corpus.
                        </p>
                    </div>

                    {/* Upload Card */}
                    <div className="p-10 rounded-2xl bg-white border border-gray-200 shadow-sm">
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
                            <div className="mt-4 flex items-center gap-2 justify-center text-sm text-amber-600">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                {progress}
                            </div>
                        )}

                        {/* Actions */}
                        {files.length > 0 && !corpusResult && !analysisResult && (
                            <div className="mt-8 flex flex-col items-center gap-3 animate-in fade-in slide-in-from-bottom-4">
                                <div className="flex items-center gap-2 text-sm text-gray-500">
                                    {files.length === 1 ? (
                                        <><FileText className="w-4 h-4" /> 1 file selected</>
                                    ) : (
                                        <><FolderOpen className="w-4 h-4" /> {files.length} files selected (corpus mode)</>
                                    )}
                                </div>
                                <button
                                    onClick={handleAnalyze}
                                    disabled={isUploading}
                                    className="h-14 px-8 rounded-full bg-gray-900 hover:bg-gray-800 text-white font-bold text-lg transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 flex items-center gap-2 shadow-sm"
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
                            <div className="p-8 rounded-2xl bg-white border border-gray-200 shadow-sm">
                                <h2 className="text-xl font-black text-gray-900 mb-6 flex items-center gap-2">
                                    <FolderOpen className="w-5 h-5 text-amber-600" />
                                    Corpus Analysis
                                </h2>

                                {/* Stats Grid */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                                    <div className="p-4 rounded-xl bg-gray-50 border border-gray-200">
                                        <div className="text-[9px] uppercase tracking-widest text-gray-400 mb-1">Total Files</div>
                                        <div className="text-2xl font-black text-gray-900">{corpusResult.corpus_summary.total_files}</div>
                                    </div>
                                    <div className="p-4 rounded-xl bg-gray-50 border border-gray-200">
                                        <div className="text-[9px] uppercase tracking-widest text-gray-400 mb-1">Successful</div>
                                        <div className="text-2xl font-black text-green-600">{corpusResult.corpus_summary.successful_files}</div>
                                    </div>
                                    <div className="p-4 rounded-xl bg-gray-50 border border-gray-200">
                                        <div className="text-[9px] uppercase tracking-widest text-gray-400 mb-1">Doc Type</div>
                                        <div className="text-lg font-bold text-gray-900 capitalize">{corpusResult.corpus_summary.dominant_doc_type}</div>
                                    </div>
                                    <div className="p-4 rounded-xl bg-gray-50 border border-gray-200">
                                        <div className="text-[9px] uppercase tracking-widest text-gray-400 mb-1">Confidence</div>
                                        <div className="text-2xl font-black text-amber-600">{Math.round(corpusResult.confidence_score * 100)}%</div>
                                    </div>
                                </div>

                                {/* Structure badges */}
                                <div className="flex gap-2 flex-wrap mb-6">
                                    {corpusResult.corpus_summary.has_tables && (
                                        <span className="px-2 py-1 rounded text-[10px] bg-green-50 border border-green-200 text-green-700">Has Tables</span>
                                    )}
                                    {corpusResult.corpus_summary.has_code && (
                                        <span className="px-2 py-1 rounded text-[10px] bg-blue-50 border border-blue-200 text-blue-700">Has Code</span>
                                    )}
                                    {corpusResult.corpus_summary.has_headings && (
                                        <span className="px-2 py-1 rounded text-[10px] bg-purple-50 border border-purple-200 text-purple-700">Has Headings</span>
                                    )}
                                    {Object.entries(corpusResult.corpus_summary.doc_types || {}).map(([type, count]) => (
                                        <span key={type} className="px-2 py-1 rounded text-[10px] bg-gray-50 border border-gray-200 text-gray-600 capitalize">
                                            {type}: {String(count)}
                                        </span>
                                    ))}
                                </div>

                                {/* Recommendation */}
                                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 mb-6">
                                    <div className="text-[10px] uppercase tracking-widest text-amber-700 mb-2 font-bold">Corpus Recommendation</div>
                                    <div className="flex gap-4 flex-wrap text-sm">
                                        <span className="text-gray-900">Method: <strong>{corpusResult.corpus_recommendation.chunking_method}</strong></span>
                                        <span className="text-gray-900">Size: <strong>{corpusResult.corpus_recommendation.chunk_size}</strong></span>
                                        <span className="text-gray-900">Overlap: <strong>{corpusResult.corpus_recommendation.overlap || 50}</strong></span>
                                    </div>
                                    <p className="text-[11px] text-amber-700/70 mt-2 italic">{corpusResult.reasoning}</p>
                                </div>

                                {/* Per-file breakdown */}
                                <button
                                    onClick={() => setShowFileList(!showFileList)}
                                    className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-900 transition-colors mb-2"
                                >
                                    {showFileList ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                    {showFileList ? 'Hide' : 'Show'} per-file breakdown ({corpusResult.files?.length || 0} files)
                                </button>

                                {showFileList && (
                                    <div className="max-h-60 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50">
                                        {(corpusResult.files || []).map((f: any, i: number) => (
                                            <div key={i} className="flex items-center gap-3 px-4 py-2 border-b border-gray-200 last:border-0">
                                                {f.status === 'done' ? (
                                                    <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" />
                                                ) : (
                                                    <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                                                )}
                                                <span className="text-[11px] text-gray-700 truncate flex-1">{f.filename}</span>
                                                <span className="text-[10px] text-gray-400 capitalize">{f.document_type}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Actions */}
                                <div className="flex gap-3 mt-6">
                                    <button
                                        onClick={() => { setCorpusResult(null); setFiles([]); setFileStatuses([]); }}
                                        className="px-6 py-3 text-gray-400 text-[10px] font-black uppercase tracking-widest hover:text-gray-900 transition-colors"
                                    >
                                        Dismiss
                                    </button>
                                    <button
                                        onClick={handleSaveAsProject}
                                        disabled={savingProject}
                                        className="py-3 px-5 border border-gray-300 text-gray-700 font-black text-[11px] uppercase tracking-widest rounded-xl hover:bg-gray-50 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        {savingProject ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                        Save as Project
                                    </button>
                                    <button
                                        onClick={() => handleConfirmAnalysis(corpusResult.corpus_recommendation)}
                                        className="flex-1 py-3 bg-gray-900 text-white font-black text-[11px] uppercase tracking-widest rounded-xl hover:bg-gray-800 hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
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

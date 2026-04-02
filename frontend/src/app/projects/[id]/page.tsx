'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { projectsApi, apiClient } from '@/lib/api';
import {
    ArrowLeft,
    FileText,
    Layers,
    Trash2,
    Loader2,
    Sparkles,
    ArrowRight,
    Settings2,
    ChevronDown,
    ChevronUp,
    BarChart3,
    CheckCircle2,
    XCircle,
    Clock,
    BrainCircuit,
    Wand2,
    Search,
    MessageSquare,
    Eye,
} from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { FileUploadZone, isZipFile } from '@/components/ui/file-upload-zone';
import { useToast } from '@/components/ui/use-toast';
import { getErrorMessage } from '@/lib/utils';

interface ProjectFile {
    id: string;
    filename: string;
    original_filename: string;
    file_type: string;
    file_size_bytes: number | null;
    is_processed: boolean;
}

interface ProjectDetail {
    id: string;
    name: string;
    description: string | null;
    total_files: number;
    total_chunks: number;
    dominant_doc_type: string | null;
    corpus_config: Record<string, any>;
    status: string;
    created_at: string;
    files: ProjectFile[];
}

function formatBytes(bytes: number | null): string {
    if (!bytes) return '--';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ProjectDetailPage() {
    const params = useParams();
    const router = useRouter();
    const projectId = params.id as string;
    const { toast } = useToast();

    const [project, setProject] = useState<ProjectDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [analyzing, setAnalyzing] = useState(false);
    const [chunking, setChunking] = useState(false);
    const [analysisResult, setAnalysisResult] = useState<any>(null);
    const [showAnalysis, setShowAnalysis] = useState(false);
    const [showChunkConfig, setShowChunkConfig] = useState(false);

    // Chunk config
    const [chunkMethod, setChunkMethod] = useState('recursive');
    const [chunkSize, setChunkSize] = useState(512);
    const [chunkOverlap, setChunkOverlap] = useState(50);
    const [aiChunking, setAiChunking] = useState(false);
    const [aiChunkingStep, setAiChunkingStep] = useState('');

    // Query testing
    const [queryText, setQueryText] = useState('');
    const [querying, setQuerying] = useState(false);
    const [queryResult, setQueryResult] = useState<any>(null);
    const [retrievalStrategy, setRetrievalStrategy] = useState('hybrid');

    // Chunking progress
    const [chunkProgress, setChunkProgress] = useState(0);
    const [chunkProgressText, setChunkProgressText] = useState('');

    const fetchProject = useCallback(async () => {
        try {
            setLoading(true);
            const data = await projectsApi.get(projectId);
            setProject(data);
        } catch (error) {
            toast({ title: 'Failed to load project', description: getErrorMessage(error), variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    }, [projectId, toast]);

    useEffect(() => {
        fetchProject();
    }, [fetchProject]);

    // Load template config from localStorage if available
    useEffect(() => {
        try {
            const templateKey = `project_template_${projectId}`;
            const stored = localStorage.getItem(templateKey);
            if (stored) {
                const config = JSON.parse(stored);
                if (config.chunking_method) setChunkMethod(config.chunking_method);
                if (config.chunk_size) setChunkSize(config.chunk_size);
                if (config.overlap !== undefined) setChunkOverlap(config.overlap);
                localStorage.removeItem(templateKey);
            }
        } catch {
            // localStorage not available or invalid JSON, skip
        }
    }, [projectId]);

    const handleFiles = useCallback(async (files: File[]) => {
        if (!files.length) return;
        setUploading(true);

        try {
            if (files.length === 1 && isZipFile(files[0])) {
                await projectsApi.uploadZip(projectId, files[0]);
                toast({ title: 'ZIP uploaded and extracted' });
            } else if (files.length === 1) {
                await projectsApi.uploadFile(projectId, files[0]);
                toast({ title: 'File uploaded' });
            } else {
                await projectsApi.uploadFiles(projectId, files);
                toast({ title: `${files.length} files uploaded` });
            }
            fetchProject();
        } catch (error) {
            toast({ title: 'Upload failed', description: getErrorMessage(error), variant: 'destructive' });
        } finally {
            setUploading(false);
        }
    }, [projectId, toast, fetchProject]);

    const handleDeleteFile = async (fileId: string) => {
        try {
            await projectsApi.removeFile(projectId, fileId);
            toast({ title: 'File removed' });
            fetchProject();
        } catch (error) {
            toast({ title: 'Failed to remove file', description: getErrorMessage(error), variant: 'destructive' });
        }
    };

    const handleAnalyze = async () => {
        setAnalyzing(true);
        setAnalysisResult(null);
        try {
            const result = await projectsApi.analyze(projectId);
            setAnalysisResult(result);
            setShowAnalysis(true);

            // Apply recommended config as defaults
            if (result.corpus_recommendation) {
                const rec = result.corpus_recommendation;
                if (rec.chunking_method) setChunkMethod(rec.chunking_method);
                if (rec.chunk_size) setChunkSize(rec.chunk_size);
                if (rec.overlap) setChunkOverlap(rec.overlap);
            }

            fetchProject();
            toast({ title: 'Corpus analysis complete' });
        } catch (error) {
            toast({ title: 'Analysis failed', description: getErrorMessage(error), variant: 'destructive' });
        } finally {
            setAnalyzing(false);
        }
    };

    const handleChunk = async () => {
        setChunking(true);
        setChunkProgress(10);
        setChunkProgressText('Preparing files...');
        const progressInterval = setInterval(() => {
            setChunkProgress(prev => Math.min(prev + 5, 90));
            setChunkProgressText(() => {
                const fileNum = Math.floor(Math.random() * (project?.total_files || 1)) + 1;
                return `Processing file ${fileNum} of ${project?.total_files}...`;
            });
        }, 2000);
        try {
            const result = await projectsApi.chunk(projectId, {
                chunking_method: chunkMethod,
                chunk_size: chunkSize,
                overlap: chunkOverlap,
            });
            clearInterval(progressInterval);
            setChunkProgress(100);
            setChunkProgressText('Complete!');
            toast({ title: `Created ${result.total_chunks} chunks across ${result.files?.length || 0} files` });
            setShowChunkConfig(false);
            fetchProject();
        } catch (error) {
            clearInterval(progressInterval);
            setChunkProgress(0);
            setChunkProgressText('');
            toast({ title: 'Chunking failed', description: getErrorMessage(error), variant: 'destructive' });
        } finally {
            setChunking(false);
            setTimeout(() => { setChunkProgress(0); setChunkProgressText(''); }, 2000);
        }
    };

    const handleDeleteProject = async () => {
        if (!confirm('Delete this project and all its files?')) return;
        try {
            await projectsApi.delete(projectId);
            toast({ title: 'Project deleted' });
            router.push('/projects');
        } catch (error) {
            toast({ title: 'Failed to delete project', description: getErrorMessage(error), variant: 'destructive' });
        }
    };

    const handleAiChunking = async () => {
        setAiChunking(true);
        setChunkProgress(10);
        setChunkProgressText('Preparing files...');
        const progressInterval = setInterval(() => {
            setChunkProgress(prev => Math.min(prev + 5, 90));
            setChunkProgressText(() => {
                const fileNum = Math.floor(Math.random() * (project?.total_files || 1)) + 1;
                return `Processing file ${fileNum} of ${project?.total_files}...`;
            });
        }, 2000);
        try {
            // Step 1: Analyze corpus
            setAiChunkingStep('Analyzing corpus...');
            const analysis = await projectsApi.analyze(projectId);
            setAnalysisResult(analysis);
            setShowAnalysis(true);

            const rec = analysis.corpus_recommendation || {};
            const method = rec.chunking_method || 'recursive';
            const size = rec.chunk_size || 512;
            const overlap = rec.overlap || 50;

            // Update local config to show what AI chose
            setChunkMethod(method);
            setChunkSize(size);
            setChunkOverlap(overlap);

            // Step 2: Chunk with AI-recommended settings
            setAiChunkingStep(`Chunking with ${method} (${size} tokens)...`);
            const result = await projectsApi.chunk(projectId, {
                chunking_method: method,
                chunk_size: size,
                overlap: overlap,
            });

            clearInterval(progressInterval);
            setChunkProgress(100);
            setChunkProgressText('Complete!');

            toast({
                title: 'AI Chunking Complete',
                description: `Analyzed corpus → recommended ${method} chunking → created ${result.total_chunks} chunks across ${result.files?.length || 0} files`,
            });

            fetchProject();
        } catch (error) {
            clearInterval(progressInterval);
            setChunkProgress(0);
            setChunkProgressText('');
            toast({ title: 'AI Chunking failed', description: getErrorMessage(error), variant: 'destructive' });
        } finally {
            setAiChunking(false);
            setAiChunkingStep('');
            setTimeout(() => { setChunkProgress(0); setChunkProgressText(''); }, 2000);
        }
    };

    const handleQuery = async () => {
        if (!queryText.trim()) return;
        setQuerying(true);
        try {
            const result = await apiClient.post('/api/v1/query/', {
                query: queryText,
                document_id: project?.files[0]?.id,
                top_k: 5,
                retrieval_method: retrievalStrategy === 'dense' ? 'vector' : retrievalStrategy,
            }).then(r => r.data);
            setQueryResult(result);
        } catch (error) {
            toast({ title: 'Query failed', description: getErrorMessage(error), variant: 'destructive' });
        } finally {
            setQuerying(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-transparent text-white font-sans">
                <Navbar />
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
                </div>
            </div>
        );
    }

    if (!project) {
        return (
            <div className="min-h-screen bg-transparent text-white font-sans">
                <Navbar />
                <div className="container mx-auto px-6 py-12 text-center">
                    <p className="text-zinc-400">Project not found</p>
                    <Link href="/projects" className="text-amber-400 hover:underline text-sm mt-2 inline-block">Back to Projects</Link>
                </div>
            </div>
        );
    }

    const hasCorpusConfig = project.corpus_config && Object.keys(project.corpus_config).length > 0;

    return (
        <div className="min-h-screen bg-transparent text-white font-sans">
            <Navbar />
            <div className="container mx-auto px-6 py-8 max-w-6xl">
                {/* Breadcrumb */}
                <Link href="/projects" className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-white transition-colors mb-6">
                    <ArrowLeft className="w-3.5 h-3.5" />
                    All Projects
                </Link>

                {/* Header */}
                <div className="flex items-start justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-black tracking-tight">{project.name}</h1>
                        {project.description && <p className="text-zinc-400 mt-1 text-sm">{project.description}</p>}
                        <div className="flex items-center gap-4 mt-3 text-xs text-zinc-500">
                            <span className="flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> {project.total_files} files</span>
                            <span className="flex items-center gap-1"><Layers className="w-3.5 h-3.5" /> {project.total_chunks} chunks</span>
                            {project.dominant_doc_type && (
                                <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] capitalize">{project.dominant_doc_type}</span>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={handleDeleteProject}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 hover:bg-red-500/5 transition-all"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                    </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Main column */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Upload zone */}
                        <div className="p-6 rounded-2xl bg-black/30 border border-white/5">
                            <h2 className="text-sm font-bold text-zinc-300 mb-3">Upload Files</h2>
                            <FileUploadZone
                                onFiles={handleFiles}
                                multiple
                                allowFolder
                                helpText="Drop files, a folder, or a ZIP archive"
                                supportedText="PDF, TXT, MD, DOCX, CSV, JSON, XML, YAML, HTML, Python, JS, TS, ZIP"
                                uploading={uploading}
                                compact
                            />
                        </div>

                        {/* File list */}
                        <div className="p-6 rounded-2xl bg-black/30 border border-white/5">
                            <h2 className="text-sm font-bold text-zinc-300 mb-3">
                                Files ({project.files.length})
                            </h2>

                            {project.files.length === 0 ? (
                                <p className="text-xs text-zinc-600 py-4 text-center">No files uploaded yet</p>
                            ) : (
                                <div className="max-h-96 overflow-y-auto rounded-xl border border-white/5">
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="border-b border-white/5 text-[10px] text-zinc-500 uppercase tracking-widest">
                                                <th className="text-left py-2 px-3">Name</th>
                                                <th className="text-left py-2 px-3">Type</th>
                                                <th className="text-left py-2 px-3">Size</th>
                                                <th className="text-left py-2 px-3">Status</th>
                                                <th className="py-2 px-3"></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {project.files.map((file) => (
                                                <tr key={file.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                                                    <td className="py-2 px-3 text-zinc-300 truncate max-w-[200px]">{file.original_filename}</td>
                                                    <td className="py-2 px-3">
                                                        <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[9px] uppercase text-zinc-400">
                                                            {file.file_type}
                                                        </span>
                                                    </td>
                                                    <td className="py-2 px-3 text-zinc-500">{formatBytes(file.file_size_bytes)}</td>
                                                    <td className="py-2 px-3">
                                                        {file.is_processed ? (
                                                            <span className="flex items-center gap-1 text-green-400">
                                                                <CheckCircle2 className="w-3 h-3" /> Processed
                                                            </span>
                                                        ) : (
                                                            <span className="flex items-center gap-1 text-amber-400">
                                                                <Clock className="w-3 h-3" /> Pending
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="py-2 px-3 text-right">
                                                        <button
                                                            onClick={() => handleDeleteFile(file.id)}
                                                            className="text-zinc-600 hover:text-red-400 transition-colors"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* Visualizer link for single PDF */}
                        {project.files.length === 1 && project.files[0].file_type === 'pdf' && project.total_chunks > 0 && (
                            <Link
                                href={`/visualizer?docId=${project.files[0].id}`}
                                className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-orange-500/10 border border-orange-500/20 text-orange-400 hover:bg-orange-500/20 text-sm font-bold transition-all"
                            >
                                <Eye className="w-4 h-4" />
                                View Chunks on Document
                            </Link>
                        )}

                        {/* Analysis Result */}
                        {showAnalysis && analysisResult && (
                            <div className="p-6 rounded-2xl bg-black/30 border border-white/5 space-y-4 animate-in fade-in slide-in-from-bottom-4">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-sm font-bold text-zinc-300 flex items-center gap-2">
                                        <BarChart3 className="w-4 h-4 text-amber-400" />
                                        Corpus Analysis
                                    </h2>
                                    <button onClick={() => setShowAnalysis(false)} className="text-zinc-600 hover:text-white text-xs">Hide</button>
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                                        <div className="text-[9px] uppercase tracking-widest text-zinc-500 mb-1">Total Files</div>
                                        <div className="text-xl font-black">{analysisResult.corpus_summary?.total_files}</div>
                                    </div>
                                    <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                                        <div className="text-[9px] uppercase tracking-widest text-zinc-500 mb-1">Successful</div>
                                        <div className="text-xl font-black text-green-400">{analysisResult.corpus_summary?.successful_files}</div>
                                    </div>
                                    <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                                        <div className="text-[9px] uppercase tracking-widest text-zinc-500 mb-1">Doc Type</div>
                                        <div className="text-base font-bold capitalize">{analysisResult.corpus_summary?.dominant_doc_type}</div>
                                    </div>
                                    <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                                        <div className="text-[9px] uppercase tracking-widest text-zinc-500 mb-1">Confidence</div>
                                        <div className="text-xl font-black text-amber-400">{Math.round((analysisResult.confidence_score || 0) * 100)}%</div>
                                    </div>
                                </div>

                                {/* Structure badges */}
                                <div className="flex gap-2 flex-wrap">
                                    {analysisResult.corpus_summary?.has_tables && (
                                        <span className="px-2 py-1 rounded text-[10px] bg-green-500/10 border border-green-500/20 text-green-400">Has Tables</span>
                                    )}
                                    {analysisResult.corpus_summary?.has_code && (
                                        <span className="px-2 py-1 rounded text-[10px] bg-blue-500/10 border border-blue-500/20 text-blue-400">Has Code</span>
                                    )}
                                    {analysisResult.corpus_summary?.has_headings && (
                                        <span className="px-2 py-1 rounded text-[10px] bg-purple-500/10 border border-purple-500/20 text-purple-400">Has Headings</span>
                                    )}
                                </div>

                                {/* Recommendation */}
                                <div className="p-4 rounded-xl bg-orange-500/5 border border-orange-500/20">
                                    <div className="text-[10px] uppercase tracking-widest text-orange-400 mb-2 font-bold">Recommendation</div>
                                    <div className="flex gap-4 flex-wrap text-sm">
                                        <span>Method: <strong>{analysisResult.corpus_recommendation?.chunking_method}</strong></span>
                                        <span>Size: <strong>{analysisResult.corpus_recommendation?.chunk_size}</strong></span>
                                        <span>Overlap: <strong>{analysisResult.corpus_recommendation?.overlap || 50}</strong></span>
                                    </div>
                                    <p className="text-[11px] text-orange-200/70 mt-2 italic">{analysisResult.reasoning}</p>
                                </div>

                                {/* Per-file */}
                                {analysisResult.files && analysisResult.files.length > 0 && (
                                    <div className="max-h-40 overflow-y-auto rounded-xl border border-white/5 bg-black/20">
                                        {analysisResult.files.map((f: any, i: number) => (
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
                            </div>
                        )}

                        {/* Query Testing */}
                        {project.total_chunks > 0 && (
                            <div className="p-6 rounded-2xl bg-black/30 border border-white/5 space-y-4">
                                <h2 className="text-sm font-bold text-zinc-300 flex items-center gap-2">
                                    <MessageSquare className="w-4 h-4 text-blue-400" />
                                    Query Testing
                                </h2>

                                <div className="flex gap-2">
                                    <input
                                        value={queryText}
                                        onChange={(e) => setQueryText(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
                                        placeholder="Ask a question about your documents..."
                                        className="flex-1 px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/50"
                                    />
                                    <select
                                        value={retrievalStrategy}
                                        onChange={(e) => setRetrievalStrategy(e.target.value)}
                                        className="px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white"
                                    >
                                        <option value="dense">Dense</option>
                                        <option value="hybrid">Hybrid</option>
                                        <option value="mmr">MMR</option>
                                    </select>
                                    <button
                                        onClick={handleQuery}
                                        disabled={querying || !queryText.trim()}
                                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 text-xs font-bold transition-all disabled:opacity-40"
                                    >
                                        {querying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                                        Ask
                                    </button>
                                </div>

                                {/* Query Results */}
                                {queryResult && queryResult.results && (
                                    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4">
                                        <div className="text-[10px] uppercase tracking-widest text-zinc-500">
                                            {queryResult.results.length} results ({queryResult.retrieval_method || retrievalStrategy})
                                        </div>
                                        {queryResult.results.map((chunk: any, i: number) => {
                                            const score = chunk.score ?? chunk.relevance_score ?? 0;
                                            const barColor = score > 0.8 ? 'bg-green-500' : score > 0.5 ? 'bg-amber-500' : 'bg-red-500';
                                            return (
                                                <div key={i} className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-2">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[10px] text-zinc-500 font-mono">Chunk #{chunk.chunk_index ?? i + 1}</span>
                                                        <span className="text-[10px] text-zinc-400 font-bold">{(score * 100).toFixed(1)}%</span>
                                                    </div>
                                                    {/* Relevance bar */}
                                                    <div className="w-full h-1.5 rounded-full bg-white/5 overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full ${barColor} transition-all duration-500`}
                                                            style={{ width: `${Math.max(score * 100, 2)}%` }}
                                                        />
                                                    </div>
                                                    <p className="text-xs text-zinc-300 leading-relaxed line-clamp-4 whitespace-pre-wrap">
                                                        {chunk.text || chunk.content || ''}
                                                    </p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-6">
                        {/* Actions */}
                        <div className="p-6 rounded-2xl bg-black/30 border border-white/5 space-y-3">
                            <h2 className="text-sm font-bold text-zinc-300 mb-1">Actions</h2>

                            {/* AI Analysis & Chunking - the main CTA */}
                            <button
                                onClick={handleAiChunking}
                                disabled={aiChunking || project.total_files === 0}
                                className="w-full flex flex-col items-center justify-center gap-1 py-3 rounded-xl bg-gradient-to-r from-purple-500/20 to-amber-500/20 border border-purple-500/30 text-white hover:from-purple-500/30 hover:to-amber-500/30 text-xs font-bold transition-all disabled:opacity-40"
                            >
                                <div className="flex items-center gap-2">
                                    {aiChunking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4 text-purple-400" />}
                                    <span>AI Analysis & Chunking</span>
                                </div>
                                {aiChunking && aiChunkingStep && (
                                    <span className="text-[10px] text-purple-300/70">{aiChunkingStep}</span>
                                )}
                                {!aiChunking && (
                                    <span className="text-[9px] text-zinc-500 font-normal">Analyzes corpus → suggests best strategy → auto-chunks</span>
                                )}
                            </button>

                            {/* Chunking Progress Bar */}
                            {chunkProgress > 0 && (
                                <div className="space-y-1.5 animate-in fade-in">
                                    <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
                                        <div
                                            className="h-full rounded-full bg-gradient-to-r from-purple-500 to-amber-500 transition-all duration-700 ease-out"
                                            style={{ width: `${chunkProgress}%` }}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between text-[10px]">
                                        <span className="text-zinc-500">{chunkProgressText}</span>
                                        <span className="text-zinc-400 font-mono">{chunkProgress}%</span>
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center gap-2 py-1">
                                <div className="flex-1 border-t border-white/5" />
                                <span className="text-[9px] text-zinc-600 uppercase tracking-widest">or manually</span>
                                <div className="flex-1 border-t border-white/5" />
                            </div>

                            <button
                                onClick={handleAnalyze}
                                disabled={analyzing || project.total_files === 0}
                                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 text-xs font-bold transition-all disabled:opacity-40"
                            >
                                {analyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                                Analyze Only
                            </button>

                            <button
                                onClick={() => setShowChunkConfig(!showChunkConfig)}
                                disabled={project.total_files === 0}
                                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 text-xs font-bold transition-all disabled:opacity-40"
                            >
                                <Settings2 className="w-3.5 h-3.5" />
                                Manual Chunking
                                {showChunkConfig ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>

                            {/* Chunk config panel */}
                            {showChunkConfig && (
                                <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-3 animate-in fade-in slide-in-from-top-2">
                                    <div>
                                        <label className="block text-[9px] uppercase tracking-widest text-zinc-500 mb-1">Method</label>
                                        <select
                                            value={chunkMethod}
                                            onChange={(e) => setChunkMethod(e.target.value)}
                                            className="w-full px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-xs text-white"
                                        >
                                            <option value="recursive">Recursive</option>
                                            <option value="fixed">Fixed Size</option>
                                            <option value="sentence">Sentence</option>
                                            <option value="paragraph">Paragraph</option>
                                            <option value="semantic">Semantic</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[9px] uppercase tracking-widest text-zinc-500 mb-1">Chunk Size</label>
                                        <input
                                            type="number"
                                            value={chunkSize}
                                            onChange={(e) => setChunkSize(Number(e.target.value))}
                                            min={50}
                                            max={10000}
                                            className="w-full px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-xs text-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[9px] uppercase tracking-widest text-zinc-500 mb-1">Overlap</label>
                                        <input
                                            type="number"
                                            value={chunkOverlap}
                                            onChange={(e) => setChunkOverlap(Number(e.target.value))}
                                            min={0}
                                            max={500}
                                            className="w-full px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-xs text-white"
                                        />
                                    </div>
                                    <button
                                        onClick={handleChunk}
                                        disabled={chunking}
                                        className="w-full py-2 rounded-lg bg-blue-500 hover:bg-blue-400 text-black text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {chunking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Layers className="w-3.5 h-3.5" />}
                                        {chunking ? 'Chunking...' : 'Run Chunking'}
                                    </button>
                                </div>
                            )}

                            <Link
                                href="/pipeline"
                                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/5 border border-white/10 text-zinc-300 hover:text-white hover:bg-white/10 text-xs font-bold transition-all"
                            >
                                Build Pipeline
                                <ArrowRight className="w-3.5 h-3.5" />
                            </Link>
                        </div>

                        {/* Corpus Config Card */}
                        {hasCorpusConfig && (
                            <div className="p-6 rounded-2xl bg-black/30 border border-white/5">
                                <h2 className="text-sm font-bold text-zinc-300 mb-3 flex items-center gap-2">
                                    <Settings2 className="w-4 h-4 text-amber-400" />
                                    Corpus Config
                                </h2>
                                <div className="space-y-2 text-xs">
                                    {Object.entries(project.corpus_config).map(([key, value]) => (
                                        <div key={key} className="flex items-center justify-between py-1 border-b border-white/5 last:border-0">
                                            <span className="text-zinc-500 capitalize">{key.replace(/_/g, ' ')}</span>
                                            <span className="text-white font-medium">{String(value)}</span>
                                        </div>
                                    ))}
                                </div>
                                <button
                                    onClick={() => {
                                        const rec = project.corpus_config;
                                        if (rec.chunking_method) setChunkMethod(rec.chunking_method);
                                        if (rec.chunk_size) setChunkSize(rec.chunk_size);
                                        if (rec.overlap) setChunkOverlap(rec.overlap);
                                        setShowChunkConfig(true);
                                    }}
                                    className="w-full mt-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-bold uppercase tracking-widest hover:bg-amber-500/20 transition-all"
                                >
                                    Apply to Chunking
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

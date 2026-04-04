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
    ArrowRight,
    Settings2,
    CheckCircle2,
    BrainCircuit,
    Search,
    MessageSquare,
    Eye,
    Archive,
    ArchiveRestore,
    Database,
} from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { FileUploadZone, isZipFile } from '@/components/ui/file-upload-zone';
import dynamic from 'next/dynamic';

const PipelineFlow = dynamic(
    () => import('@/components/analysis/PipelineFlow').then(mod => ({ default: mod.PipelineFlow })),
    {
        ssr: false,
        loading: () => (
            <div className="h-[500px] flex items-center justify-center bg-gray-50 rounded-xl border border-gray-200 text-gray-400 text-sm">
                Loading pipeline flow...
            </div>
        ),
    }
);
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
    analysis_result: Record<string, any> | null;
    content_profile: Record<string, any> | null;
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
    const [analysisResult, setAnalysisResult] = useState<any>(null);
    const [showAnalysis, setShowAnalysis] = useState(false);

    // Pipeline recommendation (from smart-analyze or ai-analyze)
    const [pipelineRec, setPipelineRec] = useState<any>(null);
    const [contentProfile, setContentProfile] = useState<any>(null);

    // AI Deep Analysis
    const [aiDeepAnalyzing, setAiDeepAnalyzing] = useState(false);
    const [aiDeepStep, setAiDeepStep] = useState('');

    // Query testing
    const [queryText, setQueryText] = useState('');
    const [querying, setQuerying] = useState(false);
    const [queryResult, setQueryResult] = useState<any>(null);
    const [retrievalStrategy, setRetrievalStrategy] = useState('hybrid');

    // Archive toggle
    const [togglingArchive, setTogglingArchive] = useState(false);

    const fetchProject = useCallback(async () => {
        try {
            setLoading(true);
            const data = await projectsApi.get(projectId);
            setProject(data);

            // Restore saved analysis results so they survive page refreshes
            if (data.analysis_result?.pipeline_recommendation) {
                setPipelineRec(data.analysis_result.pipeline_recommendation);
            } else if (data.analysis_result?.recommendation) {
                setPipelineRec(data.analysis_result.recommendation);
            }
            if (data.content_profile) {
                setContentProfile(data.content_profile);
            }
            if (data.analysis_result) {
                setAnalysisResult(data.analysis_result);
                setShowAnalysis(true);
            }
        } catch (error) {
            toast({ title: 'Failed to load project', description: getErrorMessage(error), variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    }, [projectId, toast]);

    useEffect(() => {
        fetchProject();
    }, [fetchProject]);


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
        setPipelineRec(null);
        try {
            const result = await projectsApi.analyze(projectId);
            setAnalysisResult(result);
            setShowAnalysis(true);

            // Store pipeline recommendation if present
            if (result.pipeline_recommendation) {
                setPipelineRec(result.pipeline_recommendation);
            }

            // Re-fetch project to get persisted analysis_result from backend
            const updated = await projectsApi.get(projectId);
            setProject(updated);

            toast({ title: 'Corpus analysis complete' });
        } catch (error) {
            toast({ title: 'Analysis failed', description: getErrorMessage(error), variant: 'destructive' });
        } finally {
            setAnalyzing(false);
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

    const handleToggleArchive = async () => {
        if (!project) return;
        setTogglingArchive(true);
        try {
            const newStatus = project.status === 'archived' ? 'active' : 'archived';
            await projectsApi.update(projectId, { status: newStatus });
            toast({ title: newStatus === 'archived' ? 'Project archived' : 'Project unarchived' });
            fetchProject();
        } catch (error) {
            toast({ title: 'Failed to update status', description: getErrorMessage(error), variant: 'destructive' });
        } finally {
            setTogglingArchive(false);
        }
    };

    const handleBuildPipeline = () => {
        if (!pipelineRec) return;
        // Store recommendation for pipeline page to pick up
        localStorage.setItem('pipeline_recommendation', JSON.stringify({
            projectId,
            recommendation: pipelineRec,
            contentProfile: contentProfile,
        }));
        router.push(`/pipeline?projectId=${projectId}`);
    };

    const handleAiDeepAnalysis = async () => {
        setAiDeepAnalyzing(true);
        setAiDeepStep('Profiling corpus with AI...');
        setPipelineRec(null);
        setContentProfile(null);
        try {
            const result = await projectsApi.aiAnalyze(projectId);
            setContentProfile(result.content_profile);
            setPipelineRec(result.recommendation);
            setAiDeepStep('');

            // Re-fetch project to get persisted analysis from backend
            const updated = await projectsApi.get(projectId);
            setProject(updated);

            toast({ title: 'AI Analysis Complete', description: result.recommendation?.summary || 'Pipeline selected' });
        } catch (error) {
            setAiDeepStep('');
            toast({ title: 'AI Analysis Failed', description: getErrorMessage(error), variant: 'destructive' });
        } finally {
            setAiDeepAnalyzing(false);
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
            <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
                <Navbar />
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
            </div>
        );
    }

    if (!project) {
        return (
            <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
                <Navbar />
                <div className="container mx-auto px-6 py-12 text-center">
                    <p className="text-gray-500">Project not found</p>
                    <Link href="/projects" className="text-amber-600 hover:underline text-sm mt-2 inline-block">Back to Projects</Link>
                </div>
            </div>
        );
    }

    const hasCorpusConfig = project.corpus_config && Object.keys(project.corpus_config).length > 0;

    return (
        <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
            <Navbar />
            <div className="container mx-auto px-6 py-8 max-w-6xl">
                {/* Breadcrumb */}
                <Link href="/projects" className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-900 transition-colors mb-6">
                    <ArrowLeft className="w-3.5 h-3.5" />
                    All Projects
                </Link>

                {/* Header */}
                <div className="flex items-start justify-between mb-8">
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-3xl font-black tracking-tight text-gray-900">{project.name}</h1>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
                                project.status === 'archived'
                                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                    : 'bg-green-50 text-green-700 border border-green-200'
                            }`}>
                                {project.status === 'archived' ? 'Archived' : 'Active'}
                            </span>
                        </div>
                        {project.description && <p className="text-gray-500 mt-1 text-sm">{project.description}</p>}
                        <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                            <span className="flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> {project.total_files} files</span>
                            <span className="flex items-center gap-1"><Layers className="w-3.5 h-3.5" /> {project.total_chunks} chunks</span>
                            {project.dominant_doc_type && (
                                <span className="px-1.5 py-0.5 rounded bg-gray-100 border border-gray-200 text-[10px] capitalize">{project.dominant_doc_type}</span>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleToggleArchive}
                            disabled={togglingArchive}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all ${
                                project.status === 'archived'
                                    ? 'text-green-600 hover:text-green-700 border border-green-200 hover:border-green-300 hover:bg-green-50'
                                    : 'text-amber-600 hover:text-amber-700 border border-amber-200 hover:border-amber-300 hover:bg-amber-50'
                            }`}
                        >
                            {togglingArchive ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : project.status === 'archived' ? (
                                <ArchiveRestore className="w-3.5 h-3.5" />
                            ) : (
                                <Archive className="w-3.5 h-3.5" />
                            )}
                            {project.status === 'archived' ? 'Unarchive' : 'Archive'}
                        </button>
                        <button
                            onClick={handleDeleteProject}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-red-500 hover:text-red-600 border border-red-200 hover:border-red-300 hover:bg-red-50 transition-all"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Main column */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Upload zone */}
                        <div className="p-6 rounded-2xl bg-white border border-gray-200 shadow-sm">
                            <h2 className="text-sm font-bold text-gray-700 mb-3">Upload Files</h2>
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
                        <div className="p-6 rounded-2xl bg-white border border-gray-200 shadow-sm">
                            <h2 className="text-sm font-bold text-gray-700 mb-3">
                                Files ({project.files.length})
                            </h2>

                            {project.files.length === 0 ? (
                                <p className="text-xs text-gray-400 py-4 text-center">No files uploaded yet</p>
                            ) : (
                                <div className="max-h-96 overflow-y-auto rounded-xl border border-gray-200">
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="border-b border-gray-200 text-[10px] text-gray-400 uppercase tracking-widest">
                                                <th className="text-left py-2 px-3">Name</th>
                                                <th className="text-left py-2 px-3">Type</th>
                                                <th className="text-left py-2 px-3">Size</th>
                                                <th className="text-left py-2 px-3">Status</th>
                                                <th className="py-2 px-3"></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {project.files.map((file) => (
                                                <tr key={file.id} className="border-b border-gray-200 last:border-0 hover:bg-gray-50">
                                                    <td className="py-2 px-3 text-gray-700 truncate max-w-[200px]">{file.original_filename}</td>
                                                    <td className="py-2 px-3">
                                                        <span className="px-1.5 py-0.5 rounded bg-gray-50 border border-gray-300 text-[9px] uppercase text-gray-500">
                                                            {file.file_type}
                                                        </span>
                                                    </td>
                                                    <td className="py-2 px-3 text-gray-400">{formatBytes(file.file_size_bytes)}</td>
                                                    <td className="py-2 px-3">
                                                        {file.is_processed ? (
                                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-green-50 border border-green-200 text-green-600 text-[10px] font-medium">
                                                                <CheckCircle2 className="w-3 h-3" /> Ready
                                                            </span>
                                                        ) : (
                                                            <span
                                                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-600 text-[10px] font-medium"
                                                                title="File is being extracted and indexed for RAG. This usually takes a few seconds."
                                                            >
                                                                <Loader2 className="w-3 h-3 animate-spin" /> Processing...
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="py-2 px-3 text-right">
                                                        <button
                                                            onClick={() => handleDeleteFile(file.id)}
                                                            className="text-gray-400 hover:text-red-400 transition-colors"
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
                                className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 hover:bg-amber-100 text-sm font-bold transition-all"
                            >
                                <Eye className="w-4 h-4" />
                                View Chunks on Document
                            </Link>
                        )}

                        {/* Content Profile from AI Analysis */}
                        {contentProfile && (
                            <div className="p-6 rounded-2xl bg-white border border-blue-200 shadow-sm space-y-4 animate-in fade-in slide-in-from-bottom-4">
                                <h2 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                                    <BrainCircuit className="w-4 h-4 text-blue-600" />
                                    AI Content Understanding
                                </h2>
                                <p className="text-[11px] text-gray-500 leading-relaxed italic border-l-2 border-blue-300 pl-3">
                                    {contentProfile.reasoning}
                                </p>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="p-3 rounded-xl bg-white border border-gray-200">
                                        <div className="text-[9px] text-gray-400 uppercase tracking-wider mb-1">Domain</div>
                                        <div className="text-xs text-gray-900 font-bold capitalize">{contentProfile.domain}</div>
                                    </div>
                                    <div className="p-3 rounded-xl bg-white border border-gray-200">
                                        <div className="text-[9px] text-gray-400 uppercase tracking-wider mb-1">Structure</div>
                                        <div className="text-xs text-gray-900 font-bold capitalize">{contentProfile.structure_level}</div>
                                    </div>
                                    <div className="p-3 rounded-xl bg-white border border-gray-200">
                                        <div className="text-[9px] text-gray-400 uppercase tracking-wider mb-1">Complexity</div>
                                        <div className="text-xs text-gray-900 font-bold capitalize">{contentProfile.language_complexity}</div>
                                    </div>
                                    <div className="p-3 rounded-xl bg-white border border-gray-200">
                                        <div className="text-[9px] text-gray-400 uppercase tracking-wider mb-1">Relationships</div>
                                        <div className="text-xs text-gray-900 font-bold capitalize">{contentProfile.relationship_type?.replace(/_/g, ' ')}</div>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {contentProfile.content_types?.map((t: string, i: number) => (
                                        <span key={i} className="px-2 py-0.5 rounded-full text-[10px] bg-blue-50 border border-blue-200 text-blue-500">
                                            {t.replace(/_/g, ' ')}
                                        </span>
                                    ))}
                                    {contentProfile.expected_query_types?.map((t: string, i: number) => (
                                        <span key={`q-${i}`} className="px-2 py-0.5 rounded-full text-[10px] bg-green-50 border border-green-200 text-green-500">
                                            {t.replace(/_/g, ' ')}
                                        </span>
                                    ))}
                                </div>
                                {contentProfile.has_formulas && <span className="text-[10px] text-amber-600">Contains formulas</span>}
                                {contentProfile.has_code && <span className="text-[10px] text-cyan-600 ml-3">Contains code</span>}
                                {contentProfile.has_tables && <span className="text-[10px] text-purple-600 ml-3">Contains tables</span>}
                                {contentProfile.has_cross_references && <span className="text-[10px] text-amber-600 ml-3">Has cross-references</span>}
                                {contentProfile.key_observations?.length > 0 && (
                                    <div className="space-y-1">
                                        <div className="text-[9px] text-gray-400 uppercase tracking-wider">Key Observations</div>
                                        {contentProfile.key_observations.map((obs: string, i: number) => (
                                            <p key={i} className="text-[11px] text-gray-500 pl-3 border-l border-gray-200">{obs}</p>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Pipeline Recommendation */}
                        {pipelineRec && (
                            <PipelineFlow
                                recommendation={pipelineRec}
                                onBuildPipeline={handleBuildPipeline}
                            />
                        )}

                        {/* Query Testing */}
                        {project.total_chunks > 0 && (
                            <div className="p-6 rounded-2xl bg-white border border-gray-200 shadow-sm space-y-4">
                                <h2 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                                    <MessageSquare className="w-4 h-4 text-blue-600" />
                                    Query Testing
                                </h2>

                                <div className="flex gap-2">
                                    <input
                                        value={queryText}
                                        onChange={(e) => setQueryText(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
                                        placeholder="Ask a question about your documents..."
                                        className="flex-1 px-4 py-2.5 rounded-xl bg-white border border-gray-300 text-gray-900 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400"
                                    />
                                    <select
                                        value={retrievalStrategy}
                                        onChange={(e) => setRetrievalStrategy(e.target.value)}
                                        className="px-3 py-2.5 rounded-xl bg-white border border-gray-300 text-xs text-gray-700"
                                    >
                                        <option value="dense">Dense</option>
                                        <option value="hybrid">Hybrid</option>
                                        <option value="mmr">MMR</option>
                                    </select>
                                    <button
                                        onClick={handleQuery}
                                        disabled={querying || !queryText.trim()}
                                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 hover:bg-blue-100 text-xs font-bold transition-all disabled:opacity-40"
                                    >
                                        {querying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                                        Ask
                                    </button>
                                </div>

                                {/* Query Results */}
                                {queryResult && queryResult.results && (
                                    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4">
                                        <div className="text-[10px] uppercase tracking-widest text-gray-400">
                                            {queryResult.results.length} results ({queryResult.retrieval_method || retrievalStrategy})
                                        </div>
                                        {queryResult.results.map((chunk: any, i: number) => {
                                            const score = chunk.score ?? chunk.relevance_score ?? 0;
                                            const barColor = score > 0.8 ? 'bg-green-500' : score > 0.5 ? 'bg-amber-500' : 'bg-red-500';
                                            return (
                                                <div key={i} className="p-4 rounded-xl bg-white border border-gray-200 space-y-2">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[10px] text-gray-400 font-mono">Chunk #{chunk.chunk_index ?? i + 1}</span>
                                                        <span className="text-[10px] text-gray-500 font-bold">{(score * 100).toFixed(1)}%</span>
                                                    </div>
                                                    {/* Relevance bar */}
                                                    <div className="w-full h-1.5 rounded-full bg-gray-50 overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full ${barColor} transition-all duration-500`}
                                                            style={{ width: `${Math.max(score * 100, 2)}%` }}
                                                        />
                                                    </div>
                                                    <p className="text-xs text-gray-700 leading-relaxed line-clamp-4 whitespace-pre-wrap">
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
                        <div className="p-6 rounded-2xl bg-white border border-gray-200 shadow-sm space-y-3">
                            <h2 className="text-sm font-bold text-gray-700 mb-1">Actions</h2>

                            {/* AI Analysis - show badge if done, button if not */}
                            {project?.analysis_result ? (
                                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                            <span className="text-sm font-semibold text-emerald-800">AI Analysis Complete</span>
                                        </div>
                                        <span className="text-[10px] text-emerald-500">
                                            {project.analysis_result.analyzed_at
                                                ? new Date(project.analysis_result.analyzed_at).toLocaleDateString()
                                                : ''}
                                        </span>
                                    </div>
                                    <p className="text-xs text-emerald-600 mt-1">Pipeline recommendation ready. Click &quot;Build Pipeline&quot; to proceed.</p>
                                </div>
                            ) : (
                                <button
                                    onClick={handleAiDeepAnalysis}
                                    disabled={aiDeepAnalyzing || project.total_files === 0}
                                    className="w-full flex flex-col items-center justify-center gap-1 py-3 rounded-xl bg-gray-900 text-white hover:bg-gray-800 text-xs font-bold transition-all disabled:opacity-40"
                                >
                                    <div className="flex items-center gap-2">
                                        {aiDeepAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <BrainCircuit className="w-4 h-4 text-blue-600" />}
                                        <span>AI Analysis</span>
                                    </div>
                                    {aiDeepAnalyzing && aiDeepStep && (
                                        <span className="text-[10px] text-blue-500">{aiDeepStep}</span>
                                    )}
                                    {!aiDeepAnalyzing && (
                                        <span className="text-[9px] text-gray-400 font-normal">AI reads your data and selects the optimal pipeline</span>
                                    )}
                                </button>
                            )}

                            <Link
                                href="/pipeline"
                                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-700 hover:text-gray-900 hover:bg-gray-50 text-xs font-bold transition-all"
                            >
                                Open Pipeline Builder
                                <ArrowRight className="w-3.5 h-3.5" />
                            </Link>

                            {/* Build Pipeline shortcut - always visible when recommendation exists */}
                            {pipelineRec && (
                                <button
                                    onClick={handleBuildPipeline}
                                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gray-900 text-white hover:bg-gray-800 text-xs font-bold transition-all"
                                >
                                    Build Pipeline
                                    <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                            )}

                            {/* Chunk status */}
                            {project?.total_chunks > 0 && (
                                <div className="p-4 rounded-xl bg-blue-50 border border-blue-200">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Database className="w-4 h-4 text-blue-600" />
                                        <span className="text-sm font-semibold text-blue-800">
                                            {project.total_chunks.toLocaleString()} Chunks Ready
                                        </span>
                                    </div>
                                    <p className="text-xs text-blue-600 mb-3">
                                        Your data is indexed and ready for querying. No need to re-run the pipeline.
                                    </p>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => router.push(`/pipeline?projectId=${projectId}`)}
                                            className="flex-1 py-2 text-xs font-medium text-blue-700 bg-white border border-blue-200 rounded-lg hover:bg-blue-50"
                                        >
                                            Open Pipeline
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Corpus Config Card */}
                        {hasCorpusConfig && (
                            <div className="p-6 rounded-2xl bg-white border border-gray-200 shadow-sm">
                                <h2 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                                    <Settings2 className="w-4 h-4 text-amber-600" />
                                    Corpus Config
                                </h2>
                                <div className="space-y-2 text-xs">
                                    {Object.entries(project.corpus_config)
                                        .filter(([, value]) => typeof value !== 'object' || value === null)
                                        .map(([key, value]) => (
                                        <div key={key} className="flex items-center justify-between py-1 border-b border-gray-200 last:border-0">
                                            <span className="text-gray-400 capitalize">{key.replace(/_/g, ' ')}</span>
                                            <span className="text-gray-900 font-medium">{String(value ?? '-')}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

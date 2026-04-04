'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { projectsApi } from '@/lib/api';
import {
    Plus,
    FolderOpen,
    FileText,
    Layers,
    Loader2,
    Archive,
    X,
    Scale,
    Code,
    GraduationCap,
    TrendingUp,
    MessageCircle,
    ArrowLeft,
    MoreHorizontal,
    ArchiveRestore,
    Trash2,
} from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { useToast } from '@/components/ui/use-toast';
import { getErrorMessage } from '@/lib/utils';

interface Project {
    id: string;
    name: string;
    description: string | null;
    total_files: number;
    total_chunks: number;
    dominant_doc_type: string | null;
    corpus_config: Record<string, any>;
    status: string;
    created_at: string;
    updated_at: string | null;
}

function relativeTime(dateStr: string): string {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay === 1) return 'yesterday';
    if (diffDay < 30) return `${diffDay}d ago`;
    return date.toLocaleDateString();
}

function formatChunks(n: number): string {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return n.toString();
}

export default function ProjectsPage() {
    const [activeProjects, setActiveProjects] = useState<Project[]>([]);
    const [archivedProjects, setArchivedProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<'active' | 'archived'>('active');
    const [showCreate, setShowCreate] = useState(false);
    const [createStep, setCreateStep] = useState<1 | 2>(1);
    const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
    const [createName, setCreateName] = useState('');
    const [createDesc, setCreateDesc] = useState('');
    const [creating, setCreating] = useState(false);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const { toast } = useToast();

    const templates = [
        { id: 'legal', label: 'Legal Q&A', icon: Scale, color: 'text-amber-600', method: 'semantic', size: 400, overlap: 80 },
        { id: 'code', label: 'Codebase Search', icon: Code, color: 'text-blue-600', method: 'code_aware', size: 400, overlap: 0 },
        { id: 'academic', label: 'Academic Research', icon: GraduationCap, color: 'text-purple-600', method: 'heading_based', size: 600, overlap: 75 },
        { id: 'finance', label: 'Financial Analysis', icon: TrendingUp, color: 'text-green-600', method: 'semantic', size: 400, overlap: 80 },
        { id: 'support', label: 'Customer Support', icon: MessageCircle, color: 'text-cyan-600', method: 'sentence_window', size: 256, overlap: 30 },
        { id: 'blank', label: 'Start Blank', icon: Plus, color: 'text-gray-400', method: null, size: null, overlap: null },
    ] as const;

    const fetchProjects = useCallback(async () => {
        try {
            setLoading(true);
            const [activeData, archivedData] = await Promise.all([
                projectsApi.list({ status: 'active' }),
                projectsApi.list({ status: 'archived' }),
            ]);
            setActiveProjects(activeData.projects || []);
            setArchivedProjects(archivedData.projects || []);
        } catch (error) {
            toast({ title: 'Failed to load projects', description: getErrorMessage(error), variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        fetchProjects();
    }, [fetchProjects]);

    // Close menu when clicking outside
    useEffect(() => {
        if (!openMenuId) return;
        const handler = () => setOpenMenuId(null);
        document.addEventListener('click', handler);
        return () => document.removeEventListener('click', handler);
    }, [openMenuId]);

    const openCreateModal = () => {
        setShowCreate(true);
        setCreateStep(1);
        setSelectedTemplate(null);
        setCreateName('');
        setCreateDesc('');
    };

    const handleSelectTemplate = (templateId: string) => {
        setSelectedTemplate(templateId);
        setCreateStep(2);
    };

    const handleCreate = async () => {
        if (!createName.trim()) return;
        setCreating(true);
        try {
            const result = await projectsApi.create({ name: createName.trim(), description: createDesc.trim() || undefined });
            if (selectedTemplate && selectedTemplate !== 'blank') {
                const tpl = templates.find(t => t.id === selectedTemplate);
                if (tpl && tpl.method) {
                    try {
                        localStorage.setItem(`project_template_${result.id}`, JSON.stringify({
                            chunking_method: tpl.method,
                            chunk_size: tpl.size,
                            overlap: tpl.overlap,
                        }));
                    } catch {
                        // localStorage not available, skip
                    }
                }
            }
            toast({ title: 'Project created' });
            setShowCreate(false);
            setCreateName('');
            setCreateDesc('');
            setSelectedTemplate(null);
            fetchProjects();
        } catch (error) {
            toast({ title: 'Failed to create project', description: getErrorMessage(error), variant: 'destructive' });
        } finally {
            setCreating(false);
        }
    };

    const handleArchive = async (projectId: string) => {
        try {
            await projectsApi.update(projectId, { status: 'archived' });
            toast({ title: 'Project archived' });
            fetchProjects();
        } catch (error) {
            toast({ title: 'Failed to archive', description: getErrorMessage(error), variant: 'destructive' });
        }
        setOpenMenuId(null);
    };

    const handleUnarchive = async (projectId: string) => {
        try {
            await projectsApi.update(projectId, { status: 'active' });
            toast({ title: 'Project restored' });
            fetchProjects();
        } catch (error) {
            toast({ title: 'Failed to restore', description: getErrorMessage(error), variant: 'destructive' });
        }
        setOpenMenuId(null);
    };

    const handleDelete = async (projectId: string) => {
        try {
            await projectsApi.delete(projectId);
            toast({ title: 'Project deleted' });
            fetchProjects();
        } catch (error) {
            toast({ title: 'Failed to delete', description: getErrorMessage(error), variant: 'destructive' });
        }
        setOpenMenuId(null);
    };

    const currentProjects = tab === 'active' ? activeProjects : archivedProjects;

    return (
        <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
            <Navbar />
            <div className="container mx-auto px-6 py-12 max-w-6xl">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-4xl font-black tracking-tight text-gray-900">Projects</h1>
                        <p className="text-gray-500 mt-1">Organize files into RAG knowledge bases</p>
                    </div>
                    <button
                        onClick={openCreateModal}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-gray-900 hover:bg-gray-800 text-white font-bold text-sm transition-all hover:scale-105"
                    >
                        <Plus className="w-4 h-4" />
                        New Project
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-2 mb-8">
                    <button
                        onClick={() => setTab('active')}
                        className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${
                            tab === 'active'
                                ? 'bg-gray-900 text-white'
                                : 'text-gray-500 hover:text-gray-700 border border-gray-200 bg-white'
                        }`}
                    >
                        Active ({activeProjects.length})
                    </button>
                    <button
                        onClick={() => setTab('archived')}
                        className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${
                            tab === 'archived'
                                ? 'bg-gray-900 text-white'
                                : 'text-gray-500 hover:text-gray-700 border border-gray-200 bg-white'
                        }`}
                    >
                        Archived ({archivedProjects.length})
                    </button>
                </div>

                {/* Create Modal */}
                {showCreate && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
                        <div className="w-full max-w-2xl p-8 rounded-2xl bg-white border border-gray-200 shadow-xl">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    {createStep === 2 && (
                                        <button onClick={() => setCreateStep(1)} className="text-gray-400 hover:text-gray-900 transition-colors">
                                            <ArrowLeft className="w-4 h-4" />
                                        </button>
                                    )}
                                    <h2 className="text-xl font-black text-gray-900">
                                        {createStep === 1 ? 'Pick a Template' : 'Name Your Project'}
                                    </h2>
                                </div>
                                <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-900 transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {createStep === 1 && (
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                    {templates.map((tpl) => {
                                        const Icon = tpl.icon;
                                        return (
                                            <button
                                                key={tpl.id}
                                                onClick={() => handleSelectTemplate(tpl.id)}
                                                className="group flex flex-col items-center gap-3 p-5 rounded-xl bg-gray-50 border border-gray-200 hover:border-gray-300 hover:bg-white hover:shadow-sm transition-all text-center"
                                            >
                                                <div className={`w-10 h-10 rounded-xl bg-white border border-gray-200 flex items-center justify-center ${tpl.color} group-hover:scale-110 transition-transform`}>
                                                    <Icon className="w-5 h-5" />
                                                </div>
                                                <span className="text-sm font-bold text-gray-700 group-hover:text-gray-900 transition-colors">{tpl.label}</span>
                                                {tpl.method && (
                                                    <span className="text-[9px] text-gray-400 uppercase tracking-widest">{tpl.method} / {tpl.size}</span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {createStep === 2 && (
                                <div className="space-y-4">
                                    {selectedTemplate && selectedTemplate !== 'blank' && (
                                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-500">
                                            Template: <span className="text-gray-900 font-bold">{templates.find(t => t.id === selectedTemplate)?.label}</span>
                                        </div>
                                    )}
                                    <div>
                                        <label className="block text-[10px] uppercase tracking-widest text-gray-400 mb-1.5">Name</label>
                                        <input
                                            value={createName}
                                            onChange={(e) => setCreateName(e.target.value)}
                                            placeholder="e.g., Legal Contracts Corpus"
                                            className="w-full px-4 py-2.5 rounded-xl bg-white border border-gray-300 text-gray-900 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400"
                                            autoFocus
                                            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] uppercase tracking-widest text-gray-400 mb-1.5">Description (optional)</label>
                                        <textarea
                                            value={createDesc}
                                            onChange={(e) => setCreateDesc(e.target.value)}
                                            placeholder="What this project contains..."
                                            rows={3}
                                            className="w-full px-4 py-2.5 rounded-xl bg-white border border-gray-300 text-gray-900 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 resize-none"
                                        />
                                    </div>
                                    <div className="flex gap-3 mt-6">
                                        <button
                                            onClick={() => setCreateStep(1)}
                                            className="flex-1 py-2.5 rounded-xl text-gray-500 text-sm font-medium hover:text-gray-900 transition-colors"
                                        >
                                            Back
                                        </button>
                                        <button
                                            onClick={handleCreate}
                                            disabled={!createName.trim() || creating}
                                            className="flex-1 py-2.5 rounded-xl bg-gray-900 hover:bg-gray-800 text-white font-bold text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                        >
                                            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                            Create
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Loading */}
                {loading && (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                    </div>
                )}

                {/* Empty state */}
                {!loading && currentProjects.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        {tab === 'active' ? (
                            <>
                                <FolderOpen className="w-12 h-12 text-gray-300 mb-4" />
                                <h3 className="text-lg font-bold text-gray-500 mb-1">No active projects</h3>
                                <p className="text-sm text-gray-400 mb-6">Create a project to start building your RAG knowledge base</p>
                                <button
                                    onClick={openCreateModal}
                                    className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-gray-900 hover:bg-gray-800 text-white font-bold text-sm transition-all"
                                >
                                    <Plus className="w-4 h-4" />
                                    Create Your First Project
                                </button>
                            </>
                        ) : (
                            <>
                                <Archive className="w-12 h-12 text-gray-300 mb-4" />
                                <h3 className="text-lg font-bold text-gray-500 mb-1">No archived projects</h3>
                                <p className="text-sm text-gray-400">Archived projects will appear here</p>
                            </>
                        )}
                    </div>
                )}

                {/* Project Grid */}
                {!loading && currentProjects.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {currentProjects.map((project) => (
                            <div
                                key={project.id}
                                className="group relative p-6 rounded-xl bg-white border border-gray-200 shadow-sm hover:border-gray-300 hover:shadow-md transition-all"
                            >
                                <Link
                                    href={`/projects/${project.id}`}
                                    className="absolute inset-0 z-0 rounded-xl"
                                    aria-label={`Open ${project.name}`}
                                />

                                <div className="relative z-10 pointer-events-none">
                                    <div className="flex items-start justify-between mb-3">
                                        <h3 className="text-lg font-bold text-gray-900 group-hover:text-amber-600 transition-colors truncate pr-8">
                                            {project.name}
                                        </h3>
                                        <div className="relative pointer-events-auto">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setOpenMenuId(openMenuId === project.id ? null : project.id);
                                                }}
                                                className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-900 transition-colors"
                                            >
                                                <MoreHorizontal className="w-4 h-4" />
                                            </button>

                                            {openMenuId === project.id && (
                                                <div className="absolute right-0 top-8 w-40 py-1 rounded-xl bg-white border border-gray-200 shadow-lg z-50">
                                                    {tab === 'active' ? (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleArchive(project.id);
                                                            }}
                                                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors"
                                                        >
                                                            <Archive className="w-3.5 h-3.5" />
                                                            Archive
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleUnarchive(project.id);
                                                            }}
                                                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors"
                                                        >
                                                            <ArchiveRestore className="w-3.5 h-3.5" />
                                                            Unarchive
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDelete(project.id);
                                                        }}
                                                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                        Delete
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {project.description && (
                                        <p className="text-xs text-gray-500 mb-4 line-clamp-2">{project.description}</p>
                                    )}

                                    <div className="flex items-center gap-4 text-xs text-gray-500">
                                        <span className="flex items-center gap-1">
                                            <FileText className="w-3.5 h-3.5" />
                                            {project.total_files} file{project.total_files !== 1 ? 's' : ''}
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <Layers className="w-3.5 h-3.5" />
                                            {formatChunks(project.total_chunks)} chunks
                                        </span>
                                        {project.dominant_doc_type && (
                                            <span className="px-1.5 py-0.5 rounded bg-gray-100 border border-gray-200 text-[10px] capitalize">
                                                {project.dominant_doc_type}
                                            </span>
                                        )}
                                    </div>

                                    <div className="text-[10px] text-gray-400 mt-3">
                                        Updated {relativeTime(project.updated_at || project.created_at)}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

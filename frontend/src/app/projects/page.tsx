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
}

export default function ProjectsPage() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [createName, setCreateName] = useState('');
    const [createDesc, setCreateDesc] = useState('');
    const [creating, setCreating] = useState(false);
    const { toast } = useToast();

    const fetchProjects = useCallback(async () => {
        try {
            setLoading(true);
            const data = await projectsApi.list();
            setProjects(data.projects || []);
        } catch (error) {
            toast({ title: 'Failed to load projects', description: getErrorMessage(error), variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        fetchProjects();
    }, [fetchProjects]);

    const handleCreate = async () => {
        if (!createName.trim()) return;
        setCreating(true);
        try {
            await projectsApi.create({ name: createName.trim(), description: createDesc.trim() || undefined });
            toast({ title: 'Project created' });
            setShowCreate(false);
            setCreateName('');
            setCreateDesc('');
            fetchProjects();
        } catch (error) {
            toast({ title: 'Failed to create project', description: getErrorMessage(error), variant: 'destructive' });
        } finally {
            setCreating(false);
        }
    };

    return (
        <div className="min-h-screen bg-transparent text-white font-sans">
            <Navbar />
            <div className="container mx-auto px-6 py-12 max-w-6xl">
                {/* Header */}
                <div className="flex items-center justify-between mb-10">
                    <div>
                        <h1 className="text-4xl font-black tracking-tight">Projects</h1>
                        <p className="text-zinc-400 mt-1">Organize files into RAG knowledge bases</p>
                    </div>
                    <button
                        onClick={() => setShowCreate(true)}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition-all hover:scale-105"
                    >
                        <Plus className="w-4 h-4" />
                        New Project
                    </button>
                </div>

                {/* Create Modal */}
                {showCreate && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                        <div className="w-full max-w-md p-8 rounded-3xl bg-zinc-900 border border-white/10 shadow-2xl">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-black">New Project</h2>
                                <button onClick={() => setShowCreate(false)} className="text-zinc-500 hover:text-white transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5">Name</label>
                                    <input
                                        value={createName}
                                        onChange={(e) => setCreateName(e.target.value)}
                                        placeholder="e.g., Legal Contracts Corpus"
                                        className="w-full px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50"
                                        autoFocus
                                        onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5">Description (optional)</label>
                                    <textarea
                                        value={createDesc}
                                        onChange={(e) => setCreateDesc(e.target.value)}
                                        placeholder="What this project contains..."
                                        rows={3}
                                        className="w-full px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 resize-none"
                                    />
                                </div>
                            </div>
                            <div className="flex gap-3 mt-6">
                                <button
                                    onClick={() => setShowCreate(false)}
                                    className="flex-1 py-2.5 rounded-xl text-zinc-400 text-sm font-medium hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleCreate}
                                    disabled={!createName.trim() || creating}
                                    className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                    Create
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Loading */}
                {loading && (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
                    </div>
                )}

                {/* Empty state */}
                {!loading && projects.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <FolderOpen className="w-12 h-12 text-zinc-700 mb-4" />
                        <h3 className="text-lg font-bold text-zinc-400 mb-1">No projects yet</h3>
                        <p className="text-sm text-zinc-600 mb-6">Create a project to start building your RAG knowledge base</p>
                        <button
                            onClick={() => setShowCreate(true)}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition-all"
                        >
                            <Plus className="w-4 h-4" />
                            Create Your First Project
                        </button>
                    </div>
                )}

                {/* Project Grid */}
                {!loading && projects.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {projects.map((project) => (
                            <Link
                                key={project.id}
                                href={`/projects/${project.id}`}
                                className="group p-6 rounded-2xl bg-black/30 border border-white/5 hover:border-white/15 hover:bg-black/50 transition-all"
                            >
                                <div className="flex items-start justify-between mb-3">
                                    <h3 className="text-lg font-bold text-white group-hover:text-amber-400 transition-colors truncate pr-2">
                                        {project.name}
                                    </h3>
                                    {project.status === 'archived' && (
                                        <span className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded text-[9px] bg-zinc-700/50 border border-zinc-600/30 text-zinc-400">
                                            <Archive className="w-3 h-3" />
                                            Archived
                                        </span>
                                    )}
                                </div>

                                {project.description && (
                                    <p className="text-xs text-zinc-500 mb-4 line-clamp-2">{project.description}</p>
                                )}

                                <div className="flex items-center gap-4 text-xs text-zinc-500">
                                    <span className="flex items-center gap-1">
                                        <FileText className="w-3.5 h-3.5" />
                                        {project.total_files} file{project.total_files !== 1 ? 's' : ''}
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <Layers className="w-3.5 h-3.5" />
                                        {project.total_chunks} chunks
                                    </span>
                                    {project.dominant_doc_type && (
                                        <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] capitalize">
                                            {project.dominant_doc_type}
                                        </span>
                                    )}
                                </div>

                                <div className="text-[10px] text-zinc-600 mt-3">
                                    Created {new Date(project.created_at).toLocaleDateString()}
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

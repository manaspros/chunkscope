"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
    FolderOpen,
    FileText,
    Layers,
    ArrowRight,
    Plus,
    GitBranch,
    BookOpen,
} from "lucide-react"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { projectsApi } from "@/lib/api"

interface Project {
    id: string
    name: string
    description: string | null
    total_files: number
    total_chunks: number
    dominant_doc_type: string | null
    status: string
    created_at: string
    updated_at: string | null
}

function formatNumber(n: number): string {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
    return n.toLocaleString()
}

function relativeTime(dateStr: string): string {
    const now = new Date()
    const date = new Date(dateStr)
    const diffMs = now.getTime() - date.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return "just now"
    if (diffMin < 60) return `${diffMin}m ago`
    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return `${diffHr}h ago`
    const diffDay = Math.floor(diffHr / 24)
    if (diffDay === 1) return "yesterday"
    if (diffDay < 30) return `${diffDay}d ago`
    return date.toLocaleDateString()
}

export default function DashboardPage() {
    const [projects, setProjects] = useState<Project[]>([])
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        const fetchData = async () => {
            try {
                const data = await projectsApi.list()
                setProjects(data.projects || [])
            } catch (error) {
                console.error("Failed to fetch projects:", error)
            } finally {
                setIsLoading(false)
            }
        }
        fetchData()
    }, [])

    const totalProjects = projects.length
    const totalFiles = projects.reduce((acc, p) => acc + (p.total_files || 0), 0)
    const totalChunks = projects.reduce((acc, p) => acc + (p.total_chunks || 0), 0)
    const recentProjects = projects
        .filter((p) => p.status === "active")
        .slice(0, 5)

    return (
        <div className="relative min-h-screen bg-gray-50 overflow-hidden font-sans text-gray-900">
            <div className="relative z-10 container mx-auto max-w-5xl px-6 space-y-10 py-10">
                {/* Header */}
                <div className="space-y-1">
                    <div className="inline-flex items-center gap-2 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-[10px] font-bold text-amber-700 uppercase tracking-[0.2em]">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                        Overview
                    </div>
                    <h1 className="text-3xl md:text-5xl font-black tracking-tighter text-gray-900">
                        Dashboard<span className="text-amber-600">.</span>
                    </h1>
                    <p className="text-gray-500 text-sm">
                        ChunkScope project overview
                    </p>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                    <div className="p-6 rounded-2xl bg-white border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                                <FolderOpen className="w-5 h-5 text-amber-600" />
                            </div>
                            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-400">Projects</span>
                        </div>
                        <div className="text-3xl font-mono font-black text-amber-600">
                            {isLoading ? <LoadingSpinner size="sm" /> : totalProjects}
                        </div>
                    </div>

                    <div className="p-6 rounded-2xl bg-white border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                                <FileText className="w-5 h-5 text-blue-600" />
                            </div>
                            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-400">Total Files</span>
                        </div>
                        <div className="text-3xl font-mono font-black text-blue-600">
                            {isLoading ? <LoadingSpinner size="sm" /> : formatNumber(totalFiles)}
                        </div>
                    </div>

                    <div className="p-6 rounded-2xl bg-white border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                                <Layers className="w-5 h-5 text-amber-600" />
                            </div>
                            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-400">Total Chunks</span>
                        </div>
                        <div className="text-3xl font-mono font-black text-amber-600">
                            {isLoading ? <LoadingSpinner size="sm" /> : formatNumber(totalChunks)}
                        </div>
                    </div>
                </div>

                {/* Recent Projects */}
                <div className="rounded-2xl bg-white border border-gray-200 overflow-hidden shadow-sm">
                    <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <span className="text-[10px] font-black tracking-[0.4em] uppercase text-gray-400">Recent Projects</span>
                            {isLoading && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />}
                        </div>
                        <Link
                            href="/projects"
                            className="text-[10px] font-black text-amber-600 uppercase tracking-widest hover:text-amber-500 transition-colors flex items-center gap-1"
                        >
                            View All <ArrowRight className="w-3 h-3" />
                        </Link>
                    </div>

                    {isLoading ? (
                        <div className="px-6 py-12 text-center">
                            <LoadingSpinner size="sm" className="mx-auto mb-3" />
                            <span className="text-gray-400 text-[10px] uppercase tracking-[0.3em] font-black opacity-50">Loading projects...</span>
                        </div>
                    ) : recentProjects.length === 0 ? (
                        <div className="px-6 py-12 text-center">
                            <FolderOpen className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                            <p className="text-gray-500 text-sm font-medium mb-4">No projects yet</p>
                            <Link
                                href="/projects"
                                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gray-900 hover:bg-gray-800 text-white font-bold text-sm transition-all"
                            >
                                <Plus className="w-4 h-4" />
                                Create Your First Project
                            </Link>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {recentProjects.map((project) => (
                                <Link
                                    key={project.id}
                                    href={`/projects/${project.id}`}
                                    className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-all group"
                                >
                                    <div className="flex items-center gap-4 min-w-0">
                                        <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                                        <div className="min-w-0">
                                            <h3 className="text-sm font-bold text-gray-900 group-hover:text-amber-600 transition-colors truncate">
                                                {project.name}
                                            </h3>
                                            {project.description && (
                                                <p className="text-[11px] text-gray-400 truncate max-w-md">
                                                    {project.description}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-6 shrink-0 ml-4">
                                        <span className="text-[11px] text-gray-500 flex items-center gap-1">
                                            <FileText className="w-3 h-3" />
                                            {project.total_files} file{project.total_files !== 1 ? "s" : ""}
                                        </span>
                                        <span className="text-[11px] text-gray-500 flex items-center gap-1">
                                            <Layers className="w-3 h-3" />
                                            {formatNumber(project.total_chunks)} chunks
                                        </span>
                                        {project.dominant_doc_type && (
                                            <span className="px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-[9px] text-gray-500 capitalize">
                                                {project.dominant_doc_type}
                                            </span>
                                        )}
                                        <span className="text-[10px] text-gray-400 font-mono w-20 text-right">
                                            {relativeTime(project.updated_at || project.created_at)}
                                        </span>
                                        <ArrowRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-amber-600 group-hover:translate-x-0.5 transition-all" />
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>

                {/* Quick Actions */}
                <div className="space-y-4">
                    <h2 className="text-[10px] font-black tracking-[0.4em] uppercase text-gray-400">Quick Actions</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                        <Link href="/projects" className="group">
                            <div className="p-5 rounded-2xl bg-white border border-gray-200 shadow-sm group-hover:border-amber-300 group-hover:shadow-md transition-all">
                                <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                    <Plus className="w-5 h-5 text-amber-600" />
                                </div>
                                <h3 className="text-sm font-black text-gray-900 mb-1 uppercase tracking-widest">New Project</h3>
                                <p className="text-gray-500 text-[10px] font-medium leading-relaxed">Create a RAG knowledge base.</p>
                                <div className="flex items-center text-[10px] font-black text-amber-600 uppercase tracking-[0.2em] mt-3 group-hover:translate-x-2 transition-all">
                                    Go <ArrowRight className="w-3.5 h-3.5 ml-2" />
                                </div>
                            </div>
                        </Link>

                        <Link href="/guide" className="group">
                            <div className="p-5 rounded-2xl bg-white border border-gray-200 shadow-sm group-hover:border-cyan-300 group-hover:shadow-md transition-all">
                                <div className="w-10 h-10 rounded-xl bg-cyan-50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                    <BookOpen className="w-5 h-5 text-cyan-600" />
                                </div>
                                <h3 className="text-sm font-black text-gray-900 mb-1 uppercase tracking-widest">Strategy Guide</h3>
                                <p className="text-gray-500 text-[10px] font-medium leading-relaxed">Explore chunking strategies.</p>
                                <div className="flex items-center text-[10px] font-black text-cyan-600 uppercase tracking-[0.2em] mt-3 group-hover:translate-x-2 transition-all">
                                    Go <ArrowRight className="w-3.5 h-3.5 ml-2" />
                                </div>
                            </div>
                        </Link>

                        <Link href="/pipeline" className="group">
                            <div className="p-5 rounded-2xl bg-white border border-gray-200 shadow-sm group-hover:border-purple-300 group-hover:shadow-md transition-all">
                                <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                    <GitBranch className="w-5 h-5 text-purple-600" />
                                </div>
                                <h3 className="text-sm font-black text-gray-900 mb-1 uppercase tracking-widest">Pipeline Builder</h3>
                                <p className="text-gray-500 text-[10px] font-medium leading-relaxed">Orchestrate RAG pipelines.</p>
                                <div className="flex items-center text-[10px] font-black text-purple-600 uppercase tracking-[0.2em] mt-3 group-hover:translate-x-2 transition-all">
                                    Go <ArrowRight className="w-3.5 h-3.5 ml-2" />
                                </div>
                            </div>
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    )
}

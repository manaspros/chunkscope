"use client"

import { useCallback, useState, useEffect } from 'react'
import dynamic from 'next/dynamic'

const PipelineBuilder = dynamic(
    () => import('@/components/pipeline/pipeline-builder').then(mod => ({ default: mod.PipelineBuilder })),
    {
        ssr: false,
        loading: () => (
            <div className="flex-1 flex items-center justify-center bg-neutral-950 text-neutral-500 text-sm">
                Loading pipeline builder...
            </div>
        ),
    }
)
import { usePipelineStore } from '@/stores/usePipelineStore'
import { ArrowLeft, Save, FolderOpen, Loader2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { apiClient } from '@/lib/api'
import { buildPipelineConfig } from '@/lib/pipeline-nodes'

function PipelineNameEditor() {
    const pipelineName = usePipelineStore((s) => s.pipelineName)
    const setPipelineName = usePipelineStore((s) => s.setPipelineName)
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState(pipelineName)

    const handleSubmit = useCallback(() => {
        setPipelineName(draft.trim() || 'Untitled Pipeline')
        setEditing(false)
    }, [draft, setPipelineName])

    if (editing) {
        return (
            <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={handleSubmit}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSubmit()
                    if (e.key === 'Escape') { setDraft(pipelineName); setEditing(false) }
                }}
                className="bg-transparent border-b border-white/20 text-sm font-semibold text-white outline-none px-1 py-0.5 w-56"
            />
        )
    }

    return (
        <button
            onClick={() => { setDraft(pipelineName); setEditing(true) }}
            className="text-sm font-semibold text-white hover:text-neutral-300 transition-colors truncate max-w-[200px]"
            title="Click to rename"
        >
            {pipelineName}
        </button>
    )
}

function SaveButton() {
    const nodes = usePipelineStore((s) => s.nodes)
    const edges = usePipelineStore((s) => s.edges)
    const pipelineName = usePipelineStore((s) => s.pipelineName)
    const pipelineId = usePipelineStore((s) => s.pipelineId)
    const setPipelineId = usePipelineStore((s) => s.setPipelineId)

    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)

    const handleSave = useCallback(async () => {
        setSaving(true)
        try {
            const config = buildPipelineConfig(nodes, edges)
            if (pipelineId) {
                await apiClient.put(`/api/v1/pipelines/${pipelineId}`, {
                    name: pipelineName,
                    config,
                })
            } else {
                const res = await apiClient.post('/api/v1/pipelines/', {
                    name: pipelineName,
                    config,
                })
                setPipelineId(res.data?.id || res.data?.pipeline_id || null)
            }
            setSaved(true)
            setTimeout(() => setSaved(false), 2000)
        } catch {
            // Save to localStorage as fallback
            const config = buildPipelineConfig(nodes, edges)
            localStorage.setItem('chunkscope_pipeline', JSON.stringify({ name: pipelineName, config }))
            setSaved(true)
            setTimeout(() => setSaved(false), 2000)
        } finally {
            setSaving(false)
        }
    }, [nodes, edges, pipelineName, pipelineId, setPipelineId])

    return (
        <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2.5 text-[10px] text-neutral-400 hover:text-white hover:bg-white/5"
            onClick={handleSave}
            disabled={saving}
        >
            {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : saved ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
                <Save className="w-3.5 h-3.5" />
            )}
            <span className="ml-1.5">{saved ? 'Saved' : 'Save'}</span>
        </Button>
    )
}

function LoadButton() {
    const setNodes = usePipelineStore((s) => s.setNodes)
    const setEdges = usePipelineStore((s) => s.setEdges)
    const setPipelineName = usePipelineStore((s) => s.setPipelineName)
    const [loading, setLoading] = useState(false)

    const handleLoad = useCallback(async () => {
        setLoading(true)
        try {
            // Try to load from localStorage
            const saved = localStorage.getItem('chunkscope_pipeline')
            if (saved) {
                const parsed = JSON.parse(saved)
                if (parsed.config?.steps) {
                    const restoredNodes = parsed.config.steps.map((step: any) => ({
                        id: step.id,
                        type: step.type,
                        position: step.position || { x: 0, y: 0 },
                        data: step.config,
                    }))
                    const restoredEdges = (parsed.config.connections || []).map((c: any, i: number) => ({
                        id: `e-${c.source}-${c.target}-${i}`,
                        source: c.source,
                        target: c.target,
                        animated: true,
                        style: { stroke: '#6366f1', strokeWidth: 2 },
                    }))
                    setNodes(restoredNodes)
                    setEdges(restoredEdges)
                    if (parsed.name) setPipelineName(parsed.name)
                }
            }
        } catch {
            // ignore
        } finally {
            setLoading(false)
        }
    }, [setNodes, setEdges, setPipelineName])

    return (
        <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2.5 text-[10px] text-neutral-400 hover:text-white hover:bg-white/5"
            onClick={handleLoad}
            disabled={loading}
        >
            <FolderOpen className="w-3.5 h-3.5" />
            <span className="ml-1.5">Load</span>
        </Button>
    )
}

export default function PipelinePage() {
    const isExecuting = usePipelineStore((s) => s.isExecuting)

    return (
        <div className="relative h-screen w-screen flex flex-col bg-black overflow-hidden font-sans">
            {/* Fixed Background */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute inset-0 bg-black" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(168,85,247,0.04)_0%,transparent_50%)]" />
            </div>

            {/* Top Bar */}
            <header className="relative z-20 h-11 border-b border-white/[0.06] flex items-center px-4 bg-neutral-950/80 backdrop-blur-xl shrink-0">
                <Link
                    href="/dashboard"
                    className="p-1.5 -ml-1 rounded-lg hover:bg-white/5 transition-colors text-neutral-500 hover:text-white mr-3"
                >
                    <ArrowLeft className="w-4 h-4" />
                </Link>

                <div className="w-px h-5 bg-white/[0.06] mr-3" />

                <PipelineNameEditor />

                <div className="ml-auto flex items-center gap-1">
                    {isExecuting && (
                        <span className="text-[9px] text-yellow-400 font-mono flex items-center gap-1.5 mr-3">
                            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                            Executing...
                        </span>
                    )}
                    {!isExecuting && (
                        <span className="text-[9px] text-neutral-600 font-mono flex items-center gap-1.5 mr-3">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/50" />
                            Ready
                        </span>
                    )}
                    <LoadButton />
                    <SaveButton />
                </div>
            </header>

            {/* Builder Canvas */}
            <main className="relative z-10 flex-1 overflow-hidden">
                <PipelineBuilder />
            </main>
        </div>
    )
}

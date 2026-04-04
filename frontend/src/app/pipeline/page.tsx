"use client"

import { useCallback, useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'

const PipelineBuilder = dynamic(
    () => import('@/components/pipeline/pipeline-builder').then(mod => ({ default: mod.PipelineBuilder })),
    {
        ssr: false,
        loading: () => (
            <div className="flex-1 flex items-center justify-center bg-gray-50 text-gray-400 text-sm">
                Loading pipeline builder...
            </div>
        ),
    }
)
import { usePipelineStore } from '@/stores/usePipelineStore'
import { ArrowLeft, Save, FolderOpen, Loader2, Check, Wand2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { apiClient } from '@/lib/api'
import { buildPipelineConfig, getNodeDef } from '@/lib/pipeline-nodes'
import { PipelineHealth } from '@/components/pipeline/PipelineHealth'
import { PipelineWizard } from '@/components/pipeline/PipelineWizard'
import { Node, Edge } from 'reactflow'

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
                className="bg-transparent border-b border-gray-300 text-sm font-semibold text-gray-900 outline-none px-1 py-0.5 w-56"
            />
        )
    }

    return (
        <button
            onClick={() => { setDraft(pipelineName); setEditing(true) }}
            className="text-sm font-semibold text-gray-900 hover:text-gray-600 transition-colors truncate max-w-[200px]"
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
            className="h-7 px-2.5 text-[10px] text-gray-500 hover:text-gray-900 hover:bg-gray-100"
            onClick={handleSave}
            disabled={saving}
        >
            {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : saved ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
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
            className="h-7 px-2.5 text-[10px] text-gray-500 hover:text-gray-900 hover:bg-gray-100"
            onClick={handleLoad}
            disabled={loading}
        >
            <FolderOpen className="w-3.5 h-3.5" />
            <span className="ml-1.5">Load</span>
        </Button>
    )
}

function buildTechniques(techniques: any[]): { name: string; is_primary: boolean; confidence: number; reasoning: string; enabled: boolean }[] {
    if (!techniques || !Array.isArray(techniques)) return []
    return techniques.map((t: any) => ({
        name: t.name || '',
        is_primary: !!t.is_primary,
        confidence: t.confidence || 0,
        reasoning: t.reasoning || '',
        enabled: true,
    }))
}

function buildNodesFromRecommendation(rec: any): { nodes: Node[]; edges: Edge[] } {
    const newNodes: Node[] = []
    const newEdges: Edge[] = []
    let x = 100
    const y = 200
    const spacing = 320 // wider spacing for technique-rich nodes

    // Document upload node
    const docNodeId = `document_upload-${Date.now()}`
    const docDef = getNodeDef('document_upload')
    newNodes.push({
        id: docNodeId,
        type: 'document_upload',
        position: { x, y },
        data: { ...(docDef?.defaultConfig || {}) },
    })
    let prevId = docNodeId
    x += spacing

    // Chunking node with ALL techniques
    const chunkingTechniques = rec.chunking || []
    if (chunkingTechniques.length > 0) {
        const primaryChunking = chunkingTechniques.find((t: any) => t.is_primary) || chunkingTechniques[0]
        const nodeId = `chunking-${Date.now()}`
        const def = getNodeDef('chunking')
        newNodes.push({
            id: nodeId,
            type: 'chunking',
            position: { x, y },
            data: {
                ...(def?.defaultConfig || {}),
                method: primaryChunking.name || 'recursive',
                ...(primaryChunking.config || {}),
                techniques: buildTechniques(chunkingTechniques),
            },
        })
        newEdges.push({
            id: `e-${prevId}-${nodeId}`,
            source: prevId,
            target: nodeId,
            animated: true,
            style: { stroke: '#6366f1', strokeWidth: 2 },
        })
        prevId = nodeId
        x += spacing
    }

    // Embedding node
    const embNodeId = `embedding-${Date.now()}`
    const embDef = getNodeDef('embedding')
    const embData: Record<string, any> = { ...(embDef?.defaultConfig || {}) }
    if (rec.embedding?.name) {
        embData.model = rec.embedding.name
    }
    if (rec.embedding?.config) {
        Object.assign(embData, rec.embedding.config)
    }
    if (rec.embedding) {
        embData.techniques = buildTechniques([rec.embedding])
    }
    newNodes.push({
        id: embNodeId,
        type: 'embedding',
        position: { x, y },
        data: embData,
    })
    newEdges.push({
        id: `e-${prevId}-${embNodeId}`,
        source: prevId,
        target: embNodeId,
        animated: true,
        style: { stroke: '#6366f1', strokeWidth: 2 },
    })
    prevId = embNodeId
    x += spacing

    // Vector store node
    const vsNodeId = `vector_store-${Date.now()}`
    const vsDef = getNodeDef('vector_store')
    newNodes.push({
        id: vsNodeId,
        type: 'vector_store',
        position: { x, y },
        data: { ...(vsDef?.defaultConfig || {}) },
    })
    newEdges.push({
        id: `e-${prevId}-${vsNodeId}`,
        source: prevId,
        target: vsNodeId,
        animated: true,
        style: { stroke: '#6366f1', strokeWidth: 2 },
    })
    prevId = vsNodeId
    x += spacing

    // Retriever node with ALL retrieval techniques
    const retrievalTechniques = rec.retrieval || []
    if (retrievalTechniques.length > 0) {
        const primaryRetrieval = retrievalTechniques.find((t: any) => t.is_primary) || retrievalTechniques[0]
        const nodeId = `retriever-${Date.now()}`
        const def = getNodeDef('retriever')
        newNodes.push({
            id: nodeId,
            type: 'retriever',
            position: { x, y },
            data: {
                ...(def?.defaultConfig || {}),
                strategy: primaryRetrieval.name || 'dense',
                ...(primaryRetrieval.config || {}),
                techniques: buildTechniques(retrievalTechniques),
            },
        })
        newEdges.push({
            id: `e-${prevId}-${nodeId}`,
            source: prevId,
            target: nodeId,
            animated: true,
            style: { stroke: '#6366f1', strokeWidth: 2 },
        })
        prevId = nodeId
        x += spacing
    }

    // Reranker node with ALL reranking techniques
    const rerankingTechniques = rec.reranking || []
    if (rerankingTechniques.length > 0) {
        const primaryReranking = rerankingTechniques.find((t: any) => t.is_primary) || rerankingTechniques[0]
        const nodeId = `reranker-${Date.now()}`
        const def = getNodeDef('reranker')
        newNodes.push({
            id: nodeId,
            type: 'reranker',
            position: { x, y },
            data: {
                ...(def?.defaultConfig || {}),
                provider: primaryReranking.name || 'cross-encoder',
                ...(primaryReranking.config || {}),
                techniques: buildTechniques(rerankingTechniques),
            },
        })
        newEdges.push({
            id: `e-${prevId}-${nodeId}`,
            source: prevId,
            target: nodeId,
            animated: true,
            style: { stroke: '#6366f1', strokeWidth: 2 },
        })
        prevId = nodeId
        x += spacing
    }

    // LLM generation node
    const llmNodeId = `llm_generation-${Date.now()}`
    const llmDef = getNodeDef('llm_generation')
    newNodes.push({
        id: llmNodeId,
        type: 'llm_generation',
        position: { x, y },
        data: { ...(llmDef?.defaultConfig || {}) },
    })
    newEdges.push({
        id: `e-${prevId}-${llmNodeId}`,
        source: prevId,
        target: llmNodeId,
        animated: true,
        style: { stroke: '#6366f1', strokeWidth: 2 },
    })

    return { nodes: newNodes, edges: newEdges }
}

function PipelinePageInner() {
    const searchParams = useSearchParams()
    const projectId = searchParams.get('projectId')

    const isExecuting = usePipelineStore((s) => s.isExecuting)
    const setNodes = usePipelineStore((s) => s.setNodes)
    const setEdges = usePipelineStore((s) => s.setEdges)
    const setPipelineName = usePipelineStore((s) => s.setPipelineName)
    const saveHistory = usePipelineStore((s) => s.saveHistory)

    const [wizardOpen, setWizardOpen] = useState(false)
    const [testQuery, setTestQuery] = useState('')
    const [queryResults, setQueryResults] = useState<any[] | null>(null)
    const [querying, setQuerying] = useState(false)

    // Load recommendation from localStorage when projectId is in URL
    useEffect(() => {
        if (!projectId) return
        const stored = localStorage.getItem('pipeline_recommendation')
        if (!stored) return

        try {
            const data = JSON.parse(stored)
            if (data.projectId !== projectId) return

            const rec = data.recommendation
            if (!rec) return

            saveHistory()
            const { nodes, edges } = buildNodesFromRecommendation(rec)
            setNodes(nodes)
            setEdges(edges)

            // Name the pipeline from content profile or project
            const domain = data.contentProfile?.domain || 'AI'
            setPipelineName(`${domain} RAG Pipeline`)

            // Clean up
            localStorage.removeItem('pipeline_recommendation')
        } catch (e) {
            console.error('Failed to load pipeline recommendation:', e)
        }
    }, [projectId, setNodes, setEdges, setPipelineName, saveHistory])

    const handleTestQuery = useCallback(async () => {
        if (!testQuery.trim() || !projectId) return
        setQuerying(true)
        try {
            const result = await apiClient.post('/api/v1/query/', {
                query: testQuery,
                top_k: 5,
            }).then(r => r.data)
            setQueryResults(result.results || [])
        } catch {
            setQueryResults(null)
        } finally {
            setQuerying(false)
        }
    }, [testQuery, projectId])

    const backHref = projectId ? `/projects/${projectId}` : '/dashboard'

    return (
        <div className="relative h-screen w-screen flex flex-col bg-gray-50 overflow-hidden font-sans">
            {/* Top Bar */}
            <header className="relative z-20 h-11 border-b border-gray-200 flex items-center px-4 bg-white shrink-0">
                <Link
                    href={backHref}
                    className="p-1.5 -ml-1 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-900 mr-3"
                >
                    <ArrowLeft className="w-4 h-4" />
                </Link>

                <div className="w-px h-5 bg-gray-200 mr-3" />

                <PipelineNameEditor />

                <div className="ml-3">
                    <PipelineHealth />
                </div>

                <div className="ml-auto flex items-center gap-1">
                    {isExecuting && (
                        <span className="text-[9px] text-yellow-600 font-mono flex items-center gap-1.5 mr-3">
                            <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
                            Executing...
                        </span>
                    )}
                    {!isExecuting && (
                        <span className="text-[9px] text-gray-400 font-mono flex items-center gap-1.5 mr-3">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Ready
                        </span>
                    )}
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2.5 text-[10px] text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                        onClick={() => setWizardOpen(true)}
                    >
                        <Wand2 className="w-3.5 h-3.5" />
                        <span className="ml-1.5">New Pipeline</span>
                    </Button>
                    <LoadButton />
                    <SaveButton />
                </div>
            </header>

            {/* Builder Canvas */}
            <main className="relative z-10 flex-1 overflow-hidden">
                <PipelineBuilder />
            </main>

            {/* Query Testing */}
            {projectId && (
                <div className="relative z-20 p-4 border-t border-gray-200 bg-white shrink-0">
                    <h3 className="text-sm font-bold text-gray-700 mb-2">Test Query</h3>
                    <div className="flex gap-2">
                        <input
                            value={testQuery}
                            onChange={(e) => setTestQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleTestQuery()}
                            placeholder="Ask a question about your data..."
                            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400"
                        />
                        <button
                            onClick={handleTestQuery}
                            disabled={querying || !testQuery.trim()}
                            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-bold disabled:opacity-40 hover:bg-gray-800 transition-colors"
                        >
                            {querying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                            Test
                        </button>
                    </div>
                    {queryResults && queryResults.length > 0 && (
                        <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
                            {queryResults.map((r: any, i: number) => (
                                <div key={i} className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                                    <p className="text-xs text-gray-700">{(r.text || r.content || '').substring(0, 200)}...</p>
                                    <span className="text-[10px] text-gray-400">Score: {(r.score ?? r.relevance_score ?? 0).toFixed(3)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Pipeline Wizard */}
            <PipelineWizard open={wizardOpen} onOpenChange={setWizardOpen} />
        </div>
    )
}

export default function PipelinePage() {
    return (
        <Suspense fallback={
            <div className="h-screen w-screen flex items-center justify-center bg-gray-50 text-gray-400 text-sm">
                Loading pipeline...
            </div>
        }>
            <PipelinePageInner />
        </Suspense>
    )
}

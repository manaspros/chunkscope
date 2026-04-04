"use client"

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { usePipelineStore } from '@/stores/usePipelineStore'
import { apiClient, pipelinesApi, projectsApi } from '@/lib/api'
import { buildPipelineConfig } from '@/lib/pipeline-nodes'
import { CodeExportModal } from './CodeExportModal'
import {
    Play, Code2, Loader2, CheckCircle2, AlertCircle,
    Undo2, Redo2, Trash2, FlaskConical, MessageSquare,
} from 'lucide-react'
import Link from 'next/link'

export function BottomBar() {
    const nodes = usePipelineStore((s) => s.nodes)
    const edges = usePipelineStore((s) => s.edges)
    const pipelineName = usePipelineStore((s) => s.pipelineName)
    const storeProjectId = usePipelineStore((s) => s.projectId)
    // Also try URL params as the authoritative source
    const urlProjectId = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('projectId')
        : null
    const projectId = urlProjectId || storeProjectId
    const isExecuting = usePipelineStore((s) => s.isExecuting)
    const executionError = usePipelineStore((s) => s.executionError)
    const executionResult = usePipelineStore((s) => s.executionResult)
    const setIsExecuting = usePipelineStore((s) => s.setIsExecuting)
    const setExecutionError = usePipelineStore((s) => s.setExecutionError)
    const setExecutionResult = usePipelineStore((s) => s.setExecutionResult)
    const setNodeExecutionState = usePipelineStore((s) => s.setNodeExecutionState)
    const setNodePreviewData = usePipelineStore((s) => s.setNodePreviewData)
    const resetExecution = usePipelineStore((s) => s.resetExecution)
    const undo = usePipelineStore((s) => s.undo)
    const redo = usePipelineStore((s) => s.redo)
    const clearCanvas = usePipelineStore((s) => s.clearCanvas)
    const history = usePipelineStore((s) => s.history)
    const future = usePipelineStore((s) => s.future)
    const setTesterOpen = usePipelineStore((s) => s.setTesterOpen)

    const [showExport, setShowExport] = useState(false)
    const [progressPct, setProgressPct] = useState(0)
    const [progressMsg, setProgressMsg] = useState('')
    const [healthScore, setHealthScore] = useState<any>(null)

    const isDone = executionResult !== null

    const runPipeline = useCallback(async () => {
        if (nodes.length === 0) return

        resetExecution()
        setIsExecuting(true)
        setExecutionError(null)
        setExecutionResult(null)
        setHealthScore(null)
        setProgressPct(0)
        setProgressMsg('Saving pipeline...')

        let totalChunksCreated = 0
        let totalEmbeddedChunks = 0
        let anyStepSkipped = false

        try {
            const config = buildPipelineConfig(nodes, edges)

            let createResponse
            try {
                createResponse = await apiClient.post('/api/v1/pipelines/', {
                    name: pipelineName,
                    project_id: projectId || undefined,
                    nodes: config.steps.map((s: any) => ({
                        id: s.id, type: s.type || 'unknown',
                        position: s.position || { x: 0, y: 0 }, config: s.config || {},
                    })),
                    edges: config.connections.map((c: any) => ({
                        id: `${c.source}-${c.target}`, source: c.source, target: c.target,
                    })),
                })
            } catch (err: any) {
                throw new Error(`Failed to save pipeline: ${err?.response?.data?.detail || err?.message}`)
            }

            const pipelineId = createResponse?.data?.id || createResponse?.data?.pipeline_id
            if (!pipelineId) throw new Error('Pipeline was saved but no ID was returned')

            setProgressPct(5)
            setProgressMsg('Executing nodes...')

            const executed = new Set<string>()
            const nodeMap = new Map(nodes.map((n) => [n.id, n]))
            const totalNodes = nodes.length

            const incomingEdgeCount = new Map<string, number>()
            nodes.forEach((n) => incomingEdgeCount.set(n.id, 0))
            edges.forEach((e) => {
                incomingEdgeCount.set(e.target, (incomingEdgeCount.get(e.target) || 0) + 1)
            })

            const queue = nodes.filter((n) => (incomingEdgeCount.get(n.id) || 0) === 0).map((n) => n.id)
            let completedNodes = 0

            while (queue.length > 0) {
                const nodeId = queue.shift()!
                if (executed.has(nodeId)) continue
                const node = nodeMap.get(nodeId)
                const nodeType = node?.type || ''
                const isChunker = ['chunking', 'splitter', 'chunker'].some(k => nodeType.toLowerCase().includes(k))

                setNodeExecutionState(nodeId, 'running')

                try {
                    if (isChunker) {
                        setProgressMsg(`Chunking & embedding...`)
                        const result = await pipelinesApi.executeStepStream(
                            pipelineId,
                            { node_id: nodeId, node_type: nodeType, config: node?.data || {}, project_id: projectId || undefined },
                            (evt) => { setProgressPct(evt.progress); setProgressMsg(evt.message) },
                        )
                        if (result) {
                            setNodePreviewData(nodeId, { type: nodeType, data: result, timestamp: Date.now() })
                            if (result.chunks_created) totalChunksCreated += result.chunks_created
                            if (result.embedded_chunks) totalEmbeddedChunks += result.embedded_chunks
                            if (result.skipped) anyStepSkipped = true
                        }
                    } else {
                        await new Promise((r) => setTimeout(r, 150))
                        const stepResult = await pipelinesApi.executeStep(pipelineId, {
                            node_id: nodeId, node_type: nodeType, config: node?.data || {}, project_id: projectId || undefined,
                        })
                        const stepData = stepResult?.data || stepResult
                        if (stepData) setNodePreviewData(nodeId, { type: nodeType, data: stepData, timestamp: Date.now() })
                    }

                    setNodeExecutionState(nodeId, 'complete')
                    executed.add(nodeId)
                    completedNodes++
                    if (!isChunker) {
                        setProgressPct(Math.round((completedNodes / totalNodes) * 100))
                        setProgressMsg(`${nodeType} done (${completedNodes}/${totalNodes})`)
                    }

                    edges.filter((e) => e.source === nodeId).forEach((e) => {
                        const rem = (incomingEdgeCount.get(e.target) || 0) - 1
                        incomingEdgeCount.set(e.target, rem)
                        if (rem <= 0 && !executed.has(e.target)) queue.push(e.target)
                    })
                } catch (err: any) {
                    setNodeExecutionState(nodeId, 'error')
                    throw new Error(`Node "${nodeType || nodeId}" failed: ${err?.response?.data?.detail || err?.message}`)
                }
            }

            nodes.forEach((n) => { if (!executed.has(n.id)) setNodeExecutionState(n.id, 'complete') })

            setProgressPct(95)
            setProgressMsg('Auto-evaluating pipeline...')

            // Auto-evaluate after run
            if (projectId) {
                try {
                    const health = await projectsApi.validateRag(projectId)
                    setHealthScore(health)
                } catch { /* evaluation is optional */ }
            }

            setProgressPct(100)
            setProgressMsg('Complete!')
            setExecutionResult({
                chunksCreated: totalChunksCreated,
                embeddedChunks: totalEmbeddedChunks,
                skipped: anyStepSkipped || undefined,
            })
        } catch (err: any) {
            setExecutionError(err?.message || 'Pipeline execution failed')
            setProgressMsg('')
        } finally {
            setIsExecuting(false)
        }
    }, [nodes, edges, pipelineName, projectId, resetExecution, setIsExecuting, setExecutionError, setExecutionResult, setNodeExecutionState, setNodePreviewData])

    return (
        <>
            {/* Progress bar */}
            {(isExecuting || (progressPct > 0 && progressPct < 100)) && (
                <div className="h-8 border-t border-gray-100 bg-white px-4 flex items-center gap-3 shrink-0">
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${progressPct}%` }} />
                    </div>
                    <span className="text-[10px] font-mono text-gray-500 w-10 text-right">{progressPct}%</span>
                    <span className="text-[10px] text-gray-400 truncate max-w-[280px]">{progressMsg}</span>
                </div>
            )}

            <div className="h-12 border-t border-gray-200 bg-white flex items-center px-4 gap-2 shrink-0">
                {/* Left: Undo/Redo/Clear */}
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400 hover:text-gray-900 disabled:opacity-30"
                        onClick={undo} disabled={history.length === 0}>
                        <Undo2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400 hover:text-gray-900 disabled:opacity-30"
                        onClick={redo} disabled={future.length === 0}>
                        <Redo2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400 hover:text-red-500"
                        onClick={clearCanvas} disabled={nodes.length === 0}>
                        <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                </div>

                <div className="w-px h-5 bg-gray-200" />

                {/* Center: Status */}
                <div className="flex-1 flex items-center justify-center gap-2">
                    <span className="text-[10px] text-gray-400">
                        {nodes.length} nodes
                    </span>
                    {executionError && (
                        <span className="text-[10px] text-red-500 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> {executionError}
                        </span>
                    )}
                    {isDone && !executionError && (
                        <span className="text-[10px] text-emerald-600 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            {executionResult!.chunksCreated} chunks{executionResult!.skipped ? ' (cached)' : ''}
                            {healthScore?.health && (
                                <span className={`ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                    healthScore.health === 'excellent' ? 'bg-emerald-100 text-emerald-700' :
                                    healthScore.health === 'good' ? 'bg-blue-100 text-blue-700' :
                                    healthScore.health === 'fair' ? 'bg-amber-100 text-amber-700' :
                                    'bg-red-100 text-red-700'
                                }`}>{healthScore.health} ({healthScore.retrieval_accuracy}%)</span>
                            )}
                        </span>
                    )}
                </div>

                <div className="w-px h-5 bg-gray-200" />

                {/* Right: Actions */}
                <div className="flex items-center gap-1.5">
                    {/* Run Pipeline - always visible */}
                    <Button
                        size="sm"
                        className="h-7 px-3 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                        onClick={runPipeline}
                        disabled={isExecuting || nodes.length === 0}
                    >
                        {isExecuting ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Play className="w-3 h-3 mr-1" />}
                        {isExecuting ? 'Running...' : 'Run Pipeline'}
                    </Button>

                    {/* Post-run actions */}
                    {isDone && (
                        <>
                            <Button
                                variant="outline" size="sm"
                                className="h-7 px-2.5 text-[10px] border-indigo-200 text-indigo-600 hover:bg-indigo-50"
                                onClick={() => setTesterOpen(true)}
                            >
                                <FlaskConical className="w-3 h-3 mr-1" />
                                Tester
                            </Button>
                            <Link href={projectId ? `/projects/${projectId}` : '/projects'}>
                                <Button variant="outline" size="sm" className="h-7 px-2.5 text-[10px] border-gray-200 text-gray-600 hover:bg-gray-50">
                                    <MessageSquare className="w-3 h-3 mr-1" />
                                    Chat
                                </Button>
                            </Link>
                            <Button
                                variant="outline" size="sm"
                                className="h-7 px-2.5 text-[10px] border-gray-200 text-gray-600 hover:bg-gray-50"
                                onClick={() => setShowExport(true)}
                            >
                                <Code2 className="w-3 h-3 mr-1" />
                                Export
                            </Button>
                        </>
                    )}
                </div>
            </div>

            <CodeExportModal open={showExport} onOpenChange={setShowExport} />
        </>
    )
}

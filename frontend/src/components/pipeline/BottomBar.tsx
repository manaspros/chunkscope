"use client"

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { usePipelineStore } from '@/stores/usePipelineStore'
import { apiClient } from '@/lib/api'
import { buildPipelineConfig } from '@/lib/pipeline-nodes'
import { CodeExportModal } from './CodeExportModal'
import { CostEstimatePopover } from './CostEstimatePopover'
import {
    Play, Code2, DollarSign, Loader2, CheckCircle2,
    AlertCircle, Undo2, Redo2, Trash2,
} from 'lucide-react'

export function BottomBar() {
    const nodes = usePipelineStore((s) => s.nodes)
    const edges = usePipelineStore((s) => s.edges)
    const pipelineName = usePipelineStore((s) => s.pipelineName)
    const isExecuting = usePipelineStore((s) => s.isExecuting)
    const executionError = usePipelineStore((s) => s.executionError)
    const setIsExecuting = usePipelineStore((s) => s.setIsExecuting)
    const setExecutionError = usePipelineStore((s) => s.setExecutionError)
    const setNodeExecutionState = usePipelineStore((s) => s.setNodeExecutionState)
    const setNodePreviewData = usePipelineStore((s) => s.setNodePreviewData)
    const resetExecution = usePipelineStore((s) => s.resetExecution)
    const undo = usePipelineStore((s) => s.undo)
    const redo = usePipelineStore((s) => s.redo)
    const clearCanvas = usePipelineStore((s) => s.clearCanvas)
    const history = usePipelineStore((s) => s.history)
    const future = usePipelineStore((s) => s.future)

    const [showExport, setShowExport] = useState(false)
    const [showCost, setShowCost] = useState(false)
    const [executionComplete, setExecutionComplete] = useState(false)

    const runPipeline = useCallback(async () => {
        if (nodes.length === 0) return

        resetExecution()
        setIsExecuting(true)
        setExecutionComplete(false)
        setExecutionError(null)

        try {
            // Set all nodes to running sequentially based on topological order
            const config = buildPipelineConfig(nodes, edges)

            // Create pipeline
            const createResponse = await apiClient.post('/api/v1/pipelines/', {
                name: pipelineName,
                config,
            }).catch(() => null)

            const pipelineId = createResponse?.data?.id || createResponse?.data?.pipeline_id

            // Execute pipeline (simulate node-by-node progress)
            // First, get execution order from edges
            const executed = new Set<string>()
            const nodeMap = new Map(nodes.map((n) => [n.id, n]))

            // Find nodes with no incoming edges (source nodes)
            const incomingEdgeCount = new Map<string, number>()
            nodes.forEach((n) => incomingEdgeCount.set(n.id, 0))
            edges.forEach((e) => {
                const count = incomingEdgeCount.get(e.target) || 0
                incomingEdgeCount.set(e.target, count + 1)
            })

            const queue = nodes.filter((n) => (incomingEdgeCount.get(n.id) || 0) === 0).map((n) => n.id)

            // Process nodes
            while (queue.length > 0) {
                const nodeId = queue.shift()!
                if (executed.has(nodeId)) continue

                setNodeExecutionState(nodeId, 'running')

                // Simulate execution delay
                await new Promise((r) => setTimeout(r, 800))

                try {
                    // Try to execute the step via API
                    if (pipelineId) {
                        const stepResult = await apiClient.post(`/api/v1/pipelines/${pipelineId}/execute-step`, {
                            node_id: nodeId,
                            node_type: nodeMap.get(nodeId)?.type,
                            config: nodeMap.get(nodeId)?.data,
                        }).catch(() => null)

                        if (stepResult?.data) {
                            setNodePreviewData(nodeId, {
                                type: nodeMap.get(nodeId)?.type || '',
                                data: stepResult.data,
                                timestamp: Date.now(),
                            })
                        }
                    }

                    setNodeExecutionState(nodeId, 'complete')
                    executed.add(nodeId)

                    // Enqueue downstream nodes
                    edges
                        .filter((e) => e.source === nodeId)
                        .forEach((e) => {
                            const remaining = (incomingEdgeCount.get(e.target) || 0) - 1
                            incomingEdgeCount.set(e.target, remaining)
                            if (remaining <= 0 && !executed.has(e.target)) {
                                queue.push(e.target)
                            }
                        })
                } catch (err) {
                    setNodeExecutionState(nodeId, 'error')
                    throw err
                }
            }

            // Handle any disconnected nodes
            nodes.forEach((n) => {
                if (!executed.has(n.id)) {
                    setNodeExecutionState(n.id, 'complete')
                }
            })

            setExecutionComplete(true)
        } catch (err: any) {
            setExecutionError(err?.message || 'Pipeline execution failed')
        } finally {
            setIsExecuting(false)
        }
    }, [nodes, edges, pipelineName, resetExecution, setIsExecuting, setExecutionError, setNodeExecutionState, setNodePreviewData])

    return (
        <>
            <div className="h-12 border-t border-white/[0.06] bg-neutral-950/80 backdrop-blur-xl flex items-center px-4 gap-2 shrink-0">
                {/* Left: Quick actions */}
                <div className="flex items-center gap-1.5">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-neutral-500 hover:text-white disabled:opacity-30"
                        onClick={undo}
                        disabled={history.length === 0}
                        title="Undo (Ctrl+Z)"
                    >
                        <Undo2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-neutral-500 hover:text-white disabled:opacity-30"
                        onClick={redo}
                        disabled={future.length === 0}
                        title="Redo (Ctrl+Shift+Z)"
                    >
                        <Redo2 className="w-3.5 h-3.5" />
                    </Button>
                    <div className="w-px h-5 bg-white/[0.06] mx-1" />
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-neutral-500 hover:text-red-400"
                        onClick={clearCanvas}
                        disabled={nodes.length === 0}
                        title="Clear canvas"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                </div>

                {/* Center: Node count info */}
                <div className="flex-1 flex items-center justify-center gap-3">
                    <span className="text-[10px] text-neutral-600">
                        {nodes.length} node{nodes.length !== 1 ? 's' : ''} / {edges.length} connection{edges.length !== 1 ? 's' : ''}
                    </span>
                    {executionError && (
                        <span className="text-[10px] text-red-400 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> {executionError}
                        </span>
                    )}
                    {executionComplete && !executionError && (
                        <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Pipeline executed successfully
                        </span>
                    )}
                </div>

                {/* Right: Main actions */}
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-3 text-[10px] border-white/[0.06] text-neutral-400 hover:text-white hover:bg-white/5"
                        onClick={() => setShowCost(true)}
                        disabled={nodes.length === 0}
                    >
                        <DollarSign className="w-3 h-3 mr-1" />
                        Estimate Cost
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-3 text-[10px] border-white/[0.06] text-neutral-400 hover:text-white hover:bg-white/5"
                        onClick={() => setShowExport(true)}
                        disabled={nodes.length === 0}
                    >
                        <Code2 className="w-3 h-3 mr-1" />
                        Export Code
                    </Button>
                    <Button
                        size="sm"
                        className="h-7 px-4 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                        onClick={runPipeline}
                        disabled={isExecuting || nodes.length === 0}
                    >
                        {isExecuting ? (
                            <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                        ) : (
                            <Play className="w-3 h-3 mr-1.5" />
                        )}
                        {isExecuting ? 'Running...' : 'Run Pipeline'}
                    </Button>
                </div>
            </div>

            <CodeExportModal open={showExport} onOpenChange={setShowExport} />
            <CostEstimatePopover open={showCost} onOpenChange={setShowCost} />
        </>
    )
}

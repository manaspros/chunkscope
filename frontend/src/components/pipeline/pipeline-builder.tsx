"use client"

import { useCallback, useState, useMemo } from 'react'
import ReactFlow, {
    Background,
    Controls,
    MiniMap,
    NodeTypes,
    Node,
    ReactFlowProvider,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { PipelineNode } from './nodes/PipelineNode'
import { NodePalette } from './NodePalette'
import { ConfigPanel } from './ConfigPanel'
import { BottomBar } from './BottomBar'
import { usePipelineStore } from '@/stores/usePipelineStore'
import { getNodeDef, CONNECTION_RULES } from '@/lib/pipeline-nodes'

function PipelineBuilderInner() {
    const nodes = usePipelineStore((s) => s.nodes)
    const edges = usePipelineStore((s) => s.edges)
    const onNodesChange = usePipelineStore((s) => s.onNodesChange)
    const onEdgesChange = usePipelineStore((s) => s.onEdgesChange)
    const onConnect = usePipelineStore((s) => s.onConnect)
    const addNode = usePipelineStore((s) => s.addNode)
    const selectNode = usePipelineStore((s) => s.selectNode)
    const saveHistory = usePipelineStore((s) => s.saveHistory)

    const [reactFlowInstance, setReactFlowInstance] = useState<any>(null)

    // Single node type maps every type to PipelineNode
    const nodeTypes: NodeTypes = useMemo(() => ({
        document_upload: PipelineNode,
        chunking: PipelineNode,
        embedding: PipelineNode,
        vector_store: PipelineNode,
        retriever: PipelineNode,
        reranker: PipelineNode,
        llm_generation: PipelineNode,
        evaluation: PipelineNode,
    }), [])

    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
    }, [])

    const onDrop = useCallback(
        (event: React.DragEvent) => {
            event.preventDefault()

            if (!reactFlowInstance) return

            const type = event.dataTransfer.getData('application/reactflow')
            if (!type) return

            const nodeDef = getNodeDef(type)
            if (!nodeDef) return

            const position = reactFlowInstance.screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            })

            const newNode: Node = {
                id: `${type}-${Date.now()}`,
                type,
                position,
                data: { ...nodeDef.defaultConfig },
            }

            addNode(newNode)
        },
        [reactFlowInstance, addNode]
    )

    const onNodeDragStop = useCallback(() => {
        saveHistory()
    }, [saveHistory])

    const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
        selectNode(node.id)
    }, [selectNode])

    const onPaneClick = useCallback(() => {
        selectNode(null)
    }, [selectNode])

    const isValidConnection = useCallback((connection: any) => {
        const sourceNode = nodes.find((n) => n.id === connection.source)
        const targetNode = nodes.find((n) => n.id === connection.target)
        if (!sourceNode || !targetNode) return false

        const sourceType = sourceNode.type || ''
        const targetType = targetNode.type || ''

        const allowed = CONNECTION_RULES[sourceType]
        if (allowed) {
            return allowed.includes(targetType)
        }
        return true
    }, [nodes])

    return (
        <div className="w-full h-full flex flex-col">
            <div className="flex-1 flex overflow-hidden">
                {/* Left: Node Palette */}
                <NodePalette />

                {/* Center: Canvas */}
                <div className="flex-1 relative">
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        onInit={setReactFlowInstance}
                        onDrop={onDrop}
                        onDragOver={onDragOver}
                        onNodeDragStop={onNodeDragStop}
                        onNodeClick={onNodeClick}
                        onPaneClick={onPaneClick}
                        isValidConnection={isValidConnection}
                        nodeTypes={nodeTypes}
                        fitView
                        className="bg-neutral-950"
                        defaultEdgeOptions={{
                            animated: true,
                            style: { stroke: '#6366f1', strokeWidth: 2 },
                        }}
                        proOptions={{ hideAttribution: true }}
                    >
                        <Background color="#1a1a1a" gap={20} size={1} />
                        <Controls
                            className="!bg-neutral-900/90 !border-white/[0.06] !shadow-xl [&>button]:!bg-neutral-900 [&>button]:!border-white/[0.06] [&>button]:!text-neutral-400 [&>button:hover]:!bg-neutral-800 [&>button:hover]:!text-white"
                        />
                        <MiniMap
                            className="!bg-neutral-900/80 !border-white/[0.06]"
                            nodeColor={(node) => {
                                const def = getNodeDef(node.type || '')
                                if (!def) return '#404040'
                                const map: Record<string, string> = {
                                    source: '#3b82f6',
                                    processing: '#a855f7',
                                    retrieval: '#10b981',
                                    output: '#f97316',
                                }
                                return map[def.category] || '#404040'
                            }}
                            maskColor="rgba(0,0,0,0.7)"
                        />
                    </ReactFlow>

                    {/* Empty state */}
                    {nodes.length === 0 && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="text-center">
                                <div className="w-16 h-16 rounded-2xl bg-white/[0.02] border border-dashed border-white/[0.08] flex items-center justify-center mx-auto mb-4">
                                    <svg className="w-6 h-6 text-neutral-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.5v15m7.5-7.5h-15" />
                                    </svg>
                                </div>
                                <p className="text-sm text-neutral-600 font-medium">Drag nodes from the palette</p>
                                <p className="text-xs text-neutral-700 mt-1">to start building your RAG pipeline</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right: Config Panel */}
                <ConfigPanel />
            </div>

            {/* Bottom: Action Bar */}
            <BottomBar />
        </div>
    )
}

export function PipelineBuilder() {
    return (
        <ReactFlowProvider>
            <PipelineBuilderInner />
        </ReactFlowProvider>
    )
}

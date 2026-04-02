"use client"

import { memo, useCallback } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { cn } from '@/lib/utils'
import { usePipelineStore, NodeExecutionState } from '@/stores/usePipelineStore'
import { getNodeDef, CATEGORY_COLORS, NodeCategory } from '@/lib/pipeline-nodes'
import {
    FileUp, Scissors, BrainCircuit, Database, Search, ArrowUpDown,
    MessageSquare, BarChart3, Loader2, CheckCircle2, XCircle, Eye, Trash2, Info
} from 'lucide-react'
import { useState } from 'react'
import { StrategyInfoDrawer } from '@/components/pipeline/StrategyInfoDrawer'

const ICON_MAP: Record<string, React.ElementType> = {
    FileUp, Scissors, BrainCircuit, Database, Search, ArrowUpDown,
    MessageSquare, BarChart3,
}

function getStrategyId(type: string, data: Record<string, unknown>): string | null {
    switch (type) {
        case 'chunking': return (data.method as string) || 'recursive'
        case 'retriever': return (data.strategy as string) || 'dense'
        case 'reranker': return (data.provider as string) || 'cross-encoder'
        default: return null
    }
}

function getConfigSummary(type: string, data: Record<string, any>): string {
    switch (type) {
        case 'document_upload':
            if (data.fileName) return data.fileName;
            if (data.text) return `${data.text.slice(0, 30)}...`;
            return 'No file selected';
        case 'chunking':
            return `${data.method || 'recursive'}, ${data.chunkSize || 500} chars, ${data.overlap || 50} overlap`;
        case 'embedding':
            return `${data.provider || 'openai'} / ${data.model || 'text-embedding-3-small'}`;
        case 'vector_store':
            return `${data.provider || 'pgvector'} / ${data.collection || 'default'}`;
        case 'retriever':
            return `${data.strategy || 'dense'}, top_k=${data.topK || 5}`;
        case 'reranker':
            return `${data.provider || 'cross-encoder'}, top_n=${data.topN || 10}`;
        case 'llm_generation':
            return `${data.model || 'gpt-4o'}, temp=${data.temperature ?? 0.7}`;
        case 'evaluation':
            return (data.metrics || []).join(', ') || 'No metrics selected';
        default:
            return '';
    }
}

function ExecutionIndicator({ state }: { state?: NodeExecutionState }) {
    if (!state || state === 'idle') return null;
    if (state === 'running') return <Loader2 className="w-3.5 h-3.5 text-yellow-400 animate-spin" />;
    if (state === 'complete') return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
    if (state === 'error') return <XCircle className="w-3.5 h-3.5 text-red-400" />;
    return null;
}

function PipelineNodeInner({ id, data, selected, type }: NodeProps) {
    const selectNode = usePipelineStore((s) => s.selectNode)
    const removeNode = usePipelineStore((s) => s.removeNode)
    const executionState = usePipelineStore((s) => s.executionState[id])
    const hasPreview = usePipelineStore((s) => !!s.nodePreviewData[id])

    const [infoOpen, setInfoOpen] = useState(false)
    const [infoStrategyId, setInfoStrategyId] = useState<string | null>(null)

    const nodeDef = getNodeDef(type || '')
    const category = (nodeDef?.category || 'processing') as NodeCategory
    const colors = CATEGORY_COLORS[category]
    const IconComponent = ICON_MAP[nodeDef?.icon || 'Database'] || Database
    const isSource = category === 'source'
    const strategyId = getStrategyId(type || '', data)

    const handleClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation()
        selectNode(id)
    }, [id, selectNode])

    const handleDelete = useCallback((e: React.MouseEvent) => {
        e.stopPropagation()
        removeNode(id)
    }, [id, removeNode])

    const handlePreview = useCallback((e: React.MouseEvent) => {
        e.stopPropagation()
        selectNode(id)
    }, [id, selectNode])

    const handleInfoClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation()
        if (strategyId) {
            setInfoStrategyId(strategyId)
            setInfoOpen(true)
        }
    }, [strategyId])

    return (
        <div
            onClick={handleClick}
            className={cn(
                "relative min-w-[220px] max-w-[260px] rounded-xl border transition-all duration-200",
                "bg-neutral-950/90 backdrop-blur-sm shadow-xl",
                colors.border,
                selected
                    ? "ring-2 ring-white/30 ring-offset-1 ring-offset-neutral-950 scale-[1.02]"
                    : "hover:ring-1 hover:ring-white/10",
                executionState === 'running' && "ring-2 ring-yellow-400/40",
                executionState === 'error' && "ring-2 ring-red-500/40",
            )}
        >
            {/* Input Handle */}
            {!isSource && (
                <Handle
                    type="target"
                    position={Position.Left}
                    className="!w-3 !h-3 !border-2 !border-neutral-800 !-left-1.5"
                    style={{ background: colors.handle }}
                />
            )}

            {/* Header */}
            <div className={cn("flex items-center gap-2 px-3 py-2 rounded-t-xl border-b border-white/5", colors.bg)}>
                <div className={cn("p-1 rounded-md", colors.bg)}>
                    <IconComponent className={cn("w-3.5 h-3.5", colors.text)} />
                </div>
                <span className="text-xs font-semibold text-neutral-200 flex-1 truncate">
                    {nodeDef?.label || type}
                </span>
                {strategyId && (
                    <button
                        onClick={handleInfoClick}
                        className="p-0.5 rounded hover:bg-white/10 transition-all text-neutral-500 hover:text-white hover:shadow-[0_0_6px_rgba(255,255,255,0.15)]"
                        title="Strategy info"
                    >
                        <Info className="w-3 h-3" />
                    </button>
                )}
                <ExecutionIndicator state={executionState} />
                {hasPreview && (
                    <button
                        onClick={handlePreview}
                        className="p-0.5 rounded hover:bg-white/10 transition-colors"
                        title="View preview"
                    >
                        <Eye className="w-3 h-3 text-neutral-400" />
                    </button>
                )}
                <button
                    onClick={handleDelete}
                    className="p-0.5 rounded hover:bg-red-500/20 transition-colors opacity-0 group-hover:opacity-100"
                    title="Delete node"
                >
                    <Trash2 className="w-3 h-3 text-neutral-500 hover:text-red-400" />
                </button>
            </div>

            {/* Body - Config Summary */}
            <div className="px-3 py-2.5 group">
                <p className="text-[10px] text-neutral-400 leading-relaxed truncate">
                    {getConfigSummary(type || '', data)}
                </p>
            </div>

            {/* Output Handle */}
            {category !== 'output' && (
                <Handle
                    type="source"
                    position={Position.Right}
                    className="!w-3 !h-3 !border-2 !border-neutral-800 !-right-1.5"
                    style={{ background: colors.handle }}
                />
            )}
            {/* output category nodes that are evaluation might still feed somewhere; LLM outputs to evaluation */}
            {type === 'llm_generation' && (
                <Handle
                    type="source"
                    position={Position.Right}
                    className="!w-3 !h-3 !border-2 !border-neutral-800 !-right-1.5"
                    style={{ background: colors.handle }}
                />
            )}

            {/* Strategy Info Drawer */}
            <StrategyInfoDrawer
                open={infoOpen}
                onOpenChange={setInfoOpen}
                strategyId={infoStrategyId}
                onSelectStrategy={(newId) => {
                    setInfoStrategyId(newId)
                }}
            />
        </div>
    )
}

export const PipelineNode = memo(PipelineNodeInner)

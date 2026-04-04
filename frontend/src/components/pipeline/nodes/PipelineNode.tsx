"use client"

import { memo, useCallback, useState } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { cn } from '@/lib/utils'
import { usePipelineStore, NodeExecutionState } from '@/stores/usePipelineStore'
import { getNodeDef, CATEGORY_COLORS, NodeCategory } from '@/lib/pipeline-nodes'
import {
    FileUp, Scissors, BrainCircuit, Database, Search, ArrowUpDown,
    MessageSquare, BarChart3, Loader2, CheckCircle2, XCircle, Eye, Trash2, Info,
    Star, Plus, ChevronDown, ChevronUp, X,
} from 'lucide-react'
import { StrategyInfoDrawer } from '@/components/pipeline/StrategyInfoDrawer'

const ICON_MAP: Record<string, React.ElementType> = {
    FileUp, Scissors, BrainCircuit, Database, Search, ArrowUpDown,
    MessageSquare, BarChart3,
}

// All available techniques per stage
const AVAILABLE_TECHNIQUES: Record<string, string[]> = {
    chunking: ['fixed', 'recursive', 'semantic', 'sentence_window', 'paragraph', 'code_aware', 'heading_based', 'contextual'],
    retriever: ['dense', 'hybrid', 'multi_query', 'hyde', 'parent_document', 'mmr', 'query_expansion', 'sentence_window_retrieval', 'contextual_compression', 'self_query', 'metadata_filter', 'ensemble', 'sub_query', 'step_back', 'adaptive', 'corrective', 'document_summary'],
    reranker: ['cross_encoder', 'cohere', 'bm25_rerank', 'rrf', 'llm_pointwise', 'lost_in_middle', 'diversity', 'listwise_llm', 'pairwise_llm', 'flashrank', 'bge', 'contextual_rerank', 'cascade'],
}

interface TechniqueItem {
    name: string
    is_primary: boolean
    confidence: number
    reasoning: string
    enabled: boolean
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
            return `${data.chunkSize || 500} chars, ${data.overlap || 50} overlap`;
        case 'embedding':
            return `${data.provider || 'openai'} / ${data.model || 'text-embedding-3-small'}`;
        case 'vector_store':
            return `${data.provider || 'pgvector'} / ${data.collection || 'default'}`;
        case 'retriever':
            return `top_k=${data.topK || 5}`;
        case 'reranker':
            return `top_n=${data.topN || 10}`;
        case 'llm_generation':
            return `${data.model || 'gpt-4o'}, temp=${data.temperature ?? 0.7}`;
        case 'evaluation':
            return (data.metrics || []).join(', ') || 'No metrics selected';
        default:
            return '';
    }
}

function confidenceColor(c: number): string {
    if (c >= 0.8) return 'text-emerald-600';
    if (c >= 0.6) return 'text-amber-600';
    return 'text-red-500';
}

function confidenceBg(c: number): string {
    if (c >= 0.8) return 'bg-emerald-500';
    if (c >= 0.6) return 'bg-amber-500';
    return 'bg-red-500';
}

function ExecutionIndicator({ state }: { state?: NodeExecutionState }) {
    if (!state || state === 'idle') return null;
    if (state === 'running') return <Loader2 className="w-3.5 h-3.5 text-yellow-500 animate-spin" />;
    if (state === 'complete') return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
    if (state === 'error') return <XCircle className="w-3.5 h-3.5 text-red-500" />;
    return null;
}

function TechniqueRow({
    tech,
    onToggle,
    onRemove,
    onExpandToggle,
    expanded,
}: {
    tech: TechniqueItem
    onToggle: () => void
    onRemove: () => void
    onExpandToggle: () => void
    expanded: boolean
}) {
    const pct = Math.round((tech.confidence || 0) * 100)
    return (
        <div className={cn(
            "rounded-md border transition-all",
            tech.enabled ? "bg-white border-gray-200" : "bg-gray-50 border-gray-100 opacity-60",
        )}>
            <div className="flex items-center gap-1.5 px-2 py-1.5">
                <button
                    onClick={(e) => { e.stopPropagation(); onToggle() }}
                    className={cn(
                        "w-3.5 h-3.5 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                        tech.enabled ? "bg-gray-900 border-gray-900" : "border-gray-300 bg-white"
                    )}
                >
                    {tech.enabled && (
                        <svg className="w-2 h-2 text-white" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    )}
                </button>
                <div className="flex items-center gap-1 flex-1 min-w-0">
                    {tech.is_primary ? (
                        <Star className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />
                    ) : (
                        <Plus className="w-3 h-3 text-gray-400 shrink-0" />
                    )}
                    <button
                        onClick={(e) => { e.stopPropagation(); onExpandToggle() }}
                        className="text-[10px] font-semibold text-gray-800 truncate hover:text-gray-600 transition-colors text-left"
                    >
                        {(tech.name || '').replace(/_/g, ' ')}
                    </button>
                </div>
                {tech.confidence > 0 && (
                    <span className={cn("text-[9px] font-mono font-bold shrink-0", confidenceColor(tech.confidence))}>
                        {pct}%
                    </span>
                )}
                <button
                    onClick={(e) => { e.stopPropagation(); onRemove() }}
                    className="p-0.5 rounded hover:bg-red-50 transition-colors shrink-0"
                    title="Remove technique"
                >
                    <X className="w-2.5 h-2.5 text-gray-400 hover:text-red-500" />
                </button>
            </div>
            {expanded && tech.reasoning && (
                <div className="px-2 pb-2 pt-0">
                    <p className="text-[9px] text-gray-500 leading-snug border-t border-gray-100 pt-1.5">
                        {tech.reasoning}
                    </p>
                    {tech.confidence > 0 && (
                        <div className="flex items-center gap-2 mt-1">
                            <div className="flex-1 h-1 rounded-full bg-gray-100 overflow-hidden">
                                <div
                                    className={cn("h-full rounded-full transition-all", confidenceBg(tech.confidence))}
                                    style={{ width: `${pct}%` }}
                                />
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

function AddTechniqueDropdown({
    nodeType,
    existingTechniques,
    onAdd,
}: {
    nodeType: string
    existingTechniques: string[]
    onAdd: (name: string) => void
}) {
    const [open, setOpen] = useState(false)
    const available = (AVAILABLE_TECHNIQUES[nodeType] || []).filter(
        (t) => !existingTechniques.includes(t)
    )

    if (available.length === 0) return null

    return (
        <div className="relative">
            <button
                onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
                className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded-md border border-dashed border-gray-300 text-[10px] text-gray-500 hover:text-gray-700 hover:border-gray-400 hover:bg-gray-50 transition-all"
            >
                <Plus className="w-3 h-3" />
                Add Technique
                {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {open && (
                <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-auto">
                    {available.map((t) => (
                        <button
                            key={t}
                            onClick={(e) => {
                                e.stopPropagation()
                                onAdd(t)
                                setOpen(false)
                            }}
                            className="w-full text-left px-3 py-1.5 text-[10px] text-gray-700 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0"
                        >
                            {t.replace(/_/g, ' ')}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

function PipelineNodeInner({ id, data, selected, type }: NodeProps) {
    const selectNode = usePipelineStore((s) => s.selectNode)
    const removeNode = usePipelineStore((s) => s.removeNode)
    const updateNodeData = usePipelineStore((s) => s.updateNodeData)
    const executionState = usePipelineStore((s) => s.executionState[id])
    const hasPreview = usePipelineStore((s) => !!s.nodePreviewData[id])

    const [infoOpen, setInfoOpen] = useState(false)
    const [infoStrategyId, setInfoStrategyId] = useState<string | null>(null)
    const [expandedTech, setExpandedTech] = useState<string | null>(null)

    const nodeDef = getNodeDef(type || '')
    const category = (nodeDef?.category || 'processing') as NodeCategory
    const colors = CATEGORY_COLORS[category]
    const IconComponent = ICON_MAP[nodeDef?.icon || 'Database'] || Database
    const isSource = category === 'source'
    const strategyId = getStrategyId(type || '', data)

    // Techniques from data (populated by buildNodesFromRecommendation)
    const techniques: TechniqueItem[] = data.techniques || []
    const hasTechniques = techniques.length > 0
    const nodeType = type || ''
    const hasTechniqueSupport = nodeType in AVAILABLE_TECHNIQUES

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

    const handleToggleTechnique = useCallback((techName: string) => {
        const updated = techniques.map((t) =>
            t.name === techName ? { ...t, enabled: !t.enabled } : t
        )
        updateNodeData(id, { techniques: updated })
    }, [id, techniques, updateNodeData])

    const handleRemoveTechnique = useCallback((techName: string) => {
        const updated = techniques.filter((t) => t.name !== techName)
        updateNodeData(id, { techniques: updated })
    }, [id, techniques, updateNodeData])

    const handleAddTechnique = useCallback((techName: string) => {
        const updated = [
            ...techniques,
            {
                name: techName,
                is_primary: false,
                confidence: 0,
                reasoning: '',
                enabled: true,
            },
        ]
        updateNodeData(id, { techniques: updated })
    }, [id, techniques, updateNodeData])

    return (
        <div
            onClick={handleClick}
            className={cn(
                "relative rounded-xl border transition-all duration-200 shadow-sm",
                "bg-white",
                colors.border,
                hasTechniques ? "min-w-[280px] max-w-[320px]" : "min-w-[220px] max-w-[260px]",
                selected
                    ? "ring-2 ring-gray-400 ring-offset-1 ring-offset-white scale-[1.02] shadow-md"
                    : "hover:ring-1 hover:ring-gray-300 hover:shadow-md",
                executionState === 'running' && "ring-2 ring-yellow-400/60",
                executionState === 'error' && "ring-2 ring-red-400/60",
            )}
        >
            {/* Input Handle */}
            {!isSource && (
                <Handle
                    type="target"
                    position={Position.Left}
                    className="!w-3 !h-3 !border-2 !border-white !-left-1.5"
                    style={{ background: colors.handle }}
                />
            )}

            {/* Header */}
            <div className={cn("flex items-center gap-2 px-3 py-2 rounded-t-xl border-b border-gray-100", colors.bg)}>
                <div className={cn("p-1 rounded-md", colors.bg)}>
                    <IconComponent className={cn("w-3.5 h-3.5", colors.text)} />
                </div>
                <span className="text-xs font-semibold text-gray-800 flex-1 truncate">
                    {nodeDef?.label || type}
                </span>
                {strategyId && (
                    <button
                        onClick={handleInfoClick}
                        className="p-0.5 rounded hover:bg-gray-100 transition-all text-gray-400 hover:text-gray-700"
                        title="Strategy info"
                    >
                        <Info className="w-3 h-3" />
                    </button>
                )}
                <ExecutionIndicator state={executionState} />
                {hasPreview && (
                    <button
                        onClick={handlePreview}
                        className="p-0.5 rounded hover:bg-gray-100 transition-colors"
                        title="View preview"
                    >
                        <Eye className="w-3 h-3 text-gray-400" />
                    </button>
                )}
                <button
                    onClick={handleDelete}
                    className="p-0.5 rounded hover:bg-red-50 transition-colors"
                    title="Delete node"
                >
                    <Trash2 className="w-3 h-3 text-gray-400 hover:text-red-500" />
                </button>
            </div>

            {/* Body - Techniques list (if available) */}
            {hasTechniques && (
                <div className="px-2.5 py-2 space-y-1.5">
                    {techniques.map((tech) => (
                        <TechniqueRow
                            key={tech.name}
                            tech={tech}
                            onToggle={() => handleToggleTechnique(tech.name)}
                            onRemove={() => handleRemoveTechnique(tech.name)}
                            onExpandToggle={() => setExpandedTech(expandedTech === tech.name ? null : tech.name)}
                            expanded={expandedTech === tech.name}
                        />
                    ))}
                    {hasTechniqueSupport && (
                        <AddTechniqueDropdown
                            nodeType={nodeType}
                            existingTechniques={techniques.map((t) => t.name)}
                            onAdd={handleAddTechnique}
                        />
                    )}
                </div>
            )}

            {/* Body - Config Summary (when no techniques) */}
            {!hasTechniques && (
                <div className="px-3 py-2.5">
                    <p className="text-[10px] text-gray-500 leading-relaxed truncate">
                        {getConfigSummary(type || '', data)}
                    </p>
                    {hasTechniqueSupport && (
                        <div className="mt-2">
                            <AddTechniqueDropdown
                                nodeType={nodeType}
                                existingTechniques={[]}
                                onAdd={handleAddTechnique}
                            />
                        </div>
                    )}
                </div>
            )}

            {/* Config summary below techniques */}
            {hasTechniques && (
                <div className="px-3 pb-2 pt-0">
                    <p className="text-[9px] text-gray-400 leading-relaxed truncate border-t border-gray-100 pt-1.5">
                        {getConfigSummary(type || '', data)}
                    </p>
                </div>
            )}

            {/* Output Handle */}
            {category !== 'output' && (
                <Handle
                    type="source"
                    position={Position.Right}
                    className="!w-3 !h-3 !border-2 !border-white !-right-1.5"
                    style={{ background: colors.handle }}
                />
            )}
            {type === 'llm_generation' && (
                <Handle
                    type="source"
                    position={Position.Right}
                    className="!w-3 !h-3 !border-2 !border-white !-right-1.5"
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

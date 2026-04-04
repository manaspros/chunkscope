"use client"

import { useState, useCallback } from 'react'
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { guideApi } from '@/lib/api'
import { usePipelineStore } from '@/stores/usePipelineStore'
import { getNodeDef } from '@/lib/pipeline-nodes'
import { Node, Edge } from 'reactflow'
import {
    FileText, Stethoscope, Code2, GraduationCap, DollarSign, Globe,
    ArrowRight, ArrowLeft, Wand2, Loader2, CheckCircle2, Zap, Target, Clock,
    FileStack, Files, Archive,
    HelpCircle, BarChart3, MessagesSquare, MessageCircle,
} from 'lucide-react'

interface PipelineWizardProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

interface WizardState {
    document_type: string
    document_count: string
    question_type: string
    priority: string
}

interface RecommendationResult {
    pipeline: {
        chunking?: { strategy: string; config?: Record<string, unknown>; reasoning?: string }
        retrieval?: { strategy: string; config?: Record<string, unknown>; reasoning?: string }
        reranking?: { strategy: string; config?: Record<string, unknown>; reasoning?: string }
    }
    reasoning?: string
}

const DOC_TYPES = [
    { id: 'legal', label: 'Legal', icon: FileText, desc: 'Contracts, regulations, policies' },
    { id: 'medical', label: 'Medical', icon: Stethoscope, desc: 'Clinical notes, research papers' },
    { id: 'code', label: 'Code', icon: Code2, desc: 'Source code, documentation' },
    { id: 'academic', label: 'Academic', icon: GraduationCap, desc: 'Papers, textbooks, theses' },
    { id: 'financial', label: 'Financial', icon: DollarSign, desc: 'Reports, statements, filings' },
    { id: 'general', label: 'General', icon: Globe, desc: 'Mixed content, articles, blogs' },
]

const DOC_COUNTS = [
    { id: 'small', label: 'Small', desc: '< 100 documents', icon: FileText },
    { id: 'medium', label: 'Medium', desc: '100 - 1,000 documents', icon: Files },
    { id: 'large', label: 'Large', desc: '1,000+ documents', icon: Archive },
]

const QUESTION_TYPES = [
    { id: 'factoid', label: 'Factoid Lookup', desc: 'Direct answers from the text', icon: HelpCircle },
    { id: 'analytical', label: 'Analytical', desc: 'Analysis and reasoning over content', icon: BarChart3 },
    { id: 'multi-hop', label: 'Multi-hop', desc: 'Questions needing info from multiple passages', icon: MessagesSquare },
    { id: 'conversational', label: 'Conversational', desc: 'Follow-up questions in dialogue', icon: MessageCircle },
]

const PRIORITIES = [
    { id: 'accuracy', label: 'Accuracy', desc: 'Best possible answers', icon: Target, color: 'text-emerald-400' },
    { id: 'speed', label: 'Speed', desc: 'Fastest response times', icon: Zap, color: 'text-blue-400' },
    { id: 'cost', label: 'Cost', desc: 'Minimize operational costs', icon: DollarSign, color: 'text-amber-400' },
]

function RadioOption({
    selected,
    onClick,
    icon: Icon,
    label,
    desc,
    color,
}: {
    selected: boolean
    onClick: () => void
    icon: React.ElementType
    label: string
    desc: string
    color?: string
}) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "flex items-center gap-3 p-3 rounded-lg border text-left transition-all w-full",
                selected
                    ? "bg-gray-50 border-gray-300 text-gray-900"
                    : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300"
            )}
        >
            <div className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                selected ? "bg-gray-100" : "bg-gray-50"
            )}>
                <Icon className={cn("w-4 h-4", selected ? (color || "text-gray-900") : "text-gray-400")} />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold">{label}</p>
                <p className="text-[10px] text-gray-500">{desc}</p>
            </div>
            <div className={cn(
                "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0",
                selected ? "border-gray-900 bg-gray-900" : "border-gray-300"
            )}>
                {selected && <div className="w-2 h-2 rounded-full bg-white" />}
            </div>
        </button>
    )
}

function StepIndicator({ current, total }: { current: number; total: number }) {
    return (
        <div className="flex items-center gap-2">
            {Array.from({ length: total }).map((_, i) => (
                <div
                    key={i}
                    className={cn(
                        "h-1.5 rounded-full transition-all",
                        i === current ? "w-8 bg-gray-900" : i < current ? "w-4 bg-gray-400" : "w-4 bg-gray-200"
                    )}
                />
            ))}
        </div>
    )
}

export function PipelineWizard({ open, onOpenChange }: PipelineWizardProps) {
    const [step, setStep] = useState(0)
    const [state, setState] = useState<WizardState>({
        document_type: '',
        question_type: '',
        document_count: '',
        priority: '',
    })
    const [loading, setLoading] = useState(false)
    const [recommendation, setRecommendation] = useState<RecommendationResult | null>(null)
    const [error, setError] = useState<string | null>(null)

    const addNode = usePipelineStore((s) => s.addNode)
    const setNodes = usePipelineStore((s) => s.setNodes)
    const setEdges = usePipelineStore((s) => s.setEdges)
    const setPipelineName = usePipelineStore((s) => s.setPipelineName)
    const saveHistory = usePipelineStore((s) => s.saveHistory)

    const canProceed = useCallback(() => {
        switch (step) {
            case 0: return !!state.document_type
            case 1: return !!state.document_count
            case 2: return !!state.question_type
            case 3: return !!state.priority
            default: return true
        }
    }, [step, state])

    const handleGenerate = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const result = await guideApi.recommend(state)
            setRecommendation(result)
            setStep(4)
        } catch (err: any) {
            setError(err?.response?.data?.detail || 'Failed to generate recommendation')
        } finally {
            setLoading(false)
        }
    }, [state])

    const handleApply = useCallback(() => {
        if (!recommendation?.pipeline) return

        saveHistory()

        const pipeline = recommendation.pipeline
        const newNodes: Node[] = []
        const newEdges: Edge[] = []
        let x = 100
        const y = 200
        const spacing = 280

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

        // Chunking node
        if (pipeline.chunking) {
            const nodeId = `chunking-${Date.now()}`
            const def = getNodeDef('chunking')
            newNodes.push({
                id: nodeId,
                type: 'chunking',
                position: { x, y },
                data: {
                    ...(def?.defaultConfig || {}),
                    method: pipeline.chunking.strategy,
                    ...(pipeline.chunking.config || {}),
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
        newNodes.push({
            id: embNodeId,
            type: 'embedding',
            position: { x, y },
            data: { ...(embDef?.defaultConfig || {}) },
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

        // Retriever node
        if (pipeline.retrieval) {
            const nodeId = `retriever-${Date.now()}`
            const def = getNodeDef('retriever')
            newNodes.push({
                id: nodeId,
                type: 'retriever',
                position: { x, y },
                data: {
                    ...(def?.defaultConfig || {}),
                    strategy: pipeline.retrieval.strategy,
                    ...(pipeline.retrieval.config || {}),
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

        // Reranker node
        if (pipeline.reranking) {
            const nodeId = `reranker-${Date.now()}`
            const def = getNodeDef('reranker')
            newNodes.push({
                id: nodeId,
                type: 'reranker',
                position: { x, y },
                data: {
                    ...(def?.defaultConfig || {}),
                    provider: pipeline.reranking.strategy,
                    ...(pipeline.reranking.config || {}),
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

        setNodes(newNodes)
        setEdges(newEdges)
        setPipelineName(`${state.document_type} Pipeline - ${state.priority}`)
        onOpenChange(false)

        // Reset wizard
        setStep(0)
        setState({ document_type: '', document_count: '', question_type: '', priority: '' })
        setRecommendation(null)
    }, [recommendation, state, setNodes, setEdges, setPipelineName, saveHistory, onOpenChange])

    const handleClose = useCallback(() => {
        onOpenChange(false)
        setStep(0)
        setState({ document_type: '', document_count: '', question_type: '', priority: '' })
        setRecommendation(null)
        setError(null)
    }, [onOpenChange])

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Wand2 className="w-5 h-5 text-amber-400" />
                        Pipeline Wizard
                    </DialogTitle>
                    <DialogDescription>
                        {step < 4
                            ? "Answer a few questions and we will recommend the optimal pipeline."
                            : "Here is your recommended pipeline configuration."}
                    </DialogDescription>
                </DialogHeader>

                {step < 4 && <StepIndicator current={step} total={4} />}

                <div className="py-2">
                    {/* Step 0: Document Type */}
                    {step === 0 && (
                        <div className="space-y-2">
                            <p className="text-xs font-semibold text-gray-700 mb-3">What type of documents?</p>
                            <div className="grid grid-cols-2 gap-2">
                                {DOC_TYPES.map((dt) => (
                                    <RadioOption
                                        key={dt.id}
                                        selected={state.document_type === dt.id}
                                        onClick={() => setState({ ...state, document_type: dt.id })}
                                        icon={dt.icon}
                                        label={dt.label}
                                        desc={dt.desc}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Step 1: Document Count */}
                    {step === 1 && (
                        <div className="space-y-2">
                            <p className="text-xs font-semibold text-gray-700 mb-3">How many documents?</p>
                            <div className="space-y-2">
                                {DOC_COUNTS.map((dc) => (
                                    <RadioOption
                                        key={dc.id}
                                        selected={state.document_count === dc.id}
                                        onClick={() => setState({ ...state, document_count: dc.id })}
                                        icon={dc.icon}
                                        label={dc.label}
                                        desc={dc.desc}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Step 2: Question Type */}
                    {step === 2 && (
                        <div className="space-y-2">
                            <p className="text-xs font-semibold text-gray-700 mb-3">What kind of questions?</p>
                            <div className="space-y-2">
                                {QUESTION_TYPES.map((qt) => (
                                    <RadioOption
                                        key={qt.id}
                                        selected={state.question_type === qt.id}
                                        onClick={() => setState({ ...state, question_type: qt.id })}
                                        icon={qt.icon}
                                        label={qt.label}
                                        desc={qt.desc}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Step 3: Priority */}
                    {step === 3 && (
                        <div className="space-y-2">
                            <p className="text-xs font-semibold text-gray-700 mb-3">What is your priority?</p>
                            <div className="space-y-2">
                                {PRIORITIES.map((p) => (
                                    <RadioOption
                                        key={p.id}
                                        selected={state.priority === p.id}
                                        onClick={() => setState({ ...state, priority: p.id })}
                                        icon={p.icon}
                                        label={p.label}
                                        desc={p.desc}
                                        color={p.color}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Step 4: Recommendation */}
                    {step === 4 && recommendation && (
                        <div className="space-y-4">
                            {recommendation.reasoning && (
                                <p className="text-xs text-gray-500 leading-relaxed">{recommendation.reasoning}</p>
                            )}

                            {recommendation.pipeline.chunking && (
                                <div className="p-3 rounded-lg bg-purple-500/5 border border-purple-500/20">
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <Badge className="text-[9px] bg-purple-500/15 text-purple-400 border-purple-500/30">Chunking</Badge>
                                        <span className="text-xs font-semibold text-gray-900">{recommendation.pipeline.chunking.strategy}</span>
                                    </div>
                                    {recommendation.pipeline.chunking.reasoning && (
                                        <p className="text-[10px] text-gray-500">{recommendation.pipeline.chunking.reasoning}</p>
                                    )}
                                </div>
                            )}

                            {recommendation.pipeline.retrieval && (
                                <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <Badge className="text-[9px] bg-emerald-500/15 text-emerald-400 border-emerald-500/30">Retrieval</Badge>
                                        <span className="text-xs font-semibold text-gray-900">{recommendation.pipeline.retrieval.strategy}</span>
                                    </div>
                                    {recommendation.pipeline.retrieval.reasoning && (
                                        <p className="text-[10px] text-gray-500">{recommendation.pipeline.retrieval.reasoning}</p>
                                    )}
                                </div>
                            )}

                            {recommendation.pipeline.reranking && (
                                <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <Badge className="text-[9px] bg-amber-500/15 text-amber-400 border-amber-500/30">Reranking</Badge>
                                        <span className="text-xs font-semibold text-gray-900">{recommendation.pipeline.reranking.strategy}</span>
                                    </div>
                                    {recommendation.pipeline.reranking.reasoning && (
                                        <p className="text-[10px] text-gray-500">{recommendation.pipeline.reranking.reasoning}</p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/20 mt-3">
                            <p className="text-xs text-red-400">{error}</p>
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2">
                    {step > 0 && step < 4 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs text-gray-400 hover:text-gray-900"
                            onClick={() => setStep(step - 1)}
                        >
                            <ArrowLeft className="w-3 h-3 mr-1" /> Back
                        </Button>
                    )}
                    {step < 3 && (
                        <Button
                            size="sm"
                            className="h-8 text-xs bg-gray-900 text-white hover:bg-gray-800"
                            onClick={() => setStep(step + 1)}
                            disabled={!canProceed()}
                        >
                            Next <ArrowRight className="w-3 h-3 ml-1" />
                        </Button>
                    )}
                    {step === 3 && (
                        <Button
                            size="sm"
                            className="h-8 text-xs bg-amber-500 text-black hover:bg-amber-400"
                            onClick={handleGenerate}
                            disabled={!canProceed() || loading}
                        >
                            {loading ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                            ) : (
                                <Wand2 className="w-3.5 h-3.5 mr-1" />
                            )}
                            Generate Pipeline
                        </Button>
                    )}
                    {step === 4 && recommendation && (
                        <Button
                            size="sm"
                            className="h-8 text-xs bg-emerald-500 text-black hover:bg-emerald-400"
                            onClick={handleApply}
                        >
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                            Apply Pipeline
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

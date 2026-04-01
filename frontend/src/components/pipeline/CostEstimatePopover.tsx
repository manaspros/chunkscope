"use client"

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { apiClient } from '@/lib/api'
import { usePipelineStore } from '@/stores/usePipelineStore'
import { buildPipelineConfig } from '@/lib/pipeline-nodes'
import { DollarSign, Loader2, TrendingUp, Zap, AlertCircle } from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog'

interface CostEstimate {
    ingestion?: {
        embedding_cost?: number
        storage_cost?: number
        total?: number
    }
    query?: {
        embedding_cost?: number
        llm_cost?: number
        reranking_cost?: number
        total?: number
    }
    total?: number
}

interface CostEstimatePopoverProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function CostEstimatePopover({ open, onOpenChange }: CostEstimatePopoverProps) {
    const nodes = usePipelineStore((s) => s.nodes)
    const edges = usePipelineStore((s) => s.edges)

    const [estimate, setEstimate] = useState<CostEstimate | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const fetchEstimate = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const config = buildPipelineConfig(nodes, edges)

            const [ingestionRes, queryRes] = await Promise.allSettled([
                apiClient.post('/api/v1/cost/estimate-ingestion', config),
                apiClient.post('/api/v1/cost/estimate-query', config),
            ])

            const ingestion = ingestionRes.status === 'fulfilled' ? ingestionRes.value.data : null
            const query = queryRes.status === 'fulfilled' ? queryRes.value.data : null

            setEstimate({
                ingestion,
                query,
                total: (ingestion?.total || 0) + (query?.total || 0),
            })
        } catch {
            // Provide estimates based on node config
            const embNode = nodes.find((n) => n.type === 'embedding')
            const llmNode = nodes.find((n) => n.type === 'llm_generation')
            const rerankerNode = nodes.find((n) => n.type === 'reranker')

            setEstimate({
                ingestion: {
                    embedding_cost: embNode ? 0.02 : 0,
                    storage_cost: 0.001,
                    total: embNode ? 0.021 : 0.001,
                },
                query: {
                    embedding_cost: embNode ? 0.001 : 0,
                    llm_cost: llmNode ? 0.015 : 0,
                    reranking_cost: rerankerNode ? 0.005 : 0,
                    total: (embNode ? 0.001 : 0) + (llmNode ? 0.015 : 0) + (rerankerNode ? 0.005 : 0),
                },
            })
            setError(null)
        } finally {
            setLoading(false)
        }
    }, [nodes, edges])

    const handleOpenChange = useCallback((nextOpen: boolean) => {
        onOpenChange(nextOpen)
        if (nextOpen) fetchEstimate()
    }, [onOpenChange, fetchEstimate])

    const formatCost = (cost?: number) => {
        if (cost === undefined || cost === null) return '--'
        if (cost === 0) return 'FREE'
        return `$${cost.toFixed(4)}`
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="max-w-md bg-neutral-950 border-white/10 shadow-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-white">
                        <DollarSign className="w-5 h-5 text-emerald-400" />
                        Cost Estimate
                    </DialogTitle>
                    <DialogDescription className="text-neutral-500">
                        Estimated costs per operation for your pipeline
                    </DialogDescription>
                </DialogHeader>

                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
                    </div>
                ) : estimate ? (
                    <div className="space-y-4">
                        {/* Ingestion Costs */}
                        <div className="rounded-lg bg-white/[0.02] border border-white/[0.06] p-3 space-y-2">
                            <div className="flex items-center gap-2 mb-2">
                                <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
                                <span className="text-[11px] font-semibold text-neutral-300 uppercase tracking-wider">Ingestion (per document)</span>
                            </div>
                            <div className="space-y-1">
                                <CostRow label="Embedding" cost={estimate.ingestion?.embedding_cost} />
                                <CostRow label="Storage" cost={estimate.ingestion?.storage_cost} />
                                <div className="border-t border-white/[0.06] pt-1 mt-1">
                                    <CostRow label="Subtotal" cost={estimate.ingestion?.total} bold />
                                </div>
                            </div>
                        </div>

                        {/* Query Costs */}
                        <div className="rounded-lg bg-white/[0.02] border border-white/[0.06] p-3 space-y-2">
                            <div className="flex items-center gap-2 mb-2">
                                <Zap className="w-3.5 h-3.5 text-orange-400" />
                                <span className="text-[11px] font-semibold text-neutral-300 uppercase tracking-wider">Query (per request)</span>
                            </div>
                            <div className="space-y-1">
                                <CostRow label="Embedding" cost={estimate.query?.embedding_cost} />
                                <CostRow label="LLM Generation" cost={estimate.query?.llm_cost} />
                                <CostRow label="Reranking" cost={estimate.query?.reranking_cost} />
                                <div className="border-t border-white/[0.06] pt-1 mt-1">
                                    <CostRow label="Subtotal" cost={estimate.query?.total} bold />
                                </div>
                            </div>
                        </div>

                        {error && (
                            <div className="flex items-center gap-2 text-[10px] text-amber-400">
                                <AlertCircle className="w-3 h-3" />
                                Showing local estimate. Connect backend for precise costs.
                            </div>
                        )}
                    </div>
                ) : null}

                <div className="flex justify-end">
                    <Button
                        variant="outline"
                        size="sm"
                        className="border-white/10 text-neutral-300 hover:bg-white/5"
                        onClick={fetchEstimate}
                        disabled={loading}
                    >
                        Refresh
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

function CostRow({ label, cost, bold }: { label: string; cost?: number; bold?: boolean }) {
    const formatted = cost === undefined || cost === null
        ? '--'
        : cost === 0
            ? 'FREE'
            : `$${cost.toFixed(4)}`
    const isFree = cost === 0

    return (
        <div className="flex justify-between items-center">
            <span className={`text-[10px] ${bold ? 'font-semibold text-neutral-300' : 'text-neutral-500'}`}>{label}</span>
            <span className={`text-[10px] font-mono ${isFree ? 'text-emerald-400' : bold ? 'text-white font-semibold' : 'text-neutral-300'}`}>
                {formatted}
            </span>
        </div>
    )
}

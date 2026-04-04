"use client"

import { useCallback, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { usePipelineStore } from '@/stores/usePipelineStore'
import { costApi } from '@/lib/api'
import { buildPipelineConfig } from '@/lib/pipeline-nodes'
import { useDebouncedCallback } from 'use-debounce'
import { DollarSign, Loader2 } from 'lucide-react'

export function CostTicker() {
    const nodes = usePipelineStore((s) => s.nodes)
    const edges = usePipelineStore((s) => s.edges)

    const [costPerQuery, setCostPerQuery] = useState<number | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [hasError, setHasError] = useState(false)

    const fetchEstimate = useCallback(async () => {
        if (nodes.length === 0) {
            setCostPerQuery(null)
            return
        }

        setIsLoading(true)
        setHasError(false)

        try {
            const config = buildPipelineConfig(nodes, edges)
            const response = await costApi.estimateQuery(config)
            const cost = response?.estimated_cost_per_query
                ?? response?.cost_per_query
                ?? response?.cost
                ?? null
            setCostPerQuery(typeof cost === 'number' ? cost : null)
        } catch {
            setHasError(true)
            setCostPerQuery(null)
        } finally {
            setIsLoading(false)
        }
    }, [nodes, edges])

    const debouncedFetch = useDebouncedCallback(fetchEstimate, 300)

    // Re-fetch when nodes/edges change
    useEffect(() => {
        debouncedFetch()
    }, [nodes, edges, debouncedFetch])

    if (nodes.length === 0) return null

    const monthlyCost = costPerQuery !== null ? costPerQuery * 1000 * 30 : null

    const costColor = (cost: number | null) => {
        if (cost === null) return 'text-gray-400'
        if (cost < 0.01) return 'text-emerald-600'
        if (cost <= 0.05) return 'text-amber-600'
        return 'text-red-500'
    }

    const dotColor = (cost: number | null) => {
        if (cost === null) return 'bg-gray-300'
        if (cost < 0.01) return 'bg-emerald-500'
        if (cost <= 0.05) return 'bg-amber-500'
        return 'bg-red-500'
    }

    return (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-gray-50 border border-gray-200">
            <div className={cn("w-1.5 h-1.5 rounded-full", dotColor(costPerQuery))} />
            <DollarSign className="w-3 h-3 text-gray-400" />
            {isLoading ? (
                <div className="flex items-center gap-1">
                    <Loader2 className="w-3 h-3 text-gray-400 animate-spin" />
                    <span className="text-[9px] text-gray-400">Estimating...</span>
                </div>
            ) : hasError ? (
                <span className="text-[9px] text-gray-400">Cost unavailable</span>
            ) : costPerQuery !== null ? (
                <span className="text-[9px] font-mono">
                    <span className="text-gray-500">Est. cost: </span>
                    <span className={costColor(costPerQuery)}>${costPerQuery.toFixed(4)}/query</span>
                    {monthlyCost !== null && (
                        <>
                            <span className="text-gray-400"> | </span>
                            <span className={costColor(costPerQuery)}>${monthlyCost.toFixed(2)}/mo</span>
                            <span className="text-gray-400"> at 1K/day</span>
                        </>
                    )}
                </span>
            ) : (
                <span className="text-[9px] text-gray-400">Add nodes to see cost estimate</span>
            )}
        </div>
    )
}

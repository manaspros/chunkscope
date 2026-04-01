"use client"

import { useState, useCallback } from "react"
import {
    DollarSign,
    ChevronDown,
    ChevronUp,
    Calculator,
    Upload,
    Search,
    TrendingUp,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { costApi } from "@/lib/api"

interface CostBreakdown {
    total: number
    embedding_cost?: number
    storage_cost?: number
    processing_cost?: number
    [key: string]: number | undefined
}

interface CostEstimate {
    ingestion?: CostBreakdown
    per_query?: CostBreakdown
    monthly_1k?: number
    monthly_10k?: number
    model_comparison?: Array<{
        model: string
        ingestion_cost: number
        query_cost: number
    }>
}

function BreakdownSection({
    title,
    icon: Icon,
    breakdown,
    isOpen,
    onToggle,
}: {
    title: string
    icon: React.ElementType
    breakdown: CostBreakdown
    isOpen: boolean
    onToggle: () => void
}) {
    const entries = Object.entries(breakdown).filter(
        ([key, val]) => key !== "total" && val !== undefined && val !== null
    )

    return (
        <div className="border border-white/5 rounded-lg overflow-hidden">
            <button
                onClick={onToggle}
                className="w-full p-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
            >
                <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-amber-500" />
                    <span className="text-sm font-medium text-white">{title}</span>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-green-400 font-mono">
                        ${breakdown.total.toFixed(4)}
                    </span>
                    {isOpen ? (
                        <ChevronUp className="w-4 h-4 text-zinc-500" />
                    ) : (
                        <ChevronDown className="w-4 h-4 text-zinc-500" />
                    )}
                </div>
            </button>
            {isOpen && entries.length > 0 && (
                <div className="px-3 pb-3 space-y-1.5 border-t border-white/5 pt-2">
                    {entries.map(([key, value]) => (
                        <div
                            key={key}
                            className="flex items-center justify-between text-xs"
                        >
                            <span className="text-zinc-500 capitalize">
                                {key.replace(/_/g, " ")}
                            </span>
                            <span className="text-zinc-300 font-mono">
                                ${(value as number).toFixed(4)}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

export function CostEstimator() {
    const [documentSize, setDocumentSize] = useState("10000")
    const [queryCount, setQueryCount] = useState("100")
    const [estimate, setEstimate] = useState<CostEstimate | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [openSections, setOpenSections] = useState<Record<string, boolean>>({})

    const toggleSection = (key: string) => {
        setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))
    }

    const handleEstimate = useCallback(async () => {
        setIsLoading(true)
        setError(null)
        try {
            const [ingestionRes, queryRes] = await Promise.all([
                costApi.estimateIngestion({
                    document_size: parseInt(documentSize) || 10000,
                }),
                costApi.estimateQuery({
                    query_count: parseInt(queryCount) || 100,
                }),
            ])

            const ingestion = ingestionRes?.cost || ingestionRes || { total: 0 }
            const perQuery = queryRes?.cost || queryRes || { total: 0 }

            const queryTotal = typeof perQuery.total === "number" ? perQuery.total : 0

            setEstimate({
                ingestion,
                per_query: perQuery,
                monthly_1k: queryTotal * 1000,
                monthly_10k: queryTotal * 10000,
                model_comparison:
                    ingestionRes?.model_comparison || queryRes?.model_comparison || null,
            })
        } catch (err: any) {
            setError(
                err?.response?.data?.detail || err?.message || "Failed to estimate costs"
            )
        } finally {
            setIsLoading(false)
        }
    }, [documentSize, queryCount])

    return (
        <Card className="border-white/5 bg-zinc-900/50 backdrop-blur-sm">
            <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-amber-500" />
                    <CardTitle className="text-sm font-bold uppercase tracking-wider">
                        Cost Estimator
                    </CardTitle>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Inputs */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                            Document Size (tokens)
                        </label>
                        <Input
                            type="number"
                            value={documentSize}
                            onChange={(e) => setDocumentSize(e.target.value)}
                            placeholder="10000"
                            className="h-9 text-xs"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                            Queries / month
                        </label>
                        <Input
                            type="number"
                            value={queryCount}
                            onChange={(e) => setQueryCount(e.target.value)}
                            placeholder="100"
                            className="h-9 text-xs"
                        />
                    </div>
                </div>

                <Button
                    onClick={handleEstimate}
                    disabled={isLoading}
                    className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-bold h-9 text-xs"
                >
                    {isLoading ? (
                        <span className="flex items-center gap-2">
                            <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Estimating...
                        </span>
                    ) : (
                        <span className="flex items-center gap-2">
                            <Calculator className="w-3.5 h-3.5" />
                            Estimate Costs
                        </span>
                    )}
                </Button>

                {error && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-xs text-red-400">
                        {error}
                    </div>
                )}

                {isLoading && (
                    <div className="space-y-2">
                        <Skeleton className="h-14 rounded-lg" />
                        <Skeleton className="h-14 rounded-lg" />
                        <Skeleton className="h-20 rounded-lg" />
                    </div>
                )}

                {!isLoading && estimate && (
                    <div className="space-y-3">
                        {/* Ingestion */}
                        {estimate.ingestion && (
                            <BreakdownSection
                                title="Ingestion Cost"
                                icon={Upload}
                                breakdown={estimate.ingestion}
                                isOpen={openSections["ingestion"] ?? false}
                                onToggle={() => toggleSection("ingestion")}
                            />
                        )}

                        {/* Per Query */}
                        {estimate.per_query && (
                            <BreakdownSection
                                title="Per-Query Cost"
                                icon={Search}
                                breakdown={estimate.per_query}
                                isOpen={openSections["per_query"] ?? false}
                                onToggle={() => toggleSection("per_query")}
                            />
                        )}

                        {/* Monthly projections */}
                        {(estimate.monthly_1k !== undefined || estimate.monthly_10k !== undefined) && (
                            <div className="border border-white/5 rounded-lg p-3 space-y-2">
                                <div className="flex items-center gap-2 mb-2">
                                    <TrendingUp className="w-4 h-4 text-amber-500" />
                                    <span className="text-sm font-medium text-white">
                                        Monthly Projections
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
                                        <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                                            1K queries/mo
                                        </p>
                                        <p className="text-lg font-bold text-green-400 font-mono mt-1">
                                            ${(estimate.monthly_1k ?? 0).toFixed(2)}
                                        </p>
                                    </div>
                                    <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
                                        <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                                            10K queries/mo
                                        </p>
                                        <p className="text-lg font-bold text-green-400 font-mono mt-1">
                                            ${(estimate.monthly_10k ?? 0).toFixed(2)}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Model comparison */}
                        {estimate.model_comparison && estimate.model_comparison.length > 0 && (
                            <div className="border border-white/5 rounded-lg p-3 space-y-2">
                                <p className="text-xs font-medium text-zinc-400 mb-2">
                                    Cost by Embedding Model
                                </p>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="border-b border-white/5">
                                                <th className="text-left text-[10px] text-zinc-500 pb-1.5 pr-4 font-medium uppercase tracking-wider">
                                                    Model
                                                </th>
                                                <th className="text-right text-[10px] text-zinc-500 pb-1.5 pr-4 font-medium uppercase tracking-wider">
                                                    Ingestion
                                                </th>
                                                <th className="text-right text-[10px] text-zinc-500 pb-1.5 font-medium uppercase tracking-wider">
                                                    Query
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {estimate.model_comparison.map((m, i) => (
                                                <tr
                                                    key={i}
                                                    className="border-b border-white/5"
                                                >
                                                    <td className="py-1.5 pr-4 text-white font-medium">
                                                        {m.model}
                                                    </td>
                                                    <td className="py-1.5 pr-4 text-right text-zinc-400 font-mono">
                                                        ${m.ingestion_cost.toFixed(4)}
                                                    </td>
                                                    <td className="py-1.5 text-right text-zinc-400 font-mono">
                                                        ${m.query_cost.toFixed(4)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

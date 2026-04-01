"use client"

import { Info } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { EvalMetrics } from "@/stores/useEvaluationStore"

interface MetricsPanelProps {
    metrics: EvalMetrics | null
    isLoading: boolean
}

const METRIC_INFO: Record<string, { label: string; description: string }> = {
    faithfulness: {
        label: "Faithfulness",
        description:
            "Measures whether the generated answer is factually consistent with the retrieved context. High scores mean the answer does not hallucinate beyond the provided context.",
    },
    answer_relevancy: {
        label: "Answer Relevancy",
        description:
            "Evaluates how relevant and directly responsive the generated answer is to the original question.",
    },
    context_precision: {
        label: "Context Precision",
        description:
            "Measures whether the relevant context chunks are ranked higher than irrelevant ones in the retrieved results.",
    },
    context_recall: {
        label: "Context Recall",
        description:
            "Evaluates whether all the information needed to answer the question is present in the retrieved context.",
    },
    hit_rate: {
        label: "Hit Rate",
        description:
            "The proportion of queries for which at least one relevant document appears in the top-k retrieved results.",
    },
    mrr: {
        label: "MRR",
        description:
            "Mean Reciprocal Rank: averages the reciprocal of the rank at which the first relevant document is found.",
    },
}

function scoreColor(score: number) {
    if (score >= 0.8) return "text-green-400"
    if (score >= 0.5) return "text-amber-400"
    return "text-red-400"
}

function scoreBg(score: number) {
    if (score >= 0.8) return "bg-green-500"
    if (score >= 0.5) return "bg-amber-500"
    return "bg-red-500"
}

function scoreRingBg(score: number) {
    if (score >= 0.8) return "bg-green-500/10 border-green-500/20"
    if (score >= 0.5) return "bg-amber-500/10 border-amber-500/20"
    return "bg-red-500/10 border-red-500/20"
}

export function MetricsPanel({ metrics, isLoading }: MetricsPanelProps) {
    if (isLoading) {
        return (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-28 rounded-lg" />
                ))}
            </div>
        )
    }

    if (!metrics) return null

    const metricEntries = Object.entries(metrics).filter(
        ([, value]) => value !== undefined && value !== null
    )

    if (metricEntries.length === 0) return null

    return (
        <TooltipProvider>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {metricEntries.map(([key, value]) => {
                    const info = METRIC_INFO[key] || { label: key, description: "" }
                    const score = value as number
                    return (
                        <Card
                            key={key}
                            className={cn(
                                "border backdrop-blur-sm",
                                scoreRingBg(score)
                            )}
                        >
                            <CardContent className="p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                                        {info.label}
                                    </span>
                                    {info.description && (
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <button className="text-zinc-600 hover:text-zinc-400 transition-colors">
                                                    <Info className="w-3.5 h-3.5" />
                                                </button>
                                            </TooltipTrigger>
                                            <TooltipContent
                                                side="top"
                                                className="max-w-xs text-xs"
                                            >
                                                {info.description}
                                            </TooltipContent>
                                        </Tooltip>
                                    )}
                                </div>
                                <div className="flex items-end gap-1">
                                    <span
                                        className={cn(
                                            "text-2xl font-black",
                                            scoreColor(score)
                                        )}
                                    >
                                        {(score * 100).toFixed(0)}
                                    </span>
                                    <span className="text-xs text-zinc-500 pb-1">
                                        / 100
                                    </span>
                                </div>
                                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                    <div
                                        className={cn(
                                            "h-full rounded-full transition-all",
                                            scoreBg(score)
                                        )}
                                        style={{ width: `${score * 100}%` }}
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    )
                })}
            </div>
        </TooltipProvider>
    )
}

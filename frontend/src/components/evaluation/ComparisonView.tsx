"use client"

import { useState } from "react"
import { ArrowLeftRight, Trophy } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useEvaluationStore, EvalMetrics } from "@/stores/useEvaluationStore"

const METRIC_LABELS: Record<string, string> = {
    faithfulness: "Faithfulness",
    answer_relevancy: "Answer Relevancy",
    context_precision: "Context Precision",
    context_recall: "Context Recall",
    hit_rate: "Hit Rate",
    mrr: "MRR",
}

// Placeholder pipeline configs for demonstration
const PIPELINE_CONFIGS = [
    { id: "semantic-512", label: "Semantic / 512 tokens" },
    { id: "recursive-1024", label: "Recursive / 1024 tokens" },
    { id: "fixed-256", label: "Fixed / 256 tokens" },
    { id: "sentence-window", label: "Sentence Window" },
    { id: "paragraph", label: "Paragraph" },
]

function scoreColor(score: number) {
    if (score >= 0.8) return "text-green-400"
    if (score >= 0.5) return "text-amber-400"
    return "text-red-400"
}

function ComparisonRow({
    metricKey,
    label,
    scoreA,
    scoreB,
}: {
    metricKey: string
    label: string
    scoreA: number
    scoreB: number
}) {
    const diff = scoreA - scoreB
    const winner = diff > 0.01 ? "a" : diff < -0.01 ? "b" : "tie"
    const maxScore = Math.max(scoreA, scoreB)

    return (
        <div className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
            {/* Metric name */}
            <span className="text-xs font-medium text-zinc-400 w-32 shrink-0">
                {label}
            </span>

            {/* Config A score */}
            <div className="flex-1 flex items-center gap-2 justify-end">
                {winner === "a" && (
                    <Trophy className="w-3 h-3 text-amber-500 shrink-0" />
                )}
                <span
                    className={cn(
                        "text-sm font-bold font-mono",
                        winner === "a" ? "text-amber-400" : scoreColor(scoreA)
                    )}
                >
                    {(scoreA * 100).toFixed(0)}%
                </span>
            </div>

            {/* Visual comparison bar */}
            <div className="w-32 shrink-0">
                <div className="relative h-3 bg-zinc-800 rounded-full overflow-hidden flex">
                    <div
                        className={cn(
                            "h-full transition-all rounded-l-full",
                            winner === "a"
                                ? "bg-amber-500"
                                : "bg-zinc-600"
                        )}
                        style={{
                            width: `${maxScore > 0 ? (scoreA / (scoreA + scoreB)) * 100 : 50}%`,
                        }}
                    />
                    <div
                        className={cn(
                            "h-full transition-all rounded-r-full",
                            winner === "b"
                                ? "bg-amber-500"
                                : "bg-zinc-600"
                        )}
                        style={{
                            width: `${maxScore > 0 ? (scoreB / (scoreA + scoreB)) * 100 : 50}%`,
                        }}
                    />
                </div>
            </div>

            {/* Config B score */}
            <div className="flex-1 flex items-center gap-2">
                <span
                    className={cn(
                        "text-sm font-bold font-mono",
                        winner === "b" ? "text-amber-400" : scoreColor(scoreB)
                    )}
                >
                    {(scoreB * 100).toFixed(0)}%
                </span>
                {winner === "b" && (
                    <Trophy className="w-3 h-3 text-amber-500 shrink-0" />
                )}
            </div>
        </div>
    )
}

export function ComparisonView() {
    const { comparisonResult } = useEvaluationStore()

    const [configA, setConfigA] = useState("")
    const [configB, setConfigB] = useState("")

    // Use comparison result from store if available, otherwise show placeholder
    const metricsA: EvalMetrics | null = comparisonResult?.metrics_a || null
    const metricsB: EvalMetrics | null = comparisonResult?.metrics_b || null

    // Demo placeholder metrics when no real data is available
    const demoMetricsA: EvalMetrics = {
        faithfulness: 0.85,
        answer_relevancy: 0.78,
        context_precision: 0.92,
        context_recall: 0.71,
        hit_rate: 0.88,
        mrr: 0.82,
    }
    const demoMetricsB: EvalMetrics = {
        faithfulness: 0.79,
        answer_relevancy: 0.84,
        context_precision: 0.76,
        context_recall: 0.89,
        hit_rate: 0.91,
        mrr: 0.75,
    }

    const activeA = metricsA || (configA && configB ? demoMetricsA : null)
    const activeB = metricsB || (configA && configB ? demoMetricsB : null)

    const allMetricKeys = activeA
        ? Object.keys(activeA).filter((k) => activeA[k] !== undefined)
        : Object.keys(METRIC_LABELS)

    return (
        <Card className="border-white/5 bg-zinc-900/50 backdrop-blur-sm">
            <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                    <ArrowLeftRight className="w-4 h-4 text-amber-500" />
                    <CardTitle className="text-sm font-bold uppercase tracking-wider">
                        Compare Configurations
                    </CardTitle>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Config selectors */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                            Config A
                        </label>
                        <Select value={configA} onValueChange={setConfigA}>
                            <SelectTrigger className="h-9 text-xs">
                                <SelectValue placeholder="Select config..." />
                            </SelectTrigger>
                            <SelectContent>
                                {PIPELINE_CONFIGS.map((cfg) => (
                                    <SelectItem
                                        key={cfg.id}
                                        value={cfg.id}
                                        className="text-xs"
                                    >
                                        {cfg.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                            Config B
                        </label>
                        <Select value={configB} onValueChange={setConfigB}>
                            <SelectTrigger className="h-9 text-xs">
                                <SelectValue placeholder="Select config..." />
                            </SelectTrigger>
                            <SelectContent>
                                {PIPELINE_CONFIGS.map((cfg) => (
                                    <SelectItem
                                        key={cfg.id}
                                        value={cfg.id}
                                        className="text-xs"
                                    >
                                        {cfg.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {/* Comparison */}
                {activeA && activeB ? (
                    <div>
                        {/* Headers */}
                        <div className="flex items-center gap-3 pb-2 border-b border-white/10 mb-1">
                            <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider w-32 shrink-0">
                                Metric
                            </span>
                            <span className="flex-1 text-right text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                                Config A
                            </span>
                            <span className="w-32 shrink-0" />
                            <span className="flex-1 text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                                Config B
                            </span>
                        </div>

                        {allMetricKeys.map((key) => (
                            <ComparisonRow
                                key={key}
                                metricKey={key}
                                label={METRIC_LABELS[key] || key}
                                scoreA={activeA[key] ?? 0}
                                scoreB={activeB[key] ?? 0}
                            />
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-zinc-500 text-center py-8">
                        Select two configurations to compare their metrics side by side.
                    </p>
                )}
            </CardContent>
        </Card>
    )
}

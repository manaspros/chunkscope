"use client"

import { useEffect } from "react"
import { Brain, Check } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { useSuggestionStore, EmbeddingModel } from "@/stores/useSuggestionStore"

interface EmbeddingComparisonProps {
    recommendedModel?: string
}

function qualityBadge(tier: string) {
    switch (tier?.toLowerCase()) {
        case "high":
        case "premium":
            return "bg-green-500/15 text-green-400"
        case "medium":
        case "standard":
            return "bg-amber-500/15 text-amber-400"
        case "low":
        case "basic":
            return "bg-zinc-500/15 text-zinc-400"
        default:
            return "bg-zinc-500/15 text-zinc-400"
    }
}

export function EmbeddingComparison({ recommendedModel }: EmbeddingComparisonProps) {
    const { embeddingModels, isEmbeddingsLoading, fetchEmbeddingModels } =
        useSuggestionStore()

    useEffect(() => {
        if (embeddingModels.length === 0) {
            fetchEmbeddingModels()
        }
    }, [embeddingModels.length, fetchEmbeddingModels])

    if (isEmbeddingsLoading) {
        return (
            <Card className="border-white/5 bg-zinc-900/50 backdrop-blur-sm">
                <CardHeader className="pb-3">
                    <Skeleton className="h-5 w-48" />
                </CardHeader>
                <CardContent>
                    <div className="space-y-2">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <Skeleton key={i} className="h-10 w-full" />
                        ))}
                    </div>
                </CardContent>
            </Card>
        )
    }

    if (embeddingModels.length === 0) return null

    return (
        <Card className="border-white/5 bg-zinc-900/50 backdrop-blur-sm">
            <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                    <Brain className="w-4 h-4 text-amber-500" />
                    <CardTitle className="text-sm font-bold uppercase tracking-wider">
                        Embedding Models
                    </CardTitle>
                </div>
            </CardHeader>
            <CardContent>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-white/5">
                                <th className="text-left text-[10px] font-medium text-zinc-500 uppercase tracking-wider pb-2 pr-4">
                                    Model
                                </th>
                                <th className="text-left text-[10px] font-medium text-zinc-500 uppercase tracking-wider pb-2 pr-4">
                                    Dimensions
                                </th>
                                <th className="text-left text-[10px] font-medium text-zinc-500 uppercase tracking-wider pb-2 pr-4">
                                    Cost
                                </th>
                                <th className="text-left text-[10px] font-medium text-zinc-500 uppercase tracking-wider pb-2 pr-4">
                                    Quality
                                </th>
                                <th className="text-left text-[10px] font-medium text-zinc-500 uppercase tracking-wider pb-2">
                                    Speed
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {embeddingModels.map((model: EmbeddingModel, i: number) => {
                                const isRecommended =
                                    recommendedModel &&
                                    model.name?.toLowerCase() ===
                                        recommendedModel?.toLowerCase()
                                return (
                                    <tr
                                        key={i}
                                        className={cn(
                                            "border-b border-white/5 transition-colors",
                                            isRecommended
                                                ? "bg-amber-500/5"
                                                : "hover:bg-white/[0.02]"
                                        )}
                                    >
                                        <td className="py-2.5 pr-4">
                                            <div className="flex items-center gap-2">
                                                {isRecommended && (
                                                    <Check className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                                )}
                                                <span
                                                    className={cn(
                                                        "font-medium",
                                                        isRecommended
                                                            ? "text-amber-400"
                                                            : "text-white"
                                                    )}
                                                >
                                                    {model.name}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="py-2.5 pr-4 text-zinc-400 font-mono text-xs">
                                            {model.dimensions}
                                        </td>
                                        <td className="py-2.5 pr-4 text-zinc-400">
                                            {model.cost}
                                        </td>
                                        <td className="py-2.5 pr-4">
                                            <span
                                                className={cn(
                                                    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize",
                                                    qualityBadge(model.quality_tier)
                                                )}
                                            >
                                                {model.quality_tier}
                                            </span>
                                        </td>
                                        <td className="py-2.5 text-zinc-400">
                                            {model.speed}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </CardContent>
        </Card>
    )
}

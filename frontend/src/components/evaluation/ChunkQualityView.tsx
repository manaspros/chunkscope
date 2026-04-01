"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, BarChart3 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { useEvaluationStore, ChunkQualityItem } from "@/stores/useEvaluationStore"

function scoreColor(score: number) {
    if (score >= 0.8) return "text-green-400"
    if (score >= 0.5) return "text-amber-400"
    return "text-red-400"
}

function scoreBg(score: number) {
    if (score >= 0.8) return "bg-green-500/15"
    if (score >= 0.5) return "bg-amber-500/15"
    return "bg-red-500/15"
}

function scoreBorder(score: number) {
    if (score >= 0.8) return "border-green-500/20"
    if (score >= 0.5) return "border-amber-500/20"
    return "border-red-500/20"
}

function ScoreCell({ label, score }: { label: string; score: number }) {
    return (
        <div className="text-center">
            <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1">
                {label}
            </p>
            <span className={cn("text-sm font-bold", scoreColor(score))}>
                {(score * 100).toFixed(0)}%
            </span>
        </div>
    )
}

function ChunkRow({ item }: { item: ChunkQualityItem }) {
    const [isExpanded, setIsExpanded] = useState(false)

    const avgScore =
        (item.semantic_coherence + item.boundary_quality + item.size_appropriateness) / 3

    return (
        <div
            className={cn(
                "border rounded-lg transition-colors",
                scoreBorder(avgScore),
                scoreBg(avgScore)
            )}
        >
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full p-3 flex items-center gap-4"
            >
                <div className="shrink-0 text-zinc-500">
                    {isExpanded ? (
                        <ChevronDown className="w-4 h-4" />
                    ) : (
                        <ChevronRight className="w-4 h-4" />
                    )}
                </div>
                <span className="text-xs font-mono text-zinc-400 shrink-0 w-16">
                    Chunk {item.chunk_index}
                </span>
                <div className="flex-1 grid grid-cols-3 gap-4">
                    <ScoreCell
                        label="Coherence"
                        score={item.semantic_coherence}
                    />
                    <ScoreCell
                        label="Boundary"
                        score={item.boundary_quality}
                    />
                    <ScoreCell
                        label="Size"
                        score={item.size_appropriateness}
                    />
                </div>
            </button>
            {isExpanded && item.text && (
                <div className="px-3 pb-3 pt-0">
                    <div className="bg-zinc-900/50 border border-white/5 rounded-lg p-3 text-xs text-zinc-400 font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">
                        {item.text}
                    </div>
                </div>
            )}
        </div>
    )
}

export function ChunkQualityView() {
    const { chunkQuality, isChunkQualityLoading, evaluateChunkQuality, error } =
        useEvaluationStore()

    return (
        <Card className="border-white/5 bg-zinc-900/50 backdrop-blur-sm">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-amber-500" />
                        <CardTitle className="text-sm font-bold uppercase tracking-wider">
                            Chunk Quality
                        </CardTitle>
                    </div>
                    <Button
                        onClick={evaluateChunkQuality}
                        disabled={isChunkQualityLoading}
                        size="sm"
                        className="h-8 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold"
                    >
                        {isChunkQualityLoading ? (
                            <span className="flex items-center gap-1.5">
                                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Analyzing...
                            </span>
                        ) : (
                            "Evaluate Chunks"
                        )}
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-2">
                {error && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-xs text-red-400 mb-3">
                        {error}
                    </div>
                )}

                {isChunkQualityLoading && (
                    <div className="space-y-2">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <Skeleton key={i} className="h-14 rounded-lg" />
                        ))}
                    </div>
                )}

                {!isChunkQualityLoading && chunkQuality.length === 0 && (
                    <p className="text-sm text-zinc-500 text-center py-8">
                        Click &quot;Evaluate Chunks&quot; to analyze the quality of your current chunks.
                    </p>
                )}

                {chunkQuality.map((item, i) => (
                    <ChunkRow key={i} item={item} />
                ))}
            </CardContent>
        </Card>
    )
}

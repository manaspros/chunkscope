"use client"

import {
    AlertTriangle,
    ArrowRight,
    CheckCircle2,
    Layers,
    Ruler,
    Copy,
    Brain,
    Search,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { Recommendation, SuggestionResponse } from "@/stores/useSuggestionStore"
import { useConfigStore, ChunkingMethod } from "@/stores/useConfigStore"
import { useRouter } from "next/navigation"

interface RecommendationCardProps {
    recommendations: SuggestionResponse | null
    isLoading: boolean
}

function confidenceColor(score: number) {
    if (score >= 0.8) return "bg-green-500"
    if (score >= 0.5) return "bg-amber-500"
    return "bg-red-500"
}

function confidenceLabel(score: number) {
    if (score >= 0.8) return "text-green-400"
    if (score >= 0.5) return "text-amber-400"
    return "text-red-400"
}

function RecommendationDetail({
    rec,
    isPrimary,
    onApply,
}: {
    rec: Recommendation
    isPrimary: boolean
    onApply: (rec: Recommendation) => void
}) {
    const fields = [
        { label: "Method", value: rec.chunking_method, icon: Layers },
        { label: "Chunk Size", value: `${rec.chunk_size} tokens`, icon: Ruler },
        { label: "Overlap", value: `${rec.overlap} tokens`, icon: Copy },
        { label: "Embedding", value: rec.embedding_model, icon: Brain },
        { label: "Retrieval", value: rec.retrieval_strategy, icon: Search },
    ]

    return (
        <div
            className={cn(
                "border rounded-lg",
                isPrimary
                    ? "border-amber-500/30 bg-amber-500/5"
                    : "border-white/5 bg-zinc-800/30"
            )}
        >
            <div className="p-4 space-y-4">
                {isPrimary && (
                    <div className="flex items-center gap-2 mb-1">
                        <CheckCircle2 className="w-4 h-4 text-amber-500" />
                        <span className="text-xs font-bold text-amber-500 uppercase tracking-wider">
                            Recommended
                        </span>
                    </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {fields.map((field) => (
                        <div key={field.label} className="space-y-0.5">
                            <div className="flex items-center gap-1 text-zinc-500">
                                <field.icon className="w-3 h-3" />
                                <span className="text-[10px] font-medium uppercase tracking-wider">
                                    {field.label}
                                </span>
                            </div>
                            <p className="text-sm font-semibold text-white truncate">
                                {field.value}
                            </p>
                        </div>
                    ))}
                </div>

                {/* Confidence */}
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-400 font-medium">Confidence</span>
                        <span className={cn("font-bold", confidenceLabel(rec.confidence))}>
                            {(rec.confidence * 100).toFixed(0)}%
                        </span>
                    </div>
                    <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                            className={cn(
                                "h-full rounded-full transition-all",
                                confidenceColor(rec.confidence)
                            )}
                            style={{ width: `${rec.confidence * 100}%` }}
                        />
                    </div>
                </div>

                {/* Warnings */}
                {rec.warnings && rec.warnings.length > 0 && (
                    <div className="space-y-2">
                        {rec.warnings.map((warning, i) => (
                            <div
                                key={i}
                                className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-400"
                            >
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                <span>{warning}</span>
                            </div>
                        ))}
                    </div>
                )}

                <Button
                    onClick={() => onApply(rec)}
                    className={cn(
                        "w-full font-bold h-9 text-xs",
                        isPrimary
                            ? "bg-amber-500 hover:bg-amber-600 text-black"
                            : "bg-zinc-700 hover:bg-zinc-600 text-white"
                    )}
                >
                    <span className="flex items-center gap-2">
                        {isPrimary ? "Apply to Pipeline" : "Use This Instead"}
                        <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                </Button>
            </div>
        </div>
    )
}

export function RecommendationCard({
    recommendations,
    isLoading,
}: RecommendationCardProps) {
    const router = useRouter()
    const { setMethod, setChunkSize, setOverlap } = useConfigStore()

    if (isLoading) {
        return (
            <Card className="border-white/5 bg-zinc-900/50 backdrop-blur-sm">
                <CardHeader className="pb-3">
                    <Skeleton className="h-5 w-48" />
                </CardHeader>
                <CardContent className="space-y-4">
                    <Skeleton className="h-48 rounded-lg" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Skeleton className="h-32 rounded-lg" />
                        <Skeleton className="h-32 rounded-lg" />
                    </div>
                </CardContent>
            </Card>
        )
    }

    if (!recommendations) return null

    const handleApply = (rec: Recommendation) => {
        const methodMap: Record<string, ChunkingMethod> = {
            fixed: "fixed",
            semantic: "semantic",
            recursive: "recursive",
            sentence_window: "sentence_window",
            paragraph: "paragraph",
            code_aware: "code_aware",
            heading_based: "heading_based",
        }
        const method = methodMap[rec.chunking_method] || "semantic"
        setMethod(method)
        setChunkSize(rec.chunk_size)
        setOverlap(rec.overlap)
        router.push("/pipeline")
    }

    return (
        <Card className="border-white/5 bg-zinc-900/50 backdrop-blur-sm">
            <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold uppercase tracking-wider">
                    Recommendations
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Primary */}
                {recommendations.primary && (
                    <RecommendationDetail
                        rec={recommendations.primary}
                        isPrimary={true}
                        onApply={handleApply}
                    />
                )}

                {/* Alternatives */}
                {recommendations.alternatives && recommendations.alternatives.length > 0 && (
                    <div className="space-y-3">
                        <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                            Alternatives
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {recommendations.alternatives.slice(0, 2).map((alt, i) => (
                                <RecommendationDetail
                                    key={i}
                                    rec={alt}
                                    isPrimary={false}
                                    onApply={handleApply}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

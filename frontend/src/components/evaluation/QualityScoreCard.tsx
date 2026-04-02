"use client"

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import {
    Lightbulb,
    TrendingUp,
    Shield,
    Target,
    Zap,
    DollarSign,
} from 'lucide-react'

interface QualityMetrics {
    faithfulness?: number
    answer_relevancy?: number
    context_precision?: number
    context_recall?: number
    hit_rate?: number
    normalized_cost?: number
}

interface QualityScoreCardProps {
    metrics: QualityMetrics
    className?: string
}

interface SubScore {
    label: string
    value: number
    maxPoints: number
    icon: React.ElementType
    color: string
}

interface Tip {
    text: string
    priority: 'high' | 'medium' | 'low'
}

function computeQualityScore(metrics: QualityMetrics) {
    const faithfulness = metrics.faithfulness ?? 0
    const answerRelevancy = metrics.answer_relevancy ?? 0
    const contextPrecision = metrics.context_precision ?? 0
    const contextRecall = metrics.context_recall ?? 0
    const hitRate = metrics.hit_rate ?? 0
    const normalizedCost = metrics.normalized_cost ?? 0.5

    const score =
        faithfulness * 25 +
        answerRelevancy * 25 +
        contextPrecision * 20 +
        contextRecall * 15 +
        hitRate * 10 +
        (1 - normalizedCost) * 5

    return Math.round(Math.min(100, Math.max(0, score)))
}

function getSubScores(metrics: QualityMetrics): SubScore[] {
    return [
        {
            label: 'Retrieval Quality',
            value: ((metrics.context_precision ?? 0) * 20 + (metrics.context_recall ?? 0) * 15 + (metrics.hit_rate ?? 0) * 10),
            maxPoints: 45,
            icon: Target,
            color: 'emerald',
        },
        {
            label: 'Answer Quality',
            value: ((metrics.faithfulness ?? 0) * 25 + (metrics.answer_relevancy ?? 0) * 25),
            maxPoints: 50,
            icon: Shield,
            color: 'blue',
        },
        {
            label: 'Chunk Quality',
            value: ((metrics.context_precision ?? 0) * 20),
            maxPoints: 20,
            icon: Zap,
            color: 'purple',
        },
        {
            label: 'Cost Efficiency',
            value: ((1 - (metrics.normalized_cost ?? 0.5)) * 5),
            maxPoints: 5,
            icon: DollarSign,
            color: 'amber',
        },
    ]
}

function getTips(metrics: QualityMetrics): Tip[] {
    const tips: Tip[] = []

    if ((metrics.faithfulness ?? 1) < 0.7) {
        tips.push({
            text: 'Try adding a reranker to improve context quality',
            priority: 'high',
        })
    }

    if ((metrics.context_precision ?? 1) < 0.5) {
        tips.push({
            text: 'Reduce chunk size for more precise retrieval',
            priority: 'high',
        })
    }

    if ((metrics.context_recall ?? 1) < 0.6) {
        tips.push({
            text: 'Increase top_k or try hybrid retrieval',
            priority: 'medium',
        })
    }

    if ((metrics.hit_rate ?? 1) < 0.8) {
        tips.push({
            text: 'Try a different embedding model or switch to hybrid search',
            priority: 'medium',
        })
    }

    if ((metrics.answer_relevancy ?? 1) < 0.6) {
        tips.push({
            text: 'Improve your system prompt to focus the LLM on the question',
            priority: 'medium',
        })
    }

    if ((metrics.normalized_cost ?? 0) > 0.7) {
        tips.push({
            text: 'Consider a smaller LLM model or local embeddings to reduce cost',
            priority: 'low',
        })
    }

    return tips
}

function scoreMainColor(score: number) {
    if (score >= 71) return { text: 'text-emerald-400', ring: 'stroke-emerald-500', bg: 'bg-emerald-500/10' }
    if (score >= 41) return { text: 'text-amber-400', ring: 'stroke-amber-500', bg: 'bg-amber-500/10' }
    return { text: 'text-red-400', ring: 'stroke-red-500', bg: 'bg-red-500/10' }
}

function CircularProgress({ score, size = 120 }: { score: number; size?: number }) {
    const colors = scoreMainColor(score)
    const strokeWidth = 8
    const radius = (size - strokeWidth) / 2
    const circumference = 2 * Math.PI * radius
    const offset = circumference - (score / 100) * circumference

    return (
        <div className="relative inline-flex items-center justify-center">
            <svg width={size} height={size} className="-rotate-90">
                {/* Background track */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={strokeWidth}
                    className="text-white/[0.06]"
                />
                {/* Progress arc */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    className={cn("transition-all duration-700 ease-out", colors.ring)}
                />
            </svg>
            {/* Score text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={cn("text-3xl font-black", colors.text)}>
                    {score}
                </span>
                <span className="text-[9px] text-neutral-500 -mt-0.5">/ 100</span>
            </div>
        </div>
    )
}

const SUB_SCORE_COLORS: Record<string, { bar: string; text: string }> = {
    emerald: { bar: 'bg-emerald-500', text: 'text-emerald-400' },
    blue: { bar: 'bg-blue-500', text: 'text-blue-400' },
    purple: { bar: 'bg-purple-500', text: 'text-purple-400' },
    amber: { bar: 'bg-amber-500', text: 'text-amber-400' },
}

const TIP_PRIORITY_STYLES: Record<string, { icon: string; bg: string; border: string }> = {
    high: { icon: 'text-red-400', bg: 'bg-red-500/5', border: 'border-red-500/20' },
    medium: { icon: 'text-amber-400', bg: 'bg-amber-500/5', border: 'border-amber-500/20' },
    low: { icon: 'text-blue-400', bg: 'bg-blue-500/5', border: 'border-blue-500/20' },
}

export function QualityScoreCard({ metrics, className }: QualityScoreCardProps) {
    const score = useMemo(() => computeQualityScore(metrics), [metrics])
    const subScores = useMemo(() => getSubScores(metrics), [metrics])
    const tips = useMemo(() => getTips(metrics), [metrics])
    const colors = scoreMainColor(score)

    return (
        <Card className={cn("border border-white/[0.08] bg-neutral-950/80 backdrop-blur-xl", className)}>
            <CardContent className="p-5">
                {/* Top: Score circle + label */}
                <div className="flex items-center gap-5">
                    <CircularProgress score={score} />
                    <div className="flex-1">
                        <h3 className="text-sm font-bold text-white mb-0.5">Quality Score</h3>
                        <p className="text-[10px] text-neutral-500 mb-3">
                            {score >= 71
                                ? 'Your pipeline is performing well'
                                : score >= 41
                                    ? 'Some areas need improvement'
                                    : 'Significant improvements needed'}
                        </p>
                        {/* Sub-scores */}
                        <div className="space-y-2">
                            {subScores.map((sub) => {
                                const pct = sub.maxPoints > 0 ? (sub.value / sub.maxPoints) * 100 : 0
                                const colorSet = SUB_SCORE_COLORS[sub.color] || SUB_SCORE_COLORS.emerald
                                const Icon = sub.icon
                                return (
                                    <div key={sub.label} className="flex items-center gap-2">
                                        <Icon className={cn("w-3 h-3 shrink-0", colorSet.text)} />
                                        <span className="text-[9px] text-neutral-500 w-24 shrink-0">{sub.label}</span>
                                        <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                                            <div
                                                className={cn("h-full rounded-full transition-all duration-500", colorSet.bar)}
                                                style={{ width: `${Math.min(100, pct)}%` }}
                                            />
                                        </div>
                                        <span className={cn("text-[9px] font-mono w-10 text-right", colorSet.text)}>
                                            {sub.value.toFixed(1)}/{sub.maxPoints}
                                        </span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>

                {/* Tips */}
                {tips.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-white/[0.06]">
                        <div className="flex items-center gap-1.5 mb-2">
                            <TrendingUp className="w-3.5 h-3.5 text-neutral-500" />
                            <span className="text-[10px] font-bold text-neutral-500 uppercase">How to Improve</span>
                        </div>
                        <div className="space-y-1.5">
                            {tips.map((tip, i) => {
                                const style = TIP_PRIORITY_STYLES[tip.priority] || TIP_PRIORITY_STYLES.medium
                                return (
                                    <div
                                        key={i}
                                        className={cn(
                                            "flex items-start gap-2 px-2.5 py-2 rounded border",
                                            style.bg, style.border
                                        )}
                                    >
                                        <Lightbulb className={cn("w-3 h-3 mt-0.5 shrink-0", style.icon)} />
                                        <span className="text-[10px] text-neutral-300">{tip.text}</span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

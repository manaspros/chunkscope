"use client"

import { useEffect, useState, useCallback } from 'react'
import {
    Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { guideApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import {
    CheckCircle2, XCircle, Lightbulb, Cpu, Zap, DollarSign,
    Target, ArrowRightLeft, Loader2, Copy, Check,
} from 'lucide-react'

export interface StrategyInfo {
    id: string
    name: string
    category: string
    summary: string
    when_to_use: string[]
    when_not_to_use: string[]
    best_for: string[]
    complexity: string
    latency: string
    cost: string
    requires_llm: boolean
    requires_gpu: boolean
    accuracy_tier: string
    pairs_well_with: string[]
    example_config: Record<string, unknown>
    decision_factors: string[]
    tradeoffs: string
    pro_tip: string
}

interface StrategyInfoDrawerProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    strategyId: string | null
    onSelectStrategy?: (id: string) => void
    onApplyConfig?: (config: Record<string, unknown>) => void
}

const CATEGORY_STYLES: Record<string, { bg: string; text: string; border: string }> = {
    chunking: { bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/30' },
    retrieval: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' },
    reranking: { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30' },
}

function StatBadge({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <div className="flex flex-col items-center gap-1 p-2 rounded-lg bg-gray-50 border border-gray-200">
            <span className="text-[8px] uppercase font-bold text-gray-500">{label}</span>
            <span className={cn("text-[11px] font-semibold", color)}>{value}</span>
        </div>
    )
}

export function StrategyInfoDrawer({
    open,
    onOpenChange,
    strategyId,
    onSelectStrategy,
    onApplyConfig,
}: StrategyInfoDrawerProps) {
    const [strategy, setStrategy] = useState<StrategyInfo | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        if (!strategyId || !open) {
            setStrategy(null)
            return
        }

        let cancelled = false
        setLoading(true)
        setError(null)

        guideApi.getStrategy(strategyId)
            .then((data) => {
                if (!cancelled) setStrategy(data)
            })
            .catch((err) => {
                if (!cancelled) setError(err?.response?.data?.detail || 'Failed to load strategy info')
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })

        return () => { cancelled = true }
    }, [strategyId, open])

    const handleCopyConfig = useCallback(() => {
        if (!strategy?.example_config) return
        navigator.clipboard.writeText(JSON.stringify(strategy.example_config, null, 2))
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }, [strategy])

    const catStyle = strategy ? (CATEGORY_STYLES[strategy.category] || CATEGORY_STYLES.chunking) : CATEGORY_STYLES.chunking

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="w-[420px] sm:max-w-[420px] p-0 flex flex-col">
                {loading && (
                    <div className="flex-1 flex items-center justify-center">
                        <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
                    </div>
                )}

                {error && (
                    <div className="flex-1 flex items-center justify-center p-6">
                        <div className="text-center">
                            <XCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
                            <p className="text-sm text-gray-500">{error}</p>
                        </div>
                    </div>
                )}

                {strategy && !loading && (
                    <>
                        <SheetHeader className="p-5 pb-0">
                            <div className="flex items-center gap-2 mb-1">
                                <Badge className={cn("text-[10px]", catStyle.bg, catStyle.text, catStyle.border)}>
                                    {strategy.category}
                                </Badge>
                                {strategy.requires_llm && (
                                    <Badge variant="outline" className="text-[9px] border-orange-500/30 text-orange-400">
                                        Requires LLM
                                    </Badge>
                                )}
                                {strategy.requires_gpu && (
                                    <Badge variant="outline" className="text-[9px] border-red-500/30 text-red-400">
                                        <Cpu className="w-2.5 h-2.5 mr-1" />GPU
                                    </Badge>
                                )}
                            </div>
                            <SheetTitle className="text-base">{strategy.name}</SheetTitle>
                            <SheetDescription className="text-xs">{strategy.summary}</SheetDescription>
                        </SheetHeader>

                        <ScrollArea className="flex-1">
                            <div className="p-5 space-y-5">
                                {/* Stats Row */}
                                <div className="grid grid-cols-4 gap-2">
                                    <StatBadge label="Complexity" value={strategy.complexity} color="text-purple-400" />
                                    <StatBadge label="Latency" value={strategy.latency} color="text-blue-400" />
                                    <StatBadge label="Cost" value={strategy.cost} color="text-emerald-400" />
                                    <StatBadge label="Accuracy" value={strategy.accuracy_tier} color="text-amber-400" />
                                </div>

                                {/* When to Use */}
                                {strategy.when_to_use.length > 0 && (
                                    <div>
                                        <h4 className="text-[10px] uppercase font-bold text-gray-500 mb-2">When to Use</h4>
                                        <ul className="space-y-1.5">
                                            {strategy.when_to_use.map((item, i) => (
                                                <li key={i} className="flex items-start gap-2 text-xs text-gray-700">
                                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                                                    {item}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {/* When NOT to Use */}
                                {strategy.when_not_to_use.length > 0 && (
                                    <div>
                                        <h4 className="text-[10px] uppercase font-bold text-gray-500 mb-2">When NOT to Use</h4>
                                        <ul className="space-y-1.5">
                                            {strategy.when_not_to_use.map((item, i) => (
                                                <li key={i} className="flex items-start gap-2 text-xs text-gray-700">
                                                    <XCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                                                    {item}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {/* Best For */}
                                {strategy.best_for.length > 0 && (
                                    <div>
                                        <h4 className="text-[10px] uppercase font-bold text-gray-500 mb-2">Best For</h4>
                                        <div className="flex flex-wrap gap-1.5">
                                            {strategy.best_for.map((tag, i) => (
                                                <Badge key={i} variant="outline" className="text-[10px] border-gray-200 text-gray-700">
                                                    {tag}
                                                </Badge>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Tradeoffs */}
                                {strategy.tradeoffs && (
                                    <div>
                                        <h4 className="text-[10px] uppercase font-bold text-gray-500 mb-2 flex items-center gap-1">
                                            <ArrowRightLeft className="w-3 h-3" /> Tradeoffs
                                        </h4>
                                        <p className="text-xs text-gray-500 leading-relaxed">{strategy.tradeoffs}</p>
                                    </div>
                                )}

                                {/* Pairs Well With */}
                                {strategy.pairs_well_with.length > 0 && (
                                    <div>
                                        <h4 className="text-[10px] uppercase font-bold text-gray-500 mb-2">Pairs Well With</h4>
                                        <div className="flex flex-wrap gap-1.5">
                                            {strategy.pairs_well_with.map((id, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => onSelectStrategy?.(id)}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium bg-gray-100 border border-gray-200 text-gray-700 hover:bg-gray-200 hover:text-gray-900 transition-colors cursor-pointer"
                                                >
                                                    <Zap className="w-2.5 h-2.5 text-amber-400" />
                                                    {id}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Pro Tip */}
                                {strategy.pro_tip && (
                                    <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                                        <div className="flex items-center gap-1.5 mb-1.5">
                                            <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                                            <span className="text-[10px] uppercase font-bold text-amber-400">Pro Tip</span>
                                        </div>
                                        <p className="text-xs text-amber-200/80 leading-relaxed">{strategy.pro_tip}</p>
                                    </div>
                                )}

                                {/* Example Config */}
                                {strategy.example_config && Object.keys(strategy.example_config).length > 0 && (
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <h4 className="text-[10px] uppercase font-bold text-gray-500">Example Config</h4>
                                            <button
                                                onClick={handleCopyConfig}
                                                className="flex items-center gap-1 text-[9px] text-gray-500 hover:text-gray-900 transition-colors"
                                            >
                                                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                                {copied ? 'Copied' : 'Copy'}
                                            </button>
                                        </div>
                                        <pre className="text-[10px] text-gray-500 font-mono p-3 rounded-lg bg-gray-50 border border-gray-200 overflow-x-auto whitespace-pre-wrap">
                                            {JSON.stringify(strategy.example_config, null, 2)}
                                        </pre>
                                        {onApplyConfig && (
                                            <Button
                                                size="sm"
                                                className="w-full mt-2 h-8 text-xs bg-gray-100 hover:bg-gray-200 text-gray-900 border border-gray-200"
                                                onClick={() => onApplyConfig(strategy.example_config)}
                                            >
                                                <Target className="w-3 h-3 mr-1.5" />
                                                Apply Config
                                            </Button>
                                        )}
                                    </div>
                                )}

                                {/* Decision Factors */}
                                {strategy.decision_factors && strategy.decision_factors.length > 0 && (
                                    <div>
                                        <h4 className="text-[10px] uppercase font-bold text-gray-500 mb-2">Decision Factors</h4>
                                        <ul className="space-y-1">
                                            {strategy.decision_factors.map((factor, i) => (
                                                <li key={i} className="text-[10px] text-gray-500 flex items-start gap-1.5">
                                                    <DollarSign className="w-3 h-3 text-gray-400 mt-0.5 shrink-0" />
                                                    {factor}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        </ScrollArea>
                    </>
                )}
            </SheetContent>
        </Sheet>
    )
}

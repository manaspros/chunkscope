"use client"

import { useEffect, useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { Navbar } from '@/components/layout/Navbar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { guideApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import { StrategyInfoDrawer, StrategyInfo } from '@/components/pipeline/StrategyInfoDrawer'
import {
    Search, Filter, Loader2, CheckCircle2, XCircle, Zap, Cpu,
    ArrowLeft, Columns2, X,
} from 'lucide-react'

type StrategySummary = StrategyInfo

const CATEGORY_STYLES: Record<string, { bg: string; text: string; border: string; accent: string }> = {
    chunking: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20', accent: 'purple' },
    retrieval: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', accent: 'emerald' },
    reranking: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20', accent: 'amber' },
}

function ComplexityBadge({ value }: { value: string }) {
    const color = value === 'Low' ? 'text-emerald-400 border-emerald-500/20' :
        value === 'Medium' ? 'text-amber-400 border-amber-500/20' :
            'text-red-400 border-red-500/20'
    return <Badge variant="outline" className={cn("text-[9px]", color)}>{value}</Badge>
}

function StrategyCard({
    strategy,
    onView,
    compareMode,
    isSelected,
    onToggleCompare,
}: {
    strategy: StrategySummary
    onView: () => void
    compareMode: boolean
    isSelected: boolean
    onToggleCompare: () => void
}) {
    const cat = CATEGORY_STYLES[strategy.category] || CATEGORY_STYLES.chunking

    return (
        <div
            className={cn(
                "relative group p-4 rounded-xl border transition-all cursor-pointer",
                "bg-neutral-950/80 hover:bg-neutral-950/90",
                isSelected ? "ring-2 ring-amber-500/50 border-amber-500/30" : "border-white/[0.06] hover:border-white/[0.12]",
            )}
            onClick={compareMode ? onToggleCompare : onView}
        >
            {compareMode && (
                <div className={cn(
                    "absolute top-3 right-3 w-5 h-5 rounded border-2 flex items-center justify-center transition-all",
                    isSelected ? "bg-amber-500 border-amber-500" : "border-neutral-600"
                )}>
                    {isSelected && (
                        <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    )}
                </div>
            )}

            <div className="flex items-center gap-2 mb-2">
                <Badge className={cn("text-[9px]", cat.bg, cat.text, cat.border)}>{strategy.category}</Badge>
                {strategy.requires_llm && (
                    <Badge variant="outline" className="text-[8px] border-orange-500/20 text-orange-400">LLM</Badge>
                )}
                {strategy.requires_gpu && (
                    <Badge variant="outline" className="text-[8px] border-red-500/20 text-red-400">
                        <Cpu className="w-2 h-2 mr-0.5" />GPU
                    </Badge>
                )}
            </div>

            <h3 className="text-sm font-semibold text-white mb-1">{strategy.name}</h3>
            <p className="text-[11px] text-neutral-400 mb-3 line-clamp-2">{strategy.summary}</p>

            <div className="flex items-center gap-2 flex-wrap">
                <ComplexityBadge value={strategy.complexity} />
                <Badge variant="outline" className="text-[9px] text-blue-400 border-blue-500/20">{strategy.latency}</Badge>
                <Badge variant="outline" className="text-[9px] text-emerald-400 border-emerald-500/20">{strategy.cost}</Badge>
                <Badge variant="outline" className="text-[9px] text-amber-400 border-amber-500/20">{strategy.accuracy_tier}</Badge>
            </div>
        </div>
    )
}

function CompareTable({ strategies, onClose }: { strategies: StrategySummary[]; onClose: () => void }) {
    if (strategies.length < 2) return null

    const fields: { key: keyof StrategySummary; label: string }[] = [
        { key: 'summary', label: 'Summary' },
        { key: 'complexity', label: 'Complexity' },
        { key: 'latency', label: 'Latency' },
        { key: 'cost', label: 'Cost' },
        { key: 'accuracy_tier', label: 'Accuracy' },
        { key: 'requires_llm', label: 'Requires LLM' },
        { key: 'requires_gpu', label: 'Requires GPU' },
        { key: 'tradeoffs', label: 'Tradeoffs' },
        { key: 'pro_tip', label: 'Pro Tip' },
    ]

    return (
        <div className="rounded-xl border border-white/[0.06] bg-neutral-950/80 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Columns2 className="w-4 h-4 text-amber-400" />
                    Comparing {strategies.length} Strategies
                </h3>
                <button onClick={onClose} className="p-1 rounded hover:bg-white/10 transition-colors">
                    <X className="w-4 h-4 text-neutral-400" />
                </button>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="border-b border-white/[0.06]">
                            <th className="text-left p-3 text-neutral-500 font-bold uppercase text-[9px] w-32">Field</th>
                            {strategies.map((s) => (
                                <th key={s.id} className="text-left p-3 text-white font-semibold">{s.name}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {fields.map((field) => (
                            <tr key={field.key} className="border-b border-white/[0.03]">
                                <td className="p-3 text-neutral-500 font-medium text-[10px] uppercase">{field.label}</td>
                                {strategies.map((s) => {
                                    const val = s[field.key]
                                    return (
                                        <td key={s.id} className="p-3 text-neutral-300">
                                            {typeof val === 'boolean' ? (
                                                val ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-neutral-600" />
                                            ) : Array.isArray(val) ? (
                                                <div className="flex flex-wrap gap-1">
                                                    {(val as string[]).map((v, i) => (
                                                        <Badge key={i} variant="outline" className="text-[9px] border-white/10">{v}</Badge>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span>{String(val || '-')}</span>
                                            )}
                                        </td>
                                    )
                                })}
                            </tr>
                        ))}
                        <tr className="border-b border-white/[0.03]">
                            <td className="p-3 text-neutral-500 font-medium text-[10px] uppercase">When to Use</td>
                            {strategies.map((s) => (
                                <td key={s.id} className="p-3">
                                    <ul className="space-y-1">
                                        {s.when_to_use.map((item, i) => (
                                            <li key={i} className="flex items-start gap-1 text-neutral-300">
                                                <CheckCircle2 className="w-3 h-3 text-emerald-400 mt-0.5 shrink-0" />
                                                {item}
                                            </li>
                                        ))}
                                    </ul>
                                </td>
                            ))}
                        </tr>
                        <tr>
                            <td className="p-3 text-neutral-500 font-medium text-[10px] uppercase">Best For</td>
                            {strategies.map((s) => (
                                <td key={s.id} className="p-3">
                                    <div className="flex flex-wrap gap-1">
                                        {s.best_for.map((tag, i) => (
                                            <Badge key={i} variant="outline" className="text-[9px] border-white/10 text-neutral-300">{tag}</Badge>
                                        ))}
                                    </div>
                                </td>
                            ))}
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    )
}

export default function GuidePage() {
    const [strategies, setStrategies] = useState<StrategySummary[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [complexityFilter, setComplexityFilter] = useState<string | null>(null)
    const [freeOnly, setFreeOnly] = useState(false)
    const [noGpu, setNoGpu] = useState(false)
    const [drawerOpen, setDrawerOpen] = useState(false)
    const [selectedStrategyId, setSelectedStrategyId] = useState<string | null>(null)
    const [compareMode, setCompareMode] = useState(false)
    const [compareIds, setCompareIds] = useState<string[]>([])
    const [activeTab, setActiveTab] = useState('chunking')

    useEffect(() => {
        guideApi.getStrategies()
            .then((data) => {
                const list = Array.isArray(data) ? data : (data.strategies || [])
                setStrategies(list)
            })
            .catch((err) => setError(err?.response?.data?.detail || 'Failed to load strategies'))
            .finally(() => setLoading(false))
    }, [])

    const filteredStrategies = useMemo(() => {
        return strategies.filter((s) => {
            if (s.category !== activeTab) return false
            if (searchQuery && !s.name.toLowerCase().includes(searchQuery.toLowerCase()) && !s.summary.toLowerCase().includes(searchQuery.toLowerCase())) return false
            if (complexityFilter && s.complexity !== complexityFilter) return false
            if (freeOnly && s.cost !== 'Free' && s.cost !== '$0' && s.cost?.toLowerCase() !== 'free') return false
            if (noGpu && s.requires_gpu) return false
            return true
        })
    }, [strategies, activeTab, searchQuery, complexityFilter, freeOnly, noGpu])

    const handleView = useCallback((id: string) => {
        setSelectedStrategyId(id)
        setDrawerOpen(true)
    }, [])

    const handleToggleCompare = useCallback((id: string) => {
        setCompareIds((prev) => {
            if (prev.includes(id)) return prev.filter((x) => x !== id)
            if (prev.length >= 3) return prev
            return [...prev, id]
        })
    }, [])

    const compareStrategies = useMemo(() => {
        return strategies.filter((s) => compareIds.includes(s.id))
    }, [strategies, compareIds])

    return (
        <div className="min-h-screen bg-black text-white">
            <Navbar />

            <div className="container mx-auto px-6 py-8 max-w-6xl">
                {/* Header */}
                <div className="mb-8">
                    <Link href="/pipeline" className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-white transition-colors mb-4">
                        <ArrowLeft className="w-3 h-3" /> Back to Builder
                    </Link>
                    <h1 className="text-2xl font-bold text-white mb-2">Strategy Guide</h1>
                    <p className="text-sm text-neutral-400">Explore and compare RAG strategies for chunking, retrieval, and reranking.</p>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-3 mb-6">
                    <div className="relative flex-1 min-w-[200px] max-w-[320px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-500" />
                        <Input
                            placeholder="Search strategies..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 h-9 text-xs bg-white/[0.03] border-white/[0.06] text-neutral-300 placeholder:text-neutral-600"
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <Filter className="w-3.5 h-3.5 text-neutral-500" />
                        {(['Low', 'Medium', 'High'] as const).map((level) => (
                            <button
                                key={level}
                                onClick={() => setComplexityFilter(complexityFilter === level ? null : level)}
                                className={cn(
                                    "px-2.5 py-1 rounded-full text-[10px] font-medium border transition-all",
                                    complexityFilter === level
                                        ? "bg-white/10 border-white/20 text-white"
                                        : "border-white/[0.06] text-neutral-500 hover:text-neutral-300 hover:border-white/10"
                                )}
                            >
                                {level}
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={() => setFreeOnly(!freeOnly)}
                        className={cn(
                            "px-2.5 py-1 rounded-full text-[10px] font-medium border transition-all",
                            freeOnly
                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                : "border-white/[0.06] text-neutral-500 hover:text-neutral-300"
                        )}
                    >
                        Free Only
                    </button>

                    <button
                        onClick={() => setNoGpu(!noGpu)}
                        className={cn(
                            "px-2.5 py-1 rounded-full text-[10px] font-medium border transition-all",
                            noGpu
                                ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
                                : "border-white/[0.06] text-neutral-500 hover:text-neutral-300"
                        )}
                    >
                        No GPU
                    </button>

                    <div className="ml-auto">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setCompareMode(!compareMode); if (compareMode) setCompareIds([]) }}
                            className={cn(
                                "h-8 text-xs gap-1.5",
                                compareMode ? "text-amber-400 bg-amber-500/10" : "text-neutral-400 hover:text-white"
                            )}
                        >
                            <Columns2 className="w-3.5 h-3.5" />
                            {compareMode ? `Compare (${compareIds.length}/3)` : 'Compare'}
                        </Button>
                    </div>
                </div>

                {/* Compare bar */}
                {compareMode && compareIds.length >= 2 && (
                    <div className="mb-6">
                        <CompareTable
                            strategies={compareStrategies}
                            onClose={() => { setCompareMode(false); setCompareIds([]) }}
                        />
                    </div>
                )}

                {/* Tabs */}
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="bg-white/[0.03] border border-white/[0.06] mb-6">
                        <TabsTrigger value="chunking" className="text-xs data-[state=active]:bg-purple-500/15 data-[state=active]:text-purple-400">
                            Chunking
                        </TabsTrigger>
                        <TabsTrigger value="retrieval" className="text-xs data-[state=active]:bg-emerald-500/15 data-[state=active]:text-emerald-400">
                            Retrieval
                        </TabsTrigger>
                        <TabsTrigger value="reranking" className="text-xs data-[state=active]:bg-amber-500/15 data-[state=active]:text-amber-400">
                            Reranking
                        </TabsTrigger>
                    </TabsList>

                    {loading && (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="w-6 h-6 text-neutral-500 animate-spin" />
                        </div>
                    )}

                    {error && (
                        <div className="text-center py-20">
                            <XCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
                            <p className="text-sm text-neutral-400">{error}</p>
                        </div>
                    )}

                    {!loading && !error && (
                        <>
                            {(['chunking', 'retrieval', 'reranking'] as const).map((cat) => (
                                <TabsContent key={cat} value={cat}>
                                    {filteredStrategies.length === 0 ? (
                                        <div className="text-center py-16">
                                            <p className="text-sm text-neutral-500">No strategies match your filters.</p>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                            {filteredStrategies.map((s) => (
                                                <StrategyCard
                                                    key={s.id}
                                                    strategy={s}
                                                    onView={() => handleView(s.id)}
                                                    compareMode={compareMode}
                                                    isSelected={compareIds.includes(s.id)}
                                                    onToggleCompare={() => handleToggleCompare(s.id)}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </TabsContent>
                            ))}
                        </>
                    )}
                </Tabs>
            </div>

            {/* Strategy detail drawer */}
            <StrategyInfoDrawer
                open={drawerOpen}
                onOpenChange={setDrawerOpen}
                strategyId={selectedStrategyId}
                onSelectStrategy={(id) => setSelectedStrategyId(id)}
            />
        </div>
    )
}

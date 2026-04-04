"use client"

import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { usePipelineStore } from '@/stores/usePipelineStore'
import { apiClient } from '@/lib/api'
import { buildPipelineConfig } from '@/lib/pipeline-nodes'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
    ChevronUp,
    ChevronDown,
    Play,
    Loader2,
    Clock,
    DollarSign,
    FileText,
    AlertTriangle,
    Sparkles,
    History,
    X,
} from 'lucide-react'
import { ErrorDiagnostic, diagnoseError } from './ErrorDiagnostic'

interface SourceChunk {
    text: string
    score: number
    metadata?: Record<string, any>
}

interface LatencyBreakdown {
    retrieval_ms?: number
    reranking_ms?: number
    generation_ms?: number
    total_ms?: number
}

interface TestResult {
    answer: string
    chunks: SourceChunk[]
    latency: LatencyBreakdown
    cost: number
    confidence?: number
    error?: string
}

interface TestHistoryEntry {
    query: string
    result: TestResult | null
    error?: string
    timestamp: number
}

export function QuickTestSidebar() {
    const [isOpen, setIsOpen] = useState(false)
    const [query, setQuery] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [result, setResult] = useState<TestResult | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [history, setHistory] = useState<TestHistoryEntry[]>([])
    const [expandedChunks, setExpandedChunks] = useState<Set<number>>(new Set())
    const [showHistory, setShowHistory] = useState(false)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    const nodes = usePipelineStore((s) => s.nodes)
    const edges = usePipelineStore((s) => s.edges)

    const runTest = useCallback(async () => {
        if (!query.trim() || nodes.length === 0) return

        setIsLoading(true)
        setError(null)
        setResult(null)
        setExpandedChunks(new Set())

        try {
            const config = buildPipelineConfig(nodes, edges)
            const response = await apiClient.post('/api/v1/query/', {
                query: query.trim(),
                pipeline_config: config,
            })

            const data = response.data
            const testResult: TestResult = {
                answer: data.answer || data.response || '',
                chunks: (data.chunks || data.source_chunks || data.sources || []).map((c: any) => ({
                    text: c.text || c.content || '',
                    score: c.score || c.relevance_score || 0,
                    metadata: c.metadata,
                })),
                latency: {
                    retrieval_ms: data.latency?.retrieval_ms || data.retrieval_latency_ms,
                    reranking_ms: data.latency?.reranking_ms || data.reranking_latency_ms,
                    generation_ms: data.latency?.generation_ms || data.generation_latency_ms,
                    total_ms: data.latency?.total_ms || data.total_latency_ms,
                },
                cost: data.cost || data.query_cost || 0,
                confidence: data.confidence,
            }

            setResult(testResult)
            setHistory((prev) => [
                { query: query.trim(), result: testResult, timestamp: Date.now() },
                ...prev,
            ].slice(0, 5))
        } catch (err: any) {
            const errorMsg = err?.response?.data?.detail || err?.message || 'Query failed'
            setError(errorMsg)
            setHistory((prev) => [
                { query: query.trim(), result: null, error: errorMsg, timestamp: Date.now() },
                ...prev,
            ].slice(0, 5))
        } finally {
            setIsLoading(false)
        }
    }, [query, nodes, edges])

    // Cmd+Enter shortcut
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && isOpen) {
                e.preventDefault()
                runTest()
            }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [isOpen, runTest])

    const toggleChunk = (index: number) => {
        setExpandedChunks((prev) => {
            const next = new Set(prev)
            if (next.has(index)) next.delete(index)
            else next.add(index)
            return next
        })
    }

    const loadFromHistory = (entry: TestHistoryEntry) => {
        setQuery(entry.query)
        setResult(entry.result)
        setError(entry.error || null)
        setShowHistory(false)
    }

    const scoreColor = (score: number) => {
        if (score >= 0.8) return 'text-emerald-400'
        if (score >= 0.5) return 'text-amber-400'
        return 'text-red-400'
    }

    const scoreBg = (score: number) => {
        if (score >= 0.8) return 'bg-emerald-500'
        if (score >= 0.5) return 'bg-amber-500'
        return 'bg-red-500'
    }

    return (
        <div className={cn(
            "border-t border-gray-200 bg-white transition-all duration-300 shrink-0",
            isOpen ? "max-h-[50vh]" : "max-h-0"
        )}>
            {isOpen && (
                <div className="flex flex-col h-full max-h-[50vh]">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200">
                        <div className="flex items-center gap-2">
                            <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                            <span className="text-[11px] font-semibold text-gray-900">Quick Test</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-[10px] text-gray-500 hover:text-gray-900"
                                onClick={() => setShowHistory(!showHistory)}
                                disabled={history.length === 0}
                            >
                                <History className="w-3 h-3 mr-1" />
                                History ({history.length})
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-gray-400 hover:text-gray-900"
                                onClick={() => setIsOpen(false)}
                            >
                                <X className="w-3.5 h-3.5" />
                            </Button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-hidden flex">
                        {/* Input area */}
                        <div className="w-80 border-r border-gray-200 flex flex-col shrink-0">
                            <div className="p-3 flex-1 flex flex-col">
                                <textarea
                                    ref={textareaRef}
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Enter a test query..."
                                    className="flex-1 min-h-[60px] text-[11px] px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-700 resize-none focus:outline-none focus:ring-1 focus:ring-purple-300 placeholder:text-gray-400"
                                />
                                <div className="flex items-center justify-between mt-2">
                                    <span className="text-[9px] text-gray-400">
                                        {navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'}+Enter to test
                                    </span>
                                    <Button
                                        size="sm"
                                        className="h-7 px-3 text-[10px] bg-purple-600 hover:bg-purple-700 text-white font-semibold"
                                        onClick={runTest}
                                        disabled={isLoading || !query.trim() || nodes.length === 0}
                                    >
                                        {isLoading ? (
                                            <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                                        ) : (
                                            <Play className="w-3 h-3 mr-1.5" />
                                        )}
                                        Test
                                    </Button>
                                </div>
                            </div>

                            {/* History dropdown */}
                            {showHistory && history.length > 0 && (
                                <div className="border-t border-gray-200 max-h-40 overflow-auto">
                                    {history.map((entry, i) => (
                                        <button
                                            key={i}
                                            onClick={() => loadFromHistory(entry)}
                                            className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-0"
                                        >
                                            <p className="text-[10px] text-gray-700 truncate">{entry.query}</p>
                                            <p className="text-[9px] text-gray-400">
                                                {new Date(entry.timestamp).toLocaleTimeString()}
                                                {entry.error ? ' - Failed' : ' - OK'}
                                            </p>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Results area */}
                        <ScrollArea className="flex-1">
                            <div className="p-3">
                                {isLoading && (
                                    <div className="space-y-3">
                                        <Skeleton className="h-4 w-3/4 bg-gray-100" />
                                        <Skeleton className="h-20 w-full bg-gray-100" />
                                        <div className="flex gap-3">
                                            <Skeleton className="h-8 w-24 bg-gray-100" />
                                            <Skeleton className="h-8 w-24 bg-gray-100" />
                                            <Skeleton className="h-8 w-24 bg-gray-100" />
                                        </div>
                                    </div>
                                )}

                                {error && !isLoading && (
                                    <ErrorDiagnostic diagnostic={diagnoseError(error, result)} />
                                )}

                                {result && !isLoading && (
                                    <div className="space-y-3">
                                        {/* Answer */}
                                        <div>
                                            <div className="flex items-center gap-1.5 mb-1">
                                                <span className="text-[10px] font-bold text-gray-500 uppercase">Answer</span>
                                                {result.confidence !== undefined && (
                                                    <span className={cn(
                                                        "text-[9px] font-mono px-1.5 py-0.5 rounded",
                                                        result.confidence >= 0.7
                                                            ? "bg-emerald-50 text-emerald-600"
                                                            : result.confidence >= 0.4
                                                                ? "bg-amber-50 text-amber-600"
                                                                : "bg-red-50 text-red-500"
                                                    )}>
                                                        {(result.confidence * 100).toFixed(0)}% confident
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-[11px] text-gray-700 leading-relaxed whitespace-pre-wrap">
                                                {result.answer || 'No answer generated'}
                                            </p>
                                        </div>

                                        {/* Latency & Cost */}
                                        <div className="flex flex-wrap gap-2">
                                            {result.latency.retrieval_ms !== undefined && (
                                                <div className="flex items-center gap-1 px-2 py-1 rounded bg-gray-50 border border-gray-200">
                                                    <Clock className="w-2.5 h-2.5 text-blue-500" />
                                                    <span className="text-[9px] text-gray-500">Retrieval:</span>
                                                    <span className="text-[9px] text-blue-600 font-mono">{result.latency.retrieval_ms}ms</span>
                                                </div>
                                            )}
                                            {result.latency.reranking_ms !== undefined && (
                                                <div className="flex items-center gap-1 px-2 py-1 rounded bg-gray-50 border border-gray-200">
                                                    <Clock className="w-2.5 h-2.5 text-purple-500" />
                                                    <span className="text-[9px] text-gray-500">Reranking:</span>
                                                    <span className="text-[9px] text-purple-600 font-mono">{result.latency.reranking_ms}ms</span>
                                                </div>
                                            )}
                                            {result.latency.generation_ms !== undefined && (
                                                <div className="flex items-center gap-1 px-2 py-1 rounded bg-gray-50 border border-gray-200">
                                                    <Clock className="w-2.5 h-2.5 text-orange-500" />
                                                    <span className="text-[9px] text-gray-500">Generation:</span>
                                                    <span className="text-[9px] text-orange-600 font-mono">{result.latency.generation_ms}ms</span>
                                                </div>
                                            )}
                                            {result.cost > 0 && (
                                                <div className="flex items-center gap-1 px-2 py-1 rounded bg-gray-50 border border-gray-200">
                                                    <DollarSign className="w-2.5 h-2.5 text-emerald-500" />
                                                    <span className="text-[9px] text-emerald-600 font-mono">${result.cost.toFixed(4)}</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Source Chunks */}
                                        {result.chunks.length > 0 && (
                                            <div>
                                                <span className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">
                                                    Source Chunks ({result.chunks.length})
                                                </span>
                                                <div className="space-y-1">
                                                    {result.chunks.map((chunk, i) => (
                                                        <div
                                                            key={i}
                                                            className="rounded border border-gray-200 bg-gray-50 overflow-hidden"
                                                        >
                                                            <button
                                                                onClick={() => toggleChunk(i)}
                                                                className="w-full flex items-center justify-between px-2.5 py-1.5 hover:bg-gray-100"
                                                            >
                                                                <div className="flex items-center gap-2">
                                                                    <FileText className="w-3 h-3 text-gray-400" />
                                                                    <span className="text-[10px] text-gray-600">Chunk {i + 1}</span>
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    <div className="flex items-center gap-1">
                                                                        <div className="w-12 h-1 bg-gray-200 rounded-full overflow-hidden">
                                                                            <div
                                                                                className={cn("h-full rounded-full", scoreBg(chunk.score))}
                                                                                style={{ width: `${chunk.score * 100}%` }}
                                                                            />
                                                                        </div>
                                                                        <span className={cn("text-[9px] font-mono", scoreColor(chunk.score))}>
                                                                            {(chunk.score * 100).toFixed(0)}%
                                                                        </span>
                                                                    </div>
                                                                    {expandedChunks.has(i) ? (
                                                                        <ChevronUp className="w-3 h-3 text-gray-400" />
                                                                    ) : (
                                                                        <ChevronDown className="w-3 h-3 text-gray-400" />
                                                                    )}
                                                                </div>
                                                            </button>
                                                            {expandedChunks.has(i) && (
                                                                <div className="px-2.5 pb-2 border-t border-gray-200">
                                                                    <p className="text-[10px] text-gray-600 leading-relaxed mt-1.5 whitespace-pre-wrap">
                                                                        {chunk.text}
                                                                    </p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Diagnostics for poor results */}
                                        {result.chunks.length === 0 && (
                                            <ErrorDiagnostic diagnostic={diagnoseError('0 chunks retrieved', result)} />
                                        )}
                                        {result.chunks.length > 0 && result.chunks.every(c => c.score < 0.3) && (
                                            <ErrorDiagnostic diagnostic={diagnoseError('low_relevance', result)} />
                                        )}
                                    </div>
                                )}

                                {!isLoading && !result && !error && (
                                    <div className="flex flex-col items-center justify-center py-8 text-center">
                                        <Sparkles className="w-6 h-6 text-gray-300 mb-2" />
                                        <p className="text-[11px] text-gray-500">Enter a query and click Test</p>
                                        <p className="text-[9px] text-gray-400 mt-1">Results will appear here</p>
                                    </div>
                                )}
                            </div>
                        </ScrollArea>
                    </div>
                </div>
            )}
        </div>
    )
}

export function QuickTestToggle({ onToggle }: { onToggle: () => void }) {
    return (
        <Button
            variant="outline"
            size="sm"
            className="h-7 px-3 text-[10px] border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-50"
            onClick={onToggle}
        >
            <Sparkles className="w-3 h-3 mr-1" />
            Test Query
        </Button>
    )
}

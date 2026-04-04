"use client"

import { useState, useEffect, useMemo, useRef } from 'react'
import { apiClient, projectsApi } from '@/lib/api'
import { usePipelineStore } from '@/stores/usePipelineStore'
import {
    X, Search, Loader2, ChevronDown, ChevronRight,
    Zap, Database, Layers, Activity, Shield, MessageSquare,
    RotateCcw, Eraser, ShieldCheck, GitCompare, Info,
} from 'lucide-react'

interface TesterPanelProps {
    projectId: string
    open: boolean
    onClose: () => void
}

// --- Collapsible section wrapper ---
function Section({
    title,
    icon,
    badge,
    defaultOpen = false,
    children,
}: {
    title: string
    icon: React.ReactNode
    badge?: React.ReactNode
    defaultOpen?: boolean
    children: React.ReactNode
}) {
    const [open, setOpen] = useState(defaultOpen)
    return (
        <div className="border-b border-gray-100">
            <button
                onClick={() => setOpen(!open)}
                className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
                <div className="flex items-center gap-2">
                    {icon}
                    <span className="text-[11px] font-semibold text-gray-700">{title}</span>
                    {badge}
                </div>
                {open ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
            </button>
            {open && <div className="px-4 pb-3">{children}</div>}
        </div>
    )
}

export function TesterPanel({ projectId, open, onClose }: TesterPanelProps) {
    const nodes = usePipelineStore((s) => s.nodes)
    const inputRef = useRef<HTMLInputElement>(null)

    const [query, setQuery] = useState('')
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState<any>(null)
    const [sampleQueries, setSampleQueries] = useState<any[]>([])
    const [expandedChunk, setExpandedChunk] = useState<number | null>(null)

    // Validation state
    const [validating, setValidating] = useState(false)
    const [validationResult, setValidationResult] = useState<any>(null)

    // Extract pipeline config from nodes
    const pipelineConfig = useMemo(() => {
        const cfg: any = { retriever: {}, reranker: {}, llm: {}, augmentation: {} }
        for (const node of nodes) {
            const type = (node.type || '').toLowerCase()
            const data = node.data || {}
            if (type === 'retriever') {
                cfg.retriever = { ...data }
            } else if (type === 'reranker') {
                cfg.reranker = { ...data }
            } else if (type === 'llm_generation') {
                cfg.llm = { ...data }
            } else if (type === 'embedding') {
                cfg.embedding = { ...data }
            }
            if (data.augmentation || data.augmentation_method) {
                cfg.augmentation = { method: data.augmentation || data.augmentation_method, ...data }
            }
            if (data.techniques) {
                for (const t of data.techniques) {
                    if (t.enabled && ['hyde', 'multi_query', 'expansion'].includes(t.name)) {
                        cfg.augmentation = { method: t.name }
                    }
                }
            }
        }
        return cfg
    }, [nodes])

    // Pipeline summary for badge
    const pipelineSummary = useMemo(() => {
        const parts: string[] = []
        const r = pipelineConfig.retriever
        if (r.strategy || r.method) parts.push(r.strategy || r.method)
        if (pipelineConfig.augmentation?.method) parts.push(`+ ${pipelineConfig.augmentation.method}`)
        if (pipelineConfig.reranker?.provider) parts.push(`→ ${pipelineConfig.reranker.provider}`)
        if (pipelineConfig.llm?.model) parts.push(`→ ${pipelineConfig.llm.model}`)
        return parts.length > 0 ? parts.join(' ') : 'Default pipeline'
    }, [pipelineConfig])

    useEffect(() => {
        if (!projectId || !open) return
        projectsApi.getSampleQueries(projectId).then((data: any) => {
            setSampleQueries(data.queries || [])
        }).catch(() => {})
    }, [projectId, open])

    const runTest = async (q?: string) => {
        const queryText = q || query
        if (!queryText.trim()) return
        if (q) setQuery(q)
        setLoading(true)
        setResult(null)
        try {
            const res = await apiClient.post('/api/v1/query/pipeline-test', {
                query: queryText,
                project_id: projectId,
                pipeline_config: pipelineConfig,
            }).then(r => r.data)
            setResult(res)
        } catch (e: any) {
            setResult({ error: e?.response?.data?.detail || e?.message || 'Test failed' })
        } finally {
            setLoading(false)
        }
    }

    const runValidation = async () => {
        setValidating(true)
        setValidationResult(null)
        try {
            const res = await projectsApi.validateRag(projectId)
            setValidationResult(res)
        } catch (e: any) {
            setValidationResult({ error: e?.response?.data?.detail || e?.message || 'Validation failed' })
        } finally {
            setValidating(false)
        }
    }

    const handleTryDifferent = () => {
        setQuery('')
        setResult(null)
        setTimeout(() => inputRef.current?.focus(), 50)
    }

    const m = result?.metrics || {}
    const judge = result?.judge
    const steps = result?.steps || []
    const chunks = result?.chunks || []
    const totalMs = m.total_ms || 0

    // Score distribution insight
    const scoreInsight = useMemo(() => {
        if (chunks.length < 2) return null
        const scores = chunks.map((c: any) => c.score).filter((s: number) => s > 0)
        if (scores.length < 2) return null
        const top = scores[0]
        const second = scores[1]
        const gap = top - second
        const spread = top - scores[scores.length - 1]
        if (gap > 0.15) return { text: 'Top result has clear separation from rest', type: 'good' as const }
        if (spread < 0.05) return { text: 'Scores clustered tightly -- consider MMR for diversity', type: 'warn' as const }
        if (top < 0.5) return { text: 'Low top score -- query may not match indexed content well', type: 'bad' as const }
        return { text: `Score range: ${scores[scores.length - 1].toFixed(3)} - ${top.toFixed(3)}`, type: 'neutral' as const }
    }, [chunks])

    // Comparison: what technique and why it's better
    const comparison = useMemo(() => {
        const strategy = pipelineConfig.retriever?.strategy || pipelineConfig.retriever?.method || 'dense'
        const aug = pipelineConfig.augmentation?.method
        const reranker = pipelineConfig.reranker?.provider

        const techniques: string[] = []
        const benefits: string[] = []

        if (strategy === 'hybrid') {
            techniques.push('Hybrid search (vector + keyword)')
            benefits.push('Captures both semantic meaning and exact terms that pure vector search misses')
        } else if (strategy === 'dense') {
            techniques.push('Dense vector search')
            benefits.push('Semantic similarity matching -- finds conceptually related content')
        } else if (strategy === 'multi-query') {
            techniques.push('Multi-query retrieval')
            benefits.push('Generates multiple query variations to improve recall')
        } else if (strategy === 'hyde') {
            techniques.push('HyDE (Hypothetical Document Embeddings)')
            benefits.push('Generates a hypothetical answer first, then searches -- better for abstract queries')
        } else {
            techniques.push(strategy)
        }

        if (aug && aug !== strategy) {
            techniques.push(`${aug} augmentation`)
            benefits.push('Query augmentation expands search coverage beyond the original phrasing')
        }

        if (reranker) {
            techniques.push(`${reranker} reranking`)
            benefits.push('Cross-encoder reranking rescores results with deeper semantic analysis')
        }

        const simpleRAGDiff = techniques.length > 1 || strategy !== 'dense'
            ? 'Your pipeline adds multiple retrieval improvements over simple "embed + cosine search" RAG'
            : 'Currently using basic dense retrieval -- add reranking or hybrid search for better results'

        return { techniques, benefits, simpleRAGDiff, isAdvanced: techniques.length > 1 || strategy !== 'dense' }
    }, [pipelineConfig])

    if (!open) return null

    return (
        <>
            <div className="fixed inset-0 z-40 bg-black/10" onClick={onClose} />
            <div className="fixed inset-y-0 right-0 z-50 w-[500px] bg-white border-l border-gray-200 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
                {/* ===== Header ===== */}
                <div className="h-12 border-b border-gray-200 flex items-center justify-between px-4 shrink-0">
                    <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-indigo-600" />
                        <h2 className="text-sm font-bold text-gray-900">Pipeline Tester</h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                        <X className="w-4 h-4 text-gray-400" />
                    </button>
                </div>

                {/* ===== Pipeline config badge ===== */}
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                    <div className="text-[9px] text-gray-400 mb-0.5 uppercase font-semibold tracking-wide">Active Pipeline</div>
                    <div className="text-[11px] text-gray-700 font-mono">{pipelineSummary}</div>
                </div>

                {/* ===== Scrollable content ===== */}
                <div className="flex-1 overflow-y-auto">

                    {/* ===== Section 1: Query Input ===== */}
                    <div className="p-4 border-b border-gray-100">
                        {sampleQueries.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-3">
                                {sampleQueries.slice(0, 6).map((sq, i) => (
                                    <button
                                        key={i}
                                        onClick={() => runTest(sq.query)}
                                        className="px-2 py-0.5 text-[9px] bg-gray-50 hover:bg-indigo-50 hover:text-indigo-700 text-gray-500 rounded-full border border-gray-200 hover:border-indigo-200 truncate max-w-[200px] transition-colors"
                                    >
                                        {sq.query.length > 35 ? sq.query.slice(0, 35) + '...' : sq.query}
                                    </button>
                                ))}
                            </div>
                        )}
                        <div className="flex gap-2">
                            <input
                                ref={inputRef}
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && runTest()}
                                placeholder="Ask a question..."
                                className="flex-1 px-3 py-2.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 bg-white"
                            />
                            <button
                                onClick={() => runTest()}
                                disabled={loading || !query.trim()}
                                className="px-4 py-2.5 bg-gray-900 text-white rounded-lg text-xs font-semibold disabled:opacity-40 hover:bg-gray-800 flex items-center gap-1.5 transition-colors"
                            >
                                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                                Run
                            </button>
                        </div>
                    </div>

                    {/* ===== Loading ===== */}
                    {loading && (
                        <div className="p-8 flex flex-col items-center gap-2 text-gray-400">
                            <Loader2 className="w-6 h-6 animate-spin" />
                            <span className="text-xs">Running through pipeline...</span>
                        </div>
                    )}

                    {/* ===== Error ===== */}
                    {result?.error && (
                        <div className="m-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                            {result.error}
                        </div>
                    )}

                    {/* ===== Section 2: Answer + Judge ===== */}
                    {result?.answer && (
                        <div className="px-4 py-3 border-b border-gray-100">
                            <div className="flex items-center gap-2 mb-2">
                                <MessageSquare className="w-3.5 h-3.5 text-indigo-500" />
                                <span className="text-[11px] font-semibold text-gray-700">Generated Answer</span>
                                {judge && (
                                    <span className={`ml-auto text-xs font-black px-2 py-0.5 rounded ${gradeColor(judge.overall_grade)}`}>
                                        {judge.overall_grade}
                                    </span>
                                )}
                            </div>
                            <p className="text-[12px] text-gray-800 leading-relaxed bg-gray-50 rounded-lg p-3 border border-gray-100">
                                {result.answer}
                            </p>

                            {/* Judge scores inline */}
                            {judge && (judge.relevance !== undefined || judge.faithfulness !== undefined || judge.completeness !== undefined) && (
                                <div className="mt-3">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Shield className="w-3.5 h-3.5 text-amber-500" />
                                        <span className="text-[11px] font-semibold text-gray-700">LLM Judge</span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-1.5 mb-2">
                                        {judge.relevance !== undefined && <ScoreBar label="Relevance" value={judge.relevance} max={5} />}
                                        {judge.faithfulness !== undefined && <ScoreBar label="Faithfulness" value={judge.faithfulness} max={5} />}
                                        {judge.completeness !== undefined && <ScoreBar label="Completeness" value={judge.completeness} max={5} />}
                                    </div>
                                    {judge.verdict && (
                                        <p className="text-[10px] text-gray-500 italic leading-relaxed">{judge.verdict}</p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ===== Section 3: Pipeline Trace ===== */}
                    {(steps.length > 0 || m.total_ms) && (
                        <Section
                            title="Pipeline Trace"
                            icon={<Zap className="w-3.5 h-3.5 text-amber-500" />}
                            badge={totalMs > 0 ? <span className="text-[9px] font-mono text-gray-400 ml-1">{totalMs}ms</span> : undefined}
                            defaultOpen={true}
                        >
                            <div className="space-y-1">
                                {/* Embedding step */}
                                {m.embedding_ms !== undefined && (
                                    <TraceRow name="Embedding" method={m.embedding_dims ? `${m.embedding_dims}d` : 'embed'} ms={m.embedding_ms} totalMs={totalMs} />
                                )}
                                {/* Pipeline steps */}
                                {steps.map((s: any, i: number) => (
                                    <TraceRow
                                        key={i}
                                        name={s.name}
                                        method={s.method}
                                        ms={s.latency_ms}
                                        count={s.output_count}
                                        totalMs={totalMs}
                                    />
                                ))}
                                {/* Judge step */}
                                {m.judge_ms !== undefined && (
                                    <TraceRow name="Judge" method="LLM" ms={m.judge_ms} totalMs={totalMs} />
                                )}
                            </div>

                            {/* Index info */}
                            {m.index_chunks && (
                                <div className="mt-2 flex items-center gap-3 text-[9px] text-gray-400">
                                    <Database className="w-3 h-3" />
                                    <span>{m.index_chunks.toLocaleString()} chunks indexed</span>
                                    {m.retrieval_method && <span>Method: {m.retrieval_method}</span>}
                                    {m.augmentation && <span>Aug: {m.augmentation}</span>}
                                </div>
                            )}
                        </Section>
                    )}

                    {/* ===== Section 4: Retrieved Chunks ===== */}
                    {chunks.length > 0 && (
                        <Section
                            title={`${chunks.length} Chunks Retrieved`}
                            icon={<Layers className="w-3.5 h-3.5 text-blue-500" />}
                            defaultOpen={false}
                        >
                            {/* Score insight */}
                            {scoreInsight && (
                                <div className={`mb-2 px-2.5 py-1.5 rounded-md text-[9px] flex items-center gap-1.5 ${
                                    scoreInsight.type === 'good' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                                    scoreInsight.type === 'warn' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                                    scoreInsight.type === 'bad' ? 'bg-red-50 text-red-700 border border-red-100' :
                                    'bg-gray-50 text-gray-500 border border-gray-100'
                                }`}>
                                    <Info className="w-3 h-3 shrink-0" />
                                    {scoreInsight.text}
                                </div>
                            )}

                            <div className="space-y-1.5">
                                {chunks.map((c: any, i: number) => (
                                    <div
                                        key={i}
                                        className="rounded-lg border border-gray-100 hover:border-gray-200 cursor-pointer transition-colors"
                                        onClick={() => setExpandedChunk(expandedChunk === i ? null : i)}
                                    >
                                        <div className="flex items-start gap-2 px-3 py-2">
                                            <span className="text-[9px] font-mono text-gray-300 mt-0.5">#{i + 1}</span>
                                            <p className={`flex-1 text-[11px] text-gray-700 leading-relaxed ${expandedChunk === i ? '' : 'line-clamp-2'}`}>
                                                {c.text}
                                            </p>
                                            <ScoreBadge score={c.score} />
                                        </div>
                                        {expandedChunk === i && (
                                            <div className="px-3 pb-2 flex gap-3 text-[9px] text-gray-400 border-t border-gray-50 pt-1.5">
                                                {c.chunk_index !== undefined && <span>idx: {c.chunk_index}</span>}
                                                {c.token_count !== undefined && <span>{c.token_count} tokens</span>}
                                                {c.method && <span>method: {c.method}</span>}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </Section>
                    )}

                    {/* ===== Section 5: Comparison ===== */}
                    {result?.answer && (
                        <Section
                            title="vs Simple RAG"
                            icon={<GitCompare className="w-3.5 h-3.5 text-purple-500" />}
                            defaultOpen={false}
                        >
                            <div className="space-y-2.5">
                                <p className="text-[11px] text-gray-600 leading-relaxed">
                                    {comparison.simpleRAGDiff}
                                </p>

                                {comparison.techniques.length > 0 && (
                                    <div className="space-y-1">
                                        <div className="text-[9px] uppercase font-semibold text-gray-400 tracking-wide">Techniques Used</div>
                                        {comparison.techniques.map((t, i) => (
                                            <div key={i} className="flex items-center gap-2 text-[10px]">
                                                <div className="w-1 h-1 rounded-full bg-purple-400 shrink-0" />
                                                <span className="text-gray-700 font-medium">{t}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {comparison.benefits.length > 0 && (
                                    <div className="space-y-1">
                                        <div className="text-[9px] uppercase font-semibold text-gray-400 tracking-wide">Why It Helps</div>
                                        {comparison.benefits.map((b, i) => (
                                            <p key={i} className="text-[10px] text-gray-500 leading-relaxed pl-3 border-l-2 border-purple-100">
                                                {b}
                                            </p>
                                        ))}
                                    </div>
                                )}

                                {comparison.isAdvanced && (
                                    <div className="px-2.5 py-1.5 rounded-md bg-purple-50 border border-purple-100 text-[10px] text-purple-700">
                                        Estimated improvement over naive RAG: higher recall and precision from multi-stage pipeline
                                    </div>
                                )}
                            </div>
                        </Section>
                    )}

                    {/* ===== Section 6: Auto-Validation ===== */}
                    {(validationResult || validating) && (
                        <Section
                            title="Auto-Validation"
                            icon={<ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />}
                            badge={validationResult?.health ? (
                                <HealthBadge health={validationResult.health} />
                            ) : undefined}
                            defaultOpen={true}
                        >
                            {validating && (
                                <div className="flex items-center gap-2 text-gray-400 py-2">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span className="text-[11px]">Running 5 auto-generated queries...</span>
                                </div>
                            )}
                            {validationResult?.error && (
                                <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-[11px] text-red-700">
                                    {validationResult.error}
                                </div>
                            )}
                            {validationResult && !validationResult.error && !validating && (
                                <div className="space-y-2">
                                    <div className="grid grid-cols-3 gap-2">
                                        <MetricCard
                                            label="Accuracy"
                                            value={validationResult.retrieval_accuracy != null ? `${validationResult.retrieval_accuracy}%` : '--'}
                                            pct={validationResult.retrieval_accuracy ?? 0}
                                        />
                                        <MetricCard
                                            label="Relevance"
                                            value={validationResult.avg_relevance_score != null ? validationResult.avg_relevance_score.toFixed(3) : '--'}
                                            pct={(validationResult.avg_relevance_score ?? 0) * 100}
                                        />
                                        <MetricCard
                                            label="Found/Tested"
                                            value={`${validationResult.source_chunks_found ?? '--'}/${validationResult.tests_run ?? '--'}`}
                                            pct={validationResult.tests_run ? (validationResult.source_chunks_found / validationResult.tests_run) * 100 : 0}
                                        />
                                    </div>
                                    {validationResult.details && Array.isArray(validationResult.details) && (
                                        <div className="space-y-1 mt-1">
                                            {validationResult.details.map((d: any, i: number) => (
                                                <div key={i} className="flex items-center gap-2 text-[10px] px-2 py-1 rounded bg-gray-50">
                                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${d.source_chunk_found ? 'bg-emerald-400' : 'bg-red-400'}`} />
                                                    <span className="text-gray-600 flex-1 truncate">{d.query}</span>
                                                    {d.top_score != null && <ScoreBadge score={d.top_score} />}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </Section>
                    )}
                </div>

                {/* ===== Section 6 (bottom): Quick Actions ===== */}
                <div className="shrink-0 border-t border-gray-200 bg-gray-50 px-4 py-3">
                    <div className="flex items-center gap-2">
                        {result && (
                            <>
                                <button
                                    onClick={() => runTest()}
                                    disabled={loading || !query.trim()}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-40 transition-colors"
                                >
                                    <RotateCcw className="w-3 h-3" />
                                    Run Again
                                </button>
                                <button
                                    onClick={handleTryDifferent}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
                                >
                                    <Eraser className="w-3 h-3" />
                                    Try Different Query
                                </button>
                            </>
                        )}
                        <button
                            onClick={runValidation}
                            disabled={validating}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold text-white bg-gray-900 rounded-lg hover:bg-gray-800 disabled:opacity-40 ml-auto transition-colors"
                        >
                            {validating ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
                            Auto Validate
                        </button>
                    </div>
                </div>
            </div>
        </>
    )
}

// ==================== Helper Components ====================

function gradeColor(g: string) {
    return g === 'A' ? 'bg-emerald-100 text-emerald-700' :
           g === 'B' ? 'bg-blue-100 text-blue-700' :
           g === 'C' ? 'bg-amber-100 text-amber-700' :
           'bg-red-100 text-red-700'
}

function scoreBarColor(pct: number) {
    if (pct >= 80) return 'bg-emerald-500'
    if (pct >= 50) return 'bg-amber-500'
    return 'bg-red-500'
}

function scoreTextColor(pct: number) {
    if (pct >= 80) return 'text-emerald-700'
    if (pct >= 50) return 'text-amber-700'
    return 'text-red-700'
}

/** Score card with colored progress bar */
function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) {
    const pct = (value / max) * 100
    return (
        <div className="p-2 bg-gray-50 rounded-lg border border-gray-100">
            <div className="flex items-center justify-between mb-1">
                <span className="text-[8px] text-gray-400 uppercase font-semibold">{label}</span>
                <span className={`text-[11px] font-bold ${scoreTextColor(pct)}`}>{value}/{max}</span>
            </div>
            <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all duration-500 ${scoreBarColor(pct)}`}
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    )
}

/** Trace row with visual latency bar */
function TraceRow({ name, method, ms, count, totalMs }: { name: string; method: string; ms?: number; count?: number; totalMs: number }) {
    const pct = ms && totalMs > 0 ? Math.max(4, (ms / totalMs) * 100) : 0
    return (
        <div className="flex items-center gap-2 py-1 px-2 rounded bg-gray-50 text-[10px]">
            <span className="font-semibold text-gray-700 w-20 shrink-0">{name}</span>
            <span className="text-gray-500 font-mono truncate flex-1">{method}</span>
            {count !== undefined && <span className="text-gray-400 shrink-0">{count}</span>}
            {ms !== undefined && (
                <div className="flex items-center gap-1.5 shrink-0">
                    <div className="w-16 h-1 bg-gray-200 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-amber-400 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                        />
                    </div>
                    <span className="text-gray-400 font-mono w-14 text-right">{ms}ms</span>
                </div>
            )}
        </div>
    )
}

function ScoreBadge({ score }: { score: number }) {
    const pct = Math.round(score * 100)
    const color = pct >= 80 ? 'bg-emerald-100 text-emerald-700' :
                  pct >= 50 ? 'bg-amber-100 text-amber-700' :
                  'bg-red-100 text-red-700'
    return (
        <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${color} shrink-0`}>
            {score.toFixed(3)}
        </span>
    )
}

function HealthBadge({ health }: { health: string }) {
    const color = health === 'excellent' || health === 'good' ? 'bg-emerald-100 text-emerald-700' :
                  health === 'fair' ? 'bg-amber-100 text-amber-700' :
                  'bg-red-100 text-red-700'
    return (
        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${color} ml-1`}>
            {health}
        </span>
    )
}

function MetricCard({ label, value, pct }: { label: string; value: string; pct: number }) {
    return (
        <div className="p-2 bg-white rounded-lg border border-gray-100 text-center">
            <div className={`text-sm font-bold ${scoreTextColor(pct)}`}>{value}</div>
            <div className="text-[8px] text-gray-400 uppercase font-semibold mt-0.5">{label}</div>
            <div className="h-0.5 bg-gray-100 rounded-full mt-1.5 overflow-hidden">
                <div
                    className={`h-full rounded-full ${scoreBarColor(pct)}`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                />
            </div>
        </div>
    )
}

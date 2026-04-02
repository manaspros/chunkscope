"use client"

import React from "react"
import {
    Activity,
    FileText,
    Zap,
    Shield,
    ArrowRight,
    BarChart3,
    Info,
    Layout,
    X,
} from "lucide-react"
import { Button } from "@/components/ui/button"

interface AnalysisResult {
    document_id: string
    document_type: string
    structure: {
        has_headings: boolean
        has_tables: boolean
        has_code_blocks: boolean
        hierarchy_depth: number
        avg_paragraph_length: number
    }
    density: {
        avg_sentence_length: number
        vocabulary_richness: number
        technical_term_density: number
    }
    recommended_config: {
        chunking_method: string
        chunk_size: number
        overlap: number
        embedding_model: string
    }
    confidence_score: number
    reasoning: string
}

interface AnalysisResultOverlayProps {
    result: AnalysisResult | null
    onClose: () => void
    onConfirm: (config: any) => void
}

function displayValue(val: number | undefined | null, suffix: string): string {
    if (val === undefined || val === null || val === 0) return "N/A"
    return `${val} ${suffix}`
}

function displayPercent(val: number | undefined | null): string {
    if (val === undefined || val === null || val === 0) return "N/A"
    return `${Math.round(val * 100)}%`
}

export function AnalysisResultOverlay({ result, onClose, onConfirm }: AnalysisResultOverlayProps) {
    if (!result) return null

    const structureDefaults = {
        has_headings: false,
        has_tables: false,
        has_code_blocks: false,
        hierarchy_depth: 0,
        avg_paragraph_length: 0,
    }
    const structure = { ...structureDefaults, ...result.structure }

    const densityDefaults = {
        avg_sentence_length: 0,
        vocabulary_richness: 0,
        technical_term_density: 0,
    }
    const density = { ...densityDefaults, ...result.density }

    const configDefaults = {
        chunking_method: "recursive",
        chunk_size: 600,
        overlap: 80,
        embedding_model: "text-embedding-3-small",
    }
    const recommended_config = { ...configDefaults, ...result.recommended_config }

    const confidencePercentage = Math.round((result.confidence_score ?? 0) * 100)

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
            <div className="w-full max-w-4xl bg-neutral-900 border border-white/10 rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col max-h-[90vh] animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
                {/* Header */}
                <div className="p-8 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-orange-500/10 to-transparent">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-orange-500/20 flex items-center justify-center border border-orange-500/30">
                            <Activity className="w-6 h-6 text-orange-400" />
                        </div>
                        <div>
                            <div className="text-[10px] font-black tracking-[0.3em] uppercase text-orange-500 mb-1">
                                Analysis Complete
                            </div>
                            <h2 className="text-2xl font-black text-white tracking-tight">
                                Forensic Report <span className="text-zinc-500">#{result.document_id ? String(result.document_id).slice(0, 8) : "---"}</span>
                            </h2>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="hidden md:flex flex-col items-end">
                            <div className="text-[9px] font-black tracking-widest text-zinc-500 uppercase">Confidence Score</div>
                            <div className="flex items-center gap-2">
                                <div className="w-32 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-orange-500 transition-all duration-1000 ease-out"
                                        style={{ width: `${confidencePercentage}%` }}
                                    />
                                </div>
                                <span className="text-sm font-mono font-bold text-orange-400">{confidencePercentage}%</span>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 transition-colors text-zinc-500 hover:text-white">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-8 space-y-8">
                    {/* Top Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="p-5 rounded-2xl bg-white/5 border border-white/5 flex items-start gap-4">
                            <FileText className="w-5 h-5 text-blue-400 shrink-0" />
                            <div>
                                <div className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mb-1">Doc Type</div>
                                <div className="text-lg font-bold text-white capitalize">{result.document_type}</div>
                            </div>
                        </div>
                        <div className="p-5 rounded-2xl bg-white/5 border border-white/5 flex items-start gap-4">
                            <Layout className="w-5 h-5 text-purple-400 shrink-0" />
                            <div>
                                <div className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mb-1">Structural Depth</div>
                                <div className="text-lg font-bold text-white uppercase">{structure.hierarchy_depth ? `${structure.hierarchy_depth} Layers` : "N/A"}</div>
                            </div>
                        </div>
                        <div className="p-5 rounded-2xl bg-white/5 border border-white/5 flex items-start gap-4">
                            <Zap className="w-5 h-5 text-amber-400 shrink-0" />
                            <div>
                                <div className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mb-1">Density Score</div>
                                <div className="text-lg font-bold text-white uppercase">{density.vocabulary_richness ? `${Math.round(density.vocabulary_richness * 100)}% Richness` : "N/A"}</div>
                            </div>
                        </div>
                    </div>

                    {/* Detailed Analysis */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Structure & Density */}
                        <div className="space-y-6">
                            <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-zinc-400">
                                <BarChart3 className="w-4 h-4" />
                                Forensic Metrics
                            </h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-zinc-500">Avg Sentence</span>
                                        <span className="text-white font-mono">{displayValue(density.avg_sentence_length, "words")}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-zinc-500">Tech Density</span>
                                        <span className="text-white font-mono">{displayPercent(density.technical_term_density)}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-zinc-500">Avg Paragraph</span>
                                        <span className="text-white font-mono">{displayValue(structure.avg_paragraph_length, "chars")}</span>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-zinc-500">Has Tables</span>
                                        <span className={`font-mono ${structure.has_tables ? 'text-green-400' : 'text-zinc-700'}`}>
                                            {structure.has_tables ? 'YES' : 'NO'}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-zinc-500">Has Code</span>
                                        <span className={`font-mono ${structure.has_code_blocks ? 'text-green-400' : 'text-zinc-700'}`}>
                                            {structure.has_code_blocks ? 'YES' : 'NO'}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-zinc-500">Headings Found</span>
                                        <span className={`font-mono ${structure.has_headings ? 'text-green-400' : 'text-zinc-700'}`}>
                                            {structure.has_headings ? 'YES' : 'NO'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Strategy Recommendation */}
                        <div className="p-6 rounded-3xl bg-orange-500/5 border border-orange-500/20 space-y-4">
                            <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-orange-400">
                                <Shield className="w-4 h-4" />
                                Smart Strategy
                            </h3>
                            <div className="space-y-3">
                                <div className="flex items-center justify-between p-3 rounded-xl bg-black/40 border border-white/5">
                                    <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Method</span>
                                    <span className="text-xs font-bold text-white uppercase tracking-tighter">{recommended_config.chunking_method} Splitter</span>
                                </div>
                                <div className="flex gap-3">
                                    <div className="flex-1 p-3 rounded-xl bg-black/40 border border-white/5 flex flex-col">
                                        <span className="text-[8px] text-zinc-500 uppercase tracking-widest mb-1">Batch Size</span>
                                        <span className="text-lg font-black text-white">{recommended_config.chunk_size}</span>
                                    </div>
                                    <div className="flex-1 p-3 rounded-xl bg-black/40 border border-white/5 flex flex-col">
                                        <span className="text-[8px] text-zinc-500 uppercase tracking-widest mb-1">Overlap</span>
                                        <span className="text-lg font-black text-white">{recommended_config.overlap}</span>
                                    </div>
                                </div>
                                {result.reasoning && (
                                    <div className="flex items-center gap-2 p-3 rounded-xl bg-orange-500/10 border border-orange-500/10 text-[10px] text-orange-200/80 leading-relaxed italic">
                                        <Info className="w-4 h-4 shrink-0 text-orange-400" />
                                        &ldquo;{result.reasoning}&rdquo;
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-8 border-t border-white/5 flex flex-col md:flex-row items-center gap-4 bg-black/40">
                    <button
                        onClick={onClose}
                        className="w-full md:w-auto px-8 py-3 text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] hover:text-white transition-colors"
                    >
                        Dismiss report
                    </button>
                    <div className="flex-1" />
                    <Button
                        onClick={() => onConfirm(recommended_config)}
                        className="w-full md:w-auto bg-gradient-to-r from-orange-400 to-amber-600 text-black font-black text-[11px] uppercase tracking-[0.2em] h-14 px-12 rounded-2xl shadow-[0_10px_30px_rgba(245,183,0,0.3)] hover:shadow-[0_15px_40px_rgba(245,183,0,0.5)] transition-all hover:scale-[1.02] active:scale-95 border-none"
                    >
                        <span className="flex items-center gap-3">
                            Initiate Forensic Pipeline
                            <ArrowRight className="w-4 h-4" />
                        </span>
                    </Button>
                </div>
            </div>
        </div>
    )
}

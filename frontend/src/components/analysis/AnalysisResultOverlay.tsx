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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 bg-black/20 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="w-full max-w-4xl bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xl flex flex-col max-h-[90vh] animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
                {/* Header */}
                <div className="p-8 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-amber-50 to-transparent">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center border border-amber-200">
                            <Activity className="w-6 h-6 text-amber-600" />
                        </div>
                        <div>
                            <div className="text-[10px] font-black tracking-[0.3em] uppercase text-amber-600 mb-1">
                                Analysis Complete
                            </div>
                            <h2 className="text-2xl font-black text-gray-900 tracking-tight">
                                Analysis Report <span className="text-gray-400">#{result.document_id ? String(result.document_id).slice(0, 8) : "---"}</span>
                            </h2>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="hidden md:flex flex-col items-end">
                            <div className="text-[9px] font-black tracking-widest text-gray-400 uppercase">Confidence Score</div>
                            <div className="flex items-center gap-2">
                                <div className="w-32 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-amber-500 transition-all duration-1000 ease-out"
                                        style={{ width: `${confidencePercentage}%` }}
                                    />
                                </div>
                                <span className="text-sm font-mono font-bold text-amber-600">{confidencePercentage}%</span>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-900">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-8 space-y-8">
                    {/* Top Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="p-5 rounded-xl bg-gray-50 border border-gray-200 flex items-start gap-4">
                            <FileText className="w-5 h-5 text-blue-600 shrink-0" />
                            <div>
                                <div className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1">Doc Type</div>
                                <div className="text-lg font-bold text-gray-900 capitalize">{result.document_type}</div>
                            </div>
                        </div>
                        <div className="p-5 rounded-xl bg-gray-50 border border-gray-200 flex items-start gap-4">
                            <Layout className="w-5 h-5 text-purple-600 shrink-0" />
                            <div>
                                <div className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1">Structural Depth</div>
                                <div className="text-lg font-bold text-gray-900 uppercase">{structure.hierarchy_depth ? `${structure.hierarchy_depth} Layers` : "N/A"}</div>
                            </div>
                        </div>
                        <div className="p-5 rounded-xl bg-gray-50 border border-gray-200 flex items-start gap-4">
                            <Zap className="w-5 h-5 text-amber-600 shrink-0" />
                            <div>
                                <div className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1">Density Score</div>
                                <div className="text-lg font-bold text-gray-900 uppercase">{density.vocabulary_richness ? `${Math.round(density.vocabulary_richness * 100)}% Richness` : "N/A"}</div>
                            </div>
                        </div>
                    </div>

                    {/* Detailed Analysis */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Structure & Density */}
                        <div className="space-y-6">
                            <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-gray-500">
                                <BarChart3 className="w-4 h-4" />
                                Analysis Metrics
                            </h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-gray-400">Avg Sentence</span>
                                        <span className="text-gray-900 font-mono">{displayValue(density.avg_sentence_length, "words")}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-gray-400">Tech Density</span>
                                        <span className="text-gray-900 font-mono">{displayPercent(density.technical_term_density)}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-gray-400">Avg Paragraph</span>
                                        <span className="text-gray-900 font-mono">{displayValue(structure.avg_paragraph_length, "chars")}</span>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-gray-400">Has Tables</span>
                                        <span className={`font-mono ${structure.has_tables ? 'text-green-600' : 'text-gray-300'}`}>
                                            {structure.has_tables ? 'YES' : 'NO'}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-gray-400">Has Code</span>
                                        <span className={`font-mono ${structure.has_code_blocks ? 'text-green-600' : 'text-gray-300'}`}>
                                            {structure.has_code_blocks ? 'YES' : 'NO'}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-gray-400">Headings Found</span>
                                        <span className={`font-mono ${structure.has_headings ? 'text-green-600' : 'text-gray-300'}`}>
                                            {structure.has_headings ? 'YES' : 'NO'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Strategy Recommendation */}
                        <div className="p-6 rounded-xl bg-amber-50 border border-amber-200 space-y-4">
                            <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-amber-700">
                                <Shield className="w-4 h-4" />
                                Recommended Strategy
                            </h3>
                            <div className="space-y-3">
                                <div className="flex items-center justify-between p-3 rounded-xl bg-white border border-gray-200">
                                    <span className="text-[10px] text-gray-400 uppercase tracking-widest">Method</span>
                                    <span className="text-xs font-bold text-gray-900 uppercase tracking-tighter">{recommended_config.chunking_method} Splitter</span>
                                </div>
                                <div className="flex gap-3">
                                    <div className="flex-1 p-3 rounded-xl bg-white border border-gray-200 flex flex-col">
                                        <span className="text-[8px] text-gray-400 uppercase tracking-widest mb-1">Batch Size</span>
                                        <span className="text-lg font-black text-gray-900">{recommended_config.chunk_size}</span>
                                    </div>
                                    <div className="flex-1 p-3 rounded-xl bg-white border border-gray-200 flex flex-col">
                                        <span className="text-[8px] text-gray-400 uppercase tracking-widest mb-1">Overlap</span>
                                        <span className="text-lg font-black text-gray-900">{recommended_config.overlap}</span>
                                    </div>
                                </div>
                                {result.reasoning && (
                                    <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-100/50 border border-amber-200 text-[10px] text-amber-800 leading-relaxed italic">
                                        <Info className="w-4 h-4 shrink-0 text-amber-600" />
                                        &ldquo;{result.reasoning}&rdquo;
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-8 border-t border-gray-100 flex flex-col md:flex-row items-center gap-4 bg-gray-50">
                    <button
                        onClick={onClose}
                        className="w-full md:w-auto px-8 py-3 text-gray-400 text-[10px] font-black uppercase tracking-[0.2em] hover:text-gray-900 transition-colors"
                    >
                        Dismiss report
                    </button>
                    <div className="flex-1" />
                    <Button
                        onClick={() => onConfirm(recommended_config)}
                        className="w-full md:w-auto bg-gray-900 text-white font-black text-[11px] uppercase tracking-[0.2em] h-14 px-12 rounded-xl shadow-sm hover:bg-gray-800 hover:shadow-md transition-all hover:scale-[1.02] active:scale-95 border-none"
                    >
                        <span className="flex items-center gap-3">
                            Continue to Pipeline
                            <ArrowRight className="w-4 h-4" />
                        </span>
                    </Button>
                </div>
            </div>
        </div>
    )
}

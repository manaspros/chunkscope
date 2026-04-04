'use client';

import { useState, useCallback } from 'react';
import {
    Layers,
    Search,
    BarChart3,
    BrainCircuit,
    Star,
    Plus,
    ChevronDown,
    ChevronUp,
    ArrowDown,
    Sparkles,
    Settings2,
    AlertCircle,
    Check,
    X,
} from 'lucide-react';

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

interface TechniqueRec {
    name: string;
    category: string;
    confidence: number;
    reasoning: string;
    is_primary: boolean;
    config: Record<string, any>;
}

interface WhyNot {
    technique: string;
    reason: string;
}

interface PipelineRec {
    chunking: TechniqueRec[];
    retrieval: TechniqueRec[];
    reranking: TechniqueRec[];
    embedding: TechniqueRec;
    why_not: WhyNot[];
    overall_confidence: number;
    summary: string;
}

interface Props {
    recommendation: PipelineRec;
    onApplyAll?: (config?: { chunking_method: string; chunk_size: number; overlap: number; enabled_techniques: Record<string, string[]> }) => void;
}

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

function confidenceColor(c: number): string {
    if (c >= 0.8) return 'bg-green-500';
    if (c >= 0.6) return 'bg-amber-500';
    return 'bg-red-500';
}

function confidenceBorderColor(c: number): string {
    if (c >= 0.8) return 'border-green-300';
    if (c >= 0.6) return 'border-amber-300';
    return 'border-red-300';
}

function confidenceTextColor(c: number): string {
    if (c >= 0.8) return 'text-green-600';
    if (c >= 0.6) return 'text-amber-600';
    return 'text-red-600';
}

const CATEGORY_META: Record<string, {
    icon: typeof Layers;
    label: string;
    borderColor: string;
    iconColor: string;
}> = {
    chunking: { icon: Layers, label: 'CHUNKING', borderColor: 'border-l-blue-500', iconColor: 'text-blue-600' },
    retrieval: { icon: Search, label: 'RETRIEVAL', borderColor: 'border-l-green-500', iconColor: 'text-green-600' },
    reranking: { icon: BarChart3, label: 'RERANKING', borderColor: 'border-l-orange-500', iconColor: 'text-orange-600' },
    embedding: { icon: BrainCircuit, label: 'EMBEDDING', borderColor: 'border-l-purple-500', iconColor: 'text-purple-600' },
};

// -------------------------------------------------------------------
// Sub-components
// -------------------------------------------------------------------

function ConfidenceBar({ value }: { value: number }) {
    const pct = Math.round(value * 100);
    return (
        <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div
                    className={`h-full rounded-full ${confidenceColor(value)} transition-all duration-700`}
                    style={{ width: `${pct}%` }}
                />
            </div>
            <span className={`text-[10px] font-mono font-bold ${confidenceTextColor(value)}`}>{pct}%</span>
        </div>
    );
}

function TechniqueCard({
    technique,
    customizing,
    enabled,
    onToggle,
}: {
    technique: TechniqueRec;
    customizing: boolean;
    enabled: boolean;
    onToggle?: () => void;
}) {
    const dimmed = customizing && !enabled;
    return (
        <div
            className={`p-3 rounded-lg border transition-all ${
                dimmed ? 'opacity-40 border-gray-100 bg-gray-50' :
                technique.is_primary ? `${confidenceBorderColor(technique.confidence)} bg-white shadow-sm` :
                'border-gray-200 bg-white'
            }`}
        >
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    {technique.is_primary ? (
                        <Star className="w-3 h-3 text-amber-500 shrink-0 fill-amber-500" />
                    ) : (
                        <Plus className="w-3 h-3 text-gray-400 shrink-0" />
                    )}
                    <span className="text-xs font-bold text-gray-900 truncate">{technique.name.replace(/_/g, ' ')}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[8px] uppercase tracking-wider shrink-0 ${
                        technique.is_primary ? 'bg-amber-50 border border-amber-200 text-amber-700' : 'bg-gray-50 border border-gray-200 text-gray-500'
                    }`}>
                        {technique.is_primary ? 'primary' : 'augment'}
                    </span>
                </div>
                {customizing && onToggle && (
                    <button
                        onClick={onToggle}
                        className={`w-6 h-6 rounded-md flex items-center justify-center transition-all ${
                            enabled ? 'bg-green-50 text-green-600 border border-green-200' : 'bg-gray-50 text-gray-300 border border-gray-200'
                        }`}
                    >
                        {enabled ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                    </button>
                )}
            </div>
            <ConfidenceBar value={technique.confidence} />
            <p className="text-[10px] text-gray-500 leading-relaxed mt-1">{technique.reasoning}</p>
        </div>
    );
}

function PipelineSection({
    category,
    techniques,
    customizing,
    enabledSet,
    onToggle,
}: {
    category: string;
    techniques: TechniqueRec[];
    customizing: boolean;
    enabledSet: Set<string>;
    onToggle: (name: string) => void;
}) {
    const meta = CATEGORY_META[category];
    if (!meta || techniques.length === 0) return null;
    const Icon = meta.icon;

    return (
        <div className={`pl-4 border-l-2 ${meta.borderColor} space-y-2`}>
            <div className={`flex items-center gap-2 ${meta.iconColor}`}>
                <Icon className="w-4 h-4" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em]">{meta.label}</span>
                <span className="text-[10px] text-gray-400 font-normal">{techniques.length} technique{techniques.length > 1 ? 's' : ''}</span>
            </div>
            <div className="space-y-1.5">
                {techniques.map((t, i) => (
                    <TechniqueCard
                        key={`${category}-${i}`}
                        technique={t}
                        customizing={customizing}
                        enabled={enabledSet.has(t.name)}
                        onToggle={() => onToggle(t.name)}
                    />
                ))}
            </div>
        </div>
    );
}

// -------------------------------------------------------------------
// Main component
// -------------------------------------------------------------------

export function PipelineRecommendation({ recommendation, onApplyAll }: Props) {
    const [showWhyNot, setShowWhyNot] = useState(false);
    const [customizing, setCustomizing] = useState(false);

    // Build initial enabled sets from all recommended techniques
    const buildEnabledSet = useCallback((techniques: TechniqueRec[]) => {
        return new Set(techniques.map(t => t.name));
    }, []);

    const [enabledChunking, setEnabledChunking] = useState<Set<string>>(() => buildEnabledSet(recommendation.chunking || []));
    const [enabledRetrieval, setEnabledRetrieval] = useState<Set<string>>(() => buildEnabledSet(recommendation.retrieval || []));
    const [enabledReranking, setEnabledReranking] = useState<Set<string>>(() => buildEnabledSet(recommendation.reranking || []));

    // Customizable chunk config
    const primaryChunking = recommendation.chunking?.find(t => t.is_primary);
    const [chunkSize, setChunkSize] = useState(primaryChunking?.config?.chunk_size || 512);
    const [overlap, setOverlap] = useState(primaryChunking?.config?.overlap ?? 50);

    const toggleTechnique = (category: string, name: string) => {
        const setters: Record<string, React.Dispatch<React.SetStateAction<Set<string>>>> = {
            chunking: setEnabledChunking,
            retrieval: setEnabledRetrieval,
            reranking: setEnabledReranking,
        };
        const setter = setters[category];
        if (!setter) return;
        setter(prev => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        });
    };

    const handleApply = () => {
        if (!onApplyAll) return;
        const method = primaryChunking?.name || 'recursive';
        onApplyAll({
            chunking_method: method,
            chunk_size: chunkSize,
            overlap: overlap,
            enabled_techniques: {
                chunking: Array.from(enabledChunking),
                retrieval: Array.from(enabledRetrieval),
                reranking: Array.from(enabledReranking),
            },
        });
    };

    const overallPct = Math.round(recommendation.overall_confidence * 100);

    return (
        <div className="p-6 rounded-xl bg-white border border-gray-200 space-y-4 shadow-sm">
            {/* Header */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-purple-600" />
                        Pipeline Recommendation
                    </h2>
                    <span className={`text-xs font-mono font-bold ${confidenceTextColor(recommendation.overall_confidence)}`}>
                        {overallPct}%
                    </span>
                </div>
                <ConfidenceBar value={recommendation.overall_confidence} />
                {recommendation.summary && (
                    <p className="text-[11px] text-gray-500 leading-relaxed italic border-l-2 border-purple-300 pl-3">
                        {recommendation.summary}
                    </p>
                )}
            </div>

            {/* Pipeline stages */}
            <div className="space-y-1">
                {recommendation.chunking?.length > 0 && (
                    <>
                        <PipelineSection
                            category="chunking"
                            techniques={recommendation.chunking}
                            customizing={customizing}
                            enabledSet={enabledChunking}
                            onToggle={(name) => toggleTechnique('chunking', name)}
                        />

                        {/* Chunk config (visible in customize mode) */}
                        {customizing && (
                            <div className="ml-4 pl-4 border-l-2 border-blue-200 py-2 space-y-2">
                                <div className="flex items-center gap-4">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider w-20">Chunk Size</label>
                                    <input
                                        type="number"
                                        value={chunkSize}
                                        onChange={(e) => setChunkSize(Number(e.target.value))}
                                        className="w-24 px-2 py-1 text-xs border border-gray-200 rounded-lg bg-white"
                                    />
                                    <span className="text-[10px] text-gray-400">tokens</span>
                                </div>
                                <div className="flex items-center gap-4">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider w-20">Overlap</label>
                                    <input
                                        type="number"
                                        value={overlap}
                                        onChange={(e) => setOverlap(Number(e.target.value))}
                                        className="w-24 px-2 py-1 text-xs border border-gray-200 rounded-lg bg-white"
                                    />
                                    <span className="text-[10px] text-gray-400">tokens</span>
                                </div>
                            </div>
                        )}

                        <div className="flex justify-center py-0.5">
                            <ArrowDown className="w-3.5 h-3.5 text-gray-300" />
                        </div>
                    </>
                )}

                {recommendation.retrieval?.length > 0 && (
                    <>
                        <PipelineSection
                            category="retrieval"
                            techniques={recommendation.retrieval}
                            customizing={customizing}
                            enabledSet={enabledRetrieval}
                            onToggle={(name) => toggleTechnique('retrieval', name)}
                        />
                        <div className="flex justify-center py-0.5">
                            <ArrowDown className="w-3.5 h-3.5 text-gray-300" />
                        </div>
                    </>
                )}

                {recommendation.reranking?.length > 0 && (
                    <>
                        <PipelineSection
                            category="reranking"
                            techniques={recommendation.reranking}
                            customizing={customizing}
                            enabledSet={enabledReranking}
                            onToggle={(name) => toggleTechnique('reranking', name)}
                        />
                        <div className="flex justify-center py-0.5">
                            <ArrowDown className="w-3.5 h-3.5 text-gray-300" />
                        </div>
                    </>
                )}

                {recommendation.embedding && (
                    <div className="pl-4 border-l-2 border-l-purple-500 space-y-2">
                        <div className="flex items-center gap-2 text-purple-600">
                            <BrainCircuit className="w-4 h-4" />
                            <span className="text-[10px] font-black uppercase tracking-[0.2em]">EMBEDDING</span>
                        </div>
                        <div className="p-3 rounded-lg bg-white border border-purple-200 shadow-sm space-y-1">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-gray-900">{recommendation.embedding.name}</span>
                                <span className={`text-[10px] font-mono font-bold ${confidenceTextColor(recommendation.embedding.confidence)}`}>
                                    {Math.round(recommendation.embedding.confidence * 100)}%
                                </span>
                            </div>
                            <ConfidenceBar value={recommendation.embedding.confidence} />
                            <p className="text-[10px] text-gray-500">{recommendation.embedding.reasoning}</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Why not section */}
            {recommendation.why_not?.length > 0 && (
                <div className="space-y-2">
                    <button
                        onClick={() => setShowWhyNot(!showWhyNot)}
                        className="flex items-center gap-2 text-[11px] text-gray-400 hover:text-gray-700 transition-colors"
                    >
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>Why not these alternatives? ({recommendation.why_not.length})</span>
                        {showWhyNot ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                    {showWhyNot && (
                        <div className="space-y-1">
                            {recommendation.why_not.map((wn, i) => (
                                <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                                    <span className="text-[10px] font-bold text-gray-500 shrink-0 min-w-[100px]">{wn.technique}</span>
                                    <span className="text-[10px] text-gray-400 leading-relaxed">{wn.reason}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-2 pt-1">
                {onApplyAll && (
                    <button
                        onClick={handleApply}
                        className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800 text-xs font-bold transition-all"
                    >
                        <Sparkles className="w-3.5 h-3.5" />
                        {customizing ? 'Apply Customized Pipeline' : 'Apply All & Chunk'}
                    </button>
                )}
                <button
                    onClick={() => setCustomizing(!customizing)}
                    className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg border text-xs font-bold transition-all ${
                        customizing
                            ? 'bg-blue-50 border-blue-200 text-blue-700'
                            : 'bg-white border-gray-200 text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                    <Settings2 className="w-3.5 h-3.5" />
                    {customizing ? 'Done' : 'Customize'}
                </button>
            </div>
        </div>
    );
}

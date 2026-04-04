'use client';

import { useState, useMemo, useCallback, memo } from 'react';
import ReactFlow, {
    Node,
    Edge,
    MarkerType,
    Background,
    Controls,
    NodeProps,
    Handle,
    Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
    Layers,
    Search,
    BarChart3,
    BrainCircuit,
    Star,
    Plus,
    ChevronDown,
    ChevronUp,
    AlertCircle,
    Sparkles,
    Upload,
    CheckCircle2,
} from 'lucide-react';

// -------------------------------------------------------------------
// Types (same as PipelineRecommendation)
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
    onBuildPipeline?: () => void;
}

// -------------------------------------------------------------------
// Constants
// -------------------------------------------------------------------

const STAGE_COLORS: Record<string, { border: string; bg: string; text: string; icon: string }> = {
    chunking: { border: 'border-l-blue-500', bg: 'bg-blue-50', text: 'text-blue-700', icon: 'text-blue-600' },
    retrieval: { border: 'border-l-green-500', bg: 'bg-green-50', text: 'text-green-700', icon: 'text-green-600' },
    reranking: { border: 'border-l-orange-500', bg: 'bg-orange-50', text: 'text-orange-700', icon: 'text-orange-600' },
    embedding: { border: 'border-l-purple-500', bg: 'bg-purple-50', text: 'text-purple-700', icon: 'text-purple-600' },
};

const STAGE_ICONS: Record<string, typeof Layers> = {
    chunking: Layers,
    retrieval: Search,
    reranking: BarChart3,
    embedding: BrainCircuit,
};

const STAGE_BORDER_COLORS: Record<string, string> = {
    chunking: '#3b82f6',
    retrieval: '#22c55e',
    reranking: '#f97316',
    embedding: '#a855f7',
};

function confidenceTextColor(c: number): string {
    if (c >= 0.8) return 'text-green-600';
    if (c >= 0.6) return 'text-amber-600';
    return 'text-red-600';
}

function confidenceBgColor(c: number): string {
    if (c >= 0.8) return 'bg-green-500';
    if (c >= 0.6) return 'bg-amber-500';
    return 'bg-red-500';
}

// -------------------------------------------------------------------
// Custom Node: InputNode
// -------------------------------------------------------------------

const InputNode = memo(function InputNode(_props: NodeProps) {
    return (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white text-gray-900 border border-gray-200 shadow-md">
            <Upload className="w-3.5 h-3.5" />
            <span className="text-xs font-bold tracking-wide">Your Data</span>
            <Handle type="source" position={Position.Right} className="!bg-gray-300 !w-2 !h-2 !border-0" />
        </div>
    );
});

// -------------------------------------------------------------------
// Custom Node: OutputNode
// -------------------------------------------------------------------

const OutputNode = memo(function OutputNode(_props: NodeProps) {
    return (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white text-gray-900 border border-gray-200 shadow-md">
            <Handle type="target" position={Position.Left} className="!bg-gray-300 !w-2 !h-2 !border-0" />
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs font-bold tracking-wide">RAG Ready</span>
        </div>
    );
});

// -------------------------------------------------------------------
// Custom Node: StageNode
// -------------------------------------------------------------------

const StageNode = memo(function StageNode({ data }: NodeProps) {
    const { label, count, confidence, category } = data;
    const Icon = STAGE_ICONS[category] || Layers;
    const colors = STAGE_COLORS[category] || STAGE_COLORS.chunking;
    const borderColor = STAGE_BORDER_COLORS[category] || '#3b82f6';
    const pct = Math.round((confidence || 0) * 100);

    return (
        <div
            className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden"
            style={{ width: 180, borderLeft: `4px solid ${borderColor}` }}
        >
            <Handle type="target" position={Position.Left} className="!bg-gray-300 !w-2 !h-2 !border-0" />
            <Handle type="source" position={Position.Right} className="!bg-gray-300 !w-2 !h-2 !border-0" />
            {/* Also provide a bottom source for technique edges */}
            <Handle type="source" position={Position.Bottom} id="bottom" className="!bg-gray-300 !w-2 !h-2 !border-0" />

            <div className="px-3 py-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                        <Icon className={`w-3.5 h-3.5 ${colors.icon}`} />
                        <span className="text-[10px] font-black uppercase tracking-[0.15em] text-gray-800">{label}</span>
                    </div>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${colors.bg} ${colors.text}`}>
                        {count}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div
                            className={`h-full rounded-full ${confidenceBgColor(confidence)} transition-all duration-500`}
                            style={{ width: `${pct}%` }}
                        />
                    </div>
                    <span className={`text-[9px] font-mono font-bold ${confidenceTextColor(confidence)}`}>{pct}%</span>
                </div>
            </div>
        </div>
    );
});

// -------------------------------------------------------------------
// Custom Node: TechniqueNode
// -------------------------------------------------------------------

const TechniqueNode = memo(function TechniqueNode({ data }: NodeProps) {
    const { name, confidence, reasoning, is_primary, category } = data;
    const borderColor = is_primary ? (STAGE_BORDER_COLORS[category] || '#3b82f6') : '#e5e7eb';
    const pct = Math.round((confidence || 0) * 100);
    const [showTooltip, setShowTooltip] = useState(false);

    return (
        <div
            className="bg-white rounded-md border border-gray-200 shadow-sm relative cursor-default"
            style={{ width: 160, borderLeft: `3px solid ${borderColor}` }}
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
        >
            <Handle type="target" position={Position.Top} className="!bg-gray-200 !w-2 !h-2 !border-0" />

            <div className="px-2.5 py-2 space-y-1">
                <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1 min-w-0 flex-1">
                        {is_primary ? (
                            <Star className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />
                        ) : (
                            <Plus className="w-3 h-3 text-gray-400 shrink-0" />
                        )}
                        <span className="text-[10px] font-bold text-gray-800 truncate">
                            {(name || '').replace(/_/g, ' ')}
                        </span>
                    </div>
                    <span className={`text-[9px] font-mono font-bold shrink-0 ${confidenceTextColor(confidence)}`}>
                        {pct}%
                    </span>
                </div>
                <p className="text-[9px] text-gray-400 leading-snug line-clamp-2">
                    {reasoning}
                </p>
            </div>

            {/* Tooltip with full reasoning - renders ABOVE the card to avoid clipping */}
            {showTooltip && reasoning && (
                <div
                    className="absolute left-0 bottom-full mb-2 w-72 p-3 bg-gray-900 text-white text-[10px] leading-relaxed rounded-lg shadow-xl pointer-events-none"
                    style={{ zIndex: 9999 }}
                >
                    <div className="font-bold mb-1 text-gray-200">
                        {(name || '').replace(/_/g, ' ')} - {is_primary ? 'Primary' : 'Augment'}
                    </div>
                    {reasoning}
                    <div className="absolute left-6 top-full w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-gray-900" />
                </div>
            )}
        </div>
    );
});

// -------------------------------------------------------------------
// Layout builder
// -------------------------------------------------------------------

function buildFlowElements(rec: PipelineRec): { nodes: Node[]; edges: Edge[] } {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    const stageX: Record<string, number> = {
        input: 0,
        chunking: 250,
        retrieval: 500,
        reranking: 750,
        embedding: 1000,
        output: 1250,
    };
    const stageY = 50;
    const techniqueStartY = 180;
    const techniqueGap = 90;

    // Input node
    nodes.push({
        id: 'input',
        type: 'inputNode',
        position: { x: stageX.input, y: stageY + 20 },
        data: {},
    });

    // Stages with technique arrays
    const stages = [
        { key: 'chunking', techniques: rec.chunking || [] },
        { key: 'retrieval', techniques: rec.retrieval || [] },
        { key: 'reranking', techniques: rec.reranking || [] },
    ];

    let prevStageId = 'input';

    for (const stage of stages) {
        if (stage.techniques.length === 0) continue;

        const stageId = `stage-${stage.key}`;
        const avgConf =
            stage.techniques.reduce((s, t) => s + t.confidence, 0) / (stage.techniques.length || 1);

        nodes.push({
            id: stageId,
            type: 'stageNode',
            position: { x: stageX[stage.key], y: stageY },
            data: {
                label: stage.key.toUpperCase(),
                count: stage.techniques.length,
                confidence: avgConf,
                category: stage.key,
            },
        });

        edges.push({
            id: `${prevStageId}-${stageId}`,
            source: prevStageId,
            target: stageId,
            type: 'smoothstep',
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { stroke: '#d1d5db', strokeWidth: 1.5 },
        });

        // Technique nodes below
        stage.techniques.forEach((tech, i) => {
            const techId = `tech-${stage.key}-${i}`;
            nodes.push({
                id: techId,
                type: 'techniqueNode',
                position: { x: stageX[stage.key], y: techniqueStartY + i * techniqueGap },
                data: { ...tech, category: stage.key },
            });
            edges.push({
                id: `${stageId}-${techId}`,
                source: stageId,
                sourceHandle: 'bottom',
                target: techId,
                type: 'smoothstep',
                style: { stroke: '#e5e7eb', strokeDasharray: '4 4', strokeWidth: 1 },
            });
        });

        prevStageId = stageId;
    }

    // Embedding stage
    if (rec.embedding) {
        const embId = 'stage-embedding';
        nodes.push({
            id: embId,
            type: 'stageNode',
            position: { x: stageX.embedding, y: stageY },
            data: {
                label: 'EMBEDDING',
                count: 1,
                confidence: rec.embedding.confidence,
                category: 'embedding',
            },
        });
        edges.push({
            id: `${prevStageId}-${embId}`,
            source: prevStageId,
            target: embId,
            type: 'smoothstep',
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { stroke: '#d1d5db', strokeWidth: 1.5 },
        });

        // Embedding technique node
        nodes.push({
            id: 'tech-embedding-0',
            type: 'techniqueNode',
            position: { x: stageX.embedding, y: techniqueStartY },
            data: { ...rec.embedding, category: 'embedding' },
        });
        edges.push({
            id: `${embId}-tech-embedding-0`,
            source: embId,
            sourceHandle: 'bottom',
            target: 'tech-embedding-0',
            type: 'smoothstep',
            style: { stroke: '#e5e7eb', strokeDasharray: '4 4', strokeWidth: 1 },
        });

        prevStageId = embId;
    }

    // Output node
    nodes.push({
        id: 'output',
        type: 'outputNode',
        position: { x: stageX.output, y: stageY + 20 },
        data: {},
    });
    edges.push({
        id: `${prevStageId}-output`,
        source: prevStageId,
        target: 'output',
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: '#d1d5db', strokeWidth: 1.5 },
    });

    return { nodes, edges };
}

// -------------------------------------------------------------------
// Main component
// -------------------------------------------------------------------

export function PipelineFlow({ recommendation, onBuildPipeline }: Props) {
    const [showWhyNot, setShowWhyNot] = useState(false);

    const nodeTypes = useMemo(
        () => ({
            inputNode: InputNode,
            outputNode: OutputNode,
            stageNode: StageNode,
            techniqueNode: TechniqueNode,
        }),
        [],
    );

    const { nodes, edges } = useMemo(() => buildFlowElements(recommendation), [recommendation]);

    const overallPct = Math.round(recommendation.overall_confidence * 100);

    return (
        <div className="rounded-xl bg-white border border-gray-200 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="px-6 pt-5 pb-3 space-y-2">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-purple-600" />
                        Pipeline Recommendation
                    </h2>
                    <span
                        className={`text-xs font-mono font-bold ${confidenceTextColor(recommendation.overall_confidence)}`}
                    >
                        {overallPct}% confidence
                    </span>
                </div>
                {recommendation.summary && (
                    <p className="text-[11px] text-gray-500 leading-relaxed italic border-l-2 border-purple-300 pl-3">
                        {recommendation.summary}
                    </p>
                )}
            </div>

            {/* Flow diagram */}
            <div className="h-[500px] bg-gray-50 border-t border-b border-gray-100" style={{ overflow: 'visible' }}>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    nodeTypes={nodeTypes}
                    fitView
                    fitViewOptions={{ padding: 0.2 }}
                    nodesConnectable={false}
                    nodesDraggable={true}
                    elementsSelectable={true}
                    panOnScroll
                    proOptions={{ hideAttribution: true }}
                >
                    <Background color="#e5e7eb" gap={20} size={1} />
                    <Controls
                        showInteractive={false}
                        className="!bg-white !border-gray-200 !shadow-sm"
                    />
                </ReactFlow>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 space-y-3">
                {/* Why not section */}
                {recommendation.why_not?.length > 0 && (
                    <div className="space-y-2">
                        <button
                            onClick={() => setShowWhyNot(!showWhyNot)}
                            className="flex items-center gap-2 text-[11px] text-gray-400 hover:text-gray-700 transition-colors"
                        >
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span>Why not these alternatives? ({recommendation.why_not.length})</span>
                            {showWhyNot ? (
                                <ChevronUp className="w-3 h-3" />
                            ) : (
                                <ChevronDown className="w-3 h-3" />
                            )}
                        </button>
                        {showWhyNot && (
                            <div className="space-y-1">
                                {recommendation.why_not.map((wn, i) => (
                                    <div
                                        key={i}
                                        className="flex items-start gap-3 p-2.5 rounded-lg bg-gray-50 border border-gray-100"
                                    >
                                        <span className="text-[10px] font-bold text-gray-500 shrink-0 min-w-[100px]">
                                            {wn.technique}
                                        </span>
                                        <span className="text-[10px] text-gray-400 leading-relaxed">
                                            {wn.reason}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Build Pipeline button */}
                {onBuildPipeline && (
                    <button
                        onClick={onBuildPipeline}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-gray-900 text-white hover:bg-gray-800 text-xs font-bold transition-all"
                    >
                        <Sparkles className="w-3.5 h-3.5" />
                        Build Pipeline &rarr;
                    </button>
                )}
            </div>
        </div>
    );
}

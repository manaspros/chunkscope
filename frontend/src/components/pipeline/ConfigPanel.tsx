"use client"

import { useCallback, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { usePipelineStore } from '@/stores/usePipelineStore'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
    getNodeDef,
    CATEGORY_COLORS,
    CHUNKING_STRATEGIES,
    EMBEDDING_MODELS,
    RETRIEVAL_STRATEGIES,
    RERANKER_PROVIDERS,
    LLM_MODELS,
    EVAL_METRICS,
    NodeCategory,
} from '@/lib/pipeline-nodes'
import {
    X, FileUp, Upload, Type, Scissors, BrainCircuit, Database, Search,
    ArrowUpDown, MessageSquare, BarChart3, Eye, AlertCircle,
} from 'lucide-react'
import { documentsApi } from '@/lib/api'



const ICON_MAP: Record<string, React.ElementType> = {
    FileUp, Scissors, BrainCircuit, Database, Search, ArrowUpDown,
    MessageSquare, BarChart3,
}

// --------------- Sub-config panels per node type ---------------

function DocumentUploadConfig({ nodeId, data }: { nodeId: string; data: any }) {
    const updateNodeData = usePipelineStore((s) => s.updateNodeData)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [uploading, setUploading] = useState(false)
    const [dragOver, setDragOver] = useState(false)

    const handleFile = useCallback(async (file: File) => {
        setUploading(true)
        try {
            const result = await documentsApi.uploadDocument(file)
            updateNodeData(nodeId, {
                uploadMode: 'file',
                fileName: file.name,
                documentId: result.document_id || result.id,
            })
        } catch {
            updateNodeData(nodeId, {
                uploadMode: 'file',
                fileName: file.name,
                documentId: null,
            })
        } finally {
            setUploading(false)
        }
    }, [nodeId, updateNodeData])

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setDragOver(false)
        const file = e.dataTransfer.files[0]
        if (file) handleFile(file)
    }, [handleFile])

    return (
        <div className="space-y-4">
            {/* Mode toggle */}
            <div className="flex gap-1 p-0.5 bg-white/[0.03] rounded-lg border border-white/[0.06]">
                <button
                    onClick={() => updateNodeData(nodeId, { uploadMode: 'file' })}
                    className={cn(
                        "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[10px] font-medium transition-all",
                        data.uploadMode !== 'text' ? "bg-white/[0.08] text-white" : "text-neutral-500 hover:text-neutral-300"
                    )}
                >
                    <Upload className="w-3 h-3" /> File Upload
                </button>
                <button
                    onClick={() => updateNodeData(nodeId, { uploadMode: 'text' })}
                    className={cn(
                        "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[10px] font-medium transition-all",
                        data.uploadMode === 'text' ? "bg-white/[0.08] text-white" : "text-neutral-500 hover:text-neutral-300"
                    )}
                >
                    <Type className="w-3 h-3" /> Paste Text
                </button>
            </div>

            {data.uploadMode === 'text' ? (
                <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase text-neutral-500 font-bold">Text Content</Label>
                    <textarea
                        className="w-full h-32 text-[11px] px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-neutral-300 resize-none focus:outline-none focus:ring-1 focus:ring-white/20 placeholder:text-neutral-600"
                        placeholder="Paste your document text here..."
                        value={data.text || ''}
                        onChange={(e) => updateNodeData(nodeId, { text: e.target.value })}
                    />
                </div>
            ) : (
                <div
                    onDrop={handleDrop}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                        "flex flex-col items-center justify-center gap-2 py-8 rounded-lg border-2 border-dashed transition-all cursor-pointer",
                        dragOver
                            ? "border-blue-500/50 bg-blue-500/5"
                            : "border-white/[0.06] hover:border-white/10 hover:bg-white/[0.02]"
                    )}
                >
                    <Upload className={cn("w-6 h-6", dragOver ? "text-blue-400" : "text-neutral-600")} />
                    <p className="text-[11px] text-neutral-500">
                        {uploading ? 'Uploading...' : data.fileName ? data.fileName : 'Drop file or click to browse'}
                    </p>
                    {data.documentId && (
                        <Badge variant="outline" className="text-[9px] border-emerald-500/30 text-emerald-400">
                            Uploaded
                        </Badge>
                    )}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.txt,.md,.docx,.csv"
                        className="hidden"
                        onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) handleFile(file)
                        }}
                    />
                </div>
            )}
        </div>
    )
}

function ChunkingConfig({ nodeId, data }: { nodeId: string; data: any }) {
    const updateNodeData = usePipelineStore((s) => s.updateNodeData)

    return (
        <div className="space-y-4">
            <div className="space-y-1.5">
                <Label className="text-[10px] uppercase text-neutral-500 font-bold">Strategy</Label>
                <Select
                    value={data.method || 'recursive'}
                    onValueChange={(val) => updateNodeData(nodeId, { method: val })}
                >
                    <SelectTrigger className="h-8 text-xs bg-white/[0.03] border-white/[0.06] text-neutral-300">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-neutral-900 border-white/10 text-neutral-300">
                        {CHUNKING_STRATEGIES.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                                <div className="flex flex-col">
                                    <span>{s.label}</span>
                                </div>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <p className="text-[9px] text-neutral-600">
                    {CHUNKING_STRATEGIES.find((s) => s.id === (data.method || 'recursive'))?.description}
                </p>
            </div>

            <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                    <Label className="text-[10px] uppercase text-neutral-500 font-bold">Chunk Size</Label>
                    <span className="text-[10px] text-purple-400 font-mono">{data.chunkSize || 500}</span>
                </div>
                <Slider
                    value={[data.chunkSize || 500]}
                    min={100}
                    max={2000}
                    step={50}
                    onValueChange={([val]) => updateNodeData(nodeId, { chunkSize: val })}
                    className="py-2"
                />
                <div className="flex justify-between text-[9px] text-neutral-600">
                    <span>100</span><span>2000</span>
                </div>
            </div>

            <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                    <Label className="text-[10px] uppercase text-neutral-500 font-bold">Overlap</Label>
                    <span className="text-[10px] text-purple-400 font-mono">{data.overlap || 50}</span>
                </div>
                <Slider
                    value={[data.overlap || 50]}
                    min={0}
                    max={200}
                    step={10}
                    onValueChange={([val]) => updateNodeData(nodeId, { overlap: val })}
                    className="py-2"
                />
                <div className="flex justify-between text-[9px] text-neutral-600">
                    <span>0</span><span>200</span>
                </div>
            </div>

            {data.method === 'semantic' && (
                <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                        <Label className="text-[10px] uppercase text-neutral-500 font-bold">Similarity Threshold</Label>
                        <span className="text-[10px] text-purple-400 font-mono">{(data.threshold ?? 0.5).toFixed(2)}</span>
                    </div>
                    <Slider
                        value={[data.threshold ?? 0.5]}
                        min={0}
                        max={1}
                        step={0.05}
                        onValueChange={([val]) => updateNodeData(nodeId, { threshold: val })}
                        className="py-2"
                    />
                </div>
            )}
        </div>
    )
}

function EmbeddingConfig({ nodeId, data }: { nodeId: string; data: any }) {
    const updateNodeData = usePipelineStore((s) => s.updateNodeData)
    const provider = data.provider || 'openai'
    const modelId = data.model || 'text-embedding-3-small'
    const providerData = EMBEDDING_MODELS[provider]
    const currentModel = providerData?.models.find((m) => m.id === modelId) || providerData?.models[0]

    return (
        <div className="space-y-4">
            <div className="space-y-1.5">
                <Label className="text-[10px] uppercase text-neutral-500 font-bold">Provider</Label>
                <Select
                    value={provider}
                    onValueChange={(val) => {
                        const firstModel = EMBEDDING_MODELS[val]?.models[0]
                        updateNodeData(nodeId, { provider: val, model: firstModel?.id })
                    }}
                >
                    <SelectTrigger className="h-8 text-xs bg-white/[0.03] border-white/[0.06] text-neutral-300">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-neutral-900 border-white/10 text-neutral-300">
                        {Object.entries(EMBEDDING_MODELS).map(([key, p]) => (
                            <SelectItem key={key} value={key}>{p.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-1.5">
                <Label className="text-[10px] uppercase text-neutral-500 font-bold">Model</Label>
                <Select
                    value={modelId}
                    onValueChange={(val) => updateNodeData(nodeId, { model: val })}
                >
                    <SelectTrigger className="h-8 text-xs bg-white/[0.03] border-white/[0.06] text-neutral-300">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-neutral-900 border-white/10 text-neutral-300">
                        {providerData?.models.map((m) => (
                            <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {currentModel && (
                <div className="grid grid-cols-3 gap-2 p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                    <div className="text-center">
                        <p className="text-[8px] text-neutral-500 uppercase font-bold">Dimensions</p>
                        <p className="text-[11px] text-purple-400 font-mono">{currentModel.dimensions}</p>
                    </div>
                    <div className="text-center">
                        <p className="text-[8px] text-neutral-500 uppercase font-bold">Cost/1M</p>
                        <p className={cn("text-[11px] font-mono", currentModel.cost === 0 ? "text-emerald-400" : "text-amber-400")}>
                            {currentModel.cost === 0 ? 'FREE' : `$${currentModel.cost}`}
                        </p>
                    </div>
                    <div className="text-center">
                        <p className="text-[8px] text-neutral-500 uppercase font-bold">Quality</p>
                        <p className="text-[11px] text-neutral-300">{currentModel.quality}</p>
                    </div>
                </div>
            )}
        </div>
    )
}

function VectorStoreConfig({ nodeId, data }: { nodeId: string; data: any }) {
    const updateNodeData = usePipelineStore((s) => s.updateNodeData)

    return (
        <div className="space-y-4">
            <div className="space-y-1.5">
                <Label className="text-[10px] uppercase text-neutral-500 font-bold">Provider</Label>
                <Select
                    value={data.provider || 'pgvector'}
                    onValueChange={(val) => updateNodeData(nodeId, { provider: val })}
                >
                    <SelectTrigger className="h-8 text-xs bg-white/[0.03] border-white/[0.06] text-neutral-300">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-neutral-900 border-white/10 text-neutral-300">
                        <SelectItem value="pgvector">pgvector (PostgreSQL)</SelectItem>
                        <SelectItem value="chroma">ChromaDB</SelectItem>
                        <SelectItem value="pinecone">Pinecone</SelectItem>
                        <SelectItem value="weaviate">Weaviate</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-1.5">
                <Label className="text-[10px] uppercase text-neutral-500 font-bold">Collection Name</Label>
                <Input
                    className="h-8 text-xs bg-white/[0.03] border-white/[0.06] text-neutral-300"
                    value={data.collection || 'default'}
                    onChange={(e) => updateNodeData(nodeId, { collection: e.target.value })}
                />
            </div>

            <div className="space-y-1.5">
                <Label className="text-[10px] uppercase text-neutral-500 font-bold">Index Type</Label>
                <Select
                    value={data.indexType || 'hnsw'}
                    onValueChange={(val) => updateNodeData(nodeId, { indexType: val })}
                >
                    <SelectTrigger className="h-8 text-xs bg-white/[0.03] border-white/[0.06] text-neutral-300">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-neutral-900 border-white/10 text-neutral-300">
                        <SelectItem value="hnsw">HNSW</SelectItem>
                        <SelectItem value="ivfflat">IVFFlat</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </div>
    )
}

function RetrieverConfig({ nodeId, data }: { nodeId: string; data: any }) {
    const updateNodeData = usePipelineStore((s) => s.updateNodeData)

    return (
        <div className="space-y-4">
            <div className="space-y-1.5">
                <Label className="text-[10px] uppercase text-neutral-500 font-bold">Strategy</Label>
                <Select
                    value={data.strategy || 'dense'}
                    onValueChange={(val) => updateNodeData(nodeId, { strategy: val })}
                >
                    <SelectTrigger className="h-8 text-xs bg-white/[0.03] border-white/[0.06] text-neutral-300">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-neutral-900 border-white/10 text-neutral-300">
                        {RETRIEVAL_STRATEGIES.map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <p className="text-[9px] text-neutral-600">
                    {RETRIEVAL_STRATEGIES.find((s) => s.id === (data.strategy || 'dense'))?.description}
                </p>
            </div>

            <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                    <Label className="text-[10px] uppercase text-neutral-500 font-bold">Top K</Label>
                    <span className="text-[10px] text-emerald-400 font-mono">{data.topK || 5}</span>
                </div>
                <Slider
                    value={[data.topK || 5]}
                    min={1}
                    max={20}
                    step={1}
                    onValueChange={([val]) => updateNodeData(nodeId, { topK: val })}
                    className="py-2"
                />
            </div>

            {data.strategy === 'hybrid' && (
                <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                        <Label className="text-[10px] uppercase text-neutral-500 font-bold">Alpha (Vector Weight)</Label>
                        <span className="text-[10px] text-emerald-400 font-mono">{(data.alpha ?? 0.7).toFixed(2)}</span>
                    </div>
                    <Slider
                        value={[data.alpha ?? 0.7]}
                        min={0}
                        max={1}
                        step={0.05}
                        onValueChange={([val]) => updateNodeData(nodeId, { alpha: val })}
                        className="py-2"
                    />
                    <div className="flex justify-between text-[9px] text-neutral-600">
                        <span>Keyword only</span><span>Vector only</span>
                    </div>
                </div>
            )}
        </div>
    )
}

function RerankerConfig({ nodeId, data }: { nodeId: string; data: any }) {
    const updateNodeData = usePipelineStore((s) => s.updateNodeData)

    return (
        <div className="space-y-4">
            <div className="space-y-1.5">
                <Label className="text-[10px] uppercase text-neutral-500 font-bold">Provider</Label>
                <Select
                    value={data.provider || 'cross-encoder'}
                    onValueChange={(val) => updateNodeData(nodeId, { provider: val })}
                >
                    <SelectTrigger className="h-8 text-xs bg-white/[0.03] border-white/[0.06] text-neutral-300">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-neutral-900 border-white/10 text-neutral-300">
                        {RERANKER_PROVIDERS.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <p className="text-[9px] text-neutral-600">
                    {RERANKER_PROVIDERS.find((p) => p.id === (data.provider || 'cross-encoder'))?.description}
                </p>
            </div>

            <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                    <Label className="text-[10px] uppercase text-neutral-500 font-bold">Top N (Candidates)</Label>
                    <span className="text-[10px] text-emerald-400 font-mono">{data.topN || 10}</span>
                </div>
                <Slider
                    value={[data.topN || 10]}
                    min={1}
                    max={50}
                    step={1}
                    onValueChange={([val]) => updateNodeData(nodeId, { topN: val })}
                    className="py-2"
                />
            </div>

            <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                    <Label className="text-[10px] uppercase text-neutral-500 font-bold">Return K (Final)</Label>
                    <span className="text-[10px] text-emerald-400 font-mono">{data.returnK || 5}</span>
                </div>
                <Slider
                    value={[data.returnK || 5]}
                    min={1}
                    max={20}
                    step={1}
                    onValueChange={([val]) => updateNodeData(nodeId, { returnK: val })}
                    className="py-2"
                />
            </div>
        </div>
    )
}

function LLMConfig({ nodeId, data }: { nodeId: string; data: any }) {
    const updateNodeData = usePipelineStore((s) => s.updateNodeData)

    return (
        <div className="space-y-4">
            <div className="space-y-1.5">
                <Label className="text-[10px] uppercase text-neutral-500 font-bold">Model</Label>
                <Select
                    value={data.model || 'gpt-4o'}
                    onValueChange={(val) => updateNodeData(nodeId, { model: val })}
                >
                    <SelectTrigger className="h-8 text-xs bg-white/[0.03] border-white/[0.06] text-neutral-300">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-neutral-900 border-white/10 text-neutral-300">
                        {LLM_MODELS.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                                <div className="flex items-center gap-2">
                                    <span>{m.label}</span>
                                    <span className="text-[9px] text-neutral-500">({m.provider})</span>
                                </div>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                    <Label className="text-[10px] uppercase text-neutral-500 font-bold">Temperature</Label>
                    <span className="text-[10px] text-orange-400 font-mono">{(data.temperature ?? 0.7).toFixed(2)}</span>
                </div>
                <Slider
                    value={[data.temperature ?? 0.7]}
                    min={0}
                    max={2}
                    step={0.05}
                    onValueChange={([val]) => updateNodeData(nodeId, { temperature: val })}
                    className="py-2"
                />
                <div className="flex justify-between text-[9px] text-neutral-600">
                    <span>Deterministic</span><span>Creative</span>
                </div>
            </div>

            <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                    <Label className="text-[10px] uppercase text-neutral-500 font-bold">Max Tokens</Label>
                    <span className="text-[10px] text-orange-400 font-mono">{data.maxTokens || 1024}</span>
                </div>
                <Slider
                    value={[data.maxTokens || 1024]}
                    min={128}
                    max={4096}
                    step={128}
                    onValueChange={([val]) => updateNodeData(nodeId, { maxTokens: val })}
                    className="py-2"
                />
            </div>

            <div className="space-y-1.5">
                <Label className="text-[10px] uppercase text-neutral-500 font-bold">System Prompt</Label>
                <textarea
                    className="w-full h-24 text-[11px] px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-neutral-300 resize-none focus:outline-none focus:ring-1 focus:ring-white/20 placeholder:text-neutral-600"
                    placeholder="You are a helpful assistant..."
                    value={data.systemPrompt || ''}
                    onChange={(e) => updateNodeData(nodeId, { systemPrompt: e.target.value })}
                />
            </div>
        </div>
    )
}

function EvaluationConfig({ nodeId, data }: { nodeId: string; data: any }) {
    const updateNodeData = usePipelineStore((s) => s.updateNodeData)
    const selectedMetrics: string[] = data.metrics || []

    const toggleMetric = (metricId: string) => {
        const updated = selectedMetrics.includes(metricId)
            ? selectedMetrics.filter((m) => m !== metricId)
            : [...selectedMetrics, metricId]
        updateNodeData(nodeId, { metrics: updated })
    }

    return (
        <div className="space-y-4">
            <div className="space-y-1.5">
                <Label className="text-[10px] uppercase text-neutral-500 font-bold">Metrics</Label>
                <p className="text-[9px] text-neutral-600 mb-2">Select metrics to evaluate pipeline output</p>
                <div className="space-y-1.5">
                    {EVAL_METRICS.map((metric) => {
                        const isSelected = selectedMetrics.includes(metric.id)
                        return (
                            <button
                                key={metric.id}
                                onClick={() => toggleMetric(metric.id)}
                                className={cn(
                                    "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition-all",
                                    isSelected
                                        ? "bg-orange-500/10 border-orange-500/30 text-orange-300"
                                        : "bg-white/[0.02] border-white/[0.06] text-neutral-400 hover:bg-white/[0.04]"
                                )}
                            >
                                <div className={cn(
                                    "w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition-all",
                                    isSelected ? "bg-orange-500 border-orange-500" : "border-neutral-600"
                                )}>
                                    {isSelected && (
                                        <svg className="w-2 h-2 text-white" viewBox="0 0 12 12" fill="none">
                                            <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    )}
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[11px] font-medium">{metric.label}</span>
                                    <span className="text-[9px] text-neutral-600">{metric.description}</span>
                                </div>
                            </button>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}

// --------------- Preview Panel ---------------

function NodePreviewPanel({ nodeId }: { nodeId: string }) {
    const previewData = usePipelineStore((s) => s.nodePreviewData[nodeId])
    const executionState = usePipelineStore((s) => s.executionState[nodeId])

    if (!previewData && executionState !== 'complete') return null;

    return (
        <div className="mt-4 pt-4 border-t border-white/[0.06]">
            <div className="flex items-center gap-2 mb-2">
                <Eye className="w-3.5 h-3.5 text-neutral-400" />
                <Label className="text-[10px] uppercase text-neutral-500 font-bold">Output Preview</Label>
            </div>
            {previewData ? (
                <div className="max-h-48 overflow-auto rounded-lg bg-white/[0.02] border border-white/[0.06] p-2">
                    <pre className="text-[10px] text-neutral-400 font-mono whitespace-pre-wrap">
                        {typeof previewData.data === 'string'
                            ? previewData.data
                            : JSON.stringify(previewData.data, null, 2)}
                    </pre>
                </div>
            ) : (
                <div className="flex items-center gap-2 py-3 text-[10px] text-neutral-500">
                    <AlertCircle className="w-3 h-3" />
                    No preview data available yet
                </div>
            )}
        </div>
    )
}

// --------------- Main Config Panel ---------------

function getConfigComponent(type: string, nodeId: string, data: any) {
    switch (type) {
        case 'document_upload': return <DocumentUploadConfig nodeId={nodeId} data={data} />
        case 'chunking': return <ChunkingConfig nodeId={nodeId} data={data} />
        case 'embedding': return <EmbeddingConfig nodeId={nodeId} data={data} />
        case 'vector_store': return <VectorStoreConfig nodeId={nodeId} data={data} />
        case 'retriever': return <RetrieverConfig nodeId={nodeId} data={data} />
        case 'reranker': return <RerankerConfig nodeId={nodeId} data={data} />
        case 'llm_generation': return <LLMConfig nodeId={nodeId} data={data} />
        case 'evaluation': return <EvaluationConfig nodeId={nodeId} data={data} />
        default: return <p className="text-[11px] text-neutral-500">No configuration available for this node type.</p>
    }
}

export function ConfigPanel() {
    const selectedNodeId = usePipelineStore((s) => s.selectedNodeId)
    const nodes = usePipelineStore((s) => s.nodes)
    const selectNode = usePipelineStore((s) => s.selectNode)

    const selectedNode = nodes.find((n) => n.id === selectedNodeId)
    const nodeDef = selectedNode ? getNodeDef(selectedNode.type || '') : undefined
    const category = (nodeDef?.category || 'processing') as NodeCategory
    const colors = CATEGORY_COLORS[category]
    const IconComponent = nodeDef ? (ICON_MAP[nodeDef.icon] || Database) : Database

    return (
        <>
            {selectedNode && nodeDef ? (
                <div
                    key={selectedNodeId}
                    className="flex flex-col h-full w-72 bg-neutral-950/80 backdrop-blur-xl border-l border-white/[0.06] animate-slide-in-left"
                >
                    {/* Header */}
                    <div className={cn("flex items-center gap-2.5 px-4 py-3 border-b border-white/[0.06]", colors.bg)}>
                        <div className={cn("p-1.5 rounded-md", colors.bg)}>
                            <IconComponent className={cn("w-4 h-4", colors.text)} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="text-xs font-semibold text-white truncate">{nodeDef.label}</h3>
                            <p className="text-[9px] text-neutral-500">{nodeDef.description}</p>
                        </div>
                        <button
                            onClick={() => selectNode(null)}
                            className="p-1 rounded hover:bg-white/10 transition-colors"
                        >
                            <X className="w-3.5 h-3.5 text-neutral-500" />
                        </button>
                    </div>

                    {/* Config Body */}
                    <ScrollArea className="flex-1">
                        <div className="p-4">
                            {getConfigComponent(selectedNode.type || '', selectedNode.id, selectedNode.data)}
                            <NodePreviewPanel nodeId={selectedNode.id} />
                        </div>
                    </ScrollArea>
                </div>
            ) : (
                <div
                    className="flex flex-col items-center justify-center h-full w-72 bg-neutral-950/80 backdrop-blur-xl border-l border-white/[0.06]"
                >
                    <div className="text-center px-6">
                        <div className="w-10 h-10 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto mb-3">
                            <Search className="w-4 h-4 text-neutral-600" />
                        </div>
                        <p className="text-[11px] text-neutral-500 font-medium">Select a node</p>
                        <p className="text-[9px] text-neutral-600 mt-1">Click on any node to configure it</p>
                    </div>
                </div>
            )}
        </>
    )
}

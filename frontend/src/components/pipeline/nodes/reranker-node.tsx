"use client"

import { BaseNode } from './base-node'
import { Layers, Zap, Info, Clock, TrendingUp } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { usePipelineStore } from '@/stores/usePipelineStore'
import { NodeProps } from 'reactflow'
import { cn } from '@/lib/utils'

const PROVIDERS = {
    cohere: {
        name: 'Cohere (Cloud)',
        models: [
            { id: 'rerank-english-v3.0', name: 'English V3', boost: '15-20%', latency: '200ms' },
            { id: 'rerank-multilingual-v3.0', name: 'Multilingual V3', boost: '15-20%', latency: '250ms' },
            { id: 'rerank-english-v2.0', name: 'English V2', boost: '10-15%', latency: '150ms' },
        ]
    },
    'cross-encoder': {
        name: 'Cross-Encoder (Local)',
        models: [
            { id: 'cross-encoder/ms-marco-MiniLM-L-12-v2', name: 'MiniLM-L-12', boost: '12-18%', latency: '100ms' },
            { id: 'cross-encoder/ms-marco-TinyBERT-L-2-v2', name: 'TinyBERT-L-2', boost: '5-10%', latency: '30ms' },
            { id: 'cross-encoder/ms-marco-electra-base', name: 'Electra-Base', boost: '18-22%', latency: '300ms' },
        ]
    },
    rrf: {
        name: 'RRF (Algorithmic)',
        models: [
            { id: 'rrf-standard', name: 'Standard RRF', boost: '5-8%', latency: '5ms' },
        ]
    }
}

export function RerankerNode({ data, selected, id }: NodeProps) {
    const updateNodeData = usePipelineStore(state => state.updateNodeData)
    const provider = data.provider || 'cohere'
    const modelId = data.model || PROVIDERS[provider as keyof typeof PROVIDERS].models[0].id
    const topN = data.top_n || 20
    const returnK = data.return_k || data.topK || 5
    const query = data.query || ''

    const updateData = (updates: any) => {
        updateNodeData(id, updates)
    }

    const currentProvider = (PROVIDERS as any)[provider]
    const currentModel = currentProvider.models.find((m: any) => m.id === modelId) || currentProvider.models[0]

    return (
        <BaseNode
            label="Reranker"
            icon={<Layers className="w-4 h-4" />}
            selected={selected}
            inputs={1}
            outputs={1}
            className="border-pink-500/50 w-64"
        >
            <div className="space-y-4 p-1">
                <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase text-neutral-500 font-bold">Provider</Label>
                    <Select
                        value={provider}
                        onValueChange={(val) => updateData({
                            provider: val,
                            model: (PROVIDERS as any)[val].models[0].id
                        })}
                    >
                        <SelectTrigger className="h-8 bg-gray-50 border-gray-200 text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-white border-gray-200 text-gray-900">
                            <SelectItem value="cohere">Cohere (Cloud)</SelectItem>
                            <SelectItem value="cross-encoder">Cross-Encoder (Local)</SelectItem>
                            <SelectItem value="rrf">RRF (Algorithmic)</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase text-neutral-500 font-bold">Model</Label>
                    <Select
                        value={modelId}
                        onValueChange={(val) => updateData({ model: val })}
                    >
                        <SelectTrigger className="h-8 bg-gray-50 border-gray-200 text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-white border-gray-200 text-gray-900">
                            {currentProvider.models.map((m: any) => (
                                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                            <Label className="text-[10px] uppercase text-neutral-500 font-bold">Top N</Label>
                            <span className="text-[10px] text-pink-400 font-mono">{topN}</span>
                        </div>
                        <Slider
                            defaultValue={[topN]}
                            max={50}
                            min={1}
                            step={1}
                            className="py-2"
                            onValueChange={([val]) => updateData({ top_n: val })}
                        />
                        <p className="text-[8px] text-neutral-600 leading-tight">Candidates to rerank</p>
                    </div>

                    <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                            <Label className="text-[10px] uppercase text-neutral-500 font-bold">Return K</Label>
                            <span className="text-[10px] text-pink-400 font-mono">{returnK}</span>
                        </div>
                        <Slider
                            defaultValue={[returnK]}
                            max={20}
                            min={1}
                            step={1}
                            className="py-2"
                            onValueChange={([val]) => updateData({ return_k: val, topK: val })}
                        />
                        <p className="text-[8px] text-neutral-600 leading-tight">Final result count</p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2 p-2 rounded bg-gray-50 border border-gray-200">
                    <div className="flex items-center gap-1.5">
                        <TrendingUp className="w-3 h-3 text-green-400" />
                        <div className="flex flex-col">
                            <span className="text-[8px] text-neutral-500 uppercase font-bold">Accuracy</span>
                            <span className="text-[10px] text-green-400 font-mono">+{currentModel.boost}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Clock className="w-3 h-3 text-blue-400" />
                        <div className="flex flex-col">
                            <span className="text-[8px] text-neutral-500 uppercase font-bold">Latency</span>
                            <span className="text-[10px] text-blue-400 font-mono">~{currentModel.latency}</span>
                        </div>
                    </div>
                </div>

                <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase text-neutral-500 font-bold">Default Query (Optional)</Label>
                    <Input
                        placeholder="Search query..."
                        value={query}
                        onChange={(e) => updateData({ query: e.target.value })}
                        className="h-8 bg-gray-50 border-gray-200 text-xs focus:ring-pink-500/30"
                    />
                    <p className="text-[9px] text-neutral-500">If empty, will use query from parent node.</p>
                </div>
            </div>
        </BaseNode>
    )
}

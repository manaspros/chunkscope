import { BrainCircuit, Info } from 'lucide-react'
import { BaseNode } from './base-node'
import { NodeProps } from 'reactflow'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { usePipelineStore } from '@/stores/usePipelineStore'

const PROVIDERS = {
    openai: {
        name: 'OpenAI (Cloud)',
        models: [
            { id: 'text-embedding-3-small', name: '3-Small (1536d)', cost: 0.02 },
            { id: 'text-embedding-3-large', name: '3-Large (3072d)', cost: 0.13 },
            { id: 'text-embedding-ada-002', name: 'Ada-002 (1536d)', cost: 0.10 },
        ]
    },
    cohere: {
        name: 'Cohere (Cloud)',
        models: [
            { id: 'embed-english-v3.0', name: 'English-V3 (1024d)', cost: 0.10 },
            { id: 'embed-multilingual-v3.0', name: 'Multilingual-V3 (1024d)', cost: 0.10 },
            { id: 'embed-english-light-v3.0', name: 'English-Light (384d)', cost: 0.10 },
        ]
    },
    local: {
        name: 'HuggingFace (Local)',
        models: [
            { id: 'all-MiniLM-L6-v2', name: 'MiniLM-L6 (384d)', cost: 0.0 },
            { id: 'BAAI/bge-large-en-v1.5', name: 'BGE-Large (1024d)', cost: 0.0 },
        ]
    }
}

export function EmbedderNode({ data, selected, id }: NodeProps) {
    const updateNodeData = usePipelineStore(state => state.updateNodeData)
    const provider = data.provider || 'openai'
    const modelId = data.model || 'text-embedding-3-small'

    // Helper to update node data
    const updateData = (updates: any) => {
        updateNodeData(id, updates)
    }

    const currentProvider = (PROVIDERS as any)[provider]
    const currentModel = currentProvider.models.find((m: any) => m.id === modelId) || currentProvider.models[0]

    return (
        <BaseNode
            label="Embedding Model"
            icon={<BrainCircuit className="w-4 h-4" />}
            selected={selected}
            inputs={1}
            outputs={1}
            className="border-purple-500/50 w-64"
        >
            <div className="space-y-4 p-1">
                <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase text-neutral-500 font-bold">Provider</Label>
                    <Select
                        value={provider}
                        onValueChange={(val) => updateData({ provider: val, model: (PROVIDERS as any)[val].models[0].id })}
                    >
                        <SelectTrigger className="h-8 bg-gray-50 border-gray-200 text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-white border-gray-200 text-gray-900">
                            <SelectItem value="openai">OpenAI</SelectItem>
                            <SelectItem value="cohere">Cohere</SelectItem>
                            <SelectItem value="local">Local (Free)</SelectItem>
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

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-200 mt-2">
                    <div className="text-[10px] text-neutral-500">
                        <span className="block font-bold text-gray-500 capitalize">Dimensions</span>
                        <span className="text-purple-400">{(currentModel as any).name.match(/\d+d/)?.[0] || '1536'}</span>
                    </div>
                    <div className="text-[10px] text-neutral-500 text-right">
                        <span className="block font-bold text-gray-500 capitalize">Cost</span>
                        <span className={provider === 'local' ? 'text-green-400' : 'text-amber-400'}>
                            {provider === 'local' ? 'FREE' : `$${currentModel.cost}/1M tok`}
                        </span>
                    </div>
                </div>

                {provider === 'local' && (
                    <div className="flex items-start gap-1.5 p-2 rounded bg-blue-500/5 border border-blue-500/10 text-[9px] text-blue-400">
                        <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        <p>Runs on your local machine. Initial run may take a moment to download weights.</p>
                    </div>
                )}
            </div>
        </BaseNode>
    )
}

"use client"

import { BaseNode } from './base-node'
import { MessageSquare } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { usePipelineStore } from '@/stores/usePipelineStore'

export function GenerationNode({ id, data, selected }: any) {
    const updateNodeData = usePipelineStore(state => state.updateNodeData)

    return (
        <BaseNode
            label={data.label || 'Generator'}
            icon={<MessageSquare className="w-4 h-4" />}
            selected={selected}
            inputs={1}
            outputs={1}
            className="border-red-900/50"
        >
            <div className="flex flex-col gap-3 min-w-[200px]">
                <div className="flex flex-col gap-1.5">
                    <Label className="text-[10px] uppercase text-neutral-500 font-bold">Model</Label>
                    <Select
                        value={data.model || "gpt-4o"}
                        onValueChange={(val) => updateNodeData(id, { model: val })}
                    >
                        <SelectTrigger className="h-8 bg-gray-50 border-gray-200 text-xs focus:ring-0">
                            <SelectValue placeholder="Model" />
                        </SelectTrigger>
                        <SelectContent className="bg-white border-gray-200 text-gray-900 text-xs">
                            <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                            <SelectItem value="claude-3-5">Claude 3.5 Sonnet</SelectItem>
                            <SelectItem value="llama-3">Llama 3 (Groq)</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                    <Label className="text-[10px] uppercase text-neutral-500 font-bold">System Prompt</Label>
                    <textarea
                        className="text-[11px] px-2 py-1.5 rounded bg-gray-50 border border-gray-200 text-gray-700 min-h-[60px] resize-none focus:outline-none focus:border-gray-300"
                        placeholder="You are a helpful assistant..."
                        value={data.systemPrompt || "You are a helpful assistant. Use the context provided to answer the user's question."}
                        onChange={(e) => updateNodeData(id, { systemPrompt: e.target.value })}
                    />
                </div>
            </div>
        </BaseNode>
    )
}

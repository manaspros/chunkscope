"use client"

import { BaseNode } from './base-node'
import { Database } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'

export function StorageNode({ data, selected }: any) {
    return (
        <BaseNode
            label={data.label || 'Storage'}
            icon={<Database className="w-4 h-4" />}
            selected={selected}
            inputs={1}
            outputs={1}
            className="border-green-900/50"
        >
            <div className="flex flex-col gap-3 min-w-[160px]">
                <div className="flex flex-col gap-1.5">
                    <Label className="text-[10px] uppercase text-neutral-500 font-bold">Provider</Label>
                    <Select defaultValue="chroma">
                        <SelectTrigger className="h-8 bg-gray-50 border-gray-200 text-xs">
                            <SelectValue placeholder="Select provider" />
                        </SelectTrigger>
                        <SelectContent className="bg-white border-gray-200 text-gray-900 text-xs">
                            <SelectItem value="chroma">ChromaDB</SelectItem>
                            <SelectItem value="pinecone">Pinecone</SelectItem>
                            <SelectItem value="weaviate">Weaviate</SelectItem>
                            <SelectItem value="postgres">PostgreSQL</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                    <Label className="text-[10px] uppercase text-neutral-500 font-bold">Collection</Label>
                    <div className="text-[11px] px-2 py-1.5 rounded bg-gray-50 border border-gray-200 text-gray-500">
                        default_collection
                    </div>
                </div>
            </div>
        </BaseNode>
    )
}

"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Scissors, Eye } from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from "@/components/ui/dialog"
import { ChunkingPreview } from "@/components/preview/chunking-preview"
import { usePipelineStore } from '@/stores/usePipelineStore'
import { BaseNode } from './base-node'
import { NodeProps } from 'reactflow'

export function SplitterNode({ id, data, selected }: NodeProps) {
    const updateNodeData = usePipelineStore((state) => state.updateNodeData)

    const handleConfigChange = (newConfig: any) => {
        updateNodeData(id, {
            ...data,
            ...newConfig
        })
    }

    return (
        <BaseNode
            label="Text Splitter"
            icon={<Scissors className="w-4 h-4" />}
            selected={selected}
            inputs={1}
            outputs={1}
            className="border-emerald-500/50 w-64"
        >
            <div className="space-y-4">
                <div className="absolute top-2 right-2">
                    <Dialog>
                        <DialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-emerald-400 hover:bg-emerald-500/10 rounded-full">
                                <Eye size={12} />
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl bg-white border-gray-200 shadow-2xl">
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2 text-emerald-400">
                                    <Scissors className="w-5 h-5" />
                                    Real-Time Chunking Preview
                                </DialogTitle>
                            </DialogHeader>
                            <ChunkingPreview
                                config={{
                                    method: data.method || 'recursive',
                                    chunkSize: data.chunkSize || 512,
                                    overlap: data.overlap || 50,
                                    threshold: data.threshold || 0.5,
                                    windowSize: data.windowSize || 1
                                }}
                                onConfigChange={handleConfigChange}
                            />
                        </DialogContent>
                    </Dialog>
                </div>

                <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase font-bold text-neutral-500">Method</Label>
                    <Select
                        value={data.method || 'recursive'}
                        onValueChange={(value) => updateNodeData(id, { method: value })}
                    >
                        <SelectTrigger className="h-8 text-xs bg-gray-50 border-gray-200 text-gray-700 focus:ring-emerald-500/30">
                            <SelectValue placeholder="Select method" />
                        </SelectTrigger>
                        <SelectContent className="bg-white border-gray-200 text-gray-700">
                            <SelectItem value="fixed">Fixed Size</SelectItem>
                            <SelectItem value="recursive">Recursive</SelectItem>
                            <SelectItem value="sentence">Sentence</SelectItem>
                            <SelectItem value="paragraph">Paragraph</SelectItem>
                            <SelectItem value="semantic">Semantic (Pro)</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase font-bold text-neutral-500">
                            {data.method === 'sentence_window' ? 'Window' : 'Size'}
                        </Label>
                        <Input
                            type="number"
                            className="h-8 text-xs bg-gray-50 border-gray-200 text-gray-700 focus:ring-emerald-500/30"
                            value={data.windowSize || data.chunkSize || 512}
                            onChange={(e) => {
                                const val = parseInt(e.target.value) || 0
                                updateNodeData(id, {
                                    windowSize: val,
                                    chunkSize: val
                                })
                            }}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase font-bold text-neutral-500">Overlap</Label>
                        <Input
                            type="number"
                            className="h-8 text-xs bg-gray-50 border-gray-200 text-gray-700 focus:ring-emerald-500/30"
                            value={data.overlap || 0}
                            onChange={(e) => updateNodeData(id, { overlap: parseInt(e.target.value) || 0 })}
                        />
                    </div>
                </div>
            </div>
        </BaseNode>
    )
}


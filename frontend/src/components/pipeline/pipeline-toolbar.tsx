"use client"

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
    FileText, Scissors, BrainCircuit, Play, Save, Trash2,
    Database, Search, Sparkles, MessageSquare, ShieldCheck,
    Globe, Server, Layers, Zap, Undo2, Redo2
} from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { usePipelineStore } from '@/stores/usePipelineStore'

interface NodeCategory {
    name: string
    items: {
        type: string
        label: string
        icon: React.ReactNode
        color: string
    }[]
}

const CATEGORIES: NodeCategory[] = [
    {
        name: "Data Sources",
        items: [
            { type: "loader", label: "PDF Loader", icon: <FileText className="w-4 h-4" />, color: "text-blue-400" },
            { type: "scraper", label: "URL Scraper", icon: <Globe className="w-4 h-4" />, color: "text-blue-400" },
            { type: "api_connector", label: "API Connector", icon: <Server className="w-4 h-4" />, color: "text-blue-400" },
        ]
    },
    {
        name: "Processing",
        items: [
            { type: "splitter", label: "Text Splitter", icon: <Scissors className="w-4 h-4" />, color: "text-amber-400" },
            { type: "embedder", label: "Embedding", icon: <BrainCircuit className="w-4 h-4" />, color: "text-purple-400" },
            { type: "metadata", label: "Metadata", icon: <Layers className="w-4 h-4" />, color: "text-amber-400" },
        ]
    },
    {
        name: "Storage",
        items: [
            { type: "vector_db", label: "Vector DB", icon: <Database className="w-4 h-4" />, color: "text-green-400" },
            { type: "postgres", label: "PostgreSQL", icon: <Database className="w-4 h-4" />, color: "text-indigo-400" },
        ]
    },
    {
        name: "Retrieval",
        items: [
            { type: "search", label: "Semantic Search", icon: <Search className="w-4 h-4" />, color: "text-cyan-400" },
            { type: "hybrid", label: "Hybrid Search", icon: <Zap className="w-4 h-4" />, color: "text-cyan-400" },
        ]
    },
    {
        name: "Augmentation",
        items: [
            { type: "reranker", label: "Reranker", icon: <Layers className="w-4 h-4" />, color: "text-pink-400" },
            { type: "hyde", label: "HyDE", icon: <Sparkles className="w-4 h-4" />, color: "text-pink-400" },
        ]
    },
    {
        name: "Generation",
        items: [
            { type: "llm", label: "LLM Generator", icon: <MessageSquare className="w-4 h-4" />, color: "text-red-400" },
        ]
    },
    {
        name: "Evaluation",
        items: [
            { type: "evaluator", label: "LLM Judge", icon: <ShieldCheck className="w-4 h-4" />, color: "text-emerald-400" },
        ]
    }
]

export function PipelineToolbar() {
    const { undo, redo, history, future } = usePipelineStore()

    const onDragStart = (event: React.DragEvent, nodeType: string) => {
        event.dataTransfer.setData('application/reactflow', nodeType)
        event.dataTransfer.effectAllowed = 'move'
    }

    return (
        <Card className="flex flex-col w-56 bg-white border-gray-200 text-gray-900 shadow-lg h-[calc(100vh-8rem)]">
            <div className="p-3 border-b border-gray-200">
                <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4 flex justify-between items-center">
                    Node Library
                    <div className="flex gap-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-gray-400 hover:text-gray-900 disabled:opacity-30"
                            onClick={undo}
                            disabled={history.length === 0}
                            title="Undo"
                        >
                            <Undo2 className="w-3 button-icon" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-gray-400 hover:text-gray-900 disabled:opacity-30"
                            onClick={redo}
                            disabled={future.length === 0}
                            title="Redo"
                        >
                            <Redo2 className="w-3 button-icon" />
                        </Button>
                    </div>
                </div>

                <Button
                    size="sm"
                    className="w-full justify-start gap-2 bg-green-600 hover:bg-green-700 text-white mb-2"
                    onClick={async () => {
                        const { nodes, edges } = usePipelineStore.getState()

                        try {
                            const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
                            const response = await fetch(`${baseUrl}/api/v1/pipeline/execute`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    nodes: nodes.map(n => ({ id: n.id, type: n.type, config: n.data })),
                                    edges: edges.map(e => ({ source: e.source, target: e.target }))
                                })
                            })
                            const result = await response.json()

                            if (!response.ok) {
                                throw new Error(result.detail || 'Unknown server error')
                            }

                            console.log('Pipeline Result:', result)
                            alert(`Pipeline Executed Successfully!\n\nStatus: ${result.status}\nCheck console for details.`)
                        } catch (error: any) {
                            console.error('Pipeline failed:', error)
                            alert(`Pipeline Failed:\n${error.message}`)
                        }
                    }}
                >
                    <Play className="w-3 h-3" /> Run Pipeline
                </Button>

                <div className="flex gap-2">
                    <Button size="icon" variant="outline" className="flex-1 h-8 border-gray-200 hover:bg-gray-100 text-gray-500 hover:text-gray-900">
                        <Save className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="destructive" className="flex-1 h-8 bg-red-50 hover:bg-red-100 border-red-200 text-red-600">
                        <Trash2 className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            <ScrollArea className="flex-1 p-2">
                <div className="flex flex-col gap-4 py-2">
                    {CATEGORIES.map((cat) => (
                        <div key={cat.name} className="flex flex-col gap-1">
                            <div className="text-[10px] font-bold text-neutral-500 uppercase px-2 mb-1">
                                {cat.name}
                            </div>
                            {cat.items.map((item) => (
                                <div
                                    key={item.type}
                                    className="group flex items-center gap-2.5 p-2 rounded-md hover:bg-gray-50 cursor-grab active:cursor-grabbing text-sm border border-transparent hover:border-gray-200 transition-all"
                                    onDragStart={(event) => onDragStart(event, item.type)}
                                    draggable
                                >
                                    <div className={cn("p-1.5 rounded bg-gray-50 border border-gray-200 group-hover:border-gray-300 transition-colors", item.color)}>
                                        {item.icon}
                                    </div>
                                    <span className="text-gray-700 group-hover:text-gray-900 transition-colors">{item.label}</span>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </ScrollArea>
        </Card>
    )
}

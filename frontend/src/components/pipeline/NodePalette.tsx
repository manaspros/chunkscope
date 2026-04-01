"use client"

import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
    NODE_DEFINITIONS,
    CATEGORY_COLORS,
    CATEGORY_LABELS,
    NodeCategory,
    PipelineNodeDef,
} from '@/lib/pipeline-nodes'
import {
    FileUp, Scissors, BrainCircuit, Database, Search, ArrowUpDown,
    MessageSquare, BarChart3, SearchIcon, GripVertical,
} from 'lucide-react'

const ICON_MAP: Record<string, React.ElementType> = {
    FileUp, Scissors, BrainCircuit, Database, Search, ArrowUpDown,
    MessageSquare, BarChart3,
}

const CATEGORIES: NodeCategory[] = ['source', 'processing', 'retrieval', 'output']

interface NodePaletteItemProps {
    nodeDef: PipelineNodeDef
    onDragStart: (event: React.DragEvent, nodeType: string) => void
}

function NodePaletteItem({ nodeDef, onDragStart }: NodePaletteItemProps) {
    const colors = CATEGORY_COLORS[nodeDef.category]
    const IconComponent = ICON_MAP[nodeDef.icon] || Database

    return (
        <div
            className={cn(
                "group flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-grab active:cursor-grabbing",
                "border border-transparent transition-all duration-150",
                "hover:bg-white/[0.04] hover:border-white/10",
                "active:scale-[0.97] active:bg-white/[0.06]"
            )}
            onDragStart={(e) => onDragStart(e, nodeDef.type)}
            draggable
        >
            <GripVertical className="w-3 h-3 text-neutral-700 group-hover:text-neutral-500 transition-colors flex-shrink-0" />
            <div className={cn("p-1.5 rounded-md border border-white/5 group-hover:border-white/10 transition-colors", colors.bg)}>
                <IconComponent className={cn("w-3.5 h-3.5", colors.text)} />
            </div>
            <div className="flex flex-col min-w-0">
                <span className="text-[11px] font-medium text-neutral-300 group-hover:text-white transition-colors truncate">
                    {nodeDef.label}
                </span>
                <span className="text-[9px] text-neutral-600 group-hover:text-neutral-500 truncate transition-colors">
                    {nodeDef.description}
                </span>
            </div>
        </div>
    )
}

export function NodePalette() {
    const [search, setSearch] = useState('')

    const onDragStart = useCallback((event: React.DragEvent, nodeType: string) => {
        event.dataTransfer.setData('application/reactflow', nodeType)
        event.dataTransfer.effectAllowed = 'move'
    }, [])

    const filteredNodes = search
        ? NODE_DEFINITIONS.filter(
            (n) =>
                n.label.toLowerCase().includes(search.toLowerCase()) ||
                n.description.toLowerCase().includes(search.toLowerCase())
        )
        : NODE_DEFINITIONS

    return (
        <div className="flex flex-col h-full w-60 bg-neutral-950/80 backdrop-blur-xl border-r border-white/[0.06]">
            {/* Header */}
            <div className="px-3 pt-3 pb-2 border-b border-white/[0.06]">
                <h2 className="text-[10px] font-bold text-neutral-500 uppercase tracking-[0.15em] mb-2.5">
                    Node Palette
                </h2>
                <div className="relative">
                    <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-600" />
                    <Input
                        placeholder="Search nodes..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="h-7 pl-8 text-[11px] bg-white/[0.03] border-white/[0.06] text-neutral-300 placeholder:text-neutral-600 focus:ring-1 focus:ring-white/10 focus:border-white/10"
                    />
                </div>
            </div>

            {/* Node List */}
            <ScrollArea className="flex-1">
                <div className="p-2 flex flex-col gap-3">
                    {CATEGORIES.map((category) => {
                        const categoryNodes = filteredNodes.filter((n) => n.category === category)
                        if (categoryNodes.length === 0) return null

                        const colors = CATEGORY_COLORS[category]

                        return (
                            <div key={category}>
                                <div className="flex items-center gap-2 px-2 mb-1">
                                    <div className={cn("w-1.5 h-1.5 rounded-full", colors.accent)} />
                                    <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-neutral-500">
                                        {CATEGORY_LABELS[category]}
                                    </span>
                                </div>
                                <div className="flex flex-col gap-0.5">
                                    {categoryNodes.map((nodeDef) => (
                                        <NodePaletteItem
                                            key={nodeDef.type}
                                            nodeDef={nodeDef}
                                            onDragStart={onDragStart}
                                        />
                                    ))}
                                </div>
                            </div>
                        )
                    })}
                    {filteredNodes.length === 0 && (
                        <div className="py-8 text-center text-[11px] text-neutral-600">
                            No matching nodes
                        </div>
                    )}
                </div>
            </ScrollArea>
        </div>
    )
}

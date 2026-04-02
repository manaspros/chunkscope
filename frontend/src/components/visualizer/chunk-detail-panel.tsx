"use client"

import { X, Copy, Check, FileText, Hash, Layout } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Chunk } from '@/stores/useChunkStore'

interface ChunkDetailPanelProps {
    chunk: Chunk | null
    onClose: () => void
}

export function ChunkDetailPanel({ chunk, onClose }: ChunkDetailPanelProps) {
    const [copied, setCopied] = useState(false)

    if (!chunk) return null;

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(chunk.text)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch (err) {
            console.error('Failed to copy text:', err)
        }
    }

    return (
        <div
            className="fixed right-0 top-16 bottom-0 w-96 bg-neutral-900/95 border-l border-white/10 shadow-2xl z-40 backdrop-blur-xl animate-slide-in-right"
            aria-labelledby="chunk-detail-title"
            role="dialog"
        >
            <div className="flex flex-col h-full">
                {/* Header */}
                <div className="p-4 border-b border-white/10 flex items-center justify-between bg-black/20">
                    <div className="flex items-center gap-2">
                        <Layout className="w-4 h-4 text-emerald-400" />
                        <h3 id="chunk-detail-title" className="text-sm font-semibold text-white">Chunk Inspector</h3>
                    </div>
                    <Button
                        size="icon"
                        variant="ghost"
                        onClick={onClose}
                        className="h-8 w-8 text-neutral-400 hover:text-white hover:bg-white/10"
                        aria-label="Close panel"
                    >
                        <X className="w-4 h-4" />
                    </Button>
                </div>

                {/* Content */}
                <ScrollArea className="flex-1 p-6">
                    <div className="space-y-6">

                        {/* Metadata Grid */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 rounded-lg bg-white/5 border border-white/5 space-y-1">
                                <div className="flex items-center gap-2 text-xs text-neutral-400">
                                    <Hash className="w-3 h-3" /> Token Count
                                </div>
                                <div className="text-xl font-mono text-white">{chunk.metadata.token_count}</div>
                            </div>
                            <div className="p-3 rounded-lg bg-white/5 border border-white/5 space-y-1">
                                <div className="flex items-center gap-2 text-xs text-neutral-400">
                                    <FileText className="w-3 h-3" /> Char Count
                                </div>
                                <div className="text-xl font-mono text-white">{chunk.metadata.char_count}</div>
                            </div>
                        </div>

                        {/* Chunk ID */}
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Chunk ID</label>
                            <div className="font-mono text-xs text-neutral-300 bg-black/40 p-2 rounded border border-white/5 break-all select-all">
                                {chunk.id}
                            </div>
                        </div>

                        <Separator className="bg-white/10" />

                        {/* Text Content */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Content</label>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={handleCopy}
                                    className="h-6 px-2 text-xs hover:bg-emerald-500/10 hover:text-emerald-400"
                                >
                                    {copied ? (
                                        <span className="flex items-center gap-1"><Check className="w-3 h-3" /> Copied</span>
                                    ) : (
                                        <span className="flex items-center gap-1"><Copy className="w-3 h-3" /> Copy Text</span>
                                    )}
                                </Button>
                            </div>
                            <div className="p-4 rounded-lg bg-neutral-950 border border-white/10 text-sm leading-relaxed text-neutral-200 font-sans whitespace-pre-wrap shadow-inner min-h-[200px]">
                                {chunk.text}
                            </div>
                        </div>

                        {/* Geometry Info */}
                        {chunk.bbox && (
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Coordinate Geometry</label>
                                <div className="grid grid-cols-2 gap-2 text-xs font-mono text-neutral-400">
                                    <div className="bg-black/20 p-2 rounded">X: {chunk.bbox.x?.toFixed(2)}</div>
                                    <div className="bg-black/20 p-2 rounded">Y: {chunk.bbox.y?.toFixed(2)}</div>
                                    <div className="bg-black/20 p-2 rounded">W: {chunk.bbox.width?.toFixed(2)}</div>
                                    <div className="bg-black/20 p-2 rounded">H: {chunk.bbox.height?.toFixed(2)}</div>
                                    <div className="col-span-2 bg-black/20 p-2 rounded text-center">Page: {chunk.bbox.page}</div>
                                </div>
                            </div>
                        )}

                    </div>
                </ScrollArea>
            </div>
        </div>
    )
}

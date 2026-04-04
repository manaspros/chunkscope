"use client"

import { cn } from '@/lib/utils'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip'
import { Sparkles, Info } from 'lucide-react'

interface SmartDefaultBadgeProps {
    type: 'auto' | 'recommended'
    reason: string
    className?: string
}

const BADGE_STYLES = {
    auto: {
        bg: 'bg-blue-50 hover:bg-blue-100',
        border: 'border-blue-200',
        text: 'text-blue-600',
        label: 'Auto',
    },
    recommended: {
        bg: 'bg-emerald-50 hover:bg-emerald-100',
        border: 'border-emerald-200',
        text: 'text-emerald-600',
        label: 'Recommended',
    },
} as const

export function SmartDefaultBadge({ type, reason, className }: SmartDefaultBadgeProps) {
    const style = BADGE_STYLES[type]

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <span
                        className={cn(
                            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-semibold uppercase tracking-wider border cursor-help transition-colors",
                            style.bg, style.border, style.text,
                            className
                        )}
                    >
                        {type === 'auto' ? (
                            <Sparkles className="w-2.5 h-2.5" />
                        ) : (
                            <Info className="w-2.5 h-2.5" />
                        )}
                        {style.label}
                    </span>
                </TooltipTrigger>
                <TooltipContent
                    side="top"
                    className="max-w-xs text-xs bg-white border-gray-200 text-gray-600 shadow-lg"
                >
                    {reason}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}

// Pre-built reasons for common defaults
export const SMART_DEFAULTS: Record<string, { type: 'auto' | 'recommended'; reason: string }> = {
    'chunking.recursive': {
        type: 'recommended',
        reason: 'Recursive chunking -- best general-purpose method for mixed document types. It splits text using a hierarchy of separators for clean boundaries.',
    },
    'chunking.chunkSize.500': {
        type: 'recommended',
        reason: '500 tokens is the sweet spot for most RAG use cases -- large enough for context, small enough for precise retrieval.',
    },
    'chunking.overlap.50': {
        type: 'auto',
        reason: '10% overlap prevents losing context at chunk boundaries while keeping storage efficient.',
    },
    'embedding.openai.text-embedding-3-small': {
        type: 'recommended',
        reason: 'Best cost-to-quality ratio among embedding models. Good accuracy at $0.02/1M tokens.',
    },
    'retriever.dense': {
        type: 'auto',
        reason: 'Dense (vector) retrieval is the default semantic search method. Switch to hybrid if keyword matching is also important.',
    },
    'retriever.topK.5': {
        type: 'recommended',
        reason: 'Top 5 chunks typically provides enough context without overwhelming the LLM or inflating costs.',
    },
    'llm.gpt-4o': {
        type: 'recommended',
        reason: 'GPT-4o provides the best balance of quality, speed, and cost for RAG generation tasks.',
    },
    'llm.temperature.0.7': {
        type: 'auto',
        reason: 'Temperature 0.7 gives natural-sounding answers while staying grounded. Lower for factual, higher for creative.',
    },
    'reranker.cross-encoder': {
        type: 'recommended',
        reason: 'Local cross-encoder rerankers provide excellent relevance scoring with zero API cost.',
    },
    'vectorStore.pgvector': {
        type: 'auto',
        reason: 'pgvector is built into PostgreSQL -- no extra infrastructure needed. Great for getting started.',
    },
    'vectorStore.hnsw': {
        type: 'recommended',
        reason: 'HNSW indexing gives the best speed/recall tradeoff for most vector search workloads.',
    },
}

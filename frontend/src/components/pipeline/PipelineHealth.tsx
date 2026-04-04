"use client"

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { usePipelineStore } from '@/stores/usePipelineStore'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip'

type HealthLevel = 'green' | 'yellow' | 'red'

interface HealthCheck {
    level: HealthLevel
    message: string
}

function checkPipelineHealth(
    nodes: { id: string; type?: string; data?: any }[],
    edges: { source: string; target: string }[]
): HealthCheck[] {
    const checks: HealthCheck[] = []
    const nodeTypes = new Set(nodes.map((n) => n.type))

    if (nodes.length === 0) {
        return [{ level: 'red', message: 'Pipeline is empty -- add nodes to get started' }]
    }

    // Check for minimum viable pipeline
    const hasDocument = nodeTypes.has('document_upload')
    const hasChunking = nodeTypes.has('chunking')
    const hasEmbedding = nodeTypes.has('embedding')
    const hasRetriever = nodeTypes.has('retriever')
    const hasLLM = nodeTypes.has('llm_generation')
    const hasReranker = nodeTypes.has('reranker')
    const hasEvaluation = nodeTypes.has('evaluation')

    if (!hasDocument) {
        checks.push({ level: 'red', message: 'No document source node -- add a Document Upload node' })
    }
    if (!hasChunking) {
        checks.push({ level: 'red', message: 'No chunking node -- documents need to be split into chunks' })
    }
    if (!hasEmbedding) {
        checks.push({ level: 'red', message: 'No embedding node -- chunks need to be embedded for retrieval' })
    }
    if (!hasRetriever) {
        checks.push({ level: 'red', message: 'No retriever node -- add a retriever to search embedded chunks' })
    }
    if (!hasLLM) {
        checks.push({ level: 'yellow', message: 'No LLM generation node -- add one to generate answers from retrieved chunks' })
    }

    // Check connectivity: embedding should connect to retriever (via vector_store or directly)
    if (hasEmbedding && hasRetriever) {
        const embeddingNodes = nodes.filter((n) => n.type === 'embedding')
        const retrieverNodes = nodes.filter((n) => n.type === 'retriever')

        // Check if there's a path from any embedding to any retriever
        const hasPathToRetriever = embeddingNodes.some((emb) => {
            const visited = new Set<string>()
            const queue = [emb.id]
            while (queue.length > 0) {
                const current = queue.shift()!
                if (visited.has(current)) continue
                visited.add(current)
                if (retrieverNodes.some((r) => r.id === current)) return true
                edges.filter((e) => e.source === current).forEach((e) => queue.push(e.target))
            }
            return false
        })

        if (!hasPathToRetriever) {
            checks.push({ level: 'red', message: 'Embedding node is not connected to retriever -- connect them via a vector store' })
        }
    }

    // Recommendations
    if (!hasReranker) {
        checks.push({ level: 'yellow', message: 'No reranker configured -- results may include irrelevant chunks' })
    }

    if (!hasEvaluation) {
        checks.push({ level: 'yellow', message: 'No evaluation node -- add one to measure pipeline quality' })
    }

    // Check chunk size
    const chunkingNodes = nodes.filter((n) => n.type === 'chunking')
    for (const node of chunkingNodes) {
        if (node.data?.chunkSize && node.data.chunkSize > 2000) {
            checks.push({ level: 'yellow', message: `Chunk size ${node.data.chunkSize} is large -- consider 300-1000 for most use cases` })
        }
    }

    // If no issues found, pipeline is healthy
    if (checks.length === 0) {
        checks.push({ level: 'green', message: 'Pipeline looks good' })
    }

    return checks
}

function getOverallLevel(checks: HealthCheck[]): HealthLevel {
    if (checks.some((c) => c.level === 'red')) return 'red'
    if (checks.some((c) => c.level === 'yellow')) return 'yellow'
    return 'green'
}

const DOT_COLORS: Record<HealthLevel, string> = {
    green: 'bg-emerald-500',
    yellow: 'bg-amber-500',
    red: 'bg-red-500',
}

const PULSE_COLORS: Record<HealthLevel, string> = {
    green: 'bg-emerald-500/50',
    yellow: 'bg-amber-500/50',
    red: 'bg-red-500/50',
}

const CHECK_ICONS: Record<HealthLevel, string> = {
    green: 'text-emerald-400',
    yellow: 'text-amber-400',
    red: 'text-red-400',
}

export function PipelineHealth() {
    const nodes = usePipelineStore((s) => s.nodes)
    const edges = usePipelineStore((s) => s.edges)

    const checks = useMemo(
        () => checkPipelineHealth(nodes, edges),
        [nodes, edges]
    )
    const level = useMemo(() => getOverallLevel(checks), [checks])

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <button className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-gray-100 transition-colors">
                        <span className="relative flex h-2 w-2">
                            <span className={cn(
                                "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
                                PULSE_COLORS[level]
                            )} />
                            <span className={cn(
                                "relative inline-flex rounded-full h-2 w-2",
                                DOT_COLORS[level]
                            )} />
                        </span>
                        <span className="text-[9px] text-gray-500 font-medium">
                            {level === 'green' ? 'Healthy' : level === 'yellow' ? 'Warnings' : 'Issues'}
                        </span>
                    </button>
                </TooltipTrigger>
                <TooltipContent
                    side="bottom"
                    align="start"
                    className="max-w-xs p-0 bg-white border-gray-200 shadow-lg overflow-hidden"
                >
                    <div className="px-3 py-2 border-b border-gray-100">
                        <span className="text-[10px] font-bold text-gray-500 uppercase">Pipeline Health</span>
                    </div>
                    <div className="px-3 py-2 space-y-1.5 max-h-48 overflow-auto">
                        {checks.map((check, i) => (
                            <div key={i} className="flex items-start gap-2">
                                <span className={cn(
                                    "w-1.5 h-1.5 rounded-full mt-1 shrink-0",
                                    DOT_COLORS[check.level]
                                )} />
                                <span className={cn(
                                    "text-[10px] leading-relaxed text-gray-600",
                                )}>
                                    {check.message}
                                </span>
                            </div>
                        ))}
                    </div>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}

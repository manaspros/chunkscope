"use client"

import { cn } from '@/lib/utils'
import { AlertTriangle, HelpCircle, Wrench, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface DiagnosticInfo {
    what: string
    why: string
    fix: string
    canAutoFix: boolean
    fixAction?: () => void
}

interface ErrorDiagnosticProps {
    diagnostic: DiagnosticInfo
    className?: string
    compact?: boolean
}

export function diagnoseError(error: string, result?: any): DiagnosticInfo {
    const errorLower = error.toLowerCase()

    // 0 chunks retrieved
    if (errorLower.includes('0 chunk') || errorLower.includes('no chunks') || errorLower.includes('empty result')) {
        return {
            what: 'No chunks were retrieved for this query',
            why: 'The retriever could not find any relevant chunks in the vector store. This usually means the chunk size is too large, the embedding model is not capturing the query semantics, or the documents have not been ingested yet.',
            fix: 'Try reducing chunk size (300-500), switching to hybrid retrieval, or verifying that documents have been uploaded and embedded.',
            canAutoFix: false,
        }
    }

    // Low relevance scores
    if (errorLower.includes('low_relevance') || errorLower.includes('low relevance') || errorLower.includes('irrelevant')) {
        return {
            what: 'Retrieved chunks have low relevance scores',
            why: 'The retrieved chunks do not closely match the query. This can happen when the embedding model is not well-suited for the domain, or when a reranker is not present to filter out noise.',
            fix: 'Add a reranker node to re-score results, try a different embedding model, or increase top_k to give the reranker more candidates.',
            canAutoFix: false,
        }
    }

    // High latency
    if (errorLower.includes('high latency') || errorLower.includes('timeout') || errorLower.includes('timed out') || errorLower.includes('slow')) {
        return {
            what: 'Query took too long to complete',
            why: 'High latency is usually caused by large top_k values, slow embedding models, or expensive LLM generation. If using a reranker, it adds latency proportional to the number of candidates.',
            fix: 'Try a cascade reranker (fast BM25 first, then cross-encoder), reduce top_k, or use a faster LLM model like GPT-4o Mini.',
            canAutoFix: false,
        }
    }

    // API errors
    if (errorLower.includes('api') || errorLower.includes('401') || errorLower.includes('403') || errorLower.includes('key') || errorLower.includes('unauthorized') || errorLower.includes('authentication')) {
        return {
            what: 'API authentication error',
            why: 'The API key is missing, expired, or does not have the required permissions. This commonly affects embedding and LLM generation nodes.',
            fix: 'Check your API keys in the environment configuration. Make sure OPENAI_API_KEY (or the relevant provider key) is set correctly.',
            canAutoFix: false,
        }
    }

    // Rate limit
    if (errorLower.includes('rate limit') || errorLower.includes('429') || errorLower.includes('too many requests')) {
        return {
            what: 'Rate limit exceeded',
            why: 'Too many requests were sent to the API in a short time. This is common during batch operations or rapid testing.',
            fix: 'Wait a moment and retry. For batch operations, consider adding delays between requests or using a local embedding model.',
            canAutoFix: false,
        }
    }

    // Network errors
    if (errorLower.includes('network') || errorLower.includes('econnrefused') || errorLower.includes('fetch failed') || errorLower.includes('connection')) {
        return {
            what: 'Cannot connect to the backend API',
            why: 'The backend server at the configured API URL is not responding. It may not be running or the URL may be incorrect.',
            fix: 'Verify the backend is running (usually at localhost:8000) and the NEXT_PUBLIC_API_URL environment variable is correct.',
            canAutoFix: false,
        }
    }

    // Generic 500 errors
    if (errorLower.includes('500') || errorLower.includes('internal server')) {
        return {
            what: 'Internal server error',
            why: 'The backend encountered an unexpected error while processing the request. Check the backend logs for more details.',
            fix: 'Check the backend logs for the full stack trace. Common causes: missing dependencies, database connection issues, or invalid pipeline configuration.',
            canAutoFix: false,
        }
    }

    // Default fallback
    return {
        what: 'An error occurred',
        why: error,
        fix: 'Check the error details above and try adjusting your pipeline configuration. If the issue persists, check the backend logs.',
        canAutoFix: false,
    }
}

export function ErrorDiagnostic({ diagnostic, className, compact = false }: ErrorDiagnosticProps) {
    return (
        <div className={cn(
            "rounded-lg border overflow-hidden",
            "border-red-500/20 bg-red-500/5",
            className
        )}>
            {/* What happened */}
            <div className={cn("px-3 py-2 border-b border-red-500/10", compact && "py-1.5")}>
                <div className="flex items-center gap-2">
                    <AlertTriangle className={cn("shrink-0 text-red-400", compact ? "w-3 h-3" : "w-3.5 h-3.5")} />
                    <span className={cn("font-semibold text-red-300", compact ? "text-[10px]" : "text-[11px]")}>
                        {diagnostic.what}
                    </span>
                </div>
            </div>

            {/* Why it happened */}
            <div className={cn("px-3 py-2 border-b border-red-500/10 bg-red-500/[0.02]", compact && "py-1.5")}>
                <div className="flex items-start gap-2">
                    <HelpCircle className={cn("shrink-0 text-gray-500 mt-0.5", compact ? "w-3 h-3" : "w-3.5 h-3.5")} />
                    <p className={cn("text-gray-500 leading-relaxed", compact ? "text-[9px]" : "text-[10px]")}>
                        {diagnostic.why}
                    </p>
                </div>
            </div>

            {/* How to fix */}
            <div className={cn("px-3 py-2", compact && "py-1.5")}>
                <div className="flex items-start gap-2">
                    <Wrench className={cn("shrink-0 text-amber-400 mt-0.5", compact ? "w-3 h-3" : "w-3.5 h-3.5")} />
                    <div className="flex-1">
                        <p className={cn("text-gray-700 leading-relaxed", compact ? "text-[9px]" : "text-[10px]")}>
                            {diagnostic.fix}
                        </p>
                        {diagnostic.canAutoFix && diagnostic.fixAction && (
                            <Button
                                size="sm"
                                variant="outline"
                                className="mt-2 h-6 px-2.5 text-[9px] border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
                                onClick={diagnostic.fixAction}
                            >
                                <ChevronRight className="w-3 h-3 mr-1" />
                                Apply Fix
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

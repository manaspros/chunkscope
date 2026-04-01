"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp, MessageSquare } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

interface ExplanationPanelProps {
    explanation: string | null
    isLoading: boolean
}

function renderMarkdownLike(text: string) {
    // Simple markdown-like rendering without a markdown library
    const lines = text.split("\n")
    const elements: React.ReactNode[] = []

    lines.forEach((line, i) => {
        const trimmed = line.trim()

        if (trimmed.startsWith("### ")) {
            elements.push(
                <h4 key={i} className="text-sm font-bold text-white mt-3 mb-1">
                    {trimmed.slice(4)}
                </h4>
            )
        } else if (trimmed.startsWith("## ")) {
            elements.push(
                <h3 key={i} className="text-base font-bold text-white mt-4 mb-1">
                    {trimmed.slice(3)}
                </h3>
            )
        } else if (trimmed.startsWith("# ")) {
            elements.push(
                <h2 key={i} className="text-lg font-bold text-white mt-4 mb-2">
                    {trimmed.slice(2)}
                </h2>
            )
        } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
            elements.push(
                <li key={i} className="text-sm text-zinc-300 ml-4 list-disc">
                    {renderInline(trimmed.slice(2))}
                </li>
            )
        } else if (trimmed === "") {
            elements.push(<div key={i} className="h-2" />)
        } else {
            elements.push(
                <p key={i} className="text-sm text-zinc-300 leading-relaxed">
                    {renderInline(trimmed)}
                </p>
            )
        }
    })

    return elements
}

function renderInline(text: string) {
    // Handle **bold** and `code`
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/)
    return parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
            return (
                <strong key={i} className="text-white font-semibold">
                    {part.slice(2, -2)}
                </strong>
            )
        }
        if (part.startsWith("`") && part.endsWith("`")) {
            return (
                <code
                    key={i}
                    className="px-1.5 py-0.5 bg-zinc-800 rounded text-amber-400 text-xs font-mono"
                >
                    {part.slice(1, -1)}
                </code>
            )
        }
        return part
    })
}

export function ExplanationPanel({ explanation, isLoading }: ExplanationPanelProps) {
    const [isExpanded, setIsExpanded] = useState(true)

    if (isLoading) {
        return (
            <Card className="border-white/5 bg-zinc-900/50 backdrop-blur-sm">
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                        <Skeleton className="h-4 w-4 rounded" />
                        <Skeleton className="h-5 w-36" />
                    </div>
                </CardHeader>
                <CardContent className="space-y-3">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-4 w-4/6" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                </CardContent>
            </Card>
        )
    }

    if (!explanation) return null

    const explanationText = typeof explanation === "string" ? explanation : JSON.stringify(explanation)

    return (
        <Card className="border-white/5 bg-zinc-900/50 backdrop-blur-sm">
            <CardHeader className="pb-3">
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="flex items-center justify-between w-full group"
                >
                    <div className="flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-amber-500" />
                        <CardTitle className="text-sm font-bold uppercase tracking-wider">
                            AI Explanation
                        </CardTitle>
                    </div>
                    {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-zinc-500 group-hover:text-white transition-colors" />
                    ) : (
                        <ChevronDown className="w-4 h-4 text-zinc-500 group-hover:text-white transition-colors" />
                    )}
                </button>
            </CardHeader>
            <div
                className={cn(
                    "overflow-hidden transition-all duration-300",
                    isExpanded ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
                )}
            >
                <CardContent className="pt-0">
                    <div className="prose prose-invert prose-sm max-w-none">
                        {renderMarkdownLike(explanationText)}
                    </div>
                </CardContent>
            </div>
        </Card>
    )
}

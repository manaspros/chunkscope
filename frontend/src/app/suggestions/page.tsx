"use client"

import Link from "next/link"
import { ArrowLeft, Sparkles } from "lucide-react"
import { Navbar } from "@/components/layout/Navbar"
import { DocumentInput } from "@/components/suggestions/DocumentInput"
import { ProfileCard } from "@/components/suggestions/ProfileCard"
import { RecommendationCard } from "@/components/suggestions/RecommendationCard"
import { ExplanationPanel } from "@/components/suggestions/ExplanationPanel"
import { EmbeddingComparison } from "@/components/suggestions/EmbeddingComparison"
import { useSuggestionStore } from "@/stores/useSuggestionStore"

export default function SuggestionsPage() {
    const {
        profile,
        recommendations,
        explanation,
        isProfilingLoading,
        isRecommendationLoading,
        isExplanationLoading,
        error,
    } = useSuggestionStore()

    const hasResults = profile || recommendations || explanation

    return (
        <div className="min-h-screen bg-background font-sans">
            <Navbar />

            <main className="container-tight max-w-5xl">
                {/* Header */}
                <div className="flex items-center gap-4 mb-8">
                    <Link
                        href="/"
                        className="p-2 rounded-lg hover:bg-white/5 transition-colors text-zinc-500 hover:text-white"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </Link>
                    <div>
                        <div className="flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-amber-500" />
                            <h1 className="text-xl font-black text-white tracking-tight">
                                AI Suggestions
                            </h1>
                        </div>
                        <p className="text-sm text-zinc-500 mt-0.5">
                            Upload a document and get intelligent chunking recommendations
                        </p>
                    </div>
                </div>

                {/* Error */}
                {error && (
                    <div className="mb-6 bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-sm text-red-400">
                        {error}
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left: Input */}
                    <div className="lg:col-span-1 space-y-6">
                        <DocumentInput />

                        {/* Embedding comparison when we have results */}
                        {recommendations?.primary && (
                            <EmbeddingComparison
                                recommendedModel={recommendations.primary.embedding_model}
                            />
                        )}
                    </div>

                    {/* Right: Results */}
                    <div className="lg:col-span-2 space-y-6">
                        {!hasResults && !isProfilingLoading && (
                            <div className="flex flex-col items-center justify-center h-64 text-center">
                                <Sparkles className="w-10 h-10 text-zinc-700 mb-4" />
                                <p className="text-zinc-500 text-sm">
                                    Paste or upload a document to get started
                                </p>
                                <p className="text-zinc-600 text-xs mt-1">
                                    The AI will analyze your content and suggest optimal chunking parameters
                                </p>
                            </div>
                        )}

                        <ProfileCard
                            profile={profile}
                            isLoading={isProfilingLoading}
                        />

                        <RecommendationCard
                            recommendations={recommendations}
                            isLoading={isRecommendationLoading}
                        />

                        <ExplanationPanel
                            explanation={explanation}
                            isLoading={isExplanationLoading}
                        />
                    </div>
                </div>
            </main>
        </div>
    )
}

"use client"

import {
    FileText,
    AlignLeft,
    Layers,
    Heading,
    Table2,
    Code2,
    List,
    AlertTriangle,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { DocumentProfile } from "@/stores/useSuggestionStore"

interface ProfileCardProps {
    profile: DocumentProfile | null
    isLoading: boolean
}

function complexityColor(complexity: string) {
    switch (complexity) {
        case "simple":
            return "bg-green-500/15 text-green-400 border-green-500/30"
        case "moderate":
            return "bg-amber-500/15 text-amber-400 border-amber-500/30"
        case "complex":
            return "bg-red-500/15 text-red-400 border-red-500/30"
        default:
            return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30"
    }
}

export function ProfileCard({ profile, isLoading }: ProfileCardProps) {
    if (isLoading) {
        return (
            <Card className="border-white/5 bg-zinc-900/50 backdrop-blur-sm">
                <CardHeader className="pb-3">
                    <Skeleton className="h-5 w-40" />
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <Skeleton key={i} className="h-16 rounded-lg" />
                        ))}
                    </div>
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-3/4" />
                </CardContent>
            </Card>
        )
    }

    if (!profile) return null

    const stats = [
        { label: "Words", value: profile.word_count, icon: FileText },
        { label: "Sentences", value: profile.sentence_count, icon: AlignLeft },
        { label: "Paragraphs", value: profile.paragraph_count, icon: Layers },
        {
            label: "Avg Sentence",
            value: `${profile.avg_sentence_length?.toFixed(1)} words`,
            icon: AlignLeft,
        },
    ]

    const structureItems = [
        { label: "Headings", value: profile.structure_elements?.headings ?? 0, icon: Heading },
        { label: "Tables", value: profile.structure_elements?.tables ?? 0, icon: Table2 },
        { label: "Code Blocks", value: profile.structure_elements?.code_blocks ?? 0, icon: Code2 },
        { label: "Lists", value: profile.structure_elements?.lists ?? 0, icon: List },
    ]

    return (
        <Card className="border-white/5 bg-zinc-900/50 backdrop-blur-sm">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-bold uppercase tracking-wider">
                        Document Profile
                    </CardTitle>
                    <div className="flex items-center gap-2">
                        <Badge
                            className={cn(
                                "text-xs capitalize",
                                complexityColor(profile.complexity)
                            )}
                        >
                            {profile.complexity}
                        </Badge>
                        <Badge variant="outline" className="text-xs capitalize">
                            {profile.doc_type}
                        </Badge>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-5">
                {/* Stats grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {stats.map((stat) => (
                        <div
                            key={stat.label}
                            className="bg-zinc-800/50 border border-white/5 rounded-lg p-3 flex flex-col gap-1"
                        >
                            <div className="flex items-center gap-1.5 text-zinc-500">
                                <stat.icon className="w-3.5 h-3.5" />
                                <span className="text-[10px] font-medium uppercase tracking-wider">
                                    {stat.label}
                                </span>
                            </div>
                            <span className="text-lg font-bold text-white">
                                {typeof stat.value === "number"
                                    ? stat.value.toLocaleString()
                                    : stat.value}
                            </span>
                        </div>
                    ))}
                </div>

                {/* Vocabulary Diversity */}
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-400 font-medium">Vocabulary Diversity</span>
                        <span className="text-white font-bold">
                            {((profile.vocabulary_diversity ?? 0) * 100).toFixed(0)}%
                        </span>
                    </div>
                    <Progress
                        value={(profile.vocabulary_diversity ?? 0) * 100}
                        className="h-2 bg-zinc-800"
                    />
                </div>

                {/* Repetition score */}
                {(profile.repetition_score ?? 0) > 0.3 && (
                    <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-400">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>
                            High repetition detected ({((profile.repetition_score ?? 0) * 100).toFixed(0)}%).
                            Consider deduplication before chunking.
                        </span>
                    </div>
                )}

                {/* Structure elements */}
                <div>
                    <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-2">
                        Structure Elements
                    </p>
                    <div className="flex flex-wrap gap-3">
                        {structureItems.map((item) => (
                            <div
                                key={item.label}
                                className="flex items-center gap-1.5 text-xs text-zinc-400"
                            >
                                <item.icon className="w-3.5 h-3.5" />
                                <span>
                                    {item.value} {item.label}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}

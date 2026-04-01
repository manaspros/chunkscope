"use client"

import Link from "next/link"
import { ArrowLeft, FlaskConical } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Navbar } from "@/components/layout/Navbar"
import { EvalRunner } from "@/components/evaluation/EvalRunner"
import { ChunkQualityView } from "@/components/evaluation/ChunkQualityView"
import { ComparisonView } from "@/components/evaluation/ComparisonView"

export default function EvaluationPage() {
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
                            <FlaskConical className="w-5 h-5 text-amber-500" />
                            <h1 className="text-xl font-black text-white tracking-tight">
                                Evaluation Dashboard
                            </h1>
                        </div>
                        <p className="text-sm text-zinc-500 mt-0.5">
                            Evaluate RAG pipeline quality, chunk metrics, and compare configurations
                        </p>
                    </div>
                </div>

                <Tabs defaultValue="evaluate" className="space-y-6">
                    <TabsList className="bg-zinc-900/80 border border-white/5">
                        <TabsTrigger value="evaluate" className="text-xs font-bold data-[state=active]:bg-amber-500/10 data-[state=active]:text-amber-400">
                            RAG Evaluation
                        </TabsTrigger>
                        <TabsTrigger value="chunk-quality" className="text-xs font-bold data-[state=active]:bg-amber-500/10 data-[state=active]:text-amber-400">
                            Chunk Quality
                        </TabsTrigger>
                        <TabsTrigger value="compare" className="text-xs font-bold data-[state=active]:bg-amber-500/10 data-[state=active]:text-amber-400">
                            Compare
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="evaluate">
                        <EvalRunner />
                    </TabsContent>

                    <TabsContent value="chunk-quality">
                        <ChunkQualityView />
                    </TabsContent>

                    <TabsContent value="compare">
                        <ComparisonView />
                    </TabsContent>
                </Tabs>
            </main>
        </div>
    )
}

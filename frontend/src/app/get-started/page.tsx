"use client"

import Link from "next/link"
import { ArrowRight, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function GetStartedPage() {
    return (
        <div className="min-h-screen bg-white text-gray-900 flex flex-col items-center justify-center p-4">
            <div className="max-w-4xl w-full text-center space-y-12">
                <div className="space-y-6">
                    <h1 className="text-5xl md:text-7xl font-bold tracking-tighter text-gray-900">
                        Ready to Optimize Your RAG?
                    </h1>
                    <p className="text-xl text-gray-500 max-w-2xl mx-auto">
                        Use ChunkScope to visualize embeddings, debug retrieval, and build better pipelines.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-left max-w-3xl mx-auto">
                    <FeatureItem title="Visualize Chunks" description="See exactly how your documents are split and embedded." />
                    <FeatureItem title="Debug Retrieval" description="Identify why relevant context is missing from your LLM prompt." />
                    <FeatureItem title="Optimize Costs" description="Find the perfect balance between chunk size and retrieval accuracy." />
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8">
                    <Link href="/dashboard">
                        <Button size="lg" className="h-14 px-8 rounded-full text-lg bg-gray-900 text-white hover:bg-gray-800 font-bold">
                            Go to Dashboard <ArrowRight className="ml-2 h-5 w-5" />
                        </Button>
                    </Link>
                    <Link href="/visualizer">
                        <Button variant="ghost" size="lg" className="h-14 px-8 rounded-full text-lg text-gray-500 hover:text-gray-900">
                            Launch Visualizer
                        </Button>
                    </Link>
                </div>
            </div>
        </div>
    )
}

function FeatureItem({ title, description }: { title: string, description: string }) {
    return (
        <div className="space-y-2">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <CheckCircle2 className="text-amber-600 h-5 w-5" /> {title}
            </h3>
            <p className="text-gray-500 text-sm leading-relaxed">{description}</p>
        </div>
    )
}

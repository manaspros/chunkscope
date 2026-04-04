"use client"

import React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useConfigStore } from "@/stores/useConfigStore"
import { analyzerApi } from "@/lib/api"
import { ArrowRight, Database, Github, Search, Eye, GitBranch, Layers, Cpu, FolderPlus } from "lucide-react"
import { Button } from "@/components/ui/button"


import { useToast } from "@/components/ui/use-toast"
import dynamic from "next/dynamic"

const AnalysisResultOverlay = dynamic(
    () => import("@/components/analysis/AnalysisResultOverlay").then(mod => ({ default: mod.AnalysisResultOverlay })),
    { ssr: false }
)


export default function Home() {
    const router = useRouter()
    const { toast } = useToast()
    const fileInputRef = React.useRef<HTMLInputElement>(null)
    const [isAnalyzing, setIsAnalyzing] = React.useState(false)
    const setSelectedDocId = useConfigStore((state) => state.setSelectedDocId)
    const handleFileSelect = () => {
        fileInputRef.current?.click()
    }

    const [analysisResult, setAnalysisResult] = React.useState<any>(null)

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setIsAnalyzing(true)
        try {
            const result = await analyzerApi.analyzeDocument(file)
            setAnalysisResult(result)
            setSelectedDocId(result.document_id)
        } catch (error) {
            console.error("Analysis failed:", error)
            toast({
                title: "Scan Failed",
                description: "Deep content inspection failed for this document.",
                variant: "destructive"
            })
        } finally {
            setIsAnalyzing(false)
        }
    }

    const handleConfirmAnalysis = (config: any) => {
        if (!analysisResult) return

        const method = config.chunking_method === 'character' ? 'recursive' : config.chunking_method as any

        useConfigStore.getState().setMethod(method)
        useConfigStore.getState().setChunkSize(config.chunk_size)
        useConfigStore.getState().setOverlap(config.overlap)
        if (config.threshold) {
             useConfigStore.getState().setThreshold(config.threshold)
        }

        router.push(`/visualizer?docId=${analysisResult.document_id}&auto=true`)
        setAnalysisResult(null)
    }

    return (
        <main
            className="relative min-h-screen text-gray-900 font-sans overflow-x-hidden selection:bg-blue-100"
        >

            {/* Navigation */}
            <nav className="fixed top-0 w-full z-50 border-b border-gray-200 bg-white/80 backdrop-blur-md">
                <div className="container mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-6 h-6 bg-gradient-to-br from-amber-500 to-amber-700 rounded-md flex items-center justify-center shadow-sm">
                            <Layers className="text-white w-3 h-3" />
                        </div>
                        <span className="text-[10px] font-black tracking-[0.2em] text-gray-900 uppercase">ChunkScope</span>
                    </div>

                    <div className="flex items-center gap-6">
                        <Link href="https://github.com/1Ash0/chunkscope" className="text-gray-400 hover:text-gray-900 transition-colors">
                            <Github className="w-4 h-4" />
                        </Link>
                        <Link
                            href="/dashboard"
                            className="px-4 py-1.5 bg-gray-900 text-white text-[9px] uppercase font-black rounded-full hover:bg-gray-800 hover:scale-105 transition-all tracking-widest"
                        >
                            Dashboard
                        </Link>
                    </div>
                </div>
            </nav>

            {/* Content Container */}
            <div className="relative z-20 flex flex-col items-center">

                {/* Hero Section */}
                <section className="min-h-screen flex flex-col items-center justify-center px-4 pt-32 pb-40 w-full max-w-5xl mx-auto text-center relative">
                    <div
                        className="space-y-12 animate-fade-in-up"
                    >
                        {/* Status Badge */}
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-[8px] font-black tracking-[0.4em] uppercase text-amber-700 mb-4">
                            <span className="w-1 h-1 rounded-full bg-amber-500 animate-pulse" />
                            Public Beta v0.1.0
                        </div>

                        {/* Title */}
                        <div className="relative group">
                            <h1 className="relative text-5xl md:text-[6.5rem] font-heading font-black tracking-[-0.04em] text-gray-900 leading-[0.85]">
                                THE INSPECT<br />
                                <span className="text-gray-300 tracking-tighter">ELEMENT</span> FOR <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-amber-700">RAG</span>
                            </h1>
                        </div>

                        {/* Subtitle */}
                        <p className="text-sm md:text-base text-gray-500 max-w-lg mx-auto font-medium leading-relaxed tracking-wide">
                            Deep dive into your <span className="text-gray-900 italic underline decoration-amber-500/40 underline-offset-4">vector space</span>. Visualize semantic chunks, debug retrieval quality, and optimize your knowledge graph with forensic precision.
                        </p>

                        {/* Quick Analyze Component */}
                        <div className="max-w-xl mx-auto rounded-[2.5rem] group transition-all relative overflow-hidden">
                            <div className="bg-white rounded-[2.4rem] overflow-hidden relative z-30 border border-gray-200 shadow-lg m-[1px]">
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    className="hidden"
                                    onChange={handleFileChange}
                                    accept=".pdf,.txt,.md"
                                />
                                <div className="flex flex-col md:flex-row items-center gap-0">
                                    <div
                                        onClick={handleFileSelect}
                                        className="flex-1 flex items-center gap-5 px-8 py-6 cursor-pointer group/input transition-all w-full"
                                    >
                                        <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center border border-amber-200 group-hover/input:border-amber-400 group-hover/input:bg-amber-100 transition-all">
                                            <Search className="w-5 h-5 text-amber-600 group-hover/input:text-amber-700" />
                                        </div>
                                        <div className="flex flex-col text-left">
                                            <span className="text-gray-400 text-[9px] font-black uppercase tracking-[0.3em] mb-1">Document Scanner</span>
                                            <span className="text-gray-700 text-xs font-semibold tracking-tight">
                                                {isAnalyzing ? "Processing..." : "Select knowledge source"}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="px-6 py-4 md:py-0 w-full md:w-auto">
                                        <Button
                                            onClick={handleFileSelect}
                                            disabled={isAnalyzing}
                                            className="w-full md:w-auto bg-gray-900 hover:bg-gray-800 text-white font-black text-[10px] uppercase tracking-[0.2em] h-14 px-12 rounded-[1.8rem] shadow-sm hover:shadow-md transition-all active:scale-95 border-none"
                                        >
                                            {isAnalyzing ? (
                                                <span className="flex items-center gap-2">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                                    Scanning
                                                </span>
                                            ) : (
                                                "Analyze"
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* CTAs */}
                        <div className="flex flex-col sm:flex-row gap-5 justify-center pt-8">
                            <Link
                                href="/projects"
                                className="group relative px-10 py-3.5 bg-gray-900 text-white rounded-full font-black text-[9px] uppercase tracking-[0.25em] hover:bg-gray-800 active:scale-95 transition-all flex items-center justify-center gap-3 shadow-sm"
                            >
                                <FolderPlus className="w-3.5 h-3.5" />
                                Create Project
                            </Link>
                            <Link
                                href="/guide"
                                className="group relative px-10 py-3.5 bg-white border border-gray-200 text-gray-700 rounded-full font-black text-[9px] uppercase tracking-[0.25em] hover:bg-gray-50 active:scale-95 transition-all flex items-center justify-center gap-3 shadow-sm"
                            >
                                <Eye className="w-3.5 h-3.5 text-amber-600" />
                                Strategy Guide
                            </Link>
                            <Link
                                href="/pipeline"
                                className="group relative px-10 py-3.5 bg-white border border-gray-200 text-gray-700 rounded-full font-black text-[9px] uppercase tracking-[0.25em] hover:bg-gray-50 active:scale-95 transition-all flex items-center justify-center gap-3 shadow-sm"
                            >
                                <Cpu className="w-3.5 h-3.5 text-purple-500" />
                                Pipeline Builder
                            </Link>
                        </div>
                    </div>

                    {/* Scroll Indicator */}
                    <div className="absolute bottom-12 flex flex-col items-center gap-3 pointer-events-none w-full">
                        <span className="text-[7px] font-black uppercase tracking-[0.5em] text-gray-300 animate-pulse">Scroll Down</span>
                        <div
                            className="w-[1px] h-10 bg-gradient-to-b from-amber-500 to-transparent opacity-40 animate-bounce-y"
                        />
                    </div>
                </section>

                {/* Features / Toolkit Section */}
                <section className="w-full max-w-6xl mx-auto px-6 py-12 md:py-16">
                    <div className="text-center mb-10 space-y-2">
                        <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-gray-900">
                            Universal Toolkit
                        </h2>
                        <p className="text-gray-500 max-w-lg mx-auto text-sm font-normal">
                            High-density tools for modern RAG architectures.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        {/* Analyzer Card */}
                        <Link href="/analyze">
                            <div
                                className="group relative p-5 rounded-xl bg-white border border-gray-200 overflow-hidden hover:border-blue-300 hover:shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer h-full flex flex-col"
                            >
                                <div className="relative z-10 flex flex-col h-full">
                                    <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center mb-4 ring-1 ring-blue-200 group-hover:ring-blue-400 transition-all">
                                        <Search className="w-5 h-5 text-blue-600" />
                                    </div>
                                    <h3 className="text-lg font-bold text-gray-900 mb-2 tracking-tight">Analyzer</h3>
                                    <p className="text-gray-500 text-xs leading-relaxed mb-4 flex-grow">
                                        Inspect token overlaps and semantic density in real-time.
                                    </p>
                                    <div className="flex items-center text-[10px] font-bold text-blue-600 uppercase tracking-widest group-hover:translate-x-1 transition-transform">
                                        Go to Tool <ArrowRight className="w-3 h-3 ml-2" />
                                    </div>
                                </div>
                            </div>
                        </Link>

                        {/* Projects Card */}
                        <Link href="/projects">
                            <div
                                className="group relative p-6 rounded-2xl bg-white border border-gray-200 overflow-hidden hover:border-amber-300 hover:shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer h-full flex flex-col justify-between"
                            >
                                <div className="relative z-10">
                                    <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center mb-6 ring-1 ring-amber-200 group-hover:scale-110 transition-transform">
                                        <Database className="w-6 h-6 text-amber-600" />
                                    </div>
                                    <h3 className="text-xl font-bold text-gray-900 mb-2 tracking-tight uppercase">Projects</h3>
                                    <p className="text-gray-500 text-xs leading-relaxed mb-6">
                                        Build RAG knowledge bases with visualization and evaluation.
                                    </p>
                                </div>

                                <div className="flex items-center text-[10px] font-black text-amber-600 uppercase tracking-[0.2em] group-hover:translate-x-1 transition-all relative z-10">
                                    Explore <ArrowRight className="w-4 h-4 ml-2" />
                                </div>
                            </div>
                        </Link>

                        {/* Builder Card */}
                        <Link href="/pipeline">
                            <div
                                className="group relative p-5 rounded-xl bg-white border border-gray-200 overflow-hidden hover:border-purple-300 hover:shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer h-full flex flex-col"
                            >
                                <div className="relative z-10 flex flex-col h-full">
                                    <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center mb-4 ring-1 ring-purple-200 group-hover:ring-purple-400 transition-all">
                                        <GitBranch className="w-5 h-5 text-purple-600" />
                                    </div>
                                    <h3 className="text-lg font-bold text-gray-900 mb-2 tracking-tight">Builder</h3>
                                    <p className="text-gray-500 text-xs leading-relaxed mb-4 flex-grow">
                                        Construct and benchmark custom chunking pipelines instantly.
                                    </p>
                                    <div className="flex items-center text-[10px] font-bold text-purple-600 uppercase tracking-widest group-hover:translate-x-1 transition-transform">
                                        Go to Tool <ArrowRight className="w-3 h-3 ml-2" />
                                    </div>
                                </div>
                            </div>
                        </Link>
                    </div>
                </section>

                {/* Technical Specs */}
                <section className="w-full max-w-4xl mx-auto px-6 py-10 border-t border-gray-200">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center divide-x divide-gray-200">
                        <div className="p-2">
                            <div className="text-xl font-mono font-bold text-gray-900 mb-0.5"><span className="text-amber-600">&lt;</span> 50ms</div>
                            <div className="text-[9px] font-medium uppercase tracking-widest text-gray-400">Latency</div>
                        </div>
                        <div className="p-2">
                            <div className="text-xl font-mono font-bold text-gray-900 mb-0.5">100%</div>
                            <div className="text-[9px] font-medium uppercase tracking-widest text-gray-400">Visual Fidelity</div>
                        </div>
                        <div className="p-2">
                            <div className="text-xl font-mono font-bold text-gray-900 mb-0.5">WebGL</div>
                            <div className="text-[9px] font-medium uppercase tracking-widest text-gray-400">Engine</div>
                        </div>
                        <div className="p-2">
                            <div className="text-xl font-mono font-bold text-gray-900 mb-0.5">Auto</div>
                            <div className="text-[9px] font-medium uppercase tracking-widest text-gray-400">Optimize</div>
                        </div>
                    </div>
                </section>

                {/* Final CTA */}
                <section className="w-full py-16 flex flex-col items-center text-center space-y-4">
                    <h2 className="text-3xl md:text-4xl font-heading font-bold tracking-tighter text-gray-900">
                        Build Smarter RAG.
                    </h2>
                    <Link
                        href="/projects"
                        className="px-8 py-2.5 bg-gray-900 text-white text-xs font-bold rounded-full hover:bg-gray-800 hover:scale-105 active:scale-95 transition-transform shadow-sm"
                    >
                        Get Started
                    </Link>
                    <p className="text-gray-400 text-[9px] tracking-widest uppercase mt-4">
                        &copy; 2025 ChunkScope
                    </p>
                </section>

                {analysisResult && (
                    <AnalysisResultOverlay
                        result={analysisResult}
                        onClose={() => setAnalysisResult(null)}
                        onConfirm={handleConfirmAnalysis}
                    />
                )}

            </div>
        </main>
    )
}

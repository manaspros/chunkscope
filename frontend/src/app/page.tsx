"use client"

import React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useConfigStore } from "@/stores/useConfigStore"
import { analyzerApi } from "@/lib/api"
import { ArrowRight, Database, Github, Search, Eye, GitBranch, Layers, Zap, Cpu } from "lucide-react"
import { Button } from "@/components/ui/button"


import { useToast } from "@/components/ui/use-toast"
import dynamic from "next/dynamic"

const AnalysisResultOverlay = dynamic(
    () => import("@/components/analysis/AnalysisResultOverlay").then(mod => ({ default: mod.AnalysisResultOverlay })),
    { ssr: false }
)

const DocumentSelectionModalLazy = dynamic(
    () => import("@/components/presets/DocumentSelectionModal").then(mod => ({ default: mod.DocumentSelectionModal })),
    { ssr: false }
)

export default function Home() {
    const router = useRouter()
    const { toast } = useToast()
    const fileInputRef = React.useRef<HTMLInputElement>(null)
    const [isAnalyzing, setIsAnalyzing] = React.useState(false)
    const setSelectedDocId = useConfigStore((state) => state.setSelectedDocId)
    const [isUploadModalOpen, setIsUploadModalOpen] = React.useState(false)

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

    const handleVisualize = (docId: string) => {
        setSelectedDocId(docId)
        router.push(`/visualizer?docId=${docId}`)
    }

    const handleUploadSuccess = (docId: string) => {
        setIsUploadModalOpen(false)
        toast({
            title: "Document Ready",
            description: "Opening in visualizer...",
        })
        handleVisualize(docId)
    }

    return (
        <main
            className="relative min-h-screen text-white font-sans overflow-x-hidden selection:bg-orange-500/30 selection:text-orange-200"
        >

            {/* Navigation */}
            <nav className="fixed top-0 w-full z-50 border-b border-white/5 bg-black/40 backdrop-blur-md">
                <div className="container mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-6 h-6 bg-gradient-to-br from-orange-500 to-amber-700 rounded-md flex items-center justify-center shadow-lg shadow-orange-900/20">
                            <Layers className="text-white w-3 h-3" />
                        </div>
                        <span className="text-[10px] font-black tracking-[0.2em] text-white/90 uppercase">ChunkScope</span>
                    </div>

                    <div className="flex items-center gap-6">
                        <Link href="https://github.com/1Ash0/chunkscope" className="text-zinc-500 hover:text-white transition-colors">
                            <Github className="w-4 h-4" />
                        </Link>
                        <Link
                            href="/dashboard"
                            className="px-4 py-1.5 bg-transparent border border-white/20 text-white text-[9px] uppercase font-black rounded-full hover:bg-white/10 hover:scale-105 transition-all shadow-[0_0_10px_rgba(255,255,255,0.1)] tracking-widest"
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
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-md text-[8px] font-black tracking-[0.4em] uppercase text-zinc-500 mb-4 shadow-[0_0_20px_rgba(255,255,255,0.02)]">
                            <span className="w-1 h-1 rounded-full bg-orange-500 animate-pulse" />
                            Public Beta v0.1.0
                        </div>

                        {/* Title */}
                        <div className="relative group">
                            <div className="absolute -inset-8 rounded-full bg-orange-500/5 opacity-0 group-hover:opacity-100 blur-3xl transition-opacity pointer-events-none" />
                            <h1 className="relative text-5xl md:text-[6.5rem] font-heading font-black tracking-[-0.04em] text-white leading-[0.85] mix-blend-plus-lighter drop-shadow-[0_0_40px_rgba(255,255,255,0.1)]">
                                THE INSPECT<br />
                                <span className="text-white/20 tracking-tighter">ELEMENT</span> FOR <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-600 drop-shadow-[0_0_30px_rgba(245,183,0,0.4)]">RAG</span>
                            </h1>
                        </div>

                        {/* Subtitle */}
                        <p className="text-sm md:text-base text-zinc-400 max-w-lg mx-auto font-medium leading-relaxed tracking-wide opacity-80">
                            Deep dive into your <span className="text-white italic underline decoration-orange-500/30 underline-offset-4">vector space</span>. Visualize semantic chunks, debug retrieval quality, and optimize your knowledge graph with forensic precision.
                        </p>

                        {/* Quick Analyze Component */}
                        <div className="max-w-xl mx-auto p-[1px] bg-white/10 rounded-[2.5rem] group transition-all relative overflow-hidden backdrop-blur-md">
                            <div className="bg-neutral-900/40 backdrop-blur-xl rounded-[2.4rem] overflow-hidden relative z-30 border border-white/5 m-[1px]">
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
                                        <div className="w-12 h-12 rounded-2xl bg-orange-500/5 flex items-center justify-center border border-white/5 group-hover/input:border-orange-500/30 group-hover/input:bg-orange-500/10 transition-all shadow-inner">
                                            <Search className="w-5 h-5 text-orange-400/70 group-hover/input:text-orange-400" />
                                        </div>
                                        <div className="flex flex-col text-left">
                                            <span className="text-zinc-500 text-[9px] font-black uppercase tracking-[0.3em] mb-1">Forensic Decoder</span>
                                            <span className="text-zinc-300 text-xs font-semibold tracking-tight">
                                                {isAnalyzing ? "Processing..." : "Select knowledge source"}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="px-6 py-4 md:py-0 w-full md:w-auto">
                                        <Button
                                            onClick={handleFileSelect}
                                            disabled={isAnalyzing}
                                            className="w-full md:w-auto bg-gradient-to-b from-orange-400 to-amber-600 hover:from-orange-300 hover:to-amber-500 text-black font-black text-[10px] uppercase tracking-[0.2em] h-14 px-12 rounded-[1.8rem] shadow-[0_4px_20px_rgba(245,183,0,0.2)] hover:shadow-[0_8px_30px_rgba(245,183,0,0.4)] transition-all active:scale-95 border-none"
                                        >
                                            {isAnalyzing ? (
                                                <span className="flex items-center gap-2">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-black animate-pulse" />
                                                    Scanning
                                                </span>
                                            ) : (
                                                "Initiate Scan"
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            <div className="absolute top-6 left-6 w-3 h-3 border-t-2 border-l-2 border-orange-500/20 group-hover:border-orange-500/40 transition-colors pointer-events-none" />
                            <div className="absolute bottom-6 right-6 w-3 h-3 border-b-2 border-r-2 border-white/5 group-hover:border-white/20 transition-colors pointer-events-none" />
                        </div>

                        {/* CTAs */}
                        <div className="flex flex-col sm:flex-row gap-5 justify-center pt-8">
                            <Link
                                href="/visualizer"
                                className="group relative px-10 py-3.5 bg-white/5 backdrop-blur-md border border-white/10 text-white rounded-full font-black text-[9px] uppercase tracking-[0.25em] hover:bg-white/10 active:scale-95 transition-all flex items-center justify-center gap-3 hover:border-orange-500/40 shadow-lg"
                            >
                                <Eye className="w-3.5 h-3.5 text-orange-400" />
                                Launch Visualizer
                            </Link>
                            <Link
                                href="/pipeline"
                                className="group relative px-10 py-3.5 bg-white/5 backdrop-blur-md border border-white/10 text-white rounded-full font-black text-[9px] uppercase tracking-[0.25em] hover:bg-white/10 active:scale-95 transition-all flex items-center justify-center gap-3 hover:border-purple-500/40 shadow-lg"
                            >
                                <Cpu className="w-3.5 h-3.5 text-purple-400" />
                                Pipeline Builder
                            </Link>
                        </div>
                    </div>

                    {/* Scroll Indicator */}
                    <div className="absolute bottom-12 flex flex-col items-center gap-3 pointer-events-none w-full">
                        <span className="text-[7px] font-black uppercase tracking-[0.5em] text-zinc-700 animate-pulse">Scan Below</span>
                        <div
                            className="w-[1px] h-10 bg-gradient-to-b from-orange-500 to-transparent opacity-40 animate-bounce-y"
                        />
                    </div>
                </section>

                {/* Features / Toolkit Section */}
                <section className="w-full max-w-6xl mx-auto px-6 py-12 md:py-16">
                    <div className="text-center mb-10 space-y-2">
                        <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white">
                            Universal Toolkit
                        </h2>
                        <p className="text-zinc-500 max-w-lg mx-auto text-sm font-normal">
                            High-density forensic tools for modern RAG architectures.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        {/* Analyzer Card */}
                        <Link href="/analyze">
                            <div
                                className="group relative p-5 rounded-xl bg-white/5 backdrop-blur-lg border border-white/10 overflow-hidden hover:border-blue-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer h-full flex flex-col"
                            >
                                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                <div className="relative z-10 flex flex-col h-full">
                                    <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center mb-4 ring-1 ring-blue-500/20 group-hover:ring-blue-500/50 transition-all">
                                        <Search className="w-5 h-5 text-blue-400" />
                                    </div>
                                    <h3 className="text-lg font-bold text-white mb-2 tracking-tight">Analyzer</h3>
                                    <p className="text-zinc-400 text-xs leading-relaxed mb-4 flex-grow font-light">
                                        Inspect token overlaps and semantic density in real-time.
                                    </p>
                                    <div className="flex items-center text-[10px] font-bold text-blue-400 uppercase tracking-widest group-hover:translate-x-1 transition-transform">
                                        Go to Tool <ArrowRight className="w-3 h-3 ml-2" />
                                    </div>
                                </div>
                            </div>
                        </Link>

                        {/* Visualizer Card */}
                        <div className="group">
                            <div
                                className="group relative p-6 rounded-[2rem] bg-white/[0.03] backdrop-blur-xl border border-white/10 overflow-hidden hover:border-orange-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer h-full flex flex-col justify-between"
                            >
                                <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 blur-3xl rounded-full -mr-16 -mt-16 opacity-50 transition-opacity group-hover:opacity-80" />

                                <div className="relative z-10">
                                    <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center mb-6 ring-1 ring-orange-500/20 group-hover:scale-110 transition-transform">
                                        <Database className="w-6 h-6 text-orange-400" />
                                    </div>
                                    <h3 className="text-xl font-bold text-white mb-2 tracking-tight uppercase">Visualizer</h3>
                                    <p className="text-zinc-400 text-xs leading-relaxed mb-6 font-light opacity-80">
                                        3D spatial map of embedding clusters to identify semantics gaps.
                                    </p>
                                </div>

                                <div className="flex items-center gap-4 relative z-10">
                                    <button
                                        onClick={() => router.push("/visualizer")}
                                        className="flex items-center text-[10px] font-black text-orange-400 uppercase tracking-[0.2em] group-hover:translate-x-1 transition-all"
                                    >
                                        Launch <ArrowRight className="w-4 h-4 ml-2" />
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            setIsUploadModalOpen(true)
                                        }}
                                        className="px-4 py-2 rounded-xl bg-zinc-900 border border-white/5 text-[9px] font-black text-zinc-500 hover:text-white hover:bg-zinc-800 hover:border-white/10 transition-all uppercase tracking-widest"
                                    >
                                        Upload New
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Builder Card */}
                        <Link href="/pipeline">
                            <div
                                className="group relative p-5 rounded-xl bg-white/5 backdrop-blur-lg border border-white/10 overflow-hidden hover:border-purple-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer h-full flex flex-col"
                            >
                                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                <div className="relative z-10 flex flex-col h-full">
                                    <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center mb-4 ring-1 ring-purple-500/20 group-hover:ring-purple-500/50 transition-all">
                                        <GitBranch className="w-5 h-5 text-purple-400" />
                                    </div>
                                    <h3 className="text-lg font-bold text-white mb-2 tracking-tight">Builder</h3>
                                    <p className="text-zinc-400 text-xs leading-relaxed mb-4 flex-grow font-light">
                                        Construct and benchmark custom chunking pipelines instantly.
                                    </p>
                                    <div className="flex items-center text-[10px] font-bold text-purple-400 uppercase tracking-widest group-hover:translate-x-1 transition-transform">
                                        Go to Tool <ArrowRight className="w-3 h-3 ml-2" />
                                    </div>
                                </div>
                            </div>
                        </Link>
                    </div>
                </section>

                {/* Technical Specs */}
                <section className="w-full max-w-4xl mx-auto px-6 py-10 border-t border-white/5">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center divide-x divide-white/5">
                        <div className="p-2">
                            <div className="text-xl font-mono font-bold text-white mb-0.5"><span className="text-gold">&lt;</span> 50ms</div>
                            <div className="text-[9px] font-medium uppercase tracking-widest text-zinc-600">Latency</div>
                        </div>
                        <div className="p-2">
                            <div className="text-xl font-mono font-bold text-white mb-0.5">100%</div>
                            <div className="text-[9px] font-medium uppercase tracking-widest text-zinc-600">Visual Fidelity</div>
                        </div>
                        <div className="p-2">
                            <div className="text-xl font-mono font-bold text-white mb-0.5">WebGL</div>
                            <div className="text-[9px] font-medium uppercase tracking-widest text-zinc-600">Engine</div>
                        </div>
                        <div className="p-2">
                            <div className="text-xl font-mono font-bold text-white mb-0.5">Auto</div>
                            <div className="text-[9px] font-medium uppercase tracking-widest text-zinc-600">Optimize</div>
                        </div>
                    </div>
                </section>

                {/* Final CTA */}
                <section className="w-full py-16 flex flex-col items-center text-center space-y-4">
                    <h2 className="text-3xl md:text-4xl font-heading font-bold tracking-tighter text-white">
                        Build Smarter RAG.
                    </h2>
                    <Link
                        href="/dashboard"
                        className="px-8 py-2.5 bg-[#F5B700] text-black text-xs font-bold rounded-full hover:scale-105 active:scale-95 transition-transform shadow-[0_0_30px_rgba(245,183,0,0.2)]"
                    >
                        Enter Terminal
                    </Link>
                    <p className="text-zinc-600 text-[9px] tracking-widest uppercase mt-4">
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

                {isUploadModalOpen && (
                    <DocumentSelectionModalLazy
                        isOpen={isUploadModalOpen}
                        onClose={() => setIsUploadModalOpen(false)}
                        onSuccess={handleUploadSuccess}
                        onUseDemo={() => {
                            toast({ title: "Demo Mode", description: "Demo document selected. Entering visualizer..." })
                            handleVisualize("demo-id")
                        }}
                        presetName="Visualizer"
                    />
                )}
            </div>
        </main>
    )
}

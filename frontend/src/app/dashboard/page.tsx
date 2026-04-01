"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { motion } from "framer-motion"
import {
    LayoutDashboard,
    Search,
    Database,
    GitBranch,
    ArrowRight,
    Activity,
    Clock,
    Layers,
    History,
    FileText
} from "lucide-react"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { documentsApi, pipelinesApi } from "@/lib/api"
import { useConfigStore } from "@/stores/useConfigStore"
import { DocumentSelectionModal } from "@/components/presets/DocumentSelectionModal"
import { useToast } from "@/components/ui/use-toast"
import { AnimatePresence } from "framer-motion"

export default function DashboardPage() {
    const router = useRouter()
    const { toast } = useToast()
    const [documents, setDocuments] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [stats, setStats] = useState({
        docs: 0,
        chunks: 0,
        cost: 0.00
    })

    const { setSelectedDocId } = useConfigStore()
    const [lastUpdated, setLastUpdated] = useState<Date>(new Date())
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)

    const fetchDashboardData = async (silent = false) => {
        if (!silent) setIsLoading(true)
        try {
            const docsResp = await documentsApi.listDocuments()
            setDocuments(docsResp.items || [])

            const totalChunks = (docsResp.items || []).reduce((acc: number, doc: any) => acc + (doc.chunk_count || 0), 0)
            setStats({
                docs: docsResp.total || 0,
                chunks: totalChunks,
                cost: totalChunks * 0.0001
            })
            setLastUpdated(new Date())
        } catch (error) {
            console.error("Failed to fetch dashboard data:", error)
        } finally {
            if (!silent) setIsLoading(false)
        }
    }

    useEffect(() => {
        fetchDashboardData()

        const interval = setInterval(() => {
            fetchDashboardData(true)
        }, 8000)

        return () => clearInterval(interval)
    }, [])

    const handleVisualize = (docId: string) => {
        setSelectedDocId(docId)
        router.push(`/visualizer?docId=${docId}`)
    }

    const handleUploadSuccess = (docId: string) => {
        setIsUploadModalOpen(false)
        fetchDashboardData(true)
        toast({
            title: "Document Ready",
            description: "Redirecting to visualizer...",
        })
        handleVisualize(docId)
    }

    return (
        <div className="relative min-h-screen bg-black overflow-hidden font-sans text-white">
            {/* Fixed Background */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute inset-0 bg-black" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(245,158,11,0.06)_0%,transparent_50%)]" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(59,130,246,0.04)_0%,transparent_50%)]" />
            </div>

            <div className="relative z-10 container-tight space-y-8 py-10">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6">
                    <div className="space-y-1">
                        <div className="inline-flex items-center gap-2 px-2 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-[10px] font-bold text-orange-400 uppercase tracking-[0.2em]">
                            <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                            Terminal Active
                        </div>
                        <h1 className="text-3xl md:text-5xl font-black tracking-tighter text-white">
                            Dashboard<span className="text-gold">.</span>
                        </h1>
                        <div className="flex items-center gap-3 text-zinc-500 text-sm">
                            <span>ChunkScope</span>
                            <span className="w-1 h-1 rounded-full bg-zinc-800" />
                            <span className="text-[10px] font-mono opacity-50">SYNCED: {lastUpdated.toLocaleTimeString()}</span>
                        </div>
                    </div>

                    {/* Real-time Metrics Bar */}
                    <div className="grid grid-cols-3 gap-6 lg:gap-10 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 px-8 shadow-2xl relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                        <div className="text-center px-2 relative z-10">
                            <motion.div
                                key={stats.docs}
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="text-lg font-mono font-black text-gold"
                            >
                                {stats.docs}
                            </motion.div>
                            <div className="text-[9px] uppercase font-black tracking-[0.2em] text-zinc-500">Docs</div>
                        </div>
                        <div className="text-center px-2 relative z-10">
                            <motion.div
                                key={stats.chunks}
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="text-lg font-mono font-black text-orange-500"
                            >
                                {stats.chunks > 1000 ? `${(stats.chunks / 1000).toFixed(1)}k` : stats.chunks}
                            </motion.div>
                            <div className="text-[9px] uppercase font-black tracking-[0.2em] text-zinc-500">Chunks</div>
                        </div>
                        <div className="text-center px-2 relative z-10">
                            <motion.div
                                key={stats.cost}
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="text-lg font-mono font-black text-cyan-400"
                            >
                                ${stats.cost.toFixed(2)}
                            </motion.div>
                            <div className="text-[9px] uppercase font-black tracking-[0.2em] text-zinc-500">Est. Cost</div>
                        </div>
                    </div>
                </div>

                {/* Performance Overview */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card className="md:col-span-2 bg-black/40 backdrop-blur-2xl border border-white/5 overflow-hidden group shadow-2xl">
                        <CardHeader className="py-5 px-6">
                            <div className="flex items-center justify-between">
                                <div className="space-y-1">
                                    <CardTitle className="text-[10px] font-black tracking-[0.3em] uppercase text-zinc-500">Processing Activity</CardTitle>
                                    <p className="text-[9px] text-zinc-600 font-medium">REAL-TIME SYSTEM THROUGHPUT</p>
                                </div>
                                <div className="flex gap-1.5 items-end h-6">
                                    {[...Array(8)].map((_, i) => (
                                        <motion.div
                                            key={i}
                                            animate={{ height: [`${20 + Math.random() * 40}%`, `${40 + Math.random() * 60}%`, `${20 + Math.random() * 40}%`] }}
                                            transition={{ duration: 1.5 + Math.random(), repeat: Infinity, ease: "easeInOut" }}
                                            className="w-1 rounded-full bg-blue-500/40"
                                        />
                                    ))}
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="h-40 flex items-end justify-between gap-1.5 pb-6 px-6">
                            {isLoading ? (
                                <div className="w-full h-full flex items-center justify-center">
                                    <LoadingSpinner size="sm" />
                                </div>
                            ) : (
                                [...Array(32)].map((_, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ height: 0 }}
                                        animate={{ height: `${20 + (Math.sin(i * 0.5 + Date.now() * 0.001) + 1) * 35}%` }}
                                        transition={{ type: "spring", stiffness: 50 }}
                                        className="flex-1 bg-gradient-to-t from-blue-600/30 via-blue-400/10 to-transparent rounded-t-sm border-t border-blue-400/20"
                                    />
                                ))
                            )}
                        </CardContent>
                    </Card>

                    <Card className="bg-black/40 backdrop-blur-2xl border border-white/5 p-6 shadow-2xl flex flex-col justify-between">
                        <div className="space-y-6">
                            <CardTitle className="text-[10px] font-black tracking-[0.3em] uppercase text-zinc-500">System Info</CardTitle>
                            <div className="space-y-4">
                                <div className="p-4 bg-white/5 rounded-2xl border border-white/5 group hover:border-white/10 transition-colors">
                                    <div className="text-[9px] font-black text-zinc-600 uppercase mb-1.5 tracking-widest">Application</div>
                                    <div className="text-xs font-bold text-white/90 truncate">ChunkScope v0.1.0</div>
                                </div>
                                <div className="p-4 bg-white/5 rounded-2xl border border-white/5 group hover:border-white/10 transition-colors">
                                    <div className="text-[9px] font-black text-zinc-600 uppercase mb-1.5 tracking-widest">Status</div>
                                    <div className="text-xs font-bold text-green-400">Online</div>
                                </div>
                            </div>
                        </div>
                        <div className="mt-6 flex items-center justify-between px-1">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.4)]" />
                                <span className="text-[10px] font-bold text-zinc-500 uppercase">Ready</span>
                            </div>
                        </div>
                    </Card>
                </div>

                {/* Quick Access Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
                    <Link href="/analyze" className="group">
                        <Card className="h-full bg-white/[0.03] backdrop-blur-xl border border-white/5 group-hover:border-blue-500/40 group-hover:bg-blue-500/5 transition-all duration-500 p-5 rounded-3xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 blur-3xl rounded-full -mr-10 -mt-10" />
                            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                <Search className="w-5 h-5 text-blue-400" />
                            </div>
                            <h3 className="text-sm font-black text-white mb-1.5 uppercase tracking-widest">Analyzer</h3>
                            <p className="text-zinc-500 text-[10px] font-medium leading-relaxed mb-4 opacity-80">Forensic token overlap and density maps.</p>
                            <div className="flex items-center text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] group-hover:translate-x-2 transition-all">
                                Launch <ArrowRight className="w-3.5 h-3.5 ml-2" />
                            </div>
                        </Card>
                    </Link>

                    <div className="group">
                        <Card className="h-full bg-white/[0.03] backdrop-blur-xl border border-white/5 group-hover:border-gold/40 transition-all duration-500 p-6 rounded-[2rem] relative overflow-hidden flex flex-col justify-between">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-gold/5 blur-3xl rounded-full -mr-16 -mt-16 opacity-50" />

                            <div>
                                <div className="w-12 h-12 rounded-2xl bg-gold/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                    <Database className="w-6 h-6 text-gold" />
                                </div>
                                <h3 className="text-xl font-black text-white mb-2 uppercase tracking-tight">Visualizer</h3>
                                <p className="text-zinc-500 text-xs font-medium leading-relaxed opacity-80 mb-6 max-w-[200px]">3D spatial map of embedding clusters.</p>
                            </div>

                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => {
                                        if (documents.length > 0) {
                                            handleVisualize(documents[0].id)
                                        } else {
                                            handleVisualize("demo-id")
                                        }
                                    }}
                                    className="flex items-center text-[11px] font-black text-gold uppercase tracking-[0.2em] group-hover:translate-x-1 transition-all"
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
                        </Card>
                    </div>

                    <Link href="/pipeline" className="group">
                        <Card className="h-full bg-white/[0.03] backdrop-blur-xl border border-white/5 group-hover:border-purple-500/40 group-hover:bg-purple-500/5 transition-all duration-500 p-5 rounded-3xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 blur-3xl rounded-full -mr-10 -mt-10" />
                            <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                <GitBranch className="w-5 h-5 text-purple-400" />
                            </div>
                            <h3 className="text-sm font-black text-white mb-1.5 uppercase tracking-widest">Builder</h3>
                            <p className="text-zinc-500 text-[10px] font-medium leading-relaxed mb-4 opacity-80">Orchestrate RAG pipelines locally.</p>
                            <div className="flex items-center text-[10px] font-black text-purple-400 uppercase tracking-[0.2em] group-hover:translate-x-2 transition-all">
                                Launch <ArrowRight className="w-3.5 h-3.5 ml-2" />
                            </div>
                        </Card>
                    </Link>

                    <Link href="/presets" className="group">
                        <Card className="h-full bg-white/[0.03] backdrop-blur-xl border border-white/5 group-hover:border-cyan-500/40 group-hover:bg-cyan-500/5 transition-all duration-500 p-5 rounded-3xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 blur-3xl rounded-full -mr-10 -mt-10" />
                            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                <Database className="w-5 h-5 text-cyan-400" />
                            </div>
                            <h3 className="text-sm font-black text-white mb-1.5 uppercase tracking-widest">Presets</h3>
                            <p className="text-zinc-500 text-[10px] font-medium leading-relaxed mb-4 opacity-80">Verified industry-standard templates.</p>
                            <div className="flex items-center text-[10px] font-black text-cyan-400 uppercase tracking-[0.2em] group-hover:translate-x-2 transition-all">
                                Launch <ArrowRight className="w-3.5 h-3.5 ml-2" />
                            </div>
                        </Card>
                    </Link>
                </div>

                {/* Recent Documents Table */}
                <Card className="bg-black/40 backdrop-blur-2xl border border-white/5 overflow-hidden shadow-2xl rounded-3xl">
                    <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                        <div className="flex items-center gap-3">
                            <CardTitle className="text-[10px] font-black tracking-[0.4em] uppercase text-zinc-500">Recent Archive</CardTitle>
                            {isLoading && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />}
                        </div>
                        <Button variant="ghost" size="sm" className="text-[10px] font-black text-blue-400 uppercase tracking-widest hover:bg-white/5">
                            View All Archive
                        </Button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-[11px]">
                            <thead>
                                <tr className="border-b border-white/5 bg-white/[0.03]">
                                    <th className="px-6 py-4 font-black text-zinc-500 uppercase tracking-widest text-[9px]">FILENAME</th>
                                    <th className="px-6 py-4 font-black text-zinc-500 uppercase tracking-widest text-[9px]">CHUNKS</th>
                                    <th className="px-6 py-4 font-black text-zinc-500 uppercase tracking-widest text-[9px]">STATUS</th>
                                    <th className="px-6 py-4 font-black text-zinc-500 uppercase tracking-widest text-[9px]">DATE</th>
                                    <th className="px-6 py-4 font-black text-zinc-500 uppercase tracking-widest text-[9px] text-right">ACTION</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {isLoading && documents.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center text-zinc-500 uppercase tracking-[0.3em] font-black opacity-50">
                                            <LoadingSpinner size="sm" className="mx-auto mb-3" />
                                            Initializing Archive...
                                        </td>
                                    </tr>
                                ) : documents.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center text-zinc-500 uppercase tracking-[0.3em] font-black opacity-50">
                                            No documents found in archive.
                                        </td>
                                    </tr>
                                ) : (
                                    documents.map((doc, i) => (
                                        <tr key={doc.id} className="hover:bg-white/5 transition-all group">
                                            <td className="px-6 py-4 text-zinc-200 font-bold">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
                                                        <FileText className="w-3.5 h-3.5 text-blue-400" />
                                                    </div>
                                                    <span className="truncate max-w-[200px]">{doc.original_filename}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <span className={`font-mono text-[12px] font-black ${doc.chunk_count > 0 ? 'text-orange-400' : 'text-zinc-600'}`}>
                                                        {doc.chunk_count || 0}
                                                    </span>
                                                    <span className="text-[8px] text-zinc-700 uppercase font-black tracking-tighter">Units</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                {doc.is_processed ? (
                                                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20 text-[8px] font-black uppercase text-green-400 tracking-widest">
                                                        <div className="w-1 h-1 rounded-full bg-green-500" />
                                                        Processed
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[8px] font-black uppercase text-blue-400 tracking-widest">
                                                        <div className="w-1 h-1 rounded-full bg-blue-500 animate-pulse" />
                                                        Processing
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-zinc-500 font-mono text-[10px]">
                                                {new Date(doc.created_at).toLocaleDateString(undefined, { month: '2-digit', day: '2-digit', year: 'numeric' })}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button
                                                    onClick={() => handleVisualize(doc.id)}
                                                    className="px-4 py-1.5 bg-white/5 hover:bg-white/10 border border-white/5 text-gold hover:text-white transition-all uppercase font-black text-[9px] tracking-widest rounded-full flex items-center justify-end gap-2 ml-auto group-hover:shadow-[0_0_15px_rgba(245,183,0,0.1)] active:scale-95"
                                                >
                                                    Visualize <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </Card>
                <AnimatePresence>
                    {isUploadModalOpen && (
                        <DocumentSelectionModal
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
                </AnimatePresence>
            </div >
        </div >
    )
}

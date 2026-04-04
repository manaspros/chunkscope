"use client"

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, FileText } from 'lucide-react'


import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { useToast } from '@/components/ui/use-toast'
import { pipelinesApi, documentsApi, chunksApi } from '@/lib/api'
import { useConfigStore, ChunkingMethod } from '@/stores/useConfigStore'
import { useChunkStore } from '@/stores/useChunkStore'
import { ChunkConfigPanel } from '@/components/visualizer/chunk-config-panel'
import { ChunkDetailPanel } from '@/components/visualizer/chunk-detail-panel'
import dynamic from 'next/dynamic'

const ChunkVisualizer = dynamic(
    () => import('@/components/visualizer/chunk-visualizer').then(mod => ({ default: mod.ChunkVisualizer })),
    {
        ssr: false,
        loading: () => (
            <div className="flex-1 flex items-center justify-center bg-gray-50 text-gray-400 text-sm">
                <LoadingSpinner size="md" />
            </div>
        ),
    }
)
import { DEMO_PDF_URL, MOCK_CHUNKS } from '@/lib/mock-data'

import { getErrorMessage } from '@/lib/utils'

import { Suspense } from 'react'


function VisualizerContent() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const selectedDocId = useConfigStore((s) => s.selectedDocId)
    const setSelectedDocId = useConfigStore((s) => s.setSelectedDocId)

    const [isLoading, setIsLoading] = useState(false)
    const chunks = useChunkStore((s) => s.chunks)
    const setChunks = useChunkStore((s) => s.setChunks)
    const selectedChunk = useChunkStore((s) => s.selectedChunk)
    const setSelectedChunk = useChunkStore((s) => s.setSelectedChunk)
    const [pdfUrl, setPdfUrl] = useState(DEMO_PDF_URL)
    const [docDetails, setDocDetails] = useState<any>(null)

    const { toast } = useToast()

    useEffect(() => {
        const docIdFromUrl = searchParams.get('docId')
        if (docIdFromUrl) {
            setSelectedDocId(docIdFromUrl)
            loadDocument(docIdFromUrl)
        } else if (selectedDocId) {
            loadDocument(selectedDocId)
        }
    }, [searchParams])

    useEffect(() => {
        const autoProcess = searchParams.get('auto') === 'true'
        if (autoProcess && selectedDocId && !isLoading) {
            setTimeout(() => {
                handleProcess()
                const newParams = new URLSearchParams(searchParams.toString())
                newParams.delete('auto')
                router.replace(`/visualizer?${newParams.toString()}`)
            }, 500)
        }
    }, [selectedDocId, searchParams])

    const loadDocument = async (id: string) => {
        try {
            const doc = await documentsApi.getDocument(id)
            setDocDetails(doc)
            const contentUrl = documentsApi.getDocumentContentUrl(id)
            setPdfUrl(contentUrl)
            setChunks([])
        } catch (error) {
            console.error("Failed to load document:", error)
        }
    }

    const handleProcess = async () => {
        if (!selectedDocId) {
            toast({
                title: "No Document Selected",
                description: "Please select or upload a document first.",
                variant: "destructive"
            })
            return
        }

        setIsLoading(true)
        try {
            const config = {
                method: useConfigStore.getState().method,
                chunk_size: useConfigStore.getState().chunkSize,
                overlap: useConfigStore.getState().overlap,
                threshold: useConfigStore.getState().threshold
            }

            const response = await chunksApi.visualizeChunks(selectedDocId, config)
            setChunks(response.chunks)

            toast({
                title: "Processing Complete",
                description: `Generated ${response.metrics.total_chunks} chunks in ${response.metrics.processing_time_ms}ms`,
            })
        } catch (error) {
            console.error("Processing failed:", error)
            toast({
                title: "Processing Failed",
                description: getErrorMessage(error),
                variant: "destructive"
            })
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="relative">
            <div className="relative z-10 flex h-screen bg-gray-50 overflow-hidden">
                {/* Left Panel: Configuration */}
                <div className="w-[300px] border-r border-gray-200 bg-white flex flex-col z-20">
                    <div className="p-4 border-b border-gray-200 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-2">
                            <Link href="/dashboard" className="p-1.5 -ml-1 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-900">
                                <ArrowLeft className="w-4 h-4" />
                            </Link>
                            <h1 className="font-black text-sm text-gray-900 tracking-tighter uppercase whitespace-nowrap">
                                Chunk <span className="text-amber-600">Visualizer</span>
                            </h1>
                        </div>
                        <div className={`w-1.5 h-1.5 rounded-full ${isLoading ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar p-1">
                        <ChunkConfigPanel documentId={selectedDocId} />
                    </div>

                    <div className="p-4 border-t border-gray-200 bg-white shrink-0 space-y-2">
                        <button
                            className="w-full py-2.5 bg-gray-900 text-white text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-gray-800 hover:scale-[1.01] transition-all active:scale-95 disabled:opacity-50 shadow-sm"
                            onClick={handleProcess}
                            disabled={isLoading}
                        >
                            {isLoading ? <LoadingSpinner size="sm" /> : "Execute Strategy"}
                        </button>
                        {chunks.length > 0 && (
                            <button
                                className="w-full py-2.5 bg-blue-50 text-blue-700 text-[10px] font-black uppercase tracking-widest rounded-lg border border-blue-200 hover:bg-blue-100 hover:scale-[1.01] transition-all active:scale-95 flex items-center justify-center gap-2"
                                onClick={() => router.push('/pipeline')}
                            >
                                Build Pipeline <ArrowRight className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Main Content: Visualizer */}
                <div className="flex-1 relative bg-gray-50">
                    {/* Overlay Stats */}
                    <div className="absolute top-4 left-4 z-10 pointer-events-none flex flex-col gap-2">
                        <div className="flex gap-2">
                            <div className="px-3 py-1.5 bg-white/90 backdrop-blur-md rounded border border-gray-200 text-[10px] font-mono text-gray-400 uppercase tracking-widest flex items-center gap-2 shadow-sm">
                                <FileText className="w-3 h-3 text-blue-600" />
                                <span className="text-gray-700 truncate max-w-[150px]">{docDetails?.original_filename || "No Document"}</span>
                            </div>
                            <div className="px-3 py-1.5 bg-white/90 backdrop-blur-md rounded border border-gray-200 text-[10px] font-mono text-gray-400 uppercase tracking-widest shadow-sm">
                                CHUNKS &nbsp; <span className="text-gray-900 font-bold">{chunks.length}</span>
                            </div>
                        </div>
                        {selectedChunk && (
                            <div
                                className="px-3 py-1.5 bg-amber-50/90 backdrop-blur-md rounded border border-amber-200 text-[10px] font-mono text-amber-700 uppercase tracking-widest animate-slide-in-left shadow-sm"
                            >
                                SELECTED INDEX &nbsp; <span className="font-bold text-gray-900">#{chunks.indexOf(selectedChunk) + 1}</span>
                            </div>
                        )}
                    </div>

                    <ChunkVisualizer
                        pdfUrl={pdfUrl}
                        initialChunks={chunks}
                        selectedChunk={selectedChunk}
                        onChunkSelect={setSelectedChunk}
                    />
                </div>

                {/* Right Panel: Details */}
                <div className="w-[260px] border-l border-gray-200 bg-white flex flex-col z-20">
                    <ChunkDetailPanel chunk={selectedChunk} onClose={() => setSelectedChunk(null)} />
                </div>
            </div>
        </div>
    )
}

export default function VisualizerPage() {
    return (
        <Suspense fallback={<div className="flex h-screen items-center justify-center bg-gray-50 text-gray-900"><LoadingSpinner size="lg" /></div>}>
            <VisualizerContent />
        </Suspense>
    )
}

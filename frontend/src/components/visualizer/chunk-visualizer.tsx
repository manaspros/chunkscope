"use client"

import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { useDebouncedCallback } from 'use-debounce'
import { useChunkStore, Chunk } from '@/stores/useChunkStore'
import { generateDistinctColors, isPointInRect } from '@/lib/chunk-utils'
import { AlertCircle } from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'

// Initialize PDF.js worker
// Important: This must match the pdfjs-dist version installed
// Hardcoded to 3.11.174 to match react-pdf@7.7.3 dependency
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js`;

interface PageOverlayProps {
    pageNumber: number
    scale: number
    chunks: Chunk[]
    hoveredChunk: Chunk | null
    selectedChunk: Chunk | null
    chunkColors: string[]
    setHoveredChunk: (chunk: Chunk | null) => void
    setSelectedChunk: (chunk: Chunk | null) => void
    onVisible: (pageNumber: number) => void
}

function PageOverlay({
    pageNumber,
    scale,
    chunks,
    hoveredChunk,
    selectedChunk,
    chunkColors,
    setHoveredChunk,
    setSelectedChunk,
    onVisible
}: PageOverlayProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const [pageDimensions, setPageDimensions] = useState<{ width: number, height: number } | null>(null)
    const pageRef = useRef<HTMLDivElement>(null)

    // Intersection Observer to track active page
    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
                    onVisible(pageNumber)
                }
            },
            { threshold: 0.5 }
        )

        if (pageRef.current) observer.observe(pageRef.current)
        return () => observer.disconnect()
    }, [pageNumber, onVisible])

    const drawOverlay = useCallback(() => {
        const canvas = canvasRef.current
        if (!canvas || !pageDimensions) return

        const ctx = canvas.getContext('2d', { alpha: true })
        if (!ctx) return

        const dpr = window.devicePixelRatio || 1
        const displayWidth = pageDimensions.width
        const displayHeight = pageDimensions.height

        canvas.width = displayWidth * dpr
        canvas.height = displayHeight * dpr
        canvas.style.width = `${displayWidth}px`
        canvas.style.height = `${displayHeight}px`
        ctx.scale(dpr, dpr)
        ctx.clearRect(0, 0, displayWidth, displayHeight)

        const pageChunks = chunks.filter(c =>
            (c.bbox?.page === pageNumber) ||
            (c.bboxes?.some(b => b.page === pageNumber))
        )

        pageChunks.forEach((chunk) => {
            const index = chunks.indexOf(chunk)
            const color = chunkColors[index % chunkColors.length]
            const isHovered = hoveredChunk?.id === chunk.id
            const isSelected = selectedChunk?.id === chunk.id

            const boxes = []
            if (chunk.bboxes && chunk.bboxes.length > 0) {
                boxes.push(...chunk.bboxes.filter(b => b.page === pageNumber))
            } else if (chunk.bbox && chunk.bbox.page === pageNumber) {
                boxes.push(chunk.bbox)
            }

            boxes.forEach(box => {
                const x = box.x * scale
                const y = box.y * scale
                const w = box.width * scale
                const h = box.height * scale

                ctx.fillStyle = isHovered ? color.replace(')', ', 0.4)') : color.replace(')', ', 0.15)')
                ctx.fillRect(x, y, w, h)

                ctx.lineWidth = isSelected ? 3 : 1
                ctx.strokeStyle = isSelected ? '#ffffff' : color
                ctx.strokeRect(x, y, w, h)

                if (isSelected) {
                    ctx.strokeStyle = color
                    ctx.lineWidth = 1
                    ctx.strokeRect(x - 2, y - 2, w + 4, h + 4)
                }
            })
        })
    }, [chunks, pageNumber, pageDimensions, scale, hoveredChunk, selectedChunk, chunkColors])

    useEffect(() => {
        drawOverlay()
    }, [drawOverlay])

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const rect = canvasRef.current?.getBoundingClientRect()
        if (!rect) return

        const mouseX = e.clientX - rect.left
        const mouseY = e.clientY - rect.top
        const pdfX = mouseX / scale
        const pdfY = mouseY / scale

        const pageChunks = chunks.filter(c =>
            (c.bbox?.page === pageNumber) ||
            (c.bboxes?.some(b => b.page === pageNumber))
        )

        let found: Chunk | null = null
        for (let i = pageChunks.length - 1; i >= 0; i--) {
            const c = pageChunks[i]
            let isHit = false

            if (c.bboxes && c.bboxes.length > 0) {
                isHit = c.bboxes.some(b =>
                    b.page === pageNumber &&
                    pdfX >= b.x && pdfX <= b.x + b.width &&
                    pdfY >= b.y && pdfY <= b.y + b.height
                )
            } else if (c.bbox && c.bbox.page === pageNumber) {
                isHit = (
                    pdfX >= c.bbox.x && pdfX <= c.bbox.x + c.bbox.width &&
                    pdfY >= c.bbox.y && pdfY <= c.bbox.y + c.bbox.height
                )
            }

            if (isHit) {
                found = c
                break
            }
        }

        if (found?.id !== hoveredChunk?.id) setHoveredChunk(found)
    }

    return (
        <div ref={pageRef} className="relative shadow-[0_0_50px_rgba(0,0,0,0.8)] bg-white mb-8 last:mb-0">
            <Page
                pageNumber={pageNumber}
                scale={scale}
                onLoadSuccess={(page) => setPageDimensions({ width: page.view[2] * scale, height: page.view[3] * scale })}
                className="bg-white"
                renderTextLayer={false}
                renderAnnotationLayer={false}
                devicePixelRatio={Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio : 1)}
            />
            <canvas
                ref={canvasRef}
                className="absolute top-0 left-0 w-full h-full cursor-crosshair touch-none mix-blend-multiply"
                onMouseMove={handleMouseMove}
                onMouseLeave={() => setHoveredChunk(null)}
                onClick={() => setSelectedChunk(hoveredChunk)}
            />
        </div>
    )
}

interface ChunkVisualizerProps {
    pdfUrl: string
    initialChunks?: Chunk[]
    selectedChunk?: Chunk | null
    onChunkSelect?: (chunk: Chunk | null) => void
    scale?: number
    onPageChange?: (page: number) => void
}

export function ChunkVisualizer({
    pdfUrl,
    initialChunks = [],
    selectedChunk: externalSelectedChunk = null,
    onChunkSelect,
    scale = 1.0,
    onPageChange
}: ChunkVisualizerProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const [numPages, setNumPages] = useState<number>(0)
    const [currentPage, setCurrentPage] = useState<number>(1)
    const [isPdfLoaded, setIsPdfLoaded] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const chunks = useChunkStore((s) => s.chunks)
    const setChunks = useChunkStore((s) => s.setChunks)
    const hoveredChunk = useChunkStore((s) => s.hoveredChunk)
    const selectedChunk = useChunkStore((s) => s.selectedChunk)
    const setHoveredChunk = useChunkStore((s) => s.setHoveredChunk)
    const setSelectedChunk = useChunkStore((s) => s.setSelectedChunk)

    // Sync external selection if provided
    useEffect(() => {
        if (externalSelectedChunk !== undefined && externalSelectedChunk !== selectedChunk) {
            setSelectedChunk(externalSelectedChunk)
        }
    }, [externalSelectedChunk, setSelectedChunk])

    // Sync internal selection to external if provided
    useEffect(() => {
        if (onChunkSelect && selectedChunk !== externalSelectedChunk) {
            onChunkSelect(selectedChunk)
        }
    }, [selectedChunk, onChunkSelect, externalSelectedChunk])

    useEffect(() => {
        if (initialChunks && initialChunks.length > 0) setChunks(initialChunks)
    }, [initialChunks, setChunks])

    const fileProp = useMemo(() => {
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
        return token ? { url: pdfUrl, httpHeaders: { Authorization: `Bearer ${token}` }, withCredentials: true } : pdfUrl
    }, [pdfUrl])

    const chunkColors = useMemo(() => generateDistinctColors(chunks.length > 0 ? chunks.length : 100), [chunks.length])

    return (
        <div
            ref={containerRef}
            className="flex-1 w-full bg-neutral-900 border border-neutral-800 rounded-xl overflow-auto shadow-2xl custom-scrollbar relative"
            style={{ minHeight: '100%', maxHeight: 'calc(100vh - 120px)' }}
        >
            {!isPdfLoaded && !error && (
                <div className="absolute inset-0 flex items-center justify-center text-neutral-500 gap-2 z-10 bg-neutral-900/50 backdrop-blur-sm">
                    <LoadingSpinner size="sm" />
                    <span>Loading PDF Pipeline...</span>
                </div>
            )}

            {error && (
                <div className="absolute inset-0 flex items-center justify-center text-red-500 bg-neutral-950/80 z-50 p-12 flex-col gap-6 backdrop-blur-md">
                    <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20">
                        <AlertCircle className="h-8 w-8 text-red-500" />
                    </div>
                    <div className="text-center max-w-md">
                        <h3 className="text-2xl font-bold text-white mb-2">Failed to Load Document</h3>
                        <p className="text-neutral-400 text-sm mb-6">Error: {error}</p>
                        <button onClick={() => window.location.reload()} className="px-6 py-2 bg-white text-black rounded-full font-semibold hover:bg-neutral-200 transition-colors">Retry Loading</button>
                    </div>
                </div>
            )}

            <div className="flex flex-col items-center p-8 bg-neutral-950 min-h-full">
                <Document
                    file={fileProp}
                    onLoadSuccess={({ numPages }) => { setNumPages(numPages); setIsPdfLoaded(true); }}
                    onLoadError={(err) => { setError(err.message); setIsPdfLoaded(true); }}
                    className="flex flex-col items-center"
                    loading={<div className="flex items-center justify-center p-24"><LoadingSpinner size="md" /></div>}
                >
                    {Array.from(new Array(numPages), (el, index) => (
                        <PageOverlay
                            key={`page_${index + 1}`}
                            pageNumber={index + 1}
                            scale={scale}
                            chunks={chunks}
                            hoveredChunk={hoveredChunk}
                            selectedChunk={selectedChunk}
                            chunkColors={chunkColors}
                            setHoveredChunk={setHoveredChunk}
                            setSelectedChunk={setSelectedChunk}
                            onVisible={(pg) => {
                                setCurrentPage(pg)
                                onPageChange?.(pg)
                            }}
                        />
                    ))}
                </Document>
            </div>

            {numPages > 0 && (
                <div className="fixed bottom-10 left-1/2 -translate-x-1/2 flex gap-6 items-center bg-black/90 px-6 py-3 rounded-full border border-white/10 backdrop-blur-xl shadow-2xl z-50 hover:border-gold/30 transition-colors">
                    <span className="text-sm font-mono text-gold/80 tracking-widest uppercase">
                        Archive View <span className="mx-2 text-zinc-700">|</span> PAGE {currentPage} of {numPages}
                    </span>
                </div>
            )}
        </div>
    )
}

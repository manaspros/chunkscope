import { useState } from 'react'
import { Settings2, Play, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { Card } from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useConfigStore, ChunkingMethod } from '@/stores/useConfigStore'
import { useChunkStore } from '@/stores/useChunkStore'
import { chunksApi } from '@/lib/api'
import { toast } from '@/components/ui/use-toast'

interface ChunkConfigPanelProps {
    documentId?: string | null
}

export function ChunkConfigPanel({ documentId }: ChunkConfigPanelProps) {
    const method = useConfigStore((s) => s.method)
    const setMethod = useConfigStore((s) => s.setMethod)
    const chunkSize = useConfigStore((s) => s.chunkSize)
    const setChunkSize = useConfigStore((s) => s.setChunkSize)
    const overlap = useConfigStore((s) => s.overlap)
    const setOverlap = useConfigStore((s) => s.setOverlap)
    const threshold = useConfigStore((s) => s.threshold)
    const setThreshold = useConfigStore((s) => s.setThreshold)

    const setChunks = useChunkStore((s) => s.setChunks)

    const [isProcessing, setIsProcessing] = useState(false)

    const handleApply = async () => {
        if (!documentId) {
            toast({
                title: "Configuration Error",
                description: "No document is linked to this pipeline.",
                variant: "destructive"
            })
            return
        }

        setIsProcessing(true)
        try {
            // Call API to generate chunks with current settings
            const data = await chunksApi.visualizeChunks(documentId, {
                method,
                chunk_size: chunkSize,
                overlap,
                threshold
            })

            // Update global store
            setChunks(data.chunks)

            toast({
                title: "Chunking Parameters Updated",
                description: `Generated ${data.chunks.length} chunks via ${method} method.`,
            })
        } catch (error) {
            console.error(error)
            toast({
                title: "Generation Failed",
                description: "Failed to generate new chunks. check console.",
                variant: "destructive"
            })
        } finally {
            setIsProcessing(false)
        }
    }

    return (
        <div
            className="w-full max-w-sm space-y-4 animate-slide-in-left"
        >
            <Card className="p-5 bg-neutral-900/80 backdrop-blur-md border-white/10 shadow-lg">
                <div className="flex items-center gap-2 mb-6">
                    <div className="p-2 rounded-md bg-amber-500/10 text-amber-500">
                        <Settings2 className="w-5 h-5" />
                    </div>
                    <h3 className="text-sm font-semibold text-white tracking-tight">Pipeline Configuration</h3>
                </div>

                <Tabs defaultValue="strategy" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 bg-black/40">
                        <TabsTrigger value="strategy">Strategy</TabsTrigger>
                        <TabsTrigger value="params">Parameters</TabsTrigger>
                    </TabsList>

                    <TabsContent value="strategy" className="space-y-5 mt-4">
                        <div className="space-y-3">
                            <Label className="text-xs text-neutral-400">Chunking Method</Label>
                            <Select value={method} onValueChange={(val) => setMethod(val as ChunkingMethod)}>
                                <SelectTrigger className="bg-black/20 border-white/10 text-white">
                                    <SelectValue placeholder="Select method" />
                                </SelectTrigger>
                                <SelectContent className="bg-neutral-900 border-white/10">
                                    <SelectItem value="semantic">Semantic (Embeddings)</SelectItem>
                                    <SelectItem value="recursive">Recursive Character</SelectItem>
                                    <SelectItem value="sentence_window">Sentence Window</SelectItem>
                                    <SelectItem value="paragraph">Paragraph</SelectItem>
                                    <SelectItem value="code_aware">Code Aware</SelectItem>
                                    <SelectItem value="heading_based">Heading Based</SelectItem>
                                </SelectContent>
                            </Select>

                            <div className="text-[10px] text-neutral-500 bg-white/5 p-2 rounded border border-white/5 flex gap-2 items-start">
                                <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                                {method === 'semantic' && "Splits text based on semantic similarity using embedding models."}
                                {method === 'fixed' && "Splits text into fixed-size windows with optional overlap."}
                                {method === 'recursive' && "Recursively splits by separators (\\n\\n, \\n, space) to fit window."}
                                {method === 'sentence_window' && "Creates overlapping windows of sentences."}
                                {method === 'paragraph' && "Splits text by double newlines, preserving paragraphs."}
                                {method === 'code_aware' && "Preserves code blocks and splits prose by paragraphs."}
                                {method === 'heading_based' && "Splits text by markdown headings (#, ##, ###)."}
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="params" className="space-y-6 mt-4">
                        {/* Chunk Size */}
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <Label className="text-xs text-neutral-400">Chunk Size (Tokens)</Label>
                                <span className="text-xs font-mono text-amber-500">{chunkSize}</span>
                            </div>
                            <Slider
                                min={128} max={2048} step={64}
                                value={[chunkSize]}
                                onValueChange={([val]) => setChunkSize(val)}
                                className="py-2"
                            />
                        </div>

                        {/* Overlap */}
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <Label className="text-xs text-neutral-400">Overlap Window</Label>
                                <span className="text-xs font-mono text-amber-500">{overlap}</span>
                            </div>
                            <Slider
                                min={0} max={512} step={16}
                                value={[overlap]}
                                onValueChange={([val]) => setOverlap(val)}
                                className="py-2"
                            />
                        </div>

                        {method === 'semantic' && (
                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <Label className="text-xs text-neutral-400">Semantic Threshold</Label>
                                    <span className="text-xs font-mono text-amber-500">{threshold}</span>
                                </div>
                                <Slider
                                    min={0.0} max={1.0} step={0.05}
                                    value={[threshold]}
                                    onValueChange={([val]) => setThreshold(val)}
                                    className="py-2"
                                />
                            </div>
                        )}
                    </TabsContent>
                </Tabs>

                <div className="mt-8">
                    <Button
                        variant="outline"
                        className="w-full border-gold/30 text-gold hover:bg-gold/10 hover:border-gold/50 font-semibold transition-all"
                        onClick={handleApply}
                        disabled={isProcessing || !documentId}
                    >
                        {isProcessing ? (
                            <span className="flex items-center gap-2">
                                <LoadingSpinner size="sm" /> Processing...
                            </span>
                        ) : (
                            <><Play className="w-4 h-4 mr-2" /> Re-Chunk Document</>
                        )}
                    </Button>
                </div>

            </Card>
        </div>
    )
}

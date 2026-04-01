"use client"

import { useState, useCallback, useRef } from "react"
import { Upload, FileText, Sparkles, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { useSuggestionStore } from "@/stores/useSuggestionStore"

export function DocumentInput() {
    const {
        documentText,
        setDocumentText,
        analyzeDocument,
        isProfilingLoading,
        isRecommendationLoading,
    } = useSuggestionStore()

    const [isDragging, setIsDragging] = useState(false)
    const [fileName, setFileName] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const isLoading = isProfilingLoading || isRecommendationLoading

    const handleFileRead = useCallback(
        (file: File) => {
            setFileName(file.name)
            const reader = new FileReader()
            reader.onload = (e) => {
                const text = e.target?.result as string
                if (text) {
                    setDocumentText(text)
                }
            }
            reader.readAsText(file)
        },
        [setDocumentText]
    )

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault()
            setIsDragging(false)
            const file = e.dataTransfer.files?.[0]
            if (file) handleFileRead(file)
        },
        [handleFileRead]
    )

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(true)
    }, [])

    const handleDragLeave = useCallback(() => {
        setIsDragging(false)
    }, [])

    const handleFileChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0]
            if (file) handleFileRead(file)
        },
        [handleFileRead]
    )

    const handleClear = useCallback(() => {
        setDocumentText("")
        setFileName(null)
        if (fileInputRef.current) fileInputRef.current.value = ""
    }, [setDocumentText])

    const handleAnalyze = useCallback(() => {
        if (documentText.trim()) {
            analyzeDocument(documentText.trim())
        }
    }, [documentText, analyzeDocument])

    return (
        <Card className="border-white/5 bg-zinc-900/50 backdrop-blur-sm">
            <CardContent className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                        Document Input
                    </h3>
                    {(documentText || fileName) && (
                        <button
                            onClick={handleClear}
                            className="text-zinc-500 hover:text-white transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {/* Dropzone */}
                <div
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    className={cn(
                        "relative border-2 border-dashed rounded-lg transition-all duration-200",
                        isDragging
                            ? "border-amber-500/50 bg-amber-500/5"
                            : "border-white/10 hover:border-white/20"
                    )}
                >
                    {!documentText ? (
                        <div className="flex flex-col items-center justify-center py-12 px-4">
                            <Upload className="w-8 h-8 text-zinc-500 mb-3" />
                            <p className="text-sm text-zinc-400 text-center">
                                Drag & drop a text file here, or{" "}
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="text-amber-500 hover:text-amber-400 font-medium underline underline-offset-2"
                                >
                                    browse
                                </button>
                            </p>
                            <p className="text-xs text-zinc-600 mt-1">
                                .txt, .md, .csv, .json supported
                            </p>
                        </div>
                    ) : (
                        <div className="p-3">
                            {fileName && (
                                <div className="flex items-center gap-2 mb-2 text-xs text-zinc-400">
                                    <FileText className="w-3.5 h-3.5" />
                                    <span>{fileName}</span>
                                </div>
                            )}
                            <Textarea
                                value={documentText}
                                onChange={(e) => setDocumentText(e.target.value)}
                                placeholder="Paste your document text here..."
                                className="min-h-[200px] bg-transparent border-0 resize-y focus-visible:ring-0 text-sm"
                            />
                        </div>
                    )}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".txt,.md,.csv,.json,.py,.js,.ts,.html,.xml"
                        onChange={handleFileChange}
                        className="hidden"
                    />
                </div>

                {/* Paste area when no file uploaded */}
                {!documentText && (
                    <Textarea
                        value={documentText}
                        onChange={(e) => setDocumentText(e.target.value)}
                        placeholder="Or paste your document text here..."
                        className="min-h-[120px] resize-y text-sm"
                    />
                )}

                {/* Analyze button */}
                <Button
                    onClick={handleAnalyze}
                    disabled={!documentText.trim() || isLoading}
                    className="w-full bg-amber-500 hover:bg-amber-600 text-black font-bold h-11"
                >
                    {isLoading ? (
                        <span className="flex items-center gap-2">
                            <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                            Analyzing...
                        </span>
                    ) : (
                        <span className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4" />
                            Analyze Document
                        </span>
                    )}
                </Button>
            </CardContent>
        </Card>
    )
}

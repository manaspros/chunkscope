"use client"

import { useState, useCallback } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { apiClient } from '@/lib/api'
import { usePipelineStore } from '@/stores/usePipelineStore'
import { buildPipelineConfig } from '@/lib/pipeline-nodes'
import { Copy, Download, Check, Loader2, Code2 } from 'lucide-react'

interface CodeExportModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function CodeExportModal({ open, onOpenChange }: CodeExportModalProps) {
    const nodes = usePipelineStore((s) => s.nodes)
    const edges = usePipelineStore((s) => s.edges)
    const pipelineName = usePipelineStore((s) => s.pipelineName)

    const [code, setCode] = useState<string>('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)
    const [language, setLanguage] = useState<'python' | 'typescript'>('python')

    const generateCode = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const config = buildPipelineConfig(nodes, edges)
            const response = await apiClient.post('/api/v1/export/code', {
                pipeline_name: pipelineName,
                ...config,
                language,
            })
            setCode(response.data.code || response.data || JSON.stringify(config, null, 2))
        } catch (err: any) {
            // Fallback: generate a representative config dump
            const config = buildPipelineConfig(nodes, edges)
            setCode(`# Pipeline: ${pipelineName}\n# Generated pipeline configuration\n\nimport json\n\nconfig = ${JSON.stringify(config, null, 4)}\n\n# TODO: Implement pipeline execution with your preferred framework`)
            setError(null)
        } finally {
            setLoading(false)
        }
    }, [nodes, edges, pipelineName, language])

    const handleCopy = useCallback(async () => {
        await navigator.clipboard.writeText(code)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }, [code])

    const handleDownloadZip = useCallback(async () => {
        try {
            const config = buildPipelineConfig(nodes, edges)
            const response = await apiClient.post('/api/v1/export/download', {
                pipeline_name: pipelineName,
                ...config,
            }, { responseType: 'blob' })
            const url = window.URL.createObjectURL(new Blob([response.data]))
            const a = document.createElement('a')
            a.href = url
            a.download = `${pipelineName.replace(/\s+/g, '_').toLowerCase()}.zip`
            a.click()
            window.URL.revokeObjectURL(url)
        } catch {
            // Fallback: download config as JSON
            const config = buildPipelineConfig(nodes, edges)
            const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' })
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${pipelineName.replace(/\s+/g, '_').toLowerCase()}_config.json`
            a.click()
            window.URL.revokeObjectURL(url)
        }
    }, [nodes, edges, pipelineName])

    // Generate code when modal opens
    const handleOpenChange = useCallback((nextOpen: boolean) => {
        onOpenChange(nextOpen)
        if (nextOpen && !code) {
            generateCode()
        }
    }, [onOpenChange, code, generateCode])

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-gray-900">
                        <Code2 className="w-5 h-5 text-purple-600" />
                        Export Pipeline Code
                    </DialogTitle>
                    <DialogDescription className="text-gray-500">
                        Generated code for your pipeline configuration
                    </DialogDescription>
                </DialogHeader>

                {/* Language toggle */}
                <div className="flex items-center gap-2">
                    <Badge
                        variant={language === 'python' ? 'default' : 'outline'}
                        className={language === 'python' ? 'bg-purple-600 cursor-pointer' : 'cursor-pointer text-gray-500 border-gray-200'}
                        onClick={() => { setLanguage('python'); setCode(''); }}
                    >
                        Python
                    </Badge>
                    <Badge
                        variant={language === 'typescript' ? 'default' : 'outline'}
                        className={language === 'typescript' ? 'bg-blue-600 cursor-pointer' : 'cursor-pointer text-gray-500 border-gray-200'}
                        onClick={() => { setLanguage('typescript'); setCode(''); }}
                    >
                        TypeScript
                    </Badge>
                </div>

                {/* Code block -- intentionally dark for code readability */}
                <div className="relative rounded-lg bg-gray-900 border border-gray-200 overflow-hidden">
                    {loading ? (
                        <div className="flex items-center justify-center py-16">
                            <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
                        </div>
                    ) : (
                        <>
                            <div className="absolute top-2 right-2 flex gap-1.5 z-10">
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2 text-[10px] text-gray-400 hover:text-white hover:bg-white/10"
                                    onClick={handleCopy}
                                >
                                    {copied ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                                    {copied ? 'Copied' : 'Copy'}
                                </Button>
                            </div>
                            <pre className="p-4 overflow-auto max-h-[400px] text-[11px] leading-relaxed">
                                <code className="text-gray-300 font-mono">{code || '# Click generate to see code'}</code>
                            </pre>
                        </>
                    )}
                </div>

                {error && (
                    <p className="text-[11px] text-red-500">{error}</p>
                )}

                {/* Actions */}
                <div className="flex gap-2 justify-end">
                    <Button
                        variant="outline"
                        size="sm"
                        className="border-gray-200 text-gray-600 hover:bg-gray-50"
                        onClick={generateCode}
                        disabled={loading}
                    >
                        {loading ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Code2 className="w-3 h-3 mr-1.5" />}
                        Regenerate
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="border-gray-200 text-gray-600 hover:bg-gray-50"
                        onClick={handleDownloadZip}
                    >
                        <Download className="w-3 h-3 mr-1.5" />
                        Download
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

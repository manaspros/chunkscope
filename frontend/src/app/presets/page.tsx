"use client"

import React, { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"


import { ArrowLeft, BookOpen, FileText, Scale, Stethoscope, Code, ExternalLink } from "lucide-react"
import { DocumentSelectionModal } from "@/components/presets/DocumentSelectionModal"
import { presetsApi } from "@/lib/api"
import { useToast } from "@/components/ui/use-toast"

const presets = [
    {
        id: "legal-contracts",
        title: "Legal Contracts",
        description: "Optimized for dense legal text with overlap for clause continuity.",
        icon: Scale,
        color: "text-blue-600",
        bg: "bg-blue-50",
        border: "group-hover:border-blue-300",
        config: { method: "recursive", size: 1024, overlap: 200 }
    },
    {
        id: "medical-research",
        title: "Medical Research",
        description: "Preserves context for complex medical terminology and citations.",
        icon: Stethoscope,
        color: "text-green-600",
        bg: "bg-green-50",
        border: "group-hover:border-green-300",
        config: { method: "semantic", size: 512, overlap: 50 }
    },
    {
        id: "technical-docs",
        title: "Technical Documentation",
        description: "Handles code blocks and technical specifications with precision.",
        icon: Code,
        color: "text-orange-600",
        bg: "bg-orange-50",
        border: "group-hover:border-orange-300",
        config: { method: "markdown", size: 512, overlap: 100 }
    },
    {
        id: "academic-papers",
        title: "Academic Papers",
        description: "Ideal for two-column layouts and dense academic writing.",
        icon: BookOpen,
        color: "text-purple-600",
        bg: "bg-purple-50",
        border: "group-hover:border-purple-300",
        config: { method: "recursive", size: 800, overlap: 150 }
    },
    {
        id: "financial-reports",
        title: "Financial Reports",
        description: "Maintains tabular data structure and numerical context.",
        icon: FileText,
        color: "text-amber-600",
        bg: "bg-amber-50",
        border: "group-hover:border-amber-300",
        config: { method: "semantic", size: 400, overlap: 50 }
    }
]

export default function PresetsPage() {
    const router = useRouter()
    const { toast } = useToast()
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [selectedPreset, setSelectedPreset] = useState<any | null>(null)
    const [isApplying, setIsApplying] = useState(false)

    const handlePresetClick = (preset: any) => {
        setSelectedPreset(preset)
        setIsModalOpen(true)
    }

    const handleUploadSuccess = async (documentId: string) => {
        if (!selectedPreset) return

        setIsApplying(true)
        try {
            // Apply preset using 'default' ID with custom configuration override
            const result = await presetsApi.applyPreset(
                "default",
                `${selectedPreset.title} - ${new Date().toLocaleDateString()}`,
                documentId,
                selectedPreset.config
            )

            toast({
                title: "Template Applied",
                description: `Pipeline "${result.pipeline_name}" created successfully.`,
            })

            // Redirect to visualizer with the new document
            router.push(`/visualizer?docId=${documentId}`)
        } catch (error: any) {
            console.error("Failed to apply preset:", error)
            toast({
                title: "Error Applying Template",
                description: error.response?.data?.detail || "Failed to create pipeline from template.",
                variant: "destructive"
            })
        } finally {
            setIsApplying(false)
            setIsModalOpen(false)
        }
    }

    return (
        <div className="relative min-h-screen bg-gray-50 font-sans text-gray-900 overflow-x-hidden">
                <div className="relative z-10 p-8 max-w-7xl mx-auto">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-12">
                        <Link href="/dashboard" className="group flex items-center text-gray-400 hover:text-gray-900 transition-colors">
                            <ArrowLeft className="w-5 h-5 mr-2 group-hover:-translate-x-1 transition-transform" />
                            Back to Dashboard
                        </Link>
                        <h1 className="text-4xl font-bold tracking-tight text-gray-900 mb-2">
                            Pipeline <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-600">Presets</span>
                        </h1>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {presets.map((preset) => (
                            <div
                                key={preset.id}
                                onClick={() => handlePresetClick(preset)}
                                className={`group relative p-6 rounded-xl bg-white border border-gray-200 ${preset.border} hover:shadow-md hover:scale-[1.02] active:scale-95 transition-all cursor-pointer overflow-hidden`}
                            >
                                <div className="relative z-10">
                                    <div className={`w-12 h-12 rounded-xl ${preset.bg} flex items-center justify-center mb-6 ring-1 ring-gray-200`}>
                                        <preset.icon className={`w-6 h-6 ${preset.color}`} />
                                    </div>

                                    <h3 className="text-xl font-bold text-gray-900 mb-2">{preset.title}</h3>
                                    <p className="text-gray-500 text-sm mb-6 min-h-[40px]">{preset.description}</p>

                                    <div className="space-y-2 mb-6 p-3 rounded-lg bg-gray-50 border border-gray-200 font-mono text-xs text-gray-400">
                                        <div className="flex justify-between">
                                            <span>Method:</span>
                                            <span className="text-gray-900 font-bold uppercase tracking-widest">{preset.config.method}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>Size:</span>
                                            <span className="text-gray-900 font-bold">{preset.config.size}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>Overlap:</span>
                                            <span className="text-gray-900 font-bold">{preset.config.overlap}</span>
                                        </div>
                                    </div>

                                    <div className={`flex items-center text-xs font-bold ${preset.color} uppercase tracking-widest opacity-80 group-hover:opacity-100 group-hover:gap-2 transition-all gap-1`}>
                                        Use Template <ExternalLink className="w-3 h-3" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {isModalOpen && (
                        <DocumentSelectionModal
                            isOpen={isModalOpen}
                            onClose={() => setIsModalOpen(false)}
                            onSuccess={handleUploadSuccess}
                            onUseDemo={() => {
                                // Placeholder for demo doc functionality
                                toast({ title: "Demo Mode", description: "Demo document selected. Applying template..." })
                                handleUploadSuccess("demo-id")
                            }}
                            presetName={selectedPreset?.title || ""}
                        />
                    )}
            </div>
    )
}

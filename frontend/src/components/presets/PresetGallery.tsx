import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { presetsApi, analyzerApi } from '@/lib/api';
import { Loader2, Check, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useToast } from "@/components/ui/use-toast"
import { DocumentSelectionModal } from './DocumentSelectionModal';

interface Preset {
    id: string;
    name: string;
    category: string;
    description: string;
    tags: string[];
    expected_metrics?: {
        accuracy_range: [number, number];
        avg_latency_ms: number;
        cost_per_1k_queries: number;
    };
}

export function PresetGallery() {
    const [presets, setPresets] = useState<Preset[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [applyingId, setApplyingId] = useState<string | null>(null);
    // New state for document selection
    const [selectedPreset, setSelectedPreset] = useState<Preset | null>(null);
    const [isDocModalOpen, setIsDocModalOpen] = useState(false);

    const router = useRouter();
    const { toast } = useToast()

    useEffect(() => {
        loadPresets();
    }, [selectedCategory]);

    const loadPresets = async () => {
        setLoading(true);
        try {
            const data = await presetsApi.listPresets(selectedCategory || undefined);
            setPresets(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error("Failed to load presets:", error);
            toast({
                title: "Error",
                description: "Failed to load presets. Please try again.",
                variant: "destructive"
            });
        } finally {
            setLoading(false);
        }
    };

    const handlePresetClick = (preset: Preset) => {
        // Open document selection modal
        setSelectedPreset(preset);
        setIsDocModalOpen(true);
    };

    const createPipeline = async (preset: Preset, documentId?: string) => {
        setApplyingId(preset.id);
        setIsDocModalOpen(false); // Close modal if open

        try {
            console.log('Creating pipeline from preset:', preset.id, documentId ? `with doc ${documentId}` : 'with demo doc');

            // If we have a custom document, we must use an endpoint that supports it.
            // The backend `POST /presets/{id}/apply` endpoint supports `document_id` query param.
            // We need to make sure `presetsApi.applyPreset` forwards this argument.
            // If it doesn't yet, we will fix api.ts next.
            // Assuming we will fix it, let's call it correctly here.

            const pipelineName = `${preset.name} Pipeline${documentId ? ' (Custom)' : ''}`;
            const response = await presetsApi.applyPreset(preset.id, pipelineName, documentId);

            console.log('API response:', response);

            toast({
                title: "Success",
                description: "Pipeline created successfully!",
            });

            // Navigate to pipeline visualizer
            if (response && response.id) {
                router.push(`/visualizer?pipeline_id=${response.id}`);
            } else {
                console.warn('Pipeline created but no ID returned:', response);
                router.push("/visualizer");
            }

        } catch (error: any) {
            console.error('===== PRESET APPLICATION ERROR =====');
            let errorDetail = error.response?.data?.detail || error.response?.data?.error || error.message || "Failed to create pipeline from preset.";

            if (typeof errorDetail !== 'string') {
                errorDetail = JSON.stringify(errorDetail);
            }

            toast({
                title: "Error",
                description: errorDetail,
                variant: "destructive"
            });
        } finally {
            setApplyingId(null);
            setSelectedPreset(null);
        }
    };

    const categories = ['qa', 'search', 'chatbot', 'analysis'];

    return (
        <div className="preset-gallery w-full max-w-7xl mx-auto p-6">
            <div className="filter-bar mb-8 space-y-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight text-white">Template Library</h2>
                        <p className="text-zinc-400 mt-1">Start with a pre-configured RAG pipeline optimized for your use case.</p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Button
                            variant={selectedCategory === null ? 'secondary' : 'outline'}
                            onClick={() => setSelectedCategory(null)}
                            className="rounded-full"
                        >
                            All
                        </Button>
                        {categories.map(cat => (
                            <Button
                                key={cat}
                                variant={selectedCategory === cat ? 'secondary' : 'outline'}
                                onClick={() => setSelectedCategory(cat)}
                                className="rounded-full capitalize"
                            >
                                {cat}
                            </Button>
                        ))}
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center items-center py-20">
                    <Loader2 className="h-10 w-10 animate-spin text-amber-500" />
                </div>
            ) : presets.length === 0 ? (
                <div className="text-center py-20 text-zinc-500">
                    No presets found for this category.
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {presets.map(preset => (
                        <Card key={preset.id} className="preset-card bg-black/40 border-white/10 hover:border-amber-500/50 transition-all hover:shadow-[0_0_20px_rgba(245,158,11,0.1)] flex flex-col">
                            <CardHeader className="pb-3">
                                <div className="flex justify-between items-start gap-2">
                                    <Badge variant="outline" className="border-amber-500/30 text-amber-500 capitalize mb-2">
                                        {preset.category}
                                    </Badge>
                                </div>
                                <CardTitle className="text-xl text-white">{preset.name}</CardTitle>
                                <CardDescription className="text-zinc-400 line-clamp-2 min-h-[40px]">
                                    {preset.description}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="flex-1">
                                <div className="flex flex-wrap gap-2 mb-4">
                                    {preset.tags.slice(0, 3).map(tag => (
                                        <Badge key={tag} variant="secondary" className="bg-zinc-800 text-zinc-300 hover:bg-zinc-700">
                                            {tag}
                                        </Badge>
                                    ))}
                                    {preset.tags.length > 3 && (
                                        <Badge variant="secondary" className="bg-zinc-800 text-zinc-300">+{preset.tags.length - 3}</Badge>
                                    )}
                                </div>

                                {preset.expected_metrics && (
                                    <div className="metrics text-xs space-y-2 p-3 rounded-lg bg-black/20 border border-white/5">
                                        <div className="flex justify-between items-center">
                                            <span className="text-zinc-500">Accuracy</span>
                                            <span className="font-medium text-emerald-400">
                                                {Math.round(preset.expected_metrics.accuracy_range[0] * 100)}% - {Math.round(preset.expected_metrics.accuracy_range[1] * 100)}%
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-zinc-500">Latency</span>
                                            <span className="font-medium text-white">
                                                ~{preset.expected_metrics.avg_latency_ms}ms
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-zinc-500">Cost</span>
                                            <span className="font-medium text-white">
                                                ${preset.expected_metrics.cost_per_1k_queries}/1k
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                            <CardFooter className="pt-0">
                                <Button
                                    onClick={() => handlePresetClick(preset)}
                                    disabled={applyingId === preset.id}
                                    className="w-full bg-white text-black hover:bg-zinc-200"
                                >
                                    {applyingId === preset.id ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Creating Pipeline...
                                        </>
                                    ) : (
                                        <>
                                            Use Template
                                            <ArrowRight className="ml-2 h-4 w-4" />
                                        </>
                                    )}
                                </Button>
                            </CardFooter>
                        </Card>
                    ))}
                </div>
            )}



            {selectedPreset && (
                <DocumentSelectionModal
                    isOpen={isDocModalOpen}
                    onClose={() => setIsDocModalOpen(false)}
                    presetName={selectedPreset.name}
                    onSuccess={(docId) => createPipeline(selectedPreset, docId)}
                    onUseDemo={() => createPipeline(selectedPreset)}
                />
            )}
        </div>
    );
}

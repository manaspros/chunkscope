"use client"

import { BaseNode } from './base-node'
import { Search } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'

export function RetrievalNode({ data, selected }: any) {
    return (
        <BaseNode
            label={data.label || 'Retrieval'}
            icon={<Search className="w-4 h-4" />}
            selected={selected}
            inputs={1}
            outputs={1}
            className="border-cyan-900/50"
        >
            <div className="flex flex-col gap-3 min-w-[180px]">
                <div className="flex flex-col gap-1.5">
                    <Label className="text-[10px] uppercase text-neutral-500 font-bold">Search Type</Label>
                    <Select
                        defaultValue={data.retrieval_method || "semantic"}
                        onValueChange={(val) => data.onChange?.({ ...data, retrieval_method: val })}
                    >
                        <SelectTrigger className="h-8 bg-gray-50 border-gray-200 text-xs">
                            <SelectValue placeholder="Type" />
                        </SelectTrigger>
                        <SelectContent className="bg-white border-gray-200 text-gray-900 text-xs">
                            <SelectItem value="semantic">Semantic (Vector)</SelectItem>
                            <SelectItem value="keyword">Keyword (BM25)</SelectItem>
                            <SelectItem value="hybrid">Hybrid</SelectItem>
                            <SelectItem value="mmr">MMR (Diversity)</SelectItem>
                            <SelectItem value="parent_document">Parent Document</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center">
                        <Label className="text-[10px] uppercase text-neutral-500 font-bold">Top K</Label>
                        <span className="text-[10px] text-cyan-400 font-mono">{data.top_k || 5}</span>
                    </div>
                    <Slider
                        defaultValue={[data.top_k || 5]}
                        max={20}
                        step={1}
                        className="py-2"
                        onValueChange={([val]) => data.onChange?.({ ...data, top_k: val })}
                    />
                </div>

                {(data.retrieval_method === 'hybrid' || data.retrieval_method === 'keyword') && (
                    <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between items-center">
                            <Label className="text-[10px] uppercase text-neutral-500 font-bold">Alpha (Vector weight)</Label>
                            <span className="text-[10px] text-cyan-400 font-mono">{data.alpha ?? 0.7}</span>
                        </div>
                        <Slider
                            defaultValue={[data.alpha ?? 0.7]}
                            max={1}
                            min={0}
                            step={0.05}
                            className="py-2"
                            onValueChange={([val]) => data.onChange?.({ ...data, alpha: val })}
                        />
                    </div>
                )}

                {data.retrieval_method === 'mmr' && (
                    <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between items-center">
                            <Label className="text-[10px] uppercase text-neutral-500 font-bold">Lambda (Diversity)</Label>
                            <span className="text-[10px] text-cyan-400 font-mono">{data.lambda_mult ?? 0.5}</span>
                        </div>
                        <Slider
                            defaultValue={[data.lambda_mult ?? 0.5]}
                            max={1}
                            min={0}
                            step={0.05}
                            className="py-2"
                            onValueChange={([val]) => data.onChange?.({ ...data, lambda_mult: val })}
                        />
                    </div>
                )}

                <div className="flex flex-col gap-1.5 border-t border-gray-200 pt-3 mt-1">
                    <Label className="text-[10px] uppercase text-cyan-500/80 font-bold">Query Augmentation</Label>
                    <Select
                        defaultValue={data.augmentation_method || "none"}
                        onValueChange={(val) => data.onChange?.({ ...data, augmentation_method: val === "none" ? null : val })}
                    >
                        <SelectTrigger className="h-8 bg-gray-50 border-gray-200 text-xs">
                            <SelectValue placeholder="None" />
                        </SelectTrigger>
                        <SelectContent className="bg-white border-gray-200 text-gray-900 text-xs">
                            <SelectItem value="none">None</SelectItem>
                            <SelectItem value="multi_query">Multi-Query (RRF)</SelectItem>
                            <SelectItem value="hyde">HyDE (Hypothetical)</SelectItem>
                            <SelectItem value="expansion">Expansion</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {data.augmentation_method === 'multi_query' && (
                    <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between items-center">
                            <Label className="text-[10px] uppercase text-neutral-500 font-bold">Variants</Label>
                            <span className="text-[10px] text-cyan-400 font-mono">{data.num_variants ?? 3}</span>
                        </div>
                        <Slider
                            defaultValue={[data.num_variants ?? 3]}
                            max={5}
                            min={2}
                            step={1}
                            className="py-1"
                            onValueChange={([val]) => data.onChange?.({ ...data, num_variants: val })}
                        />
                    </div>
                )}
            </div>

            {/* Results Display for Augmentations */}
            {data.augmentations && data.augmentations.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-200">
                    <Label className="text-[10px] uppercase text-green-500 font-bold mb-1 block">Generated Variants</Label>
                    <div className="flex flex-col gap-1">
                        {data.augmentations.map((variant: string, idx: number) => (
                            <div key={idx} className="bg-gray-50 p-1.5 rounded text-[10px] font-mono text-gray-700 border border-gray-200">
                                {variant}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </BaseNode>
    )
}

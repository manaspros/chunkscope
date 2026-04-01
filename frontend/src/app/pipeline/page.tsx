"use client"

import { PipelineBuilder } from '@/components/pipeline/pipeline-builder'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function PipelinePage() {
    return (
        <div className="relative h-screen w-screen flex flex-col bg-black overflow-hidden font-sans">
            {/* Fixed Background */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute inset-0 bg-black" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(168,85,247,0.04)_0%,transparent_50%)]" />
            </div>

            {/* Mini Header */}
            <header className="relative z-20 h-12 border-b border-white/5 flex items-center px-4 bg-black/40 backdrop-blur-xl shrink-0">
                <Link href="/dashboard" className="p-1.5 -ml-1 rounded-lg hover:bg-white/5 transition-colors text-zinc-500 hover:text-white mr-4">
                    <ArrowLeft className="w-4 h-4" />
                </Link>
                <h1 className="text-[10px] font-black text-white tracking-[0.2em] uppercase">
                    Orchestration <span className="text-electric">Terminal</span>
                </h1>
                <div className="ml-auto text-[9px] text-zinc-500 font-bold uppercase tracking-widest flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-electric animate-pulse" />
                    Live Draft
                </div>
            </header>

            {/* Builder Canvas */}
            <main className="relative z-10 flex-1 overflow-hidden">
                <PipelineBuilder />
            </main>
        </div>
    )
}

"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default function NotFound() {
    return (
        <div className="relative min-h-screen bg-black text-white font-sans flex items-center justify-center overflow-hidden">

            {/* Background */}
            <div className="fixed inset-0 z-0 pointer-events-none opacity-50">
                <div className="absolute inset-0 bg-black" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(245,158,11,0.06)_0%,transparent_60%)]" />
            </div>

            <div className="relative z-10 text-center space-y-8 p-6 max-w-lg">
                <div className="space-y-2">
                    <h1 className="text-9xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-white/10 select-none">
                        404
                    </h1>
                    <div className="w-16 h-1 bg-amber-500 mx-auto rounded-full" />
                </div>

                <div className="space-y-4">
                    <h2 className="text-2xl font-bold tracking-tight text-white">
                        Vector Space Anomaly Detected
                    </h2>
                    <p className="text-zinc-400 text-sm leading-relaxed">
                        The requested semantic chunk could not be retrieved from the index. It may have been pruned or never existed.
                    </p>
                </div>

                <div className="pt-4">
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 px-6 py-3 bg-white text-black text-sm font-bold rounded-full hover:scale-105 transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)] group"
                    >
                        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                        Return to Dashboard
                    </Link>
                </div>
            </div>
        </div>
    )
}

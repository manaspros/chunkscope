"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default function NotFound() {
    return (
        <div className="relative min-h-screen bg-gray-50 text-gray-900 font-sans flex items-center justify-center overflow-hidden">

            <div className="relative z-10 text-center space-y-8 p-6 max-w-lg">
                <div className="space-y-2">
                    <h1 className="text-9xl font-black tracking-tighter text-gray-200 select-none">
                        404
                    </h1>
                    <div className="w-16 h-1 bg-amber-500 mx-auto rounded-full" />
                </div>

                <div className="space-y-4">
                    <h2 className="text-2xl font-bold tracking-tight text-gray-900">
                        Page Not Found
                    </h2>
                    <p className="text-gray-500 text-sm leading-relaxed">
                        The requested page could not be found. It may have been moved or never existed.
                    </p>
                </div>

                <div className="pt-4">
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 px-6 py-3 bg-gray-900 text-white text-sm font-bold rounded-full hover:bg-gray-800 hover:scale-105 transition-all shadow-sm group"
                    >
                        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                        Return to Dashboard
                    </Link>
                </div>
            </div>
        </div>
    )
}

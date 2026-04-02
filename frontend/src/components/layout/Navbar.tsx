"use client";

import React from "react";
import Link from "next/link";
import { Github } from "lucide-react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function Navbar() {
    const pathname = usePathname();

    const isActive = (path: string) => pathname === path;

    return (
        <header className="w-full h-20 border-b border-white/5 bg-zinc-950/20 backdrop-blur-2xl sticky top-0 z-50">
            <div className="container mx-auto px-6 h-full flex items-center justify-between">
                <Link href="/" className="flex items-center gap-2 font-black tracking-tighter text-white hover:opacity-80 transition-opacity">
                    <span className="text-2xl">Chunk<span className="text-amber-500">Scope</span></span>
                </Link>

                <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-zinc-400">
                    <Link
                        href="/pipeline"
                        className={cn("hover:text-white transition-colors", isActive('/pipeline') && "text-white font-semibold")}
                    >
                        Builder
                    </Link>
                    <Link
                        href="/projects"
                        className={cn("hover:text-white transition-colors", isActive('/projects') && "text-white font-semibold")}
                    >
                        Projects
                    </Link>
                    <Link
                        href="/suggestions"
                        className={cn("hover:text-white transition-colors", isActive('/suggestions') && "text-white font-semibold")}
                    >
                        AI Suggestions
                    </Link>
                    <Link
                        href="/evaluation"
                        className={cn("hover:text-white transition-colors", isActive('/evaluation') && "text-white font-semibold")}
                    >
                        Evaluation
                    </Link>
                    <Link
                        href="/visualizer"
                        className={cn("hover:text-white transition-colors", isActive('/visualizer') && "text-white font-semibold")}
                    >
                        Visualizer
                    </Link>
                    <Link
                        href="/presets"
                        className={cn("hover:text-white transition-colors", isActive('/presets') && "text-white font-semibold")}
                    >
                        Templates
                    </Link>
                    <Link
                        href="/guide"
                        className={cn("hover:text-white transition-colors", isActive('/guide') && "text-white font-semibold")}
                    >
                        Strategy Guide
                    </Link>
                </nav>

                <div className="flex items-center gap-4">
                    <Link href="/dashboard">
                        <Button
                            className="bg-white text-black hover:bg-zinc-200 h-9 px-4 rounded-full text-xs font-bold"
                        >
                            Dashboard
                        </Button>
                    </Link>

                    <Link href="https://github.com/1Ash0/chunkscope" className="text-zinc-400 hover:text-white transition-colors">
                        <Github className="h-5 w-5" />
                    </Link>
                </div>
            </div>
        </header>
    );
}

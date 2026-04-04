"use client";

import React from "react";
import Link from "next/link";
import { Github } from "lucide-react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function Navbar() {
    const pathname = usePathname();

    const isActive = (path: string) =>
        pathname === path || (path !== '/' && pathname.startsWith(path));

    return (
        <header className="w-full h-16 border-b border-gray-200 bg-white/80 backdrop-blur-xl sticky top-0 z-50">
            <div className="container mx-auto px-6 h-full flex items-center justify-between">
                <Link href="/" className="flex items-center gap-2 font-black tracking-tighter text-gray-900 hover:opacity-80 transition-opacity">
                    <span className="text-2xl">Chunk<span className="text-amber-600">Scope</span></span>
                </Link>

                <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-500">
                    <Link
                        href="/projects"
                        className={cn(
                            "hover:text-gray-900 transition-colors",
                            isActive('/projects') && "text-amber-600 font-semibold"
                        )}
                    >
                        Projects
                    </Link>
                    <Link
                        href="/pipeline"
                        className={cn("hover:text-gray-900 transition-colors", isActive('/pipeline') && "text-gray-900 font-semibold")}
                    >
                        Pipeline Builder
                    </Link>
                    <Link
                        href="/guide"
                        className={cn("hover:text-gray-900 transition-colors", isActive('/guide') && "text-gray-900 font-semibold")}
                    >
                        Strategy Guide
                    </Link>
                </nav>

                <div className="flex items-center gap-4">
                    <Link href="/dashboard">
                        <Button
                            className={cn(
                                "h-9 px-4 rounded-full text-xs font-bold",
                                isActive('/dashboard')
                                    ? "bg-amber-600 text-white hover:bg-amber-500"
                                    : "bg-gray-900 text-white hover:bg-gray-800"
                            )}
                        >
                            Dashboard
                        </Button>
                    </Link>

                    <Link href="https://github.com/1Ash0/chunkscope" className="text-gray-400 hover:text-gray-900 transition-colors">
                        <Github className="h-5 w-5" />
                    </Link>
                </div>
            </div>
        </header>
    );
}

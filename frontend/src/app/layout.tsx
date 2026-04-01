import type { Metadata } from "next";
import { Inter, Rajdhani, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/toaster"

import { GlobalErrorBoundary } from "@/components/debug/GlobalErrorBoundary"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const rajdhani = Rajdhani({ weight: ["300", "400", "500", "600", "700"], subsets: ["latin"], variable: "--font-rajdhani" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
    title: "ChunkScope - RAG Visualization",
    description: "Visual debugging for Retrieval Augmented Generation pipelines",
};

import { GlobalBackground } from "@/components/ui/global-background"

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" className="dark scroll-smooth">
            <body className={cn(inter.variable, rajdhani.variable, jetbrainsMono.variable, "bg-background text-foreground min-h-screen antialiased selection:bg-amber-500/30 font-sans")}>
                <GlobalBackground />
                <GlobalErrorBoundary>
                    {children}
                </GlobalErrorBoundary>
                <Toaster />
            </body>
        </html>
    );
}

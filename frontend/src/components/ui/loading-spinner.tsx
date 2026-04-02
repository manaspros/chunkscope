"use client"

import { cn } from "@/lib/utils"

interface LoadingSpinnerProps {
    className?: string
    size?: "sm" | "md" | "lg" | "xl"
}

export function LoadingSpinner({ className, size = "md" }: LoadingSpinnerProps) {
    const sizeClasses = {
        sm: "w-4 h-4",
        md: "w-8 h-8",
        lg: "w-12 h-12",
        xl: "w-16 h-16"
    }

    return (
        <div className={cn("relative flex items-center justify-center", sizeClasses[size], className)}>
            {/* Outer Ring */}
            <div
                className="absolute inset-0 border-2 border-transparent border-t-gold border-r-gold/30 rounded-full animate-spinner-outer"
            />

            {/* Middle Ring (Opposite direction) */}
            <div
                className="absolute inset-1 border-2 border-transparent border-b-electric border-l-electric/30 rounded-full animate-spinner-inner"
            />

            {/* Inner Core (Pulsing) */}
            <div
                className="absolute w-[30%] h-[30%] bg-white rounded-full animate-spinner-core"
            />
        </div>
    )
}

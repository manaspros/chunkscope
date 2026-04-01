"use client"

import { useEffect, useState } from 'react'

export function usePerformanceMonitor() {
    const [fps, setFps] = useState(60)
    const [memory, setMemory] = useState({ geometries: 0, textures: 0 })

    useEffect(() => {
        let lastTime = performance.now()
        let frames = 0
        let animId: number

        const measure = () => {
            const time = performance.now()
            frames++
            if (time >= lastTime + 1000) {
                setFps(Math.round((frames * 1000) / (time - lastTime)))
                frames = 0
                lastTime = time
            }
            animId = requestAnimationFrame(measure)
        }

        animId = requestAnimationFrame(measure)
        return () => cancelAnimationFrame(animId)
    }, [])

    return { fps, memory }
}

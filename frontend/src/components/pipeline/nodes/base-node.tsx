import { ReactNode } from 'react'
import { Handle, Position } from 'reactflow'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface BaseNodeProps {
    label: string
    icon?: ReactNode
    selected?: boolean
    inputs?: number
    outputs?: number
    children?: ReactNode
    className?: string
}

export function BaseNode({
    label,
    icon,
    selected,
    inputs = 1,
    outputs = 1,
    children,
    className
}: BaseNodeProps) {
    return (
        <div className={cn(
            "relative min-w-[200px] shadow-lg transition-all",
            selected ? "ring-2 ring-primary ring-offset-2 ring-offset-white" : ""
        )}>
            {/* Input Handles */}
            {Array.from({ length: inputs }).map((_, i) => (
                <Handle
                    key={`in-${i}`}
                    type="target"
                    position={Position.Left}
                    className="w-3 h-3 bg-gray-400 border-2 border-white"
                    style={{ top: `${((i + 1) * 100) / (inputs + 1)}%` }}
                />
            ))}

            <Card className={cn("bg-white border-gray-200 text-gray-900", className)}>
                <CardHeader className="p-3 border-b border-gray-100 flex flex-row items-center gap-2 space-y-0">
                    {icon && <span className="text-gray-500">{icon}</span>}
                    <CardTitle className="text-sm font-medium">{label}</CardTitle>
                </CardHeader>
                <CardContent className="p-3">
                    {children}
                </CardContent>
            </Card>

            {/* Output Handles */}
            {Array.from({ length: outputs }).map((_, i) => (
                <Handle
                    key={`out-${i}`}
                    type="source"
                    position={Position.Right}
                    className="w-3 h-3 bg-primary border-2 border-white"
                    style={{ top: `${((i + 1) * 100) / (outputs + 1)}%` }}
                />
            ))}
        </div>
    )
}

import { FileText } from 'lucide-react'
import { BaseNode } from './base-node'
import { NodeProps } from 'reactflow'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { usePipelineStore } from '@/stores/usePipelineStore'

export function LoaderNode({ id, data, selected }: NodeProps) {
    const updateNodeData = usePipelineStore(state => state.updateNodeData)

    return (
        <BaseNode
            label="Document Loader"
            icon={<FileText className="w-4 h-4" />}
            selected={selected}
            inputs={0}
            outputs={1}
            className="border-blue-500/50"
        >
            <div className="flex flex-col gap-2 min-w-[180px]">
                <div className="flex flex-col gap-1">
                    <Label className="text-[10px] uppercase text-neutral-500 font-bold">File Path (Absolute)</Label>
                    <Input
                        className="h-6 text-[10px] bg-gray-50 border-gray-200"
                        placeholder="C:/path/to/doc.pdf"
                        defaultValue={data.path || "C:/Users/ASMIT/Downloads/sample.pdf"}
                        onChange={(e) => {
                            updateNodeData(id, { path: e.target.value })
                        }}
                    />
                </div>
                <div className="text-[10px] text-gray-500">
                    <p>Type: <span className="text-blue-400">PDF</span></p>
                </div>
            </div>
        </BaseNode>
    )
}

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
    Node,
    Edge,
    applyNodeChanges,
    applyEdgeChanges,
    NodeChange,
    EdgeChange,
    Connection,
    addEdge
} from 'reactflow';

export type NodeExecutionState = 'idle' | 'running' | 'complete' | 'error';

export interface NodeDataPreview {
    type: string;
    data: any;
    timestamp: number;
}

interface PipelineState {
    // Pipeline metadata
    pipelineName: string;
    pipelineId: string | null;
    projectId: string | null;

    // Canvas state
    nodes: Node[];
    edges: Edge[];
    selectedNodeId: string | null;

    // Execution state
    executionState: Record<string, NodeExecutionState>;
    nodePreviewData: Record<string, NodeDataPreview>;
    isExecuting: boolean;
    executionError: string | null;
    executionResult: { chunksCreated: number; embeddedChunks: number; skipped?: boolean } | null;

    // History
    history: { nodes: Node[]; edges: Edge[] }[];
    future: { nodes: Node[]; edges: Edge[] }[];

    // Actions - Canvas
    setNodes: (nodes: Node[]) => void;
    setEdges: (edges: Edge[]) => void;
    onNodesChange: (changes: NodeChange[]) => void;
    onEdgesChange: (changes: EdgeChange[]) => void;
    onConnect: (connection: Connection) => void;
    addNode: (node: Node) => void;
    removeNode: (nodeId: string) => void;
    updateNodeData: (nodeId: string, data: any) => void;
    selectNode: (nodeId: string | null) => void;
    connectNodes: (sourceId: string, targetId: string) => void;

    // Actions - Pipeline metadata
    setPipelineName: (name: string) => void;
    setPipelineId: (id: string | null) => void;
    setProjectId: (id: string | null) => void;

    // Actions - Execution
    setNodeExecutionState: (nodeId: string, state: NodeExecutionState) => void;
    setNodePreviewData: (nodeId: string, preview: NodeDataPreview) => void;
    setIsExecuting: (executing: boolean) => void;
    setExecutionError: (error: string | null) => void;
    setExecutionResult: (result: { chunksCreated: number; embeddedChunks: number; skipped?: boolean } | null) => void;
    resetExecution: () => void;

    // UI state
    testerOpen: boolean;
    setTesterOpen: (open: boolean) => void;

    // History Actions
    undo: () => void;
    redo: () => void;
    saveHistory: () => void;
    clearCanvas: () => void;
}

export const usePipelineStore = create<PipelineState>()(
    persist(
        (set, get) => ({
            pipelineName: 'Untitled Pipeline',
            pipelineId: null,
            projectId: null,

            nodes: [],
            edges: [],
            selectedNodeId: null,

            executionState: {},
            nodePreviewData: {},
            isExecuting: false,
            executionError: null,
            executionResult: null,

            testerOpen: false,

            history: [],
            future: [],

            saveHistory: () => {
                const { nodes, edges, history } = get();
                const newHistory = [...history, { nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) }].slice(-20);
                set({ history: newHistory, future: [] });
            },

            setPipelineName: (name) => set({ pipelineName: name }),
            setPipelineId: (id) => set({ pipelineId: id }),
            setProjectId: (id) => set({ projectId: id }),
            setTesterOpen: (open) => set({ testerOpen: open }),

            setNodes: (nodes) => set({ nodes }),
            setEdges: (edges) => set({ edges }),

            onNodesChange: (changes) => {
                set({
                    nodes: applyNodeChanges(changes, get().nodes),
                });
            },

            onEdgesChange: (changes) => {
                set({
                    edges: applyEdgeChanges(changes, get().edges),
                });
            },

            onConnect: (connection) => {
                get().saveHistory();
                set({
                    edges: addEdge({
                        ...connection,
                        animated: true,
                        style: { stroke: '#6366f1', strokeWidth: 2 },
                    }, get().edges),
                });
            },

            addNode: (node) => {
                get().saveHistory();
                set({
                    nodes: [...get().nodes, node],
                });
            },

            removeNode: (nodeId) => {
                get().saveHistory();
                set({
                    nodes: get().nodes.filter((n) => n.id !== nodeId),
                    edges: get().edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
                    selectedNodeId: get().selectedNodeId === nodeId ? null : get().selectedNodeId,
                });
            },

            updateNodeData: (nodeId, newData) => {
                set({
                    nodes: get().nodes.map((node) => {
                        if (node.id === nodeId) {
                            return { ...node, data: { ...node.data, ...newData } };
                        }
                        return node;
                    }),
                });
            },

            selectNode: (nodeId) => set({ selectedNodeId: nodeId }),

            connectNodes: (sourceId, targetId) => {
                get().saveHistory();
                const edge: Edge = {
                    id: `e-${sourceId}-${targetId}`,
                    source: sourceId,
                    target: targetId,
                    animated: true,
                    style: { stroke: '#6366f1', strokeWidth: 2 },
                };
                set({ edges: [...get().edges, edge] });
            },

            setNodeExecutionState: (nodeId, state) => {
                set({
                    executionState: { ...get().executionState, [nodeId]: state },
                });
            },

            setNodePreviewData: (nodeId, preview) => {
                set({
                    nodePreviewData: { ...get().nodePreviewData, [nodeId]: preview },
                });
            },

            setIsExecuting: (executing) => set({ isExecuting: executing }),
            setExecutionError: (error) => set({ executionError: error }),
            setExecutionResult: (result) => set({ executionResult: result }),

            resetExecution: () => {
                set({
                    executionState: {},
                    nodePreviewData: {},
                    isExecuting: false,
                    executionError: null,
                    executionResult: null,
                });
            },

            clearCanvas: () => {
                get().saveHistory();
                set({
                    nodes: [],
                    edges: [],
                    selectedNodeId: null,
                    executionState: {},
                    nodePreviewData: {},
                });
            },

            undo: () => {
                const { history, future, nodes, edges } = get();
                if (history.length === 0) return;

                const previous = history[history.length - 1];
                const newHistory = history.slice(0, history.length - 1);

                set({
                    nodes: previous.nodes,
                    edges: previous.edges,
                    history: newHistory,
                    future: [{ nodes, edges }, ...future],
                });
            },

            redo: () => {
                const { history, future, nodes, edges } = get();
                if (future.length === 0) return;

                const next = future[0];
                const newFuture = future.slice(1);

                set({
                    nodes: next.nodes,
                    edges: next.edges,
                    history: [...history, { nodes, edges }],
                    future: newFuture,
                });
            },
        }),
        {
            name: 'chunkscope-pipeline',
            partialize: (state) => ({
                pipelineName: state.pipelineName,
                pipelineId: state.pipelineId,
                projectId: state.projectId,
                nodes: state.nodes,
                edges: state.edges,
                executionResult: state.executionResult,
                executionState: state.executionState,
            }),
        }
    )
);

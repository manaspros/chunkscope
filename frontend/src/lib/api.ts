import axios from 'axios';

// Create an axios instance with default config
export const apiClient = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
    headers: {
        'Content-Type': 'application/json',
    },
});

// Response interceptor for error handling
apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
        return Promise.reject(error);
    }
);

export const pipelinesApi = {
    listPipelines: async () => {
        const response = await apiClient.get('/api/v1/pipelines');
        return response.data;
    },
    getPipeline: async (pipelineId: string) => {
        const response = await apiClient.get(`/api/v1/pipelines/${pipelineId}`);
        return response.data;
    },
    deletePipeline: async (pipelineId: string) => {
        const response = await apiClient.delete(`/api/v1/pipelines/${pipelineId}`);
        return response.data;
    },
    executeStep: async (pipelineId: string, data: { node_id: string; node_type: string; config: any; project_id?: string }) => {
        const response = await apiClient.post(`/api/v1/pipelines/${pipelineId}/execute-step`, data);
        return response.data;
    },
    executeStepStream: (
        pipelineId: string,
        data: { node_id: string; node_type: string; config: any; project_id?: string },
        onProgress: (evt: { step: string; progress: number; message: string }) => void,
    ): Promise<any> => {
        return new Promise((resolve, reject) => {
            const baseURL = apiClient.defaults.baseURL || ''
            fetch(`${baseURL}/api/v1/pipelines/${pipelineId}/execute-step-stream`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            }).then(async (response) => {
                if (!response.ok) {
                    const errText = await response.text()
                    reject(new Error(errText || `HTTP ${response.status}`))
                    return
                }
                const reader = response.body?.getReader()
                if (!reader) { reject(new Error('No response body')); return }
                const decoder = new TextDecoder()
                let buffer = ''
                let result: any = null
                while (true) {
                    const { done, value } = await reader.read()
                    if (done) break
                    buffer += decoder.decode(value, { stream: true })
                    const lines = buffer.split('\n')
                    buffer = lines.pop() || ''
                    let eventType = ''
                    for (const line of lines) {
                        if (line.startsWith('event: ')) {
                            eventType = line.slice(7).trim()
                        } else if (line.startsWith('data: ')) {
                            try {
                                const parsed = JSON.parse(line.slice(6))
                                if (eventType === 'progress') onProgress(parsed)
                                else if (eventType === 'complete') result = parsed
                                else if (eventType === 'error') { reject(new Error(parsed.message || 'Stream error')); return }
                            } catch { /* ignore parse errors */ }
                        }
                    }
                }
                resolve(result || { status: 'success' })
            }).catch(reject)
        })
    },
};

export const documentsApi = {
    listDocuments: async (params?: any) => {
        const response = await apiClient.get('/api/v1/documents', { params });
        return response.data;
    },
    getDocument: async (documentId: string) => {
        const response = await apiClient.get(`/api/v1/documents/${documentId}`);
        return response.data;
    },
    getDocumentContentUrl: (documentId: string) => {
        const baseURL = apiClient.defaults.baseURL;
        return `${baseURL}/api/v1/documents/${documentId}/content`;
    },
    uploadDocument: async (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        const response = await apiClient.post('/api/v1/documents/upload', formData, {
            headers: {
                'Content-Type': undefined as unknown as string,
            },
        });
        return response.data;
    },
    uploadZip: async (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        const response = await apiClient.post('/api/v1/documents/upload-zip', formData, {
            headers: {
                'Content-Type': undefined as unknown as string,
            },
        });
        return response.data;
    },
    uploadMultiple: async (files: File[]) => {
        return Promise.all(files.map((file) => {
            const formData = new FormData();
            formData.append('file', file);
            return apiClient.post('/api/v1/documents/upload', formData, {
                headers: {
                    'Content-Type': undefined as unknown as string,
                },
            }).then((r) => r.data);
        }));
    },
};

export const chunksApi = {
    visualizeChunks: async (documentId: string, config: any) => {
        const response = await apiClient.post('/api/v1/chunks/visualize', {
            document_id: documentId,
            chunking_config: config
        });
        return response.data;
    }
};

export const embeddingsApi = {
    getModels: async () => {
        const response = await apiClient.get('/api/v1/embeddings/models');
        return response.data;
    },
};

export const costApi = {
    estimateIngestion: async (data: any) => {
        const response = await apiClient.post('/api/v1/cost/estimate-ingestion', data);
        return response.data;
    },
    estimateQuery: async (data: any) => {
        const response = await apiClient.post('/api/v1/cost/estimate-query', data);
        return response.data;
    },
};

export const guideApi = {
    getStrategies: async (category?: string) => {
        const params = category ? { category } : {};
        const response = await apiClient.get('/api/v1/guide/strategies', { params });
        return response.data;
    },
    getStrategy: async (id: string) => {
        const response = await apiClient.get(`/api/v1/guide/strategies/${id}`);
        return response.data;
    },
    getPairs: async (id: string) => {
        const response = await apiClient.get(`/api/v1/guide/strategies/${id}/pairs`);
        return response.data;
    },
    compare: async (ids: string[]) => {
        const response = await apiClient.get('/api/v1/guide/compare', { params: { ids: ids.join(',') } });
        return response.data;
    },
    recommend: async (data: { document_type: string; document_count: string; question_type: string; priority: string }) => {
        const response = await apiClient.post('/api/v1/guide/recommend', data);
        return response.data;
    },
    getDecisionTree: async (category: string) => {
        const response = await apiClient.get(`/api/v1/guide/decision-tree/${category}`);
        return response.data;
    },
};

export const projectsApi = {
    list: async (params?: { status?: string }) => {
        const response = await apiClient.get('/api/v1/projects', { params });
        return response.data;
    },
    create: async (data: { name: string; description?: string }) => {
        const response = await apiClient.post('/api/v1/projects', data);
        return response.data;
    },
    get: async (id: string) => {
        const response = await apiClient.get(`/api/v1/projects/${id}`);
        return response.data;
    },
    update: async (id: string, data: { name?: string; description?: string; status?: string }) => {
        const response = await apiClient.patch(`/api/v1/projects/${id}`, data);
        return response.data;
    },
    delete: async (id: string) => {
        const response = await apiClient.delete(`/api/v1/projects/${id}`);
        return response.data;
    },
    uploadFile: async (id: string, file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        const response = await apiClient.post(`/api/v1/projects/${id}/upload`, formData, {
            headers: { 'Content-Type': undefined as unknown as string },
        });
        return response.data;
    },
    uploadFiles: async (id: string, files: File[]) => {
        const formData = new FormData();
        files.forEach(f => formData.append('files', f));
        const response = await apiClient.post(`/api/v1/projects/${id}/upload-folder`, formData, {
            headers: { 'Content-Type': undefined as unknown as string },
        });
        return response.data;
    },
    uploadZip: async (id: string, file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        const response = await apiClient.post(`/api/v1/projects/${id}/upload-zip`, formData, {
            headers: { 'Content-Type': undefined as unknown as string },
        });
        return response.data;
    },
    analyze: async (id: string) => {
        const response = await apiClient.post(`/api/v1/projects/${id}/analyze`, null, {
            timeout: 120000,
        });
        return response.data;
    },
    chunk: async (id: string, config: any) => {
        const response = await apiClient.post(`/api/v1/projects/${id}/chunk`, config);
        return response.data;
    },
    getChunks: async (id: string, page?: number) => {
        const response = await apiClient.get(`/api/v1/projects/${id}/chunks`, {
            params: page ? { page } : {},
        });
        return response.data;
    },
    removeFile: async (id: string, fileId: string) => {
        const response = await apiClient.delete(`/api/v1/projects/${id}/files/${fileId}`);
        return response.data;
    },
    smartAnalyze: async (id: string, priority = 'accuracy', budget = 'moderate') => {
        const { data } = await apiClient.post(
            `/api/v1/projects/${id}/smart-analyze`,
            null,
            { params: { priority, budget } }
        );
        return data;
    },
    aiAnalyze: async (id: string, model = 'gpt-4o-mini') => {
        const { data } = await apiClient.post(
            `/api/v1/projects/${id}/ai-analyze`,
            null,
            { params: { model } }
        );
        return data;
    },
    getSampleQueries: async (id: string) => {
        const response = await apiClient.get(`/api/v1/projects/${id}/sample-queries`);
        return response.data;
    },
    validateRag: async (id: string) => {
        const response = await apiClient.post(`/api/v1/projects/${id}/validate`);
        return response.data;
    },
    llmJudge: async (id: string, query: string, chunks: any[]) => {
        const response = await apiClient.post(`/api/v1/projects/${id}/llm-judge`, { query, chunks });
        return response.data;
    },
};

export const queryApi = {
    query: async (data: { query: string; document_id?: string; retrieval_method?: string; top_k?: number }) => {
        const response = await apiClient.post('/api/v1/query/', data);
        return response.data;
    },
};

export const analyzerApi = {
    analyzeDocument: async (file: File) => {
        const formData = new FormData();
        formData.append('file', file);

        const response = await apiClient.post('/api/v1/analyze', formData, {
            headers: {
                'Content-Type': undefined as unknown as string,
            },
        });
        return response.data;
    },
    analyzeCorpus: async (files: File[]) => {
        const formData = new FormData();
        files.forEach(f => formData.append('files', f));
        const response = await apiClient.post('/api/v1/analyze/corpus', formData, {
            headers: {
                'Content-Type': undefined as unknown as string,
            },
            timeout: 120000,
        });
        return response.data;
    },
};

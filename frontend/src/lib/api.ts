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

export const presetsApi = {
    listPresets: async (category?: string) => {
        const params = category ? { category } : {};
        const response = await apiClient.get('/api/v1/presets', { params });
        return response.data;
    },
    getPreset: async (presetId: string) => {
        const response = await apiClient.get(`/api/v1/presets/${presetId}`);
        return response.data;
    },
    applyPreset: async (presetId: string, pipelineName?: string, documentId?: string, configOverride?: any) => {
        const response = await apiClient.post(`/api/v1/presets/${presetId}/apply`, configOverride || null, {
            params: {
                pipeline_name: pipelineName,
                document_id: documentId
            }
        });
        return response.data;
    }
};

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
    }
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

export const suggestApi = {
    profileDocument: async (text: string) => {
        const response = await apiClient.post('/api/v1/suggest/profile', { text });
        return response.data;
    },
    recommend: async (text: string) => {
        const response = await apiClient.post('/api/v1/suggest/recommend', { text });
        return response.data;
    },
    explain: async (recommendation: any) => {
        const response = await apiClient.post('/api/v1/suggest/explain', recommendation);
        return response.data;
    },
};

export const embeddingsApi = {
    getModels: async () => {
        const response = await apiClient.get('/api/v1/embeddings/models');
        return response.data;
    },
};

export const evaluateApi = {
    run: async (data: { question: string; ground_truth?: string }) => {
        const response = await apiClient.post('/api/v1/evaluate/run', data);
        return response.data;
    },
    chunkQuality: async (data?: { chunks?: string[] }) => {
        const response = await apiClient.post('/api/v1/evaluate/chunk-quality', data || {});
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
    applyPresetFromAnalysis: async (data: { document_id?: string, config: any }) => {
        const response = await apiClient.post('/api/v1/presets/default/apply', data.config, {
            params: {
                document_id: data.document_id,
                pipeline_name: `Analysis Result - ${new Date().toLocaleDateString()}`
            }
        });
        return response.data;
    }
};

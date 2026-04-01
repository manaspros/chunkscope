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
    }
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

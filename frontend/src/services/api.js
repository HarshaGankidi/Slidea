import axios from 'axios';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, '');

const apiClient = axios.create({
  baseURL: API_URL.endsWith('/api') ? API_URL : `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json'
  }
});

const presentationsBase = () => `${(apiClient.defaults.baseURL || '').replace(/\/$/, '')}/presentations`;

/** POST /presentations/generate — multipart; returns { jobId } (202) */
export const getGeneratePresentationUrl = () => `${presentationsBase()}/generate`;

/** POST /presentations/export — JSON body, binary .pptx response */
export const exportPresentationBlob = async ({ title, slides, theme, prompt }) => {
  const res = await fetch(`${presentationsBase()}/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, slides, theme, prompt })
  });

  if (!res.ok) {
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || `Export failed (${res.status})`);
    }
    throw new Error(`Export failed (${res.status})`);
  }

  return res.blob();
};

/** Start async generation; poll {@link getPresentationJobStatus} until isComplete. */
export const startPresentationJob = async ({ prompt, title, pdfFile }) => {
  const formData = new FormData();
  formData.append('prompt', prompt);
  if (title) formData.append('title', title);
  if (pdfFile) formData.append('document', pdfFile, pdfFile.name || 'document.pdf');

  const res = await fetch(getGeneratePresentationUrl(), {
    method: 'POST',
    body: formData
  });

  const contentType = res.headers.get('content-type') || '';

  if (!res.ok) {
    if (contentType.includes('application/json')) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.message || `Request failed (${res.status})`);
    }
    throw new Error(`Request failed (${res.status})`);
  }

  const body = await res.json().catch(() => ({}));
  if (!body.jobId) {
    throw new Error('Server did not return a job id');
  }
  return body;
};

/** GET /presentations/status/:jobId */
export const getPresentationJobStatus = async (jobId) => {
  const res = await fetch(`${presentationsBase()}/status/${encodeURIComponent(jobId)}`);

  if (res.status === 404) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.message || 'Job not found');
  }

  if (!res.ok) {
    throw new Error(`Status request failed (${res.status})`);
  }

  return res.json();
};

export const presentationAPI = {
  getPresentationHistory: async () => {
    try {
      const response = await apiClient.get('/presentations/history');
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  downloadPresentation: async (id) => {
    try {
      const response = await apiClient.get(`/presentations/download/${id}`, {
        responseType: 'blob'
      });
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  }
};

export default apiClient;

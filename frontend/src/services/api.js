import axios from 'axios';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, '');

const apiClient = axios.create({
  baseURL: API_URL.endsWith('/api') ? API_URL : `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json'
  }
});

const presentationsBase = () => `${(apiClient.defaults.baseURL || '').replace(/\/$/, '')}/presentations`;

/** POST /presentations/generate — multipart + SSE */
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

/**
 * Multipart generate with SSE-style events: { type: 'status'|'complete'|'error', ... }
 */
export const streamGeneratePresentation = async ({ prompt, title, pdfFile, onEvent }) => {
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

  if (!contentType.includes('text/event-stream')) {
    const text = await res.text().catch(() => '');
    throw new Error(text || 'Unexpected response from server');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let streamError = null;

  const processBuffer = () => {
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';
    for (const block of parts) {
      const line = block.trim();
      if (!line.startsWith('data:')) continue;
      const jsonStr = line.slice(5).trim();
      if (!jsonStr) continue;
      try {
        const payload = JSON.parse(jsonStr);
        if (payload.type === 'error') {
          streamError = new Error(payload.message || 'Generation failed');
        }
        if (typeof onEvent === 'function') onEvent(payload);
      } catch {
        /* ignore malformed chunk */
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    processBuffer();
  }
  buffer += decoder.decode();
  processBuffer();

  if (streamError) throw streamError;
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

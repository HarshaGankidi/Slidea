import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

export const presentationAPI = {
  generatePresentation: async (prompt, title) => {
    try {
      const response = await apiClient.post('/api/presentations/generate', {
        prompt,
        title
      });
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  getPresentationHistory: async () => {
    try {
      const response = await apiClient.get('/api/presentations/history');
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  downloadPresentation: async (id) => {
    try {
      const response = await apiClient.get(`/api/presentations/download/${id}`, {
        responseType: 'blob'
      });
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  }
};

export default apiClient;

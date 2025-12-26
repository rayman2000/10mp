import axios from 'axios';

// Use empty string for relative URLs in production (nginx proxies /api to backend)
// Fall back to localhost:3001 only if env var is not set at all
const API_BASE_URL = import.meta.env.VITE_API_URL !== undefined
  ? import.meta.env.VITE_API_URL
  : 'http://localhost:3001';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
});

export const gameApi = {
  async saveGameTurn(turnData) {
    try {
      const response = await api.post('/api/game-turns', turnData);
      return response.data;
    } catch (error) {
      console.error('Failed to save game turn:', error);
      throw error;
    }
  },

  async getGameTurns(params = {}) {
    try {
      const response = await api.get('/api/game-turns', { params });
      return response.data;
    } catch (error) {
      console.error('Failed to fetch game turns:', error);
      throw error;
    }
  },

  async getGameTurn(id) {
    try {
      const response = await api.get(`/api/game-turns/${id}`);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch game turn:', error);
      throw error;
    }
  },

  async getStats() {
    try {
      const response = await api.get('/api/stats');
      return response.data;
    } catch (error) {
      console.error('Failed to fetch stats:', error);
      throw error;
    }
  },

  async healthCheck() {
    try {
      const response = await api.get('/health');
      return response.data;
    } catch (error) {
      console.error('Health check failed:', error);
      throw error;
    }
  }
};

export const saveApi = {
  async listSaves() {
    try {
      const response = await api.get('/api/saves');
      return response.data;
    } catch (error) {
      console.error('Failed to list saves:', error);
      throw error;
    }
  },

  async getLatestSave() {
    try {
      const response = await api.get('/api/saves/latest');
      return response.data;
    } catch (error) {
      console.error('Failed to get latest save:', error);
      throw error;
    }
  },

  async downloadSave(objectKey) {
    try {
      const response = await api.get(`/api/saves/${objectKey}/download`, {
        responseType: 'arraybuffer'
      });
      return response.data;
    } catch (error) {
      console.error('Failed to download save:', error);
      throw error;
    }
  },

  async uploadSave(saveData, gameData) {
    try {
      const response = await api.post('/api/saves/upload', {
        saveData,
        gameData
      });
      return response.data;
    } catch (error) {
      console.error('Failed to upload save:', error);
      throw error;
    }
  }
};

export default api;
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add response interceptor for better error logging
api.interceptors.response.use(
  response => response,
  error => {
    if (error.response) {
      // Server responded with error status
      console.error('API Error Response:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
        url: error.config?.url
      });
    } else if (error.request) {
      // Request made but no response received
      console.error('API No Response:', {
        message: 'No response received from server',
        url: error.config?.url,
        baseURL: API_BASE_URL
      });
    } else {
      // Something else happened
      console.error('API Request Error:', error.message);
    }
    return Promise.reject(error);
  }
);

// Configuration API
export const configApi = {
  async getConfig() {
    try {
      const response = await api.get('/api/config');
      return response.data;
    } catch (error) {
      console.error('Failed to fetch config:', error);
      throw error;
    }
  }
};

// Save State Management API
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
  }
};

// Game Data API
export const gameApi = {
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
  }
};

// Kiosk Management API
export const kioskApi = {
  async getPendingKiosks(status = 'pending') {
    try {
      const response = await api.get('/api/admin/pending-kiosks', {
        params: { status }
      });
      return response.data;
    } catch (error) {
      console.error('Failed to fetch pending kiosks:', error);
      throw error;
    }
  },

  async activateKiosk(token) {
    try {
      const response = await api.post('/api/admin/activate-kiosk', {
        token
      });
      return response.data;
    } catch (error) {
      console.error('Failed to activate kiosk:', error);
      throw error;
    }
  },

  async disconnectKiosk(token) {
    try {
      const response = await api.post('/api/admin/disconnect-kiosk', {
        token
      });
      return response.data;
    } catch (error) {
      console.error('Failed to disconnect kiosk:', error);
      throw error;
    }
  }
};

export default api;

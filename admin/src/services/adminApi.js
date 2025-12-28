import axios from 'axios';

// Use empty string for relative URLs in production (Express serves everything)
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

// Token management
let adminToken = null;

export const setAdminToken = (token) => {
  adminToken = token;
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common['Authorization'];
  }
};

export const clearAdminToken = () => {
  adminToken = null;
  delete api.defaults.headers.common['Authorization'];
};

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

// Admin authentication API
export const authApi = {
  async login(password) {
    try {
      const response = await api.post('/api/admin/login', { password });
      return response.data;
    } catch (error) {
      console.error('Login failed:', error);
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
  },

  async downloadSave(objectKey) {
    try {
      const encodedKey = encodeURIComponent(objectKey);
      const response = await api.get(`/api/saves/${encodedKey}/download`, {
        responseType: 'blob'
      });

      // Create download link
      const url = window.URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = objectKey;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      return true;
    } catch (error) {
      console.error('Failed to download save:', error);
      throw error;
    }
  },

  async uploadSave(file, metadata = {}) {
    try {
      // Read file as base64
      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const response = await api.post('/api/admin/upload-save', {
        filename: file.name,
        data: base64Data,
        playerName: metadata.playerName || 'Admin Upload',
        location: metadata.location || 'Uploaded',
        badgeCount: metadata.badgeCount || 0
      }, {
        timeout: 30000
      });

      return response.data;
    } catch (error) {
      console.error('Failed to upload save:', error);
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
  },

  async restoreTurn(turnId) {
    try {
      const response = await api.post('/api/admin/restore-turn', {
        turnId
      });
      return response.data;
    } catch (error) {
      console.error('Failed to restore turn:', error);
      throw error;
    }
  }
};

// ROM Management API
export const romApi = {
  async listRoms() {
    try {
      const response = await api.get('/api/admin/roms');
      return response.data;
    } catch (error) {
      console.error('Failed to list ROMs:', error);
      throw error;
    }
  },

  async uploadRom(file) {
    try {
      // Read file as base64
      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          // Remove data URL prefix to get just the base64 data
          const base64 = reader.result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Use longer timeout for ROM uploads (60 seconds)
      const response = await api.post('/api/admin/upload-rom', {
        filename: file.name,
        data: base64Data
      }, {
        timeout: 60000
      });
      return response.data;
    } catch (error) {
      console.error('Failed to upload ROM:', error);
      throw error;
    }
  },

  async deleteRom(filename) {
    try {
      const response = await api.delete(`/api/admin/roms/${encodeURIComponent(filename)}`);
      return response.data;
    } catch (error) {
      console.error('Failed to delete ROM:', error);
      throw error;
    }
  }
};

export default api;

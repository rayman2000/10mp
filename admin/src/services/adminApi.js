import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
});

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

// Session Management API
export const sessionApi = {
  async initSession() {
    try {
      const response = await api.post('/api/session/init');
      return response.data;
    } catch (error) {
      console.error('Failed to initialize session:', error);
      throw error;
    }
  },

  async getSessionStatus() {
    try {
      const response = await api.get('/api/session/status');
      return response.data;
    } catch (error) {
      console.error('Failed to get session status:', error);
      throw error;
    }
  },

  async startSession() {
    try {
      const response = await api.post('/api/session/start');
      return response.data;
    } catch (error) {
      console.error('Failed to start session:', error);
      throw error;
    }
  },

  async stopSession() {
    try {
      const response = await api.post('/api/session/stop');
      return response.data;
    } catch (error) {
      console.error('Failed to stop session:', error);
      throw error;
    }
  },

  async listSaveStates() {
    try {
      const response = await api.get('/api/session/saves');
      return response.data;
    } catch (error) {
      console.error('Failed to list save states:', error);
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

  async activateKiosk(token, sessionId) {
    try {
      const response = await api.post('/api/admin/activate-kiosk', {
        token,
        sessionId
      });
      return response.data;
    } catch (error) {
      console.error('Failed to activate kiosk:', error);
      throw error;
    }
  }
};

export default api;

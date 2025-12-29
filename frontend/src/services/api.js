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

// Efficient Base64 encoding using chunked processing (O(n) instead of O(n²))
function uint8ArrayToBase64(uint8Array) {
  if (!uint8Array || !(uint8Array instanceof Uint8Array)) {
    return uint8Array; // Return as-is if not a Uint8Array (might already be Base64 string)
  }
  const CHUNK_SIZE = 0x8000; // 32KB chunks to avoid call stack issues
  const chunks = [];
  for (let i = 0; i < uint8Array.length; i += CHUNK_SIZE) {
    const chunk = uint8Array.subarray(i, Math.min(i + CHUNK_SIZE, uint8Array.length));
    chunks.push(String.fromCharCode.apply(null, chunk));
  }
  return btoa(chunks.join(''));
}

export const gameApi = {
  async saveGameTurn(turnData) {
    try {
      // Convert Uint8Array saveState to Base64 for JSON transmission
      const dataToSend = { ...turnData };
      if (turnData.saveState instanceof Uint8Array) {
        dataToSend.saveState = uint8ArrayToBase64(turnData.saveState);
      }
      const response = await api.post('/api/game-turns', dataToSend);
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
  },

  async saveSnapshots(turnId, snapshots) {
    try {
      const response = await api.post(
        `/api/game-turns/${turnId}/snapshots/batch`,
        { snapshots }
      );
      return response.data;
    } catch (error) {
      console.error('Failed to save snapshots:', error);
      throw error;
    }
  },

  async getSnapshots(turnId) {
    try {
      const response = await api.get(`/api/game-turns/${turnId}/snapshots`);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch snapshots:', error);
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
      // URL-encode the objectKey to handle special characters like dots
      const encodedKey = encodeURIComponent(objectKey);
      console.log(`Downloading save: ${objectKey} (encoded: ${encodedKey})`);
      const response = await api.get(`/api/saves/${encodedKey}/download`, {
        responseType: 'arraybuffer'
      });
      return response.data;
    } catch (error) {
      console.error('Failed to download save:', error.response?.status, error.message);
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
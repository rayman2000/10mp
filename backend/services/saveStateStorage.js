const Minio = require('minio');

class SaveStateStorage {
  constructor() {
    this.minioClient = null;
    this.bucketName = process.env.MINIO_BUCKET || 'game-saves';
    this.initialized = false;
  }

  /**
   * Initialize MinIO client and ensure bucket exists
   */
  async initialize() {
    try {
      const endpoint = process.env.MINIO_ENDPOINT || 'localhost';
      const port = parseInt(process.env.MINIO_PORT) || 9000;
      const useSSL = process.env.MINIO_USE_SSL === 'true';
      const accessKey = process.env.MINIO_ROOT_USER || 'minioadmin';
      const secretKey = process.env.MINIO_ROOT_PASSWORD || 'minioadmin123';

      console.log(`Initializing MinIO client: ${endpoint}:${port}, SSL: ${useSSL}`);

      this.minioClient = new Minio.Client({
        endPoint: endpoint,
        port: port,
        useSSL: useSSL,
        accessKey: accessKey,
        secretKey: secretKey
      });

      // Check if bucket exists, create if not
      const bucketExists = await this.minioClient.bucketExists(this.bucketName);
      if (!bucketExists) {
        console.log(`Creating bucket: ${this.bucketName}`);
        await this.minioClient.makeBucket(this.bucketName, 'us-east-1');
        console.log(`Bucket ${this.bucketName} created successfully`);
      } else {
        console.log(`Bucket ${this.bucketName} already exists`);
      }

      this.initialized = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize MinIO:', error);
      this.initialized = false;
      return false;
    }
  }

  /**
   * Save an auto-save state
   * @param {string} sessionId - Session identifier
   * @param {Buffer|string} saveData - Save state data
   * @param {object} metadata - Game metadata (playerName, location, badges, etc.)
   */
  async saveAutoSave(sessionId, saveData, metadata = {}) {
    if (!this.initialized) {
      throw new Error('MinIO storage not initialized');
    }

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const objectName = `${sessionId}/autosave-${timestamp}.sav`;

      // Convert data to Buffer if it's a string
      const buffer = Buffer.isBuffer(saveData)
        ? saveData
        : Buffer.from(JSON.stringify(saveData));

      // Prepare metadata
      const minioMetadata = {
        'x-amz-meta-player-name': metadata.playerName || 'unknown',
        'x-amz-meta-location': metadata.location || 'unknown',
        'x-amz-meta-badge-count': String(metadata.badgeCount || 0),
        'x-amz-meta-timestamp': timestamp
      };

      await this.minioClient.putObject(
        this.bucketName,
        objectName,
        buffer,
        buffer.length,
        minioMetadata
      );

      console.log(`Auto-save uploaded: ${objectName}`);
      return objectName;
    } catch (error) {
      console.error('Failed to save auto-save:', error);
      throw error;
    }
  }

  /**
   * Save a turn-end state
   * @param {string} sessionId - Session identifier
   * @param {string} turnId - Turn/GameTurn UUID
   * @param {Buffer|string} saveData - Save state data
   * @param {object} metadata - Game metadata
   */
  async saveTurnSave(sessionId, turnId, saveData, metadata = {}) {
    if (!this.initialized) {
      throw new Error('MinIO storage not initialized');
    }

    try {
      const objectName = `${sessionId}/turn-${turnId}.sav`;

      const buffer = Buffer.isBuffer(saveData)
        ? saveData
        : Buffer.from(JSON.stringify(saveData));

      const minioMetadata = {
        'x-amz-meta-player-name': metadata.playerName || 'unknown',
        'x-amz-meta-location': metadata.location || 'unknown',
        'x-amz-meta-badge-count': String(metadata.badgeCount || 0),
        'x-amz-meta-turn-id': turnId
      };

      await this.minioClient.putObject(
        this.bucketName,
        objectName,
        buffer,
        buffer.length,
        minioMetadata
      );

      console.log(`Turn save uploaded: ${objectName}`);
      return objectName;
    } catch (error) {
      console.error('Failed to save turn save:', error);
      throw error;
    }
  }

  /**
   * Load the latest save state for a session
   * @param {string} sessionId - Session identifier
   * @returns {Promise<Buffer>} - Save state data
   */
  async loadLatestSave(sessionId) {
    if (!this.initialized) {
      throw new Error('MinIO storage not initialized');
    }

    try {
      const saves = await this.listSaveStates(sessionId);

      if (saves.length === 0) {
        return null;
      }

      // Get the most recent save
      const latestSave = saves[0];
      return await this.loadSpecificSave(sessionId, latestSave.name);
    } catch (error) {
      console.error('Failed to load latest save:', error);
      throw error;
    }
  }

  /**
   * List all save states for a session
   * @param {string} sessionId - Session identifier
   * @returns {Promise<Array>} - Array of save objects with metadata
   */
  async listSaveStates(sessionId) {
    if (!this.initialized) {
      throw new Error('MinIO storage not initialized');
    }

    try {
      const prefix = `${sessionId}/`;
      const objectsList = [];

      return new Promise((resolve, reject) => {
        const stream = this.minioClient.listObjects(this.bucketName, prefix, true);

        stream.on('data', (obj) => {
          objectsList.push({
            name: obj.name,
            size: obj.size,
            lastModified: obj.lastModified,
            etag: obj.etag
          });
        });

        stream.on('error', (err) => {
          console.error('Error listing objects:', err);
          reject(err);
        });

        stream.on('end', () => {
          // Sort by lastModified, most recent first
          objectsList.sort((a, b) => b.lastModified - a.lastModified);
          resolve(objectsList);
        });
      });
    } catch (error) {
      console.error('Failed to list save states:', error);
      throw error;
    }
  }

  /**
   * Load a specific save state by its object key
   * @param {string} sessionId - Session identifier (not used in current implementation but kept for consistency)
   * @param {string} objectKey - Full object key/name
   * @returns {Promise<Buffer>} - Save state data
   */
  async loadSpecificSave(sessionId, objectKey) {
    if (!this.initialized) {
      throw new Error('MinIO storage not initialized');
    }

    try {
      const chunks = [];

      return new Promise((resolve, reject) => {
        this.minioClient.getObject(this.bucketName, objectKey, (err, dataStream) => {
          if (err) {
            return reject(err);
          }

          dataStream.on('data', (chunk) => {
            chunks.push(chunk);
          });

          dataStream.on('end', () => {
            const buffer = Buffer.concat(chunks);
            resolve(buffer);
          });

          dataStream.on('error', (err) => {
            reject(err);
          });
        });
      });
    } catch (error) {
      console.error('Failed to load specific save:', error);
      throw error;
    }
  }

  /**
   * Delete a specific save state
   * @param {string} objectKey - Full object key/name
   */
  async deleteSave(objectKey) {
    if (!this.initialized) {
      throw new Error('MinIO storage not initialized');
    }

    try {
      await this.minioClient.removeObject(this.bucketName, objectKey);
      console.log(`Deleted save: ${objectKey}`);
      return true;
    } catch (error) {
      console.error('Failed to delete save:', error);
      throw error;
    }
  }
}

// Export a singleton instance
const storage = new SaveStateStorage();
module.exports = storage;

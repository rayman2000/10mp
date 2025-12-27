const Minio = require('minio');

class RomStorage {
  constructor() {
    this.minioClient = null;
    this.bucketName = process.env.MINIO_ROM_BUCKET || 'game-roms';
    this.initialized = false;
  }

  /**
   * Initialize MinIO client and ensure bucket exists
   */
  async initialize() {
    try {
      const endpoint = process.env.MINIO_ENDPOINT || 'localhost';
      const port = parseInt(process.env.MINIO_PORT) || 443;
      const useSSL = process.env.MINIO_USE_SSL !== 'false';
      const accessKey = process.env.MINIO_ACCESS_KEY || 'minioadmin';
      const secretKey = process.env.MINIO_SECRET_KEY || 'minioadmin';

      console.log(`Initializing ROM storage: ${endpoint}:${port}, SSL: ${useSSL}`);

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
        console.log(`Creating ROM bucket: ${this.bucketName}`);
        await this.minioClient.makeBucket(this.bucketName, 'us-east-1');
        console.log(`ROM bucket ${this.bucketName} created successfully`);
      } else {
        console.log(`ROM bucket ${this.bucketName} already exists`);
      }

      this.initialized = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize ROM storage:', error);
      this.initialized = false;
      return false;
    }
  }

  /**
   * Upload a ROM file
   * @param {string} filename - The filename (e.g., "pokemon-firered.gba")
   * @param {Buffer} data - ROM file data
   * @returns {Promise<string>} - Object name in MinIO
   */
  async uploadRom(filename, data) {
    if (!this.initialized) {
      throw new Error('ROM storage not initialized');
    }

    try {
      // Sanitize filename - only allow alphanumeric, dash, underscore, and dot
      const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');

      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);

      const metadata = {
        'Content-Type': 'application/octet-stream',
        'x-amz-meta-original-filename': filename,
        'x-amz-meta-upload-timestamp': new Date().toISOString()
      };

      await this.minioClient.putObject(
        this.bucketName,
        sanitizedFilename,
        buffer,
        buffer.length,
        metadata
      );

      console.log(`ROM uploaded: ${sanitizedFilename} (${buffer.length} bytes)`);
      return sanitizedFilename;
    } catch (error) {
      console.error('Failed to upload ROM:', error);
      throw error;
    }
  }

  /**
   * Get a ROM file
   * @param {string} filename - The filename to retrieve
   * @returns {Promise<Buffer>} - ROM file data
   */
  async getRom(filename) {
    if (!this.initialized) {
      throw new Error('ROM storage not initialized');
    }

    try {
      const chunks = [];

      return new Promise((resolve, reject) => {
        this.minioClient.getObject(this.bucketName, filename, (err, dataStream) => {
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
      console.error('Failed to get ROM:', error);
      throw error;
    }
  }

  /**
   * Check if a ROM exists
   * @param {string} filename - The filename to check
   * @returns {Promise<boolean>}
   */
  async romExists(filename) {
    if (!this.initialized) {
      return false;
    }

    try {
      await this.minioClient.statObject(this.bucketName, filename);
      return true;
    } catch (error) {
      if (error.code === 'NotFound') {
        return false;
      }
      throw error;
    }
  }

  /**
   * List all ROMs
   * @returns {Promise<Array>} - Array of ROM objects with metadata
   */
  async listRoms() {
    if (!this.initialized) {
      throw new Error('ROM storage not initialized');
    }

    try {
      const objectsList = [];

      return new Promise((resolve, reject) => {
        const stream = this.minioClient.listObjects(this.bucketName, '', true);

        stream.on('data', (obj) => {
          objectsList.push({
            name: obj.name,
            size: obj.size,
            lastModified: obj.lastModified,
            etag: obj.etag
          });
        });

        stream.on('error', (err) => {
          console.error('Error listing ROMs:', err);
          reject(err);
        });

        stream.on('end', () => {
          // Sort by name
          objectsList.sort((a, b) => a.name.localeCompare(b.name));
          resolve(objectsList);
        });
      });
    } catch (error) {
      console.error('Failed to list ROMs:', error);
      throw error;
    }
  }

  /**
   * Delete a ROM
   * @param {string} filename - The filename to delete
   */
  async deleteRom(filename) {
    if (!this.initialized) {
      throw new Error('ROM storage not initialized');
    }

    try {
      await this.minioClient.removeObject(this.bucketName, filename);
      console.log(`ROM deleted: ${filename}`);
      return true;
    } catch (error) {
      console.error('Failed to delete ROM:', error);
      throw error;
    }
  }
}

// Export a singleton instance
const storage = new RomStorage();
module.exports = storage;

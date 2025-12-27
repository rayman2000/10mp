const Minio = require('minio');

class RomStorage {
  constructor() {
    this.minioClient = null;
    // Use same bucket as saves, with roms/ prefix
    this.bucketName = process.env.MINIO_BUCKET || 'game-saves';
    this.prefix = 'roms/';
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

      console.log(`Initializing ROM storage: ${endpoint}:${port}, bucket: ${this.bucketName}, prefix: ${this.prefix}`);

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
        console.log(`Using existing bucket: ${this.bucketName}`);
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
      const objectName = this.prefix + sanitizedFilename;

      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);

      console.log('Uploading ROM:', {
        bucket: this.bucketName,
        objectName,
        bufferLength: buffer.length
      });

      // Verify bucket access before upload
      const bucketExists = await this.minioClient.bucketExists(this.bucketName);
      console.log('Bucket exists check:', bucketExists);

      if (!bucketExists) {
        throw new Error(`Bucket ${this.bucketName} does not exist`);
      }

      // Try listing objects to verify we have write access
      console.log('Testing bucket access...');

      // Use putObject with just the required params
      console.log('Starting upload...');
      await this.minioClient.putObject(
        this.bucketName,
        objectName,
        buffer
      );

      console.log(`ROM uploaded: ${objectName} (${buffer.length} bytes)`);
      return sanitizedFilename;
    } catch (error) {
      console.error('Failed to upload ROM:', error);
      console.error('S3 Error details:', {
        code: error.code,
        message: error.message,
        key: error.key,
        resource: error.resource,
        requestId: error.requestId,
        cause: error.cause,
        errno: error.errno,
        syscall: error.syscall
      });
      // Log all enumerable properties
      console.error('All error properties:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
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
      const objectName = this.prefix + filename;

      return new Promise((resolve, reject) => {
        this.minioClient.getObject(this.bucketName, objectName, (err, dataStream) => {
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
      const objectName = this.prefix + filename;
      await this.minioClient.statObject(this.bucketName, objectName);
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
        // Only list objects with the roms/ prefix
        const stream = this.minioClient.listObjects(this.bucketName, this.prefix, true);

        stream.on('data', (obj) => {
          // Strip the prefix from the name for cleaner output
          const name = obj.name.startsWith(this.prefix)
            ? obj.name.substring(this.prefix.length)
            : obj.name;
          objectsList.push({
            name: name,
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
      const objectName = this.prefix + filename;
      await this.minioClient.removeObject(this.bucketName, objectName);
      console.log(`ROM deleted: ${objectName}`);
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

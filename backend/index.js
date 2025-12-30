// Catch uncaught errors early
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err.message);
  console.error(err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION at:', promise);
  console.error('Reason:', reason);
});

console.log('Starting 10MP backend...');

require('dotenv').config();
const express = require('express');
const path = require('path');
console.log('Loading models...');
const { sequelize } = require('./models');
const GameTurn = require('./models').GameTurn;
const GameStateSnapshot = require('./models').GameStateSnapshot;
const { isValidKioskToken } = require('./utils/kioskToken');
const saveStateStorage = require('./services/saveStateStorage');
const romStorage = require('./services/romStorage');
const { initializeDatabase } = require('./utils/dbCheck');
console.log('All modules loaded successfully');

const app = express();
const PORT = process.env.PORT || 3001;

// In-memory kiosk storage (no database)
const kioskStore = {
  pending: new Map(),  // token -> {kioskId, kioskName, registeredAt}
  active: null         // {token, kioskId, kioskName, activatedAt} or null
};

// Increase limit to 50MB for ROM uploads (GBA ROMs are typically 16-32MB)
app.use(express.json({ limit: '50mb' }));

// Cross-Origin Isolation headers for SharedArrayBuffer support (required by EmulatorJS)
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});

// Basic request validation middleware
const validateGameTurn = (req, res, next) => {
  const { playerName, badgeCount, playtime, money, turnDuration, message } = req.body;

  if (!playerName || typeof playerName !== 'string' || playerName.trim() === '') {
    return res.status(400).json({ error: 'Valid playerName is required' });
  }

  if (playerName.length > 50) {
    return res.status(400).json({ error: 'playerName must be 50 characters or less' });
  }

  if (badgeCount !== undefined && (typeof badgeCount !== 'number' || badgeCount < 0 || badgeCount > 8)) {
    return res.status(400).json({ error: 'badgeCount must be a number between 0 and 8' });
  }

  if (playtime !== undefined && (typeof playtime !== 'number' || playtime < 0)) {
    return res.status(400).json({ error: 'playtime must be a non-negative number' });
  }

  if (money !== undefined && (typeof money !== 'number' || money < 0)) {
    return res.status(400).json({ error: 'money must be a non-negative number' });
  }

  if (turnDuration !== undefined && (typeof turnDuration !== 'number' || turnDuration < 0)) {
    return res.status(400).json({ error: 'turnDuration must be a non-negative number' });
  }

  if (message !== undefined && (typeof message !== 'string' || message.length > 200)) {
    return res.status(400).json({ error: 'message must be a string of 200 characters or less' });
  }

  next();
};

// Admin session store (in-memory, resets on server restart)
const adminSessions = new Set();

// Generate random token
const generateAdminToken = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
};

// Admin authentication middleware
const requireAdminAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Admin authentication required' });
  }

  const token = authHeader.substring(7);
  if (!adminSessions.has(token)) {
    return res.status(401).json({ error: 'Invalid or expired admin session' });
  }

  next();
};

// Admin authentication endpoint
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD || 'change-me-in-production';

  if (password === adminPassword) {
    const token = generateAdminToken();
    adminSessions.add(token);
    res.json({ success: true, token });
  } else {
    res.status(401).json({ success: false, error: 'Invalid password' });
  }
});

// Admin logout endpoint
app.post('/api/admin/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    adminSessions.delete(token);
  }
  res.json({ success: true });
});

// Kiosk Registration Endpoints (New Token-Based System)

// POST /api/kiosk/register - Kiosk registers with generated token (in-memory)
app.post('/api/kiosk/register', async (req, res) => {
  try {
    const { token, kioskId, kioskName } = req.body;

    if (!token || !kioskId) {
      return res.status(400).json({ error: 'token and kioskId are required' });
    }

    if (!isValidKioskToken(token)) {
      return res.status(400).json({ error: 'Invalid token format. Must be 12-32 alphanumeric characters.' });
    }

    // Check if another kiosk is active
    if (kioskStore.active) {
      console.log(`Registration rejected: Another kiosk is already active (${kioskStore.active.kioskId})`);
      return res.status(403).json({
        error: 'Another kiosk is already active',
        message: 'Only one kiosk can be active at a time. Please contact an organizer.'
      });
    }

    // Check if already registered
    if (kioskStore.pending.has(token)) {
      return res.json({
        token,
        status: 'pending',
        message: 'Kiosk already registered'
      });
    }

    // Add to pending
    kioskStore.pending.set(token, {
      kioskId,
      kioskName: kioskName || null,
      registeredAt: new Date()
    });

    console.log(`Kiosk registered: ${kioskId} with token: ${token}`);

    res.status(201).json({
      token,
      status: 'pending',
      message: 'Kiosk registered. Waiting for admin activation.'
    });
  } catch (error) {
    console.error('Error registering kiosk:', error);
    res.status(500).json({ error: 'Failed to register kiosk' });
  }
});

// GET /api/kiosk/status/:token - Kiosk checks activation status (in-memory)
app.get('/api/kiosk/status/:token', async (req, res) => {
  try {
    const { token } = req.params;

    if (!isValidKioskToken(token)) {
      return res.status(400).json({ error: 'Invalid token format' });
    }

    // Check if active
    if (kioskStore.active && kioskStore.active.token === token) {
      return res.json({
        status: 'active',
        activatedAt: kioskStore.active.activatedAt,
        isActive: true
      });
    }

    // Check if pending
    if (kioskStore.pending.has(token)) {
      return res.json({
        status: 'pending',
        isActive: false
      });
    }

    // Not found (was disconnected)
    res.status(404).json({ error: 'Kiosk not registered' });
  } catch (error) {
    console.error('Error checking kiosk status:', error);
    res.status(500).json({ error: 'Failed to check status' });
  }
});

// POST /api/admin/activate-kiosk - Admin activates kiosk by token (in-memory)
app.post('/api/admin/activate-kiosk', requireAdminAuth, async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'token is required' });
    }

    if (!isValidKioskToken(token)) {
      return res.status(400).json({ error: 'Invalid token format' });
    }

    // Check if there's already an active kiosk
    if (kioskStore.active) {
      return res.status(409).json({
        error: 'Another kiosk is already active',
        message: 'Only one kiosk can be active at a time. Please disconnect the current kiosk first.',
        activeKiosk: {
          kioskId: kioskStore.active.kioskId,
          kioskName: kioskStore.active.kioskName
        }
      });
    }

    const kiosk = kioskStore.pending.get(token);

    if (!kiosk) {
      return res.status(404).json({ error: 'Kiosk not found' });
    }

    // Move from pending to active
    kioskStore.active = {
      token,
      ...kiosk,
      activatedAt: new Date()
    };
    kioskStore.pending.delete(token);

    console.log(`Kiosk activated: ${kiosk.kioskId} (token: ${token})`);

    res.json({
      token,
      kioskId: kiosk.kioskId,
      kioskName: kiosk.kioskName,
      status: 'active',
      activatedAt: kioskStore.active.activatedAt,
      message: 'Kiosk activated successfully'
    });
  } catch (error) {
    console.error('Error activating kiosk:', error);
    res.status(500).json({ error: 'Failed to activate kiosk' });
  }
});

// POST /api/admin/disconnect-kiosk - Admin disconnects/removes kiosk by token (in-memory)
app.post('/api/admin/disconnect-kiosk', requireAdminAuth, async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'token is required' });
    }

    if (!isValidKioskToken(token)) {
      return res.status(400).json({ error: 'Invalid token format' });
    }

    // Remove from active
    if (kioskStore.active && kioskStore.active.token === token) {
      const kiosk = kioskStore.active;
      kioskStore.active = null;

      console.log(`Kiosk disconnected and removed: ${kiosk.kioskId} (token: ${token})`);

      return res.json({
        message: 'Kiosk disconnected successfully',
        kioskId: kiosk.kioskId,
        kioskName: kiosk.kioskName
      });
    }

    // Remove from pending
    if (kioskStore.pending.has(token)) {
      const kiosk = kioskStore.pending.get(token);
      kioskStore.pending.delete(token);

      console.log(`Pending kiosk removed: ${kiosk.kioskId} (token: ${token})`);

      return res.json({
        message: 'Kiosk removed successfully',
        kioskId: kiosk.kioskId,
        kioskName: kiosk.kioskName
      });
    }

    res.status(404).json({ error: 'Kiosk not found' });
  } catch (error) {
    console.error('Error disconnecting kiosk:', error);
    res.status(500).json({ error: 'Failed to disconnect kiosk' });
  }
});

// GET /api/admin/pending-kiosks - List pending kiosk registrations (in-memory)
app.get('/api/admin/pending-kiosks', requireAdminAuth, async (req, res) => {
  try {
    const kiosks = [];

    // Add pending kiosks
    for (const [token, kiosk] of kioskStore.pending) {
      kiosks.push({
        token,
        status: 'pending',
        kioskId: kiosk.kioskId,
        kioskName: kiosk.kioskName,
        registeredAt: kiosk.registeredAt
      });
    }

    // Add active kiosk
    if (kioskStore.active) {
      kiosks.push({
        token: kioskStore.active.token,
        status: 'active',
        kioskId: kioskStore.active.kioskId,
        kioskName: kioskStore.active.kioskName,
        registeredAt: kioskStore.active.registeredAt,
        activatedAt: kioskStore.active.activatedAt
      });
    }

    res.json({ kiosks });
  } catch (error) {
    console.error('Error fetching pending kiosks:', error);
    res.status(500).json({ error: 'Failed to fetch kiosks' });
  }
});

// POST /api/admin/restore-turn - Restore to a specific turn, invalidating newer turns
app.post('/api/admin/restore-turn', requireAdminAuth, async (req, res) => {
  try {
    const { turnId } = req.body;

    if (!turnId) {
      return res.status(400).json({ error: 'turnId is required' });
    }

    // Find the turn to restore to
    const restoreTurn = await GameTurn.findByPk(turnId);
    if (!restoreTurn) {
      return res.status(404).json({ error: 'Turn not found' });
    }

    if (!restoreTurn.saveStateUrl) {
      return res.status(400).json({ error: 'Turn has no save state to restore' });
    }

    // Find all turns that are newer than the restore point and not already invalidated
    const turnsToInvalidate = await GameTurn.findAll({
      where: {
        turnEndedAt: {
          [require('sequelize').Op.gt]: restoreTurn.turnEndedAt
        },
        invalidatedAt: null
      }
    });

    const now = new Date();
    const invalidatedCount = turnsToInvalidate.length;

    // Mark all newer turns as invalidated
    if (invalidatedCount > 0) {
      await GameTurn.update(
        {
          invalidatedAt: now,
          invalidatedByRestoreToTurnId: turnId
        },
        {
          where: {
            id: turnsToInvalidate.map(t => t.id)
          }
        }
      );
    }

    console.log(`Restored to turn ${turnId}, invalidated ${invalidatedCount} newer turns`);

    res.json({
      success: true,
      restoredTurn: {
        id: restoreTurn.id,
        playerName: restoreTurn.playerName,
        location: restoreTurn.location,
        badgeCount: restoreTurn.badgeCount,
        turnEndedAt: restoreTurn.turnEndedAt,
        saveStateUrl: restoreTurn.saveStateUrl
      },
      invalidatedCount
    });
  } catch (error) {
    console.error('Error restoring turn:', error);
    res.status(500).json({ error: 'Failed to restore turn' });
  }
});

// ROM Management Endpoints

// GET /api/rom/:filename - Serve ROM file (public, for emulator)
app.get('/api/rom/:filename', async (req, res) => {
  try {
    const { filename } = req.params;

    // Validate filename (prevent path traversal)
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    // Initialize ROM storage if needed
    if (!romStorage.initialized) {
      await romStorage.initialize();
    }

    // Check if ROM exists
    const exists = await romStorage.romExists(filename);
    if (!exists) {
      return res.status(404).json({ error: 'ROM not found' });
    }

    // Get ROM data
    const romData = await romStorage.getRom(filename);

    // Send with appropriate headers for binary file
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', romData.length);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
    res.send(romData);
  } catch (error) {
    console.error('Error serving ROM:', error);
    res.status(500).json({ error: 'Failed to serve ROM' });
  }
});

// GET /api/admin/roms - List all ROMs (admin only)
app.get('/api/admin/roms', requireAdminAuth, async (req, res) => {
  try {
    // Initialize ROM storage if needed
    if (!romStorage.initialized) {
      await romStorage.initialize();
    }

    const roms = await romStorage.listRoms();
    res.json({ roms });
  } catch (error) {
    console.error('Error listing ROMs:', error);
    res.status(500).json({ error: 'Failed to list ROMs' });
  }
});

// POST /api/admin/upload-rom - Upload ROM file (admin only)
app.post('/api/admin/upload-rom', requireAdminAuth, async (req, res) => {
  try {
    const { filename, data } = req.body;

    if (!filename || !data) {
      return res.status(400).json({ error: 'filename and data are required' });
    }

    // Validate file extension
    const validExtensions = ['.gba', '.gbc', '.gb', '.nes', '.sfc', '.smc', '.bin'];
    const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    if (!validExtensions.includes(ext)) {
      return res.status(400).json({
        error: 'Invalid file type',
        message: `Allowed extensions: ${validExtensions.join(', ')}`
      });
    }

    // Initialize ROM storage if needed
    if (!romStorage.initialized) {
      const initialized = await romStorage.initialize();
      if (!initialized) {
        return res.status(500).json({ error: 'Failed to initialize ROM storage' });
      }
    }

    // Decode base64 data and upload
    const buffer = Buffer.from(data, 'base64');
    const savedFilename = await romStorage.uploadRom(filename, buffer);

    res.json({
      success: true,
      filename: savedFilename,
      size: buffer.length,
      message: 'ROM uploaded successfully'
    });
  } catch (error) {
    console.error('Error uploading ROM:', error);
    res.status(500).json({ error: 'Failed to upload ROM' });
  }
});

// DELETE /api/admin/roms/:filename - Delete ROM file (admin only)
app.delete('/api/admin/roms/:filename', requireAdminAuth, async (req, res) => {
  try {
    const { filename } = req.params;

    // Validate filename
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    // Initialize ROM storage if needed
    if (!romStorage.initialized) {
      await romStorage.initialize();
    }

    // Check if ROM exists
    const exists = await romStorage.romExists(filename);
    if (!exists) {
      return res.status(404).json({ error: 'ROM not found' });
    }

    await romStorage.deleteRom(filename);
    res.json({ success: true, message: 'ROM deleted successfully' });
  } catch (error) {
    console.error('Error deleting ROM:', error);
    res.status(500).json({ error: 'Failed to delete ROM' });
  }
});

// Save State Endpoints

// POST /api/admin/upload-save - Upload save file and create turn (admin only)
app.post('/api/admin/upload-save', requireAdminAuth, async (req, res) => {
  try {
    const { filename, data, playerName, location, badgeCount } = req.body;

    // Validation
    if (!filename || !data) {
      return res.status(400).json({ error: 'filename and data are required' });
    }

    if (!playerName) {
      return res.status(400).json({ error: 'playerName is required' });
    }

    // Validate file extension
    if (!filename.toLowerCase().endsWith('.sav')) {
      return res.status(400).json({ error: 'Only .sav files are allowed' });
    }

    // Sanitize filename (prevent path traversal)
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    // Initialize storage
    if (!saveStateStorage.initialized) {
      await saveStateStorage.initialize();
    }

    // Decode base64
    const buffer = Buffer.from(data, 'base64');

    // File size validation (5MB max)
    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(413).json({ error: 'File too large. Max size: 5MB' });
    }

    // Validate minimum size (GBA saves are at least 64KB)
    if (buffer.length < 64 * 1024) {
      return res.status(400).json({ error: 'File too small. Invalid save file?' });
    }

    // Create new GameTurn record
    const gameTurn = await GameTurn.create({
      playerName,
      location: location || 'Uploaded',
      badgeCount: badgeCount || 0,
      playtime: 0,
      money: 0,
      partyData: null,
      turnDuration: 0,
      message: 'Save uploaded by admin',
      saveStateUrl: null,
      turnEndedAt: new Date()
    });

    // Upload to MinIO
    const saveStateUrl = await saveStateStorage.saveTurnSave(
      process.env.DEFAULT_SESSION_ID || 'main-game',
      gameTurn.id,
      buffer,
      { playerName, location: location || 'Uploaded', badgeCount: badgeCount || 0 }
    );

    // Update turn with saveStateUrl
    gameTurn.saveStateUrl = saveStateUrl;
    await gameTurn.save();

    res.json({
      success: true,
      saveStateUrl,
      turnId: gameTurn.id,
      size: buffer.length,
      message: 'Save uploaded successfully'
    });
  } catch (error) {
    console.error('Error uploading save:', error);
    res.status(500).json({ error: 'Failed to upload save' });
  }
});

// GET /api/saves - List all saves
app.get('/api/saves', async (req, res) => {
  try {
    // Initialize MinIO storage if needed
    if (!saveStateStorage.initialized) {
      await saveStateStorage.initialize();
    }

    // Get list of saves from MinIO
    const saves = await saveStateStorage.listSaveStates();

    // Also get GameTurn records for additional metadata
    const turns = await GameTurn.findAll({
      attributes: ['id', 'playerName', 'location', 'badgeCount', 'saveStateUrl', 'turnEndedAt'],
      order: [['turnEndedAt', 'DESC']],
      limit: 50
    });

    // Combine MinIO saves with turn metadata
    const savesWithMetadata = saves.map(save => {
      const matchingTurn = turns.find(t => t.saveStateUrl === save.name);
      return {
        objectKey: save.name,
        size: save.size,
        lastModified: save.lastModified,
        playerName: matchingTurn?.playerName || 'Unknown',
        location: matchingTurn?.location || 'Unknown',
        badgeCount: matchingTurn?.badgeCount || 0,
        turnId: matchingTurn?.id || null
      };
    });

    res.json({ saves: savesWithMetadata });
  } catch (error) {
    console.error('Error listing save states:', error);
    res.status(500).json({ error: 'Failed to list save states' });
  }
});

// GET /api/saves/latest - Get latest valid (non-invalidated) save
app.get('/api/saves/latest', async (req, res) => {
  try {
    console.log('Fetching latest save from database...');
    // Find the latest non-invalidated turn with a save state
    const latestTurn = await GameTurn.findOne({
      where: {
        saveStateUrl: {
          [require('sequelize').Op.ne]: null
        },
        invalidatedAt: null
      },
      order: [['turnEndedAt', 'DESC']]
    });

    if (!latestTurn || !latestTurn.saveStateUrl) {
      console.log('No valid saves found in database');
      return res.status(404).json({ error: 'No saves found' });
    }

    console.log(`Latest save found: turn=${latestTurn.id}, saveStateUrl="${latestTurn.saveStateUrl}", player=${latestTurn.playerName}`);

    res.json({
      turnId: latestTurn.id,
      saveStateUrl: latestTurn.saveStateUrl,
      playerName: latestTurn.playerName,
      location: latestTurn.location,
      badgeCount: latestTurn.badgeCount,
      message: latestTurn.message,
      turnEndedAt: latestTurn.turnEndedAt
    });
  } catch (error) {
    console.error('Error getting latest save:', error);
    res.status(500).json({ error: 'Failed to get latest save' });
  }
});

// GET /api/saves/:objectKey/download - Download specific save
app.get('/api/saves/:objectKey/download', async (req, res) => {
  try {
    const { objectKey } = req.params;
    // Express auto-decodes URL params, but log both for debugging
    console.log(`Save download requested: "${objectKey}"`);

    // Initialize MinIO storage if needed
    if (!saveStateStorage.initialized) {
      await saveStateStorage.initialize();
    }

    const saveData = await saveStateStorage.loadSpecificSave(objectKey);

    if (!saveData) {
      console.log(`Save not found: "${objectKey}"`);
      return res.status(404).json({ error: 'Save not found' });
    }

    console.log(`Serving save: "${objectKey}" (${saveData.length} bytes)`);
    // Send as downloadable file
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${objectKey}"`);
    res.send(saveData);
  } catch (error) {
    console.error('Error downloading save:', error);
    res.status(500).json({ error: 'Failed to download save' });
  }
});

// POST /api/saves/upload - Upload save state
app.post('/api/saves/upload', async (req, res) => {
  try {
    const { saveData, gameData } = req.body;

    if (!saveData) {
      return res.status(400).json({ error: 'saveData is required' });
    }

    // Initialize MinIO storage if needed
    if (!saveStateStorage.initialized) {
      const initialized = await saveStateStorage.initialize();
      if (!initialized) {
        return res.status(500).json({ error: 'Failed to initialize storage' });
      }
    }

    // Prepare metadata
    const metadata = {
      playerName: gameData?.playerName || 'unknown',
      location: gameData?.location || 'unknown',
      badgeCount: gameData?.badgeCount || 0
    };

    // Save to MinIO as auto-save
    const saveUrl = await saveStateStorage.saveAutoSave(saveData, metadata);

    console.log(`Auto-save stored: ${saveUrl}`);
    res.json({
      success: true,
      saveUrl: saveUrl,
      message: 'Save state uploaded successfully'
    });
  } catch (error) {
    console.error('Error saving game state:', error);
    res.status(500).json({ error: 'Failed to save game state' });
  }
});

app.post('/api/game-turns', validateGameTurn, async (req, res) => {
  try {
    const {
      playerName,
      location,
      badgeCount,
      playtime,
      money,
      partyData,
      turnDuration,
      saveState,
      message
    } = req.body;

    let saveStateUrl = null;

    // Upload save state to MinIO if provided
    if (saveState && saveStateStorage.initialized) {
      try {
        const sessionId = process.env.DEFAULT_SESSION_ID || 'main-game';

        // Create the GameTurn first to get the ID
        const gameTurn = await GameTurn.create({
          playerName,
          location,
          badgeCount: badgeCount || 0,
          playtime,
          money: money || 0,
          partyData,
          turnDuration: turnDuration || 600,
          message: message || null,
          saveStateUrl: null, // Will update after MinIO upload
          turnEndedAt: new Date()
        });

        // Upload to MinIO with turn ID
        const metadata = {
          playerName,
          location: location || 'Unknown',
          badgeCount: badgeCount || 0
        };

        saveStateUrl = await saveStateStorage.saveTurnSave(
          sessionId,
          gameTurn.id,
          saveState,
          metadata
        );

        // Update the GameTurn with the MinIO URL
        gameTurn.saveStateUrl = saveStateUrl;
        await gameTurn.save();

        console.log(`Turn save uploaded to MinIO: ${saveStateUrl}`);
        res.status(201).json(gameTurn);
      } catch (minioError) {
        console.error('MinIO upload failed:', minioError);
        // Still create the turn record even if MinIO fails
        const gameTurn = await GameTurn.create({
          playerName,
          location,
          badgeCount: badgeCount || 0,
          playtime,
          money: money || 0,
          partyData,
          turnDuration: turnDuration || 600,
          message: message || null,
          saveStateUrl: null,
          turnEndedAt: new Date()
        });
        res.status(201).json({ ...gameTurn.toJSON(), warning: 'Save state upload failed' });
      }
    } else {
      // No save state provided or MinIO not initialized
      const gameTurn = await GameTurn.create({
        playerName,
        location,
        badgeCount: badgeCount || 0,
        playtime,
        money: money || 0,
        partyData,
        turnDuration: turnDuration || 600,
        message: message || null,
        saveStateUrl: null,
        turnEndedAt: new Date()
      });
      res.status(201).json(gameTurn);
    }
  } catch (error) {
    console.error('Error creating game turn:', error);
    res.status(500).json({ error: 'Failed to save game turn data' });
  }
});

app.get('/api/game-turns', async (req, res) => {
  try {
    const { limit = 50, offset = 0, playerName, includeInvalidated = 'true' } = req.query;

    const whereClause = {};
    if (playerName) {
      whereClause.playerName = playerName;
    }

    // By default, include all turns. Set includeInvalidated=false to exclude invalidated turns
    if (includeInvalidated === 'false') {
      whereClause.invalidatedAt = null;
    }

    const gameTurns = await GameTurn.findAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['turnEndedAt', 'DESC']]
    });

    const total = await GameTurn.count({ where: whereClause });

    res.json({
      data: gameTurns,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: (parseInt(offset) + parseInt(limit)) < total
      }
    });
  } catch (error) {
    console.error('Error fetching game turns:', error);
    res.status(500).json({ error: 'Failed to fetch game turns' });
  }
});

app.get('/api/game-turns/:id', async (req, res) => {
  try {
    const gameTurn = await GameTurn.findByPk(req.params.id);
    
    if (!gameTurn) {
      return res.status(404).json({ error: 'Game turn not found' });
    }

    res.json(gameTurn);
  } catch (error) {
    console.error('Error fetching game turn:', error);
    res.status(500).json({ error: 'Failed to fetch game turn' });
  }
});

// Snapshot endpoints
app.post('/api/game-turns/:turnId/snapshots/batch', async (req, res) => {
  try {
    const { turnId } = req.params;
    const { snapshots } = req.body;

    // Validate turn exists
    const turn = await GameTurn.findByPk(turnId);
    if (!turn) {
      return res.status(404).json({ error: 'Game turn not found' });
    }

    // Validate snapshots array
    if (!Array.isArray(snapshots) || snapshots.length === 0) {
      return res.status(400).json({ error: 'Snapshots must be a non-empty array' });
    }

    // Create all snapshots in a transaction
    const createdSnapshots = await sequelize.transaction(async (t) => {
      const snapshotPromises = snapshots.map(snapshot =>
        GameStateSnapshot.create({
          gameTurnId: turnId,
          sequenceNumber: snapshot.sequenceNumber,
          capturedAt: snapshot.capturedAt || new Date(),
          inGamePlaytime: snapshot.inGamePlaytime,
          playerX: snapshot.playerX,
          playerY: snapshot.playerY,
          location: snapshot.location,
          money: snapshot.money,
          badgeCount: snapshot.badgeCount,
          isInBattle: snapshot.isInBattle || false,
          battleType: snapshot.battleType,
          enemyParty: snapshot.enemyParty,
          pokedexSeenCount: snapshot.pokedexSeenCount,
          pokedexCaughtCount: snapshot.pokedexCaughtCount,
          bagItemsCount: snapshot.bagItemsCount,
          partyData: snapshot.partyData
        }, { transaction: t })
      );

      return await Promise.all(snapshotPromises);
    });

    console.log(`Created ${createdSnapshots.length} snapshots for turn ${turnId}`);
    res.status(201).json({
      success: true,
      count: createdSnapshots.length,
      snapshots: createdSnapshots
    });
  } catch (error) {
    console.error('Error creating snapshots:', error);

    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({
        error: 'Duplicate snapshot sequence number detected'
      });
    }

    res.status(500).json({ error: 'Failed to create snapshots' });
  }
});

app.get('/api/game-turns/:turnId/snapshots', async (req, res) => {
  try {
    const { turnId } = req.params;

    const snapshots = await GameStateSnapshot.findAll({
      where: { gameTurnId: turnId },
      order: [['sequenceNumber', 'ASC']]
    });

    res.json({
      turnId,
      count: snapshots.length,
      snapshots
    });
  } catch (error) {
    console.error('Error fetching snapshots:', error);
    res.status(500).json({ error: 'Failed to fetch snapshots' });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    // Count only valid (non-invalidated) turns
    const totalTurns = await GameTurn.count({
      where: { invalidatedAt: null }
    });
    const uniquePlayers = await GameTurn.count({
      distinct: true,
      col: 'playerName',
      where: { invalidatedAt: null }
    });

    // Get latest valid turn
    const latestTurn = await GameTurn.findOne({
      where: { invalidatedAt: null },
      order: [['turnEndedAt', 'DESC']]
    });

    // Only count valid turns for top players
    const topPlayers = await sequelize.query(`
      SELECT player_name, COUNT(*) as turn_count, MAX(badge_count) as max_badges
      FROM game_turns
      WHERE invalidated_at IS NULL
      GROUP BY player_name
      ORDER BY turn_count DESC, max_badges DESC
      LIMIT 10
    `, {
      type: sequelize.QueryTypes.SELECT
    });

    res.json({
      totalTurns,
      uniquePlayers,
      latestTurn,
      topPlayers
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// ============================================
// Statistics Endpoints (Public /statistics page)
// ============================================

// Stopwords for word frequency analysis
const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
  'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'and', 'but', 'or', 'nor', 'so', 'yet', 'both', 'either', 'neither',
  'not', 'only', 'own', 'same', 'than', 'too', 'very', 'just',
  'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves',
  'you', 'your', 'yours', 'yourself', 'yourselves', 'he', 'him',
  'his', 'himself', 'she', 'her', 'hers', 'herself', 'it', 'its',
  'itself', 'they', 'them', 'their', 'theirs', 'themselves',
  'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
  'am', 'been', 'being', 'there', 'here', 'when', 'where', 'why', 'how',
  'all', 'each', 'every', 'any', 'some', 'no', 'most', 'other', 'such',
  'get', 'got', 'getting', 'good', 'like', 'now', 'one', 'two', 'also',
  'back', 'more', 'out', 'up', 'down', 'then', 'well', 'way', 'even',
  'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us'
]);

// Badge names for Pokemon Fire Red
const BADGE_NAMES = [
  'Boulder Badge', 'Cascade Badge', 'Thunder Badge', 'Rainbow Badge',
  'Soul Badge', 'Marsh Badge', 'Volcano Badge', 'Earth Badge'
];

// Helper function for word frequency analysis
function calculateWordFrequency(messages) {
  const wordCounts = {};

  for (const message of messages) {
    if (!message) continue;
    // Lowercase, remove punctuation, split by whitespace
    const words = message.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length >= 3 && !STOPWORDS.has(word));

    for (const word of words) {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    }
  }

  // Sort by count and return top 50
  return Object.entries(wordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([word, count]) => ({ word, count }));
}

// Helper: Check if message is empty/default
function isEmptyOrDefaultMessage(message) {
  if (!message || message.trim() === '') return true;
  const lower = message.toLowerCase().trim();
  return lower.includes('played their turn');
}

// GET /api/statistics/overview - High-level aggregated statistics
app.get('/api/statistics/overview', async (req, res) => {
  try {
    const { Op } = require('sequelize');

    const totalTurns = await GameTurn.count({
      where: { invalidatedAt: null }
    });

    const uniquePlayers = await GameTurn.count({
      distinct: true,
      col: 'playerName',
      where: { invalidatedAt: null }
    });

    // Total playtime (sum of all turn playtimes)
    const playtimeResult = await sequelize.query(`
      SELECT COALESCE(SUM(playtime), 0) as total_playtime,
             COALESCE(AVG(turn_duration), 600) as avg_turn_duration
      FROM game_turns
      WHERE invalidated_at IS NULL
    `, { type: sequelize.QueryTypes.SELECT });

    const totalPlaytimeMinutes = Math.floor((playtimeResult[0]?.total_playtime || 0) / 60);
    const averageTurnDurationSeconds = Math.round(playtimeResult[0]?.avg_turn_duration || 600);

    // Current badge count (from latest turn)
    const latestTurn = await GameTurn.findOne({
      where: { invalidatedAt: null },
      order: [['turnEndedAt', 'DESC']]
    });
    const currentBadgeCount = latestTurn?.badgeCount || 0;

    // Count messages with actual content (not empty or "played their turn")
    const allMessages = await GameTurn.findAll({
      attributes: ['message'],
      where: { invalidatedAt: null }
    });
    const totalMessagesWithContent = allMessages.filter(t => !isEmptyOrDefaultMessage(t.message)).length;

    res.json({
      totalTurns,
      uniquePlayers,
      totalPlaytimeMinutes,
      averageTurnDurationSeconds,
      currentBadgeCount,
      totalMessagesWithContent
    });
  } catch (error) {
    console.error('Error fetching statistics overview:', error);
    res.status(500).json({ error: 'Failed to fetch statistics overview' });
  }
});

// GET /api/statistics/messages - Message analysis with word frequency
app.get('/api/statistics/messages', async (req, res) => {
  try {
    const allTurns = await GameTurn.findAll({
      attributes: ['id', 'playerName', 'message'],
      where: { invalidatedAt: null }
    });

    const totalMessages = allTurns.length;
    const turnsWithContent = allTurns.filter(t => !isEmptyOrDefaultMessage(t.message));
    const messagesWithContent = turnsWithContent.length;
    const emptyOrDefaultCount = totalMessages - messagesWithContent;

    // Calculate average length of non-empty messages
    const contentMessages = turnsWithContent.map(t => t.message).filter(Boolean);
    const averageLength = contentMessages.length > 0
      ? contentMessages.reduce((sum, m) => sum + m.length, 0) / contentMessages.length
      : 0;

    // Find longest and shortest messages
    let longestMessage = { message: '', playerName: '', turnId: '' };
    let shortestMessage = { message: '', playerName: '', turnId: '' };

    if (turnsWithContent.length > 0) {
      const sorted = [...turnsWithContent].sort((a, b) => (b.message?.length || 0) - (a.message?.length || 0));
      const longest = sorted[0];
      const shortest = sorted[sorted.length - 1];

      longestMessage = { message: longest.message, playerName: longest.playerName, turnId: longest.id };
      shortestMessage = { message: shortest.message, playerName: shortest.playerName, turnId: shortest.id };
    }

    // Word frequency analysis
    const wordFrequency = calculateWordFrequency(contentMessages);

    res.json({
      totalMessages,
      messagesWithContent,
      emptyOrDefaultCount,
      averageLength: Math.round(averageLength * 10) / 10,
      longestMessage,
      shortestMessage,
      wordFrequency
    });
  } catch (error) {
    console.error('Error fetching message statistics:', error);
    res.status(500).json({ error: 'Failed to fetch message statistics' });
  }
});

// GET /api/statistics/progress - Game progress analysis
app.get('/api/statistics/progress', async (req, res) => {
  try {
    const allTurns = await GameTurn.findAll({
      attributes: ['id', 'playerName', 'partyData', 'money', 'badgeCount', 'turnEndedAt'],
      where: { invalidatedAt: null },
      order: [['turnEndedAt', 'ASC']]
    });

    // Party analysis
    let totalPartySize = 0;
    let totalLevelsSum = 0;
    let totalHPPercentage = 0;
    let turnsWithParty = 0;
    let highestLevelPokemon = { species: 'None', level: 0, playerName: '' };
    const speciesCounts = {};

    // Level and money progression data
    const levelProgression = [];
    const moneyOverTime = [];
    let peakMoney = 0;
    let moneySum = 0;

    allTurns.forEach((turn, index) => {
      const turnNumber = index + 1;

      // Money tracking
      const money = turn.money || 0;
      moneySum += money;
      if (money > peakMoney) peakMoney = money;
      moneyOverTime.push({
        turnNumber,
        money,
        playerName: turn.playerName
      });

      // Party data analysis
      if (turn.partyData && Array.isArray(turn.partyData) && turn.partyData.length > 0) {
        turnsWithParty++;
        const party = turn.partyData;
        totalPartySize += party.length;

        let turnTotalLevels = 0;
        let turnTotalHP = 0;
        let turnMaxHP = 0;

        party.forEach(pokemon => {
          if (!pokemon) return;

          const level = pokemon.level || 0;
          turnTotalLevels += level;

          // Track highest level Pokemon
          if (level > highestLevelPokemon.level) {
            highestLevelPokemon = {
              species: pokemon.species || pokemon.nickname || 'Unknown',
              level,
              playerName: turn.playerName
            };
          }

          // Count species
          const species = (pokemon.species || 'unknown').toLowerCase();
          speciesCounts[species] = (speciesCounts[species] || 0) + 1;

          // HP tracking
          turnTotalHP += pokemon.currentHP || 0;
          turnMaxHP += pokemon.maxHP || pokemon.currentHP || 1;
        });

        totalLevelsSum += turnTotalLevels;
        if (turnMaxHP > 0) {
          totalHPPercentage += (turnTotalHP / turnMaxHP) * 100;
        }

        levelProgression.push({
          turnNumber,
          totalLevels: turnTotalLevels,
          partySize: party.length,
          playerName: turn.playerName
        });
      }
    });

    // Calculate averages
    const averagePartySize = turnsWithParty > 0 ? totalPartySize / turnsWithParty : 0;
    const averageTotalLevels = turnsWithParty > 0 ? totalLevelsSum / turnsWithParty : 0;
    const averagePartyHP = turnsWithParty > 0 ? totalHPPercentage / turnsWithParty : 0;
    const averageMoney = allTurns.length > 0 ? moneySum / allTurns.length : 0;

    // Most common species (top 10)
    const mostCommonSpecies = Object.entries(speciesCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([species, count]) => ({ species, count }));

    // Current money (from latest turn)
    const currentMoney = allTurns.length > 0 ? allTurns[allTurns.length - 1].money || 0 : 0;

    res.json({
      partyAnalysis: {
        averagePartySize: Math.round(averagePartySize * 10) / 10,
        averageTotalLevels: Math.round(averageTotalLevels),
        highestLevelPokemon,
        mostCommonSpecies,
        averagePartyHP: Math.round(averagePartyHP * 10) / 10
      },
      moneyProgression: {
        currentMoney,
        peakMoney,
        averageMoney: Math.round(averageMoney),
        moneyOverTime
      },
      levelProgression
    });
  } catch (error) {
    console.error('Error fetching progress statistics:', error);
    res.status(500).json({ error: 'Failed to fetch progress statistics' });
  }
});

// GET /api/statistics/milestones - Badge achievements and key milestones
app.get('/api/statistics/milestones', async (req, res) => {
  try {
    // Find first player to achieve each badge count
    const badgeMilestones = await sequelize.query(`
      WITH badge_firsts AS (
        SELECT
          badge_count,
          player_name,
          turn_ended_at,
          id,
          ROW_NUMBER() OVER (PARTITION BY badge_count ORDER BY turn_ended_at ASC) as rn
        FROM game_turns
        WHERE invalidated_at IS NULL
          AND badge_count > 0
      )
      SELECT badge_count, player_name, turn_ended_at, id
      FROM badge_firsts
      WHERE rn = 1
      ORDER BY badge_count
    `, { type: sequelize.QueryTypes.SELECT });

    const formattedMilestones = badgeMilestones.map(m => ({
      badgeNumber: m.badge_count,
      badgeName: BADGE_NAMES[m.badge_count - 1] || `Badge ${m.badge_count}`,
      playerName: m.player_name,
      achievedAt: m.turn_ended_at,
      turnId: m.id
    }));

    // Get current progress from latest turn
    const latestTurn = await GameTurn.findOne({
      where: { invalidatedAt: null },
      order: [['turnEndedAt', 'DESC']]
    });

    // Get pokedex stats from latest snapshot if available
    let pokedexSeen = 0;
    let pokedexCaught = 0;

    if (latestTurn) {
      const latestSnapshot = await GameStateSnapshot.findOne({
        where: { gameTurnId: latestTurn.id },
        order: [['sequenceNumber', 'DESC']]
      });

      if (latestSnapshot) {
        pokedexSeen = latestSnapshot.pokedexSeenCount || 0;
        pokedexCaught = latestSnapshot.pokedexCaughtCount || 0;
      }
    }

    // Total playtime
    const playtimeResult = await sequelize.query(`
      SELECT COALESCE(SUM(playtime), 0) as total_playtime
      FROM game_turns
      WHERE invalidated_at IS NULL
    `, { type: sequelize.QueryTypes.SELECT });

    res.json({
      badgeMilestones: formattedMilestones,
      currentProgress: {
        badgeCount: latestTurn?.badgeCount || 0,
        pokedexSeen,
        pokedexCaught,
        totalPlaytime: playtimeResult[0]?.total_playtime || 0
      }
    });
  } catch (error) {
    console.error('Error fetching milestones:', error);
    res.status(500).json({ error: 'Failed to fetch milestones' });
  }
});

// GET /api/statistics/locations - Location frequency data
app.get('/api/statistics/locations', async (req, res) => {
  try {
    // Get location counts from game turns
    const locationStats = await sequelize.query(`
      SELECT
        location,
        COUNT(*) as visit_count,
        MIN(turn_ended_at) as first_visit,
        MAX(turn_ended_at) as last_visit,
        (SELECT player_name FROM game_turns g2
         WHERE g2.location = game_turns.location
         AND g2.invalidated_at IS NULL
         ORDER BY turn_ended_at ASC LIMIT 1) as first_visitor
      FROM game_turns
      WHERE invalidated_at IS NULL
        AND location IS NOT NULL
        AND location != ''
      GROUP BY location
      ORDER BY visit_count DESC
    `, { type: sequelize.QueryTypes.SELECT });

    // Get total turns for percentage calculation
    const totalTurns = await GameTurn.count({
      where: { invalidatedAt: null }
    });

    // Format the data
    const locations = locationStats.map(loc => ({
      location: loc.location,
      visitCount: parseInt(loc.visit_count),
      percentage: totalTurns > 0 ? Math.round((parseInt(loc.visit_count) / totalTurns) * 100) : 0,
      firstVisitor: loc.first_visitor,
      firstVisit: loc.first_visit,
      lastVisit: loc.last_visit
    }));

    // Get unique location count
    const uniqueLocations = locations.length;

    // Most visited location
    const mostVisited = locations.length > 0 ? locations[0] : null;

    res.json({
      locations,
      uniqueLocations,
      totalTurns,
      mostVisited
    });
  } catch (error) {
    console.error('Error fetching location statistics:', error);
    res.status(500).json({ error: 'Failed to fetch location statistics' });
  }
});

// GET /api/statistics/activity - Activity heatmap data (when people play)
app.get('/api/statistics/activity', async (req, res) => {
  try {
    // Get all turn timestamps
    const turns = await GameTurn.findAll({
      attributes: ['turnEndedAt'],
      where: { invalidatedAt: null },
      order: [['turnEndedAt', 'ASC']]
    });

    // Initialize heatmap grid: 7 days x 24 hours
    const heatmap = {};
    for (let day = 0; day < 7; day++) {
      heatmap[day] = {};
      for (let hour = 0; hour < 24; hour++) {
        heatmap[day][hour] = 0;
      }
    }

    // Count turns by day of week and hour
    let totalTurns = 0;
    let maxCount = 0;

    turns.forEach(turn => {
      if (!turn.turnEndedAt) return;
      const date = new Date(turn.turnEndedAt);
      const day = date.getDay(); // 0 = Sunday, 6 = Saturday
      const hour = date.getHours();
      heatmap[day][hour]++;
      totalTurns++;
      if (heatmap[day][hour] > maxCount) {
        maxCount = heatmap[day][hour];
      }
    });

    // Convert to array format for frontend
    const heatmapData = [];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        heatmapData.push({
          day,
          dayName: dayNames[day],
          hour,
          count: heatmap[day][hour]
        });
      }
    }

    // Also get activity by date for a timeline view
    const activityByDate = {};
    turns.forEach(turn => {
      if (!turn.turnEndedAt) return;
      const dateStr = new Date(turn.turnEndedAt).toISOString().split('T')[0];
      activityByDate[dateStr] = (activityByDate[dateStr] || 0) + 1;
    });

    const dailyActivity = Object.entries(activityByDate)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Find peak times
    let peakDay = 0;
    let peakHour = 0;
    let peakCount = 0;

    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        if (heatmap[day][hour] > peakCount) {
          peakCount = heatmap[day][hour];
          peakDay = day;
          peakHour = hour;
        }
      }
    }

    res.json({
      heatmap: heatmapData,
      maxCount,
      totalTurns,
      dailyActivity,
      peakTime: {
        day: dayNames[peakDay],
        hour: peakHour,
        count: peakCount
      }
    });
  } catch (error) {
    console.error('Error fetching activity statistics:', error);
    res.status(500).json({ error: 'Failed to fetch activity statistics' });
  }
});

// GET /api/statistics/players - Per-player statistics
app.get('/api/statistics/players', async (req, res) => {
  try {
    // Get all player statistics
    const playerStats = await sequelize.query(`
      SELECT
        player_name,
        COUNT(*) as turn_count,
        SUM(playtime) as total_playtime,
        MAX(badge_count) as max_badges,
        COUNT(CASE WHEN message IS NOT NULL
                   AND message != ''
                   AND LOWER(message) NOT LIKE '%played their turn%'
              THEN 1 END) as messages_left,
        AVG(CASE WHEN message IS NOT NULL
                 AND message != ''
                 AND LOWER(message) NOT LIKE '%played their turn%'
            THEN LENGTH(message) END) as avg_message_length
      FROM game_turns
      WHERE invalidated_at IS NULL
      GROUP BY player_name
      ORDER BY turn_count DESC
    `, { type: sequelize.QueryTypes.SELECT });

    // Get which badges each player earned (first to earn)
    const badgeEarners = await sequelize.query(`
      WITH badge_firsts AS (
        SELECT
          badge_count,
          player_name,
          ROW_NUMBER() OVER (PARTITION BY badge_count ORDER BY turn_ended_at ASC) as rn
        FROM game_turns
        WHERE invalidated_at IS NULL
          AND badge_count > 0
      )
      SELECT player_name, ARRAY_AGG(badge_count ORDER BY badge_count) as badges_earned
      FROM badge_firsts
      WHERE rn = 1
      GROUP BY player_name
    `, { type: sequelize.QueryTypes.SELECT });

    const badgeMap = {};
    badgeEarners.forEach(b => {
      badgeMap[b.player_name] = b.badges_earned || [];
    });

    const players = playerStats.map(p => ({
      playerName: p.player_name,
      turnCount: parseInt(p.turn_count),
      totalPlaytime: parseInt(p.total_playtime) || 0,
      maxBadges: p.max_badges || 0,
      badgesEarned: badgeMap[p.player_name] || [],
      messagesLeft: parseInt(p.messages_left) || 0,
      averageMessageLength: Math.round(p.avg_message_length || 0)
    }));

    // Top contributors
    const topByTurns = players.slice(0, 10).map(p => ({
      playerName: p.playerName,
      count: p.turnCount
    }));

    const topByBadges = Object.entries(badgeMap)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 10)
      .map(([playerName, badges]) => ({
        playerName,
        badges
      }));

    res.json({
      players,
      topContributors: {
        byTurns: topByTurns,
        byBadges: topByBadges
      }
    });
  } catch (error) {
    console.error('Error fetching player statistics:', error);
    res.status(500).json({ error: 'Failed to fetch player statistics' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Production static file serving (when built frontends are available)
if (process.env.NODE_ENV === 'production') {
  // Serve admin app at /admin
  const adminPath = path.join(__dirname, '../admin/build');
  app.use('/admin', express.static(adminPath));
  app.get('/admin/{*splat}', (req, res) => {
    res.sendFile(path.join(adminPath, 'index.html'));
  });

  // Serve frontend app at root (must be last)
  const frontendPath = path.join(__dirname, '../frontend/build');
  app.use(express.static(frontendPath));
  app.get('{*splat}', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

const startServer = async () => {
  try {
    // Initialize database (checks tables, runs migrations if needed)
    console.log('Initializing database...');
    const dbResult = await initializeDatabase(true);

    if (!dbResult.success) {
      console.error('Database initialization failed:', dbResult.message);
      process.exit(1);
    }

    if (dbResult.ranMigrations) {
      console.log('Database migrations completed automatically.');
    }

    // Initialize MinIO storage for save states
    console.log('Initializing MinIO storage...');
    const minioInitialized = await saveStateStorage.initialize();
    if (minioInitialized) {
      console.log('MinIO save state storage initialized successfully.');
    } else {
      console.warn('MinIO save state storage initialization failed. Save states will not work.');
    }

    // Initialize ROM storage
    console.log('Initializing ROM storage...');
    const romInitialized = await romStorage.initialize();
    if (romInitialized) {
      console.log('ROM storage initialized successfully.');
    } else {
      console.warn('ROM storage initialization failed. ROM serving will not work.');
    }

    // Warn if using default admin password
    if (!process.env.ADMIN_PASSWORD) {
      console.warn('WARNING: No ADMIN_PASSWORD set in environment. Using default password. Please set ADMIN_PASSWORD for production use.');
    }

    app.listen(PORT, () => {
      console.log(`10MP Backend server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Unable to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown handler
const gracefulShutdown = async (signal) => {
  console.log(`\nReceived ${signal}, closing server gracefully...`);
  try {
    await sequelize.close();
    console.log('Database connections closed.');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

startServer();
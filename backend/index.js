require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { sequelize } = require('./models');
const GameTurn = require('./models').GameTurn;
const GameSession = require('./models').GameSession;
const KioskRegistration = require('./models').KioskRegistration;
const { isValidKioskToken } = require('./utils/kioskToken');
const saveStateStorage = require('./services/saveStateStorage');
const { initializeDatabase } = require('./utils/dbCheck');

const app = express();
const PORT = process.env.PORT || 3001;

// Configure CORS with multiple origins (frontend + admin)
const allowedOrigins = [
  process.env.CORS_ORIGIN || 'http://localhost:3000',      // Frontend/Kiosk
  process.env.CORS_ORIGIN_ADMIN || 'http://localhost:3002' // Admin console
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));

// Basic request validation middleware
const validateGameTurn = (req, res, next) => {
  const { playerName, badgeCount, playtime, money, turnDuration } = req.body;

  if (!playerName || typeof playerName !== 'string' || playerName.trim() === '') {
    return res.status(400).json({ error: 'Valid playerName is required' });
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

  next();
};

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/config', (req, res) => {
  res.json({
    turnDurationMinutes: parseInt(process.env.TURN_DURATION_MINUTES) || 10,
    autoSaveIntervalMinutes: parseInt(process.env.AUTO_SAVE_INTERVAL_MINUTES) || 1,
    defaultSessionId: process.env.DEFAULT_SESSION_ID || 'main-game',
    adminPassword: process.env.ADMIN_PASSWORD || 'change-me-in-production'
  });
});

// Session Management Endpoints

// POST /api/session/init - Initialize session (create if doesn't exist)
app.post('/api/session/init', async (req, res) => {
  try {
    const sessionId = process.env.DEFAULT_SESSION_ID || 'main-game';

    // Generate a simple 6-digit session code
    const generateSessionCode = () => {
      return Math.floor(100000 + Math.random() * 900000).toString();
    };

    // Find or create the session
    const [session, created] = await GameSession.findOrCreate({
      where: { sessionId },
      defaults: {
        sessionId,
        sessionCode: generateSessionCode(),
        isActive: false,
        currentSaveStateUrl: null,
        lastActivityAt: new Date()
      }
    });

    console.log(created ? `Session initialized: ${sessionId}` : `Session already exists: ${sessionId}`);

    res.json({
      sessionId: session.sessionId,
      sessionCode: session.sessionCode,
      isActive: session.isActive,
      currentSaveStateUrl: session.currentSaveStateUrl,
      created,
      message: created ? 'Session created successfully' : 'Session already exists'
    });
  } catch (error) {
    console.error('Error initializing session:', error);
    res.status(500).json({ error: 'Failed to initialize session' });
  }
});

// GET /api/session/status - Get current session state
app.get('/api/session/status', async (req, res) => {
  try {
    const sessionId = process.env.DEFAULT_SESSION_ID || 'main-game';
    const session = await GameSession.findByPk(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'No active session' });
    }

    res.json({
      sessionId: session.sessionId,
      isActive: session.isActive,
      currentSaveStateUrl: session.currentSaveStateUrl,
      lastActivityAt: session.lastActivityAt
    });
  } catch (error) {
    console.error('Error fetching session status:', error);
    res.status(500).json({ error: 'Failed to fetch session status' });
  }
});

// POST /api/session/start - Admin starts game session
app.post('/api/session/start', async (req, res) => {
  try {
    const sessionId = process.env.DEFAULT_SESSION_ID || 'main-game';
    const session = await GameSession.findByPk(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    session.isActive = true;
    session.lastActivityAt = new Date();
    await session.save();

    console.log(`Session started: ${sessionId}`);
    res.json({
      sessionId: session.sessionId,
      isActive: session.isActive,
      message: 'Session started successfully'
    });
  } catch (error) {
    console.error('Error starting session:', error);
    res.status(500).json({ error: 'Failed to start session' });
  }
});

// POST /api/session/stop - Admin stops game session
app.post('/api/session/stop', async (req, res) => {
  try {
    const sessionId = process.env.DEFAULT_SESSION_ID || 'main-game';
    const session = await GameSession.findByPk(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    session.isActive = false;
    session.lastActivityAt = new Date();
    await session.save();

    console.log(`Session stopped: ${sessionId}`);
    res.json({
      sessionId: session.sessionId,
      isActive: session.isActive,
      message: 'Session stopped successfully'
    });
  } catch (error) {
    console.error('Error stopping session:', error);
    res.status(500).json({ error: 'Failed to stop session' });
  }
});

// POST /api/session/save - Save current game state to MinIO
app.post('/api/session/save', async (req, res) => {
  try {
    const { sessionId, saveData, gameData } = req.body;

    if (!sessionId || !saveData) {
      return res.status(400).json({ error: 'sessionId and saveData are required' });
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
    const saveUrl = await saveStateStorage.saveAutoSave(sessionId, saveData, metadata);

    // Update session's current save state URL
    const session = await GameSession.findByPk(sessionId);
    if (session) {
      session.currentSaveStateUrl = saveUrl;
      session.lastActivityAt = new Date();
      await session.save();
    }

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

// GET /api/session/saves - List all save points for restore
app.get('/api/session/saves', async (req, res) => {
  try {
    const sessionId = process.env.DEFAULT_SESSION_ID || 'main-game';

    // Initialize MinIO storage if needed
    if (!saveStateStorage.initialized) {
      await saveStateStorage.initialize();
    }

    // Get list of saves from MinIO
    const saves = await saveStateStorage.listSaveStates(sessionId);

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

    res.json({
      sessionId: sessionId,
      saves: savesWithMetadata
    });
  } catch (error) {
    console.error('Error listing save states:', error);
    res.status(500).json({ error: 'Failed to list save states' });
  }
});

// Kiosk Registration Endpoints (New Token-Based System)

// POST /api/kiosk/register - Kiosk registers with generated token
app.post('/api/kiosk/register', async (req, res) => {
  try {
    const { token, kioskId, kioskName } = req.body;

    if (!token || !kioskId) {
      return res.status(400).json({ error: 'token and kioskId are required' });
    }

    if (!isValidKioskToken(token)) {
      return res.status(400).json({ error: 'Invalid token format. Must be 12-32 alphanumeric characters.' });
    }

    // Check if token already exists
    const existing = await KioskRegistration.findOne({ where: { token } });
    if (existing) {
      // Token already registered, return existing registration
      return res.json({
        id: existing.id,
        token: existing.token,
        status: existing.status,
        sessionId: existing.sessionId,
        message: 'Kiosk already registered'
      });
    }

    // Create new registration
    const registration = await KioskRegistration.create({
      token,
      kioskId,
      kioskName: kioskName || null,
      status: 'pending',
      registeredAt: new Date()
    });

    console.log(`Kiosk registered: ${kioskId} with token: ${token}`);

    res.status(201).json({
      id: registration.id,
      token: registration.token,
      status: registration.status,
      message: 'Kiosk registered. Waiting for admin activation.'
    });
  } catch (error) {
    console.error('Error registering kiosk:', error);
    res.status(500).json({ error: 'Failed to register kiosk' });
  }
});

// GET /api/kiosk/status/:token - Kiosk checks activation status
app.get('/api/kiosk/status/:token', async (req, res) => {
  try {
    const { token } = req.params;

    if (!isValidKioskToken(token)) {
      return res.status(400).json({ error: 'Invalid token format' });
    }

    const registration = await KioskRegistration.findOne({ where: { token } });

    if (!registration) {
      return res.status(404).json({ error: 'Kiosk not registered' });
    }

    // Update last heartbeat
    registration.lastHeartbeat = new Date();
    await registration.save();

    res.json({
      status: registration.status,
      sessionId: registration.sessionId,
      activatedAt: registration.activatedAt,
      isActive: registration.status === 'active'
    });
  } catch (error) {
    console.error('Error checking kiosk status:', error);
    res.status(500).json({ error: 'Failed to check status' });
  }
});

// POST /api/admin/activate-kiosk - Admin activates kiosk by token
app.post('/api/admin/activate-kiosk', async (req, res) => {
  try {
    const { token, sessionId } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'token is required' });
    }

    if (!isValidKioskToken(token)) {
      return res.status(400).json({ error: 'Invalid token format' });
    }

    const registration = await KioskRegistration.findOne({ where: { token } });

    if (!registration) {
      return res.status(404).json({ error: 'Kiosk not found' });
    }

    // Activate the kiosk
    registration.status = 'active';
    registration.sessionId = sessionId || process.env.DEFAULT_SESSION_ID || 'main-game';
    registration.activatedAt = new Date();
    await registration.save();

    console.log(`Kiosk activated: ${registration.kioskId} (token: ${token})`);

    res.json({
      id: registration.id,
      token: registration.token,
      kioskId: registration.kioskId,
      kioskName: registration.kioskName,
      status: registration.status,
      sessionId: registration.sessionId,
      activatedAt: registration.activatedAt,
      message: 'Kiosk activated successfully'
    });
  } catch (error) {
    console.error('Error activating kiosk:', error);
    res.status(500).json({ error: 'Failed to activate kiosk' });
  }
});

// POST /api/admin/deny-kiosk - Admin denies kiosk by token
app.post('/api/admin/deny-kiosk', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'token is required' });
    }

    if (!isValidKioskToken(token)) {
      return res.status(400).json({ error: 'Invalid token format' });
    }

    const registration = await KioskRegistration.findOne({ where: { token } });

    if (!registration) {
      return res.status(404).json({ error: 'Kiosk not found' });
    }

    // Deny the kiosk
    registration.status = 'denied';
    registration.deniedAt = new Date();
    await registration.save();

    console.log(`Kiosk denied: ${registration.kioskId} (token: ${token})`);

    res.json({
      id: registration.id,
      token: registration.token,
      kioskId: registration.kioskId,
      kioskName: registration.kioskName,
      status: registration.status,
      deniedAt: registration.deniedAt,
      message: 'Kiosk denied successfully'
    });
  } catch (error) {
    console.error('Error denying kiosk:', error);
    res.status(500).json({ error: 'Failed to deny kiosk' });
  }
});

// GET /api/admin/pending-kiosks - List pending kiosk registrations
app.get('/api/admin/pending-kiosks', async (req, res) => {
  try {
    const { status = 'pending' } = req.query;

    const whereClause = status === 'all' ? {} : { status };

    const kiosks = await KioskRegistration.findAll({
      where: whereClause,
      order: [['registeredAt', 'DESC']],
      limit: 50
    });

    res.json({
      kiosks: kiosks.map(k => ({
        id: k.id,
        token: k.token,
        kioskId: k.kioskId,
        kioskName: k.kioskName,
        status: k.status,
        sessionId: k.sessionId,
        registeredAt: k.registeredAt,
        activatedAt: k.activatedAt,
        lastHeartbeat: k.lastHeartbeat
      }))
    });
  } catch (error) {
    console.error('Error fetching pending kiosks:', error);
    res.status(500).json({ error: 'Failed to fetch kiosks' });
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
      saveState
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
    const { limit = 50, offset = 0, playerName } = req.query;
    
    const whereClause = {};
    if (playerName) {
      whereClause.playerName = playerName;
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

app.get('/api/stats', async (req, res) => {
  try {
    const totalTurns = await GameTurn.count();
    const uniquePlayers = await GameTurn.count({
      distinct: true,
      col: 'playerName'
    });
    
    const latestTurn = await GameTurn.findOne({
      order: [['turnEndedAt', 'DESC']]
    });

    const topPlayers = await sequelize.query(`
      SELECT player_name, COUNT(*) as turn_count, MAX(badge_count) as max_badges
      FROM game_turns 
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

    // Initialize MinIO storage
    console.log('Initializing MinIO storage...');
    const minioInitialized = await saveStateStorage.initialize();
    if (minioInitialized) {
      console.log('MinIO storage initialized successfully.');
    } else {
      console.warn('MinIO storage initialization failed. Save states will not work.');
    }

    app.listen(PORT, () => {
      console.log(`10MP Backend server running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
      console.log(`API docs: http://localhost:${PORT}/api/game-turns`);
      console.log(`Admin console: http://localhost:3002 (separate application)`);
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
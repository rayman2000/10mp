require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { sequelize } = require('./models');
const GameTurn = require('./models').GameTurn;
const GameSession = require('./models').GameSession;
const { generateSessionCode, isValidSessionCode } = require('./utils/sessionCode');
const saveStateStorage = require('./services/saveStateStorage');

const app = express();
const PORT = process.env.PORT || 3001;

// Configure CORS with environment variable
const corsOptions = {
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
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

// POST /api/session/init - Initialize or reset session with new code
app.post('/api/session/init', async (req, res) => {
  try {
    const sessionId = process.env.DEFAULT_SESSION_ID || 'main-game';
    const newCode = generateSessionCode();

    // Find or create session
    let session = await GameSession.findByPk(sessionId);

    if (session) {
      // Update existing session with new code
      session.sessionCode = newCode;
      session.lastActivityAt = new Date();
      await session.save();
    } else {
      // Create new session
      session = await GameSession.create({
        sessionId: sessionId,
        sessionCode: newCode,
        isActive: false,
        currentSaveStateUrl: null
      });
    }

    console.log(`Session initialized: ${sessionId}, code: ${newCode}`);
    res.json({
      sessionId: session.sessionId,
      sessionCode: session.sessionCode,
      isActive: session.isActive
    });
  } catch (error) {
    console.error('Error initializing session:', error);
    res.status(500).json({ error: 'Failed to initialize session' });
  }
});

// GET /api/session/connect/:code - Kiosk connects with code
app.get('/api/session/connect/:code', async (req, res) => {
  try {
    const { code } = req.params;

    if (!isValidSessionCode(code)) {
      return res.status(400).json({ error: 'Invalid session code format' });
    }

    const session = await GameSession.findOne({
      where: { sessionCode: code }
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found. Check your code.' });
    }

    // Update last activity
    session.lastActivityAt = new Date();
    await session.save();

    console.log(`Kiosk connected to session: ${session.sessionId}`);
    res.json({
      sessionId: session.sessionId,
      sessionCode: session.sessionCode,
      isActive: session.isActive,
      currentSaveStateUrl: session.currentSaveStateUrl
    });
  } catch (error) {
    console.error('Error connecting to session:', error);
    res.status(500).json({ error: 'Failed to connect to session' });
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
      sessionCode: session.sessionCode,
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
      return res.status(404).json({ error: 'Session not found. Initialize first.' });
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

    const gameTurn = await GameTurn.create({
      playerName,
      location,
      badgeCount: badgeCount || 0,
      playtime,
      money: money || 0,
      partyData,
      turnDuration: turnDuration || 600,
      saveState,
      turnEndedAt: new Date()
    });

    res.status(201).json(gameTurn);
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
    await sequelize.authenticate();
    console.log('Database connection established successfully.');
    console.log('Run migrations with: npm run db:migrate');

    app.listen(PORT, () => {
      console.log(`10MP Backend server running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
      console.log(`API docs: http://localhost:${PORT}/api/game-turns`);
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
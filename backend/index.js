require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { sequelize } = require('./models');
const GameTurn = require('./models').GameTurn;

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
# 10 Minute Pokemon (10MP)

A collaborative Pokemon Fire Red experience where players take turns playing for exactly 10 minutes before passing the adventure to the next trainer. Built for kiosk deployment with remote session management and cloud save states.

## Features

- **Kiosk-Based Architecture**: Raspberry Pi kiosks connect to remote backend via 6-digit codes
- **Turn-Based Gameplay**: Configurable turn duration (default 10 minutes)
- **Auto-Save System**: Automatic save states every 1 minute to MinIO blob storage
- **Session Management**: Simple 6-digit codes for kiosk connection
- **Admin Panel**: Web-based dashboard for session control and save state management
- **Game State Tracking**: Scrapes Pokemon Fire Red memory for badges, location, party data
- **Save Point Restoration**: Admin can restore to any previous save state
- **Statistics Dashboard**: Track total turns, unique players, and game progress

## Architecture

```
[Raspberry Pi Kiosk]          [Remote Backend Server]
   - Browser (kiosk)    <-->    - Express API (Node.js)
   - ROM files                  - PostgreSQL (metadata)
   - EmulatorJS                 - MinIO (save files)
                                - Admin UI
```

## Quick Start

### Prerequisites

- Node.js 16+
- Docker & Docker Compose
- Pokemon Fire Red ROM (legally obtained)
- GBA BIOS (optional but recommended)

### 1. Clone and Install

```bash
git clone <repository-url>
cd 10mp

# Install all dependencies
npm run install:all
```

### 2. Setup ROM Files

Place your ROM files in `frontend/public/emulator/`:
- `pokemon-firered.gba` - Main ROM file (you must provide)
- `gba_bios.bin` - GBA BIOS (optional)

### 3. Start Backend with Docker

```bash
cd backend

# Start PostgreSQL + MinIO + Backend
docker-compose up -d

# Run migrations (first time only)
docker exec tenmp-backend npm run db:migrate

# View logs
docker-compose logs -f
```

Backend will be available at `http://localhost:3001`
MinIO Console at `http://localhost:9001` (minioadmin / minioadmin123)

### 4. Start Frontend

```bash
cd frontend
npm run dev
```

Frontend will be available at `http://localhost:3000`

### 5. Initialize Session

**Option A: Via Admin Panel**
1. Press `Ctrl+Shift+A` in the frontend
2. Login with password: `change-me-in-production`
3. Click "Generate New Code"
4. Note the 6-digit code

**Option B: Via API**
```bash
curl -X POST http://localhost:3001/api/session/init
# Returns: {"sessionId":"main-game","sessionCode":"123456","isActive":false}
```

### 6. Connect Kiosk

1. Open frontend in browser
2. Enter the 6-digit code
3. Start playing!

## Configuration

### Backend Configuration

Edit `backend/.env`:

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=tenmp_db
DB_USERNAME=username
DB_PASSWORD=password

# Server
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000

# Gameplay
TURN_DURATION_MINUTES=10
AUTO_SAVE_INTERVAL_MINUTES=1

# Session
DEFAULT_SESSION_ID=main-game

# Admin
ADMIN_PASSWORD=change-me-in-production

# MinIO
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin123
MINIO_BUCKET=game-saves
```

### Frontend Configuration

Edit `frontend/.env`:

```env
REACT_APP_API_URL=http://localhost:3001
REACT_APP_ROM_PATH=/emulator/pokemon-firered.gba
```

## Admin Panel

### Access

Press `Ctrl+Shift+A` anywhere in the frontend app, then login with admin password.

### Features

**Session Management:**
- Generate new 6-digit session codes
- Start/Stop game sessions
- View current session status
- Monitor last activity

**Save State Management:**
- List all save points with metadata
- Restore to any previous save
- View player name, location, badges, timestamp
- See auto-saves and turn-end saves

**Quick Stats:**
- Total turns played
- Unique players
- Current badges and location
- Last player name

## Project Structure

```
10mp/
├── frontend/              # React frontend
│   ├── src/
│   │   ├── components/   # React components
│   │   │   ├── AdminPanel.js          # Admin dashboard
│   │   │   ├── ErrorBoundary.js       # Error handling
│   │   │   ├── GameScreen.js          # Main game screen
│   │   │   ├── PlayerEntry.js         # Player name entry
│   │   │   ├── MessageInput.js        # Turn-end message
│   │   │   └── SessionConnect.js      # Kiosk connection
│   │   ├── hooks/        # Custom hooks
│   │   │   └── useEmulator.js         # Emulator management
│   │   ├── services/     # API services
│   │   │   └── api.js                 # API client
│   │   └── utils/        # Utilities
│   │       └── emulator.js            # EmulatorManager class
│   └── public/
│       └── emulator/     # ROM files (not included)
├── backend/               # Node.js/Express API
│   ├── models/           # Sequelize models
│   │   ├── GameTurn.js              # Turn records
│   │   └── GameSession.js           # Session management
│   ├── migrations/       # Database migrations
│   ├── services/         # Business logic
│   │   └── saveStateStorage.js      # MinIO integration
│   ├── utils/            # Utilities
│   │   └── sessionCode.js           # Code generation
│   └── docker-compose.yml
└── package.json          # Root workspace
```

## Development Commands

**Full Stack:**
- `npm run dev` - Start both frontend and backend
- `npm run install:all` - Install dependencies for all projects

**Frontend:**
- `npm run frontend:dev` - Start React development server
- `npm run frontend:build` - Build for production

**Backend (Docker):**
- `npm run docker:dev` - Start backend + PostgreSQL + MinIO in Docker
- `npm run docker:down` - Stop all Docker containers
- `npm run docker:logs` - View container logs
- `npm run docker:clean` - Stop containers and clean up volumes/images

**Backend (Local):**
- `npm run backend:dev` - Start Express with nodemon
- `npm run backend:db:setup` - Create database and run migrations

## API Documentation

See [API.md](./API.md) for complete API documentation.

### Quick Reference

**Config:** `GET /api/config`
**Health:** `GET /health`

**Sessions:**
- `POST /api/session/init` - Generate new session code
- `GET /api/session/connect/:code` - Connect with code
- `GET /api/session/status` - Get session status
- `POST /api/session/start` - Start session
- `POST /api/session/stop` - Stop session
- `POST /api/session/save` - Upload save state
- `GET /api/session/saves` - List save states

**Game Turns:**
- `POST /api/game-turns` - Create turn record
- `GET /api/game-turns` - List turns
- `GET /api/game-turns/:id` - Get specific turn
- `GET /api/stats` - Get statistics

## Database Schema

### GameTurn Table

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| playerName | STRING | Player's name |
| location | STRING | Game location |
| badgeCount | INTEGER | Number of badges |
| playtime | INTEGER | Total playtime (seconds) |
| money | INTEGER | Player's money |
| partyData | JSONB | Pokemon party info |
| turnDuration | INTEGER | Turn length (seconds) |
| turnEndedAt | DATE | Turn end timestamp |
| saveStateUrl | STRING | MinIO object key |

### GameSession Table

| Column | Type | Description |
|--------|------|-------------|
| sessionId | STRING | Primary key |
| sessionCode | STRING | 6-digit connection code |
| currentSaveStateUrl | STRING | Latest save reference |
| isActive | BOOLEAN | Session running status |
| lastActivityAt | DATE | Last activity timestamp |

## Deployment

### Production Checklist

- [ ] Change `ADMIN_PASSWORD` in backend/.env
- [ ] Change `MINIO_ROOT_PASSWORD` in backend/.env
- [ ] Update `CORS_ORIGIN` to production frontend URL
- [ ] Set `NODE_ENV=production`
- [ ] Configure proper PostgreSQL credentials
- [ ] Set up SSL/TLS for MinIO
- [ ] Configure reverse proxy (nginx/caddy)
- [ ] Set up automated backups for PostgreSQL
- [ ] Set up MinIO replication/backup
- [ ] Configure firewall rules
- [ ] Set up monitoring/logging

### Environment Variables for Production

```env
NODE_ENV=production
CORS_ORIGIN=https://your-frontend-domain.com
ADMIN_PASSWORD=strong-random-password-here
MINIO_ROOT_PASSWORD=another-strong-password
DB_PASSWORD=secure-database-password
```

## Troubleshooting

### Backend won't start

- Check PostgreSQL is running: `docker ps | grep postgres`
- Check database exists: `docker exec tenmp-postgres psql -U tenmp_user -d tenmp_db -c '\l'`
- Check migrations: `docker exec tenmp-backend npm run db:migrate`
- Check logs: `docker-compose logs backend`

### MinIO connection errors

- Verify MinIO is running: `docker ps | grep minio`
- Check MinIO console: `http://localhost:9001`
- Verify credentials in `.env` match docker-compose
- Check bucket exists: Should see `game-saves` in console

### Frontend can't connect

- Check CORS_ORIGIN matches frontend URL
- Verify backend is running: `curl http://localhost:3001/health`
- Check browser console for errors
- Verify `.env` file exists in frontend

### Emulator not loading

- Verify ROM files are in `frontend/public/emulator/`
- Check ROM path in `frontend/.env`
- Check browser console for errors
- Try different ROM dump (some are incompatible)

### Save states not working

- Check MinIO is initialized: Backend logs should show "MinIO storage initialized"
- Verify bucket exists in MinIO console
- Check browser console for save errors
- Verify EmulatorJS loaded: Look for "Game started successfully" in console

## License

GPL-3.0

## Security Notes

- Default passwords are for development only
- Change all passwords before production deployment
- Admin panel has basic password auth (consider adding proper auth for production)
- MinIO credentials should be rotated regularly
- Save states may contain sensitive game data
- CORS should be restricted to your frontend domain only

## Credits

- EmulatorJS for GBA emulation
- Pokemon Fire Red by Game Freak/Nintendo
- Built with React, Express, PostgreSQL, and MinIO

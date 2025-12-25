# 10 Minute Pokemon (10MP)

A collaborative Pokemon Fire Red experience where players take turns playing for exactly 10 minutes before passing the adventure to the next trainer. Built for kiosk deployment with remote session management and cloud save states.

## Features

- **Kiosk-Based Architecture**: Raspberry Pi kiosks connect to remote backend via secure token-based registration
- **Turn-Based Gameplay**: Configurable turn duration (default 10 minutes)
- **Auto-Save System**: Automatic save states every 1 minute to MinIO blob storage
- **Session Management**: Token-based kiosk activation with manual admin approval
- **Admin Console**: Standalone web application for kiosk activation and save state management
- **Game State Tracking**: Scrapes Pokemon Fire Red memory for badges, location, party data
- **Save Point Restoration**: Admin can restore to any previous save state
- **Statistics Dashboard**: Track total turns, unique players, and game progress

## Architecture

```
[Raspberry Pi Kiosk]          [Remote Backend Server]      [Admin Console]
   - Browser (kiosk)    <-->    - Express API (Node.js) <--> - Admin web app
   - ROM files                  - PostgreSQL (metadata)      - Kiosk activation
   - EmulatorJS                 - MinIO (save files)         - Save management
```

## Documentation

This README provides a quick start guide and overview. For detailed technical documentation:

- **[Frontend Documentation](./frontend/README.md)** - EmulatorJS integration, component architecture, memory scraping, React hooks
- **[Backend Documentation](./backend/README.md)** - Database models, migrations, MinIO integration, Docker workflow, API implementation
- **[Admin Console Documentation](./admin/README.md)** - Admin console features, kiosk activation, deployment
- **[API Reference](./API.md)** - Complete REST API documentation with request/response examples

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
docker compose up -d

# Migrations run automatically on startup
# View logs
docker compose logs -f
```

Backend will be available at `http://localhost:3001`
MinIO Console at `http://localhost:9001` (minioadmin / minioadmin123)

### 4. Start Frontend (Kiosk)

```bash
cd frontend
npm run dev
```

Frontend will be available at `http://localhost:3000`

### 5. Start Admin Console

```bash
cd admin
npm run dev
```

Admin console will be available at `http://localhost:3002`

### 6. Activate Kiosk

1. Open kiosk frontend (`http://localhost:3000`)
2. Kiosk generates and displays a 16-character token
3. Open admin console (`http://localhost:3002`)
4. Login with password: `change-me-in-production`
5. Find the kiosk in "Pending Kiosks" section
6. Click "Activate" to approve the kiosk
7. Kiosk automatically connects and is ready for players!

## Development with VS Code Dev Container

For the easiest development setup, use VS Code's dev container feature. This provides a fully configured development environment with all dependencies, services, and tools pre-installed.

### Prerequisites

- [Visual Studio Code](https://code.visualstudio.com/)
- Docker ([Docker Desktop](https://www.docker.com/products/docker-desktop) for Windows/Mac, or Docker Engine for Linux)
- [Dev Containers Extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)

### Setup

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd 10mp
   ```

2. **Open in VS Code:**
   ```bash
   code .
   ```

3. **Open in Dev Container:**
   - Press `F1` or `Ctrl+Shift+P` (Windows/Linux) / `Cmd+Shift+P` (Mac)
   - Type "Dev Containers: Reopen in Container"
   - Select it and wait for the container to build

4. **What happens automatically:**
   - PostgreSQL database starts and initializes
   - MinIO object storage starts
   - All Node.js dependencies install (`npm run install:all`)
   - Ports forward automatically (3000, 3001, 3002, 5432, 9000, 9001)

5. **Place ROM files:**
   - Even in the dev container, you need to add ROM files to `frontend/public/emulator/`:
     - `pokemon-firered.gba`
     - `gba_bios.bin` (optional)

6. **Start development:**
   ```bash
   # In VS Code integrated terminal

   # Terminal 1: Start backend
   cd backend
   npm run dev

   # Terminal 2: Start frontend
   cd frontend
   npm start

   # Terminal 3: Start admin console
   cd admin
   npm start
   ```

### Accessing Services

When running in the dev container, services are available at:
- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:3001`
- Admin Console: `http://localhost:3002`
- PostgreSQL: `localhost:5432`
- MinIO Console: `http://localhost:9001`
- MinIO API: `http://localhost:9000`

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
CORS_ORIGIN_ADMIN=http://localhost:3002

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

### Admin Console Configuration

Edit `admin/.env`:

```env
REACT_APP_API_URL=http://localhost:3001
PORT=3002
```

## Admin Console

The admin console is a standalone web application (separate from the kiosk frontend) for managing the 10MP system.

### Access

Navigate to `http://localhost:3002` (or your configured admin URL), then login with admin password.

### Features

**Kiosk Management:**
- View pending kiosk registrations
- Activate kiosks manually for security
- Monitor active kiosks
- View kiosk tokens and identifiers

**Session Management:**
- Start/Stop game sessions
- View current session status
- Monitor last activity

**Save State Management:**
- List all save points with metadata
- Restore to any previous save (planned)
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
├── frontend/              # React kiosk frontend
│   ├── src/
│   │   ├── components/   # React components
│   │   │   ├── ErrorBoundary.js       # Error handling
│   │   │   ├── GameScreen.js          # Main game screen
│   │   │   ├── PlayerEntry.js         # Player name entry
│   │   │   ├── MessageInput.js        # Turn-end message
│   │   │   └── KioskConnect.js        # Token-based connection
│   │   ├── hooks/        # Custom hooks
│   │   │   └── useEmulator.js         # Emulator management
│   │   ├── services/     # API services
│   │   │   └── api.js                 # API client
│   │   └── utils/        # Utilities
│   │       └── emulator.js            # EmulatorManager class
│   └── public/
│       └── emulator/     # ROM files (not included)
├── admin/                 # Admin console (separate app)
│   ├── src/
│   │   ├── components/
│   │   │   └── AdminPanel.js          # Admin dashboard
│   │   └── services/
│   │       └── adminApi.js            # Admin API client
│   └── package.json
├── backend/               # Node.js/Express API
│   ├── models/           # Sequelize models
│   │   ├── GameTurn.js              # Turn records
│   │   ├── GameSession.js           # Session management
│   │   └── KioskRegistration.js     # Kiosk token registration
│   ├── migrations/       # Database migrations
│   ├── services/         # Business logic
│   │   └── saveStateStorage.js      # MinIO integration
│   ├── utils/            # Utilities
│   │   ├── kioskToken.js            # Token generation
│   │   └── dbCheck.js               # Smart initialization
│   └── docker compose.yml
└── package.json          # Root workspace
```

## Development Commands

**Full Stack:**
- `npm run dev` - Start both frontend and backend
- `npm run install:all` - Install dependencies for all projects

**Frontend (Kiosk):**
- `npm run frontend:dev` - Start React development server (port 3000)
- `npm run frontend:build` - Build for production

**Admin Console:**
- `npm run admin:dev` - Start admin console (port 3002)
- `npm run admin:build` - Build admin for production

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

**Kiosk Registration:**
- `POST /api/kiosk/register` - Register kiosk with token
- `GET /api/kiosk/status/:token` - Poll for activation status

**Admin - Kiosk Management:**
- `POST /api/admin/activate-kiosk` - Activate a kiosk
- `GET /api/admin/pending-kiosks` - List pending/active kiosks

**Sessions:**
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
| currentSaveStateUrl | STRING | Latest save reference |
| isActive | BOOLEAN | Session running status |
| lastActivityAt | DATE | Last activity timestamp |

### KioskRegistration Table

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| token | STRING | 16-char secure token |
| kioskId | STRING | Kiosk identifier |
| status | ENUM | pending, active, inactive |
| sessionId | STRING | Associated session |
| kioskName | STRING | Display name |
| registeredAt | DATE | Registration timestamp |
| activatedAt | DATE | Activation timestamp |
| lastHeartbeat | DATE | Last status check |

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
- Check logs: `docker compose logs backend`

### MinIO connection errors

- Verify MinIO is running: `docker ps | grep minio`
- Check MinIO console: `http://localhost:9001`
- Verify credentials in `.env` match docker compose
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
- Admin console has basic password auth (consider adding proper auth for production)
- Token-based kiosk registration prevents brute-force attacks (replaced vulnerable 6-digit codes)
- MinIO credentials should be rotated regularly
- Save states may contain sensitive game data
- CORS should be restricted to your frontend and admin domains only
- Admin console should be IP-restricted or VPN-protected in production

## Credits

- EmulatorJS for GBA emulation
- Pokemon Fire Red by Game Freak/Nintendo
- Built with React, Express, PostgreSQL, and MinIO

% TODOs
- Merge folders to single docker file
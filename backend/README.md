# 10MP Backend

Express API with PostgreSQL for game turn tracking, MinIO for save state storage, token-based kiosk registration, and admin controls for kiosk deployment.

## Overview

The backend is a Node.js/Express application that provides:
- **RESTful API**: Kiosk registration, session management, game turns, statistics
- **PostgreSQL Database**: Game turn history, kiosk registrations, and metadata
- **MinIO Object Storage**: Save state blob storage (S3-compatible)
- **Kiosk Registration**: Secure token-based registration with admin activation
- **Save State Storage**: Turn-end save state storage with metadata
- **Smart Initialization**: Automatic database and MinIO setup on first run

## Architecture

### Project Structure

```
backend/
├── models/                # Sequelize ORM models
│   ├── index.js              # Sequelize connection setup
│   ├── GameTurn.js           # Turn record model
│   ├── GameSession.js        # Session management model
│   └── KioskRegistration.js  # Kiosk token registration
├── migrations/            # Database migrations
│   ├── 20250901150000-create-game-turns.js
│   ├── 20250901160000-change-savestate-to-url.js
│   ├── 20250901170000-create-game-sessions.js
│   └── 20250901180000-create-kiosk-registrations.js
├── services/              # Business logic
│   └── saveStateStorage.js   # MinIO integration
├── utils/                 # Utilities
│   ├── kioskToken.js         # Secure token generation
│   └── dbCheck.js            # Smart database initialization
├── .env                   # Environment variables
├── .env.docker            # Docker environment
├── .sequelizerc           # Sequelize CLI config
├── docker compose.yml     # PostgreSQL + MinIO + Backend
├── Dockerfile             # Production image
├── Dockerfile.dev         # Development image
├── index.js               # Express server entry point
└── package.json           # Dependencies
```

### Tech Stack

- **Runtime:** Node.js 16+
- **Framework:** Express 4.18.2
- **ORM:** Sequelize 6.37.7
- **Database:** PostgreSQL 14+
- **Storage:** MinIO (S3-compatible)
- **Dev Tools:** Nodemon, Sequelize CLI

## Database

### Models

#### GameTurn Model

**File:** `models/GameTurn.js`

Stores individual player turn records.

**Schema:**
```javascript
{
  id: UUID (primary key),
  playerName: STRING (required),
  location: STRING,
  badgeCount: INTEGER (0-8),
  playtime: INTEGER (seconds),
  money: INTEGER,
  partyData: JSONB (Pokemon array),
  turnDuration: INTEGER (seconds),
  saveStateUrl: STRING (MinIO object key),
  turnEndedAt: DATE,
  createdAt: DATE,
  updatedAt: DATE
}
```

**Table Name:** `game_turns`

**Example:**
```javascript
const GameTurn = require('./models').GameTurn;

await GameTurn.create({
  playerName: 'Ash',
  location: 'Pallet Town',
  badgeCount: 0,
  playtime: 3600,
  money: 3000,
  partyData: [
    { species: 'Pikachu', level: 5, hp: 20, maxHp: 20 }
  ],
  turnDuration: 600,
  saveStateUrl: 'main-game/turn-abc123.sav'
});
```

#### GameSession Model

**File:** `models/GameSession.js`

Manages session state.

**Schema:**
```javascript
{
  sessionId: STRING (primary key),
  currentSaveStateUrl: STRING (MinIO key),
  isActive: BOOLEAN,
  lastActivityAt: DATE,
  createdAt: DATE,
  updatedAt: DATE
}
```

**Table Name:** `game_sessions`

**Example:**
```javascript
const GameSession = require('./models').GameSession;

const session = await GameSession.create({
  sessionId: 'main-game',
  isActive: false
});
```

#### KioskRegistration Model

**File:** `models/KioskRegistration.js`

Manages kiosk token-based registration and activation.

**Schema:**
```javascript
{
  id: UUID (primary key),
  token: STRING(32) (unique, required),
  kioskId: STRING(64) (required),
  status: ENUM('pending', 'active', 'inactive'),
  sessionId: STRING,
  kioskName: STRING,
  registeredAt: DATE,
  activatedAt: DATE,
  lastHeartbeat: DATE,
  createdAt: DATE,
  updatedAt: DATE
}
```

**Table Name:** `kiosk_registrations`

**Example:**
```javascript
const KioskRegistration = require('./models').KioskRegistration;

// Kiosk registers with token
const registration = await KioskRegistration.create({
  token: 'abc123xyz789def4',
  kioskId: 'kiosk-001',
  status: 'pending'
});

// Admin activates kiosk
registration.status = 'active';
registration.sessionId = 'main-game';
registration.activatedAt = new Date();
await registration.save();
```

### Migrations

**Location:** `migrations/`

**Run Migrations:**
```bash
# Using npm script
npm run db:migrate

# Using sequelize-cli directly
npx sequelize-cli db:migrate

# In Docker container
docker exec tenmp-backend npm run db:migrate
```

**Create New Migration:**
```bash
npx sequelize-cli migration:generate --name migration-name
```

**Migration Files:**

1. **20250901150000-create-game-turns.js**
   - Creates `game_turns` table
   - Initial schema with TEXT save states

2. **20250901160000-change-savestate-to-url.js**
   - Drops `save_state` TEXT column
   - Adds `save_state_url` STRING column
   - Migration to MinIO storage

3. **20250901170000-create-game-sessions.js**
   - Creates `game_sessions` table
   - Adds session management fields

4. **20250901180000-create-kiosk-registrations.js**
   - Creates `kiosk_registrations` table
   - Adds token-based kiosk registration system

**Rollback:**
```bash
npx sequelize-cli db:migrate:undo
```

### Database Configuration

**File:** `.sequelizerc`

```javascript
module.exports = {
  'config': path.resolve('models', 'index.js'),
  'models-path': path.resolve('models'),
  'migrations-path': path.resolve('migrations')
};
```

**Connection:** Configured in `models/index.js` via environment variables.

## MinIO Object Storage

### Service Integration

**File:** `services/saveStateStorage.js`

S3-compatible blob storage for game save states.

**Methods:**

**initialize()**
```javascript
const initialized = await saveStateStorage.initialize();
// Connects to MinIO, creates bucket if needed
```

**saveTurnSave(sessionId, turnId, saveData, metadata)**
```javascript
const saveUrl = await saveStateStorage.saveTurnSave(
  'main-game',
  'abc123-def456',
  base64SaveData,
  { playerName: 'Ash', location: 'Pallet Town', badgeCount: 0 }
);
// Returns: 'main-game/turn-abc123-def456.sav'
```

**loadLatestSave(sessionId)**
```javascript
const saveData = await saveStateStorage.loadLatestSave('main-game');
// Returns: Base64 save state string
```

**listSaveStates(sessionId)**
```javascript
const saves = await saveStateStorage.listSaveStates('main-game');
// Returns: Array of save objects with metadata
```

**loadSpecificSave(sessionId, objectKey)**
```javascript
const saveData = await saveStateStorage.loadSpecificSave(
  'main-game',
  'main-game/turn-abc123.sav'
);
```

### Object Naming Convention

**Turn-end saves:**
```
{sessionId}/turn-{turnId}.sav
```
Example: `main-game/turn-abc123-def456-ghi789.sav`

### Metadata

MinIO objects include custom metadata headers:

```javascript
{
  'x-amz-meta-playername': 'Ash',
  'x-amz-meta-location': 'Pallet Town',
  'x-amz-meta-badgecount': '0'
}
```

### MinIO Console

Access MinIO admin console at `http://localhost:9001`

**Credentials:**
- Username: `minioadmin`
- Password: `minioadmin123`

**Features:**
- Browse buckets and objects
- View object metadata
- Download save states
- Manage bucket policies

## API Endpoints

See [API.md](../API.md) for complete documentation.

### Quick Reference

**Health & Config:**
- `GET /health` - Health check
- `GET /api/config` - Server configuration

**Kiosk Registration:**
- `POST /api/kiosk/register` - Register kiosk with token
- `GET /api/kiosk/status/:token` - Poll for activation status (updates heartbeat)

**Admin - Kiosk Management:**
- `POST /api/admin/activate-kiosk` - Activate a kiosk by token
- `GET /api/admin/pending-kiosks` - List kiosks by status

**Session Management:**
- `GET /api/session/status` - Get session status
- `POST /api/session/start` - Start session (admin)
- `POST /api/session/stop` - Stop session (admin)
- `POST /api/session/save` - Upload save state
- `GET /api/session/saves` - List all saves

**Game Turns:**
- `POST /api/game-turns` - Create turn record
- `GET /api/game-turns` - List turns (paginated)
- `GET /api/game-turns/:id` - Get specific turn

**Statistics:**
- `GET /api/stats` - Game statistics and leaderboard

## Environment Variables

### Development (.env)

Create `backend/.env`:

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=tenmp_db
DB_USERNAME=tenmp_user
DB_PASSWORD=password123

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

### Docker (.env.docker)

Used by Docker Compose for container networking:

```env
DB_HOST=postgres
DB_PORT=5432
DB_NAME=tenmp_db
DB_USERNAME=tenmp_user
DB_PASSWORD=password123
MINIO_ENDPOINT=minio
MINIO_PORT=9000
```

**Note:** Hostnames use Docker service names (`postgres`, `minio`).

## Development

### Local Development (with Local PostgreSQL)

**Prerequisites:**
- PostgreSQL installed locally
- MinIO running (or use Docker just for MinIO)

**Setup:**

```bash
cd backend
npm install

# Create database
createdb tenmp_db

# Run migrations
npm run db:migrate

# Start server
npm run dev
```

Server runs on `http://localhost:3001` with hot reload via nodemon.

### Docker Development (Recommended)

**Prerequisites:**
- Docker
- Docker Compose

**Start Everything:**

```bash
cd backend
docker compose up --build
```

This starts:
- PostgreSQL on `localhost:5432`
- MinIO API on `localhost:9000`
- MinIO Console on `localhost:9001`
- Backend API on `localhost:3001`

**View Logs:**

```bash
docker compose logs -f
docker compose logs -f backend  # Just backend
docker compose logs -f postgres # Just database
```

**Stop Services:**

```bash
docker compose down
```

**Clean Restart (delete volumes):**

```bash
docker compose down -v
docker compose up --build
```

### Docker Services

**docker compose.yml** defines three services:

**1. postgres**
```yaml
image: postgres:14
ports: "5432:5432"
volumes: postgres_data:/var/lib/postgresql/data
```

**2. minio**
```yaml
image: minio/minio:latest
ports:
  - "9000:9000"  # API
  - "9001:9001"  # Console
volumes: minio_data:/data
command: server /data --console-address ":9001"
```

**3. backend**
```yaml
build:
  context: .
  dockerfile: Dockerfile.dev
ports: "3001:3001"
depends_on: postgres, minio
volumes: .:/app (for hot reload)
```

## Testing

### Manual API Testing

**Health Check:**
```bash
curl http://localhost:3001/health
```

**Get Config:**
```bash
curl http://localhost:3001/api/config
```

**Get Session Status:**
```bash
curl http://localhost:3001/api/session/status
```

**Create Game Turn:**
```bash
curl -X POST http://localhost:3001/api/game-turns \
  -H "Content-Type: application/json" \
  -d '{
    "playerName": "Ash",
    "location": "Pallet Town",
    "badgeCount": 0,
    "playtime": 600,
    "money": 3000,
    "partyData": [{"species": "Pikachu", "level": 5}],
    "turnDuration": 600
  }'
```

**Get Stats:**
```bash
curl http://localhost:3001/api/stats
```

### Database Testing

**Connect to PostgreSQL:**

```bash
# Local
psql -U tenmp_user -d tenmp_db

# Docker
docker exec -it tenmp-postgres psql -U tenmp_user -d tenmp_db
```

**Useful Queries:**

```sql
-- List all tables
\dt

-- View game turns
SELECT player_name, location, badge_count, turn_ended_at
FROM game_turns
ORDER BY turn_ended_at DESC
LIMIT 10;

-- View session
SELECT * FROM game_sessions;

-- Count turns per player
SELECT player_name, COUNT(*) as turns
FROM game_turns
GROUP BY player_name
ORDER BY turns DESC;
```

### MinIO Testing

**MinIO Client (mc):**

```bash
# Install mc
brew install minio/stable/mc

# Configure
mc alias set local http://localhost:9000 minioadmin minioadmin123

# List buckets
mc ls local

# List save states
mc ls local/game-saves/main-game/

# Download save state
mc cp local/game-saves/main-game/turn-abc123.sav ./
```

## Utilities

### Kiosk Token Generator

**File:** `utils/kioskToken.js`

Generates cryptographically secure tokens for kiosk registration.

**Functions:**

```javascript
const {
  generateKioskToken,
  generateKioskId,
  isValidKioskToken,
  formatTokenForDisplay,
  unformatToken
} = require('./utils/kioskToken');

// Generate secure token
const token = generateKioskToken(16);
// Returns: 'abc123xyz789def4' (16 chars, alphanumeric)

// Generate kiosk identifier
const kioskId = generateKioskId();
// Returns: 'kiosk-abc123' (prefixed with timestamp-based ID)

// Validate token format
const isValid = isValidKioskToken('abc123xyz789def4');
// Returns: true or false

// Format for display
const formatted = formatTokenForDisplay('abc123xyz789def4');
// Returns: 'abc1-23xy-z789-def4' (XXXX-XXXX-XXXX-XXXX)

// Remove formatting
const unformatted = unformatToken('abc1-23xy-z789-def4');
// Returns: 'abc123xyz789def4'
```

**Implementation:**
- Uses Node.js `crypto.randomBytes()` for security
- Base64 encoded, stripped to alphanumeric
- Default length: 16 characters (configurable 12-32)
- Significantly more secure than 6-digit codes

**Validation:**
- 12-32 characters
- Alphanumeric only (a-zA-Z0-9)
- Case-sensitive

### Database Initialization

**File:** `utils/dbCheck.js`

Smart database initialization that checks existing state before running migrations.

**Functions:**

```javascript
const {
  initializeDatabase,
  verifyConnection,
  checkRequiredTables,
  runMigrations
} = require('./utils/dbCheck');

// Initialize database (auto-runs migrations if needed)
const result = await initializeDatabase();
// Returns: { success: true, ranMigrations: false, message: 'Database already initialized' }

// Check if tables exist
const tableCheck = await checkRequiredTables();
// Returns: { allExist: true, missing: [], existing: ['game_turns', 'game_sessions', 'kiosk_registrations'] }

// Verify database connection
const connected = await verifyConnection();
// Returns: true or false

// Run migrations manually
const migrated = await runMigrations();
// Returns: true or false
```

**Features:**
- Idempotent initialization (safe to run multiple times)
- Checks if tables exist before migrating
- Automatically runs on backend startup
- Handles connection errors gracefully

## Deployment

### Production Setup

**Environment Variables:**

```env
NODE_ENV=production
PORT=3001
CORS_ORIGIN=https://your-kiosk-domain.com
ADMIN_PASSWORD=strong-random-password
MINIO_ROOT_PASSWORD=another-strong-password
DB_PASSWORD=secure-database-password
MINIO_USE_SSL=true
```

**Production Checklist:**

- [ ] Change all default passwords
- [ ] Set `NODE_ENV=production`
- [ ] Configure proper CORS origin
- [ ] Set up SSL/TLS for MinIO
- [ ] Use strong database credentials
- [ ] Set up PostgreSQL backups
- [ ] Set up MinIO replication/backup
- [ ] Configure firewall rules
- [ ] Set up monitoring and logging
- [ ] Use reverse proxy (nginx/caddy)
- [ ] Set up health check monitoring

### Docker Production

**Build Production Image:**

```bash
docker build -f Dockerfile -t 10mp-backend:latest .
```

**Run Production Container:**

```bash
docker run -d \
  --name 10mp-backend \
  -p 3001:3001 \
  --env-file .env.production \
  10mp-backend:latest
```

### Systemd Service

**File:** `/etc/systemd/system/10mp-backend.service`

```ini
[Unit]
Description=10MP Backend API
After=network.target postgresql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/10mp/backend
Environment=NODE_ENV=production
ExecStart=/usr/bin/node index.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**Commands:**

```bash
sudo systemctl enable 10mp-backend
sudo systemctl start 10mp-backend
sudo systemctl status 10mp-backend
```

## Debugging

### Common Issues

**Database Connection Failed:**
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```
Solution:
- Check PostgreSQL is running: `docker ps | grep postgres`
- Verify credentials in .env match docker compose.yml
- Check DB_HOST (use 'localhost' locally, 'postgres' in Docker)

**MinIO Connection Failed:**
```
Error: MinIO storage initialization failed
```
Solution:
- Check MinIO is running: `docker ps | grep minio`
- Verify MinIO credentials in .env
- Access console at http://localhost:9001
- Check bucket 'game-saves' exists

**Migrations Not Running:**
```
ERROR: relation "game_turns" does not exist
```
Solution:
```bash
# Local
npm run db:migrate

# Docker
docker exec tenmp-backend npm run db:migrate
```

**CORS Errors:**
```
Access to XMLHttpRequest blocked by CORS policy
```
Solution:
- Check CORS_ORIGIN in .env matches frontend URL
- Restart backend after changing .env
- Verify backend logs show correct CORS origin

### Logging

**Enable Debug Logs:**

```env
NODE_ENV=development
DEBUG=sequelize:*
```

**View Logs:**

```bash
# Docker
docker compose logs -f backend

# Systemd
journalctl -u 10mp-backend -f

# PM2
pm2 logs 10mp-backend
```

## Performance

### Database Optimization

**Add Indexes:**

```sql
CREATE INDEX idx_game_turns_player ON game_turns(player_name);
CREATE INDEX idx_game_turns_ended_at ON game_turns(turn_ended_at DESC);
CREATE INDEX idx_kiosk_token ON kiosk_registrations(token);
CREATE INDEX idx_kiosk_status ON kiosk_registrations(status);
```

**Connection Pooling:**

Sequelize uses connection pooling by default:
```javascript
pool: {
  max: 5,
  min: 0,
  acquire: 30000,
  idle: 10000
}
```

### MinIO Performance

**Concurrent Uploads:**
- Multiple turn-end saves can happen simultaneously
- MinIO handles concurrent writes efficiently

**Large Save States:**
- GBA save states are ~512KB typically
- Base64 encoding increases size by ~33%
- Consider compression for production

## Security

### Security Improvements

✅ **Token-Based Kiosk Registration**: Replaced vulnerable 6-digit codes with 16-character cryptographically secure tokens. Kiosks must be manually activated by admins, preventing unauthorized access.

### Current Limitations

- No authentication on most endpoints (except admin password)
- Admin password exposed in /api/config endpoint
- No rate limiting on API endpoints
- No input sanitization beyond basic validation
- Basic password authentication (no JWT/OAuth)

### Recommended Improvements

1. **Add Authentication:**
   - JWT tokens for session management
   - API keys for admin endpoints
   - Remove admin password from config endpoint

2. **Rate Limiting:**
   ```javascript
   const rateLimit = require('express-rate-limit');

   app.use('/api/kiosk/register', rateLimit({
     windowMs: 15 * 60 * 1000,
     max: 10
   }));

   app.use('/api/kiosk/status', rateLimit({
     windowMs: 1 * 60 * 1000,
     max: 60 // Allow frequent polling
   }));
   ```

3. **Input Validation:**
   - Use express-validator
   - Sanitize all user input
   - Validate save state size

4. **HTTPS Only:**
   - Force SSL/TLS in production
   - Set secure cookie flags
   - Use HSTS headers

## Contributing

When modifying the backend:

1. **Database Changes:** Always create migrations, never modify models directly
2. **API Changes:** Update API.md documentation
3. **New Endpoints:** Add validation middleware
4. **Environment Variables:** Document in both READMEs
5. **MinIO Changes:** Test with actual blob storage, not mocks

## License

GPL-3.0

## See Also

- [Frontend Documentation](../frontend/README.md)
- [API Documentation](../API.md)
- [Main README](../README.md)

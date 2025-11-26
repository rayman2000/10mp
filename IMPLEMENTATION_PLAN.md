# 10 Minute Pokemon - Kiosk Architecture Implementation Plan

## Overview

Convert the 10MP application into a kiosk-based system where a Raspberry Pi runs the game in browser kiosk mode, connecting to a remote backend for save state management and game session coordination.

## Key Changes Summary

1. **Save States → MinIO**: Move from PostgreSQL TEXT storage to MinIO blob storage for save files
2. **Auto-Save → 1 Minute**: Change from 10-second to 1-minute intervals (configurable via .env)
3. **Session System**: Add simple session model with 6-digit codes for kiosk connection
4. **Admin Panel**: New UI for session management, save point restoration, basic auth
5. **EmulatorJS Integration**: Implement actual save/load methods (currently stubs)
6. **Turn Duration**: Configurable in .env (default 10 minutes)
7. **GameTurn Records**: Only created at turn end, not on auto-saves

## Architecture

```
[Raspberry Pi Kiosk]          [Remote Backend Server]
   - Browser (kiosk)    <-->    - Express API
   - ROM files                  - PostgreSQL (metadata)
   - EmulatorJS                 - MinIO (save files)
                                - Admin UI
```

**Key Simplifications:**
- Single game session at a time
- Single active kiosk client
- Simple session identifier (no complex auth)

## Phase 1: Configuration System

### Create Shared Config File
**File:** `backend/.env` (add to existing)

```
# Gameplay Configuration
TURN_DURATION_MINUTES=10
AUTO_SAVE_INTERVAL_MINUTES=1

# Session Configuration
DEFAULT_SESSION_ID=main-game

# Admin Configuration
ADMIN_PASSWORD=change-me-in-production
```

**Alternative:** Could use `shared-config.json` in root, but .env is simpler for single-instance demo

**Changes:**
- Backend exposes config via `GET /api/config` endpoint
- Frontend fetches config on app load
- Both frontend timer and auto-save use these values

## Phase 2: MinIO Blob Storage Integration

### Add MinIO Container
**File:** `backend/docker-compose.yml`

Add MinIO service:
- Port: 9000 (API), 9001 (Console)
- Bucket: `game-saves`
- Environment variables in `.env.docker`

### MinIO Client Integration
**File:** `backend/services/saveStateStorage.js` (new)

**MinIO Object Structure:**
- Bucket: `game-saves`
- Object naming: `{sessionId}/autosave-{timestamp}.sav` for auto-saves
- Object naming: `{sessionId}/turn-{turnId}.sav` for turn-end saves
- Metadata: Store playerName, location, badges in object metadata for easy listing

Functions:
- `saveAutoSave(sessionId, saveData, metadata)` - Upload auto-save blob to MinIO
- `saveTurnSave(sessionId, turnId, saveData, metadata)` - Upload turn-end save
- `loadLatestSave(sessionId)` - Download most recent save blob
- `listSaveStates(sessionId)` - List all saves with metadata (timestamp + playerName)
- `loadSpecificSave(sessionId, saveKey)` - Get specific save by key

### Update GameTurn Model
**File:** `backend/models/GameTurn.js`

**Current fields (keep these):**
- `id` (UUID) - Primary key
- `playerName` (String) - Player's name
- `location` (String) - Current location in game
- `badgeCount` (Integer) - Number of badges
- `playtime` (Integer) - Total playtime in seconds
- `money` (Integer) - Player's money
- `partyData` (JSONB) - Pokemon party information
- `turnDuration` (Integer) - Turn duration in seconds
- `turnEndedAt` (Date) - When turn ended
- `createdAt`, `updatedAt` (Timestamps)

**Change:**
- Replace `saveState` (TEXT) with `saveStateUrl` (String) - Reference to MinIO object key
- This is created ONLY at turn end, not during auto-saves

## Phase 3: Session Management

### Simple Session Model
**File:** `backend/models/GameSession.js` (new)

Fields:
- `sessionId` (String, primary key) - Simple identifier (e.g., "main-game")
- `sessionCode` (String) - 6-digit code for kiosk connection
- `currentSaveStateUrl` (String) - Latest save state location
- `isActive` (Boolean) - Whether session is running
- `lastActivityAt` (Timestamp)

**Single Instance Approach:**
- Only one session exists: `sessionId = "main-game"`
- Admin can regenerate sessionCode for reconnection
- No user authentication needed

### Session API Endpoints
**File:** `backend/index.js`

New endpoints:
- `POST /api/session/init` - Initialize/reset session, generate new code
- `GET /api/session/connect/:code` - Kiosk connects with code, returns session info
- `GET /api/session/status` - Get current session state
- `POST /api/session/start` - Admin starts game session
- `POST /api/session/stop` - Admin stops game session
- `GET /api/session/saves` - List all save points for restore

## Phase 4: EmulatorJS Save State Implementation

### Implement Actual Save/Load
**File:** `frontend/src/utils/emulator.js`

Replace stub methods:

**`saveState()`:**
```javascript
saveState() {
  if (!this.emulator) return null;

  // Use EmulatorJS API to get save state
  const state = window.EJS_emulator.gameManager.saveState();
  return state; // Returns Uint8Array or blob
}
```

**`loadState(stateData)`:**
```javascript
loadState(stateData) {
  if (!this.emulator || !stateData) return false;

  // Use EmulatorJS API to load save state
  window.EJS_emulator.gameManager.loadState(stateData);
  return true;
}
```

**Note:** Need to research actual EmulatorJS API for save state methods.

### Auto-Save to Backend
**File:** `frontend/src/components/GameScreen.js`

Modify auto-save to:
1. Call `emulatorManager.saveState()` every 1 minute (from config)
2. Send save blob to backend: `POST /api/session/save`
3. Backend uploads to MinIO

## Phase 5: Kiosk Connection Flow

### New Connection Screen
**File:** `frontend/src/components/SessionConnect.js` (new)

UI for admin to:
- Enter 6-digit session code
- Click "Connect to Game"
- Show connection status
- Display QR code (generated from code) for easy mobile entry

### Update App Flow
**File:** `frontend/src/App.js`

New screen state: `'connect'`

Flow:
1. App starts → Show SessionConnect screen
2. Admin enters code → Fetch session from backend
3. Load latest save state from session
4. Initialize emulator with loaded save
5. Transition to PlayerEntry screen

## Phase 6: Admin Interface

### Admin Page Routes
**File:** `frontend/src/components/AdminPanel.js` (new)

**Authentication:**
- Password prompt on entry
- Password from config: `GET /api/config` → adminPassword
- Store auth state in React state (simple, no session)

Features:
- **Session Management:**
  - Display current session code
  - "Generate New Code" button
  - Start/Stop session toggle

- **Save State Management:**
  - List recent save points: "2024-01-15 14:23:45 - PlayerMike"
  - "Restore to this point" button for each
  - Confirmation dialog before restore

- **Quick Stats:**
  - Total turns played
  - Current location/badges
  - Last player name

### Admin API Integration
**File:** `frontend/src/services/api.js`

New methods:
- `verifyAdminPassword(password)` - Check admin password
- `initSession()` - Create new session code
- `connectToSession(code)` - Connect kiosk
- `startSession()` - Start game
- `stopSession()` - Stop game
- `listSavePoints()` - Get save history (timestamp + playerName)
- `restoreSavePoint(saveId)` - Restore specific save

## Phase 7: Backend Save Endpoint

### Continuous Save Endpoint
**File:** `backend/index.js`

`POST /api/session/save`
- Accepts: sessionId, saveData (blob), gameData (location, badges, etc.)
- Uploads blob to MinIO
- Updates GameSession.currentSaveStateUrl
- Creates GameTurn record for history (optional, only on turn end?)

### Load Endpoint
**File:** `backend/index.js`

`GET /api/session/load/:sessionId`
- Returns: Latest save state blob from MinIO
- Used when kiosk connects or admin restores

## Phase 8: Docker Configuration

### Update docker-compose.yml
**File:** `backend/docker-compose.yml`

Add MinIO service:
```yaml
services:
  minio:
    image: minio/minio
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data
```

### Environment Variables
**File:** `backend/.env.docker`

Add:
```
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin
MINIO_ENDPOINT=minio:9000
MINIO_BUCKET=game-saves
```

## Implementation Order

### Phase 0: Technical Debt Cleanup (Do First!)
1. **Dependency Cleanup**
   - Remove socket.io-client from frontend/package.json
   - Remove TypeScript dependencies (@types/react, @types/react-dom, typescript)
   - Downgrade express to ^4.18.2 in backend/package.json
   - Run `npm install` in both directories

2. **Backend Security & Stability**
   - Add CORS_ORIGIN to backend/.env
   - Update CORS config to use environment variable
   - Remove `sequelize.sync()` from backend/index.js
   - Add graceful shutdown handler (SIGTERM/SIGINT)
   - Add basic request validation middleware

3. **Frontend Error Handling**
   - Create ErrorBoundary component
   - Wrap GameScreen with ErrorBoundary in App.js
   - Add health check polling to detect backend issues

4. **Configuration Externalization**
   - Add ROM_PATH to frontend/.env
   - Update emulator.js to use env variable for ROM path

### Phase 1: Configuration System
- Add config values to backend/.env
- Create GET /api/config endpoint
- Frontend fetches config on app load
- Update timers to use config values

### Phase 2: MinIO Blob Storage Integration
- Add MinIO to docker-compose.yml
- Create saveStateStorage.js service
- Update GameTurn model (saveState → saveStateUrl)
- Create database migration for schema change

### Phase 3: Session Management
- Create GameSession model and migration
- Add session API endpoints
- Implement session code generation

### Phase 4: EmulatorJS Integration
- Research actual EmulatorJS save/load API
- Implement real saveState() method
- Implement real loadState() method
- Test save/load cycle

### Phase 5: Backend Save Flow
- Create POST /api/session/save endpoint
- Integrate MinIO upload in save endpoint
- Update auto-save to use new endpoint

### Phase 6: Frontend Connection Flow
- Create SessionConnect component
- Update App.js with connect screen
- Implement save state loading on connect

### Phase 7: Admin Panel
- Create AdminPanel component with password auth
- Add admin API methods to api.js
- Implement session management UI
- Implement save point restore UI

### Phase 8: Testing & Polish
- Test full kiosk connection flow
- Test save state backup/restore
- Test admin panel functionality
- Verify memory scraping works correctly

## Critical Files to Modify

### Backend
- `backend/docker-compose.yml` - Add MinIO
- `backend/.env.docker` - MinIO credentials
- `backend/models/GameSession.js` - NEW
- `backend/services/saveStateStorage.js` - NEW
- `backend/models/GameTurn.js` - Modify saveState field
- `backend/index.js` - Add session endpoints

### Frontend
- `shared-config.json` - NEW (root)
- `frontend/src/utils/emulator.js` - Implement save/load
- `frontend/src/components/SessionConnect.js` - NEW
- `frontend/src/components/AdminPanel.js` - NEW
- `frontend/src/components/GameScreen.js` - Update auto-save timing
- `frontend/src/services/api.js` - Add session methods
- `frontend/src/App.js` - Add connect screen state

## Technical Debt & Code Review Findings

### Critical Issues

#### 1. **Socket.io Dependency - UNUSED** 🔴
**Location:** `frontend/package.json:19`
- `socket.io-client` is installed but never imported or used anywhere
- Adds ~150KB to bundle size for no benefit
- **Fix:** Remove from package.json

#### 2. **TypeScript Types Without TypeScript** 🟡
**Location:** `frontend/package.json:22-24`
- TypeScript types for React installed but project is pure JavaScript
- No tsconfig.json, no .ts/.tsx files
- **Options:**
  - Remove TypeScript dependencies (simpler for demo)
  - Actually migrate to TypeScript (better long-term)
- **Recommendation:** Remove for demo simplicity

#### 3. **Express v5 (Unstable)** 🟡
**Location:** `backend/package.json:16`
- Using `express: ^5.1.0` which is still in beta
- Express v4 is stable and production-ready
- **Fix:** Downgrade to `express: ^4.18.2`

#### 4. **Missing Error Boundaries** 🔴
**Location:** `frontend/src/App.js`
- No React error boundaries to catch component crashes
- EmulatorJS errors could crash entire app
- **Fix:** Add ErrorBoundary component wrapping GameScreen

#### 5. **Dangerous sequelize.sync()** 🔴
**Location:** `backend/index.js:140`
- `sequelize.sync()` runs on every server start
- Can cause data loss or schema drift in production
- Should use migrations only
- **Fix:** Remove sync(), rely on migrations

#### 6. **CORS Wide Open** 🔴
**Location:** `backend/index.js:10`
- `app.use(cors())` allows ALL origins
- Security risk for production deployment
- **Fix:** Configure allowed origins from environment variable

#### 7. **No Request Validation** 🟡
**Location:** `backend/index.js:17-51`
- API accepts any data without validation
- No schema validation (e.g., Joi, Zod, express-validator)
- Could lead to database errors or security issues
- **Fix:** Add basic validation middleware

#### 8. **Raw SQL in Stats Endpoint** 🟡
**Location:** `backend/index.js:113-121`
- Manual SQL string instead of Sequelize methods
- Works but inconsistent with rest of codebase
- **Fix:** Use Sequelize aggregation methods

### Design Issues

#### 9. **Memory Scraping May Be Incorrect** 🟠
**Location:** `frontend/src/utils/emulator.js:290-425`
- Pokemon Fire Red memory addresses hardcoded
- No verification these work with EmulatorJS's memory layout
- Different emulator cores may have different memory maps
- **Status:** Needs testing to verify addresses are correct

#### 10. **Global Window Pollution** 🟡
**Location:** `frontend/src/utils/emulator.js:55-65`
- EmulatorJS config stored as window globals
- Not cleaned up properly between instances
- Could cause issues with React strict mode or remounting
- **Current fix:** `clearPreviousInstance()` helps but is fragile

#### 11. **useEffect Missing Dependencies** 🟡
**Location:** `frontend/src/components/GameScreen.js:57, 148`
- `startGame` not in deps array (line 57)
- `scrapeData` in deps but stable ref not guaranteed
- Could cause stale closures or missing updates
- **Fix:** Add missing deps or use useCallback properly

#### 12. **No Cleanup on Turn End** 🟠
**Location:** `frontend/src/components/GameScreen.js`
- When turn ends, emulator keeps running in background
- Wastes CPU/battery on kiosk
- **Fix:** Pause/stop emulator when not in active turn

#### 13. **File Path Assumptions** 🟡
**Location:** `frontend/src/utils/emulator.js:57`
- Hardcoded `/emulator/pokemon-firered.gba`
- Should be environment variable
- **Fix:** Use `process.env.REACT_APP_ROM_PATH`

### Architecture Issues

#### 14. **Mixed Data Scraping Responsibility** 🟠
**Location:** `frontend/src/components/GameScreen.js:100-148`
- GameScreen handles both UI and data scraping logic
- 50+ lines of scraping logic in component
- **Fix:** Move to custom hook `useGameDataScraper()`

#### 15. **No Loading States for API Calls** 🟡
**Location:** `frontend/src/services/api.js`
- API calls don't expose loading/error states
- Components handle errors inconsistently
- **Fix:** Use React Query or add loading state handling

#### 16. **Hardcoded Timeouts** 🟠
**Location:** Multiple files
- 10-minute timer hardcoded in GameScreen.js:80
- 60-second scrape interval hardcoded in GameScreen.js:123
- 10-second auto-save hardcoded in emulator.js:236
- **Fix:** Will be addressed by config system in plan

### Missing Features

#### 17. **No Logging/Monitoring** 🟡
- Only console.log statements, no structured logging
- Production debugging will be difficult
- **Fix:** Add proper logger (winston for backend, console wrapper for frontend)

#### 18. **No Health Check in Frontend** 🟡
- Backend has `/health` endpoint but frontend never uses it
- Kiosk can't detect backend connectivity issues
- **Fix:** Add periodic health checks with user notification

#### 19. **No Graceful Shutdown** 🟡
**Location:** `backend/index.js`
- No SIGTERM/SIGINT handlers
- Docker stops may corrupt database connections
- **Fix:** Add graceful shutdown handler

#### 20. **No Database Connection Pooling Config** 🟡
**Location:** `backend/database.js` (inferred from models)
- Using defaults for connection pool
- May not be optimal for single-instance demo
- **Fix:** Reduce pool size for demo (max: 2, min: 1)

## Recommended Fixes for This Implementation

### Must Fix (Blockers)
1. ✅ Remove socket.io-client dependency
2. ✅ Remove TypeScript dependencies OR migrate fully
3. ✅ Fix CORS to use environment variable
4. ✅ Remove sequelize.sync(), use migrations only
5. ✅ Add React ErrorBoundary
6. ✅ Move hardcoded config to .env (already in plan)

### Should Fix (Quality)
7. ✅ Add basic request validation
8. ✅ Downgrade Express to v4
9. ⚠️ Test memory scraping addresses (may need adjustment)
10. ✅ Add frontend health check polling
11. ✅ Add graceful shutdown handler

### Nice to Have (Polish)
12. Move scraping logic to custom hook
13. Add structured logging
14. Fix useEffect dependencies
15. Optimize connection pool settings

## Design Decisions

### Turn History Strategy
**Decision:** Create GameTurn records ONLY when a 10-minute turn ends (not on auto-saves)
- MinIO handles frequent auto-saves (every 1 minute)
- GameTurn table remains clean, focused on completed player turns
- GameTurn contents: playerName, location, badgeCount, playtime, money, partyData, turnDuration, turnEndedAt, saveStateUrl (reference to MinIO)

### Session Code Authentication
**Decision:** Skip QR code, use simple 6-digit code entry
- Simpler for demo purposes
- Admin types code directly into kiosk browser
- Can add QR generation later if needed

### Admin Panel Security
**Decision:** Simple password authentication from config file
- Password stored in shared-config.json or backend .env
- Basic protection without full session system
- Can upgrade to proper auth later if needed

### Save Point Labeling
**Decision:** Display timestamp + player name in admin restore UI
- Example: "2024-01-15 14:23:45 - PlayerMike"
- Provides clear context for which save to restore
- Simple and informative

### EmulatorJS Save State API
**Status:** Needs research during implementation
- Current code has stub methods (return null/false)
- Expected pattern: `window.EJS_emulator.gameManager.saveState()`
- Format likely: Uint8Array or blob → convert to Base64 for storage
- Must verify actual EmulatorJS API from official documentation
- Access pattern established: `window.EJS_emulator.Module` confirmed working

## Summary & Quick Reference

### What We're Building
Transform 10MP from a local-only app into a kiosk-based system where:
- A Raspberry Pi kiosk connects to a remote backend via session code
- Save states stored in MinIO (blob storage) with 1-minute auto-backup
- Admin panel for session management and save point restoration
- Configurable turn duration and backup intervals

### Key Technologies
- **Frontend:** React 18, EmulatorJS (CDN), Axios
- **Backend:** Node.js, Express 4, Sequelize ORM
- **Database:** PostgreSQL 15 (metadata)
- **Blob Storage:** MinIO (save files)
- **Deployment:** Docker Compose

### Critical Dependencies to Add
- `minio` - MinIO SDK for Node.js (backend)

### Critical Dependencies to Remove
- `socket.io-client` - Unused
- `@types/react`, `@types/react-dom`, `typescript` - Unused

### Estimated Complexity
- **Phase 0 (Cleanup):** ~2-3 hours
- **Phases 1-3 (Config, MinIO, Sessions):** ~4-6 hours
- **Phase 4 (EmulatorJS):** ~2-4 hours (depends on API research)
- **Phases 5-7 (Save Flow, Connect, Admin):** ~6-8 hours
- **Phase 8 (Testing):** ~2-3 hours
- **Total:** ~16-24 hours of focused development

### Risk Areas
1. **EmulatorJS Save API:** Unknown - may need experimentation
2. **Memory Addresses:** May not work correctly - need verification
3. **MinIO Integration:** New dependency - needs testing
4. **Kiosk Browser:** May have compatibility issues with EmulatorJS

### Success Criteria
- [ ] Kiosk can connect to backend with 6-digit code
- [ ] Save states automatically backup every 1 minute to MinIO
- [ ] Admin can restore to any save point
- [ ] Turn duration and intervals configurable via .env
- [ ] All technical debt from Phase 0 resolved
- [ ] Memory scraping works correctly (or gracefully fails)

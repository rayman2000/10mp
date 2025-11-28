# Session Removal Refactoring Plan

## Overview

Remove the GameSession concept entirely while maintaining kiosk admin approval workflow, creating a simpler architecture with flat save state storage and auto-load functionality.

## User Requirements (Confirmed)

1. **Keep admin approval** - Kiosks register and wait for admin activation
2. **Flat save structure** - No sessionId prefixes, use `autosave-{timestamp}.sav` and `turn-{turnId}.sav`
3. **Auto-load latest save** - Frontend automatically loads most recent save on startup
4. **Single-kiosk mode** - Only one active kiosk at a time (current behavior)

## Architecture Changes

### What Gets Removed
- **GameSession model** - Delete entire file and database table
- **Session endpoints** - All 6 `/api/session/*` endpoints
- **Session UI** - "Session Management" card in admin panel
- **Session state** - No more sessionId tracking

### What Gets Modified
- **SaveStateStorage** - Remove sessionId parameters, add `getLatestSave()` method
- **KioskRegistration** - Remove `sessionId` field
- **API endpoints** - Remove sessionId from activation, status, and config
- **Frontend** - Remove session connection flow, auto-load latest save
- **Admin Panel** - Remove session management, simplify kiosk activation

### What Stays the Same
- **Kiosk registration** - Admin approval workflow unchanged
- **Single-kiosk enforcement** - Already implemented in activation endpoint
- **GameTurn tracking** - Turn history and metadata
- **MinIO storage** - Just reorganized to flat structure

## Implementation Stages

### Stage 1: Backend Database
1. Create migration to drop `game_sessions` table
2. Create migration to remove `session_id` from `kiosk_registrations`
3. Run migrations

### Stage 2: Backend Save Storage
Update `/home/nick/privat/zhbase/10mp/backend/services/saveStateStorage.js`:
- Change `saveAutoSave(sessionId, ...)` → `saveAutoSave(...)`
- Change `saveTurnSave(sessionId, turnId, ...)` → `saveTurnSave(turnId, ...)`
- Change object names from `{sessionId}/autosave-...` → `autosave-...`
- Add `getLatestSave()` method
- Update `listSaveStates()` to not filter by sessionId

### Stage 3: Backend API Endpoints

**Remove these endpoints** from `/home/nick/privat/zhbase/10mp/backend/index.js`:
- POST `/api/session/init`
- GET `/api/session/status`
- POST `/api/session/start`
- POST `/api/session/stop`
- POST `/api/session/save`
- GET `/api/session/saves`

**Add these new endpoints**:
- GET `/api/saves` - List all saves
- GET `/api/saves/latest` - Get latest save metadata
- GET `/api/saves/:objectKey/download` - Download specific save
- POST `/api/saves/upload` - Upload save state (replaces `/api/session/save`)

**Modify these endpoints**:
- POST `/api/admin/activate-kiosk` - Remove sessionId parameter
- GET `/api/kiosk/status/:token` - Remove sessionId from response
- POST `/api/game-turns` - Remove sessionId usage
- GET `/api/config` - Remove defaultSessionId field

### Stage 4: Backend Model Cleanup
- Delete `/home/nick/privat/zhbase/10mp/backend/models/GameSession.js`
- Remove `sessionId` field from `/home/nick/privat/zhbase/10mp/backend/models/KioskRegistration.js`
- Remove GameSession import from `index.js`

### Stage 5: Frontend Updates

**Update `/home/nick/privat/zhbase/10mp/frontend/src/services/api.js`**:
- Remove `sessionApi` export
- Add new `saveApi` with: `listSaves()`, `getLatestSave()`, `downloadSave()`, `uploadSave()`

**Update `/home/nick/privat/zhbase/10mp/frontend/src/App.js`**:
- Remove `sessionData` state
- Remove `handleSessionConnect` function
- Change `onConnect` to `onActivated` (no sessionId parameter)
- Remove session-related config

**Update `/home/nick/privat/zhbase/10mp/frontend/src/components/KioskConnect.js`**:
- Change prop from `onConnect` to `onActivated`
- Remove sessionId from callback
- Simplify activation flow

**Update `/home/nick/privat/zhbase/10mp/frontend/src/components/GameScreen.js`**:
- Replace `sessionApi` with `saveApi`
- Remove sessionId from auto-save calls
- Call `saveApi.uploadSave(saveData, latestGameData)`

### Stage 6: Admin Panel Updates

**Update `/home/nick/privat/zhbase/10mp/admin/src/services/adminApi.js`**:
- Remove `sessionApi` export
- Add new `saveApi` with: `listSaves()`, `getLatestSave()`
- Update `kioskApi.activateKiosk(token)` - remove sessionId parameter

**Update `/home/nick/privat/zhbase/10mp/admin/src/components/AdminPanel.js`**:
- Remove session imports and state
- Delete `handleStartSession` and `handleStopSession` functions
- Update `handleActivateKiosk` to not use sessionId
- Delete entire "Session Management" card from UI
- Update `fetchData()` to use `saveApi.listSaves()`

### Stage 7: Environment Cleanup
- Remove `DEFAULT_SESSION_ID` from `backend/.env`
- Remove `DEFAULT_SESSION_ID` from `backend/.env.docker`

### Stage 8: Optional MinIO Migration
If you have existing saves with sessionId prefixes, run migration script to rename:
- `{sessionId}/autosave-{timestamp}.sav` → `autosave-{timestamp}.sav`
- `{sessionId}/turn-{turnId}.sav` → `turn-{turnId}.sav`

## New API Contract

### New Endpoints
```
GET  /api/saves                     # List all saves
GET  /api/saves/latest              # Get latest save metadata
GET  /api/saves/:objectKey/download # Download save file
POST /api/saves/upload              # Upload save (body: {saveData, gameData})
```

### Modified Endpoints
```
POST /api/admin/activate-kiosk
  OLD: { token, sessionId }
  NEW: { token }

GET /api/kiosk/status/:token
  OLD Response: { status, sessionId, activatedAt, isActive }
  NEW Response: { status, activatedAt, isActive }

GET /api/config
  OLD: { turnDurationMinutes, autoSaveIntervalMinutes, defaultSessionId, adminPassword }
  NEW: { turnDurationMinutes, autoSaveIntervalMinutes, adminPassword }
```

## Files to Modify

### Backend (9 files)
1. `/home/nick/privat/zhbase/10mp/backend/index.js` - Remove session endpoints, add save endpoints
2. `/home/nick/privat/zhbase/10mp/backend/services/saveStateStorage.js` - Remove sessionId params
3. `/home/nick/privat/zhbase/10mp/backend/models/KioskRegistration.js` - Remove sessionId field
4. `/home/nick/privat/zhbase/10mp/backend/models/GameSession.js` - **DELETE FILE**
5. `/home/nick/privat/zhbase/10mp/backend/.env` - Remove DEFAULT_SESSION_ID
6. `/home/nick/privat/zhbase/10mp/backend/.env.docker` - Remove DEFAULT_SESSION_ID
7. Create: `backend/migrations/YYYYMMDDHHMMSS-remove-game-sessions.js`
8. Create: `backend/migrations/YYYYMMDDHHMMSS-remove-session-id-from-kiosks.js`
9. Create (optional): `backend/scripts/migrate-saves.js`

### Frontend (4 files)
1. `/home/nick/privat/zhbase/10mp/frontend/src/App.js` - Remove session connection
2. `/home/nick/privat/zhbase/10mp/frontend/src/components/KioskConnect.js` - Simplify activation
3. `/home/nick/privat/zhbase/10mp/frontend/src/components/GameScreen.js` - Use saveApi
4. `/home/nick/privat/zhbase/10mp/frontend/src/services/api.js` - Replace sessionApi with saveApi

### Admin Panel (2 files)
1. `/home/nick/privat/zhbase/10mp/admin/src/components/AdminPanel.js` - Remove session UI
2. `/home/nick/privat/zhbase/10mp/admin/src/services/adminApi.js` - Replace sessionApi with saveApi

## Testing Checklist

### Critical Paths to Test
- [ ] Kiosk registration with existing active kiosk (should reject with 403)
- [ ] Kiosk registration with no active kiosk (should succeed)
- [ ] Admin activates kiosk from pending list
- [ ] Kiosk receives activation and moves to player entry
- [ ] Game auto-saves upload to MinIO with flat structure
- [ ] Turn end saves state with correct naming
- [ ] Latest save API returns most recent file
- [ ] Admin panel loads and displays saves correctly
- [ ] No session-related errors in browser console

### Edge Cases
- [ ] First-time startup with no saves (should start fresh game)
- [ ] Disconnecting active kiosk removes it from database
- [ ] Multiple pending kiosks can register (but only one can be active)

## Rollback Plan

**Before starting**:
```bash
# Backup database
pg_dump pokemon_game > backup_before_session_removal.sql

# Tag Git commit
git tag pre-session-removal
```

**To rollback**:
1. Run migration down scripts in reverse order
2. Revert Git commits to `pre-session-removal` tag
3. Restore database from backup if needed

## Benefits After Completion

1. **Simpler architecture** - No session abstraction layer
2. **Easier debugging** - Flat save structure, clear naming
3. **Reduced complexity** - 6 fewer endpoints, 1 fewer model
4. **Better UX** - Auto-loads latest save automatically
5. **Cleaner admin panel** - Focused on kiosk management only
6. **Easier scaling** - No session state to manage

# 10MP API Documentation

Complete REST API reference for the 10 Minute Pokemon backend server.

**Base URL:** `http://localhost:3001` (development)

**Content-Type:** `application/json`

**Version:** 1.0.0

## Table of Contents

- [Health & Config](#health--config)
- [Session Management](#session-management)
- [Game Turns](#game-turns)
- [Statistics](#statistics)
- [Error Responses](#error-responses)

---

## Health & Config

### GET /health

Health check endpoint for monitoring server status.

**Request:**
```bash
curl http://localhost:3001/health
```

**Response:** `200 OK`
```json
{
  "status": "ok",
  "timestamp": "2025-01-26T12:34:56.789Z"
}
```

---

### GET /api/config

Get server configuration values (turn duration, auto-save interval, session ID, admin password).

**Request:**
```bash
curl http://localhost:3001/api/config
```

**Response:** `200 OK`
```json
{
  "turnDurationMinutes": 10,
  "autoSaveIntervalMinutes": 1,
  "defaultSessionId": "main-game",
  "adminPassword": "change-me-in-production"
}
```

**Notes:**
- `turnDurationMinutes`: How long each player's turn lasts
- `autoSaveIntervalMinutes`: How often the game auto-saves
- `defaultSessionId`: The session ID used for this instance
- `adminPassword`: Password for admin panel access

---

## Session Management

### POST /api/session/init

Initialize a new session or regenerate a session code for the default session.

**Request:**
```bash
curl -X POST http://localhost:3001/api/session/init
```

**Response:** `200 OK`
```json
{
  "sessionId": "main-game",
  "sessionCode": "123456",
  "isActive": false
}
```

**Notes:**
- Generates a new random 6-digit session code
- If session already exists, updates the code
- Sets `isActive: false` by default (admin must start it)

---

### GET /api/session/connect/:code

Connect a kiosk to a session using a 6-digit code.

**URL Parameters:**
- `code` (string, required): 6-digit session code

**Request:**
```bash
curl http://localhost:3001/api/session/connect/123456
```

**Response:** `200 OK`
```json
{
  "sessionId": "main-game",
  "sessionCode": "123456",
  "isActive": true,
  "currentSaveStateUrl": "main-game/autosave-1706274896789.sav"
}
```

**Error Responses:**

`400 Bad Request` - Invalid code format
```json
{
  "error": "Invalid session code format"
}
```

`404 Not Found` - Code not found
```json
{
  "error": "Session not found. Check your code."
}
```

---

### GET /api/session/status

Get the current session status.

**Request:**
```bash
curl http://localhost:3001/api/session/status
```

**Response:** `200 OK`
```json
{
  "sessionId": "main-game",
  "sessionCode": "123456",
  "isActive": true,
  "currentSaveStateUrl": "main-game/autosave-1706274896789.sav",
  "lastActivityAt": "2025-01-26T12:34:56.789Z"
}
```

**Error Response:**

`404 Not Found` - No session exists
```json
{
  "error": "No active session"
}
```

---

### POST /api/session/start

Start the game session (admin only).

**Request:**
```bash
curl -X POST http://localhost:3001/api/session/start
```

**Response:** `200 OK`
```json
{
  "sessionId": "main-game",
  "isActive": true,
  "message": "Session started successfully"
}
```

**Error Response:**

`404 Not Found` - Session not initialized
```json
{
  "error": "Session not found. Initialize first."
}
```

---

### POST /api/session/stop

Stop the game session (admin only).

**Request:**
```bash
curl -X POST http://localhost:3001/api/session/stop
```

**Response:** `200 OK`
```json
{
  "sessionId": "main-game",
  "isActive": false,
  "message": "Session stopped successfully"
}
```

**Error Response:**

`404 Not Found`
```json
{
  "error": "Session not found"
}
```

---

### POST /api/session/save

Upload a save state to MinIO blob storage (auto-save).

**Request Body:**
```json
{
  "sessionId": "main-game",
  "saveData": "base64EncodedSaveStateData...",
  "gameData": {
    "playerName": "Ash",
    "location": "Pallet Town",
    "badgeCount": 0
  }
}
```

**Request:**
```bash
curl -X POST http://localhost:3001/api/session/save \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "main-game",
    "saveData": "AAABBBCCCDDD...",
    "gameData": {
      "playerName": "Ash",
      "location": "Pallet Town",
      "badgeCount": 0
    }
  }'
```

**Response:** `200 OK`
```json
{
  "success": true,
  "saveUrl": "main-game/autosave-1706274896789.sav",
  "message": "Save state uploaded successfully"
}
```

**Error Responses:**

`400 Bad Request` - Missing required fields
```json
{
  "error": "sessionId and saveData are required"
}
```

`500 Internal Server Error` - Storage failure
```json
{
  "error": "Failed to initialize storage"
}
```

**Notes:**
- `saveData`: Base64-encoded emulator save state
- `gameData`: Optional metadata for the save
- Save is stored as `{sessionId}/autosave-{timestamp}.sav` in MinIO
- Updates the session's `currentSaveStateUrl`

---

### GET /api/session/saves

List all save states for the current session.

**Request:**
```bash
curl http://localhost:3001/api/session/saves
```

**Response:** `200 OK`
```json
{
  "sessionId": "main-game",
  "saves": [
    {
      "objectKey": "main-game/turn-abc123.sav",
      "size": 524288,
      "lastModified": "2025-01-26T12:34:56.789Z",
      "playerName": "Ash",
      "location": "Pallet Town",
      "badgeCount": 0,
      "turnId": "abc123-def456-ghi789"
    },
    {
      "objectKey": "main-game/autosave-1706274896789.sav",
      "size": 524288,
      "lastModified": "2025-01-26T12:30:00.000Z",
      "playerName": "Unknown",
      "location": "Unknown",
      "badgeCount": 0,
      "turnId": null
    }
  ]
}
```

**Notes:**
- Returns saves from MinIO with metadata from GameTurn records
- Auto-saves have `turnId: null`
- Turn-end saves include full metadata
- Sorted by `lastModified` (newest first)
- Limited to 50 most recent saves

---

## Game Turns

### POST /api/game-turns

Create a new game turn record when a player finishes their turn.

**Request Body:**
```json
{
  "playerName": "Ash",
  "location": "Pallet Town",
  "badgeCount": 0,
  "playtime": 3600,
  "money": 3000,
  "partyData": [
    {
      "species": "Pikachu",
      "level": 5,
      "hp": 20,
      "maxHp": 20
    }
  ],
  "turnDuration": 600,
  "saveState": "base64EncodedSaveStateData..."
}
```

**Request:**
```bash
curl -X POST http://localhost:3001/api/game-turns \
  -H "Content-Type: application/json" \
  -d '{
    "playerName": "Ash",
    "location": "Pallet Town",
    "badgeCount": 0,
    "playtime": 3600,
    "money": 3000,
    "partyData": [{"species": "Pikachu", "level": 5}],
    "turnDuration": 600,
    "saveState": "AAABBBCCCDDD..."
  }'
```

**Response:** `201 Created`
```json
{
  "id": "abc123-def456-ghi789",
  "playerName": "Ash",
  "location": "Pallet Town",
  "badgeCount": 0,
  "playtime": 3600,
  "money": 3000,
  "partyData": [
    {
      "species": "Pikachu",
      "level": 5,
      "hp": 20,
      "maxHp": 20
    }
  ],
  "turnDuration": 600,
  "saveStateUrl": "main-game/turn-abc123.sav",
  "turnEndedAt": "2025-01-26T12:34:56.789Z",
  "createdAt": "2025-01-26T12:34:56.789Z",
  "updatedAt": "2025-01-26T12:34:56.789Z"
}
```

**Validation Errors:** `400 Bad Request`

Missing player name:
```json
{
  "error": "Valid playerName is required"
}
```

Invalid badge count:
```json
{
  "error": "badgeCount must be a number between 0 and 8"
}
```

Invalid playtime:
```json
{
  "error": "playtime must be a non-negative number"
}
```

Invalid money:
```json
{
  "error": "money must be a non-negative number"
}
```

Invalid turn duration:
```json
{
  "error": "turnDuration must be a non-negative number"
}
```

**Notes:**
- `playerName` (required): Player's name (non-empty string)
- `location` (optional): Current game location
- `badgeCount` (optional): Number of badges (0-8)
- `playtime` (optional): Total playtime in seconds
- `money` (optional): Player's money (non-negative)
- `partyData` (optional): Array of Pokemon party info
- `turnDuration` (optional): Turn length in seconds
- `saveState` (optional): Base64-encoded save state
- If `saveState` provided, uploads to MinIO as `{sessionId}/turn-{turnId}.sav`
- Returns warning if MinIO upload fails but turn still created

---

### GET /api/game-turns

List game turns with pagination and optional filtering.

**Query Parameters:**
- `limit` (number, optional): Results per page (default: 50)
- `offset` (number, optional): Skip N results (default: 0)
- `playerName` (string, optional): Filter by player name

**Request:**
```bash
# Get first 50 turns
curl http://localhost:3001/api/game-turns

# Get turns 50-100
curl http://localhost:3001/api/game-turns?limit=50&offset=50

# Get all turns by "Ash"
curl http://localhost:3001/api/game-turns?playerName=Ash
```

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": "abc123-def456-ghi789",
      "playerName": "Ash",
      "location": "Pallet Town",
      "badgeCount": 0,
      "playtime": 3600,
      "money": 3000,
      "partyData": [{"species": "Pikachu", "level": 5}],
      "turnDuration": 600,
      "saveStateUrl": "main-game/turn-abc123.sav",
      "turnEndedAt": "2025-01-26T12:34:56.789Z",
      "createdAt": "2025-01-26T12:34:56.789Z",
      "updatedAt": "2025-01-26T12:34:56.789Z"
    }
  ],
  "pagination": {
    "total": 123,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

**Notes:**
- Returns turns sorted by `turnEndedAt` (newest first)
- Use `offset` and `limit` for pagination
- Use `playerName` to filter turns by specific player

---

### GET /api/game-turns/:id

Get a specific game turn by ID.

**URL Parameters:**
- `id` (UUID, required): Turn ID

**Request:**
```bash
curl http://localhost:3001/api/game-turns/abc123-def456-ghi789
```

**Response:** `200 OK`
```json
{
  "id": "abc123-def456-ghi789",
  "playerName": "Ash",
  "location": "Pallet Town",
  "badgeCount": 0,
  "playtime": 3600,
  "money": 3000,
  "partyData": [
    {
      "species": "Pikachu",
      "level": 5,
      "hp": 20,
      "maxHp": 20
    }
  ],
  "turnDuration": 600,
  "saveStateUrl": "main-game/turn-abc123.sav",
  "turnEndedAt": "2025-01-26T12:34:56.789Z",
  "createdAt": "2025-01-26T12:34:56.789Z",
  "updatedAt": "2025-01-26T12:34:56.789Z"
}
```

**Error Response:** `404 Not Found`
```json
{
  "error": "Game turn not found"
}
```

---

## Statistics

### GET /api/stats

Get game statistics and leaderboard.

**Request:**
```bash
curl http://localhost:3001/api/stats
```

**Response:** `200 OK`
```json
{
  "totalTurns": 123,
  "uniquePlayers": 45,
  "latestTurn": {
    "id": "abc123-def456-ghi789",
    "playerName": "Ash",
    "location": "Pallet Town",
    "badgeCount": 0,
    "playtime": 3600,
    "money": 3000,
    "partyData": [{"species": "Pikachu", "level": 5}],
    "turnDuration": 600,
    "saveStateUrl": "main-game/turn-abc123.sav",
    "turnEndedAt": "2025-01-26T12:34:56.789Z"
  },
  "topPlayers": [
    {
      "player_name": "Ash",
      "turn_count": "15",
      "max_badges": "3"
    },
    {
      "player_name": "Gary",
      "turn_count": "12",
      "max_badges": "4"
    }
  ]
}
```

**Notes:**
- `totalTurns`: Total number of turns played
- `uniquePlayers`: Number of unique player names
- `latestTurn`: Most recent turn data
- `topPlayers`: Top 10 players by turn count, then by max badges

---

## Error Responses

All error responses follow this format:

```json
{
  "error": "Description of what went wrong"
}
```

### Common HTTP Status Codes

| Code | Meaning | Usage |
|------|---------|-------|
| 200 | OK | Successful GET/POST request |
| 201 | Created | Successful resource creation |
| 400 | Bad Request | Invalid request data or parameters |
| 404 | Not Found | Resource not found |
| 500 | Internal Server Error | Server-side error |

### Example Error Scenarios

**Invalid JSON:**
```bash
curl -X POST http://localhost:3001/api/game-turns \
  -H "Content-Type: application/json" \
  -d 'invalid json'
```
Response: `400 Bad Request` (Express returns SyntaxError)

**Database Connection Failure:**
Response: `500 Internal Server Error`
```json
{
  "error": "Failed to fetch game turns"
}
```

**MinIO Storage Failure:**
Response: `500 Internal Server Error`
```json
{
  "error": "Failed to save game state"
}
```

---

## Request Limits

- **Max JSON Body Size:** 10MB
- **CORS:** Configured via `CORS_ORIGIN` environment variable
- **Credentials:** CORS credentials enabled

---

## Authentication

Currently, the API has no authentication for most endpoints. The admin password is exposed via `/api/config` for frontend use.

**Production Recommendations:**
- Add proper authentication middleware
- Remove admin password from `/api/config`
- Implement API keys or JWT tokens
- Add rate limiting
- Use HTTPS only

---

## MinIO Object Storage

Save states are stored in MinIO with the following naming conventions:

**Auto-saves:**
```
{sessionId}/autosave-{timestamp}.sav
```
Example: `main-game/autosave-1706274896789.sav`

**Turn-end saves:**
```
{sessionId}/turn-{turnId}.sav
```
Example: `main-game/turn-abc123-def456-ghi789.sav`

**Metadata:**
MinIO objects include metadata:
- `x-amz-meta-playername`: Player name
- `x-amz-meta-location`: Game location
- `x-amz-meta-badgecount`: Badge count

**Access:**
- MinIO API: `http://localhost:9000`
- MinIO Console: `http://localhost:9001`
- Credentials: `minioadmin` / `minioadmin123`

---

## Development

### Testing Endpoints

**Quick test script:**
```bash
#!/bin/bash

# Health check
curl http://localhost:3001/health

# Get config
curl http://localhost:3001/api/config

# Initialize session
curl -X POST http://localhost:3001/api/session/init

# Get stats
curl http://localhost:3001/api/stats

# List turns
curl http://localhost:3001/api/game-turns?limit=10
```

### Environment Variables

See `backend/.env` for configuration:

```env
PORT=3001
DB_HOST=localhost
DB_PORT=5432
CORS_ORIGIN=http://localhost:3000
TURN_DURATION_MINUTES=10
AUTO_SAVE_INTERVAL_MINUTES=1
DEFAULT_SESSION_ID=main-game
ADMIN_PASSWORD=change-me-in-production
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
```

---

## Support

For issues or questions:
- Check the main [README.md](./README.md)
- Review [Troubleshooting Guide](./README.md#troubleshooting)
- Ensure PostgreSQL and MinIO are running
- Check Docker logs: `docker-compose logs -f`

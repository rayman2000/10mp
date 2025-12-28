# 10MP API Documentation

Complete REST API reference for the 10 Minute Pokemon backend server.

**Base URL:** `http://localhost:3001` (development) or `http://localhost/api` (Docker)

**Content-Type:** `application/json`

---

## Table of Contents

- [Health Check](#health-check)
- [Admin Authentication](#admin-authentication)
- [Kiosk Registration](#kiosk-registration)
- [Admin - Kiosk Management](#admin---kiosk-management)
- [Save States](#save-states)
- [Game Turns](#game-turns)
- [Statistics](#statistics)
- [Error Responses](#error-responses)

---

## Health Check

### GET /health

Health check endpoint (served by nginx in Docker).

**Request:**
```bash
curl http://localhost/health
```

**Response:** `200 OK`
```
OK
```

---

## Admin Authentication

### POST /api/admin/login

Authenticate as admin to access protected endpoints.

**Request Body:**
```json
{
  "password": "your-admin-password"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "token": "ABCdef123xyz..."
}
```

**Error Response:** `401 Unauthorized`
```json
{
  "success": false,
  "error": "Invalid password"
}
```

**Notes:**
- Returns a session token for use in Authorization header
- Token format: `Bearer <token>`

---

### POST /api/admin/logout

End admin session.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "success": true
}
```

---

## Kiosk Registration

### POST /api/kiosk/register

Register a new kiosk with a unique token. Called by kiosk frontend on startup.

**Request Body:**
```json
{
  "token": "abc123xyz789def4",
  "kioskId": "kiosk-001",
  "kioskName": "Main Lobby Kiosk"
}
```

**Response:** `201 Created`
```json
{
  "token": "abc123xyz789def4",
  "status": "pending",
  "message": "Kiosk registered. Waiting for admin activation."
}
```

**Error Responses:**

`400 Bad Request` - Missing required fields
```json
{
  "error": "token and kioskId are required"
}
```

`400 Bad Request` - Invalid token format
```json
{
  "error": "Invalid token format. Must be 12-32 alphanumeric characters."
}
```

`403 Forbidden` - Another kiosk is already active
```json
{
  "error": "Another kiosk is already active",
  "message": "Only one kiosk can be active at a time. Please contact an organizer."
}
```

---

### GET /api/kiosk/status/:token

Poll for kiosk activation status.

**URL Parameters:**
- `token` (string, required): Kiosk registration token

**Response (Pending):** `200 OK`
```json
{
  "status": "pending",
  "isActive": false
}
```

**Response (Active):** `200 OK`
```json
{
  "status": "active",
  "activatedAt": "2025-01-26T12:05:00.000Z",
  "isActive": true
}
```

**Error Response:** `404 Not Found`
```json
{
  "error": "Kiosk not registered"
}
```

---

## Admin - Kiosk Management

All admin endpoints require authentication via `Authorization: Bearer <token>` header.

### POST /api/admin/activate-kiosk

Activate a pending kiosk.

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "token": "abc123xyz789def4"
}
```

**Response:** `200 OK`
```json
{
  "token": "abc123xyz789def4",
  "kioskId": "kiosk-001",
  "kioskName": "Main Lobby Kiosk",
  "status": "active",
  "activatedAt": "2025-01-26T12:05:00.000Z",
  "message": "Kiosk activated successfully"
}
```

**Error Responses:**

`401 Unauthorized` - Missing or invalid auth
```json
{
  "error": "Admin authentication required"
}
```

`404 Not Found` - Kiosk not found
```json
{
  "error": "Kiosk not found"
}
```

`409 Conflict` - Another kiosk already active
```json
{
  "error": "Another kiosk is already active",
  "message": "Only one kiosk can be active at a time. Please disconnect the current kiosk first.",
  "activeKiosk": {
    "kioskId": "kiosk-002",
    "kioskName": "Other Kiosk"
  }
}
```

---

### POST /api/admin/disconnect-kiosk

Disconnect and remove a kiosk (active or pending).

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "token": "abc123xyz789def4"
}
```

**Response:** `200 OK`
```json
{
  "message": "Kiosk disconnected successfully",
  "kioskId": "kiosk-001",
  "kioskName": "Main Lobby Kiosk"
}
```

**Error Response:** `404 Not Found`
```json
{
  "error": "Kiosk not found"
}
```

---

### GET /api/admin/pending-kiosks

List all registered kiosks (pending and active).

**Headers:**
```
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "kiosks": [
    {
      "token": "abc123xyz789def4",
      "status": "pending",
      "kioskId": "kiosk-001",
      "kioskName": "Main Lobby Kiosk",
      "registeredAt": "2025-01-26T12:00:00.000Z"
    },
    {
      "token": "xyz789abc123ghi4",
      "status": "active",
      "kioskId": "kiosk-002",
      "kioskName": "Side Room Kiosk",
      "registeredAt": "2025-01-26T11:00:00.000Z",
      "activatedAt": "2025-01-26T11:05:00.000Z"
    }
  ]
}
```

---

### POST /api/admin/restore-turn

Restore game to a previous turn, invalidating all newer turns.

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "turnId": 123
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "restoredTurn": {
    "id": 123,
    "playerName": "Ash",
    "location": "Pallet Town",
    "badgeCount": 2,
    "turnEndedAt": "2025-01-26T12:00:00.000Z",
    "saveStateUrl": "main-game/turn-123.sav"
  },
  "invalidatedCount": 5
}
```

**Error Responses:**

`400 Bad Request` - Turn has no save state
```json
{
  "error": "Turn has no save state to restore"
}
```

`404 Not Found` - Turn not found
```json
{
  "error": "Turn not found"
}
```

---

## Save States

### GET /api/saves

List all save states from MinIO storage.

**Response:** `200 OK`
```json
{
  "saves": [
    {
      "objectKey": "main-game/turn-123.sav",
      "size": 524288,
      "lastModified": "2025-01-26T12:34:56.789Z",
      "playerName": "Ash",
      "location": "Pallet Town",
      "badgeCount": 2,
      "turnId": 123
    }
  ]
}
```

---

### GET /api/saves/latest

Get the latest valid (non-invalidated) save state.

**Response:** `200 OK`
```json
{
  "turnId": 123,
  "saveStateUrl": "main-game/turn-123.sav",
  "playerName": "Ash",
  "location": "Pallet Town",
  "badgeCount": 2,
  "turnEndedAt": "2025-01-26T12:34:56.789Z"
}
```

**Error Response:** `404 Not Found`
```json
{
  "error": "No saves found"
}
```

---

### GET /api/saves/:objectKey/download

Download a specific save state file.

**URL Parameters:**
- `objectKey` (string, required): The MinIO object key (e.g., `main-game/turn-123.sav`)

**Response:** `200 OK`
- Content-Type: `application/octet-stream`
- Body: Binary save state data

**Error Response:** `404 Not Found`
```json
{
  "error": "Save not found"
}
```

---

### POST /api/saves/upload

Upload a save state.

**Request Body:**
```json
{
  "saveData": "base64EncodedSaveStateData...",
  "gameData": {
    "playerName": "Ash",
    "location": "Pallet Town",
    "badgeCount": 0
  }
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "saveUrl": "main-game/save-1706274896789.sav",
  "message": "Save state uploaded successfully"
}
```

**Error Response:** `400 Bad Request`
```json
{
  "error": "saveData is required"
}
```

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

**Response:** `201 Created`
```json
{
  "id": 123,
  "playerName": "Ash",
  "location": "Pallet Town",
  "badgeCount": 0,
  "playtime": 3600,
  "money": 3000,
  "partyData": [...],
  "turnDuration": 600,
  "saveStateUrl": "main-game/turn-123.sav",
  "turnEndedAt": "2025-01-26T12:34:56.789Z",
  "createdAt": "2025-01-26T12:34:56.789Z",
  "updatedAt": "2025-01-26T12:34:56.789Z"
}
```

**Validation Errors:** `400 Bad Request`
```json
{"error": "Valid playerName is required"}
{"error": "badgeCount must be a number between 0 and 8"}
{"error": "playtime must be a non-negative number"}
{"error": "money must be a non-negative number"}
{"error": "turnDuration must be a non-negative number"}
```

**Notes:**
- `playerName` (required): Player's name
- `saveState` (optional): If provided, uploads to MinIO as turn save
- If MinIO upload fails, turn is still created with `warning` field

---

### GET /api/game-turns

List game turns with pagination and optional filtering.

**Query Parameters:**
- `limit` (number, optional): Results per page (default: 50)
- `offset` (number, optional): Skip N results (default: 0)
- `playerName` (string, optional): Filter by player name
- `includeInvalidated` (string, optional): Include invalidated turns (default: `true`)

**Request:**
```bash
# Get first 50 turns
curl http://localhost:3001/api/game-turns

# Exclude invalidated turns
curl http://localhost:3001/api/game-turns?includeInvalidated=false

# Filter by player
curl http://localhost:3001/api/game-turns?playerName=Ash
```

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": 123,
      "playerName": "Ash",
      "location": "Pallet Town",
      "badgeCount": 0,
      "playtime": 3600,
      "money": 3000,
      "partyData": [...],
      "turnDuration": 600,
      "saveStateUrl": "main-game/turn-123.sav",
      "turnEndedAt": "2025-01-26T12:34:56.789Z",
      "invalidatedAt": null,
      "invalidatedByRestoreToTurnId": null
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

---

### GET /api/game-turns/:id

Get a specific game turn by ID.

**Response:** `200 OK`
```json
{
  "id": 123,
  "playerName": "Ash",
  "location": "Pallet Town",
  "badgeCount": 0,
  "playtime": 3600,
  "money": 3000,
  "partyData": [...],
  "turnDuration": 600,
  "saveStateUrl": "main-game/turn-123.sav",
  "turnEndedAt": "2025-01-26T12:34:56.789Z"
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

**Response:** `200 OK`
```json
{
  "totalTurns": 123,
  "uniquePlayers": 45,
  "latestTurn": {
    "id": 123,
    "playerName": "Ash",
    "location": "Pallet Town",
    "badgeCount": 2,
    "playtime": 3600,
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
| 200 | OK | Successful request |
| 201 | Created | Resource created |
| 400 | Bad Request | Invalid data |
| 401 | Unauthorized | Missing/invalid auth |
| 403 | Forbidden | Action not allowed |
| 404 | Not Found | Resource not found |
| 409 | Conflict | Resource conflict |
| 500 | Internal Server Error | Server error |

---

## Request Limits

- **Max JSON Body Size:** 10MB
- **CORS:** Configured via `CORS_ORIGIN` and `CORS_ORIGIN_ADMIN` env vars

---

## MinIO Object Storage

Save states are stored in MinIO with the following naming conventions:

**Turn-end saves:**
```
{sessionId}/turn-{turnId}.sav
```

**Access:**
- MinIO Console: `http://localhost:9001` (exposed in docker-compose)

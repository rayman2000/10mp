# 10MP Frontend

React-based kiosk interface with GBA emulation, token-based secure connection, turn-based gameplay timer, and game state tracking.

## Overview

The frontend is a React 18 application that provides:
- **EmulatorJS Integration**: Game Boy Advance emulator running Pokemon Fire Red
- **Turn-Based Gameplay**: 10-minute turns with automatic timer and save states
- **Kiosk Registration**: Secure token-based connection to backend with admin approval
- **Memory Scraping**: Real-time extraction of game data (location, badges, party, etc.)
- **Save States**: Save state capture at turn end and restore on turn start

## Architecture

### Component Structure

```
frontend/src/
├── components/         # React components
│   ├── ErrorBoundary.js       # Error handling wrapper
│   ├── GameScreen.js          # Main gameplay screen
│   ├── PlayerEntry.js         # Player name input
│   ├── MessageInput.js        # Turn-end message
│   └── KioskConnect.js        # Token-based kiosk connection
├── hooks/             # Custom React hooks
│   └── useEmulator.js         # Emulator lifecycle management
├── services/          # API communication
│   └── api.js                 # Backend API client
├── utils/             # Utilities
│   └── emulator.js            # EmulatorManager class
└── App.js             # Main app with screen routing
```

### Application Flow

1. **Kiosk Connect** → Kiosk generates token, waits for admin activation
2. **Player Entry** → User enters their name
3. **Game Screen** → 10-minute gameplay session
4. **Message Input** → Player leaves message for next player
5. **Loop back** → Next player enters name

## EmulatorJS Integration

### EmulatorManager Class

**Location:** `src/utils/emulator.js`

The `EmulatorManager` class wraps EmulatorJS and provides:

**Initialization:**
```javascript
const emulator = new EmulatorManager(config);
await emulator.initialize();
```

**Key Methods:**
- `initialize()` - Loads EmulatorJS library and ROM
- `startGame()` - Starts emulator playback
- `pauseGame()` - Pauses emulator
- `saveState()` - Creates save state (Base64 encoded)
- `loadState(saveData)` - Restores save state
- `scrapeGameData()` - Extracts Pokemon Fire Red memory data
- `simulateKeyPress(button)` - Simulate button press (for attract mode)
- `destroy()` - Cleanup emulator instance

### Save State Implementation

EmulatorJS save states use three fallback methods:

**Method 1: Direct API**
```javascript
window.EJS_emulator.saveState()
```

**Method 2: GameManager**
```javascript
window.EJS_emulator.gameManager.saveState()
```

**Method 3: File System**
```javascript
window.EJS_emulator.Module.FS.readFile('/home/web_user/retroarch/userdata/states/game.state')
```

All save states are Base64-encoded for JSON transport.

### ROM Configuration

**ROM Location:** `frontend/public/emulator/`

Required files:
- `pokemon-firered.gba` - Pokemon Fire Red ROM (must provide legally)
- `gba_bios.bin` - GBA BIOS (optional but recommended)

**Environment Variable:**
```env
REACT_APP_ROM_PATH=/emulator/pokemon-firered.gba
```

## Pokemon Fire Red Memory Scraping

The emulator can extract live game data from Pokemon Fire Red's memory.

### Memory Addresses

**Player Information:**
- Player name: `0x02025734` (7 bytes, text encoding)
- Money: `0x0202452C` (4 bytes, little-endian integer)
- Playtime: `0x02024E60` to `0x02024E64` (hours, minutes, seconds, frames)

**Game Progress:**
- Current location: `0x02036E38` (map bank + map number)
- Badge count: `0x02024E80` (bitfield, count set bits)

**Pokemon Party:**
- Party count: `0x02024284` (1-6 Pokemon)
- Party data: `0x02024284` onwards (100 bytes per Pokemon)
  - Species: Offset +0 (2 bytes)
  - Level: Offset +84 (1 byte)
  - HP: Offset +86 (2 bytes)
  - Max HP: Offset +88 (2 bytes)
  - Attack/Defense/Speed/etc: Offsets 90-96

### Scraping Implementation

**Location:** `src/utils/emulator.js` - `scrapeGameData()` method

**Example:**
```javascript
const gameData = await emulator.scrapeGameData();
// Returns:
{
  playerName: "Ash",
  location: "Pallet Town",
  badgeCount: 0,
  playtime: 3600,
  money: 3000,
  partyData: [
    {
      species: "Pikachu",
      level: 5,
      hp: 20,
      maxHp: 20
    }
  ]
}
```

Data is scraped:
- Every 60 seconds during gameplay (logged to console)
- At turn end (saved to backend)

## Custom Hooks

### useEmulator Hook

**Location:** `src/hooks/useEmulator.js`

React hook for emulator lifecycle management.

**Usage:**
```javascript
const {
  isLoaded,      // Emulator initialized
  isRunning,     // Game is playing
  gameData,      // Latest scraped data
  error,         // Error message
  startGame,     // Start playback
  pauseGame,     // Pause playback
  saveGame,      // Create save state
  loadGame,      // Load save state
  scrapeData,    // Extract game data
  simulateKeyPress,    // Simulate button press
  getRandomAttractButton  // Get random button for attract mode
} = useEmulator(config);
```

**Lifecycle:**
1. On mount: Initialize emulator
2. On unmount: Destroy emulator, cleanup
3. Automatically manages loading/error states

## Components

### GameScreen

**Location:** `src/components/GameScreen.js`

Main gameplay component that:
- Renders emulator in full-screen
- Implements 10-minute countdown timer
- Runs attract mode (random inputs) when not active
- Handles turn end (timeout)
- Saves turn data to backend at turn end

**Props:**
- `player` - Current player name
- `isActive` - Whether this player's turn is active
- `onGameEnd` - Callback when turn ends
- `config` - Backend configuration

**Key Features:**
- Auto-focus emulator canvas for immediate input
- Disable input when inactive
- Loading overlay during initialization
- Error boundary for crash recovery

### KioskConnect

**Location:** `src/components/KioskConnect.js`

Token-based kiosk registration screen with admin approval workflow.

**Features:**
- Generates cryptographically secure 16-character token
- Displays formatted token (XXXX-XXXX-XXXX-XXXX)
- Polls backend every 2 seconds for activation
- Shows waiting animation until admin activates
- Automatically proceeds to game when activated
- Glassmorphic purple gradient design

**Flow:**
1. Component generates token on mount
2. Registers kiosk with backend via POST /api/kiosk/register
3. Displays token prominently for admin to enter
4. Polls GET /api/kiosk/status/:token every 2 seconds
5. When admin activates, proceeds to player entry

**API Integration:**
```javascript
// Register kiosk
await fetch(`${API_BASE_URL}/api/kiosk/register`, {
  method: 'POST',
  body: JSON.stringify({ token, kioskId, kioskName })
});

// Poll for activation
const response = await fetch(`${API_BASE_URL}/api/kiosk/status/${token}`);
const data = await response.json();
if (data.status === 'active') {
  onConnect({ sessionId: data.sessionId });
}
```

### PlayerEntry

**Location:** `src/components/PlayerEntry.js`

Player name input before turn starts.

**Features:**
- Name validation (non-empty, max length)
- "Start Playing" button
- Displays current game status
- Shows time remaining if session active

### Admin Panel

The admin panel has been moved to a separate project in `admin/` directory. See [Admin Console Documentation](../admin/README.md) for details.

The kiosk frontend no longer includes admin functionality - all management is done through the standalone admin console.

## API Integration

### API Client

**Location:** `src/services/api.js`

Axios-based client for backend communication.

**Configuration:**
```javascript
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';
```

**Available APIs:**

**Config API:**
```javascript
await configApi.getConfig();
// Returns turn duration, session ID, admin password
```

**Session API:**
```javascript
await sessionApi.getSessionStatus();
await sessionApi.saveGameState(sessionId, saveData, gameData);
await sessionApi.listSaveStates();
```

**Game API:**
```javascript
await gameApi.saveGameTurn(turnData);
await gameApi.getGameTurns(limit, offset);
await gameApi.getStats();
```

## Environment Variables

Create `frontend/.env`:

```env
# Backend API URL
REACT_APP_API_URL=http://localhost:3001

# ROM file path (relative to public/)
REACT_APP_ROM_PATH=/emulator/pokemon-firered.gba
```

## Development

### Prerequisites

- Node.js 16+
- Pokemon Fire Red ROM file
- Backend running on port 3001

### Setup

```bash
cd frontend
npm install
```

### Run Development Server

```bash
npm start
# or from root: npm run frontend:dev
```

Runs on `http://localhost:3000`

### Build for Production

```bash
npm run build
```

Output in `build/` directory.

### Debugging

**Emulator Debug:**
- Check browser console for EmulatorJS logs
- Look for "Game started successfully" message
- Verify ROM files exist in `public/emulator/`

**Save State Debug:**
```javascript
// In browser console
window.EJS_emulator.saveState()  // Test save
window.EJS_emulator.loadState(data)  // Test load
```

**Memory Scraping Debug:**
```javascript
// In browser console
window.EJS_emulator.Module.HEAP8  // View memory
```

**API Debug:**
- Open Network tab in DevTools
- Filter by `localhost:3001`
- Check request/response payloads

### Common Issues

**Emulator not loading:**
- Verify ROM path in .env matches actual file
- Check ROM file is valid GBA format
- Try different ROM dump if incompatible
- Check browser console for CORS errors

**Save states not working:**
- Verify EmulatorJS fully loaded (`isLoaded` state)
- Check backend is running and accepting saves
- Look for Base64 encoding errors in console
- Test with manual save/load first

**Memory scraping returns null:**
- Wait 5+ seconds after game loads
- Ensure game has progressed past intro screens
- Verify memory addresses are correct for ROM version
- Check console for scraping errors

**Input not working:**
- Click on emulator canvas to focus
- Check `isActive` prop is true
- Verify `pointerEvents` style not disabled
- Try refreshing page

## Testing

**Manual Testing Checklist:**

- [ ] Kiosk token generation and display
- [ ] Token registration with backend
- [ ] Polling for activation status
- [ ] Activation by admin connects kiosk
- [ ] Player name entry
- [ ] Attract mode runs while waiting for player
- [ ] Game loads and is playable
- [ ] 10-minute timer counts down
- [ ] Turn data saved to backend at turn end
- [ ] Save state restored for next player
- [ ] Next player can connect

**Browser Testing:**
- Chrome (primary target)
- Firefox
- Safari

**Performance:**
- Monitor memory usage during long sessions
- Check for memory leaks on unmount
- Verify attract mode doesn't cause issues

## Deployment

**Production Build:**

```bash
npm run build
```

**Serve Static Build:**

```bash
npm install -g serve
serve -s build -p 3000
```

**Environment Variables for Production:**

```env
REACT_APP_API_URL=https://api.your-domain.com
REACT_APP_ROM_PATH=/emulator/pokemon-firered.gba
```

**Nginx Configuration:**

```nginx
server {
  listen 80;
  server_name your-kiosk-domain.com;

  root /var/www/10mp-frontend/build;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }

  # Proxy API requests to backend
  location /api {
    proxy_pass http://localhost:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
  }
}
```

## Contributing

When modifying the frontend:

1. **Emulator Changes**: Update `EmulatorManager` class, not components
2. **Memory Addresses**: Document any new Pokemon data extraction
3. **API Changes**: Update both `api.js` and backend simultaneously
4. **State Management**: Keep state in `App.js`, pass down as props
5. **Styling**: Use CSS modules or scoped CSS files per component

## License

GPL-3.0

## See Also

- [Backend Documentation](../backend/README.md)
- [API Documentation](../API.md)
- [Main README](../README.md)

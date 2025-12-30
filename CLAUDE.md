# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

10 Minute Pokemon (10mp) is a collaborative Pokemon Fire Red experience where players take turns playing for exactly 10 minutes before passing the adventure to the next trainer. This project consists of a React-based frontend with Game Boy Advance emulation and a Node.js/Express backend with PostgreSQL for game state tracking.

## Project Structure

```
10mp/
├── frontend/          # React frontend application
│   ├── src/          # React components and utilities
│   ├── public/       # Static assets and ROM files
│   └── package.json  # Frontend dependencies
├── backend/           # Node.js/Express API server
│   ├── models/       # Sequelize database models
│   ├── migrations/   # Database migrations
│   ├── docker compose.yml  # Docker setup with PostgreSQL
│   ├── Dockerfile    # Production container
│   ├── Dockerfile.dev # Development container
│   ├── .env.docker   # Docker environment variables
│   └── package.json  # Backend dependencies
└── package.json       # Root workspace configuration
```

## Development Commands

**Full Stack:**
- `npm run dev` - Start both frontend and backend in development mode
- `npm run start` - Start both frontend and backend in production mode
- `npm run install:all` - Install dependencies for all projects

**Frontend Only:**
- `npm run frontend:dev` - Start React development server
- `npm run frontend:build` - Build for production  

**Backend Only:**
- `npm run backend:dev` - Start Express server with nodemon
- `npm run backend:db:setup` - Create database and run migrations

**Docker Development:**
- `npm run docker:dev` - Start backend and PostgreSQL in Docker containers
- `npm run docker:down` - Stop all Docker containers
- `npm run docker:logs` - View container logs
- `npm run docker:db` - Start only PostgreSQL container
- `npm run docker:clean` - Stop containers and clean up volumes/images

## Setup Instructions

### ROM Setup Required

The application requires Pokemon Fire Red ROM files in `frontend/public/emulator/`:
- `pokemon-firered.gba` - Main ROM file (user must provide legally)
- `gba_bios.bin` - GBA BIOS (optional but recommended)

### Docker Development Setup

For easy development with a containerized database:

1. **Prerequisites**: Install Docker and Docker Compose
2. **Start services**: `npm run docker:dev`
   - Automatically starts PostgreSQL database
   - Builds and runs backend API server
   - Database runs on `localhost:5432`
   - API server runs on `localhost:3001`
3. **Database migrations**: Migrations run automatically on container startup
4. **Environment**: Uses `backend/.env.docker` for database connection

### Local Development Setup

Alternative to Docker for local PostgreSQL:

1. Install PostgreSQL locally
2. Copy `backend/.env` to `backend/.env.local`
3. Update database credentials in `.env.local`
4. Run `npm run backend:db:setup`
5. Start with `npm run backend:dev`

## Architecture

### Frontend Architecture

**Core Application Flow:**
The React app uses a screen-based navigation system with three main states managed in `frontend/src/App.js`:
- **MenuScreen**: Player entry and game status
- **GameScreen**: Active gameplay with 10-minute timer
- **StatsScreen**: Game statistics and history
- **TestEmulator**: Debug/development screen

**Emulator Integration Pattern:**
The frontend follows a layered emulator integration:

1. **EmulatorManager** (`frontend/src/utils/emulator.js`) - Core class that wraps Emulator.js
   - Handles initialization with auto-detection of `#emulator-container`
   - Manages save states (captured at turn end)
   - Provides ROM memory scraping framework for Pokemon Fire Red
   - Includes specific memory addresses for game data extraction

2. **useEmulator Hook** (`frontend/src/hooks/useEmulator.js`) - React integration layer
   - Manages emulator lifecycle and state
   - Provides React-friendly interface to EmulatorManager
   - Handles loading, error states, and game data updates

3. **GameScreen Component** - UI integration
   - Renders emulator in `#emulator-container` div
   - Implements 10-minute countdown timer
   - Scrapes game data every 30 seconds during play
   - Handles turn transitions and player messages

### Backend Architecture

**API Server:** Express.js server (`backend/index.js`) with the following endpoints:
- `POST /api/game-turns` - Save game state after each player's turn
- `GET /api/game-turns` - Retrieve historical game data with pagination
- `GET /api/game-turns/:id` - Get specific turn data
- `GET /api/stats` - Game statistics and leaderboards
- `GET /health` - Health check endpoint

**Database Layer:** Sequelize ORM with PostgreSQL:
- **GameTurn Model** (`backend/models/GameTurn.js`) - Stores player data, game state, Pokemon party info, and save states
- **Migration System** - Schema management with `backend/migrations/`

### State Management Pattern
- **Frontend**: Global state managed through props passed down from `App.js`
- **Backend**: RESTful API for persistent game state storage
- **Integration**: Frontend POSTs scraped game data to backend after each turn

## Pokemon Fire Red Memory Structure & Data Extraction

This section documents the comprehensive memory address mapping and data extraction system used to scrape game state from Pokemon Fire Red ROM running in the mGBA emulator.

### GBA Memory Architecture Overview

The Game Boy Advance has multiple memory regions:
- **EWRAM** (0x02000000-0x0203FFFF): 256KB external work RAM - Main game data storage
- **IWRAM** (0x03000000-0x03007FFF): 32KB internal work RAM - Fast access temporary data
- **ROM** (0x08000000+): Game ROM data (read-only)

Pokemon Fire Red stores most runtime game state in EWRAM at predictable offsets.

### Save State Architecture

The game uses a sophisticated save system with three SaveBlock structures:

#### SaveBlock1 (Primary Game State)
Located dynamically in EWRAM, accessed via pointer at `0x03005D8C`.
Contains the bulk of gameplay data including:
- Player position and movement data
- Bag items (all pockets)
- PC storage boxes
- Event flags and variables
- Money (encrypted with security key)

**Key SaveBlock1 Offsets** (relative to SB1 pointer):
```
+0x0000: Player X position (u16)
+0x0002: Player Y position (u16)
+0x0290: Money (u32, encrypted with security key at +0x0AC)
+0x03B8: Items pocket (42 slots × 4 bytes)
+0x0430: Key items pocket (30 slots × 4 bytes)
+0x0464: Pokeballs pocket (16 slots × 4 bytes)
+0x04A4: TM case pocket (64 slots × 4 bytes)
+0x054C: Berries pocket (43 slots × 4 bytes)
+0x0AC0: Security key for encryption (u32)
```

#### SaveBlock2 (Player & Pokedex Data)
Located dynamically in EWRAM, accessed via pointer at `0x03005D90`.
Contains player profile and Pokedex:

**Key SaveBlock2 Offsets** (relative to SB2 pointer):
```
+0x0000: Player name (7 bytes + null terminator)
+0x0018: Pokedex owned flags (52 bytes bitfield)
+0x004C: Pokedex seen flags (52 bytes bitfield)
```

The Pokedex uses bitfields where each Pokemon's status is stored as individual bits (412 Pokemon total in Gen III national dex).

#### SaveBlock3 (Pokemon Storage)
Located dynamically in EWRAM, accessed via pointer at `0x03005D94`.
Contains PC box storage system data.

### Complete Memory Address Reference

All addresses defined in `frontend/src/utils/emulator.js` as `EmulatorManager.ADDRESSES`:

#### Core Pointers
```javascript
SAVEBLOCK1_PTR: 0x03005D8C  // Pointer to SaveBlock1 base
SAVEBLOCK2_PTR: 0x03005D90  // Pointer to SaveBlock2 base
SAVEBLOCK3_PTR: 0x03005D94  // Pointer to SaveBlock3 base
```

#### Direct EWRAM Addresses
```javascript
// Player identity and stats
PLAYER_NAME: 0x02025734       // 7-byte string + null terminator
LOCATION: 0x02036E38          // Current map/location ID (u8)
BADGE_COUNT: 0x02024E80       // Number of gym badges (u8)

// Playtime counter
PLAYTIME_HOURS: 0x02024E60    // Hours played (u16)
PLAYTIME_MINUTES: 0x02024E61  // Minutes played (u8)
PLAYTIME_SECONDS: 0x02024E62  // Seconds played (u8)
PLAYTIME_FRAMES: 0x02024E63   // Frames (1/60 second) (u8)

// Money (encrypted)
MONEY: 0x0202452C             // Current money (u32, encrypted)
SECURITY_KEY: 0x02024C3C      // Encryption key for money (u32)

// Party Pokemon
PARTY_COUNT: 0x02024284       // Number of Pokemon in party (u32)
PARTY_DATA: 0x02024284        // Start of party array
```

#### Battle System Addresses
```javascript
BATTLE_FLAGS: 0x02022B4C      // Battle state flags (u32)
                              // Bit 0: In battle
                              // Bit 1: Battle type indicator
ENEMY_PARTY_DATA: 0x0202402C  // Enemy party in battle
                              // First byte: count
                              // Following: 6 × 100-byte Pokemon structures
```

#### SaveBlock1 Relative Offsets
```javascript
SB1_PLAYER_X: 0x0000          // X coordinate (u16)
SB1_PLAYER_Y: 0x0002          // Y coordinate (u16)
SB1_MONEY: 0x0290             // Encrypted money (u32)
SB1_SECURITY_KEY: 0x0AC0      // Encryption key (u32)

// Bag pockets (Item ID u16 + Quantity u16 = 4 bytes per slot)
SB1_BAG_ITEMS: 0x03B8         // Items: 42 slots
SB1_BAG_KEY_ITEMS: 0x0430     // Key items: 30 slots
SB1_BAG_POKEBALLS: 0x0464     // Pokeballs: 16 slots
SB1_BAG_BERRIES: 0x054C       // Berries: 43 slots
ITEM_SLOT_SIZE: 4             // Bytes per item slot
```

#### SaveBlock2 Relative Offsets
```javascript
SB2_PLAYER_NAME: 0x0000       // Player name (8 bytes)
SB2_POKEDEX_OWNED: 0x0018     // Caught bitfield (52 bytes)
SB2_POKEDEX_SEEN: 0x004C      // Seen bitfield (52 bytes)
```

### Pokemon Data Structure

Each Pokemon in the party or enemy team is stored as a 100-byte structure:

```javascript
{
  // Offset 0x00-0x1F: Personality and encryption
  personality: u32,        // +0x00: Personality value (determines nature, gender, etc)
  otId: u32,              // +0x04: Original Trainer ID

  // Offset 0x08-0x57: Encrypted data (48 bytes in 4 substructures)
  // Decrypted using personality XOR otId, then unshuffled based on personality % 24

  // Growth substructure (after decryption)
  species: u16,           // Pokemon species ID
  heldItem: u16,          // Held item ID
  experience: u32,        // Total experience points
  ppBonuses: u8,          // PP ups used
  friendship: u8,         // Friendship value

  // Attacks substructure (after decryption)
  move1: u16, move2: u16, move3: u16, move4: u16,  // Move IDs
  pp1: u8, pp2: u8, pp3: u8, pp4: u8,              // Current PP

  // EVs & Condition substructure (after decryption)
  hpEV: u8, attackEV: u8, defenseEV: u8,
  speedEV: u8, spAttackEV: u8, spDefenseEV: u8,

  // Misc substructure (after decryption)
  ivs: u32,               // Packed IVs and flags

  // Offset 0x58+: Status and calculated stats
  status: u32,            // Status condition flags
  level: u8,              // Current level
  currentHP: u16,         // Current HP
  maxHP: u16,             // Maximum HP
  attack: u16,            // Calculated attack stat
  defense: u16,           // Calculated defense stat
  speed: u16,             // Calculated speed stat
  spAttack: u16,          // Calculated special attack stat
  spDefense: u16          // Calculated special defense stat
}
```

**Important Notes:**
- The core 48 bytes (0x08-0x37) are **encrypted** in memory
- Encryption uses: `key = personality ^ otId`
- Data is also **shuffled** into 4 substructures based on `personality % 24`
- Must decrypt and unshuffle to read species, moves, EVs, IVs
- Stats at offset 0x58+ are stored **unencrypted** for battle performance

### Data Extraction Methods

All methods implemented in `EmulatorManager` class (`frontend/src/utils/emulator.js`):

#### Core Save State Access
```javascript
getSaveState()
// Returns mGBA save state as Uint8Array
// Cached for 500ms to minimize performance impact
// Contains full EWRAM snapshot from emulator
```

#### Player Information
```javascript
readPlayerName()
// Returns: string (7 characters max)
// Reads from SB2 pointer + 0x0000

readLocation()
// Returns: number (map ID)
// Reads from 0x02036E38

readBadgeCount()
// Returns: number (0-8)
// Reads from 0x02024E80
```

#### Time & Money
```javascript
readPlaytime()
// Returns: { hours, minutes, seconds, frames }
// Reads from 0x02024E60-0x02024E63

readMoney()
// Returns: number (decrypted)
// Reads encrypted value at SB1 + 0x0290
// XORs with security key at SB1 + 0x0AC0
```

#### Pokemon Party
```javascript
readPartyCount()
// Returns: number (0-6)
// Reads from 0x02024284

readPartyPokemon()
// Returns: Array of Pokemon objects
// Reads 6 × 100-byte structures starting at 0x02024288
// Decrypts each Pokemon's core data
// Includes: species, nickname, level, HP, moves, stats
```

#### Battle State (Snapshot Feature)
```javascript
readBattleState()
// Returns: { isInBattle: boolean, battleType: number }
// Reads flags at 0x02022B4C
// Checks bit 0 for battle status

readEnemyParty()
// Returns: Array of Pokemon objects (only during battle)
// Reads from 0x0202402C
// Same structure as player party
// Returns null if not in battle
```

#### Position & Exploration
```javascript
readPlayerPosition()
// Returns: { x: number, y: number }
// Reads from SB1 + 0x0000 (X) and SB1 + 0x0002 (Y)

readPokedexProgress()
// Returns: { caught: number, seen: number }
// Reads bitfields from SB2 + 0x0018 (owned) and SB2 + 0x004C (seen)
// Counts set bits in 52-byte arrays
```

#### Inventory
```javascript
readBagItemsCount()
// Returns: number (total non-empty slots across all pockets)
// Reads all 4 bag pockets from SB1
// Items pocket: +0x03B8 (42 slots)
// Key items: +0x0430 (30 slots)
// Pokeballs: +0x0464 (16 slots)
// Berries: +0x054C (43 slots)
// Each slot: 2 bytes item ID + 2 bytes quantity
// Counts slots where item ID != 0
```

#### Complete Snapshot (All Data)
```javascript
scrapeSnapshotData()
// Returns: Complete game state object
// Combines all above methods into single snapshot
// Used for periodic 30-second captures during turns
// Includes: player, party, position, battle, pokedex, bag
```

### Performance Optimization

The scraping system is designed for minimal performance impact:

1. **Save State Caching**: `getSaveState()` caches the emulator save state for 500ms
   - Multiple scraping calls within 500ms reuse same memory snapshot
   - Eliminates redundant emulator API calls
   - Typical scrape completes in <10ms after first cache

2. **Direct Memory Access**: All reads use direct pointer arithmetic
   - No string parsing or complex algorithms
   - Simple byte reads and bit operations
   - Most operations are O(1) constant time

3. **Smart Battle Detection**: Enemy party only read when `isInBattle === true`
   - Avoids reading 600 bytes of battle data when not needed
   - Conditional execution based on battle flags

4. **Efficient Bitfield Counting**: Pokedex uses optimized bit counting
   - Processes 52-byte bitfield in single pass
   - Uses bitwise operations for counting set bits

5. **Periodic Collection**: Snapshots captured every 30 seconds (configurable)
   - Stored in React state during turn (in-memory only)
   - Batch saved to database when turn completes
   - No database writes during active gameplay

### Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ GameScreen Component (React)                                 │
│                                                              │
│  ┌──────────────────────────────────────────┐              │
│  │ 30-second interval timer                 │              │
│  │ (useEffect with setInterval)             │              │
│  └──────────────┬───────────────────────────┘              │
│                 │                                            │
│                 ▼                                            │
│  ┌──────────────────────────────────────────┐              │
│  │ captureSnapshot() callback               │              │
│  │ - Calls scrapeSnapshotData()             │              │
│  │ - Adds to snapshots state array          │              │
│  │ - Increments sequence number             │              │
│  └──────────────┬───────────────────────────┘              │
│                 │                                            │
└─────────────────┼────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ EmulatorManager.scrapeSnapshotData()                        │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐│
│  │ 1. getSaveState() - Get cached EWRAM snapshot         ││
│  │ 2. readPlayerName(), readLocation(), etc.             ││
│  │ 3. readPartyPokemon() - Decrypt party data            ││
│  │ 4. readBattleState() - Check if in battle             ││
│  │ 5. IF in battle: readEnemyParty()                     ││
│  │ 6. readPlayerPosition() - X, Y coords                 ││
│  │ 7. readPokedexProgress() - Count bitfield             ││
│  │ 8. readBagItemsCount() - Count non-empty slots        ││
│  │ 9. Return complete snapshot object                    ││
│  └────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ MessageInput Component (Turn End)                           │
│                                                              │
│  1. Extract snapshots from pendingTurnData                  │
│  2. Save turn to backend (POST /api/game-turns)             │
│  3. Receive savedTurn.id from response                      │
│  4. Batch save snapshots (POST /api/.../snapshots/batch)    │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ Backend API (Express + Sequelize)                           │
│                                                              │
│  POST /api/game-turns/:turnId/snapshots/batch               │
│  ┌────────────────────────────────────────────────────────┐│
│  │ 1. Validate turnId exists                              ││
│  │ 2. Begin database transaction                          ││
│  │ 3. Create all snapshots with Promise.all()             ││
│  │ 4. Commit transaction                                  ││
│  │ 5. Return created count                                ││
│  └────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ PostgreSQL Database                                          │
│                                                              │
│  game_state_snapshots table                                 │
│  - Indexed by game_turn_id                                  │
│  - UNIQUE constraint on (game_turn_id, sequence_number)     │
│  - CASCADE DELETE with game_turns                           │
│  - JSONB columns for flexible party/enemy data              │
└─────────────────────────────────────────────────────────────┘
```

### Database Schema

The `game_state_snapshots` table stores periodic snapshots:

```sql
CREATE TABLE game_state_snapshots (
  id UUID PRIMARY KEY,
  game_turn_id UUID REFERENCES game_turns(id) ON DELETE CASCADE,
  sequence_number INTEGER NOT NULL,
  captured_at TIMESTAMP NOT NULL,
  in_game_playtime INTEGER,  -- Seconds from game timer

  -- Position
  player_x INTEGER,
  player_y INTEGER,

  -- Basic state
  location VARCHAR(255),
  money INTEGER,
  badge_count INTEGER,

  -- Battle data
  is_in_battle BOOLEAN DEFAULT false,
  battle_type INTEGER,
  enemy_party JSONB,  -- Array of Pokemon objects

  -- Progress tracking
  pokedex_seen_count INTEGER,
  pokedex_caught_count INTEGER,
  bag_items_count INTEGER,

  -- Player party
  party_data JSONB,  -- Array of Pokemon objects

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(game_turn_id, sequence_number)
);

CREATE INDEX idx_snapshots_turn ON game_state_snapshots(game_turn_id);
CREATE INDEX idx_snapshots_time ON game_state_snapshots(captured_at);
```

### Error Handling & Null Safety

All scraping methods implement defensive null checking:

```javascript
// Example from readPartyPokemon()
const saveState = this.getSaveState();
if (!saveState) return null;  // No save state available

const partyCount = this.readPartyCount();
if (partyCount === null || partyCount === 0) return [];

// Validate memory bounds before reading
if (offset + size > saveState.length) return null;
```

This ensures the system gracefully handles:
- Emulator not yet initialized
- Save state not loaded
- Invalid memory addresses
- Corrupted save data

All snapshot fields in the database are **nullable** to accommodate missing data.

### References & Resources

- **pret/pokefirered**: Decompilation project with definitive memory mappings
  - https://github.com/pret/pokefirered
  - Source of truth for structure layouts and offsets

- **Bulbapedia Data Structure**: Pokemon data format documentation
  - https://bulbapedia.bulbagarden.net/wiki/Pok%C3%A9mon_data_structure_in_Generation_III

- **Data Crystal Pokemon FR/LG**: RAM mapping documentation
  - https://datacrystal.tcrf.net/wiki/Pok%C3%A9mon_FireRed_and_LeafGreen

- **mGBA Emulator**: Save state format and API
  - https://mgba.io/
  - Save states include full memory dump of EWRAM, IWRAM, etc.

### Future Expansion Possibilities

Additional data that could be scraped with minimal performance impact:

1. **Event Flags**: Check story progression (Gym defeats, Rocket battles, etc.)
   - Located in SaveBlock1 + 0x0EE0 (288 bytes of flags)

2. **Trainer ID & Secret ID**: For shiny Pokemon validation
   - SB2 + 0x000A (4 bytes)

3. **Step Counter**: Egg hatching and Safari Zone tracking
   - Direct address research needed

4. **Day Care Data**: Breeding progress
   - SaveBlock1 offset research needed

5. **Repel Steps**: Active repel duration
   - Direct address research needed

6. **PC Box Summary**: Total Pokemon stored
   - SaveBlock3 parsing required (more complex)

All addresses and methods are centralized in `frontend/src/utils/emulator.js` for easy maintenance and expansion.

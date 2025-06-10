# 10 Minute Pokemon (10mp)

A collaborative Pokemon Fire Red experience where players take turns playing for exactly 10 minutes before passing the adventure to the next trainer.

## Concept

- **Shared Journey**: One continuous Pokemon Fire Red playthrough shared by multiple players
- **10-Minute Turns**: Each player gets exactly 10 minutes to progress the adventure
- **Player Messages**: Leave tips and messages for the next player
- **Live Statistics**: Track game progress, team composition, and player contributions
- **Real-time Updates**: See current game status and recent achievements

## Tech Stack

- **Frontend**: React 18 with modern hooks
- **Emulator**: Emulator.js for Game Boy Advance emulation
- **Styling**: CSS modules with glassmorphism design
- **Real-time**: Socket.io for live updates (planned)
- **Backend**: Node.js/Express (planned)

## Project Structure

```
src/
├── components/
│   ├── GameScreen.js     # Main game interface with emulator
│   ├── MenuScreen.js     # Player entry and game status
│   └── StatsScreen.js    # Game statistics and history
├── hooks/
│   └── useEmulator.js    # Emulator management hook
└── utils/
    └── emulator.js       # EmulatorManager class
```

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Add ROM files to `public/emulator/`:
   - Pokemon Fire Red ROM (`pokemon-firered.gba`) - **You must provide this**
   - GBA BIOS file (`gba_bios.bin`) - Optional but recommended
   - See `public/emulator/README.md` for legal ROM acquisition info

3. Start development server:
   ```bash
   npm start
   ```

## Features

### Current
- ✅ React-based UI with three main screens
- ✅ Emulator integration framework
- ✅ Timer system for 10-minute turns
- ✅ Player input system with messages
- ✅ Mock game statistics display
- ✅ Responsive design with Pokemon-themed styling

### Planned
- 🔄 ROM state scraping for real game data
- 🔄 Game state persistence

## ROM Memory Addresses (Fire Red)

The emulator manager includes placeholders for ROM scraping. Key memory addresses needed:
- Player name: `0x02025734`
- Current location: `0x02036E38` 
- Badge count: `0x02024E80`
- Playtime: `0x02024E60-0x02024E64`
- Party data: Complex structure requiring detailed mapping
- Player money: `0x0202452C`

## Next Development Steps

### High Priority TODOs

- **Implement ROM Memory Scraping**
  - Connect to EmulatorJS memory access APIs
  - Extract real-time Pokemon Fire Red game data (location, badges, party, etc.)
  - Replace mock data in `scrapeGameData()` with actual memory reads
  - Research EmulatorJS Module.HEAP access patterns

- **Persistent Data Storage**
  - Set up backend server for data persistence
  - Create database schema for players, messages, and game states
  - Store player messages permanently instead of in React state
  - Add game state persistence between sessions

### Technical Improvements

- **EmulatorJS Integration**
  - **Optimize ROM loading performance** - Current loading is very slow, needs caching/optimization
  - Add error recovery for failed initializations

- **Data Persistence for Scraped ROM Data**
  - Create backend API endpoints for storing scraped game data
  - Persist ROM data (location, badges, party, money) with associated usernames
  - Track game progression over time across different players
  - Store historical snapshots of game state for analytics

- **UI/UX Enhancements**
  - **Pokemon-themed UI Design** - Style all screens to match Pokemon game menu aesthetics (borders, colors, fonts, layout)
  - Implement better error handling and user feedback

## Contributing

This project is designed for collaborative Pokemon gameplay. Feel free to contribute features that enhance the shared gaming experience!

## License

GPL-3.0
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

10 Minute Pokemon (10mp) is a collaborative Pokemon Fire Red experience where players take turns playing for exactly 10 minutes before passing the adventure to the next trainer. This is a React-based frontend that integrates with Emulator.js for Game Boy Advance emulation.

## Development Commands

- `npm start` / `npm run dev` - Start development server
- `npm run build` - Build for production  
- `npm test` - Run tests
- `npm run restart` - Kill existing dev server and restart

## ROM Setup Required

The application requires Pokemon Fire Red ROM files in `public/emulator/`:
- `pokemon-firered.gba` - Main ROM file (user must provide legally)
- `gba_bios.bin` - GBA BIOS (optional but recommended)

## Architecture

### Core Application Flow
The app uses a screen-based navigation system with three main states managed in `App.js`:
- **MenuScreen**: Player entry and game status
- **GameScreen**: Active gameplay with 10-minute timer
- **StatsScreen**: Game statistics and history
- **TestEmulator**: Debug/development screen

### Emulator Integration Pattern
The application follows a layered emulator integration:

1. **EmulatorManager** (`src/utils/emulator.js`) - Core class that wraps Emulator.js
   - Handles initialization with auto-detection of `#emulator-container`
   - Manages save states with auto-save every 10 seconds
   - Provides ROM memory scraping framework for Pokemon Fire Red
   - Includes specific memory addresses for game data extraction

2. **useEmulator Hook** (`src/hooks/useEmulator.js`) - React integration layer
   - Manages emulator lifecycle and state
   - Provides React-friendly interface to EmulatorManager
   - Handles loading, error states, and game data updates

3. **GameScreen Component** - UI integration
   - Renders emulator in `#emulator-container` div
   - Implements 10-minute countdown timer
   - Scrapes game data every 30 seconds during play
   - Handles turn transitions and player messages

### State Management Pattern
- Global state managed through props passed down from `App.js`
- Local component state for UI interactions
- Emulator state managed through custom hook
- Game data scraped from ROM memory addresses

### Pokemon Fire Red Memory Addresses
The codebase includes specific memory addresses for data extraction:
- Player name: `0x02025734`
- Current location: `0x02036E38`
- Badge count: `0x02024E80` 
- Playtime: `0x02024E60-0x02024E64`
- Player money: `0x0202452C`
- Party data: Complex structure requiring detailed mapping

### Planned Backend Integration
The frontend is prepared for backend integration with:
- Socket.io client already included for real-time updates
- Axios for API communication
- Game state persistence hooks
- Player queue management interfaces
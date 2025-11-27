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
   - Manages save states with auto-save every 10 seconds
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

### Pokemon Fire Red Memory Addresses
The codebase includes specific memory addresses for data extraction:
- Player name: `0x02025734`
- Current location: `0x02036E38`
- Badge count: `0x02024E80` 
- Playtime: `0x02024E60-0x02024E64`
- Player money: `0x0202452C`
- Party data: Complex structure requiring detailed mapping

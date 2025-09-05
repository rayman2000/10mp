# 10 Minute Pokemon (10mp)

A collaborative Pokemon Fire Red experience where players take turns playing for exactly 10 minutes before passing the adventure to the next trainer. This project consists of a React-based frontend with Game Boy Advance emulation and a Node.js/Express backend with PostgreSQL for game state tracking.

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
│   ├── docker-compose.yml  # Docker setup with PostgreSQL
│   ├── Dockerfile    # Multi-stage container build
│   └── package.json  # Backend dependencies
└── package.json       # Root workspace configuration
```


### Prerequisites
- Node.js 22+ and npm
- Docker and Docker Compose
- Pokemon Fire Red ROM file (legally obtained)

## Architecture

**Frontend:** React application with EmulatorJS integration for Pokemon Fire Red emulation. Includes 10-minute timer system and automatic game state scraping.

**Backend:** Express.js REST API with Sequelize ORM and PostgreSQL database. Stores player turns, game state, Pokemon party data, and save states.

**Development:** Docker Compose setup with PostgreSQL container and hot-reload development environment.

### Setup

1. **Install dependencies:**
   ```bash
   npm run install:all
   ```

2. **ROM Setup:**
   Add Pokemon Fire Red ROM to `frontend/public/emulator/pokemon-firered.gba`

3. **Start development environment:**
   ```bash
   # Start backend and database in Docker
   npm run docker:dev
   
   # In another terminal, start frontend
   npm run frontend:dev
   ```

## Development Commands

**Setup:**
- `npm run install:all` - Install dependencies for all projects

**Frontend:**
- `npm run frontend:dev` - Start React development server (localhost:3000)
- `npm run frontend:build` - Build for production  

**Backend (Docker):**
- `npm run docker:dev` - Start backend and PostgreSQL in Docker containers
- `npm run docker:down` - Stop all Docker containers
- `npm run docker:logs` - View container logs
- `npm run docker:db` - Start only PostgreSQL container
- `npm run docker:clean` - Stop containers and clean up volumes/images


## Database Schema

The `game_turns` table stores:
- Player information (name, turn duration)
- Game state (location, badges, money, playtime)
- Pokemon party data (JSON)
- Save state data (base64 encoded)
- Timestamps and metadata

## Integration

The frontend automatically scrapes Pokemon Fire Red memory data every minute and saves complete turn data (including save state) to the backend when each 10-minute turn ends.

## Next Development Steps

### TODOs

- Pokemon-themed UI Design - Style all screens to match Pokemon game menu aesthetics (borders, colors, fonts, layout)
- Add player statistics dashboard
- Implement save state restoration between turns
- Add turn history and replay functionality

# 10 Minute Pokemon (10MP)

A collaborative Pokemon Fire Red experience where players take turns playing for exactly 10 minutes before passing the adventure to the next trainer. Built for kiosk deployment with remote session management and cloud save states.

## Features

- **Kiosk-Based Architecture**: Raspberry Pi kiosks connect to remote backend via secure token-based registration
- **Turn-Based Gameplay**: Configurable turn duration (default 10 minutes)
- **Admin Console**: Standalone web application for kiosk activation and save state management
- **Game State Tracking**: Scrapes Pokemon Fire Red memory for badges, location, party data
- **Save Point Restoration**: Admin can restore to any previous save state

## Architecture

```
[Raspberry Pi Kiosk]          [Docker Container]              [Admin Console]
   - Browser (kiosk)    <-->    - Express (Node.js)      <-->  - Admin web app
   - ROM files                  - PostgreSQL (metadata)        - Kiosk activation
   - EmulatorJS                 - MinIO (save files)           - Save management
```

### URL Routing

Express serves everything directly:
- `yourdomain.com/` → Kiosk frontend
- `yourdomain.com/admin` → Admin console
- `yourdomain.com/api/*` → Backend API

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Pokemon Fire Red ROM (legally obtained)
- GBA BIOS (optional but recommended)

### 1. Clone and Setup ROM

```bash
git clone <repository-url>
cd 10mp

# Place ROM files in frontend/public/emulator/
# - pokemon-firered.gba (required)
# - gba_bios.bin (optional)
```

### 2. Configure Environment

Edit `.env` with your settings (database credentials, admin password, domains).

### 3. Start Services

```bash
# Build and start the container
npm run docker:build
npm run docker:up

# View logs
npm run docker:logs
```

### 4. Access Services

- Kiosk: `http://localhost`
- Admin: `http://localhost/admin`
- Health check: `http://localhost/health`

### 5. Activate Kiosk

1. Open kiosk (`http://localhost`)
2. Kiosk displays a 16-character token
3. Open admin (`http://localhost/admin`)
4. Login with your admin password
5. Find the kiosk in "Pending Kiosks"
6. Click "Activate"
7. Kiosk is ready for players!

## Configuration

Edit `.env` in the project root:

```env
# Database (PostgreSQL)
DB_HOST=postgres
DB_PORT=5432
DB_NAME=tenmp_db
DB_USERNAME=tenmp_user
DB_PASSWORD=your-secure-password

# MinIO (Object Storage)
MINIO_ENDPOINT=minio
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=your-secure-password
MINIO_BUCKET=game-saves

# Admin
ADMIN_PASSWORD=your-admin-password
```

## Development Commands

```bash
npm run docker:build   # Build production Docker image
npm run docker:up      # Start container (detached)
npm run docker:down    # Stop container
npm run docker:logs    # View container logs
npm run docker:clean   # Stop and clean up volumes/images

npm run install:all    # Install all dependencies locally
```

## Project Structure

```
10mp/
├── frontend/              # React kiosk frontend
│   ├── src/
│   │   ├── components/   # React components
│   │   ├── hooks/        # Custom hooks (useEmulator)
│   │   ├── services/     # API client
│   │   └── utils/        # EmulatorManager
│   └── public/
│       └── emulator/     # ROM files (not included)
├── admin/                 # Admin console
│   └── src/
│       ├── components/   # Admin dashboard
│       └── services/     # Admin API client
├── backend/               # Node.js/Express API
│   ├── models/           # Sequelize models
│   ├── migrations/       # Database migrations
│   └── services/         # Business logic
├── Dockerfile             # Multi-stage production build
├── docker-compose.yml     # App + PostgreSQL + MinIO
└── .env                   # Environment configuration
```

### Emulator use
For development without a controller, the keyboard defaults are:

- Arrow Keys: Move
- Z: A Button
- X: B Button
- Enter: Start
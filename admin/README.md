# 10MP Admin Console

Independent React application for managing 10 Minute Pokemon game sessions, kiosks, and save states.

## Overview

The admin console is a standalone web application that provides:
- **Kiosk Management**: Activate pending kiosks and monitor active ones
- **Session Management**: Start/stop game sessions
- **Save State Management**: View, restore, and manage save points
- **Statistics Dashboard**: Monitor game progress and player statistics

## Features

- **Password Authentication**: Secure access with configurable password
- **Real-time Updates**: Auto-refresh every 10 seconds
- **Save Point Restoration**: Load any previous save state
- **Game Statistics**: View total turns, unique players, and progress
- **Independent Deployment**: Runs separately from kiosk frontend

## Architecture

The admin console is a separate React application that:
- Runs on port 3002 (configurable)
- Connects to the same backend API as the kiosk frontend
- Can be deployed independently for remote administration
- Uses the same API endpoints but with admin-specific functionality

## Setup

### Prerequisites

- Node.js 16+
- Backend API running on port 3001 (or configured URL)

### Installation

```bash
cd admin
npm install
```

### Configuration

Create `admin/.env`:

```env
# Backend API URL
REACT_APP_API_URL=http://localhost:3001

# Admin console port (different from kiosk frontend)
PORT=3002
```

### Run Development Server

```bash
npm start
# or from root: npm run admin:dev
```

Runs on `http://localhost:3002`

### Build for Production

```bash
npm run build
```

Output in `build/` directory.

## Usage

### 1. Access Admin Console

Navigate to `http://localhost:3002` in your browser.

### 2. Login

Enter the admin password (configured in backend `.env` as `ADMIN_PASSWORD`).

**Default Password:** `change-me-in-production`

**⚠️ SECURITY:** Change this in production!

### 3. Dashboard Features

**Kiosk Management Panel:**
- **Pending Kiosks**: View kiosks waiting for activation
- **Activate Kiosk**: Manually approve a kiosk by its token
- **Active Kiosks**: Monitor currently active kiosks
- **Kiosk Tokens**: Display tokens for identification
- **Heartbeat Status**: See last check-in time

**Session Management Panel:**
- **Start Session**: Activate the game session
- **Stop Session**: Deactivate the game session
- **Session Status**: Show if session is active

**Save State Management:**
- **List Save States**: View all turn-end saves
- **Save Metadata**: See player name, location, badges for each save
- **Restore Save**: Click to load a previous save point
- **Turn-end Saves**: Saves created when a player's turn completes

**Quick Stats:**
- Total Turns Played
- Unique Players
- Latest Player Name
- Current Location
- Badge Count

### 4. Managing Kiosks

**Activating Kiosks:**
1. Kiosk displays its unique 16-character token
2. Token appears in admin console "Pending Kiosks" list
3. Verify the kiosk is legitimate (physical verification recommended)
4. Click "Activate" button for that kiosk
5. Kiosk automatically connects and proceeds to player entry

**Starting Session:**
1. Ensure kiosks are activated
2. Click "Start Session"
3. Game becomes active for players

**Stopping Session:**
1. Click "Stop Session"
2. Current gameplay ends
3. Kiosks wait for reactivation

**Monitoring Active Kiosks:**
- View list of active kiosks
- See last heartbeat timestamp
- Monitor kiosk status in real-time

### 5. Save State Restoration

**To restore a previous save:**
1. View the "Save States" list
2. Find the desired save point by timestamp/player/location
3. Click "Restore" button
4. Confirm restoration
5. Game loads from that save point on next session start

**Save State Types:**
- **turn-{turnId}.sav**: Saves from completed turns

## Project Structure

```
admin/
├── public/
│   └── index.html              # HTML template
├── src/
│   ├── components/
│   │   ├── AdminPanel.js       # Main admin dashboard
│   │   └── AdminPanel.css      # Dashboard styling
│   ├── services/
│   │   └── adminApi.js         # API client
│   ├── App.js                  # Main app component
│   ├── App.css                 # App styling
│   ├── index.js                # React entry point
│   └── index.css               # Global styles
├── .env                        # Environment variables
├── package.json                # Dependencies
└── README.md                   # This file
```

## API Integration

The admin console uses these backend endpoints:

**Configuration:**
- `GET /api/config` - Get server configuration including admin password

**Kiosk Management:**
- `POST /api/admin/activate-kiosk` - Activate a kiosk by token
- `GET /api/admin/pending-kiosks` - List kiosks by status (pending, active, inactive)

**Session Management:**
- `GET /api/session/status` - Get current session status
- `POST /api/session/start` - Start game session
- `POST /api/session/stop` - Stop game session
- `GET /api/session/saves` - List all save states

**Game Data:**
- `GET /api/game-turns` - List game turns
- `GET /api/stats` - Get game statistics

See [API.md](../API.md) for complete API documentation.

## Development

### Component Overview

**AdminPanel Component** (`src/components/AdminPanel.js`):
- Main dashboard component
- Handles authentication
- Manages all admin functionality
- Auto-refreshes data every 10 seconds

**Admin API Service** (`src/services/adminApi.js`):
- Axios-based API client
- Provides sessionApi, gameApi, configApi, kioskApi
- Handles all backend communication

### State Management

The admin panel manages state locally using React hooks:
- `authenticated` - Login status
- `sessionStatus` - Current session state
- `pendingKiosks` - List of kiosks awaiting/active
- `saves` - List of save states
- `stats` - Game statistics
- `config` - Server configuration
- `loading` - Loading indicator
- `message` - User feedback messages

### Auto-refresh

Dashboard automatically refreshes data every 10 seconds when authenticated:
- Pending kiosks list updates
- Session status updates
- Save states list updates
- Statistics updates

## Deployment

### Separate Deployment from Kiosk Frontend

The admin console can be deployed independently:

**Option 1: Same server, different port**
```bash
# Build
npm run build

# Serve on port 3002
serve -s build -l 3002
```

**Option 2: Separate server**
```bash
# Build
npm run build

# Deploy build/ to separate server
# Configure REACT_APP_API_URL to point to backend
```

**Option 3: Subdomain**
```nginx
# admin.your-domain.com
server {
  listen 80;
  server_name admin.your-domain.com;

  root /var/www/10mp-admin/build;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

### Environment Variables for Production

```env
REACT_APP_API_URL=https://api.your-domain.com
PORT=3002
```

### Security Considerations

**⚠️ PRODUCTION SECURITY:**

1. **Change Admin Password**: Update `ADMIN_PASSWORD` in backend `.env`
2. **HTTPS Only**: Deploy admin console over SSL/TLS
3. **IP Whitelist**: Restrict access to admin console by IP
4. **Separate Domain**: Use subdomain like `admin.your-domain.com`
5. **VPN Access**: Require VPN for admin access
6. **Firewall**: Block port 3002 from public internet
7. **Authentication**: Consider adding proper auth (JWT, OAuth)

**Nginx IP Whitelist Example:**
```nginx
location / {
  allow 192.168.1.0/24;  # Your network
  allow 10.0.0.5;        # Specific admin IP
  deny all;

  try_files $uri $uri/ /index.html;
}
```

## Troubleshooting

### Cannot Login

**Problem:** Password rejected

**Solutions:**
- Check backend `.env` has correct `ADMIN_PASSWORD`
- Verify backend is running
- Check browser console for API errors
- Ensure backend CORS allows admin origin (port 3002)

### Data Not Loading

**Problem:** Dashboard shows loading forever

**Solutions:**
- Verify backend API is running: `curl http://localhost:3001/health`
- Check backend logs for errors
- Verify CORS configuration in backend
- Check browser console for CORS errors
- Ensure `REACT_APP_API_URL` in `.env` is correct

### CORS Errors

**Problem:** `Access to XMLHttpRequest blocked by CORS policy`

**Solutions:**
- Add `CORS_ORIGIN_ADMIN=http://localhost:3002` to backend `.env`
- Restart backend after changing `.env`
- Verify backend CORS configuration includes admin origin
- Check backend logs show admin origin is allowed

### Kiosk Not Appearing in Pending List

**Problem:** Kiosk generated token but not visible in admin console

**Solutions:**
- Verify kiosk successfully registered with backend
- Check backend logs for registration attempts
- Ensure backend is running and accessible
- Verify kiosk frontend can reach backend API
- Check CORS configuration in backend

### Save States Not Restoring

**Problem:** Clicking "Restore" doesn't load save

**Solutions:**
- Save state restoration feature is not yet implemented
- Check backend has MinIO configured and running
- Verify save file exists in MinIO console
- Check backend logs for load errors

## Testing

### Manual Testing Checklist

**Authentication:**
- [ ] Login with correct password succeeds
- [ ] Login with incorrect password fails
- [ ] Session persists during auto-refresh

**Kiosk Management:**
- [ ] Pending kiosks appear in list
- [ ] Kiosk tokens display correctly
- [ ] Activate button activates kiosk
- [ ] Active kiosks show in active list
- [ ] Heartbeat timestamps update

**Session Management:**
- [ ] Start session activates session
- [ ] Stop session deactivates session
- [ ] Session status updates correctly

**Save States:**
- [ ] Save states list loads
- [ ] Turn-end saves appear
- [ ] Metadata displays correctly (player, location, badges)
- [ ] Restore button triggers action (when implemented)

**Statistics:**
- [ ] Total turns displays
- [ ] Unique players count correct
- [ ] Latest turn info shows
- [ ] Auto-refresh updates stats

### Browser Compatibility

Tested and supported:
- Chrome/Edge (Chromium) - Primary target
- Firefox
- Safari

## Future Enhancements

**Planned Features:**
- Save state restoration (backend implementation needed)

**Possible Future Enhancements:**
- Multi-session support
- User role management
- Detailed analytics dashboard
- Save state diff/comparison
- Automated backup scheduling
- Kiosk health monitoring
- Player ban/management
- Custom turn durations per kiosk

## Contributing

When modifying the admin console:

1. **Keep Standalone**: Admin should not depend on kiosk frontend code
2. **API Changes**: Update both admin and backend simultaneously
3. **Security First**: Never expose sensitive data in UI
4. **Mobile Responsive**: Admin panel should work on tablets
5. **Error Handling**: Show user-friendly error messages

## License

GPL-3.0

## See Also

- [Main README](../README.md)
- [Backend Documentation](../backend/README.md)
- [Frontend Documentation](../frontend/README.md)
- [API Documentation](../API.md)

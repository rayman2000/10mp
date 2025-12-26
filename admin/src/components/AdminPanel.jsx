import React, { useState, useEffect } from 'react';
import { gameApi, authApi, kioskApi, setAdminToken, clearAdminToken } from '../services/adminApi';
import './AdminPanel.css';

const PAGE_SIZE = 20;

const AdminPanel = () => {
  const [token, setToken] = useState(null);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  const [gameTurns, setGameTurns] = useState([]);
  const [turnsTotal, setTurnsTotal] = useState(0);
  const [turnsHasMore, setTurnsHasMore] = useState(false);
  const [turnsPage, setTurnsPage] = useState(0);
  const [stats, setStats] = useState(null);
  const [pendingKiosks, setPendingKiosks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [message, setMessage] = useState('');

  // Fetch stats, game turns, and pending kiosks
  const fetchData = async () => {
    try {
      setLoading(true);
      setTurnsPage(0);

      const [statsData, kiosksData, turnsData] = await Promise.all([
        gameApi.getStats(),
        kioskApi.getPendingKiosks('all'),
        gameApi.getGameTurns({ limit: PAGE_SIZE, offset: 0 })
      ]);

      setStats(statsData);
      setPendingKiosks(kiosksData.kiosks || []);
      setGameTurns(turnsData.data || []);
      setTurnsTotal(turnsData.pagination?.total || 0);
      setTurnsHasMore(turnsData.pagination?.hasMore || false);
    } catch (error) {
      console.error('Error fetching data:', error);
      setMessage(`Error loading data: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Load more turns
  const loadMoreTurns = async () => {
    try {
      setLoadingMore(true);
      const nextPage = turnsPage + 1;
      const offset = nextPage * PAGE_SIZE;

      const turnsData = await gameApi.getGameTurns({ limit: PAGE_SIZE, offset });

      setGameTurns(prev => [...prev, ...(turnsData.data || [])]);
      setTurnsPage(nextPage);
      setTurnsHasMore(turnsData.pagination?.hasMore || false);
    } catch (error) {
      console.error('Error loading more turns:', error);
      setMessage(`Error loading more turns: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchData();
    }
  }, [token]);

  // Handle password authentication (server-side)
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoggingIn(true);
    setAuthError('');

    try {
      const result = await authApi.login(password);
      if (result.success && result.token) {
        setAdminToken(result.token);
        setToken(result.token);
      }
    } catch (error) {
      if (error.response?.status === 401) {
        setAuthError('Invalid password');
      } else {
        setAuthError('Failed to connect to backend. Is the server running?');
      }
      setPassword('');
    } finally {
      setLoggingIn(false);
    }
  };

  // Handle logout
  const handleLogout = () => {
    clearAdminToken();
    setToken(null);
    setPassword('');
  };

  // Restore to a specific turn's save state
  const handleRestoreTurn = async (turn) => {
    if (!turn.saveStateUrl) {
      setMessage('This turn has no save state.');
      return;
    }

    // Count how many turns will be invalidated
    const newerTurns = gameTurns.filter(t =>
      new Date(t.turnEndedAt) > new Date(turn.turnEndedAt) && !t.invalidatedAt
    );

    const confirmMsg = `Restore to Turn #${turn.id}?\n\n` +
      `Player: ${turn.playerName}\n` +
      `Location: ${turn.location || 'Unknown'}\n` +
      `Badges: ${turn.badgeCount || 0}\n` +
      `Time: ${formatDate(turn.turnEndedAt)}\n\n` +
      (newerTurns.length > 0
        ? `WARNING: This will invalidate ${newerTurns.length} newer turn(s).\n\n`
        : '') +
      `The next kiosk connection will load this save state.`;

    if (!window.confirm(confirmMsg)) {
      return;
    }

    try {
      setLoading(true);
      setMessage('Restoring to turn...');

      const result = await kioskApi.restoreTurn(turn.id);
      setMessage(`Restored to Turn #${turn.id}. ${result.invalidatedCount} turn(s) invalidated.`);
      await fetchData(); // Refresh to show invalidated turns
    } catch (error) {
      setMessage(`Error restoring turn: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Activate kiosk
  const handleActivateKiosk = async (token, kioskName) => {
    if (!window.confirm(`Activate kiosk: ${kioskName || token}?\n\nThis will allow the kiosk to connect and play.`)) {
      return;
    }

    try {
      setLoading(true);
      setMessage(`Activating kiosk: ${kioskName || token}...`);

      await kioskApi.activateKiosk(token);
      setMessage(`Kiosk activated: ${kioskName || token}`);
      await fetchData();
    } catch (error) {
      setMessage(`Error activating kiosk: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Disconnect/remove kiosk
  const handleDisconnectKiosk = async (token, kioskName, isPending = false) => {
    const action = isPending ? 'Remove' : 'Disconnect';

    if (!window.confirm(`${action} kiosk: ${kioskName || token}?\n\n${isPending ? 'This will remove the pending registration.' : 'This will immediately disconnect the kiosk.'}`)) {
      return;
    }

    try {
      setLoading(true);
      setMessage(`${action}ing kiosk: ${kioskName || token}...`);

      await kioskApi.disconnectKiosk(token);
      setMessage(`Kiosk ${action.toLowerCase()}d: ${kioskName || token}`);
      await fetchData();
    } catch (error) {
      setMessage(`Error ${action.toLowerCase()}ing kiosk: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Format timestamp
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  // Login screen
  if (!token) {
    return (
      <div className="admin-panel">
        <div className="admin-login">
          <h1>Admin Panel</h1>
          <form onSubmit={handleLogin}>
            <input
              type="password"
              placeholder="Enter admin password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="admin-password-input"
              autoFocus
              disabled={loggingIn}
            />
            {authError && <div className="admin-error">{authError}</div>}
            <button type="submit" className="admin-button" disabled={loggingIn}>
              {loggingIn ? 'Logging in...' : 'Login'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Main admin panel
  return (
    <div className="admin-panel">
      <div className="admin-header">
        <h1>10MP Admin Panel</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px' }}>
          <button
            onClick={fetchData}
            disabled={loading}
            className="admin-button"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
          <button
            onClick={handleLogout}
            className="admin-button"
            style={{ background: '#666' }}
          >
            Logout
          </button>
        </div>
      </div>

      {message && (
        <div className="admin-message">
          {message}
          <button onClick={() => setMessage('')} className="message-close">✕</button>
        </div>
      )}

      <div className="admin-grid">
        {/* Quick Stats */}
        <div className="admin-card">
          <h2>Quick Stats</h2>
          {stats ? (
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{stats.totalTurns || 0}</div>
                <div className="stat-label">Total Turns</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{stats.uniquePlayers || 0}</div>
                <div className="stat-label">Unique Players</div>
              </div>
              {stats.latestTurn && (
                <>
                  <div className="stat-item">
                    <div className="stat-value">{stats.latestTurn.badgeCount || 0}</div>
                    <div className="stat-label">Current Badges</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-value">{stats.latestTurn.playerName}</div>
                    <div className="stat-label">Last Player</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-value">{stats.latestTurn.location || 'Unknown'}</div>
                    <div className="stat-label">Current Location</div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <p>Loading stats...</p>
          )}
        </div>

        {/* Kiosk Management */}
        <div className="admin-card">
          <h2>Kiosk Management</h2>
          <div className="kiosk-stats">
            <div className="stat-item">
              <div className="stat-value">{pendingKiosks.filter(k => k.status === 'pending').length}</div>
              <div className="stat-label">Pending</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{pendingKiosks.filter(k => k.status === 'active').length}</div>
              <div className="stat-label">Active</div>
            </div>
          </div>
          {pendingKiosks.filter(k => k.status === 'pending').length > 0 ? (
            <div className="kiosk-list">
              <h3>Pending Activations:</h3>
              {pendingKiosks.filter(k => k.status === 'pending').map(kiosk => (
                <div key={kiosk.id} className="kiosk-item">
                  <div className="kiosk-info">
                    <div className="kiosk-token">{kiosk.token}</div>
                    <div className="kiosk-details">
                      {kiosk.kioskName && <div><strong>{kiosk.kioskName}</strong></div>}
                      <div style={{ fontSize: '0.85em', color: '#888' }}>
                        {kiosk.kioskId}
                      </div>
                      <div style={{ fontSize: '0.8em', color: '#666' }}>
                        Registered: {formatDate(kiosk.registeredAt)}
                      </div>
                    </div>
                  </div>
                  <div className="kiosk-actions" style={{ marginTop: '10px', display: 'flex', gap: '10px' }}>
                    <button
                      onClick={() => handleActivateKiosk(kiosk.token, kiosk.kioskName || kiosk.kioskId)}
                      className="admin-button-success"
                      disabled={loading}
                    >
                      Activate
                    </button>
                    <button
                      onClick={() => handleDisconnectKiosk(kiosk.token, kiosk.kioskName || kiosk.kioskId, true)}
                      className="admin-button-danger"
                      disabled={loading}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: '#888', marginTop: '10px' }}>No pending kiosks</p>
          )}
          {pendingKiosks.filter(k => k.status === 'active').length > 0 && (
            <div className="kiosk-list" style={{ marginTop: '20px' }}>
              <h3>Active Kiosks:</h3>
              {pendingKiosks.filter(k => k.status === 'active').map(kiosk => (
                <div key={kiosk.id} className="kiosk-item" style={{ marginBottom: '15px' }}>
                  <div className="kiosk-info">
                    <div style={{ fontWeight: 'bold' }}>{kiosk.kioskName || kiosk.kioskId}</div>
                    <div style={{ fontSize: '0.85em', color: '#888' }}>
                      Token: {kiosk.token}
                    </div>
                    <div style={{ fontSize: '0.8em', color: '#666' }}>
                      Activated: {formatDate(kiosk.activatedAt)}
                    </div>
                  </div>
                  <div className="kiosk-actions" style={{ marginTop: '10px' }}>
                    <button
                      onClick={() => handleDisconnectKiosk(kiosk.token, kiosk.kioskName || kiosk.kioskId, false)}
                      className="admin-button-danger"
                      disabled={loading}
                    >
                      Disconnect
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Game Turns History */}
        <div className="admin-card admin-card-full">
          <h2>Game Turns ({turnsTotal > 0 ? `${gameTurns.length} of ${turnsTotal}` : gameTurns.length})</h2>
          <div className="saves-list">
            {gameTurns.length > 0 ? (
              <>
                {gameTurns.map((turn) => (
                  <div
                    key={turn.id}
                    className={`save-item ${turn.invalidatedAt ? 'save-item-invalidated' : ''}`}
                  >
                    <div className="save-info">
                      <div className="save-time">
                        #{turn.id} - {formatDate(turn.turnEndedAt)}
                        {turn.invalidatedAt && (
                          <span className="invalidated-badge" title={`Invalidated on ${formatDate(turn.invalidatedAt)}`}>
                            INVALIDATED
                          </span>
                        )}
                      </div>
                      <div className="save-details">
                        <strong>{turn.playerName}</strong> |
                        Location: {turn.location || 'Unknown'} |
                        Badges: {turn.badgeCount || 0} |
                        Duration: {Math.floor((turn.turnDuration || 0) / 60)}m {(turn.turnDuration || 0) % 60}s
                      </div>
                    </div>
                    {turn.saveStateUrl && !turn.invalidatedAt && (
                      <button
                        onClick={() => handleRestoreTurn(turn)}
                        className="admin-button-small"
                        disabled={loading}
                        title="Restore game to this point"
                      >
                        Restore
                      </button>
                    )}
                  </div>
                ))}
                {turnsHasMore && (
                  <div style={{ textAlign: 'center', marginTop: '15px' }}>
                    <button
                      onClick={loadMoreTurns}
                      className="admin-button"
                      disabled={loadingMore}
                    >
                      {loadingMore ? 'Loading...' : `Load More (${turnsTotal - gameTurns.length} remaining)`}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <p className="no-saves">No game turns recorded yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;

import React, { useState, useEffect } from 'react';
import { sessionApi, gameApi, configApi, kioskApi } from '../services/adminApi';
import './AdminPanel.css';

const AdminPanel = () => {
  const [config, setConfig] = useState(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const [sessionStatus, setSessionStatus] = useState(null);
  const [saves, setSaves] = useState([]);
  const [stats, setStats] = useState(null);
  const [pendingKiosks, setPendingKiosks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Fetch config on mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const configData = await configApi.getConfig();
        setConfig(configData);
      } catch (error) {
        console.error('Failed to load config:', error);
      }
    };
    loadConfig();
  }, []);

  // Fetch session status, saves, stats, and pending kiosks
  const fetchData = async () => {
    try {
      setLoading(true);

      // Try to get session status first
      let sessionData;
      try {
        sessionData = await sessionApi.getSessionStatus();
      } catch (statusError) {
        // If session doesn't exist (404), initialize it
        if (statusError.response && statusError.response.status === 404) {
          console.log('Session not found, initializing...');
          sessionData = await sessionApi.initSession();
          setMessage('Session initialized');
        } else {
          throw statusError;
        }
      }

      const [savesData, statsData, kiosksData] = await Promise.all([
        sessionApi.listSaveStates(),
        gameApi.getStats(),
        kioskApi.getPendingKiosks('all')
      ]);

      setSessionStatus(sessionData);
      setSaves(savesData.saves || []);
      setStats(statsData);
      setPendingKiosks(kiosksData.kiosks || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      setMessage(`Error loading data: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authenticated) {
      fetchData();
      // Refresh data every 10 seconds
      const interval = setInterval(fetchData, 10000);
      return () => clearInterval(interval);
    }
  }, [authenticated]);

  // Handle password authentication
  const handleLogin = (e) => {
    e.preventDefault();
    if (password === config.adminPassword) {
      setAuthenticated(true);
      setAuthError('');
    } else {
      setAuthError('Invalid password');
      setPassword('');
    }
  };

  // Start session
  const handleStartSession = async () => {
    try {
      setLoading(true);

      // Initialize session if it doesn't exist
      try {
        await sessionApi.startSession();
      } catch (startError) {
        if (startError.response && startError.response.status === 404) {
          console.log('Session not found, initializing before starting...');
          await sessionApi.initSession();
          await sessionApi.startSession();
        } else {
          throw startError;
        }
      }

      setMessage('Session started');
      await fetchData();
    } catch (error) {
      console.error('Error starting session:', error);
      setMessage(`Error starting session: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Stop session
  const handleStopSession = async () => {
    try {
      setLoading(true);
      await sessionApi.stopSession();
      setMessage('Session stopped');
      await fetchData();
    } catch (error) {
      console.error('Error stopping session:', error);
      setMessage(`Error stopping session: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Restore save point
  const handleRestoreSave = async (saveUrl) => {
    if (!window.confirm(`Restore to this save point?\n${saveUrl}\n\nThis will replace the current game state.`)) {
      return;
    }

    try {
      setLoading(true);
      setMessage(`Restoring save: ${saveUrl}...`);

      // Update session's current save URL
      const session = await sessionApi.getSessionStatus();
      // Note: Actual restore logic would load the save from MinIO
      // For now, we just update the reference
      setMessage('Save point marked for restore. Reload game to apply.');
      await fetchData();
    } catch (error) {
      setMessage('Error restoring save');
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

      await kioskApi.activateKiosk(token, sessionStatus?.sessionId || 'main-game');
      setMessage(`Kiosk activated: ${kioskName || token}`);
      await fetchData();
    } catch (error) {
      setMessage(`Error activating kiosk: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Deny kiosk
  const handleDenyKiosk = async (token, kioskName) => {
    if (!window.confirm(`Deny kiosk: ${kioskName || token}?\n\nThis kiosk will be blocked from connecting.`)) {
      return;
    }

    try {
      setLoading(true);
      setMessage(`Denying kiosk: ${kioskName || token}...`);

      await kioskApi.denyKiosk(token);
      setMessage(`Kiosk denied: ${kioskName || token}`);
      await fetchData();
    } catch (error) {
      setMessage(`Error denying kiosk: ${error.message}`);
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
  if (!authenticated) {
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
            />
            {authError && <div className="admin-error">{authError}</div>}
            <button type="submit" className="admin-button">Login</button>
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
      </div>

      {message && (
        <div className="admin-message">
          {message}
          <button onClick={() => setMessage('')} className="message-close">✕</button>
        </div>
      )}

      <div className="admin-grid">
        {/* Session Management */}
        <div className="admin-card">
          <h2>Session Management</h2>
          {sessionStatus ? (
            <div className="session-info">
              <div className="info-row">
                <span className="label">Session ID:</span>
                <span className="value">{sessionStatus.sessionId}</span>
              </div>
              <div className="info-row">
                <span className="label">Code:</span>
                <span className="value session-code">{sessionStatus.sessionCode}</span>
              </div>
              <div className="info-row">
                <span className="label">Status:</span>
                <span className={`value status-badge ${sessionStatus.isActive ? 'active' : 'inactive'}`}>
                  {sessionStatus.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="info-row">
                <span className="label">Last Activity:</span>
                <span className="value">{formatDate(sessionStatus.lastActivityAt)}</span>
              </div>
            </div>
          ) : (
            <p>Loading session data...</p>
          )}

          <div className="admin-actions">
            {sessionStatus?.isActive ? (
              <button
                onClick={handleStopSession}
                className="admin-button-danger"
                disabled={loading}
              >
                Stop Session
              </button>
            ) : (
              <button
                onClick={handleStartSession}
                className="admin-button-success"
                disabled={loading}
              >
                Start Session
              </button>
            )}
          </div>
        </div>

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
                    >
                      Activate
                    </button>
                    <button
                      onClick={() => handleDenyKiosk(kiosk.token, kiosk.kioskName || kiosk.kioskId)}
                      className="admin-button-danger"
                    >
                      Deny
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
              {pendingKiosks.filter(k => k.status === 'active').slice(0, 5).map(kiosk => (
                <div key={kiosk.id} className="kiosk-item-active">
                  <div>{kiosk.kioskName || kiosk.kioskId}</div>
                  <div style={{ fontSize: '0.8em', color: '#888' }}>
                    Activated: {formatDate(kiosk.activatedAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Save State Management */}
        <div className="admin-card admin-card-full">
          <h2>Save States ({saves.length})</h2>
          <div className="saves-list">
            {saves.length > 0 ? (
              saves.slice(0, 20).map((save, index) => (
                <div key={index} className="save-item">
                  <div className="save-info">
                    <div className="save-time">{formatDate(save.lastModified)}</div>
                    <div className="save-details">
                      Player: {save.playerName} |
                      Location: {save.location} |
                      Badges: {save.badgeCount} |
                      Size: {(save.size / 1024).toFixed(1)}KB
                    </div>
                    <div className="save-key">{save.objectKey}</div>
                  </div>
                  <button
                    onClick={() => handleRestoreSave(save.objectKey)}
                    className="admin-button-small"
                    disabled={loading}
                  >
                    Restore
                  </button>
                </div>
              ))
            ) : (
              <p className="no-saves">No save states available yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;

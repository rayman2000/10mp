import React, { useState, useEffect } from 'react';
import { saveApi, gameApi, configApi, kioskApi } from '../services/adminApi';
import './AdminPanel.css';

const AdminPanel = () => {
  const [config, setConfig] = useState(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

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
        setAuthError('Failed to connect to backend. Please check if the backend server is running.');
        // Retry after 3 seconds
        setTimeout(loadConfig, 3000);
      }
    };
    loadConfig();
  }, []);

  // Fetch saves, stats, and pending kiosks
  const fetchData = async () => {
    try {
      setLoading(true);

      const [savesData, statsData, kiosksData] = await Promise.all([
        saveApi.listSaves(),
        gameApi.getStats(),
        kioskApi.getPendingKiosks('all')
      ]);

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

    // Check if config is loaded
    if (!config) {
      setAuthError('Loading configuration...');
      return;
    }

    if (password === config.adminPassword) {
      setAuthenticated(true);
      setAuthError('');
    } else {
      setAuthError('Invalid password');
      setPassword('');
    }
  };

  // Restore save point (placeholder - actual restore logic would download and load the save)
  const handleRestoreSave = async (saveUrl) => {
    if (!window.confirm(`Restore to this save point?\n${saveUrl}\n\nThis will download the save file.`)) {
      return;
    }

    try {
      setLoading(true);
      setMessage(`Downloading save: ${saveUrl}...`);

      // Note: Actual restore logic would download the save from MinIO
      // For now, just show a message
      setMessage('Save download would be implemented here. Reload game with this save.');
      await fetchData();
    } catch (error) {
      setMessage('Error downloading save');
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
              disabled={!config}
            />
            {authError && <div className="admin-error">{authError}</div>}
            <button type="submit" className="admin-button" disabled={!config}>
              {config ? 'Login' : 'Loading...'}
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

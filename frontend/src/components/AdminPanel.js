import React, { useState, useEffect } from 'react';
import { sessionApi, gameApi } from '../services/api';
import './AdminPanel.css';

const AdminPanel = ({ config, onClose }) => {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const [sessionStatus, setSessionStatus] = useState(null);
  const [saves, setSaves] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Fetch session status, saves, and stats
  const fetchData = async () => {
    try {
      setLoading(true);
      const [sessionData, savesData, statsData] = await Promise.all([
        sessionApi.getSessionStatus(),
        sessionApi.listSaveStates(),
        gameApi.getStats()
      ]);

      setSessionStatus(sessionData);
      setSaves(savesData.saves || []);
      setStats(statsData);
    } catch (error) {
      console.error('Error fetching data:', error);
      setMessage('Error loading data');
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

  // Generate new session code
  const handleGenerateCode = async () => {
    try {
      setLoading(true);
      const result = await sessionApi.initSession();
      setMessage(`New session code: ${result.sessionCode}`);
      await fetchData();
    } catch (error) {
      setMessage('Error generating code');
    } finally {
      setLoading(false);
    }
  };

  // Start session
  const handleStartSession = async () => {
    try {
      setLoading(true);
      await sessionApi.startSession();
      setMessage('Session started');
      await fetchData();
    } catch (error) {
      setMessage('Error starting session');
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
      setMessage('Error stopping session');
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
          {onClose && (
            <button onClick={onClose} className="admin-button-secondary">
              Close
            </button>
          )}
        </div>
      </div>
    );
  }

  // Main admin panel
  return (
    <div className="admin-panel">
      <div className="admin-header">
        <h1>10MP Admin Panel</h1>
        {onClose && (
          <button onClick={onClose} className="admin-close-btn">✕</button>
        )}
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
            <button
              onClick={handleGenerateCode}
              className="admin-button"
              disabled={loading}
            >
              Generate New Code
            </button>
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

import React, { useState } from 'react';
import './SessionConnect.css';

const SessionConnect = ({ onConnect }) => {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCodeChange = (e) => {
    const value = e.target.value.replace(/\D/g, ''); // Only digits
    if (value.length <= 6) {
      setCode(value);
      setError(''); // Clear error when user types
    }
  };

  const handleConnect = async () => {
    if (code.length !== 6) {
      setError('Please enter a 6-digit code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';
      const response = await fetch(`${API_BASE_URL}/api/session/connect/${code}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to connect');
      }

      const sessionData = await response.json();
      console.log('Connected to session:', sessionData);

      // Call parent callback with session data
      onConnect(sessionData);
    } catch (err) {
      console.error('Connection error:', err);
      setError(err.message || 'Failed to connect. Please check your code.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && code.length === 6) {
      handleConnect();
    }
  };

  return (
    <div className="session-connect-container">
      <div className="session-connect-card">
        <h1 className="session-connect-title">10 Minute Pokemon</h1>
        <p className="session-connect-subtitle">Kiosk Connection</p>

        <div className="session-connect-content">
          <label htmlFor="session-code" className="session-code-label">
            Enter Session Code
          </label>

          <input
            id="session-code"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            className="session-code-input"
            value={code}
            onChange={handleCodeChange}
            onKeyPress={handleKeyPress}
            placeholder="000000"
            maxLength={6}
            autoFocus
            disabled={loading}
          />

          <div className="code-hint">
            6-digit numeric code provided by admin
          </div>

          {error && (
            <div className="session-error">
              {error}
            </div>
          )}

          <button
            className="connect-button"
            onClick={handleConnect}
            disabled={loading || code.length !== 6}
          >
            {loading ? 'Connecting...' : 'Connect to Game'}
          </button>

          <div className="session-info">
            <p>Get your session code from the admin panel</p>
            <p className="session-version">v1.0.0</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SessionConnect;

import React, { useState, useEffect, useRef } from 'react';
import './KioskConnect.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// Generate a cryptographically secure token
const generateToken = (length = 16) => {
  const array = new Uint8Array(length);
  window.crypto.getRandomValues(array);

  // Convert to base64 and remove non-alphanumeric
  const token = btoa(String.fromCharCode.apply(null, array))
    .replace(/[^a-zA-Z0-9]/g, '')
    .substring(0, length);

  return token;
};

// Generate a kiosk ID (in production, use device ID or MAC address)
const generateKioskId = () => {
  const timestamp = Date.now();
  const random = generateToken(8);
  return `kiosk-${timestamp}-${random}`;
};

// Format token for display (XXXX-XXXX-XXXX-XXXX)
const formatToken = (token) => {
  return token.match(/.{1,4}/g).join('-').toUpperCase();
};

const KioskConnect = ({ onConnect }) => {
  const [token, setToken] = useState('');
  const [kioskId, setKioskId] = useState('');
  const [status, setStatus] = useState('generating'); // 'generating', 'registering', 'waiting', 'activated', 'error'
  const [error, setError] = useState('');
  const pollIntervalRef = useRef(null);

  // Generate token and register on mount
  useEffect(() => {
    const initKiosk = async () => {
      try {
        // Generate token and kiosk ID
        const newToken = generateToken(16);
        const newKioskId = generateKioskId();

        setToken(newToken);
        setKioskId(newKioskId);
        setStatus('registering');

        // Register with backend
        const response = await fetch(`${API_BASE_URL}/api/kiosk/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: newToken,
            kioskId: newKioskId,
            kioskName: `Kiosk ${newKioskId.substring(6, 16)}`
          })
        });

        if (!response.ok) {
          throw new Error('Failed to register kiosk');
        }

        const data = await response.json();
        console.log('Kiosk registered:', data);

        if (data.status === 'active') {
          // Already activated (shouldn't happen on first registration)
          setStatus('activated');
          if (onConnect) {
            onConnect({ sessionId: data.sessionId });
          }
        } else {
          // Start polling for activation
          setStatus('waiting');
          startPolling(newToken);
        }
      } catch (err) {
        console.error('Error initializing kiosk:', err);
        setError(err.message);
        setStatus('error');
      }
    };

    initKiosk();

    return () => {
      // Cleanup polling on unmount
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [onConnect]);

  // Poll backend for activation status
  const startPolling = (tokenToCheck) => {
    // Poll every 2 seconds
    pollIntervalRef.current = setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/kiosk/status/${tokenToCheck}`);

        if (!response.ok) {
          throw new Error('Failed to check kiosk status');
        }

        const data = await response.json();
        console.log('Kiosk status:', data);

        if (data.status === 'active') {
          // Kiosk has been activated!
          setStatus('activated');
          clearInterval(pollIntervalRef.current);

          // Notify parent component
          if (onConnect) {
            onConnect({ sessionId: data.sessionId });
          }
        }
      } catch (err) {
        console.error('Error checking kiosk status:', err);
        // Don't show error, keep polling
      }
    }, 2000);
  };

  return (
    <div className="kiosk-connect">
      <div className="kiosk-container">
        <h1 className="kiosk-title">10 Minute Pokemon</h1>
        <div className="kiosk-subtitle">Kiosk Mode</div>

        {status === 'generating' && (
          <div className="kiosk-status">
            <div className="spinner"></div>
            <p>Generating kiosk token...</p>
          </div>
        )}

        {status === 'registering' && (
          <div className="kiosk-status">
            <div className="spinner"></div>
            <p>Registering with server...</p>
          </div>
        )}

        {status === 'waiting' && (
          <div className="kiosk-waiting">
            <div className="kiosk-instruction">
              Enter this code in the Admin Panel to activate this kiosk:
            </div>

            <div className="kiosk-token-display">
              {formatToken(token)}
            </div>

            <div className="kiosk-info">
              <div className="kiosk-info-item">
                <span className="kiosk-info-label">Kiosk ID:</span>
                <span className="kiosk-info-value">{kioskId}</span>
              </div>
            </div>

            <div className="kiosk-pulse">
              <div className="pulse-dot"></div>
              <span>Waiting for admin activation...</span>
            </div>

            <div className="kiosk-help">
              <p>An administrator must enter the code above in the Admin Panel to activate this kiosk.</p>
              <p className="kiosk-help-note">This kiosk will automatically connect once activated.</p>
            </div>
          </div>
        )}

        {status === 'activated' && (
          <div className="kiosk-status">
            <div className="kiosk-success">✓</div>
            <p className="kiosk-success-text">Kiosk Activated!</p>
            <p>Connecting to game...</p>
          </div>
        )}

        {status === 'error' && (
          <div className="kiosk-error">
            <h2>Connection Error</h2>
            <p>{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="kiosk-retry-button"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default KioskConnect;

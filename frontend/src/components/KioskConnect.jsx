import React, { useState, useEffect, useRef } from 'react';
import './KioskConnect.css';

// Use empty string for relative URLs in production (Express serves everything)
const API_BASE_URL = import.meta.env.VITE_API_URL !== undefined
  ? import.meta.env.VITE_API_URL
  : 'http://localhost:3001';

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

const KioskConnect = ({ onConnect }) => {
  const [token, setToken] = useState('');
  const [kioskId, setKioskId] = useState('');
  const [status, setStatus] = useState('generating'); // 'generating', 'registering', 'waiting', 'activated', 'error'
  const [error, setError] = useState('');
  const [deviceIp, setDeviceIp] = useState('');
  const [localServerConnected, setLocalServerConnected] = useState(false);
  const [pollInterval, setPollInterval] = useState(200); // Default 200ms polling interval
  const pollIntervalRef = useRef(null);
  const onConnectRef = useRef(onConnect);

  // Fetch local IP from Python LED server health check
  useEffect(() => {
    const fetchLocalServerInfo = async () => {
      try {
        const response = await fetch('http://localhost:3333/health');
        if (response.ok) {
          const data = await response.json();
          setLocalServerConnected(true);

          console.log('Local server health check:', data);

          if (data.network_interfaces && data.network_interfaces.length > 0) {
            // Format: "[ETH] eth0: 192.168.1.100"
            const formattedIps = data.network_interfaces.map(iface => {
              const typeLabel = iface.type === 'ethernet' ? 'ETH' :
                               iface.type === 'wifi' ? 'WiFi' : 'NET';
              return `[${typeLabel}] ${iface.interface}: ${iface.address}`;
            }).join('\n');
            setDeviceIp(formattedIps);
          } else {
            setDeviceIp('No network interfaces found');
          }
        } else {
          setLocalServerConnected(false);
          setDeviceIp('Could not be found');
        }
      } catch (err) {
        console.error('Failed to connect to local server:', err);
        setLocalServerConnected(false);
        setDeviceIp('Could not be found');
      }
    };

    fetchLocalServerInfo();
  }, []);

  // Keep ref updated
  useEffect(() => {
    onConnectRef.current = onConnect;
  }, [onConnect]);

  // Generate token and register on mount (runs only once)
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

        if (response.status === 403) {
          // Another kiosk is already active
          const errorData = await response.json();
          setError(errorData.message || 'Another kiosk is already active');
          setStatus('denied');
          return;
        }

        if (!response.ok) {
          throw new Error('Failed to register kiosk');
        }

        const data = await response.json();
        console.log('Kiosk registered:', data);

        if (data.status === 'active') {
          // Already activated (shouldn't happen on first registration)
          setStatus('activated');
          if (onConnectRef.current) {
            onConnectRef.current();
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
  }, []); // Empty deps - only run once on mount

  // Poll backend for activation status
  const startPolling = (tokenToCheck) => {
    // Poll every 2 seconds
    pollIntervalRef.current = setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/kiosk/status/${tokenToCheck}`);

        if (response.status === 404) {
          // Kiosk registration was deleted (disconnected by admin)
          setStatus('denied');
          setError('This kiosk has been disconnected by an organizer.');
          clearInterval(pollIntervalRef.current);
          return;
        }

        if (!response.ok) {
          throw new Error('Failed to check kiosk status');
        }

        const data = await response.json();
        console.log('Kiosk status:', data);

        if (data.status === 'active') {
          // Kiosk has been activated!
          setStatus('activated');
          clearInterval(pollIntervalRef.current);

          // Notify parent component with poll interval config
          if (onConnectRef.current) {
            onConnectRef.current({ pollInterval });
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
            <div className="kiosk-pulse">
              <div className="pulse-dot"></div>
              <span>Waiting for activation...</span>
            </div>

            <div className="kiosk-help">
              <p>Contact an organizer to activate this game.</p>
              <p className="kiosk-help-note">The game will start automatically once activated.</p>
            </div>

            <div className="kiosk-id-display">
              <span className="kiosk-id-label">Kiosk ID:</span>
              <span className="kiosk-id-value">{kioskId}</span>
            </div>

            {/* Local server connection status */}
            <div className="kiosk-debug-info">
              <span className="kiosk-debug-label">Local Server:</span>
              <span className={`kiosk-debug-value ${localServerConnected ? 'connected' : 'disconnected'}`}>
                {localServerConnected ? '✓ Connected' : '✗ Disconnected'}
              </span>
            </div>

            {/* Device IP address */}
            {deviceIp && (
              <div className="kiosk-debug-info">
                <div className="kiosk-debug-label">Kiosk IP:</div>
                <div className="kiosk-debug-value kiosk-ip-list">
                  {deviceIp.split('\n').map((line, idx) => (
                    <div key={idx} className="kiosk-ip-entry">{line}</div>
                  ))}
                </div>
              </div>
            )}

            <div className="kiosk-config">
              <label className="kiosk-config-label">
                Poll Interval (ms):
                <input
                  type="number"
                  className="kiosk-config-input"
                  value={pollInterval}
                  onChange={(e) => setPollInterval(parseInt(e.target.value, 10) || 200)}
                  min="50"
                  max="5000"
                  step="50"
                />
              </label>
              <span className="kiosk-config-hint">
                {pollInterval < 100 ? '⚡ Very Fast' : pollInterval <= 300 ? '🔄 Fast' : pollInterval <= 1000 ? '⏱️ Normal' : '🐢 Slow'} ({Math.round(1000 / pollInterval * 10) / 10} Hz)
              </span>
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

        {status === 'denied' && (
          <div className="kiosk-status">
            <div className="kiosk-error-icon">✕</div>
            <p className="kiosk-error-text">Access Denied</p>
            <p>{error || 'Another kiosk is already active. Contact an organizer for assistance.'}</p>
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

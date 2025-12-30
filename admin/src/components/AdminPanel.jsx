import React, { useState, useEffect, useRef } from 'react';
import { gameApi, authApi, kioskApi, romApi, saveApi, setAdminToken, clearAdminToken } from '../services/adminApi';
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
  const [selectedTurn, setSelectedTurn] = useState(null);
  const [hideInvalidated, setHideInvalidated] = useState(false);
  const [turnSnapshots, setTurnSnapshots] = useState([]);
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);
  const [snapshotPage, setSnapshotPage] = useState(0);
  const SNAPSHOTS_PER_PAGE = 5;

  // Handle turn selection and fetch snapshots
  const handleTurnClick = async (turn) => {
    setSelectedTurn(turn);
    setLoadingSnapshots(true);
    setTurnSnapshots([]);
    setSnapshotPage(0); // Reset to first page

    try {
      const API_URL = import.meta.env.VITE_API_URL || '';
      const response = await fetch(`${API_URL}/api/game-turns/${turn.id}/snapshots`);
      const data = await response.json();
      setTurnSnapshots(data.snapshots || []);
    } catch (error) {
      console.error('Error loading snapshots:', error);
      setTurnSnapshots([]);
    } finally {
      setLoadingSnapshots(false);
    }
  };

  // ROM management state
  const [roms, setRoms] = useState([]);
  const [uploadingRom, setUploadingRom] = useState(false);
  const romFileInputRef = useRef(null);

  // Save state management
  const [uploadingSave, setUploadingSave] = useState(false);
  const saveFileInputRef = useRef(null);

  // Fetch stats, game turns, pending kiosks, and ROMs
  const fetchData = async (includeInvalidatedOverride = null) => {
    try {
      setLoading(true);
      setTurnsPage(0);

      // Use override if provided, otherwise use current state
      const includeInvalidated = includeInvalidatedOverride !== null
        ? !includeInvalidatedOverride
        : !hideInvalidated;

      const [statsData, kiosksData, turnsData, romsData] = await Promise.all([
        gameApi.getStats(),
        kioskApi.getPendingKiosks('all'),
        gameApi.getGameTurns({ limit: PAGE_SIZE, offset: 0, includeInvalidated: includeInvalidated.toString() }),
        romApi.listRoms().catch(() => ({ roms: [] }))
      ]);

      setStats(statsData);
      setPendingKiosks(kiosksData.kiosks || []);
      setGameTurns(turnsData.data || []);
      setTurnsTotal(turnsData.pagination?.total || 0);
      setTurnsHasMore(turnsData.pagination?.hasMore || false);
      setRoms(romsData.roms || []);
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

      const turnsData = await gameApi.getGameTurns({
        limit: PAGE_SIZE,
        offset,
        includeInvalidated: (!hideInvalidated).toString()
      });

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

  // Handle ROM file upload
  const handleRomUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploadingRom(true);
      setMessage(`Uploading ROM: ${file.name}...`);

      const result = await romApi.uploadRom(file);
      setMessage(`ROM uploaded successfully: ${result.filename} (${formatFileSize(result.size)})`);
      await fetchData();
    } catch (error) {
      setMessage(`Error uploading ROM: ${error.response?.data?.error || error.message}`);
    } finally {
      setUploadingRom(false);
      // Reset file input
      if (romFileInputRef.current) {
        romFileInputRef.current.value = '';
      }
    }
  };

  // Handle ROM deletion
  const handleDeleteRom = async (filename) => {
    if (!window.confirm(`Delete ROM: ${filename}?\n\nThis cannot be undone.`)) {
      return;
    }

    try {
      setLoading(true);
      setMessage(`Deleting ROM: ${filename}...`);

      await romApi.deleteRom(filename);
      setMessage(`ROM deleted: ${filename}`);
      await fetchData();
    } catch (error) {
      setMessage(`Error deleting ROM: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Save state upload handler
  const handleSaveUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.sav')) {
      setMessage('Error: Only .sav files are allowed');
      return;
    }

    try {
      setUploadingSave(true);
      setMessage(`Uploading save: ${file.name}...`);

      const result = await saveApi.uploadSave(file, {
        playerName: 'Admin Upload',
        location: 'Uploaded Save',
        badgeCount: 0
      });

      setMessage(`Save uploaded successfully! Created Turn #${result.turnId.substring(0, 8)}`);
      await fetchData();
    } catch (error) {
      setMessage(`Error uploading save: ${error.response?.data?.error || error.message}`);
    } finally {
      setUploadingSave(false);
      if (saveFileInputRef.current) {
        saveFileInputRef.current.value = '';
      }
    }
  };

  // Save state download handler
  const handleSaveDownload = async (objectKey, filename) => {
    try {
      setMessage(`Downloading ${filename || objectKey}...`);
      await saveApi.downloadSave(objectKey);
      setMessage(`Downloaded ${filename || objectKey}`);
    } catch (error) {
      setMessage(`Error downloading save: ${error.response?.data?.error || error.message}`);
    }
  };

  // Format file size
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Format timestamp
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  // Format playtime (seconds to hours:minutes:seconds)
  const formatPlaytime = (seconds) => {
    if (!seconds) return '0:00:00';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Format money with commas
  const formatMoney = (amount) => {
    if (!amount && amount !== 0) return 'Unknown';
    return `₽${amount.toLocaleString()}`;
  };

  // Snapshot Item Component
  const SnapshotItem = ({ snapshot }) => {
    const [expanded, setExpanded] = React.useState(false);

    // Safe data extraction with defaults
    const sequenceNum = snapshot?.sequenceNumber ?? 0;
    // Show in-game playtime instead of real-world time
    const timeStr = snapshot?.inGamePlaytime
      ? formatPlaytime(snapshot.inGamePlaytime)
      : '--:--:--';
    const location = snapshot?.location || 'Unknown Location';
    const badgeCount = snapshot?.badgeCount ?? 0;
    const caughtCount = snapshot?.pokedexCaughtCount ?? 0;
    const isInBattle = snapshot?.isInBattle ?? false;

    return (
      <div className={`snapshot-item ${expanded ? 'expanded' : 'collapsed'}`}>
        <div
          className="snapshot-header"
          onClick={() => setExpanded(!expanded)}
          style={{ cursor: 'pointer' }}
        >
          <div className="snapshot-header-left">
            <span className="snapshot-number">#{sequenceNum}</span>
            <span className="snapshot-time-compact">{timeStr}</span>
            <span className="snapshot-location">{location}</span>
          </div>
          <div className="snapshot-header-right">
            {isInBattle && (
              <span className="battle-badge">⚔️ BATTLE</span>
            )}
            <span className="snapshot-quick-stat">
              Lv{badgeCount} • {caughtCount}★
            </span>
            <span className="expand-icon">{expanded ? '▼' : '▶'}</span>
          </div>
        </div>
        {expanded && (
          <div className="snapshot-details">
            <div className="snapshot-grid">
              <div className="snapshot-row">
                <strong>Position:</strong> ({snapshot.playerX}, {snapshot.playerY})
              </div>
              <div className="snapshot-row">
                <strong>Money:</strong> {formatMoney(snapshot.money)}
              </div>
              <div className="snapshot-row">
                <strong>Badges:</strong> {snapshot.badgeCount || 0}
              </div>
              <div className="snapshot-row">
                <strong>Pokedex:</strong> {snapshot.pokedexCaughtCount || 0} caught / {snapshot.pokedexSeenCount || 0} seen
              </div>
              <div className="snapshot-row">
                <strong>Bag Items:</strong> {snapshot.bagItemsCount || 0} unique items
              </div>
              <div className="snapshot-row">
                <strong>Playtime:</strong> {formatPlaytime(snapshot.inGamePlaytime)}
              </div>
            </div>
            {snapshot.isInBattle && snapshot.enemyParty && snapshot.enemyParty.length > 0 && (
              <div className="snapshot-battle-info">
                <strong>Enemy Party:</strong>
                <div className="enemy-party">
                  {snapshot.enemyParty.map((pokemon, i) => (
                    <span key={i} className="enemy-pokemon">
                      {pokemon.nickname} Lv.{pokemon.level} ({pokemon.currentHP}/{pokemon.maxHP} HP)
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Turn Detail Modal Component
  const TurnDetailModal = ({ turn, onClose }) => {
    if (!turn) return null;

    const partyData = turn.partyData || [];

    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Turn Details</h2>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>

          <div className="modal-body">
            <div className="detail-section">
              <h3>Turn Info</h3>
              <div className="detail-grid">
                <div className="detail-item">
                  <span className="detail-label">Turn ID</span>
                  <span className="detail-value">#{turn.id}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Player</span>
                  <span className="detail-value">{turn.playerName}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Ended At</span>
                  <span className="detail-value">{formatDate(turn.turnEndedAt)}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Turn Duration</span>
                  <span className="detail-value">
                    {Math.floor((turn.turnDuration || 0) / 60)}m {(turn.turnDuration || 0) % 60}s
                  </span>
                </div>
              </div>
            </div>

            <div className="detail-section">
              <h3>Game State</h3>
              <div className="detail-grid">
                <div className="detail-item">
                  <span className="detail-label">Location</span>
                  <span className="detail-value">{turn.location || 'Unknown'}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Badges</span>
                  <span className="detail-value">{turn.badgeCount || 0} / 8</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Money</span>
                  <span className="detail-value">{formatMoney(turn.money)}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Total Playtime</span>
                  <span className="detail-value">{formatPlaytime(turn.playtime)}</span>
                </div>
              </div>
            </div>

            {turn.message && (
              <div className="detail-section">
                <h3>Player Message</h3>
                <div className="player-message-box">
                  "{turn.message}"
                </div>
              </div>
            )}

            <div className="detail-section">
              <h3>Party ({partyData.length} Pokemon)</h3>
              {partyData.length > 0 ? (
                <div className="party-grid">
                  {partyData.map((pokemon, index) => (
                    <div key={index} className="party-pokemon">
                      <div className="pokemon-slot">#{index + 1}</div>
                      <div className="pokemon-info">
                        <div className="pokemon-name">{pokemon.nickname || pokemon.species || 'Unknown'}</div>
                        {pokemon.species && pokemon.nickname && pokemon.nickname !== pokemon.species && (
                          <div className="pokemon-species">({pokemon.species})</div>
                        )}
                        <div className="pokemon-details">
                          {pokemon.level && <span>Lv. {pokemon.level}</span>}
                          {pokemon.hp !== undefined && pokemon.maxHp !== undefined && (
                            <span>HP: {pokemon.hp}/{pokemon.maxHp}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="no-party">No party data available</p>
              )}
            </div>

            <div className="detail-section">
              <h3>Snapshot Timeline ({turnSnapshots.length} snapshots)</h3>
              {loadingSnapshots ? (
                <p className="loading-text">Loading snapshots...</p>
              ) : turnSnapshots.length > 0 ? (
                <>
                  {turnSnapshots.length > 0 && (
                    <div className="snapshot-summary">
                      <div className="summary-stat">
                        <span className="stat-label">Duration:</span>
                        <span className="stat-value">{Math.floor((turnSnapshots[turnSnapshots.length - 1]?.inGamePlaytime - turnSnapshots[0]?.inGamePlaytime) / 60)}m</span>
                      </div>
                      <div className="summary-stat">
                        <span className="stat-label">Battles:</span>
                        <span className="stat-value">{turnSnapshots.filter(s => s.isInBattle).length}</span>
                      </div>
                      <div className="summary-stat">
                        <span className="stat-label">Progress:</span>
                        <span className="stat-value">
                          {turnSnapshots[0]?.pokedexCaughtCount || 0} → {turnSnapshots[turnSnapshots.length - 1]?.pokedexCaughtCount || 0} caught
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Pagination controls */}
                  {turnSnapshots.length > SNAPSHOTS_PER_PAGE && (
                    <div className="snapshot-pagination">
                      <button
                        className="pagination-btn"
                        onClick={() => setSnapshotPage(prev => Math.max(0, prev - 1))}
                        disabled={snapshotPage === 0}
                      >
                        ← Previous
                      </button>
                      <span className="pagination-info">
                        Page {snapshotPage + 1} of {Math.ceil(turnSnapshots.length / SNAPSHOTS_PER_PAGE)}
                        {' '}({snapshotPage * SNAPSHOTS_PER_PAGE + 1}-{Math.min((snapshotPage + 1) * SNAPSHOTS_PER_PAGE, turnSnapshots.length)} of {turnSnapshots.length})
                      </span>
                      <button
                        className="pagination-btn"
                        onClick={() => setSnapshotPage(prev => Math.min(Math.ceil(turnSnapshots.length / SNAPSHOTS_PER_PAGE) - 1, prev + 1))}
                        disabled={snapshotPage >= Math.ceil(turnSnapshots.length / SNAPSHOTS_PER_PAGE) - 1}
                      >
                        Next →
                      </button>
                    </div>
                  )}

                  <div className="snapshot-timeline">
                    {turnSnapshots
                      .slice(snapshotPage * SNAPSHOTS_PER_PAGE, (snapshotPage + 1) * SNAPSHOTS_PER_PAGE)
                      .map((snapshot) => (
                        <SnapshotItem key={snapshot.id} snapshot={snapshot} />
                      ))}
                  </div>
                </>
              ) : (
                <p className="no-snapshots">No snapshots recorded for this turn</p>
              )}
            </div>

            {turn.invalidatedAt && (
              <div className="detail-section detail-section-warning">
                <h3>Invalidation</h3>
                <p>This turn was invalidated on {formatDate(turn.invalidatedAt)}</p>
              </div>
            )}
          </div>

          <div className="modal-footer">
            {turn.saveStateUrl && !turn.invalidatedAt && (
              <button
                onClick={() => { onClose(); handleRestoreTurn(turn); }}
                className="admin-button-success"
                disabled={loading}
              >
                Restore to This Turn
              </button>
            )}
            {turn.saveStateUrl && (
              <button
                onClick={() => { onClose(); handleSaveDownload(turn.saveStateUrl, turn.saveStateUrl); }}
                className="admin-button"
                disabled={loading}
              >
                Download Save File
              </button>
            )}
            <button onClick={onClose} className="admin-button-secondary">
              Close
            </button>
          </div>
        </div>
      </div>
    );
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
      {selectedTurn && (
        <TurnDetailModal
          turn={selectedTurn}
          onClose={() => {
            setSelectedTurn(null);
            setTurnSnapshots([]);
          }}
        />
      )}
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
                  <div className="stat-item">
                    <div className="stat-value">{formatMoney(stats.latestTurn.money)}</div>
                    <div className="stat-label">Current Money</div>
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

        {/* ROM Management */}
        <div className="admin-card">
          <h2>ROM Management</h2>
          <div className="rom-upload-section">
            <input
              type="file"
              ref={romFileInputRef}
              onChange={handleRomUpload}
              accept=".gba,.gbc,.gb,.nes,.sfc,.smc,.bin"
              style={{ display: 'none' }}
              disabled={uploadingRom}
            />
            <button
              onClick={() => romFileInputRef.current?.click()}
              className="admin-button"
              disabled={uploadingRom || loading}
            >
              {uploadingRom ? 'Uploading...' : 'Upload ROM'}
            </button>
            <p className="rom-upload-hint">Supported: .gba, .gbc, .gb, .nes, .sfc, .smc, .bin</p>
          </div>
          {roms.length > 0 ? (
            <div className="rom-list">
              {roms.map((rom) => (
                <div key={rom.name} className="rom-item">
                  <div className="rom-info">
                    <div className="rom-name">{rom.name}</div>
                    <div className="rom-details">
                      {formatFileSize(rom.size)} | Last modified: {formatDate(rom.lastModified)}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteRom(rom.name)}
                    className="admin-button-danger admin-button-small"
                    disabled={loading}
                    title="Delete ROM"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="no-roms">No ROMs uploaded yet. Upload a ROM to get started.</p>
          )}
        </div>

        {/* Game Turns History */}
        <div className="admin-card admin-card-full">
          <div className="card-header-with-toggle">
            <h2>Game Turns ({turnsTotal > 0 ? `${gameTurns.length} of ${turnsTotal}` : gameTurns.length})</h2>
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={hideInvalidated}
                onChange={(e) => {
                  setHideInvalidated(e.target.checked);
                  fetchData(e.target.checked);
                }}
              />
              Hide invalidated turns
            </label>
          </div>
          <div className="saves-list">
            {gameTurns.length > 0 ? (
              <>
                {gameTurns.map((turn) => (
                  <div
                    key={turn.id}
                    className={`save-item save-item-clickable ${turn.invalidatedAt ? 'save-item-invalidated' : ''}`}
                    onClick={() => handleTurnClick(turn)}
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
                        Money: {formatMoney(turn.money)} |
                        Duration: {Math.floor((turn.turnDuration || 0) / 60)}m {(turn.turnDuration || 0) % 60}s
                      </div>
                    </div>
                    <div className="turn-actions">
                      {turn.saveStateUrl && !turn.invalidatedAt && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRestoreTurn(turn); }}
                          className="admin-button-small"
                          disabled={loading}
                          title="Restore game to this point"
                        >
                          Restore
                        </button>
                      )}
                      {turn.saveStateUrl && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleSaveDownload(turn.saveStateUrl, turn.saveStateUrl); }}
                          className="admin-button-small"
                          disabled={loading}
                          title="Download save file"
                        >
                          Download
                        </button>
                      )}
                    </div>
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

      {/* Upload Save Files */}
      <div className="upload-save-section">
        <h2>Upload Save File</h2>
        <input
          type="file"
          ref={saveFileInputRef}
          onChange={handleSaveUpload}
          accept=".sav"
          style={{ display: 'none' }}
          disabled={uploadingSave}
        />
        <button
          onClick={() => saveFileInputRef.current?.click()}
          className="admin-button"
          disabled={uploadingSave || loading}
        >
          {uploadingSave ? 'Uploading...' : 'Upload Save File'}
        </button>
        <p className="upload-hint">Upload a .sav file to create a new turn in the game history</p>
      </div>
    </div>
  );
};

export default AdminPanel;

import React, { useEffect, useRef, useState, useCallback, memo } from 'react';
import { useEmulator } from '../hooks/useEmulator';
import './GameScreen.css';

// Separate timer component to isolate re-renders (prevents 600 re-renders per turn)
const GameTimer = memo(({ turnStartTime, turnDurationMinutes }) => {
  const [timeRemaining, setTimeRemaining] = useState(null);

  useEffect(() => {
    if (!turnStartTime) {
      setTimeRemaining(null);
      return;
    }

    const turnDurationMs = (turnDurationMinutes || 3) * 60 * 1000;
    const endTime = turnStartTime.getTime() + turnDurationMs;

    const updateTimer = () => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((endTime - now) / 1000));
      setTimeRemaining(remaining);
    };

    updateTimer();
    const intervalId = setInterval(updateTimer, 1000);

    return () => clearInterval(intervalId);
  }, [turnStartTime, turnDurationMinutes]);

  if (timeRemaining === null) return null;

  const mins = Math.floor(timeRemaining / 60);
  const secs = timeRemaining % 60;
  const formattedTime = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

  return (
    <div className="game-header-overlay">
      <div className="game-title">10 Minute Pokemon</div>
      <div className={`game-timer ${timeRemaining <= 60 ? 'game-timer-warning' : ''}`}>
        {formattedTime}
      </div>
    </div>
  );
});

const GameScreen = memo(({ player, isActive = true, approved = false, onGameEnd, onTurnDataCaptured, config, previousMessage, prefetchedSaveData }) => {
  const containerRef = useRef(null);
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false); // Ref to avoid recreating captureTurnData callback
  const [turnStartTime, setTurnStartTime] = useState(null); // Set when timer actually starts
  const [snapshots, setSnapshots] = useState([]); // Store snapshots collected during turn
  const [snapshotSequence, setSnapshotSequence] = useState(0); // Sequence counter for snapshots
  const {
    isLoaded,
    isRunning,
    error,
    startGame,
    saveGame,
    loadGame,
    scrapeData,
    scrapeSnapshotData,
    simulateKeyPress,
    getRandomAttractButton,
    setGameStateInterval
  } = useEmulator(config, approved);

  // Function to capture turn data (but not send yet - will be sent with message)
  const captureTurnData = useCallback(async () => {
    if (!player || isSavingRef.current) return;

    isSavingRef.current = true;
    setIsSaving(true);
    try {
      // Scrape game data at turn end
      console.log('Scraping game data for turn end...');
      const gameData = await scrapeData();
      console.log('Scraped game data:', gameData);

      const turnEndTime = new Date();
      const turnDuration = turnStartTime
        ? Math.floor((turnEndTime - turnStartTime) / 1000)
        : (config?.turnDurationMinutes || 3) * 60; // Fallback to configured duration
      const saveState = saveGame(); // Get current save state from emulator

      // Convert playtime object to total seconds (0 if not available)
      const playtimeObj = gameData?.playtime;
      let playtimeSeconds = 0;
      if (playtimeObj && typeof playtimeObj === 'object') {
        playtimeSeconds = (playtimeObj.hours || 0) * 3600 + (playtimeObj.minutes || 0) * 60 + (playtimeObj.seconds || 0);
      } else if (typeof playtimeObj === 'number') {
        playtimeSeconds = playtimeObj;
      }

      const turnData = {
        playerName: player,
        location: gameData?.location || 'Unknown',
        badgeCount: gameData?.badges || 0,
        playtime: playtimeSeconds,
        money: gameData?.money || 0,
        partyData: gameData?.party || [],
        turnDuration,
        saveState: saveState || null,
        snapshots: snapshots // Include collected snapshots
      };

      console.log('Turn data captured (will be sent with message):', turnData);
      console.log(`Captured ${snapshots.length} snapshots during turn`);

      // Pass the captured data to parent instead of sending to API
      if (onTurnDataCaptured) {
        onTurnDataCaptured(turnData);
      }
    } catch (error) {
      console.error('Failed to capture turn data:', error);
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }, [player, turnStartTime, config, saveGame, scrapeData, onTurnDataCaptured, snapshots]);

  // Function to capture a snapshot
  const captureSnapshot = useCallback(async () => {
    if (!isActive) return;

    try {
      const snapshotData = await scrapeSnapshotData();

      if (!snapshotData) {
        console.warn('No snapshot data available');
        return;
      }

      // Add snapshot to collection with sequence number and timestamp
      // Use functional updates to avoid depending on current state values
      setSnapshots(prev => {
        const newSnapshot = {
          ...snapshotData,
          sequenceNumber: prev.length, // Use array length as sequence
          capturedAt: new Date().toISOString()
        };
        console.log(`Snapshot #${prev.length} captured`);
        return [...prev, newSnapshot];
      });
    } catch (error) {
      console.error('Error capturing snapshot:', error);
    }
  }, [isActive, scrapeSnapshotData]);

  // Capture snapshots every 30 seconds during active turn
  useEffect(() => {
    if (!isActive) {
      // Reset snapshots when turn becomes inactive
      setSnapshots([]);
      setSnapshotSequence(0);
      return;
    }

    let isMounted = true;
    let intervalId = null;
    let retryTimeoutId = null;

    // Validate that game has started before capturing snapshots
    // This prevents debug logs before player enters their name
    const validateAndCapture = async () => {
      if (!isMounted) return;

      try {
        const testData = await scrapeSnapshotData();
        if (!testData) {
          // Game not ready yet, retry after delay
          if (isMounted) {
            retryTimeoutId = setTimeout(validateAndCapture, 2000);
          }
          return;
        }

        // Game is ready, capture initial snapshot
        if (isMounted) {
          captureSnapshot();

          // Then capture every 30 seconds
          intervalId = setInterval(captureSnapshot, 30000);
        }
      } catch (error) {
        console.warn('Snapshot validation failed, retrying...', error);
        if (isMounted) {
          retryTimeoutId = setTimeout(validateAndCapture, 2000);
        }
      }
    };

    // Start validation process
    validateAndCapture();

    return () => {
      isMounted = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
      if (retryTimeoutId) {
        clearTimeout(retryTimeoutId);
      }
    };
  }, [isActive, captureSnapshot, scrapeSnapshotData]);

  // Configure game state polling interval from config
  useEffect(() => {
    if (!isLoaded || !config?.gameStatePollInterval) return;

    console.log(`⚙️ Configuring game state poll interval: ${config.gameStatePollInterval}ms`);
    setGameStateInterval(config.gameStatePollInterval);
  }, [isLoaded, config?.gameStatePollInterval, setGameStateInterval]);

  // Track if we've loaded the save for initial attract mode
  const initialSaveLoadedRef = useRef(false);
  // Track if we've loaded the save for this turn
  const turnSaveLoadedRef = useRef(false);

  // Helper function to load save data with retries
  const attemptLoadSave = async (reason) => {
    if (!prefetchedSaveData) {
      console.log(`No prefetched save data for ${reason} - starting fresh game`);
      return;
    }

    console.log(`Loading save for ${reason} (${prefetchedSaveData.length} bytes)...`);

    // Try loading with increasing delays (emulator might need time to fully initialize)
    const delays = [500, 1000, 2000];
    for (let i = 0; i < delays.length; i++) {
      await new Promise(resolve => setTimeout(resolve, delays[i]));

      console.log(`Load attempt ${i + 1}/${delays.length}...`);
      const loaded = loadGame(prefetchedSaveData);

      if (loaded) {
        console.log(`✅ Save state loaded successfully on attempt ${i + 1}!`);
        return;
      }

      console.warn(`Load attempt ${i + 1} failed, ${i < delays.length - 1 ? 'retrying...' : 'giving up'}`);
    }

    console.error('❌ Failed to load save state after all attempts');
  };

  // Load save data on initial emulator load (for attract mode)
  useEffect(() => {
    if (!isLoaded || initialSaveLoadedRef.current) return;

    console.log('Emulator loaded - loading save for attract mode');
    initialSaveLoadedRef.current = true;
    startGame();
    attemptLoadSave('attract mode');
  }, [isLoaded, startGame, loadGame, prefetchedSaveData]);

  // Reload save data when turn becomes active (to discard attract mode changes)
  useEffect(() => {
    if (!isLoaded || !isActive || turnSaveLoadedRef.current) return;

    console.log('Turn starting - reloading save to discard attract mode changes');
    turnSaveLoadedRef.current = true;
    attemptLoadSave('turn start');
  }, [isLoaded, isActive, loadGame, prefetchedSaveData]);

  // Reset turn save flag when turn ends
  useEffect(() => {
    if (!isActive) {
      turnSaveLoadedRef.current = false;
    }
  }, [isActive]);

  // Focus emulator when becoming active - use MutationObserver instead of polling
  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    const focusCanvas = (canvas) => {
      canvas.focus();
      canvas.click();
    };

    // Check if canvas already exists
    const existingCanvas = containerRef.current.querySelector('canvas');
    if (existingCanvas) {
      focusCanvas(existingCanvas);
      return;
    }

    // Use MutationObserver to detect when canvas is added (more efficient than polling)
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeName === 'CANVAS') {
            focusCanvas(node);
            observer.disconnect();
            return;
          }
          // Check if canvas is nested inside added node
          if (node.querySelector) {
            const canvas = node.querySelector('canvas');
            if (canvas) {
              focusCanvas(canvas);
              observer.disconnect();
              return;
            }
          }
        }
      }
    });

    observer.observe(containerRef.current, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [isActive]);

  // Use refs to store callbacks and config so timer is independent of renders
  const captureTurnDataRef = useRef(captureTurnData);
  const onGameEndRef = useRef(onGameEnd);
  const configRef = useRef(config);
  const timerRef = useRef(null);
  const timerStartedRef = useRef(false);

  // Keep refs updated with latest values
  useEffect(() => {
    captureTurnDataRef.current = captureTurnData;
  }, [captureTurnData]);

  useEffect(() => {
    onGameEndRef.current = onGameEnd;
  }, [onGameEnd]);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  // Auto-end game after configured duration - ONLY depends on isActive
  useEffect(() => {
    if (!isActive) {
      // When becoming inactive, clear timer and reset for next turn
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      timerStartedRef.current = false;
      setTurnStartTime(null); // Reset for next turn
      return;
    }

    // Only start timer once per active session
    if (timerStartedRef.current) {
      return;
    }

    const currentConfig = configRef.current;
    if (!currentConfig) {
      return;
    }

    timerStartedRef.current = true;
    const turnDurationMs = (currentConfig.turnDurationMinutes || 3) * 60000;
    const now = new Date();
    setTurnStartTime(now); // Sync display timer with actual timer

    timerRef.current = setTimeout(async () => {
      try {
        await captureTurnDataRef.current();
      } catch (error) {
        console.error('Error during save on timer end:', error);
      }
      // Always call onGameEnd using ref for latest value
      onGameEndRef.current();
    }, turnDurationMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isActive]); // Only depends on isActive!

  // Attract mode: send random inputs when not active (demo mode)
  useEffect(() => {
    // Only run attract mode when emulator is running but turn is not active
    // Need isRunning (not just isLoaded) because gameManager.simulateInput requires game to be started
    if (!isRunning || isActive) {
      return;
    }

    // Wait for gameManager to be fully available before starting attract mode
    let attractInterval = null;
    let checkInterval = null;
    let started = false;

    const startAttractMode = () => {
      if (started) return;
      started = true;

      attractInterval = setInterval(() => {
        const button = getRandomAttractButton();
        simulateKeyPress(button);
      }, 1000);
    };

    // Check if gameManager.simulateInput is available
    const checkReady = () => {
      if (window.EJS_emulator?.gameManager?.simulateInput) {
        if (checkInterval) {
          clearInterval(checkInterval);
          checkInterval = null;
        }
        startAttractMode();
      }
    };

    // Check immediately
    checkReady();

    // If not ready, keep checking every 500ms
    if (!started) {
      checkInterval = setInterval(checkReady, 500);
    }

    return () => {
      if (checkInterval) clearInterval(checkInterval);
      if (attractInterval) clearInterval(attractInterval);
    };
  }, [isRunning, isActive, simulateKeyPress, getRandomAttractButton]);


  if (error) {
    return (
      <div className="game-screen-fullscreen">
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          height: '100vh',
          color: 'white',
          fontSize: '20px',
          flexDirection: 'column',
          gap: '20px'
        }}>
          <h2>Emulator Error</h2>
          <p>{error}</p>
          <button onClick={onGameEnd} style={{
            padding: '10px 20px',
            fontSize: '16px',
            background: '#4a90e2',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}>
            Back to Menu
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="game-screen-fullscreen">
      {/* Title and Timer display - separate component to avoid re-rendering GameScreen */}
      {isActive && (
        <GameTimer
          turnStartTime={turnStartTime}
          turnDurationMinutes={config?.turnDurationMinutes}
        />
      )}
      {/* Previous player message sidebar */}
      {isActive && previousMessage && (
        <div className="game-message-sidebar">
          <div className="game-message-header">Message from previous player:</div>
          <div className="game-message-content">{previousMessage}</div>
        </div>
      )}
      <div className="emulator-wrapper">
        {!isLoaded && (
          <div className="loading-overlay">
            Loading emulator...
          </div>
        )}
        {isSaving && (
          <div className="loading-overlay">
            Saving game data...
          </div>
        )}
        <div 
          ref={containerRef}
          id="emulator-container" 
          className="emulator-container"
          style={{ pointerEvents: isActive ? 'auto' : 'none' }}
        >
          {/* EmulatorJS will take full control of this div */}
        </div>
      </div>
    </div>
  );
});

export default GameScreen;
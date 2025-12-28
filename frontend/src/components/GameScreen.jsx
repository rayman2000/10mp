import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useEmulator } from '../hooks/useEmulator';
import './GameScreen.css';

const GameScreen = ({ player, isActive = true, approved = false, onGameEnd, onTurnDataCaptured, config, previousMessage, prefetchedSaveData }) => {
  const containerRef = useRef(null);
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false); // Ref to avoid recreating captureTurnData callback
  const [turnStartTime, setTurnStartTime] = useState(null); // Set when timer actually starts
  const [timeRemaining, setTimeRemaining] = useState(null); // Time remaining in seconds
  const {
    isLoaded,
    isRunning,
    error,
    startGame,
    saveGame,
    loadGame,
    scrapeData,
    simulateKeyPress,
    getRandomAttractButton
  } = useEmulator(config, approved);

  console.log('GameScreen render:', { isLoaded, isRunning, error });

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
        saveState: saveState || null
      };

      console.log('Turn data captured (will be sent with message):', turnData);

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
  }, [player, turnStartTime, config, saveGame, scrapeData, onTurnDataCaptured]);

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

    console.log(`Loading save for ${reason} (${prefetchedSaveData.length} chars)...`);

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

  // Focus emulator when becoming active or when emulator becomes ready
  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    const focusEmulator = () => {
      const emulatorCanvas = containerRef.current?.querySelector('canvas');
      if (emulatorCanvas) {
        emulatorCanvas.focus();
        emulatorCanvas.click();
        return true;
      }
      return false;
    };

    // Try focusing immediately, then retry a few times if canvas isn't ready
    const focusTimeout = setTimeout(() => {
      if (!focusEmulator()) {
        // Retry with increasing delays
        const retryDelays = [100, 250, 500, 1000];
        retryDelays.forEach((delay, i) => {
          setTimeout(() => focusEmulator(), delay);
        });
      }
    }, 50);

    return () => clearTimeout(focusTimeout);
  }, [isActive, isRunning]);

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
    console.log('Timer effect running:', { isActive, timerStarted: timerStartedRef.current });

    if (!isActive) {
      // When becoming inactive, clear timer and reset for next turn
      if (timerRef.current) {
        console.log('Clearing timer - no longer active');
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      timerStartedRef.current = false;
      setTurnStartTime(null); // Reset for next turn
      return;
    }

    // Only start timer once per active session
    if (timerStartedRef.current) {
      console.log('Timer already started for this session, skipping');
      return;
    }

    const currentConfig = configRef.current;
    if (!currentConfig) {
      console.log('Timer not started: config not yet available');
      return;
    }

    timerStartedRef.current = true;
    const turnDurationMs = (currentConfig.turnDurationMinutes || 3) * 60000;
    const now = new Date();
    setTurnStartTime(now); // Sync display timer with actual timer
    const endTime = new Date(now.getTime() + turnDurationMs);
    console.log(`✅ Timer STARTED: Turn will end in ${currentConfig.turnDurationMinutes || 3} minutes at ${endTime.toLocaleTimeString()}`);

    timerRef.current = setTimeout(async () => {
      console.log('⏰ Timer FIRED! Ending turn...');
      try {
        await captureTurnDataRef.current();
        console.log('Save completed, calling onGameEnd...');
      } catch (error) {
        console.error('Error during save on timer end:', error);
      }
      // Always call onGameEnd using ref for latest value
      onGameEndRef.current();
    }, turnDurationMs);

    return () => {
      if (timerRef.current) {
        console.log('Timer cleanup on unmount');
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

    console.log('Attract mode effect triggered, waiting for gameManager to be ready...');

    // Wait for gameManager to be fully available before starting attract mode
    let attractInterval = null;
    let checkInterval = null;
    let started = false;

    const startAttractMode = () => {
      if (started) return;
      started = true;

      console.log('Starting attract mode - random inputs every 500ms');
      console.log('EJS_emulator available:', !!window.EJS_emulator);
      console.log('gameManager available:', !!window.EJS_emulator?.gameManager);
      console.log('simulateInput available:', !!window.EJS_emulator?.gameManager?.simulateInput);

      attractInterval = setInterval(() => {
        const button = getRandomAttractButton();
        const success = simulateKeyPress(button);
        if (!success) {
          console.log('simulateKeyPress failed for button:', button);
        }
      }, 500);
    };

    // Check if gameManager.simulateInput is available
    const checkReady = () => {
      if (window.EJS_emulator?.gameManager?.simulateInput) {
        console.log('gameManager.simulateInput is ready!');
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
      console.log('Stopping attract mode');
      if (checkInterval) clearInterval(checkInterval);
      if (attractInterval) clearInterval(attractInterval);
    };
  }, [isRunning, isActive, simulateKeyPress, getRandomAttractButton]);

  // Update visible countdown timer every second
  useEffect(() => {
    if (!isActive || !config || !turnStartTime) {
      setTimeRemaining(null);
      return;
    }

    const turnDurationMs = (config.turnDurationMinutes || 3) * 60 * 1000;
    const endTime = turnStartTime.getTime() + turnDurationMs;

    const updateTimer = () => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((endTime - now) / 1000));
      setTimeRemaining(remaining);
    };

    // Update immediately
    updateTimer();

    // Update every second
    const intervalId = setInterval(updateTimer, 1000);

    return () => clearInterval(intervalId);
  }, [isActive, config, turnStartTime]);

  // Format time remaining as MM:SS
  const formatTime = (seconds) => {
    if (seconds === null) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

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
      {/* Title and Timer display */}
      {isActive && timeRemaining !== null && (
        <div className="game-header-overlay">
          <div className="game-title">10 Minute Pokemon</div>
          <div className={`game-timer ${timeRemaining <= 60 ? 'game-timer-warning' : ''}`}>
            {formatTime(timeRemaining)}
          </div>
        </div>
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
};

export default GameScreen;
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import './App.css';
import GameScreen from './components/GameScreen';
import PlayerEntry from './components/PlayerEntry';
import MessageInput from './components/MessageInput';
import ErrorBoundary from './components/ErrorBoundary';
import KioskConnect from './components/KioskConnect';
import { saveApi } from './services/api';

// Stable style object to avoid re-renders
const loadingStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100vh',
  color: 'white',
  fontSize: '20px'
};

function App() {
  const [currentScreen, setCurrentScreen] = useState('connect'); // 'connect', 'entry', 'game', 'message'
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [previousMessage, setPreviousMessage] = useState('Welcome to 10 Minute Pokemon! Make some progress and have fun!');
  const [kioskApproved, setKioskApproved] = useState(false); // Track if kiosk has been approved
  const [prefetchedSaveData, setPrefetchedSaveData] = useState(null); // Pre-fetched save data
  const [saveDataReady, setSaveDataReady] = useState(false); // Track if save fetch is complete
  const [pendingTurnData, setPendingTurnData] = useState(null); // Turn data waiting for message

  // Read config from environment and URL parameters
  const [config, setConfig] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const pollIntervalParam = urlParams.get('pollInterval');

    return {
      turnDurationMinutes: parseInt(import.meta.env.VITE_TURN_DURATION_MINUTES, 10) || 10,
      gameStatePollInterval: pollIntervalParam ? parseInt(pollIntervalParam, 10) : 200
    };
  });

  // Pre-fetch save data when kiosk is approved (before player enters name)
  useEffect(() => {
    if (!kioskApproved || saveDataReady) return;

    const fetchSaveData = async () => {
      const startTime = Date.now();
      try {
        console.log('Pre-fetching save data...');
        const latestSave = await saveApi.getLatestSave();
        console.log('getLatestSave response:', latestSave);

        if (latestSave && latestSave.saveStateUrl) {
          console.log(`Found save from turn ${latestSave.turnId}, downloading from: ${latestSave.saveStateUrl}`);

          // Set the previous player's message if available
          if (latestSave.message) {
            console.log(`Previous player message: "${latestSave.message}"`);
            setPreviousMessage(latestSave.message);
          } else {
            console.log('No message from previous player');
          }

          const saveData = await saveApi.downloadSave(latestSave.saveStateUrl);
          console.log('Downloaded save data:', saveData ? `${saveData.byteLength} bytes` : 'null');

          if (saveData) {
            // Store as Uint8Array directly - no Base64 encoding needed
            const uint8Array = new Uint8Array(saveData);
            console.log(`✅ Save data pre-fetched: ${uint8Array.length} bytes in ${Date.now() - startTime}ms`);
            setPrefetchedSaveData(uint8Array);
          } else {
            console.warn('Downloaded save data was empty');
          }
        } else {
          console.log('No previous save found - will start fresh');
        }
      } catch (error) {
        if (error.response?.status === 404) {
          console.log('No previous save found (404) - will start fresh');
        } else {
          console.error('Error pre-fetching save:', error);
          console.error('Error details:', error.response?.data, error.response?.status);
        }
      } finally {
        console.log(`Save data fetch complete in ${Date.now() - startTime}ms`);
        setSaveDataReady(true);
      }
    };

    fetchSaveData();
  }, [kioskApproved, saveDataReady]);

  // Handler for successful kiosk activation
  const handleKioskActivated = useCallback((kioskConfig = {}) => {
    console.log('Kiosk activated', kioskConfig);

    // Update config with kiosk-provided settings
    if (kioskConfig.pollInterval) {
      setConfig(prev => ({
        ...prev,
        gameStatePollInterval: kioskConfig.pollInterval
      }));
      console.log(`⚙️ Poll interval set from kiosk: ${kioskConfig.pollInterval}ms`);
    }

    setKioskApproved(true); // Mark kiosk as approved (triggers save pre-fetch)
    // Move to player entry screen
    setCurrentScreen('entry');
  }, []);

  // Handler for game end - memoized to prevent timer resets
  const handleGameEnd = useCallback(() => {
    setCurrentScreen('message');
  }, []);

  // Memoized callback for starting game
  const handleStartGame = useCallback((playerName) => {
    setCurrentPlayer(playerName);
    setCurrentScreen('game');
  }, []);

  // Memoized callback for message submission
  const handleMessageSubmit = useCallback((message) => {
    setPreviousMessage(message);
    // Pass the captured save state to the next turn
    setPendingTurnData(prev => {
      if (prev?.saveState) {
        setPrefetchedSaveData(prev.saveState);
      }
      return null; // Clear after submission
    });
    setCurrentScreen('entry');
  }, []);

  // Memoized error boundary reset
  const handleErrorReset = useCallback(() => {
    setCurrentScreen('entry');
  }, []);

  return (
    <div className="App">
      {/* Keep GameScreen mounted once approved to preserve emulator state between turns */}
      {/* Always visible - attract mode shows game behind overlay screens */}
      {kioskApproved && (
        <ErrorBoundary onReset={handleErrorReset}>
          <GameScreen
            player={currentPlayer}
            isActive={currentScreen === 'game'}
            approved={true}
            onGameEnd={handleGameEnd}
            onTurnDataCaptured={setPendingTurnData}
            config={config}
            previousMessage={previousMessage}
            prefetchedSaveData={prefetchedSaveData}
          />
        </ErrorBoundary>
      )}
      
      {/* Overlay screens when not in game mode */}
      {currentScreen === 'connect' && (
        <div className="screen-overlay">
          <KioskConnect onConnect={handleKioskActivated} />
        </div>
      )}

      {currentScreen === 'entry' && saveDataReady && (
        <div className="screen-overlay">
          <PlayerEntry
            previousMessage={previousMessage}
            saveDataReady={saveDataReady}
            onStartGame={handleStartGame}
          />
        </div>
      )}

      {currentScreen === 'entry' && !saveDataReady && (
        <div className="screen-overlay">
          <div style={loadingStyle}>
            <div>Loading game data...</div>
          </div>
        </div>
      )}
      
      {currentScreen === 'message' && (
        <div className="screen-overlay">
          <MessageInput
            player={currentPlayer}
            pendingTurnData={pendingTurnData}
            onMessageSubmit={handleMessageSubmit}
          />
        </div>
      )}
    </div>
  );
}

export default App;
import React, { useState, useCallback, useEffect } from 'react';
import './App.css';
import GameScreen from './components/GameScreen';
import PlayerEntry from './components/PlayerEntry';
import MessageInput from './components/MessageInput';
import ErrorBoundary from './components/ErrorBoundary';
import KioskConnect from './components/KioskConnect';
import { saveApi } from './services/api';

function App() {
  const [currentScreen, setCurrentScreen] = useState('connect'); // 'connect', 'entry', 'game', 'message'
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [previousMessage, setPreviousMessage] = useState('Welcome to 10 Minute Pokemon! Make some progress and have fun!');
  const [kioskApproved, setKioskApproved] = useState(false); // Track if kiosk has been approved
  const [prefetchedSaveData, setPrefetchedSaveData] = useState(null); // Pre-fetched save data
  const [saveDataReady, setSaveDataReady] = useState(false); // Track if save fetch is complete
  const [config, setConfig] = useState({
    turnDurationMinutes: 10,
    autoSaveIntervalMinutes: 1
  });

  // Pre-fetch save data when kiosk is approved (before player enters name)
  useEffect(() => {
    if (!kioskApproved || saveDataReady) return;

    const fetchSaveData = async () => {
      try {
        console.log('Pre-fetching save data...');
        const latestSave = await saveApi.getLatestSave();

        if (latestSave && latestSave.saveStateUrl) {
          console.log(`Found save from turn ${latestSave.turnId}, downloading...`);
          const saveData = await saveApi.downloadSave(latestSave.saveStateUrl);

          if (saveData) {
            // Convert to base64 for the emulator
            const base64 = btoa(
              new Uint8Array(saveData).reduce((data, byte) => data + String.fromCharCode(byte), '')
            );
            console.log(`Save data pre-fetched: ${base64.length} chars`);
            setPrefetchedSaveData(base64);
          }
        } else {
          console.log('No previous save found - will start fresh');
        }
      } catch (error) {
        if (error.response?.status === 404) {
          console.log('No previous save found - will start fresh');
        } else {
          console.error('Error pre-fetching save:', error);
        }
      } finally {
        setSaveDataReady(true);
      }
    };

    fetchSaveData();
  }, [kioskApproved, saveDataReady]);

  // Handler for successful kiosk activation
  const handleKioskActivated = useCallback(() => {
    console.log('Kiosk activated');
    setKioskApproved(true); // Mark kiosk as approved (triggers save pre-fetch)
    // Move to player entry screen
    setCurrentScreen('entry');
  }, []);

  // Handler for game end - memoized to prevent timer resets
  const handleGameEnd = useCallback(() => {
    setCurrentScreen('message');
  }, []);

  return (
    <div className="App">
      {/* Only render GameScreen when game is active - emulator starts when player enters name */}
      {currentScreen === 'game' && (
        <ErrorBoundary onReset={() => setCurrentScreen('entry')}>
          <GameScreen
            player={currentPlayer}
            isActive={true}
            approved={true}
            onGameEnd={handleGameEnd}
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

      {currentScreen === 'entry' && (
        <div className="screen-overlay">
          <PlayerEntry
            previousMessage={previousMessage}
            onStartGame={(playerName) => {
              setCurrentPlayer(playerName);
              setCurrentScreen('game');
            }}
          />
        </div>
      )}
      
      {currentScreen === 'message' && (
        <div className="screen-overlay">
          <MessageInput
            player={currentPlayer}
            onMessageSubmit={(message) => {
              setPreviousMessage(message);
              setCurrentScreen('entry');
            }}
          />
        </div>
      )}
    </div>
  );
}

export default App;
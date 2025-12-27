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
  const [pendingTurnData, setPendingTurnData] = useState(null); // Turn data waiting for message
  const [config, setConfig] = useState({
    turnDurationMinutes: 10,
    autoSaveIntervalMinutes: 1
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
            // Convert to base64 for the emulator
            const base64 = btoa(
              new Uint8Array(saveData).reduce((data, byte) => data + String.fromCharCode(byte), '')
            );
            console.log(`✅ Save data pre-fetched: ${base64.length} chars in ${Date.now() - startTime}ms`);
            setPrefetchedSaveData(base64);
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
      {/* Keep GameScreen mounted once approved to preserve emulator state between turns */}
      {kioskApproved && (
        <div style={{ display: currentScreen === 'game' ? 'block' : 'none' }}>
          <ErrorBoundary onReset={() => setCurrentScreen('entry')}>
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
        </div>
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
            onStartGame={(playerName) => {
              setCurrentPlayer(playerName);
              setCurrentScreen('game');
            }}
          />
        </div>
      )}

      {currentScreen === 'entry' && !saveDataReady && (
        <div className="screen-overlay">
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            color: 'white',
            fontSize: '20px'
          }}>
            <div>Loading game data...</div>
          </div>
        </div>
      )}
      
      {currentScreen === 'message' && (
        <div className="screen-overlay">
          <MessageInput
            player={currentPlayer}
            pendingTurnData={pendingTurnData}
            onMessageSubmit={(message) => {
              setPreviousMessage(message);
              // Pass the captured save state to the next turn
              if (pendingTurnData?.saveState) {
                setPrefetchedSaveData(pendingTurnData.saveState);
              }
              setPendingTurnData(null); // Clear after submission
              setCurrentScreen('entry');
            }}
          />
        </div>
      )}
    </div>
  );
}

export default App;
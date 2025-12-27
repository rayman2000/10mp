import React, { useState, useCallback } from 'react';
import './App.css';
import GameScreen from './components/GameScreen';
import PlayerEntry from './components/PlayerEntry';
import MessageInput from './components/MessageInput';
import ErrorBoundary from './components/ErrorBoundary';
import KioskConnect from './components/KioskConnect';

function App() {
  const [currentScreen, setCurrentScreen] = useState('connect'); // 'connect', 'entry', 'game', 'message'
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [previousMessage, setPreviousMessage] = useState('Welcome to 10 Minute Pokemon! Make some progress and have fun!');
  const [kioskApproved, setKioskApproved] = useState(false); // Track if kiosk has been approved
  const [config, setConfig] = useState({
    turnDurationMinutes: 10,
    autoSaveIntervalMinutes: 1
  });

  // Handler for successful kiosk activation
  const handleKioskActivated = useCallback(() => {
    console.log('Kiosk activated');
    setKioskApproved(true); // Mark kiosk as approved
    // Move to player entry screen
    setCurrentScreen('entry');
  }, []);

  // Handler for game end - memoized to prevent timer resets
  const handleGameEnd = useCallback(() => {
    setCurrentScreen('message');
  }, []);

  return (
    <div className="App">
      {/* Always render GameScreen but make it interactive only when current screen is 'game' */}
      <ErrorBoundary onReset={() => setCurrentScreen('entry')}>
        <GameScreen
          player={currentPlayer}
          isActive={currentScreen === 'game'}
          approved={kioskApproved}
          onGameEnd={handleGameEnd}
          config={config}
          previousMessage={previousMessage}
        />
      </ErrorBoundary>
      
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
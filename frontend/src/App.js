import React, { useState, useEffect } from 'react';
import './App.css';
import GameScreen from './components/GameScreen';
import PlayerEntry from './components/PlayerEntry';
import MessageInput from './components/MessageInput';
import ErrorBoundary from './components/ErrorBoundary';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

function App() {
  const [currentScreen, setCurrentScreen] = useState('entry'); // 'entry', 'game', 'message'
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [previousMessage, setPreviousMessage] = useState('Welcome to 10 Minute Pokemon! Make some progress and have fun!');
  const [backendOnline, setBackendOnline] = useState(true);
  const [config, setConfig] = useState({
    turnDurationMinutes: 10,
    autoSaveIntervalMinutes: 1,
    defaultSessionId: 'main-game'
  });

  // Fetch config on mount
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/config`);
        if (response.ok) {
          const configData = await response.json();
          setConfig(configData);
          console.log('Configuration loaded:', configData);
        }
      } catch (error) {
        console.error('Failed to fetch config, using defaults:', error);
      }
    };

    fetchConfig();
  }, []);

  // Health check polling
  useEffect(() => {
    const checkBackendHealth = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/health`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        setBackendOnline(response.ok);
      } catch (error) {
        console.error('Backend health check failed:', error);
        setBackendOnline(false);
      }
    };

    // Check immediately on mount
    checkBackendHealth();

    // Then check every 30 seconds
    const intervalId = setInterval(checkBackendHealth, 30000);

    return () => clearInterval(intervalId);
  }, []);

  return (
    <div className="App">
      {/* Backend connectivity warning */}
      {!backendOnline && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          backgroundColor: '#ff4444',
          color: 'white',
          padding: '10px',
          textAlign: 'center',
          zIndex: 10000,
          fontWeight: 'bold'
        }}>
          ⚠️ Backend server is offline. Game progress will not be saved.
        </div>
      )}

      {/* Always render GameScreen but make it interactive only when current screen is 'game' */}
      <ErrorBoundary onReset={() => setCurrentScreen('entry')}>
        <GameScreen
          player={currentPlayer}
          isActive={currentScreen === 'game'}
          onGameEnd={() => setCurrentScreen('message')}
          config={config}
        />
      </ErrorBoundary>
      
      {/* Overlay screens when not in game mode */}
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
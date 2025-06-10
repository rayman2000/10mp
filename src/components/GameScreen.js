import React, { useEffect, useRef } from 'react';
import { useEmulator } from '../hooks/useEmulator';
import './GameScreen.css';

const GameScreen = ({ player, onGameEnd }) => {
  const containerRef = useRef(null);
  const {
    isLoaded,
    isRunning,
    error,
    startGame
  } = useEmulator();

  console.log('GameScreen render:', { isLoaded, isRunning, error });

  useEffect(() => {
    if (isLoaded) {
      startGame();
    }
  }, [isLoaded]);

  // Auto-end game after 30 seconds (testing)
  useEffect(() => {
    const timer = setTimeout(() => {
      onGameEnd();
    }, 30000); // 30 seconds for testing

    return () => clearTimeout(timer);
  }, [onGameEnd]);

  // Manual game end with escape key
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === 'Escape') {
        onGameEnd();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [onGameEnd]);

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
      <div className="emulator-wrapper">
        {!isLoaded && (
          <div className="loading-overlay">
            Loading emulator...
          </div>
        )}
        <div 
          ref={containerRef}
          id="emulator-container" 
          className="emulator-container"
        >
          {/* EmulatorJS will take full control of this div */}
        </div>
      </div>
    </div>
  );
};

export default GameScreen;
import React, { useEffect, useRef } from 'react';
import { useEmulator } from '../hooks/useEmulator';
import './GameScreen.css';

const GameScreen = ({ player, isActive = true, onGameEnd }) => {
  const containerRef = useRef(null);
  const {
    isLoaded,
    isRunning,
    error,
    startGame,
    scrapeData
  } = useEmulator();

  console.log('GameScreen render:', { isLoaded, isRunning, error });

  useEffect(() => {
    if (isLoaded) {
      startGame();
    }
  }, [isLoaded]);

  // Focus emulator when becoming active to ensure immediate input
  useEffect(() => {
    if (isActive && containerRef.current) {
      const emulatorCanvas = containerRef.current.querySelector('canvas');
      if (emulatorCanvas) {
        // Small delay to ensure DOM is ready
        setTimeout(() => {
          emulatorCanvas.focus();
          emulatorCanvas.click();
        }, 50);
      }
    }
  }, [isActive]);

  // Auto-end game after 10 minutes - only when active
  useEffect(() => {
    if (!isActive) return;
    
    const timer = setTimeout(() => {
      onGameEnd();
    }, 600000); // 10 minutes

    return () => clearTimeout(timer);
  }, [onGameEnd, isActive]);

  // Manual game end with escape key - only when active
  useEffect(() => {
    if (!isActive) return;
    
    const handleKeyPress = (e) => {
      if (e.key === 'Escape') {
        onGameEnd();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [onGameEnd, isActive]);

  // Scrape game data every minute when active and save to file
  useEffect(() => {
    console.log('Scraping effect triggered:', { isActive, isLoaded, player });
    
    if (!isActive || !isLoaded) {
      console.log('Skipping scraping setup - not active or not loaded');
      return;
    }
    
    console.log('Setting up data scraping interval...');
    
    const scrapeInterval = setInterval(async () => {
      console.log('Running periodic scrape...');
      try {
        const gameData = await scrapeData();
        console.log('Scraped data result:', gameData);
        if (gameData) {
          await saveGameDataToFile(gameData, player);
        }
      } catch (error) {
        console.error('Error during data scraping:', error);
      }
    }, 60000); // Every minute

    // Also scrape immediately when becoming active
    const initialScrape = async () => {
      console.log('Running initial scrape...');
      try {
        const gameData = await scrapeData();
        console.log('Initial scrape result:', gameData);
        if (gameData) {
          await saveGameDataToFile(gameData, player);
        }
      } catch (error) {
        console.error('Error during initial scraping:', error);
      }
    };
    
    // Delay initial scrape to let emulator fully load
    console.log('Setting up initial scrape in 5 seconds...');
    setTimeout(initialScrape, 5000);

    return () => {
      console.log('Cleaning up scraping interval');
      clearInterval(scrapeInterval);
    };
  }, [isActive, isLoaded, scrapeData, player]);

  // Function to log game data to console
  const saveGameDataToFile = async (gameData, playerName) => {
    try {
      const timestamp = new Date().toISOString();
      
      const dataWithPlayer = {
        ...gameData,
        currentPlayer: playerName,
        scrapeTime: timestamp
      };
      
      console.log('=== POKEMON GAME DATA ===');
      console.log(`Player: ${playerName}`);
      console.log(`Time: ${timestamp}`);
      console.log('Data:', JSON.stringify(dataWithPlayer, null, 2));
      console.log('========================');
      
    } catch (error) {
      console.error('Error logging game data:', error);
    }
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
    <div className={`game-screen-fullscreen ${!isActive ? 'game-screen-inactive' : ''}`}>
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
          style={{ pointerEvents: isActive ? 'auto' : 'none' }}
        >
          {/* EmulatorJS will take full control of this div */}
        </div>
      </div>
    </div>
  );
};

export default GameScreen;
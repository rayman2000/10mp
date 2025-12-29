import React, { useState, useEffect, useRef, memo } from 'react';
import './PlayerEntry.css';

const PlayerEntry = memo(({ previousMessage, onStartGame, saveDataReady = true }) => {
  const [playerName, setPlayerName] = useState('');
  const inputRef = useRef(null);

  // Focus input on mount with a delay to override emulator focus
  useEffect(() => {
    const focusInput = () => inputRef.current?.focus();
    // Immediate focus
    focusInput();
    // Delayed focus to override any competing focus
    const timer = setTimeout(focusInput, 100);
    return () => clearTimeout(timer);
  }, []);

  const canStart = playerName.trim() && saveDataReady;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (canStart) {
      onStartGame(playerName.trim());
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && canStart) {
      onStartGame(playerName.trim());
    }
  };

  return (
    <div className="player-entry">
      <div className="entry-container">
        <div className="game-header">
          <h1>10 Minute Pokemon</h1>
          <p className="tagline">Join our collaborative pokemon adventure and win a fancy badge!</p>
        </div>

        <div className="previous-message">
          <h2>Message from the previous player:</h2>
          <p>{previousMessage}</p>
        </div>

        <div className="name-form">
          <label htmlFor="playerName">Enter your name and press Enter:</label>
          <input
            ref={inputRef}
            type="text"
            id="playerName"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            onKeyPress={handleKeyPress}
            maxLength={20}
            placeholder="Your name"
            disabled={!saveDataReady}
          />
          {!saveDataReady && (
            <div className="save-loading-indicator">
              Loading save data...
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default PlayerEntry;
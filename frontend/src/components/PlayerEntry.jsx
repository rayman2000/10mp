import React, { useState } from 'react';
import './PlayerEntry.css';

const PlayerEntry = ({ previousMessage, onStartGame }) => {
  const [playerName, setPlayerName] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (playerName.trim()) {
      onStartGame(playerName.trim());
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && playerName.trim()) {
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
          <p>"{previousMessage}"</p>
        </div>
        
        <div className="name-form">
          <label htmlFor="playerName">Enter your name and press Enter:</label>
          <input
            type="text"
            id="playerName"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            onKeyPress={handleKeyPress}
            maxLength={20}
            placeholder="Your name"
            autoFocus
          />
        </div>
      </div>
    </div>
  );
};

export default PlayerEntry;
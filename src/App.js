import React, { useState } from 'react';
import './App.css';
import GameScreen from './components/GameScreen';
import PlayerEntry from './components/PlayerEntry';
import MessageInput from './components/MessageInput';

function App() {
  const [currentScreen, setCurrentScreen] = useState('entry'); // 'entry', 'game', 'message'
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [previousMessage, setPreviousMessage] = useState('Welcome to 10 Minute Pokemon! Make some progress and have fun!');

  return (
    <div className="App">
      {/* Always render GameScreen but make it interactive only when current screen is 'game' */}
      <GameScreen 
        player={currentPlayer}
        isActive={currentScreen === 'game'}
        onGameEnd={() => setCurrentScreen('message')}
      />
      
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
import React, { useState } from 'react';
import './App.css';
import GameScreen from './components/GameScreen';
import PlayerEntry from './components/PlayerEntry';
import MessageInput from './components/MessageInput';

function App() {
  const [currentScreen, setCurrentScreen] = useState('entry'); // 'entry', 'game', 'message'
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [previousMessage, setPreviousMessage] = useState('Welcome to 10 Minute Pokemon! Make some progress and have fun!');

  const screens = {
    entry: <PlayerEntry 
      previousMessage={previousMessage}
      onStartGame={(playerName) => {
        setCurrentPlayer(playerName);
        setCurrentScreen('game');
      }}
    />,
    game: <GameScreen 
      player={currentPlayer}
      onGameEnd={() => setCurrentScreen('message')}
    />,
    message: <MessageInput
      player={currentPlayer}
      onMessageSubmit={(message) => {
        setPreviousMessage(message);
        setCurrentScreen('entry');
      }}
    />
  };

  return (
    <div className="App">
      {screens[currentScreen]}
    </div>
  );
}

export default App;
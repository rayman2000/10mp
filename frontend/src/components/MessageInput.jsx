import React, { useState, useEffect, useRef } from 'react';
import './MessageInput.css';

const MessageInput = ({ player, onMessageSubmit }) => {
  const [message, setMessage] = useState('');
  const textareaRef = useRef(null);

  // Focus textarea on mount with a delay to override emulator focus
  useEffect(() => {
    const focusInput = () => textareaRef.current?.focus();
    // Immediate focus
    focusInput();
    // Delayed focus to override any competing focus
    const timer = setTimeout(focusInput, 100);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    const finalMessage = message.trim() || `${player} played their turn!`;
    onMessageSubmit(finalMessage);
  };

  return (
    <div className="message-input-screen">
      <div className="message-container">
        <h2>Thanks for playing, {player}!</h2>
        <p>Your 10 minutes are up. Leave a message for the next player:</p>
        
        <form onSubmit={handleSubmit} className="message-form">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={200}
            placeholder="Share a tip, hint, or message for the next player..."
            rows={4}
          />
          <div className="char-counter">
            {message.length}/200 characters
          </div>
          <button type="submit">
            Submit & Pass Turn
          </button>
        </form>
      </div>
    </div>
  );
};

export default MessageInput;
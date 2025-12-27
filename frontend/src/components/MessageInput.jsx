import React, { useState, useEffect, useRef } from 'react';
import { gameApi } from '../services/api';
import './MessageInput.css';

const MessageInput = ({ player, pendingTurnData, onMessageSubmit }) => {
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    const finalMessage = message.trim() || `${player} played their turn!`;
    setIsSubmitting(true);

    try {
      // Save turn data with message to backend
      if (pendingTurnData) {
        const turnDataWithMessage = {
          ...pendingTurnData,
          message: finalMessage
        };
        console.log('Saving turn data with message:', turnDataWithMessage);
        await gameApi.saveGameTurn(turnDataWithMessage);
        console.log('Turn data saved successfully!');
      } else {
        console.warn('No pending turn data to save');
      }

      onMessageSubmit(finalMessage);
    } catch (error) {
      console.error('Failed to save turn data:', error);
      // Still proceed to next screen even if save fails
      onMessageSubmit(finalMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !isSubmitting) {
      e.preventDefault();
      handleSubmit(e);
    }
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
            onKeyDown={handleKeyDown}
            maxLength={200}
            placeholder="Share a tip, hint, or message for the next player..."
            rows={4}
          />
          <div className="char-counter">
            {message.length}/200 characters
          </div>
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Submit & Pass Turn'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default MessageInput;
import { useState, useEffect, useRef } from 'react';
import EmulatorManager from '../utils/emulator';

export const useEmulator = (config = {}, approved = false) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [gameData, setGameData] = useState(null);
  const [error, setError] = useState(null);

  const emulatorRef = useRef(null);

  useEffect(() => {
    // Don't initialize emulator until approved
    if (!approved) {
      console.log('Emulator initialization blocked - waiting for admin approval');
      return;
    }

    let mounted = true;

    const initEmulator = async () => {
      try {
        if (!mounted) return;

        console.log('Emulator initialization approved - loading ROM and emulator');
        emulatorRef.current = new EmulatorManager(config);
        const success = await emulatorRef.current.initialize();

        if (!mounted) return;

        if (success) {
          setIsLoaded(true);
          setError(null);
        } else {
          setError('Failed to initialize emulator');
        }
      } catch (err) {
        if (mounted) {
          setError(err.message);
        }
      }
    };

    initEmulator();

    return () => {
      mounted = false;
      if (emulatorRef.current) {
        try {
          emulatorRef.current.destroy();
        } catch (e) {
          console.log('Error during emulator cleanup:', e);
        }
        emulatorRef.current = null;
      }
      // Reset states on unmount
      setIsLoaded(false);
      setIsRunning(false);
      setError(null);
    };
  }, [approved]);

  const startGame = () => {
    if (emulatorRef.current && isLoaded) {
      emulatorRef.current.startGame();
      setIsRunning(true);
    }
  };

  const pauseGame = () => {
    if (emulatorRef.current) {
      emulatorRef.current.pauseGame();
      setIsRunning(false);
    }
  };

  const saveGame = () => {
    if (emulatorRef.current) {
      return emulatorRef.current.saveState();
    }
    return null;
  };

  const loadGame = (saveData) => {
    if (emulatorRef.current) {
      return emulatorRef.current.loadState(saveData);
    }
    return false;
  };

  const scrapeData = async () => {
    if (emulatorRef.current) {
      const data = await emulatorRef.current.scrapeGameData();
      setGameData(data);
      return data;
    }
    return null;
  };

  const setAutoSaveCallback = (callback) => {
    if (emulatorRef.current) {
      emulatorRef.current.setAutoSaveCallback(callback);
    }
  };

  return {
    isLoaded,
    isRunning,
    gameData,
    error,
    startGame,
    pauseGame,
    saveGame,
    loadGame,
    scrapeData,
    setAutoSaveCallback
  };
};
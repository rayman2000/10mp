import { useState, useEffect, useRef, useCallback } from 'react';
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

  const startGame = useCallback(() => {
    if (emulatorRef.current) {
      emulatorRef.current.startGame();
      setIsRunning(true);
    }
  }, []);

  const pauseGame = useCallback(() => {
    if (emulatorRef.current) {
      emulatorRef.current.pauseGame();
      setIsRunning(false);
    }
  }, []);

  const resumeGame = useCallback(() => {
    if (emulatorRef.current) {
      emulatorRef.current.resumeGame();
      setIsRunning(true);
    }
  }, []);

  const saveGame = useCallback(() => {
    if (emulatorRef.current) {
      return emulatorRef.current.saveState();
    }
    return null;
  }, []);

  const loadGame = useCallback((saveData) => {
    if (emulatorRef.current) {
      return emulatorRef.current.loadState(saveData);
    }
    return false;
  }, []);

  const scrapeData = useCallback(async () => {
    if (emulatorRef.current) {
      const data = await emulatorRef.current.scrapeGameData();
      setGameData(data);
      return data;
    }
    return null;
  }, []);

  const setAutoSaveCallback = useCallback((callback) => {
    if (emulatorRef.current) {
      emulatorRef.current.setAutoSaveCallback(callback);
    }
  }, []);

  // Debug function to test memory access - call from browser console
  const debugMemory = useCallback(() => {
    if (emulatorRef.current) {
      return emulatorRef.current.debugMemoryAccess();
    }
    console.log('Emulator not initialized');
    return null;
  }, []);

  // Expose debug function globally for easy console access
  useEffect(() => {
    if (emulatorRef.current) {
      window.debugEmulatorMemory = () => {
        if (emulatorRef.current) {
          return emulatorRef.current.debugMemoryAccess();
        }
        return 'Emulator not available';
      };
      window.emulatorInstance = emulatorRef.current;
    }
    return () => {
      delete window.debugEmulatorMemory;
      delete window.emulatorInstance;
    };
  }, [isLoaded]);

  return {
    isLoaded,
    isRunning,
    gameData,
    error,
    startGame,
    pauseGame,
    resumeGame,
    saveGame,
    loadGame,
    scrapeData,
    setAutoSaveCallback,
    debugMemory
  };
};
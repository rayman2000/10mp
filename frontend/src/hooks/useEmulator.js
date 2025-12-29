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
      // Emulator cleanup
      if (emulatorRef.current) {
        emulatorRef.current.destroy();
      }
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

  const scrapeSnapshotData = useCallback(async () => {
    if (emulatorRef.current) {
      return await emulatorRef.current.scrapeSnapshotData();
    }
    return null;
  }, []);

  // Debug function to test memory access - call from browser console
  const debugMemory = useCallback(() => {
    if (emulatorRef.current) {
      return emulatorRef.current.debugMemoryAccess();
    }
    console.log('Emulator not initialized');
    return null;
  }, []);

  // Simulate a button press (for attract mode)
  const simulateKeyPress = useCallback((button) => {
    if (emulatorRef.current) {
      return emulatorRef.current.simulateKeyPress(button);
    }
    return false;
  }, []);

  // Get a random button for attract mode
  const getRandomAttractButton = useCallback(() => {
    if (emulatorRef.current) {
      return emulatorRef.current.getRandomAttractButton();
    }
    // Fallback if emulator not ready
    const buttons = ['a', 'b', 'up', 'down', 'left', 'right'];
    return buttons[Math.floor(Math.random() * buttons.length)];
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
    scrapeSnapshotData,
    debugMemory,
    simulateKeyPress,
    getRandomAttractButton
  };
};
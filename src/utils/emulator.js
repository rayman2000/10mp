// EmulatorJS integration utilities following official documentation
class EmulatorManager {
  constructor() {
    this.isRunning = false;
    this.gameState = null;
    this.saveStateInterval = null;
    this.scriptLoaded = false;
  }

  clearPreviousInstance() {
    console.log('Clearing previous EmulatorJS instance...');
    
    // Clear the container first
    const container = document.getElementById('emulator-container');
    if (container) {
      container.innerHTML = '';
    }
    
    // Don't clear essential config variables, just cleanup
    if (window.EJS_onLoaded) delete window.EJS_onLoaded;
    if (window.EJS_onGameStart) delete window.EJS_onGameStart;
    if (window.EJS_onError) delete window.EJS_onError;
    
    // Reset flags
    this.scriptLoaded = false;
    this.isRunning = false;
  }

  async initialize() {
    try {
      console.log('Starting EmulatorJS initialization...');
      
      // Check if container exists
      const container = document.getElementById('emulator-container');
      if (!container) {
        throw new Error('Emulator container not found');
      }

      // Clear any existing content and reset container
      container.innerHTML = '';
      container.style.display = 'block';
      
      // Clear any existing EmulatorJS instances/globals
      this.clearPreviousInstance();
      
      // Set up EmulatorJS configuration exactly as per documentation
      console.log('Setting up EmulatorJS configuration...');
      window.EJS_player = '#emulator-container';
      window.EJS_core = 'gba';
      window.EJS_gameUrl = '/emulator/pokemon-firered.gba';
      window.EJS_pathtodata = 'https://cdn.emulatorjs.org/stable/data/';
      
      // Optional configurations - disable controls to auto-start
      window.EJS_volume = 0.5;
      window.EJS_color = '#4a90e2';
      window.EJS_backgroundColor = '#1a1a2e';
      window.EJS_startOnLoaded = true; // Auto-start when loaded
      window.EJS_controls = false; // Hide start button
      
      // Debug callbacks with better error handling
      window.EJS_onLoaded = () => {
        console.log('✅ EmulatorJS loaded successfully');
        this.isRunning = true;
      };
      
      window.EJS_onGameStart = () => {
        console.log('✅ Game started successfully');
        this.startAutoSave();
      };
      
      window.EJS_onError = (error) => {
        console.error('❌ EmulatorJS Error:', error);
      };

      // Add global error handler to catch script errors
      window.addEventListener('error', (e) => {
        if (e.filename && e.filename.includes('emulator')) {
          console.error('EmulatorJS Script Error:', {
            message: e.message,
            filename: e.filename,
            lineno: e.lineno,
            colno: e.colno,
            error: e.error
          });
        }
      });

      // Load the EmulatorJS script
      try {
        await this.loadEmulatorScript();
        console.log('Script loaded, waiting for initialization...');
        
        // Wait for initialization to complete
        await this.waitForInitialization();
        
        console.log('✅ EmulatorJS initialization complete');
        return true;
      } catch (scriptError) {
        console.error('Script loading or initialization failed:', scriptError);
        throw new Error(`EmulatorJS failed to load: ${scriptError.message}`);
      }
      
    } catch (error) {
      console.error('❌ Failed to initialize emulator:', error);
      return false;
    }
  }

  loadEmulatorScript() {
    return new Promise((resolve, reject) => {
      // For second cycle, just resolve if we think it's already loaded
      if (this.scriptLoaded) {
        console.log('EmulatorJS script marked as already loaded, proceeding...');
        resolve();
        return;
      }
      
      // Remove any existing script to force fresh load
      const existingScript = document.getElementById('emulatorjs-loader');
      if (existingScript) {
        console.log('Removing existing EmulatorJS script...');
        existingScript.remove();
      }
      
      console.log('Loading fresh EmulatorJS script...');
      const script = document.createElement('script');
      script.src = 'https://cdn.emulatorjs.org/stable/data/loader.js';
      script.id = 'emulatorjs-loader';
      
      script.onload = () => {
        console.log('EmulatorJS script loaded successfully');
        this.scriptLoaded = true;
        setTimeout(resolve, 1000); // Longer delay for stability
      };
      
      script.onerror = (e) => {
        console.error('Script loading failed:', e);
        reject(new Error('Failed to load EmulatorJS script from CDN'));
      };
      
      document.head.appendChild(script);
    });
  }

  waitForInitialization() {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const maxAttempts = 60; // Increased timeout for ROM loading
      
      const checkInterval = setInterval(() => {
        attempts++;
        console.log(`Waiting for EmulatorJS initialization... ${attempts}/${maxAttempts}`);
        
        // Check if the container has been populated by EmulatorJS
        const container = document.getElementById('emulator-container');
        if (container && (container.children.length > 0 || container.innerHTML.trim().length > 50)) {
          console.log('✅ EmulatorJS container populated');
          clearInterval(checkInterval);
          resolve();
          return;
        }
        
        // Also check if EmulatorJS callbacks were called
        if (this.isRunning) {
          console.log('✅ EmulatorJS running confirmed via callback');
          clearInterval(checkInterval);
          resolve();
          return;
        }
        
        if (attempts >= maxAttempts) {
          clearInterval(checkInterval);
          reject(new Error('EmulatorJS initialization timeout - ROM may be too large or CDN is slow'));
        }
      }, 1000); // Increased interval
    });
  }

  startGame() {
    // EmulatorJS handles this automatically when loaded
    console.log('Game start requested - EmulatorJS should handle this automatically');
  }

  pauseGame() {
    // This would need to interface with EmulatorJS pause functionality
    console.log('Game pause requested');
  }

  saveState() {
    // This would need to interface with EmulatorJS save state functionality
    try {
      // EmulatorJS save state API would go here
      console.log('Save state requested');
      return null; // Placeholder
    } catch (error) {
      console.error('Failed to save game state:', error);
      return null;
    }
  }

  loadState(stateData) {
    // This would need to interface with EmulatorJS load state functionality
    try {
      console.log('Load state requested');
      return false; // Placeholder
    } catch (error) {
      console.error('Failed to load game state:', error);
      return false;
    }
  }

  startAutoSave() {
    this.saveStateInterval = setInterval(() => {
      this.saveState();
    }, 10000); // Save every 10 seconds
  }

  stopAutoSave() {
    if (this.saveStateInterval) {
      clearInterval(this.saveStateInterval);
      this.saveStateInterval = null;
    }
  }

  // ROM scraping methods (placeholder for Pokemon Fire Red data)
  async scrapeGameData() {
    if (!this.isRunning) {
      return null;
    }

    try {
      // Mock data for now - real implementation would read from emulator memory
      const gameData = {
        playerName: 'ASH', // Would read from memory
        location: 'Pallet Town', // Would read from memory
        badges: 0, // Would read from memory
        playtime: {
          hours: 0,
          minutes: 5,
          seconds: 30
        },
        party: [], // Would read Pokemon party data
        money: 3000 // Would read from memory
      };

      return gameData;
    } catch (error) {
      console.error('Failed to scrape game data:', error);
      return null;
    }
  }

  destroy() {
    console.log('Destroying emulator instance...');
    this.stopAutoSave();
    this.isRunning = false;
    
    // Clear the container more safely
    const container = document.getElementById('emulator-container');
    if (container) {
      try {
        container.innerHTML = '';
      } catch (e) {
        console.log('Error clearing container:', e);
      }
    }
    
    // Clear callbacks but keep config
    if (window.EJS_onLoaded) delete window.EJS_onLoaded;
    if (window.EJS_onGameStart) delete window.EJS_onGameStart;
    if (window.EJS_onError) delete window.EJS_onError;
    
    // Reset internal state
    this.scriptLoaded = false;
  }
}

export default EmulatorManager;
// EmulatorJS integration utilities following official documentation
class EmulatorManager {
  constructor(config = {}) {
    this.isRunning = false;
    this.gameState = null;
    this.saveStateInterval = null;
    this.scriptLoaded = false;
    this.config = config;
    this.autoSaveIntervalMs = (config.autoSaveIntervalMinutes || 1) * 60000;
    this.autoSaveCallback = null; // Callback for auto-save uploads
    console.log(`EmulatorManager initialized with auto-save interval: ${config.autoSaveIntervalMinutes || 1} minutes`);
  }

  setAutoSaveCallback(callback) {
    this.autoSaveCallback = callback;
    console.log('Auto-save callback registered');
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
      
      // Wait a bit for React to render the container
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check if container exists
      const container = document.getElementById('emulator-container');
      if (!container) {
        throw new Error('Emulator container not found');
      }

      console.log('Container found:', container);
      
      // Clear any existing EmulatorJS instances/globals first
      this.clearPreviousInstance();
      
      // Ensure container is properly set up
      container.innerHTML = '';
      container.style.display = 'block';
      container.style.width = '100%';
      container.style.height = '100%';
      
      // Set up EmulatorJS configuration exactly as per documentation
      console.log('Setting up EmulatorJS configuration...');
      window.EJS_player = '#emulator-container';
      window.EJS_core = 'gba';
      window.EJS_gameUrl = process.env.REACT_APP_ROM_PATH || '/emulator/pokemon-firered.gba';
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
        console.log('Module available:', typeof window.Module !== 'undefined');
        console.log('Container still exists:', !!document.getElementById('emulator-container'));
        // Don't set isRunning here, wait for game start
      };
      
      window.EJS_onGameStart = () => {
        console.log('✅ Game started successfully');
        this.isRunning = true; // Set isRunning when game actually starts
        console.log('EmulatorManager isRunning set to:', this.isRunning);
        
        if (window.EJS_emulator && window.EJS_emulator.Module) {
          console.log('EJS_emulator.Module available:', !!window.EJS_emulator.Module);
          console.log('Module HEAPU8:', !!window.EJS_emulator.Module.HEAPU8);
          console.log('Module HEAPU16:', !!window.EJS_emulator.Module.HEAPU16);
          console.log('Module HEAPU32:', !!window.EJS_emulator.Module.HEAPU32);
          if (window.EJS_emulator.Module.HEAPU8) {
            console.log('Memory access working! HEAPU8 length:', window.EJS_emulator.Module.HEAPU8.length);
          }
        }
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
    try {
      if (!window.EJS_emulator) {
        console.warn('EJS_emulator not available for save state');
        return null;
      }

      console.log('Attempting to save game state...');

      // EmulatorJS provides save state functionality through the emulator instance
      // The exact API may vary, so we try multiple approaches
      let saveData = null;

      // Method 1: Direct saveState function
      if (typeof window.EJS_emulator.saveState === 'function') {
        saveData = window.EJS_emulator.saveState();
        console.log('Save state created via EJS_emulator.saveState()');
      }
      // Method 2: GameManager API
      else if (window.EJS_emulator.gameManager && typeof window.EJS_emulator.gameManager.saveState === 'function') {
        saveData = window.EJS_emulator.gameManager.saveState();
        console.log('Save state created via gameManager.saveState()');
      }
      // Method 3: Direct FS access (RetroArch cores)
      else if (window.EJS_emulator.Module && window.EJS_emulator.Module.FS) {
        try {
          const FS = window.EJS_emulator.Module.FS;
          // RetroArch typically saves to /home/web_user/retroarch/userdata/states/
          const savePath = '/home/web_user/retroarch/userdata/states/game.state';
          if (FS.analyzePath(savePath).exists) {
            saveData = FS.readFile(savePath);
            console.log('Save state read from FS:', savePath);
          } else {
            console.warn('Save file not found at:', savePath);
          }
        } catch (fsError) {
          console.warn('FS access failed:', fsError);
        }
      }

      if (saveData) {
        // Convert to Base64 for easier transport
        if (saveData instanceof Uint8Array) {
          const base64 = btoa(String.fromCharCode.apply(null, saveData));
          console.log(`Save state captured: ${base64.length} chars (Base64)`);
          return base64;
        } else if (typeof saveData === 'string') {
          console.log(`Save state captured: ${saveData.length} chars`);
          return saveData;
        }
      }

      console.warn('No save state data could be retrieved');
      return null;
    } catch (error) {
      console.error('Failed to save game state:', error);
      return null;
    }
  }

  loadState(stateData) {
    try {
      if (!window.EJS_emulator || !stateData) {
        console.warn('EJS_emulator not available or no state data provided');
        return false;
      }

      console.log('Attempting to load game state...');

      // Convert Base64 back to Uint8Array if needed
      let data = stateData;
      if (typeof stateData === 'string' && stateData.length > 0) {
        try {
          // Try to decode as Base64
          const binaryString = atob(stateData);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          data = bytes;
          console.log('Converted Base64 to Uint8Array:', data.length, 'bytes');
        } catch (decodeError) {
          console.warn('Not Base64 encoded, using as-is');
        }
      }

      // Method 1: Direct loadState function
      if (typeof window.EJS_emulator.loadState === 'function') {
        window.EJS_emulator.loadState(data);
        console.log('Save state loaded via EJS_emulator.loadState()');
        return true;
      }
      // Method 2: GameManager API
      else if (window.EJS_emulator.gameManager && typeof window.EJS_emulator.gameManager.loadState === 'function') {
        window.EJS_emulator.gameManager.loadState(data);
        console.log('Save state loaded via gameManager.loadState()');
        return true;
      }
      // Method 3: Direct FS write (RetroArch cores)
      else if (window.EJS_emulator.Module && window.EJS_emulator.Module.FS && data instanceof Uint8Array) {
        try {
          const FS = window.EJS_emulator.Module.FS;
          const savePath = '/home/web_user/retroarch/userdata/states/game.state';

          // Ensure directory exists
          const dirPath = '/home/web_user/retroarch/userdata/states';
          if (!FS.analyzePath(dirPath).exists) {
            FS.mkdirTree(dirPath);
          }

          FS.writeFile(savePath, data);
          console.log('Save state written to FS:', savePath);

          // Trigger load if there's a load function
          if (window.EJS_emulator.Module._cmd_load_state) {
            window.EJS_emulator.Module._cmd_load_state();
          }

          return true;
        } catch (fsError) {
          console.error('FS write failed:', fsError);
          return false;
        }
      }

      console.warn('No supported load state method available');
      return false;
    } catch (error) {
      console.error('Failed to load game state:', error);
      return false;
    }
  }

  startAutoSave() {
    console.log(`Starting auto-save with interval: ${this.autoSaveIntervalMs}ms`);
    this.saveStateInterval = setInterval(() => {
      const saveData = this.saveState();

      // Call callback if provided and save data exists
      if (this.autoSaveCallback && saveData) {
        this.autoSaveCallback(saveData);
      }
    }, this.autoSaveIntervalMs);
  }

  stopAutoSave() {
    if (this.saveStateInterval) {
      clearInterval(this.saveStateInterval);
      this.saveStateInterval = null;
    }
  }

  // ROM scraping methods for Pokemon Fire Red data
  async scrapeGameData() {
    console.log('scrapeGameData called, isRunning:', this.isRunning);
    
    if (!this.isRunning) {
      console.log('Emulator not running, returning null');
      return null;
    }

    try {
      console.log('Attempting to scrape game data...');
      
      // Access EmulatorJS memory through Module interface
      const gameData = {
        timestamp: new Date().toISOString(),
        playerName: this.readPlayerName(),
        location: this.readCurrentLocation(),
        badges: this.readBadgeCount(),
        playtime: this.readPlaytime(),
        party: this.readPartyData(),
        money: this.readMoney()
      };

      console.log('Raw scraped game data:', gameData);
      
      return gameData;
    } catch (error) {
      console.error('Failed to scrape game data:', error);
      return null;
    }
  }

  // Helper function to get memory access
  getMemoryArray(type = 'HEAPU8') {
    // Try multiple ways to access memory
    if (window.EJS_emulator && window.EJS_emulator.Module && window.EJS_emulator.Module[type]) {
      return window.EJS_emulator.Module[type];
    } else if (window.Module && window.Module[type]) {
      return window.Module[type];
    }
    return null;
  }

  // Helper methods to read specific memory addresses
  readPlayerName() {
    try {
      const memoryArray = this.getMemoryArray('HEAPU8');
      if (!memoryArray) {
        return 'MEMORY_NOT_READY';
      }
      
      const nameAddr = 0x02025734;
      const nameBytes = [];
      
      // Read up to 7 characters (Pokemon name limit)
      for (let i = 0; i < 7; i++) {
        const byte = memoryArray[nameAddr + i];
        if (byte === 0xFF || byte === 0x00) break; // End of string
        nameBytes.push(byte);
      }
      
      // Convert Pokemon character encoding to ASCII (simplified)
      return this.convertPokemonText(nameBytes);
    } catch (error) {
      console.error('Error reading player name:', error);
      return 'ERROR';
    }
  }

  readCurrentLocation() {
    try {
      const memoryArray = this.getMemoryArray('HEAPU8');
      if (!memoryArray) {
        return 'MEMORY_NOT_READY';
      }
      
      const locationAddr = 0x02036E38;
      const mapId = memoryArray[locationAddr];
      
      // Map some common Fire Red location IDs
      const locationMap = {
        0: 'Pallet Town',
        1: 'Viridian City',
        2: 'Pewter City',
        3: 'Cerulean City',
        4: 'Vermilion City',
        5: 'Lavender Town',
        6: 'Celadon City',
        7: 'Fuchsia City',
        8: 'Cinnabar Island',
        9: 'Indigo Plateau'
      };
      
      return locationMap[mapId] || `Unknown (ID: ${mapId})`;
    } catch (error) {
      console.error('Error reading location:', error);
      return 'ERROR';
    }
  }

  readBadgeCount() {
    try {
      const memoryArray = this.getMemoryArray('HEAPU8');
      if (!memoryArray) {
        return 0;
      }
      
      const badgeAddr = 0x02024E80;
      const badgeFlags = memoryArray[badgeAddr];
      
      // Count set bits (each bit represents a badge)
      let count = 0;
      for (let i = 0; i < 8; i++) {
        if (badgeFlags & (1 << i)) count++;
      }
      
      return count;
    } catch (error) {
      console.error('Error reading badge count:', error);
      return 0;
    }
  }

  readPlaytime() {
    try {
      const memoryArray8 = this.getMemoryArray('HEAPU8');
      const memoryArray16 = this.getMemoryArray('HEAPU16');
      if (!memoryArray8 || !memoryArray16) {
        return { hours: 0, minutes: 0, seconds: 0 };
      }
      
      const timeAddr = 0x02024E60;
      const hours = memoryArray16[timeAddr / 2];
      const minutes = memoryArray8[timeAddr + 2];
      const seconds = memoryArray8[timeAddr + 3];
      
      return { hours, minutes, seconds };
    } catch (error) {
      console.error('Error reading playtime:', error);
      return { hours: 0, minutes: 0, seconds: 0 };
    }
  }

  readMoney() {
    try {
      const memoryArray = this.getMemoryArray('HEAPU32');
      if (!memoryArray) {
        return 0;
      }
      
      const moneyAddr = 0x0202452C;
      return memoryArray[moneyAddr / 4];
    } catch (error) {
      console.error('Error reading money:', error);
      return 0;
    }
  }

  readPartyData() {
    try {
      const memoryArray = this.getMemoryArray('HEAPU8');
      if (!memoryArray) {
        return [];
      }
      
      // This is a simplified version - full party data is complex
      const partyCountAddr = 0x02024284;
      const partyCount = memoryArray[partyCountAddr];
      
      return Array(Math.min(partyCount, 6)).fill(null).map((_, i) => ({
        slot: i + 1,
        species: 'Unknown', // Would need species ID lookup
        level: 1, // Would need to read level data
        nickname: 'Pokemon' // Would need to read nickname
      }));
    } catch (error) {
      console.error('Error reading party data:', error);
      return [];
    }
  }

  // Convert Pokemon character encoding to readable text (simplified)
  convertPokemonText(bytes) {
    // Pokemon Fire Red uses a custom character encoding
    // This is a simplified conversion - full implementation would need complete character map
    const charMap = {
      0xBB: 'A', 0xBC: 'B', 0xBD: 'C', 0xBE: 'D', 0xBF: 'E', 0xC0: 'F',
      0xC1: 'G', 0xC2: 'H', 0xC3: 'I', 0xC4: 'J', 0xC5: 'K', 0xC6: 'L',
      0xC7: 'M', 0xC8: 'N', 0xC9: 'O', 0xCA: 'P', 0xCB: 'Q', 0xCC: 'R',
      0xCD: 'S', 0xCE: 'T', 0xCF: 'U', 0xD0: 'V', 0xD1: 'W', 0xD2: 'X',
      0xD3: 'Y', 0xD4: 'Z'
    };
    
    return bytes.map(byte => charMap[byte] || '?').join('');
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
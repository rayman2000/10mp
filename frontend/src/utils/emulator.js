// EmulatorJS integration utilities following official documentation
// Global flag to track if script is loaded (persists across instances)
window.__EMULATORJS_SCRIPT_LOADED__ = window.__EMULATORJS_SCRIPT_LOADED__ || false;

class EmulatorManager {
  constructor(config = {}) {
    this.isRunning = false;
    this.gameState = null;
    this.saveStateInterval = null;
    this.config = config;
    this.autoSaveIntervalMs = (config.autoSaveIntervalMinutes || 1) * 60000;
    this.autoSaveCallback = null; // Callback for auto-save uploads
    // Storage for captured save data from EmulatorJS callbacks
    this.lastSaveState = null;
    this.lastScreenshot = null;
    this.lastSaveData = null;
    console.log(`EmulatorManager initialized with auto-save interval: ${config.autoSaveIntervalMinutes || 1} minutes`);
  }

  // Helper to convert ArrayBuffer/Uint8Array to Base64
  arrayBufferToBase64(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
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

    // Clear all EmulatorJS global variables and callbacks
    const ejsGlobals = [
      'EJS_player',
      'EJS_core',
      'EJS_gameUrl',
      'EJS_pathtodata',
      'EJS_volume',
      'EJS_color',
      'EJS_backgroundColor',
      'EJS_startOnLoaded',
      'EJS_controls',
      'EJS_onLoaded',
      'EJS_onGameStart',
      'EJS_onError',
      'EJS_emulator',
      'EJS_gameManager'
    ];

    ejsGlobals.forEach(key => {
      if (window[key] !== undefined) {
        delete window[key];
      }
    });

    // Reset flags
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
        }
        this.startAutoSave();
      };

      // Capture save state data when user saves or game auto-saves
      window.EJS_onSaveState = (data) => {
        console.log('✅ EJS_onSaveState fired!', data);
        if (data && data.length >= 2) {
          this.lastScreenshot = data[0]; // Screenshot
          this.lastSaveState = data[1];  // Save state data
          console.log('Save state captured:', this.lastSaveState?.length, 'bytes');
        }
      };

      // Capture game save updates (battery saves, etc.)
      window.EJS_onSaveUpdate = (saveInfo) => {
        console.log('✅ EJS_onSaveUpdate fired!', saveInfo);
        if (saveInfo) {
          this.lastSaveData = {
            hash: saveInfo.hash,
            save: saveInfo.save,
            screenshot: saveInfo.screenshot,
            format: saveInfo.format
          };
          console.log('Save data captured:', this.lastSaveData.save?.length, 'bytes');

          // Call the auto-save callback if registered
          if (this.autoSaveCallback && saveInfo.save) {
            const base64 = this.arrayBufferToBase64(saveInfo.save);
            this.autoSaveCallback(base64);
          }
        }
      };

      window.EJS_onError = (error) => {
        console.error('❌ EmulatorJS Error:', error);
      };

      // Enable fixed save interval to trigger EJS_onSaveUpdate periodically
      window.EJS_fixedSaveInterval = this.autoSaveIntervalMs;

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
      // Check if script is already loaded globally
      if (window.__EMULATORJS_SCRIPT_LOADED__) {
        console.log('EmulatorJS script already loaded globally, reusing...');
        // Wait a bit to ensure the library is ready
        setTimeout(resolve, 500);
        return;
      }

      // Check if script tag already exists in DOM
      const existingScript = document.getElementById('emulatorjs-loader');
      if (existingScript) {
        console.log('EmulatorJS script tag already in DOM, marking as loaded...');
        window.__EMULATORJS_SCRIPT_LOADED__ = true;
        setTimeout(resolve, 500);
        return;
      }

      console.log('Loading EmulatorJS script for the first time...');
      const script = document.createElement('script');
      script.src = 'https://cdn.emulatorjs.org/stable/data/loader.js';
      script.id = 'emulatorjs-loader';

      script.onload = () => {
        console.log('EmulatorJS script loaded successfully');
        window.__EMULATORJS_SCRIPT_LOADED__ = true;
        setTimeout(resolve, 1000); // Longer delay for stability
      };

      script.onerror = (e) => {
        console.error('Script loading failed:', e);
        window.__EMULATORJS_SCRIPT_LOADED__ = false;
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
      console.log('Capturing emulator save state (snapshot)...');

      // Try to get a save state snapshot from EmulatorJS
      let stateData = null;

      // Method 1: gameManager.getState() - returns the save state
      if (window.EJS_emulator?.gameManager?.getState) {
        try {
          console.log('Trying gameManager.getState()...');
          stateData = window.EJS_emulator.gameManager.getState();
          if (stateData) {
            console.log(`Got state via gameManager.getState(): ${stateData.byteLength || stateData.length} bytes`);
          }
        } catch (e) {
          console.log('gameManager.getState() failed:', e.message);
        }
      }

      // Method 2: EJS_emulator.getState()
      if (!stateData && window.EJS_emulator?.getState) {
        try {
          console.log('Trying EJS_emulator.getState()...');
          stateData = window.EJS_emulator.getState();
          if (stateData) {
            console.log(`Got state via EJS_emulator.getState(): ${stateData.byteLength || stateData.length} bytes`);
          }
        } catch (e) {
          console.log('EJS_emulator.getState() failed:', e.message);
        }
      }

      // Method 3: Try to trigger save state via keyboard shortcut simulation and capture via callback
      if (!stateData && this.lastSaveState) {
        console.log('Using last captured save state from callback');
        stateData = this.lastSaveState;
      }

      if (stateData) {
        const base64 = this.arrayBufferToBase64(stateData);
        console.log(`✅ Save state captured: ${base64.length} chars (Base64)`);
        return base64;
      }

      console.warn('Could not capture save state - no method available');
      return null;
    } catch (error) {
      console.error('Failed to capture save state:', error);
      return null;
    }
  }

  loadState(stateData) {
    try {
      if (!window.EJS_emulator || !stateData) {
        console.warn('EJS_emulator not available or no state data provided');
        return false;
      }

      console.log('Loading emulator save state (snapshot)...');

      // Convert Base64 back to Uint8Array if needed
      let data = stateData;
      if (typeof stateData === 'string' && stateData.length > 0) {
        try {
          const binaryString = atob(stateData);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          data = bytes;
          console.log('Converted Base64 to Uint8Array:', data.length, 'bytes');
        } catch (decodeError) {
          console.warn('Base64 decode failed:', decodeError.message);
          return false;
        }
      }

      // Method 1: gameManager.loadState() - primary method for save states
      if (window.EJS_emulator.gameManager?.loadState) {
        try {
          console.log('Loading state via gameManager.loadState()...');
          window.EJS_emulator.gameManager.loadState(data);
          console.log('✅ Save state loaded via gameManager.loadState()');
          return true;
        } catch (e) {
          console.log('gameManager.loadState() failed:', e.message);
        }
      }

      // Method 2: EJS_emulator.loadState()
      if (typeof window.EJS_emulator.loadState === 'function') {
        try {
          console.log('Loading state via EJS_emulator.loadState()...');
          window.EJS_emulator.loadState(data);
          console.log('✅ Save state loaded via EJS_emulator.loadState()');
          return true;
        } catch (e) {
          console.log('EJS_emulator.loadState() failed:', e.message);
        }
      }

      // Method 3: Direct Module call if available
      if (window.EJS_emulator.Module) {
        // Try writing to state file and triggering load
        try {
          const FS = window.EJS_emulator.Module.FS;
          if (FS) {
            const statePath = '/state.state';
            FS.writeFile(statePath, data);
            console.log(`Wrote state to ${statePath}`);

            // Try to trigger state load
            if (window.EJS_emulator.Module._cmd_load_state) {
              window.EJS_emulator.Module._cmd_load_state();
              console.log('✅ Triggered _cmd_load_state');
              return true;
            }
          }
        } catch (e) {
          console.log('Module FS method failed:', e.message);
        }
      }

      console.warn('No supported save state load method available');
      console.log('Available on EJS_emulator:', Object.keys(window.EJS_emulator || {}).slice(0, 20));
      if (window.EJS_emulator?.gameManager) {
        console.log('Available on gameManager:', Object.keys(window.EJS_emulator.gameManager).slice(0, 20));
      }
      return false;
    } catch (error) {
      console.error('Failed to load save state:', error);
      return false;
    }
  }

  startAutoSave() {
    // Auto-save is now handled by EJS_fixedSaveInterval and EJS_onSaveUpdate callback
    // which is set during initialization. This method is kept for compatibility.
    console.log(`Auto-save configured via EJS_fixedSaveInterval: ${this.autoSaveIntervalMs}ms`);
    console.log('EJS_onSaveUpdate will trigger autoSaveCallback when game saves');
  }

  stopAutoSave() {
    // No interval to stop since EJS handles it, but clear any legacy interval
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
    // Try multiple ways to access memory (EmulatorJS 4.0+ uses gameManager)
    if (window.EJS_emulator?.gameManager?.Module?.[type]) {
      return window.EJS_emulator.gameManager.Module[type];
    } else if (window.EJS_emulator?.Module?.[type]) {
      return window.EJS_emulator.Module[type];
    } else if (window.Module?.[type]) {
      return window.Module[type];
    }
    return null;
  }

  // Get the Module object from EmulatorJS
  getModule() {
    if (window.EJS_emulator?.gameManager?.Module) {
      return window.EJS_emulator.gameManager.Module;
    } else if (window.EJS_emulator?.Module) {
      return window.EJS_emulator.Module;
    } else if (window.Module) {
      return window.Module;
    }
    return null;
  }

  // Cache for system RAM info to avoid repeated ccall overhead
  _systemRAMCache = null;
  _systemRAMCacheTime = 0;
  _CACHE_TTL_MS = 1000; // Refresh cache every second
  // Cached GBA memory base found by heap scanning (fallback when retro API unavailable)
  _gbaMemoryBase = null;
  // Flag to avoid repeatedly trying retro API if it's not available
  _retroAPIUnavailable = false;

  // Get GBA system RAM pointer via RetroArch API
  // Returns { pointer, size } or null if unavailable
  getSystemRAM() {
    // If we already know retro API is unavailable, don't try again
    if (this._retroAPIUnavailable) {
      return null;
    }

    // Check cache first
    const now = Date.now();
    if (this._systemRAMCache && (now - this._systemRAMCacheTime) < this._CACHE_TTL_MS) {
      return this._systemRAMCache;
    }

    const Module = this.getModule();
    if (!Module) {
      return null;
    }

    try {
      // RETRO_MEMORY_SYSTEM_RAM = 2
      const RETRO_MEMORY_SYSTEM_RAM = 2;

      // Try to get memory pointer using ccall
      if (typeof Module.ccall === 'function') {
        try {
          const pointer = Module.ccall('retro_get_memory_data', 'number', ['number'], [RETRO_MEMORY_SYSTEM_RAM]);
          const size = Module.ccall('retro_get_memory_size', 'number', ['number'], [RETRO_MEMORY_SYSTEM_RAM]);

          if (pointer && size > 0) {
            console.log(`Got system RAM: pointer=0x${pointer.toString(16)}, size=0x${size.toString(16)} (${size} bytes)`);
            this._systemRAMCache = { pointer, size };
            this._systemRAMCacheTime = now;
            return this._systemRAMCache;
          }
        } catch (e) {
          // ccall failed, continue to next method
        }
      }

      // Try alternative function names with underscore prefix
      if (typeof Module._retro_get_memory_data === 'function') {
        const pointer = Module._retro_get_memory_data(RETRO_MEMORY_SYSTEM_RAM);
        const size = Module._retro_get_memory_size(RETRO_MEMORY_SYSTEM_RAM);

        if (pointer && size > 0) {
          console.log(`Got system RAM (alt): pointer=0x${pointer.toString(16)}, size=0x${size.toString(16)}`);
          this._systemRAMCache = { pointer, size };
          this._systemRAMCacheTime = now;
          return this._systemRAMCache;
        }
      }

      // Mark as unavailable to stop trying
      this._retroAPIUnavailable = true;
      console.log('RetroArch memory API not available, using heap scanning fallback');
      return null;
    } catch (error) {
      this._retroAPIUnavailable = true;
      return null;
    }
  }

  // Debug function to test memory access from browser console
  // Usage: window.debugEmulatorMemory()
  debugMemoryAccess() {
    console.log('=== EmulatorJS Memory Access Debug ===');

    const Module = this.getModule();
    console.log('Module available:', !!Module);

    if (Module) {
      // List all available functions/properties
      const keys = Object.keys(Module);
      console.log('Module keys count:', keys.length);
      console.log('Module keys (first 30):', keys.slice(0, 30));

      // Look for memory-related functions
      const memoryFuncs = keys.filter(k =>
        k.toLowerCase().includes('memory') ||
        k.toLowerCase().includes('heap') ||
        k.toLowerCase().includes('ram') ||
        k.toLowerCase().includes('wram') ||
        k.startsWith('_')
      );
      console.log('Memory-related keys:', memoryFuncs);

      console.log('ccall available:', typeof Module.ccall === 'function');
      console.log('cwrap available:', typeof Module.cwrap === 'function');
      console.log('HEAPU8 available:', !!Module.HEAPU8);
      console.log('HEAP8 available:', !!Module.HEAP8);

      if (Module.HEAPU8) {
        console.log('HEAPU8 length:', Module.HEAPU8.length, '(', (Module.HEAPU8.length / 1024 / 1024).toFixed(2), 'MB)');
      }

      // Check for asm exports
      if (Module.asm) {
        const asmKeys = Object.keys(Module.asm);
        console.log('asm exports count:', asmKeys.length);
        const memAsmFuncs = asmKeys.filter(k =>
          k.toLowerCase().includes('memory') ||
          k.toLowerCase().includes('ram') ||
          k.includes('retro')
        );
        console.log('Memory-related asm exports:', memAsmFuncs);
      }
    }

    // Check gameManager
    const gameManager = window.EJS_emulator?.gameManager;
    if (gameManager) {
      console.log('\n--- GameManager ---');
      console.log('gameManager keys:', Object.keys(gameManager));

      // Check for functions that might give us memory access
      if (typeof gameManager.getState === 'function') {
        console.log('getState available');
      }
    }

    // Try save state parsing method
    console.log('\n--- Save State Memory Access ---');
    const memInfo = this.getMemoryFromSaveState();
    if (memInfo) {
      console.log('Successfully parsed save state memory!');
      console.log('EWRAM base in state:', memInfo.ewramBase);
      console.log('IWRAM base in state:', memInfo.iwramBase);
      this.testMemoryReads();
    } else {
      console.log('Save state parsing failed, trying RetroArch API...');
      const systemRAM = this.getSystemRAM();
      console.log('System RAM via retro API:', systemRAM);

      if (systemRAM) {
        this.testMemoryReads();
      } else {
        console.log('No memory access method available');
      }
    }

    return 'Debug complete - check console for results';
  }

  // Extract memory from save state instead of heap scanning
  // Save states contain serialized GBA memory that we can parse
  _cachedSaveStateMemory = null;
  _saveStateMemoryTime = 0;

  // Get GBA memory by parsing the current save state
  getMemoryFromSaveState() {
    const now = Date.now();
    // Cache for 500ms to avoid constant state captures
    if (this._cachedSaveStateMemory && (now - this._saveStateMemoryTime) < 500) {
      return this._cachedSaveStateMemory;
    }

    try {
      const gameManager = window.EJS_emulator?.gameManager;
      if (!gameManager?.getState) {
        console.log('getState not available');
        return null;
      }

      const stateData = gameManager.getState();
      if (!stateData || stateData.length < 0x50000) {
        console.log('Save state too small or empty:', stateData?.length);
        return null;
      }

      // mGBA save state format contains memory regions
      // We need to find EWRAM (256KB) and IWRAM (32KB) within the state
      // The state format varies, but memory is usually at predictable offsets

      // Try to locate memory by searching for patterns
      const state = new Uint8Array(stateData);

      // Log state info for debugging
      console.log('Save state size:', state.length, 'bytes');

      // Debug: Show first bytes of save state to understand format
      const header = Array.from(state.slice(0, 32)).map(b => b.toString(16).padStart(2, '0')).join(' ');
      console.log('Save state header:', header);

      // Check if it's a known format (mGBA uses "mGBA" magic, etc.)
      const magic = String.fromCharCode(state[0], state[1], state[2], state[3]);
      console.log('Magic bytes:', magic);

      // Strategy: Search for EWRAM/IWRAM patterns
      // Look for any 4-byte value that looks like a valid EWRAM pointer (0x0202XXXX)
      let ewramBase = -1;
      let iwramBase = -1;

      // First, find all potential EWRAM pointers in the state
      const potentialPointers = [];
      for (let i = 0; i < state.length - 4; i += 4) {
        const val = state[i] | (state[i+1] << 8) | (state[i+2] << 16) | (state[i+3] << 24);
        // Look for EWRAM pointers (0x0202XXXX is common for saveblocks)
        if ((val >>> 0) >= 0x02020000 && (val >>> 0) <= 0x0203FFFF) {
          potentialPointers.push({ offset: i, value: val >>> 0 });
        }
      }

      console.log(`Found ${potentialPointers.length} potential EWRAM pointers`);
      if (potentialPointers.length > 0 && potentialPointers.length < 50) {
        console.log('First few pointers:', potentialPointers.slice(0, 10).map(p =>
          `0x${p.offset.toString(16)}: 0x${p.value.toString(16)}`
        ));
      }

      // Try to find IWRAM by looking for consecutive saveblock pointers
      // They should be at offsets 0x5008 and 0x500C from IWRAM base
      for (const p of potentialPointers) {
        // If this pointer is at offset 0x5008 within a 32KB region, check for another at 0x500C
        const possibleIWRAMBase = p.offset - 0x5008;
        if (possibleIWRAMBase >= 0 && possibleIWRAMBase + 0x8000 <= state.length) {
          const ptr2Offset = possibleIWRAMBase + 0x500C;
          if (ptr2Offset + 4 <= state.length) {
            const ptr2 = state[ptr2Offset] | (state[ptr2Offset+1] << 8) |
                        (state[ptr2Offset+2] << 16) | (state[ptr2Offset+3] << 24);
            if ((ptr2 >>> 0) >= 0x02020000 && (ptr2 >>> 0) <= 0x0203FFFF) {
              console.log(`Found IWRAM candidate at 0x${possibleIWRAMBase.toString(16)}`);
              console.log(`  SB1 (0x5008) = 0x${p.value.toString(16)}`);
              console.log(`  SB2 (0x500C) = 0x${(ptr2 >>> 0).toString(16)}`);
              iwramBase = possibleIWRAMBase;
              break;
            }
          }
        }
      }

      // If still not found, try a different approach: look for 256KB aligned regions
      if (iwramBase === -1) {
        console.log('Trying aligned region search...');
        // EWRAM is 256KB, IWRAM is 32KB
        // In the save state, they might be at specific offsets
        // Common mGBA layout: header + EWRAM (256KB) + IWRAM (32KB) + other

        // Try common offsets where EWRAM might start
        const tryOffsets = [0x40, 0x100, 0x200, 0x1000];
        for (const offset of tryOffsets) {
          if (offset + 0x40000 + 0x8000 <= state.length) {
            // Check if offset + 0x40000 looks like IWRAM start
            const testIWRAM = offset + 0x40000;
            const ptr1 = state[testIWRAM + 0x5008] | (state[testIWRAM + 0x5008 + 1] << 8) |
                        (state[testIWRAM + 0x5008 + 2] << 16) | (state[testIWRAM + 0x5008 + 3] << 24);
            const ptr2 = state[testIWRAM + 0x500C] | (state[testIWRAM + 0x500C + 1] << 8) |
                        (state[testIWRAM + 0x500C + 2] << 16) | (state[testIWRAM + 0x500C + 3] << 24);

            console.log(`Offset 0x${offset.toString(16)}: EWRAM, testing IWRAM at 0x${testIWRAM.toString(16)}`);
            console.log(`  ptr1=0x${(ptr1>>>0).toString(16)}, ptr2=0x${(ptr2>>>0).toString(16)}`);

            if ((ptr1 >>> 0) >= 0x02000000 && (ptr1 >>> 0) <= 0x0203FFFF &&
                (ptr2 >>> 0) >= 0x02000000 && (ptr2 >>> 0) <= 0x0203FFFF) {
              ewramBase = offset;
              iwramBase = testIWRAM;
              console.log(`Found memory layout! EWRAM at 0x${ewramBase.toString(16)}, IWRAM at 0x${iwramBase.toString(16)}`);
              break;
            }
          }
        }
      }

      if (iwramBase === -1) {
        console.log('Could not find IWRAM in save state');
        return null;
      }

      // EWRAM is usually before or after IWRAM in the state
      // In mGBA, it's typically at a fixed offset from IWRAM
      // Try common layouts:
      // 1. EWRAM immediately before IWRAM
      // 2. EWRAM at a fixed offset

      // Most likely: EWRAM is 256KB, so check if iwramBase - 0x40000 is valid
      if (iwramBase >= 0x40000) {
        ewramBase = iwramBase - 0x40000;
        console.log(`Assuming EWRAM at state offset 0x${ewramBase.toString(16)} (before IWRAM)`);
      } else {
        // Try after IWRAM
        ewramBase = iwramBase + 0x8000; // After 32KB IWRAM
        console.log(`Assuming EWRAM at state offset 0x${ewramBase.toString(16)} (after IWRAM)`);
      }

      // Verify by checking if the saveblock pointer points to valid data
      const sb1Ptr = state[iwramBase + 0x5008] |
                     (state[iwramBase + 0x5008 + 1] << 8) |
                     (state[iwramBase + 0x5008 + 2] << 16) |
                     (state[iwramBase + 0x5008 + 3] << 24);

      const sb1Offset = sb1Ptr - 0x02000000; // Offset within EWRAM
      const flagsOffset = sb1Offset + 0x0580 + 0x104; // Badge flags location

      console.log(`SB1 points to EWRAM offset 0x${sb1Offset.toString(16)}, flags at 0x${flagsOffset.toString(16)}`);

      if (ewramBase + flagsOffset < state.length) {
        const badgeFlags = state[ewramBase + flagsOffset];
        console.log(`Badge flags from state: 0x${badgeFlags.toString(16)}`);
      }

      this._cachedSaveStateMemory = {
        state,
        ewramBase,
        iwramBase
      };
      this._saveStateMemoryTime = now;

      return this._cachedSaveStateMemory;
    } catch (error) {
      console.error('Error extracting memory from save state:', error);
      return null;
    }
  }

  // Legacy heap scanning - kept as backup
  findGBAMemoryBase() {
    // Heap scanning is unreliable, prefer save state parsing
    return null;
  }

  testMemoryReads() {
    console.log('\n--- Test reads ---');
    console.log('Map bank (0x02031DBC):', this.readGBAByte(0x02031DBC));
    console.log('Map number (0x02031DBD):', this.readGBAByte(0x02031DBD));
    console.log('SB1 pointer (0x03005008):', this.readGBADword(0x03005008)?.toString(16));
    console.log('SB2 pointer (0x0300500C):', this.readGBADword(0x0300500C)?.toString(16));

    // Try scraping game data
    console.log('\n--- Game Data ---');
    console.log('Location:', this.readCurrentLocation());
    console.log('Badges:', this.readBadgeCount());
    console.log('Playtime:', this.readPlaytime());
    console.log('Money:', this.readMoney());
    console.log('Player Name:', this.readPlayerName());
    console.log('Party:', this.readPartyData());
  }

  // Read a byte from GBA memory address
  // Uses save state parsing to get accurate memory snapshots
  readGBAByte(gbaAddress) {
    // Try save state method (most reliable)
    const memInfo = this.getMemoryFromSaveState();
    if (memInfo) {
      const { state, ewramBase, iwramBase } = memInfo;

      let stateOffset;

      if (gbaAddress >= 0x02000000 && gbaAddress <= 0x0203FFFF) {
        // EWRAM
        stateOffset = ewramBase + (gbaAddress - 0x02000000);
      } else if (gbaAddress >= 0x03000000 && gbaAddress <= 0x03007FFF) {
        // IWRAM
        stateOffset = iwramBase + (gbaAddress - 0x03000000);
      } else {
        return null;
      }

      if (stateOffset >= 0 && stateOffset < state.length) {
        return state[stateOffset];
      }
    }

    // Fallback: Try RetroArch API (usually not available in EmulatorJS)
    const systemRAM = this.getSystemRAM();
    if (systemRAM) {
      const HEAPU8 = this.getMemoryArray('HEAPU8');
      if (!HEAPU8) return null;

      let offset;
      if (gbaAddress >= 0x02000000 && gbaAddress <= 0x0203FFFF) {
        offset = gbaAddress - 0x02000000;
      } else if (gbaAddress >= 0x03000000 && gbaAddress <= 0x03007FFF) {
        offset = 0x40000 + (gbaAddress - 0x03000000);
      } else {
        return null;
      }

      const heapOffset = systemRAM.pointer + offset;
      if (heapOffset < HEAPU8.length) {
        return HEAPU8[heapOffset];
      }
    }

    return null;
  }

  // Read multiple bytes from GBA memory
  readGBABytes(gbaAddress, length) {
    const bytes = [];
    for (let i = 0; i < length; i++) {
      const byte = this.readGBAByte(gbaAddress + i);
      if (byte === null) return null;
      bytes.push(byte);
    }
    return bytes;
  }

  // Read a 16-bit little-endian value from GBA memory
  readGBAWord(gbaAddress) {
    const bytes = this.readGBABytes(gbaAddress, 2);
    if (!bytes) return null;
    return bytes[0] | (bytes[1] << 8);
  }

  // Read a 32-bit little-endian value from GBA memory
  readGBADword(gbaAddress) {
    const bytes = this.readGBABytes(gbaAddress, 4);
    if (!bytes) return null;
    return bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24);
  }

  // Pokemon Fire Red memory addresses
  // Reference: https://datacrystal.tcrf.net/wiki/Pok%C3%A9mon_FireRed_and_LeafGreen:RAM_map
  static ADDRESSES = {
    // Save block pointers in IWRAM
    SAVEBLOCK1_PTR: 0x03005008,  // Map/flags data pointer
    SAVEBLOCK2_PTR: 0x0300500C,  // Personal data pointer (name, playtime, etc.)

    // Direct EWRAM addresses (when save blocks are loaded)
    CURRENT_MAP_BANK: 0x02031DBC,     // Current map bank ID
    CURRENT_MAP_NUMBER: 0x02031DBD,   // Current map number within bank
    MAP_HEADER: 0x02036DFC,           // Pointer to current map header

    // Player name (direct address, may need saveblock pointer method)
    PLAYER_NAME: 0x020245CC,          // 8 bytes, Pokemon text encoding

    // Party Pokemon data
    PARTY_COUNT: 0x02024284,          // Number of Pokemon in party (1 byte)
    PARTY_DATA: 0x02024284,           // Party data starts here (6 x 100 bytes)

    // Save block offsets (relative to saveblock pointer)
    SB2_PLAYER_NAME: 0x0000,          // 8 bytes in saveblock2
    SB2_PLAYER_GENDER: 0x0008,        // 1 byte
    SB2_PLAYTIME_HOURS: 0x000E,       // 2 bytes
    SB2_PLAYTIME_MINUTES: 0x0010,     // 1 byte
    SB2_PLAYTIME_SECONDS: 0x0011,     // 1 byte

    SB1_FLAGS: 0x0580,                // Flags array start in saveblock1
    SB1_MONEY_OFFSET: 0x0490,         // Money (encrypted) in saveblock1
    SB1_ENCRYPTION_KEY: 0x0F20,       // XOR key for money in saveblock1
  };

  // Pokemon Fire Red location names by map bank and number
  // Format: 'bank:mapNum': 'Location Name'
  // Reference: https://www.pokecommunity.com/threads/pokemon-fire-red-map-sizes-and-tile-information.165900/
  static LOCATION_NAMES = {
    // Bank 0: Towns and Cities (overworld)
    '0:0': 'Pallet Town',
    '0:1': 'Viridian City',
    '0:2': 'Pewter City',
    '0:3': 'Cerulean City',
    '0:4': 'Lavender Town',
    '0:5': 'Vermilion City',
    '0:6': 'Celadon City',
    '0:7': 'Fuchsia City',
    '0:8': 'Cinnabar Island',
    '0:9': 'Indigo Plateau',
    '0:10': 'Saffron City',
    '0:11': 'One Island',
    '0:12': 'Two Island',
    '0:13': 'Three Island',
    '0:14': 'Four Island',
    '0:15': 'Five Island',
    '0:16': 'Seven Island',
    '0:17': 'Six Island',

    // Bank 1: Routes
    '1:0': 'Route 1',
    '1:1': 'Route 2',
    '1:2': 'Route 3',
    '1:3': 'Route 4',
    '1:4': 'Route 5',
    '1:5': 'Route 6',
    '1:6': 'Route 7',
    '1:7': 'Route 8',
    '1:8': 'Route 9',
    '1:9': 'Route 10',
    '1:10': 'Route 11',
    '1:11': 'Route 12',
    '1:12': 'Route 13',
    '1:13': 'Route 14',
    '1:14': 'Route 15',
    '1:15': 'Route 16',
    '1:16': 'Route 17',
    '1:17': 'Route 18',
    '1:18': 'Route 19',
    '1:19': 'Route 20',
    '1:20': 'Route 21',
    '1:21': 'Route 22',
    '1:22': 'Route 23',
    '1:23': 'Route 24',
    '1:24': 'Route 25',

    // Bank 3: Dungeons and special areas
    '3:0': 'Viridian Forest',
    '3:1': 'Mt. Moon',
    '3:2': 'S.S. Anne',
    '3:3': 'Underground Path',
    '3:4': 'Pokemon Tower',
    '3:5': 'Seafoam Islands',
    '3:6': 'Victory Road',
    '3:7': 'Cerulean Cave',
    '3:8': 'Rock Tunnel',
    '3:9': 'Safari Zone',
    '3:10': 'Pokemon Mansion',
    '3:11': 'Power Plant',

    // Bank 4: Pallet Town buildings
    '4:0': "Player's House 1F",
    '4:1': "Player's House 2F",
    '4:2': "Rival's House",
    '4:3': "Oak's Lab",

    // Bank 5: Viridian City buildings
    '5:0': 'Viridian House',
    '5:1': 'Viridian Gym',
    '5:2': 'Viridian School',
    '5:3': 'Viridian Mart',
    '5:4': 'Viridian Pokemon Center',

    // Bank 6: Pewter City buildings
    '6:0': 'Pewter Museum 1F',
    '6:1': 'Pewter Museum 2F',
    '6:2': 'Pewter Gym',
    '6:3': 'Pewter Mart',
    '6:4': 'Pewter House',
    '6:5': 'Pewter Pokemon Center',

    // Bank 7: Cerulean City buildings
    '7:0': 'Cerulean House',
    '7:1': 'Cerulean Robbed House',
    '7:2': 'Cerulean House',
    '7:3': 'Cerulean Pokemon Center',
    '7:5': 'Cerulean Gym',
    '7:6': 'Cerulean Bike Shop',
    '7:7': 'Cerulean Mart',

    // Bank 8: Lavender Town buildings
    '8:0': 'Lavender Pokemon Center',
    '8:2': 'Lavender House',
    '8:3': 'Lavender House',
    '8:4': 'Lavender Name Rater',
    '8:5': 'Lavender Mart',

    // Bank 9: Vermilion City buildings
    '9:0': 'Vermilion House',
    '9:1': 'Vermilion Pokemon Center',
    '9:3': 'Vermilion Pokemon Fan Club',
    '9:5': 'Vermilion Mart',
    '9:6': 'Vermilion Gym',

    // Bank 10: Celadon City buildings
    '10:0': 'Celadon Dept Store 1F',
    '10:1': 'Celadon Dept Store 2F',
    '10:2': 'Celadon Dept Store 3F',
    '10:3': 'Celadon Dept Store 4F',
    '10:4': 'Celadon Dept Store 5F',
    '10:5': 'Celadon Dept Store Roof',
    '10:6': 'Celadon Dept Store Elevator',
    '10:12': 'Celadon Pokemon Center',
    '10:14': 'Celadon Game Corner',
    '10:15': 'Celadon Prize Room',
    '10:16': 'Celadon Gym',
    '10:17': 'Celadon Diner',

    // Bank 11: Fuchsia City buildings
    '11:0': 'Safari Zone Gate',
    '11:1': 'Fuchsia Mart',
    '11:3': 'Fuchsia Gym',
    '11:5': 'Fuchsia Pokemon Center',
    '11:7': "Warden's House",

    // Bank 12: Cinnabar Island buildings
    '12:0': 'Cinnabar Gym',
    '12:1': 'Cinnabar Lab',
    '12:5': 'Cinnabar Pokemon Center',
    '12:7': 'Cinnabar Mart',

    // Bank 13: Indigo Plateau / Pokemon League
    '13:0': 'Indigo Plateau Pokemon Center',
    '13:1': "Lorelei's Room",
    '13:2': "Bruno's Room",
    '13:3': "Agatha's Room",
    '13:4': "Lance's Room",
    '13:5': "Champion's Room",
    '13:6': 'Hall of Fame',

    // Bank 14: Saffron City buildings
    '14:0': "Copycat's House 1F",
    '14:1': "Copycat's House 2F",
    '14:2': 'Fighting Dojo',
    '14:3': 'Saffron Gym',
    '14:4': 'Saffron House',
    '14:5': 'Saffron Mart',
    '14:6': 'Silph Co 1F',
    '14:7': 'Saffron Pokemon Center',

    // Bank 15: Silph Co floors
    '15:0': 'Silph Co 2F',
    '15:1': 'Silph Co 3F',
    '15:2': 'Silph Co 4F',
    '15:3': 'Silph Co 5F',
    '15:4': 'Silph Co 6F',
    '15:5': 'Silph Co 7F',
    '15:6': 'Silph Co 8F',
    '15:7': 'Silph Co 9F',
    '15:8': 'Silph Co 10F',
    '15:9': 'Silph Co 11F',
  };

  // Helper methods to read specific memory addresses
  readPlayerName() {
    try {
      // Try reading from direct address first
      const nameBytes = this.readGBABytes(EmulatorManager.ADDRESSES.PLAYER_NAME, 8);
      if (nameBytes) {
        // Filter out terminator (0xFF) and convert
        const validBytes = [];
        for (const byte of nameBytes) {
          if (byte === 0xFF || byte === 0x00) break;
          validBytes.push(byte);
        }
        if (validBytes.length > 0) {
          return this.convertPokemonText(validBytes);
        }
      }

      // Try via saveblock2 pointer
      const sb2Ptr = this.readGBADword(EmulatorManager.ADDRESSES.SAVEBLOCK2_PTR);
      if (sb2Ptr && sb2Ptr >= 0x02000000 && sb2Ptr <= 0x0203FFFF) {
        const nameBytes2 = this.readGBABytes(sb2Ptr + EmulatorManager.ADDRESSES.SB2_PLAYER_NAME, 8);
        if (nameBytes2) {
          const validBytes = [];
          for (const byte of nameBytes2) {
            if (byte === 0xFF || byte === 0x00) break;
            validBytes.push(byte);
          }
          if (validBytes.length > 0) {
            return this.convertPokemonText(validBytes);
          }
        }
      }

      return null;
    } catch (error) {
      console.error('Error reading player name:', error);
      return null;
    }
  }

  readCurrentLocation() {
    try {
      // Read map bank and map number from direct addresses
      const mapBank = this.readGBAByte(EmulatorManager.ADDRESSES.CURRENT_MAP_BANK);
      const mapNum = this.readGBAByte(EmulatorManager.ADDRESSES.CURRENT_MAP_NUMBER);

      console.log(`Map read attempt: bank=${mapBank}, number=${mapNum}`);

      if (mapBank === null || mapNum === null) {
        console.log('Could not read map bank/number from direct addresses');

        // Try alternative: read from saveblock1 structure
        const sb1Ptr = this.readGBADword(EmulatorManager.ADDRESSES.SAVEBLOCK1_PTR);
        if (sb1Ptr && sb1Ptr >= 0x02000000 && sb1Ptr <= 0x0203FFFF) {
          // Location data might be at offset 0x4 in saveblock1
          const altMapBank = this.readGBAByte(sb1Ptr + 0x4);
          const altMapNum = this.readGBAByte(sb1Ptr + 0x5);
          console.log(`Alt map read: sb1Ptr=0x${sb1Ptr.toString(16)}, bank=${altMapBank}, num=${altMapNum}`);

          if (altMapBank !== null && altMapNum !== null) {
            const key = `${altMapBank}:${altMapNum}`;
            const locationName = EmulatorManager.LOCATION_NAMES[key];
            return locationName || `Map ${altMapBank}-${altMapNum}`;
          }
        }
        return null;
      }

      // Look up location name
      const key = `${mapBank}:${mapNum}`;
      const locationName = EmulatorManager.LOCATION_NAMES[key];

      if (locationName) {
        console.log(`Location found: ${locationName}`);
        return locationName;
      }

      // Return raw coordinates if not in our lookup table
      console.log(`Location not in lookup table: ${key}`);
      return `Map ${mapBank}-${mapNum}`;
    } catch (error) {
      console.error('Error reading location:', error);
      return null;
    }
  }

  readBadgeCount() {
    try {
      // Badges are stored as flags 0x820-0x827 in the flags array
      // The flags array is in saveblock1 at offset 0x580
      // Flag 0x820 = bit 0 of byte at offset (0x820 / 8) = byte 260 (0x104)
      // All 8 badges are in one byte at flags + 0x104

      // First get saveblock1 pointer
      const sb1Ptr = this.readGBADword(EmulatorManager.ADDRESSES.SAVEBLOCK1_PTR);
      if (!sb1Ptr || sb1Ptr < 0x02000000 || sb1Ptr > 0x0203FFFF) {
        console.log('Invalid saveblock1 pointer:', sb1Ptr?.toString(16));
        return null;
      }

      // Calculate address of badge flags byte
      // Flag 0x820 = 2080 decimal
      // Byte offset in flags = 2080 / 8 = 260 = 0x104
      const flagsBase = sb1Ptr + EmulatorManager.ADDRESSES.SB1_FLAGS;
      const badgeFlagsByte = this.readGBAByte(flagsBase + 0x104);

      if (badgeFlagsByte === null) {
        console.log('Could not read badge flags');
        return null;
      }

      // Count the bits set (each bit = one badge)
      let count = 0;
      let flags = badgeFlagsByte;
      while (flags) {
        count += flags & 1;
        flags >>= 1;
      }

      console.log(`Badge flags byte: 0x${badgeFlagsByte.toString(16)}, count: ${count}`);
      return count;
    } catch (error) {
      console.error('Error reading badge count:', error);
      return null;
    }
  }

  readPlaytime() {
    try {
      // Playtime is in saveblock2
      const sb2Ptr = this.readGBADword(EmulatorManager.ADDRESSES.SAVEBLOCK2_PTR);
      if (!sb2Ptr || sb2Ptr < 0x02000000 || sb2Ptr > 0x0203FFFF) {
        console.log('Invalid saveblock2 pointer');
        return null;
      }

      const hours = this.readGBAWord(sb2Ptr + EmulatorManager.ADDRESSES.SB2_PLAYTIME_HOURS);
      const minutes = this.readGBAByte(sb2Ptr + EmulatorManager.ADDRESSES.SB2_PLAYTIME_MINUTES);
      const seconds = this.readGBAByte(sb2Ptr + EmulatorManager.ADDRESSES.SB2_PLAYTIME_SECONDS);

      if (hours === null || minutes === null || seconds === null) {
        console.log('Could not read playtime');
        return null;
      }

      console.log(`Playtime: ${hours}:${minutes}:${seconds}`);
      return { hours, minutes, seconds };
    } catch (error) {
      console.error('Error reading playtime:', error);
      return null;
    }
  }

  readMoney() {
    try {
      // Money in saveblock1 is XOR encrypted with a key
      const sb1Ptr = this.readGBADword(EmulatorManager.ADDRESSES.SAVEBLOCK1_PTR);
      if (!sb1Ptr || sb1Ptr < 0x02000000 || sb1Ptr > 0x0203FFFF) {
        return null;
      }

      const encryptedMoney = this.readGBADword(sb1Ptr + EmulatorManager.ADDRESSES.SB1_MONEY_OFFSET);
      const xorKey = this.readGBADword(sb1Ptr + EmulatorManager.ADDRESSES.SB1_ENCRYPTION_KEY);

      if (encryptedMoney === null || xorKey === null) {
        return null;
      }

      const money = (encryptedMoney ^ xorKey) >>> 0; // Convert to unsigned
      console.log(`Money: ${money} (encrypted: 0x${encryptedMoney.toString(16)}, key: 0x${xorKey.toString(16)})`);
      return money;
    } catch (error) {
      console.error('Error reading money:', error);
      return null;
    }
  }

  readPartyData() {
    try {
      // Party count and data are at the same starting address
      // The first byte is party count, followed by 6 x 100 byte Pokemon structures
      const partyAddr = EmulatorManager.ADDRESSES.PARTY_DATA;

      // First read party count (might be at a different offset)
      // Actually, party count is at 0x02024284, and party data starts at 0x02024284 + 4
      // Let me check both patterns

      const partyCount = this.readGBAByte(partyAddr);
      if (partyCount === null || partyCount > 6) {
        // Try alternative: count might be elsewhere
        console.log('Could not read valid party count:', partyCount);
        return [];
      }

      console.log(`Party count: ${partyCount}`);

      const party = [];
      const pokemonSize = 100; // Each Pokemon structure is 100 bytes
      const dataStart = partyAddr + 4; // Party data starts after count (usually 4 byte aligned)

      for (let i = 0; i < partyCount && i < 6; i++) {
        const pokemonAddr = dataStart + (i * pokemonSize);
        const pokemonData = this.readPokemonData(pokemonAddr);
        if (pokemonData) {
          party.push(pokemonData);
        }
      }

      return party;
    } catch (error) {
      console.error('Error reading party data:', error);
      return [];
    }
  }

  // Read a single Pokemon's data from memory
  readPokemonData(address) {
    try {
      // Pokemon data structure (Generation III) - 100 bytes total
      // First 32 bytes are the "box" data (encrypted)
      // Bytes 0-3: Personality Value (PID)
      // Bytes 4-7: Original Trainer ID
      // Bytes 8-17: Nickname (10 bytes)
      // Bytes 80-83: Status condition
      // Bytes 84-85: Current HP
      // Bytes 86-87: Max HP
      // Bytes 88-89: Attack
      // Bytes 90-91: Defense
      // Bytes 92-93: Speed
      // Bytes 94-95: Sp. Attack
      // Bytes 96-97: Sp. Defense

      const pid = this.readGBADword(address);
      if (pid === null || pid === 0) {
        return null;
      }

      // Read nickname (bytes 8-17)
      const nicknameBytes = this.readGBABytes(address + 8, 10);
      const nickname = nicknameBytes ? this.convertPokemonText(
        nicknameBytes.filter(b => b !== 0xFF && b !== 0x00)
      ) : 'Unknown';

      // Read battle stats (unencrypted, at end of structure)
      const currentHP = this.readGBAWord(address + 84);
      const maxHP = this.readGBAWord(address + 86);
      const level = this.readGBAByte(address + 84 - 1); // Level is at offset 83

      // Species ID is in the encrypted data section, harder to decode
      // For now, just return what we can easily read
      return {
        nickname,
        level: level || 0,
        currentHP: currentHP || 0,
        maxHP: maxHP || 0,
        pid: pid.toString(16)
      };
    } catch (error) {
      console.error('Error reading Pokemon data:', error);
      return null;
    }
  }

  // Convert Pokemon character encoding to readable text
  // Gen III uses a custom character encoding
  convertPokemonText(bytes) {
    // Pokemon Fire Red character encoding map
    // 0x00-0xA0: Special characters
    // 0xA1-0xAA: 0-9
    // 0xAB-0xB4: Punctuation
    // 0xBB-0xD4: A-Z uppercase
    // 0xD5-0xEE: a-z lowercase
    const charMap = {
      // Numbers
      0xA1: '0', 0xA2: '1', 0xA3: '2', 0xA4: '3', 0xA5: '4',
      0xA6: '5', 0xA7: '6', 0xA8: '7', 0xA9: '8', 0xAA: '9',
      // Punctuation
      0xAB: '!', 0xAC: '?', 0xAD: '.', 0xAE: '-', 0xB0: '\'',
      0xB1: '\'', 0xB2: '"', 0xB3: '"', 0xB4: '\'',
      // Uppercase
      0xBB: 'A', 0xBC: 'B', 0xBD: 'C', 0xBE: 'D', 0xBF: 'E',
      0xC0: 'F', 0xC1: 'G', 0xC2: 'H', 0xC3: 'I', 0xC4: 'J',
      0xC5: 'K', 0xC6: 'L', 0xC7: 'M', 0xC8: 'N', 0xC9: 'O',
      0xCA: 'P', 0xCB: 'Q', 0xCC: 'R', 0xCD: 'S', 0xCE: 'T',
      0xCF: 'U', 0xD0: 'V', 0xD1: 'W', 0xD2: 'X', 0xD3: 'Y',
      0xD4: 'Z',
      // Lowercase
      0xD5: 'a', 0xD6: 'b', 0xD7: 'c', 0xD8: 'd', 0xD9: 'e',
      0xDA: 'f', 0xDB: 'g', 0xDC: 'h', 0xDD: 'i', 0xDE: 'j',
      0xDF: 'k', 0xE0: 'l', 0xE1: 'm', 0xE2: 'n', 0xE3: 'o',
      0xE4: 'p', 0xE5: 'q', 0xE6: 'r', 0xE7: 's', 0xE8: 't',
      0xE9: 'u', 0xEA: 'v', 0xEB: 'w', 0xEC: 'x', 0xED: 'y',
      0xEE: 'z',
      // Space
      0x00: ' ',
    };

    return bytes.map(byte => charMap[byte] || '').join('').trim();
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
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
      container.style.display = 'block';
      container.style.width = '100%';
      container.style.height = '100%';
      
      // Set up EmulatorJS configuration exactly as per documentation
      console.log('Setting up EmulatorJS configuration...');
      window.EJS_player = '#emulator-container';
      window.EJS_core = 'gba';
      // ROM is served from MinIO via the API in production
      // Use VITE_ROM_PATH for local development with static files
      window.EJS_gameUrl = import.meta.env.VITE_ROM_PATH || '/api/rom/pokemon-firered.gba';
      window.EJS_pathtodata = 'https://cdn.emulatorjs.org/stable/data/';
      
      // Optional configurations - disable controls to auto-start
      window.EJS_color = '#4a90e2';
      window.EJS_backgroundColor = '#1a1a2e';
      window.EJS_startOnLoaded = true; // Auto-start when loaded
      window.EJS_controls = false; // Hide start button

      // Performance optimizations for low-power devices (Raspberry Pi 4)
      window.EJS_volume = 0; // Mute audio
      window.EJS_disableAudio = true; // Disable audio processing entirely
      window.EJS_threads = true; // Enable multi-threaded emulation (uses Web Workers)
      window.EJS_WEBGL2 = true; // Enable WebGL2 for better performance
      window.EJS_CacheLimit = 50 * 1024 * 1024; // Limit cache to 50MB (default is 1GB)
      window.EJS_softLoad = true; // Soft loading - less memory intensive
      window.EJS_defaultOptions = {
        'shader': 'disabled', // Disable shaders for better performance
        'vsync': 'disabled', // Disable VSync for lower latency
        'rewind': false, // Disable rewind to save memory and CPU
        'ffw-ratio': 1, // Disable fast forward (1x speed)
        'ff-ratio': 1, // Disable fast forward (1x speed)
      };
      
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
    console.log('Game pause requested');
    try {
      if (window.EJS_emulator?.pause) {
        window.EJS_emulator.pause();
        console.log('Emulator paused');
      } else if (window.EJS_emulator?.gameManager?.pause) {
        window.EJS_emulator.gameManager.pause();
        console.log('Emulator paused via gameManager');
      }
    } catch (e) {
      console.log('Pause failed:', e.message);
    }
  }

  resumeGame() {
    console.log('Game resume requested');
    try {
      if (window.EJS_emulator?.play) {
        window.EJS_emulator.play();
        console.log('Emulator resumed');
      } else if (window.EJS_emulator?.gameManager?.play) {
        window.EJS_emulator.gameManager.play();
        console.log('Emulator resumed via gameManager');
      }
    } catch (e) {
      console.log('Resume failed:', e.message);
    }
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
        money: this.readMoney(),
        party: this.readPartyData()
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

        // Get save state and analyze it
        const stateData = gameManager.getState();
        if (stateData) {
          const state = new Uint8Array(stateData);
          console.log('\n--- Save State Analysis ---');
          console.log('Size:', state.length, 'bytes (', (state.length / 1024).toFixed(1), 'KB)');

          // Show header
          console.log('Header (first 64 bytes):');
          this.hexDump(state, 0, 64);

          // Show chunks at various offsets to understand structure
          console.log('\nSampling at key offsets:');
          const offsets = [0x100, 0x1000, 0x10000, 0x19000, 0x20000, 0x21000, 0x30000, 0x40000];
          for (const off of offsets) {
            if (off + 16 < state.length) {
              console.log(`  Offset 0x${off.toString(16)}:`);
              this.hexDump(state, off, 16);
            }
          }
        }
      }
    }

    // Try save state parsing method
    console.log('\n--- Save State Memory Access ---');
    // Clear cache to force fresh parse
    this._cachedSaveStateMemory = null;
    const memInfo = this.getMemoryFromSaveState();
    if (memInfo) {
      console.log('Successfully parsed save state memory!');
      console.log('EWRAM base in state:', '0x' + memInfo.ewramBase.toString(16));
      console.log('IWRAM base in state:', '0x' + memInfo.iwramBase.toString(16));
      this.testMemoryReads();
    } else {
      console.log('Save state parsing failed, trying RetroArch API...');
      const systemRAM = this.getSystemRAM();
      console.log('System RAM via retro API:', systemRAM);

      if (systemRAM) {
        this.testMemoryReads();
      } else {
        console.log('No memory access method available');
        console.log('\nTo debug further, try: window.emulatorInstance.analyzeSaveState()');
      }
    }

    return 'Debug complete - check console for results';
  }

  // Hex dump utility for debugging
  hexDump(arr, offset, length) {
    const bytes = Array.from(arr.slice(offset, offset + length));
    const hex = bytes.map(b => b.toString(16).padStart(2, '0')).join(' ');
    const ascii = bytes.map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.').join('');
    console.log(`    ${hex}  |${ascii}|`);
  }

  // Deep analysis of save state format
  analyzeSaveState() {
    console.log('=== Deep Save State Analysis ===');

    const gameManager = window.EJS_emulator?.gameManager;
    if (!gameManager?.getState) {
      console.log('getState not available');
      return;
    }

    const stateData = gameManager.getState();
    if (!stateData) {
      console.log('No save state data');
      return;
    }

    const state = new Uint8Array(stateData);
    console.log('Total size:', state.length, 'bytes');

    // Find all occurrences of EWRAM-like pointers
    console.log('\nSearching for EWRAM pointer patterns (0x02xxxxxx):');
    let foundPairs = 0;

    for (let i = 0; i < state.length - 8 && foundPairs < 20; i += 4) {
      const val1 = this.readU32FromArray(state, i);
      const val2 = this.readU32FromArray(state, i + 4);

      const isEWRAM = (p) => (p >>> 0) >= 0x02000000 && (p >>> 0) <= 0x0203FFFF;

      if (isEWRAM(val1) && isEWRAM(val2)) {
        const diff = Math.abs((val1 >>> 0) - (val2 >>> 0));
        if (diff > 0x100 && diff < 0x10000) {
          console.log(`  Offset 0x${i.toString(16)}: 0x${val1.toString(16)} 0x${val2.toString(16)} (diff: 0x${diff.toString(16)})`);
          foundPairs++;
        }
      }
    }

    // Look for "mGBA" signature or other format markers
    console.log('\nSearching for format signatures:');
    const signatures = ['mGBA', 'GBAS', 'SAVE', 'VBA-', 'STAT'];
    for (const sig of signatures) {
      for (let i = 0; i < Math.min(state.length - 4, 0x1000); i++) {
        const found = sig.split('').every((ch, j) => state[i + j] === ch.charCodeAt(0));
        if (found) {
          console.log(`  Found "${sig}" at offset 0x${i.toString(16)}`);
        }
      }
    }

    return 'Analysis complete - check console';
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

      const state = new Uint8Array(stateData);
      console.log('Save state size:', state.length, 'bytes');

      // Check for known save state formats
      const magic = String.fromCharCode(state[0], state[1], state[2], state[3]);
      console.log('Magic bytes:', magic, '(hex:', Array.from(state.slice(0, 4)).map(b => b.toString(16).padStart(2, '0')).join(' '), ')');

      let ewramBase = -1;
      let iwramBase = -1;

      // Method 1: Scan for saveblock pointer pattern
      // Pokemon Fire Red has two consecutive pointers in IWRAM:
      // 0x03005008: SaveBlock1 pointer (0x02xxxxxx)
      // 0x0300500C: SaveBlock2 pointer (0x02xxxxxx)
      // We search for this pattern in the save state

      console.log('Scanning save state for saveblock pointer pattern...');
      const found = this.scanForSaveblockPointers(state);

      if (found) {
        iwramBase = found.iwramBase;
        ewramBase = found.ewramBase;
        console.log(`Found memory layout via pattern scan:`);
        console.log(`  IWRAM base in state: 0x${iwramBase.toString(16)}`);
        console.log(`  EWRAM base in state: 0x${ewramBase.toString(16)}`);
        console.log(`  Header offset: 0x${found.headerOffset.toString(16)}`);
      }

      if (iwramBase === -1) {
        console.log('Could not find GBA memory in save state');
        return null;
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

  // Scan save state for the saveblock pointer pattern
  // Returns { iwramBase, ewramBase, headerOffset } or null
  scanForSaveblockPointers(state) {
    // Pokemon Fire Red saveblock pointers at IWRAM offsets 0x5008 and 0x500C
    // They should be valid EWRAM pointers (0x02000000-0x0203FFFF)

    // mGBA save state layout (from serialize.h):
    // - Version magic at offset 0x00000: 0x01000007
    // - IWRAM at offset 0x19000 (32KB)
    // - EWRAM at offset 0x21000 (256KB)
    // - Total: 0x61000 (397,312 bytes)
    const MGBA_VERSION_MAGIC = 0x01000007;
    const MGBA_IWRAM_OFFSET = 0x19000;
    const MGBA_EWRAM_OFFSET = 0x21000;
    const SB_PTR_OFFSET_IN_IWRAM = 0x5008;

    // First, try to find the mGBA state by looking for the version magic
    console.log('Searching for mGBA version magic (0x01000007)...');
    for (let i = 0; i < state.length - 0x61000; i += 4) {
      const magic = this.readU32FromArray(state, i);
      if (magic === MGBA_VERSION_MAGIC) {
        console.log(`Found mGBA magic at offset 0x${i.toString(16)}`);

        // Verify by checking the saveblock pointers
        const testIWRAMBase = i + MGBA_IWRAM_OFFSET;
        const testEWRAMBase = i + MGBA_EWRAM_OFFSET;

        if (testIWRAMBase + SB_PTR_OFFSET_IN_IWRAM + 8 < state.length) {
          const sb1Ptr = this.readU32FromArray(state, testIWRAMBase + SB_PTR_OFFSET_IN_IWRAM);
          const sb2Ptr = this.readU32FromArray(state, testIWRAMBase + SB_PTR_OFFSET_IN_IWRAM + 4);

          console.log(`  SB1=0x${sb1Ptr.toString(16)}, SB2=0x${sb2Ptr.toString(16)}`);

          if (this.isValidSaveblockPair(sb1Ptr, sb2Ptr)) {
            console.log(`  Valid saveblock pointers found!`);
            return { iwramBase: testIWRAMBase, ewramBase: testEWRAMBase, headerOffset: i };
          } else {
            console.log(`  Saveblock pointers not valid, continuing search...`);
          }
        }
      }
    }

    // Try known header offsets (libretro wrappers often add fixed-size headers)
    console.log('Magic search failed, trying known header offsets...');
    const knownOffsets = [0, 0x38, 0x40, 0x80, 0x100, 0x200, 0x400, 0x800, 0x1000, 0x2000, 0x4000, 0x8000, 0x10000, 0x20000];

    for (const headerOffset of knownOffsets) {
      const testIWRAMBase = headerOffset + MGBA_IWRAM_OFFSET;
      const testEWRAMBase = headerOffset + MGBA_EWRAM_OFFSET;

      if (testIWRAMBase + SB_PTR_OFFSET_IN_IWRAM + 8 >= state.length) continue;

      const sb1Ptr = this.readU32FromArray(state, testIWRAMBase + SB_PTR_OFFSET_IN_IWRAM);
      const sb2Ptr = this.readU32FromArray(state, testIWRAMBase + SB_PTR_OFFSET_IN_IWRAM + 4);

      if (this.isValidSaveblockPair(sb1Ptr, sb2Ptr)) {
        console.log(`Found at known offset 0x${headerOffset.toString(16)}:`);
        console.log(`  SB1=0x${sb1Ptr.toString(16)}, SB2=0x${sb2Ptr.toString(16)}`);
        return { iwramBase: testIWRAMBase, ewramBase: testEWRAMBase, headerOffset };
      }
    }

    // If known offsets fail, scan the entire state for the pointer pattern
    console.log('Known offsets failed, scanning entire state for pointer pattern...');

    for (let i = 0; i < state.length - 0x48000; i += 4) {
      const val1 = this.readU32FromArray(state, i);
      const val2 = this.readU32FromArray(state, i + 4);

      if (this.isValidSaveblockPair(val1, val2)) {
        // Found candidate pointers - calculate where IWRAM/EWRAM would be
        // These pointers are at IWRAM + 0x5008, so IWRAM starts 0x5008 bytes before
        const iwramBase = i - SB_PTR_OFFSET_IN_IWRAM;

        // EWRAM should be 0x8000 bytes after IWRAM (32KB IWRAM size)
        const ewramBase = iwramBase + 0x8000;

        // Validate: read from the supposed saveblock and check it makes sense
        const sb1EwramOffset = val1 - 0x02000000;
        const testAddr = ewramBase + sb1EwramOffset;

        if (testAddr >= 0 && testAddr + 0x1000 < state.length) {
          // Try to read player name from SaveBlock2 (at offset 0x0 in SB2)
          const sb2EwramOffset = val2 - 0x02000000;
          const nameAddr = ewramBase + sb2EwramOffset;

          if (nameAddr >= 0 && nameAddr + 8 < state.length) {
            const nameByte = state[nameAddr];
            // Valid Pokemon text starts with 0xBB-0xEE range (letters)
            if (nameByte >= 0xBB && nameByte <= 0xEE) {
              console.log(`Pattern match at offset 0x${i.toString(16)}:`);
              console.log(`  SB1=0x${val1.toString(16)}, SB2=0x${val2.toString(16)}`);
              console.log(`  Calculated IWRAM base: 0x${iwramBase.toString(16)}`);
              console.log(`  Calculated EWRAM base: 0x${ewramBase.toString(16)}`);
              console.log(`  Name first byte: 0x${nameByte.toString(16)}`);
              return { iwramBase, ewramBase, headerOffset: i - MGBA_IWRAM_OFFSET - SB_PTR_OFFSET_IN_IWRAM };
            }
          }
        }
      }
    }

    // Last resort: try to find EWRAM by looking for Pokemon party signature
    console.log('Pointer scan failed, trying alternate pattern detection...');
    return this.scanForAlternatePatterns(state);
  }

  // Check if two values form a valid saveblock pointer pair
  isValidSaveblockPair(ptr1, ptr2) {
    const isEWRAM = (p) => (p >>> 0) >= 0x02000000 && (p >>> 0) <= 0x0203FFFF;

    if (!isEWRAM(ptr1) || !isEWRAM(ptr2)) return false;

    // SaveBlock1 and SaveBlock2 should be reasonably close together
    // and in the expected order (SB1 is typically lower in memory)
    const diff = Math.abs((ptr1 >>> 0) - (ptr2 >>> 0));

    // They're typically within 0x5000 bytes of each other
    return diff > 0 && diff < 0x10000;
  }

  // Alternate pattern detection when saveblock pointers aren't found
  scanForAlternatePatterns(state) {
    // mGBA save state has game title at offset 0x10 and game code at offset 0x1C
    // Pokemon Fire Red game codes: "BPRE" (English), "BPRJ" (Japanese), etc.
    const MGBA_IWRAM_OFFSET = 0x19000;
    const MGBA_EWRAM_OFFSET = 0x21000;

    console.log('Searching for Pokemon Fire Red game code signature...');

    // Search for "BPRE" or "BPRJ" game codes
    const gameCodes = ['BPRE', 'BPRJ', 'BPRF', 'BPRD', 'BPRS', 'BPRI'];

    for (let i = 0; i < state.length - 0x61000; i++) {
      for (const code of gameCodes) {
        // Check if game code matches at offset 0x1C from potential state start
        const codeOffset = i + 0x1C;
        if (codeOffset + 4 >= state.length) continue;

        const found = code.split('').every((ch, j) => state[codeOffset + j] === ch.charCodeAt(0));
        if (found) {
          console.log(`Found game code "${code}" at offset 0x${codeOffset.toString(16)}`);
          console.log(`  State would start at offset 0x${i.toString(16)}`);

          const testIWRAMBase = i + MGBA_IWRAM_OFFSET;
          const testEWRAMBase = i + MGBA_EWRAM_OFFSET;

          // Verify by checking saveblock pointers
          if (testIWRAMBase + 0x5010 < state.length) {
            const sb1Ptr = this.readU32FromArray(state, testIWRAMBase + 0x5008);
            const sb2Ptr = this.readU32FromArray(state, testIWRAMBase + 0x500C);

            console.log(`  SB1=0x${sb1Ptr.toString(16)}, SB2=0x${sb2Ptr.toString(16)}`);

            if (this.isValidSaveblockPair(sb1Ptr, sb2Ptr)) {
              console.log(`  Valid saveblock pointers confirmed!`);
              return { iwramBase: testIWRAMBase, ewramBase: testEWRAMBase, headerOffset: i };
            }
          }
        }
      }
    }

    // Try looking for "POKEMON FIRE" game title at offset 0x10
    console.log('Searching for "POKEMON FIRE" title...');
    const title = 'POKEMON FIRE';
    for (let i = 0; i < state.length - 0x61000; i++) {
      const titleOffset = i + 0x10;
      if (titleOffset + 12 >= state.length) continue;

      const found = title.split('').every((ch, j) => state[titleOffset + j] === ch.charCodeAt(0));
      if (found) {
        console.log(`Found title at offset 0x${titleOffset.toString(16)}`);

        const testIWRAMBase = i + MGBA_IWRAM_OFFSET;
        const testEWRAMBase = i + MGBA_EWRAM_OFFSET;

        if (testIWRAMBase + 0x5010 < state.length) {
          const sb1Ptr = this.readU32FromArray(state, testIWRAMBase + 0x5008);
          const sb2Ptr = this.readU32FromArray(state, testIWRAMBase + 0x500C);

          console.log(`  SB1=0x${sb1Ptr.toString(16)}, SB2=0x${sb2Ptr.toString(16)}`);

          if (this.isValidSaveblockPair(sb1Ptr, sb2Ptr)) {
            return { iwramBase: testIWRAMBase, ewramBase: testEWRAMBase, headerOffset: i };
          }
        }
      }
    }

    console.log('No alternate patterns found');
    return null;
  }

  // Read unsigned 32-bit little-endian value from array
  readU32FromArray(arr, offset) {
    if (offset < 0 || offset + 4 > arr.length) return 0;
    return (arr[offset] | (arr[offset + 1] << 8) | (arr[offset + 2] << 16) | (arr[offset + 3] << 24)) >>> 0;
  }

  // Legacy heap scanning - kept as backup
  findGBAMemoryBase() {
    // Heap scanning is unreliable, prefer save state parsing
    return null;
  }

  testMemoryReads() {
    console.log('\n--- Test reads ---');
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

  // Debug function to dump party Pokemon raw bytes
  debugPartyRaw() {
    console.log('=== Party Pokemon Raw Debug ===');

    const partyCountAddr = EmulatorManager.ADDRESSES.PARTY_COUNT;
    const partyDataAddr = EmulatorManager.ADDRESSES.PARTY_DATA;

    console.log(`Party count address: 0x${partyCountAddr.toString(16)}`);
    console.log(`Party data address: 0x${partyDataAddr.toString(16)}`);

    // Read bytes around party count to find it
    console.log('\nBytes around party count address:');
    for (let offset = -8; offset <= 8; offset++) {
      const val = this.readGBAByte(partyCountAddr + offset);
      console.log(`  0x${(partyCountAddr + offset).toString(16)}: ${val}`);
    }

    // Read first Pokemon structure
    console.log('\nFirst Pokemon (100 bytes):');
    const pokemon1 = this.readGBABytes(partyDataAddr, 100);
    if (pokemon1) {
      // Show key offsets
      console.log('  PID (0-3):', pokemon1.slice(0, 4).map(b => b.toString(16).padStart(2, '0')).join(' '));
      console.log('  Nickname (8-17):', pokemon1.slice(8, 18).map(b => b.toString(16).padStart(2, '0')).join(' '));
      console.log('  Level (84):', pokemon1[84]);
      console.log('  HP (86-87):', pokemon1[86] | (pokemon1[87] << 8));
      console.log('  Max HP (88-89):', pokemon1[88] | (pokemon1[89] << 8));
    }

    return 'Debug complete';
  }

  // Debug function to find correct offsets by searching for known values
  debugFindOffsets(knownMoney = null, knownLevel = null) {
    console.log('=== Finding Correct Offsets ===');

    const sb1Ptr = this.readGBADword(EmulatorManager.ADDRESSES.SAVEBLOCK1_PTR);
    console.log(`SB1 at: 0x${sb1Ptr?.toString(16)}`);

    if (knownMoney !== null) {
      console.log(`\nSearching for money value ${knownMoney} in SB1...`);
      for (let offset = 0; offset < 0x2000; offset += 4) {
        const val = this.readGBADword(sb1Ptr + offset);
        if (val === knownMoney) {
          console.log(`  Found at offset 0x${offset.toString(16)}`);
        }
      }
    }

    if (knownLevel !== null) {
      console.log(`\nSearching for level ${knownLevel} in party area...`);
      const partyBase = EmulatorManager.ADDRESSES.PARTY_DATA;
      for (let offset = 0; offset < 600; offset++) {
        const val = this.readGBAByte(partyBase + offset);
        if (val === knownLevel) {
          console.log(`  Found at offset ${offset} (byte ${offset % 100} of Pokemon ${Math.floor(offset / 100)})`);
        }
      }
    }

    return 'Search complete';
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
  // Reference: https://github.com/pret/pokefirered (decompilation project)
  static ADDRESSES = {
    // Save block pointers in IWRAM
    SAVEBLOCK1_PTR: 0x03005008,  // Map/flags data pointer
    SAVEBLOCK2_PTR: 0x0300500C,  // Personal data pointer (name, playtime, etc.)
    SAVEBLOCK3_PTR: 0x03005010,  // Pokemon storage pointer

    // Save block 1 offsets (player state, map, flags)
    SB1_X_POS: 0x0000,                // 2 bytes - X position
    SB1_Y_POS: 0x0002,                // 2 bytes - Y position
    SB1_MAP_GROUP: 0x0004,            // 1 byte - Map group/bank
    SB1_MAP_NUM: 0x0005,              // 1 byte - Map number within group
    SB1_MONEY: 0x0290,                // 4 bytes - Money (encrypted with security key)
    SB1_COINS: 0x0294,                // 2 bytes - Game corner coins
    SB1_FLAGS: 0x0EE0,                // Flags array (0x120 bytes)

    // Security key is in SaveBlock2, NOT SaveBlock1
    // Source: https://github.com/pret/pokefirered/blob/master/include/global.h
    SB2_SECURITY_KEY: 0x0F20,         // 4 bytes - XOR key for money/coins (in SaveBlock2!)

    // Save block 2 offsets (trainer info)
    SB2_PLAYER_NAME: 0x0000,          // 8 bytes in saveblock2
    SB2_PLAYER_GENDER: 0x0008,        // 1 byte
    SB2_TRAINER_ID: 0x000A,           // 4 bytes (visible ID + secret ID)
    SB2_PLAYTIME_HOURS: 0x000E,       // 2 bytes
    SB2_PLAYTIME_MINUTES: 0x0010,     // 1 byte
    SB2_PLAYTIME_SECONDS: 0x0011,     // 1 byte
    SB2_OPTIONS: 0x0013,              // Game options

    // Party data - in EWRAM, separate from saveblocks
    PARTY_COUNT: 0x02024284,          // 1 byte - Number of Pokemon in party (at start of party structure)
    PARTY_DATA: 0x02024284,           // Party Pokemon array (6 x 100 bytes) - count is embedded
  };

  // Pokemon Fire Red location names by map group and number
  // Source: https://github.com/pret/pokefirered/blob/master/data/maps/map_groups.json
  // Format: 'group:mapNum': 'Location Name'
  static LOCATION_NAMES = {
    // Group 0: gMapGroup_Link
    '0:0': 'Battle Colosseum 2P',
    '0:1': 'Trade Center',
    '0:2': 'Record Corner',
    '0:3': 'Battle Colosseum 4P',
    '0:4': 'Union Room',

    // Group 1: gMapGroup_Dungeons
    '1:0': 'Viridian Forest',
    '1:1': 'Mt. Moon 1F',
    '1:2': 'Mt. Moon B1F',
    '1:3': 'Mt. Moon B2F',
    '1:4': 'S.S. Anne Exterior',
    '1:5': 'S.S. Anne 1F Corridor',
    '1:6': 'S.S. Anne 2F Corridor',
    '1:7': 'S.S. Anne 3F Corridor',
    '1:8': 'S.S. Anne B1F Corridor',
    '1:9': 'S.S. Anne Deck',
    '1:10': 'S.S. Anne Kitchen',
    '1:11': "S.S. Anne Captain's Office",
    '1:30': 'Underground Path North',
    '1:31': 'Underground Path Tunnel',
    '1:32': 'Underground Path South',
    '1:36': "Diglett's Cave North",
    '1:37': "Diglett's Cave",
    '1:38': "Diglett's Cave South",
    '1:39': 'Victory Road 1F',
    '1:40': 'Victory Road 2F',
    '1:41': 'Victory Road 3F',
    '1:42': 'Rocket Hideout B1F',
    '1:43': 'Rocket Hideout B2F',
    '1:44': 'Rocket Hideout B3F',
    '1:45': 'Rocket Hideout B4F',
    '1:47': 'Silph Co. 1F',
    '1:48': 'Silph Co. 2F',
    '1:49': 'Silph Co. 3F',
    '1:50': 'Silph Co. 4F',
    '1:51': 'Silph Co. 5F',
    '1:52': 'Silph Co. 6F',
    '1:53': 'Silph Co. 7F',
    '1:54': 'Silph Co. 8F',
    '1:55': 'Silph Co. 9F',
    '1:56': 'Silph Co. 10F',
    '1:57': 'Silph Co. 11F',
    '1:59': 'Pokemon Mansion 1F',
    '1:60': 'Pokemon Mansion 2F',
    '1:61': 'Pokemon Mansion 3F',
    '1:62': 'Pokemon Mansion B1F',
    '1:63': 'Safari Zone Center',
    '1:64': 'Safari Zone East',
    '1:65': 'Safari Zone North',
    '1:66': 'Safari Zone West',
    '1:71': 'Cerulean Cave 1F',
    '1:72': 'Cerulean Cave 2F',
    '1:73': 'Cerulean Cave B1F',
    '1:74': "Pokemon League Lorelei's Room",
    '1:75': "Pokemon League Bruno's Room",
    '1:76': "Pokemon League Agatha's Room",
    '1:77': "Pokemon League Lance's Room",
    '1:78': "Pokemon League Champion's Room",
    '1:79': 'Pokemon League Hall of Fame',
    '1:80': 'Rock Tunnel 1F',
    '1:81': 'Rock Tunnel B1F',
    '1:82': 'Seafoam Islands 1F',
    '1:83': 'Seafoam Islands B1F',
    '1:84': 'Seafoam Islands B2F',
    '1:85': 'Seafoam Islands B3F',
    '1:86': 'Seafoam Islands B4F',
    '1:87': 'Pokemon Tower 1F',
    '1:88': 'Pokemon Tower 2F',
    '1:89': 'Pokemon Tower 3F',
    '1:90': 'Pokemon Tower 4F',
    '1:91': 'Pokemon Tower 5F',
    '1:92': 'Pokemon Tower 6F',
    '1:93': 'Pokemon Tower 7F',
    '1:94': 'Power Plant',

    // Group 2: gMapGroup_SpecialArea
    '2:0': 'Navel Rock',
    '2:1': 'Trainer Tower 1F',
    '2:10': 'Trainer Tower Lobby',

    // Group 3: gMapGroup_TownsAndRoutes (main overworld)
    '3:0': 'Pallet Town',
    '3:1': 'Viridian City',
    '3:2': 'Pewter City',
    '3:3': 'Cerulean City',
    '3:4': 'Lavender Town',
    '3:5': 'Vermilion City',
    '3:6': 'Celadon City',
    '3:7': 'Fuchsia City',
    '3:8': 'Cinnabar Island',
    '3:9': 'Indigo Plateau',
    '3:10': 'Saffron City',
    '3:11': 'Saffron City',
    '3:12': 'One Island',
    '3:13': 'Two Island',
    '3:14': 'Three Island',
    '3:15': 'Four Island',
    '3:16': 'Five Island',
    '3:17': 'Seven Island',
    '3:18': 'Six Island',
    '3:19': 'Route 1',
    '3:20': 'Route 2',
    '3:21': 'Route 3',
    '3:22': 'Route 4',
    '3:23': 'Route 5',
    '3:24': 'Route 6',
    '3:25': 'Route 7',
    '3:26': 'Route 8',
    '3:27': 'Route 9',
    '3:28': 'Route 10',
    '3:29': 'Route 11',
    '3:30': 'Route 12',
    '3:31': 'Route 13',
    '3:32': 'Route 14',
    '3:33': 'Route 15',
    '3:34': 'Route 16',
    '3:35': 'Route 17',
    '3:36': 'Route 18',
    '3:37': 'Route 19',
    '3:38': 'Route 20',
    '3:39': 'Route 21 North',
    '3:40': 'Route 21 South',
    '3:41': 'Route 22',
    '3:42': 'Route 23',
    '3:43': 'Route 24',
    '3:44': 'Route 25',
    '3:45': 'Kindle Road',
    '3:46': 'Treasure Beach',
    '3:47': 'Cape Brink',
    '3:48': 'Bond Bridge',
    '3:49': 'Three Island Port',
    '3:54': 'Resort Gorgeous',
    '3:55': 'Water Labyrinth',
    '3:56': 'Five Island Meadow',
    '3:57': 'Memorial Pillar',
    '3:58': 'Outcast Island',
    '3:59': 'Green Path',
    '3:60': 'Water Path',
    '3:61': 'Ruin Valley',
    '3:62': 'Trainer Tower',
    '3:63': 'Sevault Canyon Entrance',
    '3:64': 'Sevault Canyon',
    '3:65': 'Tanoby Ruins',

    // Group 4: gMapGroup_IndoorPallet
    '4:0': "Player's House 1F",
    '4:1': "Player's House 2F",
    '4:2': "Rival's House",
    '4:3': "Prof. Oak's Lab",

    // Group 5: gMapGroup_IndoorViridian
    '5:0': 'Viridian City House',
    '5:1': 'Viridian City Gym',
    '5:2': 'Viridian City School',
    '5:3': 'Viridian City Mart',
    '5:4': 'Viridian Pokemon Center',

    // Group 6: gMapGroup_IndoorPewter
    '6:0': 'Pewter Museum 1F',
    '6:1': 'Pewter Museum 2F',
    '6:2': 'Pewter City Gym',
    '6:3': 'Pewter City Mart',
    '6:4': 'Pewter City House',
    '6:5': 'Pewter Pokemon Center',

    // Group 7: gMapGroup_IndoorCerulean
    '7:0': 'Cerulean City House',
    '7:3': 'Cerulean Pokemon Center',
    '7:5': 'Cerulean City Gym',
    '7:6': 'Cerulean Bike Shop',
    '7:7': 'Cerulean City Mart',

    // Group 8: gMapGroup_IndoorLavender
    '8:0': 'Lavender Pokemon Center',
    '8:4': 'Lavender Name Rater',
    '8:5': 'Lavender Mart',

    // Group 9: gMapGroup_IndoorVermilion
    '9:1': 'Vermilion Pokemon Center',
    '9:3': 'Pokemon Fan Club',
    '9:5': 'Vermilion Mart',
    '9:6': 'Vermilion Gym',

    // Group 10: gMapGroup_IndoorCeladon
    '10:0': 'Celadon Dept Store 1F',
    '10:1': 'Celadon Dept Store 2F',
    '10:2': 'Celadon Dept Store 3F',
    '10:3': 'Celadon Dept Store 4F',
    '10:4': 'Celadon Dept Store 5F',
    '10:5': 'Celadon Dept Store Roof',
    '10:12': 'Celadon Pokemon Center',
    '10:14': 'Celadon Game Corner',
    '10:15': 'Celadon Prize Room',
    '10:16': 'Celadon Gym',

    // Group 11: gMapGroup_IndoorFuchsia
    '11:0': 'Safari Zone Gate',
    '11:1': 'Fuchsia Mart',
    '11:3': 'Fuchsia Gym',
    '11:5': 'Fuchsia Pokemon Center',
    '11:7': "Warden's House",

    // Group 12: gMapGroup_IndoorCinnabar
    '12:0': 'Cinnabar Gym',
    '12:1': 'Pokemon Lab',
    '12:5': 'Cinnabar Pokemon Center',
    '12:6': 'Cinnabar Mart',

    // Group 13: gMapGroup_IndoorIndigoPlateau
    '13:0': 'Indigo Plateau Pokemon Center',

    // Group 14: gMapGroup_IndoorSaffron
    '14:0': "Copycat's House 1F",
    '14:1': "Copycat's House 2F",
    '14:2': 'Fighting Dojo',
    '14:3': 'Saffron Gym',
    '14:5': 'Saffron Mart',
    '14:7': 'Saffron Pokemon Center',

    // Group 15: gMapGroup_IndoorRoute2
    '15:0': 'Route 2 Gate',
    '15:1': "Mr. Pokemon's House",
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
      // Read location from saveblock1 - this is the authoritative source
      const sb1Ptr = this.readGBADword(EmulatorManager.ADDRESSES.SAVEBLOCK1_PTR);
      if (!sb1Ptr || sb1Ptr < 0x02000000 || sb1Ptr > 0x0203FFFF) {
        console.log('Invalid saveblock1 pointer for location');
        return null;
      }

      const mapGroup = this.readGBAByte(sb1Ptr + EmulatorManager.ADDRESSES.SB1_MAP_GROUP);
      const mapNum = this.readGBAByte(sb1Ptr + EmulatorManager.ADDRESSES.SB1_MAP_NUM);

      console.log(`Map read from SB1: group=${mapGroup}, number=${mapNum}`);

      if (mapGroup === null || mapNum === null) {
        console.log('Could not read map group/number');
        return null;
      }

      // Look up location name
      const key = `${mapGroup}:${mapNum}`;
      const locationName = EmulatorManager.LOCATION_NAMES[key];

      if (locationName) {
        console.log(`Location found: ${locationName}`);
        return locationName;
      }

      // Return raw coordinates if not in our lookup table
      console.log(`Location not in lookup table: ${key}`);
      return `Map ${mapGroup}-${mapNum}`;
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
      // Money is in SaveBlock1, but the encryption key is in SaveBlock2
      // Source: https://github.com/pret/pokefirered/blob/master/include/global.h
      const sb1Ptr = this.readGBADword(EmulatorManager.ADDRESSES.SAVEBLOCK1_PTR);
      const sb2Ptr = this.readGBADword(EmulatorManager.ADDRESSES.SAVEBLOCK2_PTR);

      if (!sb1Ptr || sb1Ptr < 0x02000000 || sb1Ptr > 0x0203FFFF) {
        console.log('Invalid saveblock1 pointer for money');
        return null;
      }
      if (!sb2Ptr || sb2Ptr < 0x02000000 || sb2Ptr > 0x0203FFFF) {
        console.log('Invalid saveblock2 pointer for security key');
        return null;
      }

      // Read encrypted money from SaveBlock1
      const encryptedMoney = this.readGBADword(sb1Ptr + EmulatorManager.ADDRESSES.SB1_MONEY);
      // Read security key from SaveBlock2 (NOT SaveBlock1!)
      const securityKey = this.readGBADword(sb2Ptr + EmulatorManager.ADDRESSES.SB2_SECURITY_KEY);

      if (encryptedMoney === null) {
        console.log('Could not read money value');
        return null;
      }

      // Decrypt money by XORing with security key
      // If security key is 0 or null, the value might be unencrypted (early game)
      let money;
      if (securityKey === null || securityKey === 0) {
        money = encryptedMoney >>> 0;
        console.log(`Money (unencrypted or key=0): ${money}`);
      } else {
        money = (encryptedMoney ^ securityKey) >>> 0;
        console.log(`Money: ${money} (encrypted: 0x${(encryptedMoney>>>0).toString(16)}, key: 0x${(securityKey>>>0).toString(16)})`);
      }

      // Sanity check: money should be 0-999999 in Pokemon games
      if (money > 999999) {
        console.log(`Warning: money value ${money} exceeds max (999999), may be incorrect`);
      }

      return money;
    } catch (error) {
      console.error('Error reading money:', error);
      return null;
    }
  }

  readPartyData() {
    try {
      // Party data starts at 0x02024284
      // Party count is stored separately - we'll detect it by checking which Pokemon slots are valid
      const pokemonSize = 100;
      const dataStart = 0x02024284; // Verified correct address for Fire Red

      const party = [];

      // Read up to 6 Pokemon, stopping when we hit an empty slot (PID = 0)
      for (let i = 0; i < 6; i++) {
        const pokemonAddr = dataStart + (i * pokemonSize);
        const pid = this.readGBADword(pokemonAddr);

        // Empty slot has PID of 0
        if (pid === null || pid === 0) {
          break;
        }

        const pokemonData = this.readPokemonData(pokemonAddr);
        if (pokemonData) {
          party.push(pokemonData);
        }
      }

      console.log(`Party count (detected): ${party.length}`);
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
      // Bytes 0-3: Personality Value (PID)
      // Bytes 4-7: Original Trainer ID
      // Bytes 8-17: Nickname (10 bytes)
      // Bytes 18-19: Language
      // Bytes 20-31: OT Name (7 bytes + terminator)
      // Bytes 32-79: Encrypted data substructures (48 bytes)
      // Bytes 80-83: Status condition
      // Byte 84: Level
      // Byte 85: Pokerus remaining
      // Bytes 86-87: Current HP
      // Bytes 88-89: Max HP
      // Bytes 90-91: Attack
      // Bytes 92-93: Defense
      // Bytes 94-95: Speed
      // Bytes 96-97: Sp. Attack
      // Bytes 98-99: Sp. Defense

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
      const level = this.readGBAByte(address + 84);
      const currentHP = this.readGBAWord(address + 86);
      const maxHP = this.readGBAWord(address + 88);
      const attack = this.readGBAWord(address + 90);
      const defense = this.readGBAWord(address + 92);
      const speed = this.readGBAWord(address + 94);

      console.log(`Pokemon at 0x${address.toString(16)}: ${nickname}, Lv${level}, HP ${currentHP}/${maxHP}`);

      return {
        nickname,
        level: level || 0,
        currentHP: currentHP || 0,
        maxHP: maxHP || 0,
        attack: attack || 0,
        defense: defense || 0,
        speed: speed || 0,
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
  }
}

export default EmulatorManager;
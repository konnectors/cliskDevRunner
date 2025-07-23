/**
 * CliskPage Module
 * Encapsulates page creation, post-me communication, and logging for a single page context
 */

import { ParentHandshake } from 'post-me';
import { createPageLoggers } from './log-config.js';

/**
 * CliskPage class - manages a single page with isolated communication and logging
 */
export class CliskPage {
  /**
   * Create a new CliskPage instance
   * @param {Object} context - Browser context from Playwright
   * @param {string} pageName - Unique name for this page (used for debug namespaces)
   * @param {Object} options - Configuration options
   */
  constructor(context, pageName, options = {}) {
    this.context = context;
    this.pageName = pageName;
    this.options = {
      userAgent: 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36',
      viewport: { width: 375, height: 667 },
      ...options
    };
    
    // Create debug loggers for this page using the centralized system
    const loggers = createPageLoggers(pageName);
    this.log = loggers.main;
    this.pageLog = loggers.page;
    this.messageLog = loggers.message;
    this.commLog = loggers.comm;
    this.navLog = loggers.nav;
    
    // Instance variables for isolated state
    this.page = null;
    this.connection = null;
    this.messageHandler = null;
    this.isInitialized = false;
    this.functionsExposed = false; // Track if functions have been exposed
    
    // Auto-reconnection state
    this.connectorPath = null;
    this.loaderFunction = null;
    this.isAutoReconnectEnabled = false;
    this.currentUrl = null;
    
    // Inter-page communication
    this.workerReference = null;
    this.reconnectionPromises = new Map(); // Track pending reconnection promises
    this.onReconnectionComplete = null; // Callback for successful reconnection
    this.onReconnectionFailure = null; // Callback for failed reconnection
  }

  /**
   * Initialize the page and setup basic configuration
   */
  async init() {
    this.log('🚀 Initializing page: %s', this.pageName);
    
    // Create new page with mobile simulation
    this.page = await this.context.newPage();
    
    // Setup console logging for this page
    this.setupConsoleLogging();
    
    // Setup post-me communication bridge BEFORE any navigation
    await this.setupPostMeCommunication();
    
    this.isInitialized = true;
    this.log('✅ Page initialized: %s', this.pageName);
    
    return this.page;
  }

  /**
   * Navigate to a URL
   * @param {string} url - URL to navigate to
   */
  async navigate(url = 'about:blank') {
    if (!this.isInitialized) {
      throw new Error('Page must be initialized before navigation');
    }
    
    this.log('🌐 Navigating to: %s', url);
    await this.page.goto(url);
    
    // Wait a bit for the page to be ready and scripts to execute
    await this.page.waitForTimeout(500);
  }

  /**
   * Load and inject connector code
   * @param {string} connectorPath - Path to the connector directory
   * @param {Function} loaderFunction - Function to load the connector
   * @param {boolean} enableAutoReconnect - Enable automatic reconnection on URL changes
   */
  async loadConnector(connectorPath, loaderFunction, enableAutoReconnect = true) {
    if (!this.isInitialized) {
      throw new Error('Page must be initialized before loading connector');
    }
    
    this.log('📦 Loading connector: %s', connectorPath);
    
    // Store connector details for potential reconnection
    this.connectorPath = connectorPath;
    this.loaderFunction = loaderFunction;
    this.isAutoReconnectEnabled = enableAutoReconnect;
    
    const manifest = await loaderFunction(this.page, connectorPath);
    this.log('📋 Loaded: %s v%s', manifest.name, manifest.version);
    
    // Start monitoring URL changes if auto-reconnect is enabled
    if (enableAutoReconnect) {
      this.setupUrlChangeMonitoring();
    }
    
    return manifest;
  }

  /**
   * Initiate post-me handshake
   * @param {Object} options - Handshake options
   */
  async initiateHandshake(options = {}) {
    if (!this.isInitialized) {
      throw new Error('Page must be initialized before handshake');
    }
    
    const {
      maxAttempts = 10,
      attemptInterval = 1000,
      waitTime = 3000
    } = options;

    this.commLog('🤝 Initiating post-me handshake...');
    
    const messenger = this.createMessenger();
    const localMethods = this.getLocalMethods();

    try {
      // Wait for connector to be ready
      this.commLog('⏳ Waiting for connector to initialize...');
      await this.page.waitForTimeout(waitTime);
      
      // Initiate handshake
      this.commLog('🚀 Starting ParentHandshake...');
      
      this.connection = await ParentHandshake(
        messenger,
        localMethods,
        maxAttempts,
        attemptInterval
      );
      
      this.commLog('✅ Post-me handshake successful!');
      
      // Setup event listeners
      this.connection.remoteHandle().addEventListener('test-event', (data) => {
        this.commLog('🎊 Received event from connector: %O', data);
      });
      
      // Emit ready event
      this.connection.localHandle().emit('playwright-ready', { 
        message: `Playwright page ${this.pageName} is ready!`,
        timestamp: Date.now(),
        pageName: this.pageName
      });
      
      this.commLog('🎯 Post-me connection fully established!');
      
      // Automatically set the content script type (required by cozy-clisk connectors)
      try {
        const scriptType = this.pageName === 'pilot' ? 'pilot' : 'worker';
        await this.connection.remoteHandle().call('setContentScriptType', scriptType);
        this.commLog('🏷️ [%s] Content script type set to: %s', this.pageName, scriptType);
      } catch (error) {
        this.commLog('⚠️ [%s] Failed to set content script type: %O', this.pageName, error);
      }
      
      return this.connection;
      
    } catch (error) {
      console.error(`❌ [${this.pageName}] Post-me handshake failed:`, error);
      throw error;
    }
  }

  /**
   * Get the page instance
   */
  getPage() {
    return this.page;
  }

  /**
   * Get the post-me connection
   */
  getConnection() {
    return this.connection;
  }

  /**
   * Close the page and cleanup
   */
  async close() {
    this.log('🛑 Closing page: %s', this.pageName);
    
    try {
      // Cancel any pending URL change monitoring
      if (this.urlChangeTimeout) {
        clearTimeout(this.urlChangeTimeout);
        this.urlChangeTimeout = null;
      }
      
      // Cleanup any pending reconnection promises
      if (this.reconnectionPromises) {
        for (const [id, promise] of this.reconnectionPromises.entries()) {
          if (promise.reject) {
            promise.reject(new Error('Page closing'));
          }
        }
        this.reconnectionPromises.clear();
      }
      
      // Cleanup worker reference callbacks
      if (this.workerReference) {
        this.workerReference.onReconnectionComplete = null;
      }
      
      // Close post-me connection first
      if (this.connection) {
        try {
          await this.connection.close();
        } catch (error) {
          // Ignore close errors
        }
        this.connection = null;
      }
      
      // Wait a moment for any pending operations
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Close the page
      if (this.page && !this.page.isClosed()) {
        await this.page.close();
      }
      this.page = null;
      
    } catch (error) {
      this.log('⚠️ Error during close: %O', error);
    }
    
    // Cleanup message handler
    this.messageHandler = null;
    this.isInitialized = false;
    
    this.log('✅ Page closed: %s', this.pageName);
  }

  /**
   * Setup console logging for this page
   * @private
   */
  setupConsoleLogging() {
    this.page.on('console', msg => {
      const type = msg.type();
      const text = msg.text();
      this.pageLog(`[${type}] ${text}`);
    });
  }

  /**
   * Setup post-me communication bridge for this page
   * @param {boolean} exposeFunction - Whether to expose functions (default: true)
   * @private
   */
  async setupPostMeCommunication(exposeFunctions = true) {
    this.commLog('🔗 Setting up post-me communication bridge...');
    
    // Only expose functions if requested and not already exposed
    if (exposeFunctions && !this.functionsExposed) {
      // Expose functions directly on this page
      await this.page.exposeFunction('sendToPlaywright', (data) => {
        if (this.messageHandler) {
          this.messageHandler(data);
        }
      });
      
      await this.page.exposeFunction('sendPageLog', (level, ...args) => {
        if (level === 'error') {
          console.error(`[${this.pageName} Page Error]`, ...args);
        } else {
          this.pageLog(`[${level}] %o`, args);
        }
      });
      
      this.functionsExposed = true;
      this.commLog('🔧 Functions exposed for %s', this.pageName);
    } else if (exposeFunctions) {
      this.commLog('✅ Functions already exposed for %s, skipping', this.pageName);
    } else {
      this.commLog('⏭️ Skipping function exposure for %s (reconnection mode)', this.pageName);
    }
    
    // Always inject the page script (this is safe to re-inject)
    await this.injectPageScript();
    
    this.commLog('🔧 Setup completed for %s', this.pageName);
  }

  /**
   * Inject the page-specific initialization script
   * @private
   */
  async injectPageScript() {
    // Inject page-specific initialization script
    const initScript = `
      console.log('[DEBUG] Init script starting for ${this.pageName}');
      
      // Create page-specific logger
      const pageLogger = {
        log: function(...args) {
          if (window.sendPageLog) {
            window.sendPageLog('log', ...args);
          }
        },
        error: function(...args) {
          if (window.sendPageLog) {
            window.sendPageLog('error', ...args);
          }
        }
      };
      
      // Test if functions are available
      console.log('[DEBUG] Checking functions for ${this.pageName}');
      console.log('[DEBUG] sendToPlaywright available:', typeof window.sendToPlaywright);
      console.log('[DEBUG] sendPageLog available:', typeof window.sendPageLog);
      
      // Create ReactNativeWebView object if it doesn't exist
      window.ReactNativeWebView = window.ReactNativeWebView || {};
      
      // Setup postMessage function that bridges to the host
      window.ReactNativeWebView.postMessage = function(message) {
        pageLogger.log('📤 [${this.pageName}] ReactNativeWebView posting:', message);
        
        // Parse message if it's a string
        let parsedMessage;
        try {
          parsedMessage = typeof message === 'string' ? JSON.parse(message) : message;
        } catch (e) {
          pageLogger.error('❌ [${this.pageName}] Failed to parse message:', e);
          parsedMessage = { raw: message };
        }
        
        // Forward post-me messages to Playwright
        if (parsedMessage.type === '@post-me') {
          pageLogger.log('🔄 [${this.pageName}→Playwright] Forwarding:', parsedMessage);
          if (window.sendToPlaywright) {
            window.sendToPlaywright(parsedMessage);
          } else {
            pageLogger.error('❌ [${this.pageName}] sendToPlaywright function not found!');
          }
        } else {
          // Dispatch as window message for non-post-me messages
          window.postMessage(parsedMessage, '*');
        }
      };
      
      // Setup message listener for messages FROM Playwright TO the connector
      window.addEventListener('message', function(event) {
        if (event.data && event.data.type === '@post-me') {
          pageLogger.log('📥 [Playwright→${this.pageName}] Received:', event.data);
        }
      });
      
      pageLogger.log('✅ [${this.pageName}] ReactNativeWebView and post-me bridge ready');
      console.log('[DEBUG] Init script completed for ${this.pageName}');
    `;
    
    await this.page.addInitScript(initScript);
    this.commLog('🔧 Setup script injected for %s', this.pageName);
  }

  /**
   * Setup URL change monitoring for automatic reconnection
   * @private
   */
  setupUrlChangeMonitoring() {
    if (!this.page) return;
    
    this.navLog('🔍 Setting up URL change monitoring for %s...', this.pageName);
    
    // Listen for URL changes (navigation events)
    this.page.on('framenavigated', async (frame) => {
      // Only handle main frame navigation
      if (frame !== this.page.mainFrame()) return;
      
      const newUrl = frame.url();
      const oldUrl = this.currentUrl;
      
      // Skip if it's the same URL or initial navigation
      if (!oldUrl || newUrl === oldUrl) {
        this.currentUrl = newUrl;
        return;
      }
      
      this.navLog('🌍 [%s] URL changed: %s → %s', this.pageName, oldUrl, newUrl);
      this.currentUrl = newUrl;
      
      // Skip about:blank navigations (common during testing)
      if (newUrl === 'about:blank') {
        this.navLog('⏭️ [%s] Skipping about:blank navigation', this.pageName);
        return;
      }
      
      // Trigger reconnection
      await this.handleUrlChange(newUrl, oldUrl);
    });
    
    // Track initial URL
    this.currentUrl = this.page.url();
    this.navLog('📍 [%s] Initial URL: %s', this.pageName, this.currentUrl);
  }

  /**
   * Handle URL change and attempt reconnection
   * @param {string} newUrl - New URL
   * @param {string} oldUrl - Previous URL
   * @private
   */
  async handleUrlChange(newUrl, oldUrl) {
    if (!this.isAutoReconnectEnabled || !this.connectorPath || !this.loaderFunction) {
      this.navLog('⚠️ [%s] Auto-reconnect not configured, skipping', this.pageName);
      return;
    }
    
    // Check if page is still valid
    if (!this.page || this.page.isClosed()) {
      this.navLog('⚠️ [%s] Page is closed, skipping auto-reconnection', this.pageName);
      return;
    }
    
    try {
      this.navLog('🔄 [%s] Starting auto-reconnection process...', this.pageName);
      
      // Close existing connection if any
      if (this.connection) {
        this.navLog('🔌 [%s] Closing existing connection...', this.pageName);
        this.connection.close();
        this.connection = null;
      }
      
      // Check again if page is still valid after closing connection
      if (!this.page || this.page.isClosed()) {
        this.navLog('⚠️ [%s] Page was closed during reconnection, aborting', this.pageName);
        return;
      }
      
      // Wait a bit for the new page to load
      this.navLog('⏳ [%s] Waiting for page to stabilize...', this.pageName);
      await this.page.waitForTimeout(1000);
      
      // Re-setup communication bridge WITHOUT exposing functions again
      // (functions persist at the context level, we just need to re-inject the page script)
      this.navLog('🔗 [%s] Re-setting up communication bridge...', this.pageName);
      await this.setupPostMeCommunication(false); // Don't expose functions again
      
      // Re-inject connector on the new page
      this.navLog('📦 [%s] Re-injecting connector...', this.pageName);
      await this.loaderFunction(this.page, this.connectorPath);
      
      // Re-establish handshake
      this.navLog('🤝 [%s] Re-establishing handshake...', this.pageName);
      const messenger = this.createMessenger();
      const localMethods = this.getLocalMethods();
      
      this.connection = await ParentHandshake(
        messenger,
        localMethods,
        10, // maxAttempts
        1000 // attemptInterval
      );
      
      // Setup event listeners
      this.connection.remoteHandle().addEventListener('test-event', (data) => {
        this.commLog('🎊 Received event from reconnected connector: %O', data);
      });
      
      // Emit ready event
      this.connection.localHandle().emit('playwright-ready', { 
        message: `Playwright page ${this.pageName} reconnected!`,
        timestamp: Date.now(),
        pageName: this.pageName,
        newUrl,
        oldUrl
      });
      
      // Re-set content script type after reconnection (required by cozy-clisk connectors)
      try {
        const scriptType = this.pageName === 'pilot' ? 'pilot' : 'worker';
        await this.connection.remoteHandle().call('setContentScriptType', scriptType);
        this.navLog('🏷️ [%s] Content script type re-set to: %s after reconnection', this.pageName, scriptType);
      } catch (error) {
        this.navLog('⚠️ [%s] Failed to re-set content script type after reconnection: %O', this.pageName, error);
      }
      
      this.navLog('✅ [%s] Auto-reconnection successful!', this.pageName);
      this.log('🔄 [%s] Successfully reconnected after URL change', this.pageName);
      
      // Signal reconnection completion for any waiting promises
      this.navLog('🔔 [%s] Checking for reconnection callback: %s', this.pageName, typeof this.onReconnectionComplete);
      if (this.onReconnectionComplete) {
        this.navLog('📞 [%s] Calling onReconnectionComplete with URL: %s', this.pageName, newUrl);
        this.onReconnectionComplete(newUrl);
      } else {
        this.navLog('⚠️ [%s] No onReconnectionComplete callback found', this.pageName);
      }
      
    } catch (error) {
      this.navLog('❌ [%s] Auto-reconnection failed: %O', this.pageName, error);
      console.error(`❌ [${this.pageName}] Auto-reconnection failed:`, error);
      
      // Signal reconnection failure for any waiting promises
      if (this.onReconnectionFailure) {
        this.onReconnectionFailure(newUrl, error);
      }
    }
  }

  /**
   * Enable or disable automatic reconnection
   * @param {boolean} enabled - Whether to enable auto-reconnection
   */
  setAutoReconnect(enabled) {
    this.isAutoReconnectEnabled = enabled;
    this.navLog('🔧 [%s] Auto-reconnect %s', this.pageName, enabled ? 'enabled' : 'disabled');
  }

  /**
   * Manually trigger a reconnection (useful for testing)
   */
  async manualReconnect() {
    const currentUrl = this.page ? this.page.url() : null;
    if (currentUrl) {
      this.navLog('🔄 [%s] Manual reconnection triggered', this.pageName);
      await this.handleUrlChange(currentUrl, 'manual-trigger');
    } else {
      throw new Error('Page not available for manual reconnection');
    }
  }

  /**
   * Create a messenger for this page
   * @private
   */
  createMessenger() {
    return {
      postMessage: async (message, transfer) => {
        this.messageLog('➡️ [Playwright→%s] Sending: %O', this.pageName, message);
        
        await this.page.evaluate((msg) => {
          window.postMessage(msg, '*');
        }, message);
      },
      
      addMessageListener: (listener) => {
        this.commLog('👂 Setting up message listener for %s...', this.pageName);
        
        // Store the listener for this page instance
        this.messageHandler = (data) => {
          this.messageLog('📨 [%s→Playwright] Received: %O', this.pageName, data);
          listener({ data });
        };
        
        // Return cleanup function
        return () => {
          this.commLog('🧹 Cleaning up message listener for %s', this.pageName);
          this.messageHandler = null;
        };
      }
    };
  }

  /**
   * Get local methods that can be called by the connector
   * @private
   */
  getLocalMethods() {
    const baseMethods = {
      // Method that connector can call
      ping: () => {
        this.commLog('🏓 [%s] Ping received from connector!', this.pageName);
        return `pong from ${this.pageName}`;
      },
      
      // Method to log messages
      log: (message) => {
        this.commLog('📝 [%s] Connector says: %s', this.pageName, message);
      },
      
      // Method to get page info
      getPageInfo: () => {
        this.commLog('ℹ️ [%s] Page info requested', this.pageName);
        return { 
          pageName: this.pageName, 
          timestamp: Date.now(),
          status: 'ready'
        };
      },
      
      // Method to simulate a response
      simulateResponse: (data) => {
        this.commLog('🎭 [%s] Simulating response for: %O', this.pageName, data);
        return { 
          success: true, 
          timestamp: Date.now(), 
          echo: data,
          pageName: this.pageName
        };
      },

      // Method to set content script type (required by cozy-clisk connectors)
      setContentScriptType: (contentScriptType) => {
        this.commLog('🏷️ [%s] setContentScriptType called with: %s', this.pageName, contentScriptType);
        // Store the content script type
        this.contentScriptType = contentScriptType;
        return true;
      }
    };

    // Add pilot-specific methods
    if (this.pageName === 'pilot') {
      baseMethods.setWorkerState = async (state) => {
        this.commLog('🎯 [%s] setWorkerState called with: %O', this.pageName, state);
        return await this.setWorkerState(state);
      };

      baseMethods.runInWorker = async (method, ...args) => {
        this.commLog('🔧 [%s] runInWorker called: method=%s, args=%O', this.pageName, method, args);
        
        if (!this.workerReference) {
          throw new Error('Worker reference not set. Call setWorkerReference first.');
        }
        
        if (!this.workerReference.connection) {
          throw new Error('Worker connection not available.');
        }
        
        try {
          // Call the specified method on the worker with the provided arguments
          const result = await this.workerReference.connection.remoteHandle().call(method, ...args);
          this.commLog('✅ [%s] runInWorker result: %O', this.pageName, result);
          return result;
        } catch (error) {
          this.commLog('❌ [%s] runInWorker error: %O', this.pageName, error);
          throw error;
        }
      };
    }

    return baseMethods;
  }

  /**
   * Set worker reference for pilot page (enables cross-page communication)
   * @param {CliskPage} workerPage - Reference to the worker page
   */
  setWorkerReference(workerPage) {
    if (this.pageName === 'pilot') {
      this.workerReference = workerPage;
      this.log('🔗 [%s] Worker reference set for cross-page communication', this.pageName);
    } else {
      throw new Error('setWorkerReference can only be called on pilot pages');
    }
  }

  /**
   * Set worker state (URL) and wait for reconnection - only available for pilot
   * @param {Object} state - State object containing url
   * @returns {Promise} Promise that resolves when worker reconnection is complete
   */
  async setWorkerState(state) {
    if (this.pageName !== 'pilot') {
      throw new Error('setWorkerState can only be called from pilot pages');
    }
    
    if (!this.workerReference) {
      throw new Error('Worker reference not set. Call setWorkerReference first.');
    }
    
    const { url } = state;
    if (!url) {
      throw new Error('setWorkerState requires a url in the state object');
    }
    
    this.log('🎯 [%s] Setting worker URL to: %s', this.pageName, url);
    
    // Create a promise that will resolve when worker reconnection is complete
    const reconnectionId = Date.now().toString();
    
    const reconnectionPromise = new Promise((resolve, reject) => {
      // Set a timeout to avoid hanging forever
      const timeout = setTimeout(() => {
        this.reconnectionPromises.delete(reconnectionId);
        reject(new Error(`Worker reconnection timeout after navigating to ${url}`));
      }, 30000); // 30 second timeout
      
      // Store the resolve function to be called when reconnection completes
      this.reconnectionPromises.set(reconnectionId, {
        resolve: (result) => {
          clearTimeout(timeout);
          this.reconnectionPromises.delete(reconnectionId);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeout);
          this.reconnectionPromises.delete(reconnectionId);
          reject(error);
        },
        url,
        startTime: Date.now()
      });
    });
    
    // Setup a one-time listener for worker reconnection
    const pilot = this; // Capture pilot reference for callback
    this.log('🔧 [%s] Setting up onReconnectionComplete callback on worker', this.pageName);
    this.workerReference.onReconnectionComplete = (reconnectedUrl) => {
      pilot.log('📞 [%s] onReconnectionComplete callback triggered for URL: %s', pilot.pageName, reconnectedUrl);
      // Find and resolve any pending promises for this URL
      for (const [id, promise] of pilot.reconnectionPromises.entries()) {
        // Normalize URLs for comparison (remove trailing slash)
        const normalizeUrl = (url) => url.replace(/\/$/, '');
        const expectedUrl = normalizeUrl(promise.url);
        const actualUrl = normalizeUrl(reconnectedUrl);
        
        pilot.log('🔍 [%s] Comparing URLs: expected="%s" actual="%s"', pilot.pageName, expectedUrl, actualUrl);
        
        if (expectedUrl === actualUrl) {
          pilot.log('✅ [%s] Worker reconnection complete for URL: %s (took %dms)', 
            pilot.pageName, reconnectedUrl, Date.now() - promise.startTime);
          promise.resolve({ 
            success: true, 
            url: reconnectedUrl, 
            duration: Date.now() - promise.startTime 
          });
        }
      }
    };
    
    // Navigate worker to new URL (this will trigger auto-reconnection)
    try {
      await this.workerReference.navigate(url);
      this.log('🌐 [%s] Worker navigation initiated to: %s', this.pageName, url);
    } catch (error) {
      // If navigation fails, reject all pending promises
      const promise = this.reconnectionPromises.get(reconnectionId);
      if (promise) {
        promise.reject(new Error(`Worker navigation failed: ${error.message}`));
      }
      throw error;
    }
    
    // Return the promise that will resolve when reconnection is complete
    return reconnectionPromise;
  }
} 
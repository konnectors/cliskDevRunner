/**
 * CliskPage Module
 * Encapsulates page creation, post-me communication, and logging for a single page context
 */

import { ParentHandshake } from 'post-me';
import debug from 'debug';
import { EventEmitter } from 'events';

/**
 * CliskPage class - manages a single page with isolated communication and logging
 * Extends EventEmitter to provide event-driven architecture
 */
export class CliskPage extends EventEmitter {
  /**
   * Create a new CliskPage instance
   * @param {Object} context - Browser context from Playwright
   * @param {string} pageName - Unique name for this page (used for debug namespaces)
   * @param {Object} options - Configuration options
   */
  constructor(context, pageName, options = {}) {
    super(); // Call EventEmitter constructor

    this.context = context;
    this.pageName = pageName;
    this.options = {
      userAgent: 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36',
      viewport: { width: 375, height: 667 },
      ...options
    };

    // Create debug loggers for this page using the centralized system
    this.log = debug(`clisk:${pageName}:main`);
    this.pageLog = debug(`clisk:${pageName}:page`);
    this.messageLog = debug(`clisk:${pageName}:message`);
    this.commLog = debug(`clisk:${pageName}:comm`);

    // Instance variables for isolated state
    this.page = null;
    this.connection = null;
    this.messageHandler = null;
    this.isInitialized = false;
    this.functionsExposed = false; // Track if functions have been exposed

    // State tracking for URL changes and handshakes
    this.isNavigationInProgress = false;
    this.isHandshakeInProgress = false;
    this.isUrlChangeWithHandshakeInProgress = false;
    this.currentNavigationUrl = null;
    this.navigationStartTime = null;
    this.handshakeStartTime = null;

    // Connector state for potential reconnection
    this.connectorPath = null;
    this.loaderFunction = null;

    // Additional local methods (can be extended by services)
    this.additionalLocalMethods = {};
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

    // Set navigation state
    this.isNavigationInProgress = true;
    this.currentNavigationUrl = url;
    this.navigationStartTime = Date.now();

    try {
      this.log('🌐 Navigating to: %s', url);
      await this.page.goto(url);

      // Wait a bit for the page to be ready and scripts to execute
      await this.page.waitForTimeout(500);

      this.log('✅ Navigation completed to: %s', url);
    } catch (error) {
      this.log('❌ Navigation failed to: %s - %O', url, error);
      throw error;
    } finally {
      // Reset navigation state
      this.isNavigationInProgress = false;
      this.currentNavigationUrl = null;
      this.navigationStartTime = null;
    }
  }

  /**
   * Load and inject connector code
   * @param {string} connectorPath - Path to the connector directory
   * @param {Function} loaderFunction - Function to load the connector
   */
  async loadConnector(connectorPath, loaderFunction) {
    if (!this.isInitialized) {
      throw new Error('Page must be initialized before loading connector');
    }

    this.log('📦 Loading connector: %s', connectorPath);

    // Store connector details for potential reconnection
    this.connectorPath = connectorPath;
    this.loaderFunction = loaderFunction;

    const manifest = await loaderFunction(this.page, connectorPath);
    this.log('📋 Loaded: %s v%s', manifest.name, manifest.version);

    return manifest;
  }

  /**
   * Initiate post-me handshake
   * @param {Object} options - Handshake options
   * @param {string} contentScriptType - Content script type (pilot or worker), optional
   */
  async initiateHandshake(options = {}, contentScriptType = null) {
    if (!this.isInitialized) {
      throw new Error('Page must be initialized before handshake');
    }

    const { maxAttempts = 10, attemptInterval = 1000, waitTime = 3000 } = options;

    // Set handshake state
    this.isHandshakeInProgress = true;
    this.handshakeStartTime = Date.now();

    this.commLog('🤝 Initiating post-me handshake...');

    const messenger = this.createMessenger();
    const localMethods = this.getLocalMethods();

    // Debug: log available methods
    this.commLog('🔍 [%s] Available local methods: %O', this.pageName, Object.keys(localMethods));

    try {
      // Wait for connector to be ready
      this.commLog('⏳ Waiting for connector to initialize...');

      // Check if page is still valid before waiting
      if (!this.page || this.page.isClosed()) {
        throw new Error('Page was closed before handshake could complete');
      }

      try {
        await this.page.waitForTimeout(waitTime);
      } catch (error) {
        if (error.message.includes('Target page, context or browser has been closed')) {
          throw new Error('Page was closed during handshake initialization');
        }
        throw error;
      }

      // Initiate handshake
      this.commLog('🚀 Starting ParentHandshake...');

      this.connection = await ParentHandshake(messenger, localMethods, maxAttempts, attemptInterval);

      this.commLog('✅ Post-me handshake successful!');

      // Set content script type if provided
      if (contentScriptType) {
        try {
          await this.connection.remoteHandle().call('setContentScriptType', contentScriptType);
          this.commLog('🏷️ [%s] Content script type set to: %s', this.pageName, contentScriptType);
        } catch (error) {
          this.commLog('⚠️ [%s] Failed to set content script type: %O', this.pageName, error);
        }
      }

      // Emit handshake success event
      this.emit('connection:success', {
        pageName: this.pageName,
        connection: this.connection,
        url: this.page.url(),
        timestamp: Date.now(),
        duration: Date.now() - this.handshakeStartTime
      });

      return this.connection;
    } catch (error) {
      // Don't log errors if page is closed (normal during cleanup)
      const isPageClosedError =
        error.message &&
        (error.message.includes('Target page, context or browser has been closed') ||
          error.message.includes('Page was closed during handshake initialization') ||
          error.message.includes('Page was closed before handshake could complete'));

      if (!isPageClosedError) {
        console.error(`❌ [${this.pageName}] Post-me handshake failed:`, error);
      }
      throw error;
    } finally {
      // Reset handshake state
      this.isHandshakeInProgress = false;
      this.handshakeStartTime = null;
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

    // Cleanup message handler and state
    this.messageHandler = null;
    this.isInitialized = false;

    // Reset all state tracking flags
    this.isNavigationInProgress = false;
    this.isHandshakeInProgress = false;
    this.isUrlChangeWithHandshakeInProgress = false;
    this.currentNavigationUrl = null;
    this.navigationStartTime = null;
    this.handshakeStartTime = null;

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
      await this.page.exposeFunction('sendToPlaywright', data => {
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
      
      // Create ReactNativeWebView object if it doesn't exist
      window.ReactNativeWebView = window.ReactNativeWebView || {};
      
      // Setup postMessage function that bridges to the host
      window.ReactNativeWebView.postMessage = function(message) {
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
      
      pageLogger.log('✅ [${this.pageName}] ReactNativeWebView and post-me bridge ready');
    `;

    await this.page.addInitScript(initScript);
    this.commLog('🔧 Setup script injected for %s', this.pageName);
  }

  /**
   * Create a messenger for this page
   * @private
   */
  createMessenger() {
    return {
      postMessage: async (message, transfer) => {
        // this.messageLog('➡️ [Playwright→%s] Sending: %O', this.pageName, message);

        try {
          await this.page.evaluate(msg => {
            window.postMessage(msg, '*');
          }, message);
        } catch (error) {
          if (error.message && error.message.includes('Execution context was destroyed')) {
            this.commLog('🔄 Execution context destroyed during postMessage, treating as navigation for message: ' + JSON.stringify(message));
            throw new Error('EXECUTION_CONTEXT_DESTROYED: Navigation occurred during message sending');
          }
          throw error;
        }
      },

      addMessageListener: listener => {
        this.commLog('👂 Setting up message listener for %s...', this.pageName);

        // Store the listener for this page instance
        this.messageHandler = data => {
          // this.messageLog('📨 [%s→Playwright] Received: %O', this.pageName, data);
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
   * Add additional local methods that can be called by the connector
   * @param {Object} methods - Object containing method name-function pairs
   */
  addLocalMethods(methods) {
    this.additionalLocalMethods = { ...this.additionalLocalMethods, ...methods };
    this.commLog('🔧 [%s] Added %d additional local methods', this.pageName, Object.keys(methods).length);
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
      }
    };

    // Merge with additional methods provided by services
    return { ...baseMethods, ...this.additionalLocalMethods };
  }
}

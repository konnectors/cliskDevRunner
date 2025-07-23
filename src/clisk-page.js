/**
 * CliskPage Module
 * Encapsulates page creation, post-me communication, and logging for a single page context
 */

import { ParentHandshake } from 'post-me';
import debug from 'debug';

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
    
    // Create debug loggers for this page
    this.log = debug(`clisk:${pageName}:main`);
    this.pageLog = debug(`clisk:${pageName}:page`);
    this.messageLog = debug(`clisk:${pageName}:message`);
    this.commLog = debug(`clisk:${pageName}:comm`);
    
    // Instance variables for isolated state
    this.page = null;
    this.connection = null;
    this.messageHandler = null;
    this.isInitialized = false;
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
   */
  async loadConnector(connectorPath, loaderFunction) {
    if (!this.isInitialized) {
      throw new Error('Page must be initialized before loading connector');
    }
    
    this.log('📦 Loading connector: %s', connectorPath);
    const manifest = await loaderFunction(this.page, connectorPath);
    this.log('📋 Loaded: %s v%s', manifest.name, manifest.version);
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
    
    if (this.connection) {
      this.connection.close();
      this.connection = null;
    }
    
    if (this.page) {
      await this.page.close();
      this.page = null;
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
   * @private
   */
  async setupPostMeCommunication() {
    this.commLog('🔗 Setting up post-me communication bridge...');
    
    // Create unique function names for this page to avoid conflicts
    const sendToPlaywrightFn = `sendToPlaywright_${this.pageName}`;
    const sendPageLogFn = `sendPageLog_${this.pageName}`;
    
    // Expose functions with unique names
    await this.page.exposeFunction(sendToPlaywrightFn, (data) => {
      if (this.messageHandler) {
        this.messageHandler(data);
      }
    });
    
    await this.page.exposeFunction(sendPageLogFn, (level, ...args) => {
      if (level === 'error') {
        console.error(`[${this.pageName} Page Error]`, ...args);
      } else {
        this.pageLog(`[${level}] %o`, args);
      }
    });
    
    // Inject page-specific initialization script
    const initScript = `
      console.log('[DEBUG] Init script starting for ${this.pageName}');
      
      // Create page-specific logger
      const pageLogger = {
        log: function(...args) {
          if (window.${sendPageLogFn}) {
            window.${sendPageLogFn}('log', ...args);
          }
        },
        error: function(...args) {
          if (window.${sendPageLogFn}) {
            window.${sendPageLogFn}('error', ...args);
          }
        }
      };
      
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
          if (window.${sendToPlaywrightFn}) {
            window.${sendToPlaywrightFn}(parsedMessage);
          } else {
            pageLogger.error('❌ [${this.pageName}] Function ${sendToPlaywrightFn} not found!');
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
      pageLogger.log('🔧 [${this.pageName}] Using functions: ${sendToPlaywrightFn}, ${sendPageLogFn}');
      console.log('[DEBUG] Init script completed for ${this.pageName}');
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
    return {
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
      }
    };
  }
} 
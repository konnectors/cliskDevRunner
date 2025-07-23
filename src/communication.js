/**
 * Communication Module
 * Handles post-me communication setup and handshake with connectors
 */

import { ParentHandshake } from 'post-me';
import debug from 'debug';

const log = debug('handshake:comm');
const playwrightLog = debug('handshake:playwright');
const messageLog = debug('handshake:message');

/**
 * Setup ReactNativeWebView.postMessage simulation and post-me communication bridge
 * @param {Page} page - Playwright page instance
 */
export async function setupPostMeCommunication(page) {
  log('🔗 Setting up post-me communication bridge...');
  
  // Initialize global handler
  global.playwrightMessageHandler = null;
  
  // Expose function to receive messages from the page
  await page.exposeFunction('sendToPlaywright', (data) => {
    // This will be handled by the messenger later
    if (global.playwrightMessageHandler) {
      global.playwrightMessageHandler(data);
    }
  });
  
  await page.addInitScript(() => {
    // Create ReactNativeWebView object if it doesn't exist
    window.ReactNativeWebView = window.ReactNativeWebView || {};
    
    // Setup postMessage function that bridges to the host
    window.ReactNativeWebView.postMessage = (message) => {
      console.log('📤 [ReactNativeWebView] Posting message:', message);
      
      // Parse message if it's a string
      let parsedMessage;
      try {
        parsedMessage = typeof message === 'string' ? JSON.parse(message) : message;
      } catch (e) {
        console.error('❌ [ReactNativeWebView] Failed to parse message:', e);
        parsedMessage = { raw: message };
      }
      
      // Dispatch as window message for post-me compatibility
      window.postMessage(parsedMessage, '*'); // Use '*' instead of window.location.origin for about:blank
    };
    
    // Setup message forwarding for post-me messages
    window.addEventListener('message', (event) => {
      // Only forward post-me messages to Playwright
      if (event.data && event.data.type === '@post-me') {
        console.log('🔄 [Page] Forwarding post-me message to Playwright:', event.data);
        if (window.sendToPlaywright) {
          window.sendToPlaywright(event.data);
        }
      }
    });
    
    console.log('✅ ReactNativeWebView.postMessage and post-me bridge ready');
  });
}

/**
 * Create a messenger that bridges Playwright with the page
 * @param {Page} page - Playwright page instance
 * @returns {Object} Messenger object compatible with post-me
 */
function createPlaywrightMessenger(page) {
  return {
    postMessage: async (message, transfer) => {
      messageLog('➡️ [Playwright→Page] Sending message: %O', message);
      
      // Send message to the page via window.postMessage
      await page.evaluate((msg) => {
        window.postMessage(msg, '*'); // Use '*' instead of window.location.origin since we're on about:blank
      }, message);
    },
    
    addMessageListener: (listener) => {
      playwrightLog('👂 Setting up message listener...');
      
      // Store the listener globally so the exposed function can access it
      global.playwrightMessageHandler = (data) => {
        messageLog('📨 [Page→Playwright] Message received: %O', data);
        listener({ data });
      };
      
      // Return cleanup function
      return () => {
        playwrightLog('🧹 Cleaning up message listener');
        global.playwrightMessageHandler = null;
      };
    }
  };
}

/**
 * Get the local methods that can be called by the connector
 * @returns {Object} Object containing methods exposed to the connector
 */
function getLocalMethods() {
  return {
    // Method that connector can call
    ping: () => {
      playwrightLog('🏓 Ping received from connector!');
      return 'pong';
    },
    
    // Method to log messages
    log: (message) => {
      playwrightLog('📝 [Connector→Playwright] %s', message);
    },
    
    // Method to simulate a response
    simulateResponse: (data) => {
      playwrightLog('🎭 Simulating response for: %O', data);
      return { success: true, timestamp: Date.now(), echo: data };
    }
  };
}

/**
 * Initiate post-me handshake using ParentHandshake
 * @param {Page} page - Playwright page instance
 * @param {Object} options - Configuration options
 * @param {number} options.maxAttempts - Maximum handshake attempts
 * @param {number} options.attemptInterval - Interval between attempts in ms
 * @param {number} options.waitTime - Time to wait before starting handshake in ms
 * @returns {Promise<Connection>} Post-me connection object
 */
export async function initiateHandshake(page, options = {}) {
  const {
    maxAttempts = 10,
    attemptInterval = 1000,
    waitTime = 3000
  } = options;

  log('🤝 Initiating post-me handshake...');
  
  const messenger = createPlaywrightMessenger(page);
  const localMethods = getLocalMethods();

  try {
    // Wait a bit for the connector to be ready
    log('⏳ Waiting for connector to initialize...');
    await page.waitForTimeout(waitTime);
    
    // Initiate handshake from parent side (Playwright)
    playwrightLog('🚀 Initiating ParentHandshake...');
    
    const connection = await ParentHandshake(
      messenger,
      localMethods,
      maxAttempts,
      attemptInterval
    );
    
    playwrightLog('✅ Post-me handshake successful!');
    
    // Test the connection
    try {
      playwrightLog('🧪 Testing connection...');
      
      // Try to call a method on the remote (connector) side if available
      // Note: the handshake connector might not expose methods, so this is just a test
      
    } catch (error) {
      playwrightLog('⚠️ Remote call test failed (this might be normal): %s', error.message);
    }
    
    // Listen for events from the connector
    connection.remoteHandle().addEventListener('test-event', (data) => {
      playwrightLog('🎊 Received event from connector: %O', data);
    });
    
    // Emit a test event to the connector
    connection.localHandle().emit('playwright-ready', { 
      message: 'Playwright is ready to communicate!',
      timestamp: Date.now()
    });
    
    log('🎯 Post-me connection is fully established and ready!');
    
    // Store connection globally for potential future use
    global.postMeConnection = connection;
    
    return connection;
    
  } catch (error) {
    console.error('❌ Post-me handshake failed:', error);
    console.error('Stack trace:', error.stack);
    throw error;
  }
} 
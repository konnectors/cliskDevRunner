/**
 * Communication Module
 * Handles post-me communication setup and handshake with connectors
 */

import { ParentHandshake } from 'post-me';

/**
 * Setup ReactNativeWebView.postMessage simulation and post-me communication bridge
 * @param {Page} page - Playwright page instance
 */
export async function setupPostMeCommunication(page) {
  console.log('🔗 Setting up post-me communication bridge...');
  
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
      console.log('➡️ [Playwright→Page] Sending message:', message);
      
      // Send message to the page via window.postMessage
      await page.evaluate((msg) => {
        window.postMessage(msg, '*'); // Use '*' instead of window.location.origin since we're on about:blank
      }, message);
    },
    
    addMessageListener: (listener) => {
      console.log('👂 [Playwright] Setting up message listener...');
      
      // Store the listener globally so the exposed function can access it
      global.playwrightMessageHandler = (data) => {
        console.log('📨 [Page→Playwright] Message received:', data);
        listener({ data });
      };
      
      // Return cleanup function
      return () => {
        console.log('🧹 [Playwright] Cleaning up message listener');
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
      console.log('🏓 [Playwright] Ping received from connector!');
      return 'pong';
    },
    
    // Method to log messages
    log: (message) => {
      console.log('📝 [Connector→Playwright]', message);
    },
    
    // Method to simulate a response
    simulateResponse: (data) => {
      console.log('🎭 [Playwright] Simulating response for:', data);
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

  console.log('🤝 Initiating post-me handshake...');
  
  const messenger = createPlaywrightMessenger(page);
  const localMethods = getLocalMethods();

  try {
    // Wait a bit for the connector to be ready
    console.log('⏳ Waiting for connector to initialize...');
    await page.waitForTimeout(waitTime);
    
    // Initiate handshake from parent side (Playwright)
    console.log('🚀 [Playwright] Initiating ParentHandshake...');
    
    const connection = await ParentHandshake(
      messenger,
      localMethods,
      maxAttempts,
      attemptInterval
    );
    
    console.log('✅ [Playwright] Post-me handshake successful!');
    
    // Test the connection
    try {
      console.log('🧪 [Playwright] Testing connection...');
      
      // Try to call a method on the remote (connector) side if available
      // Note: the handshake connector might not expose methods, so this is just a test
      
    } catch (error) {
      console.log('⚠️ [Playwright] Remote call test failed (this might be normal):', error.message);
    }
    
    // Listen for events from the connector
    connection.remoteHandle().addEventListener('test-event', (data) => {
      console.log('🎊 [Playwright] Received event from connector:', data);
    });
    
    // Emit a test event to the connector
    connection.localHandle().emit('playwright-ready', { 
      message: 'Playwright is ready to communicate!',
      timestamp: Date.now()
    });
    
    console.log('🎯 [Playwright] Post-me connection is fully established and ready!');
    
    // Store connection globally for potential future use
    global.postMeConnection = connection;
    
    return connection;
    
  } catch (error) {
    console.error('❌ [Playwright] Post-me handshake failed:', error);
    console.error('Stack trace:', error.stack);
    throw error;
  }
} 
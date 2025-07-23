import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ParentHandshake, debug as postMeDebug } from 'post-me';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONNECTOR_PATH = process.argv[2] || 'examples/handshake-konnector';

async function main() {
  console.log('🚀 Starting HandshakeTester...');
  console.log(`📁 Using connector: ${CONNECTOR_PATH}`);

  // Launch browser
  const browser = await chromium.launch({ 
    headless: false,
    args: ['--no-sandbox', '--disable-web-security']
  });
  
  const context = await browser.newContext({
    // Simulate mobile webview environment as per user memory
    userAgent: 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36',
    viewport: { width: 375, height: 667 }
  });

  const page = await context.newPage();

  // Setup console logging from page
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    console.log(`📄 [Console ${type}]`, text);
  });

  // Setup ReactNativeWebView.postMessage simulation and post-me communication
  await setupPostMeCommunication(page);
  
  // Navigate to about:blank
  await page.goto('about:blank');

  // Load and inject connector code
  await loadConnector(page, CONNECTOR_PATH);

  // Initiate the handshake after connector is loaded
  await initiateHandshake(page);

  // Keep the browser open for testing
  console.log('✅ Setup complete! Browser will stay open for testing...');
  console.log('Press Ctrl+C to close');

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down...');
    await browser.close();
    process.exit(0);
  });
}

/**
 * Setup ReactNativeWebView.postMessage simulation and post-me communication bridge
 */
async function setupPostMeCommunication(page) {
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
 * Initiate post-me handshake using ParentHandshake
 */
async function initiateHandshake(page) {
  console.log('🤝 Initiating post-me handshake...');
  
  // Create a custom messenger that bridges Playwright with the page
  const messenger = {
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

  // Setup local methods that can be called by the connector
  const localMethods = {
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

  try {
    // Wait a bit for the connector to be ready
    console.log('⏳ Waiting for connector to initialize...');
    await page.waitForTimeout(3000);
    
    // Initiate handshake from parent side (Playwright)
    console.log('🚀 [Playwright] Initiating ParentHandshake...');
    
    const connection = await ParentHandshake(
      messenger,
      localMethods,
      10, // max attempts
      1000 // attempt interval in ms
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
    
  } catch (error) {
    console.error('❌ [Playwright] Post-me handshake failed:', error);
    console.error('Stack trace:', error.stack);
  }
}

/**
 * Load and inject connector code into the page
 */
async function loadConnector(page, connectorPath) {
  console.log(`📦 Loading connector from ${connectorPath}...`);
  
  try {
    // Read connector main.js file
    const mainJsPath = path.join(__dirname, connectorPath, 'main.js');
    const connectorCode = readFileSync(mainJsPath, 'utf8');
    
    // Read manifest
    const manifestPath = path.join(__dirname, connectorPath, 'manifest.konnector');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    
    console.log(`📋 Connector: ${manifest.name} v${manifest.version}`);
    
    // Inject connector code
    await page.addScriptTag({
      content: connectorCode
    });
    
    console.log('✅ Connector code injected successfully');
    
  } catch (error) {
    console.error('❌ Error loading connector:', error.message);
    throw error;
  }
}

// Start the application
main().catch(console.error); 
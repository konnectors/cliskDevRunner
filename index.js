import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONNECTOR_PATH = process.argv[2] || 'examples/minimal-konnector';

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

  // Setup ReactNativeWebView.postMessage simulation
  await setupReactNativeWebView(page);
  
  // Setup post-me messenger for playwright
  await setupPostMeMessenger(page);

  // Navigate to about:blank
  await page.goto('about:blank');

  // Load and inject connector code
  await loadConnector(page, CONNECTOR_PATH);

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
 * Setup ReactNativeWebView.postMessage simulation
 */
async function setupReactNativeWebView(page) {
  console.log('📱 Setting up ReactNativeWebView.postMessage...');
  
  await page.addInitScript(() => {
    // Create ReactNativeWebView object if it doesn't exist
    window.ReactNativeWebView = window.ReactNativeWebView || {};
    
    // Setup postMessage function
    window.ReactNativeWebView.postMessage = (message) => {
      console.log('📤 [ReactNativeWebView] Received message:', message);
      
      // Parse message if it's a string
      let parsedMessage;
      try {
        parsedMessage = typeof message === 'string' ? JSON.parse(message) : message;
      } catch (e) {
        parsedMessage = { raw: message };
      }
      
      // Dispatch custom event that can be listened to
      window.dispatchEvent(new CustomEvent('reactnative-message', { 
        detail: parsedMessage 
      }));
    };
    
    console.log('✅ ReactNativeWebView.postMessage is ready');
  });
}

/**
 * Setup post-me messenger for playwright
 */
async function setupPostMeMessenger(page) {
  console.log('🔗 Setting up post-me messenger...');
  
  // Listen for messages from the page
  page.on('console', msg => {
    if (msg.type() === 'log' && msg.text().includes('[post-me]')) {
      console.log('🔔 [post-me]', msg.text());
    }
  });

  // Listen for ReactNative messages
  await page.exposeFunction('handleReactNativeMessage', (message) => {
    console.log('📥 [Host] Received from ReactNativeWebView:', message);
    
    // Handle post-me handshake messages
    if (message.type === '@post-me') {
      handlePostMeMessage(page, message);
    }
  });

  // Setup message listener in the page
  await page.addInitScript(() => {
    window.addEventListener('reactnative-message', (event) => {
      window.handleReactNativeMessage(event.detail);
    });
  });
}

/**
 * Handle post-me protocol messages
 */
async function handlePostMeMessage(page, message) {
  console.log('🤝 [post-me] Handling message:', message.action);
  
  if (message.action === 'handshake-request') {
    // Respond to handshake request
    const response = {
      type: '@post-me',
      action: 'handshake-response',
      source: 'PlaywrightHost',
      timestamp: Date.now(),
      payload: {
        accepted: true,
        methods: message.payload?.methods || [],
        connectionId: Math.random().toString(36).substr(2, 9)
      }
    };
    
    console.log('✅ [post-me] Sending handshake response');
    
    // Send response back to the page
    await page.evaluate((response) => {
      window.dispatchEvent(new MessageEvent('message', {
        data: response,
        origin: window.location.origin
      }));
    }, response);
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
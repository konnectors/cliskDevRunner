import { chromium } from 'playwright';
import debug from 'debug';
import { setupConsoleLogging } from './console-logger.js';
import { loadConnector } from './connector-loader.js';
import { setupPostMeCommunication, initiateHandshake } from './communication.js';

const log = debug('handshake:main');

// Configuration
const CONNECTOR_PATH = process.argv[2] || 'examples/handshake-konnector';

async function main() {
  log('🚀 Starting HandshakeTester...');
  log(`📁 Using connector: ${CONNECTOR_PATH}`);

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
  setupConsoleLogging(page);

  // Setup ReactNativeWebView.postMessage simulation and post-me communication
  await setupPostMeCommunication(page);
  
  // Navigate to about:blank
  await page.goto('about:blank');

  // Load and inject connector code
  const manifest = await loadConnector(page, CONNECTOR_PATH);

  // Initiate the handshake after connector is loaded
  const connection = await initiateHandshake(page);

  // Keep the browser open for testing
  log('✅ Setup complete! Browser will stay open for testing...');
  log('Press Ctrl+C to close');

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    log('\n🛑 Shutting down...');
    
    // Cleanup connection if it exists
    if (connection) {
      connection.close();
    }
    
    await browser.close();
    process.exit(0);
  });
}

// Start the application
main().catch(console.error); 
import { chromium } from 'playwright';
import debug from 'debug';
import { loadConnector } from './connector-loader.js';
import { CliskPage } from './clisk-page.js';

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

  // Create a CliskPage instance
  const mainPage = new CliskPage(context, 'main');
  
  try {
    // Initialize the page
    await mainPage.init();

    // Navigate to about:blank
    await mainPage.navigate('about:blank');

    // Load and inject connector code
    const manifest = await mainPage.loadConnector(CONNECTOR_PATH, loadConnector);

    // Initiate the handshake
    const connection = await mainPage.initiateHandshake();

    // Keep the browser open for testing
    log('✅ Setup complete! Browser will stay open for testing...');
    log('Press Ctrl+C to close');

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      log('\n🛑 Shutting down...');
      
      // Cleanup page
      await mainPage.close();
      
      await browser.close();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ Setup failed:', error);
    await mainPage.close();
    await browser.close();
    process.exit(1);
  }
}

// Start the application
main().catch(console.error); 
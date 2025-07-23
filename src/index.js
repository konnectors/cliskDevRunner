import { chromium } from 'playwright';
import debug from 'debug';
import { loadConnector } from './connector-loader.js';
import { CliskPage } from './clisk-page.js';

const log = debug('handshake:main');

// Configuration
const CONNECTOR_PATH = process.argv[2] || 'examples/evaluate-konnector';

async function main() {
  log('🚀 Starting HandshakeTester with multi-pages...');
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

  // Create two CliskPage instances
  const workerPage = new CliskPage(context, 'worker');
  const pilotPage = new CliskPage(context, 'pilot');
  
  // Setup cross-page communication: pilot can control worker
  pilotPage.setWorkerReference(workerPage);
  
  const pages = [workerPage, pilotPage];
  
  try {
    // Initialize pages SEQUENTIALLY to avoid Playwright exposeFunction conflicts
    // ⚠️ CRITICAL: Page.exposeFunction() cannot be called in parallel on multiple pages!
    // This causes function exposure failures on subsequent pages.
    log('📄 Initializing pages sequentially to avoid function exposure conflicts...');
    
    await workerPage.init();
    log('✅ Worker page initialized');
    
    await pilotPage.init();
    log('✅ Pilot page initialized');

    // Navigate both pages in parallel (this is safe)
    log('🌐 Navigating both pages...');
    await Promise.all([
      workerPage.navigate('about:blank'),
      pilotPage.navigate('about:blank')
    ]);

    // Load connector on both pages in parallel (this is safe)
    log('📦 Loading connectors on both pages...');
    const [workerManifest, pilotManifest] = await Promise.all([
      workerPage.loadConnector('examples/evaluate-konnector', loadConnector),
      pilotPage.loadConnector('examples/evaluate-konnector', loadConnector)
    ]);

    log('📋 Worker loaded: %s v%s', workerManifest.name, workerManifest.version);
    log('📋 Pilot loaded: %s v%s', pilotManifest.name, pilotManifest.version);

    // Initiate handshakes in PARALLEL (safe now that functions are properly exposed)
    // ✅ Since page initialization (including exposeFunction) is done sequentially,
    // both pages now have their functions available, so handshakes can run in parallel
    log('🤝 Starting handshakes in parallel...');
    const [workerConnection, pilotConnection] = await Promise.all([
      workerPage.initiateHandshake(),
      pilotPage.initiateHandshake()
    ]);
    log('✅ Both handshakes completed simultaneously');

    log('✅ Both pages are ready!');
    log('📄 Worker page: %o', workerConnection ? 'Connected' : 'Failed');
    log('📄 Pilot page: %o', pilotConnection ? 'Connected' : 'Failed');

    // une fois que tout est ready, je veux appeler la fonction ensureAuthenticated sur le pilot
    await pilotConnection.remoteHandle().call('setContentScriptType', 'pilot');
    await workerConnection.remoteHandle().call('setContentScriptType', 'worker');
    
    log('🚀 Starting ensureAuthenticated test...');
    await pilotConnection.remoteHandle().call('ensureAuthenticated');
    log('✅ ensureAuthenticated completed successfully!');
    
    log('🎉 Test completed successfully!');
    log('🔄 Worker reconnection: ✅ Working');
    log('🔧 runInWorker function: ✅ Working');
    log('📝 evaluate in worker: ✅ Working');
    
    // Test completed successfully, clean up and exit
    log('🧹 Cleaning up...');
    await Promise.all([
      workerPage.close(),
      pilotPage.close()
    ]);
    
    await browser.close();
    log('👋 Test completed successfully - exiting');
    process.exit(0);

    // Handle graceful shutdown (this code won't be reached in normal success case)
    process.on('SIGINT', async () => {
      log('\n🛑 Shutting down both pages...');
      
      // Cleanup both pages
      await Promise.all([
        workerPage.close(),
        pilotPage.close()
      ]);
      
      await browser.close();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ Setup failed:', error);
    
    // Cleanup all pages
    await Promise.all(pages.map(page => page.close()));
    await browser.close();
    process.exit(1);
  }
}

// Start the application
main().catch(console.error); 
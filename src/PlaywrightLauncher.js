import { chromium } from 'playwright';
import { getLogger } from './log-config.js';
import { loadConnector } from './connector-loader.js';
import { CliskPage } from './clisk-page.js';

const log = getLogger('clisk:launcher:playwright');

class PlaywrightLauncher {
  constructor() {
    this.browser = null;
    this.context = null;
    this.pilotPage = null;
    this.workerPage = null;
    this.connectorPath = null;
    this.isInitialized = false;
  }

  async init(connectorPath = 'examples/evaluate-konnector') {
    log('🚀 Initializing PlaywrightLauncher...');
    log(`📁 Using connector: ${connectorPath}`);
    
    this.connectorPath = connectorPath;
    
    // Launch browser with mobile simulation
    this.browser = await chromium.launch({ 
      headless: false,
      args: ['--no-sandbox', '--disable-web-security']
    });
    
    // Create browser context with mobile simulation
    this.context = await this.browser.newContext({
      // Simulate iPhone 12 mobile environment
      hasTouch: true,
      isMobile: true,
      locale: 'fr-FR',
      timezoneId: 'Europe/Paris',
      permissions: ['geolocation'],
      viewport: { width: 390, height: 844 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Mobile/15E148 Safari/604.1',
      deviceScaleFactor: 3,
      javaScriptEnabled: true,
      bypassCSP: false,
      geolocation: { longitude: -74.006, latitude: 40.7128 },
      colorScheme: 'light'
    });

    // Create CliskPage instances for pilot and worker
    this.workerPage = new CliskPage(this.context, 'worker');
    this.pilotPage = new CliskPage(this.context, 'pilot');
    
    // Setup cross-page communication: pilot can control worker
    this.pilotPage.setWorkerReference(this.workerPage);
    
    // Initialize pages SEQUENTIALLY to avoid Playwright exposeFunction conflicts
    log('📄 Initializing pages sequentially to avoid function exposure conflicts...');
    
    await this.workerPage.init();
    log('✅ Worker page initialized');
    
    await this.pilotPage.init();
    log('✅ Pilot page initialized');

    // Navigate both pages to blank page
    log('🌐 Navigating both pages...');
    await Promise.all([
      this.workerPage.navigate('about:blank'),
      this.pilotPage.navigate('about:blank')
    ]);

    // Load connector on both pages
    log('📦 Loading connectors on both pages...');
    const [workerManifest, pilotManifest] = await Promise.all([
      this.workerPage.loadConnector(this.connectorPath, loadConnector),
      this.pilotPage.loadConnector(this.connectorPath, loadConnector)
    ]);

    log('📋 Worker loaded: %s v%s', workerManifest.name, workerManifest.version);
    log('📋 Pilot loaded: %s v%s', pilotManifest.name, pilotManifest.version);

    // Initiate handshakes in parallel
    log('🤝 Starting handshakes in parallel...');
    const [workerConnection, pilotConnection] = await Promise.all([
      this.workerPage.initiateHandshake(),
      this.pilotPage.initiateHandshake()
    ]);
    log('✅ Both handshakes completed simultaneously');

    // Set content script types
    await pilotConnection.remoteHandle().call('setContentScriptType', 'pilot');
    await workerConnection.remoteHandle().call('setContentScriptType', 'worker');
    
    this.isInitialized = true;
    log('✅ PlaywrightLauncher initialized successfully!');
  }

  async start() {
    if (!this.isInitialized) {
      throw new Error('PlaywrightLauncher must be initialized before starting');
    }
    
    log('🚀 Starting PlaywrightLauncher...');
    
    try {
      // Get pilot connection
      const pilotConnection = this.pilotPage.getConnection();
      if (!pilotConnection) {
        throw new Error('Pilot connection not available');
      }
      
      // Call ensureAuthenticated on the pilot
      log('🔐 Calling ensureAuthenticated on pilot...');
      await pilotConnection.remoteHandle().call('ensureAuthenticated', {account: {}});
      log('✅ ensureAuthenticated completed successfully!');
      
      log('🎉 PlaywrightLauncher started successfully!');
      
    } catch (error) {
      log('❌ Error during start: %O', error);
      throw error;
    }
  }

  async stop() {
    log('🛑 Stopping PlaywrightLauncher...');
    
    try {
      // Close both pages
      if (this.workerPage) {
        await this.workerPage.close();
        log('✅ Worker page closed');
      }
      
      if (this.pilotPage) {
        await this.pilotPage.close();
        log('✅ Pilot page closed');
      }
      
      // Close browser context
      if (this.context) {
        await this.context.close();
        log('✅ Browser context closed');
      }
      
      // Close browser
      if (this.browser) {
        await this.browser.close();
        log('✅ Browser closed');
      }
      
      // Reset state
      this.browser = null;
      this.context = null;
      this.pilotPage = null;
      this.workerPage = null;
      this.isInitialized = false;
      
      log('✅ PlaywrightLauncher stopped successfully!');
      
    } catch (error) {
      log('⚠️ Error during stop: %O', error);
      // Don't throw error during cleanup to ensure resources are freed
    }
  }

  // Getter methods for accessing pages and connections
  getPilotPage() {
    return this.pilotPage;
  }

  getWorkerPage() {
    return this.workerPage;
  }

  getPilotConnection() {
    return this.pilotPage ? this.pilotPage.getConnection() : null;
  }

  getWorkerConnection() {
    return this.workerPage ? this.workerPage.getConnection() : null;
  }

  isReady() {
    return this.isInitialized && this.pilotPage && this.workerPage;
  }
}

export default PlaywrightLauncher;
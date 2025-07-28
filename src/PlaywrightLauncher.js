import { chromium } from 'playwright';
import { getLogger } from './log-config.js';
import { loadConnector } from './connector-loader.js';
import { CliskPage } from './clisk-page.js';
import { PilotService } from './services/pilot-service.js';
import { WorkerService } from './services/worker-service.js';

const log = getLogger('clisk:launcher:playwright');

class PlaywrightLauncher {
  constructor() {
    this.browser = null;
    this.context = null;
    this.pilotPage = null;
    this.workerPage = null;
    this.pilotService = null;
    this.workerService = null;
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
    
    // Create specialized services
    this.workerService = new WorkerService(this.workerPage);
    this.pilotService = new PilotService(this.pilotPage, this.workerPage, this.workerService);
    
    // Initialize pages SEQUENTIALLY to avoid Playwright exposeFunction conflicts

    await this.pilotPage.init();
    log('✅ Pilot page initialized');
    
    await this.workerPage.init();
    log('✅ Worker page initialized');
    
    // Navigate both pages to blank page
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

    // Setup service-specific local methods
    this.pilotPage.addLocalMethods(this.pilotService.getLocalMethods());
    this.workerPage.addLocalMethods(this.workerService.getLocalMethods());
    
    // Enable URL monitoring for worker only (not for pilot)
    this.workerService.enableUrlMonitoring();
    log('🔍 URL monitoring enabled for worker page');

    // Initiate handshakes in parallel with appropriate content script types
    const [workerConnection, pilotConnection] = await Promise.all([
      this.workerPage.initiateHandshake({}, 'worker'),
      this.pilotPage.initiateHandshake({}, 'pilot')
    ]);
    
    this.isInitialized = true;
    log('✅ PlaywrightLauncher initialized successfully!');
  }

  async start() {
    if (!this.isInitialized) {
      throw new Error('PlaywrightLauncher must be initialized before starting');
    }
    
    log('🚀 Starting PlaywrightLauncher...');
    
    try {
      const pilotConnection = this.pilotPage.getConnection();
      if (!pilotConnection) {
        throw new Error('Pilot connection not available');
      }
      
      log('🔐 Calling ensureAuthenticated on pilot...');
      await pilotConnection.remoteHandle().call('ensureAuthenticated', {account: {}});
      log('✅ ensureAuthenticated completed successfully!');
    } catch (error) {
      log('❌ Error during start: %O', error);
      throw error;
    }
  }

  async stop() {
    log('🛑 Stopping PlaywrightLauncher...');
    
    try {
      // Clean up services first
      if (this.workerService) {
        this.workerService.cleanup();
        this.workerService = null;
      }
      
      if (this.pilotService) {
        this.pilotService.cleanup();
        this.pilotService = null;
      }
      
      if (this.workerPage) {
        await this.workerPage.close();
      }
      
      if (this.pilotPage) {
        await this.pilotPage.close();
      }
      
      if (this.context) {
        await this.context.close();
      }
      
      if (this.browser) {
        await this.browser.close();
      }
      
      // Reset state
      this.browser = null;
      this.context = null;
      this.pilotPage = null;
      this.workerPage = null;
      this.pilotService = null;
      this.workerService = null;
      this.isInitialized = false;
      
      log('✅ PlaywrightLauncher stopped successfully!');
      
    } catch (error) {
      log('⚠️ Error during stop: %O', error);
      // Don't throw error during cleanup to ensure resources are freed
    }
  }

  // Getter methods for accessing pages, services and connections
  getPilotPage() {
    return this.pilotPage;
  }

  getWorkerPage() {
    return this.workerPage;
  }

  getPilotService() {
    return this.pilotService;
  }

  getWorkerService() {
    return this.workerService;
  }

  getPilotConnection() {
    return this.pilotPage ? this.pilotPage.getConnection() : null;
  }

  getWorkerConnection() {
    return this.workerPage ? this.workerPage.getConnection() : null;
  }

  isReady() {
    return this.isInitialized && this.pilotPage && this.workerPage && this.pilotService && this.workerService;
  }
}

export default PlaywrightLauncher;
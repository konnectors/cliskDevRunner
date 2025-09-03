import { chromium } from 'playwright';
import { getLogger } from './log-config.js';
import { loadConnector } from './connector-loader.js';
import { CliskPage } from './clisk-page.js';
import { PilotService } from './services/pilot-service.js';
import { WorkerService } from './services/worker-service.js';
import flag from 'cozy-flags';
import { listFlags, initialize } from 'cozy-flags/dist/flag.js';

// Common JS-compatible import
import cliPkg from 'cozy-client/dist/cli/index.js';
const { createClientInteractive } = cliPkg;

// import credentials file for token access
import fs from 'fs';
import path from 'path';
const __dirname = path.dirname(new URL(import.meta.url).pathname);

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
    this.destinationFolder = null;
  }

  async init(connectorPath = 'examples/evaluate-konnector', options = {}) {
    log('🚀 Initializing PlaywrightLauncher...');
    log(`📁 Using connector: ${connectorPath}`);

    this.connectorPath = connectorPath;

    // Get configuration options
    const { profile, browser: browserConfig, mobile: mobileConfig, targetedInstance, destinationFolder } = options;

    this.destinationFolder = destinationFolder;
    log('📦 destinationFolder set on launcher: %s', this.destinationFolder);

    /* TO COMMENT IF YOU DONT NEED TO READ CREDENTIALS FROM FILE */
    let credentials;
    const credPath = path.join(__dirname, '../data/credentials.json');

    if (fs.existsSync(credPath)) {
      try {
        const raw = fs.readFileSync(credPath, 'utf-8');
        credentials = JSON.parse(raw);

        if (!credentials) {
          log('⚠️ credentials.json exists but no "token" key found.');
        } else {
          log('🔐 Token loaded from credentials.json');
        }
      } catch (err) {
        log(`❌ Failed to read credentials.json: ${err.message}`);
      }
    } else {
      log('⚠️ No credentials.json file found.');
    }
    //////////////////////////////////////////////////////

    const scopes = await loadScopesFromManifestStrict({ connectorPath, __dirname, log });

    this.cozyClient = await createClientInteractive({
      uri: targetedInstance,
      scope: scopes,
      oauth: {
        softwareID: 'cliskDevRunner'
      },
      appMetadata: {
        slug: 'cliskDevRunner'
      }
    });

    // Initialize cozy-flags
    await initialize(this.cozyClient);

    // Determine user data directory based on profile
    let userDataDir = null;
    if (profile) {
      const path = await import('path');
      const fs = await import('fs');
      const profileDir = path.join(process.cwd(), 'profile', profile);

      // Create profile directory if it doesn't exist
      if (!fs.existsSync(profileDir)) {
        fs.mkdirSync(profileDir, { recursive: true });
        log(`📁 Created profile directory: ${profileDir}`);
      }

      userDataDir = profileDir;
      log(`👤 Using browser profile: ${profile} (${profileDir})`);
    }

    // Launch browser with configuration
    const launchOptions = {
      headless: browserConfig?.headless ?? false,
      devtools: browserConfig?.devtools ?? false,
      args: browserConfig?.args ?? ['--no-sandbox', '--disable-web-security']
    };

    // Create browser context with mobile simulation
    const contextOptions = {
      // Simulate iPhone 12 mobile environment
      hasTouch: mobileConfig?.hasTouch ?? true,
      isMobile: mobileConfig?.isMobile ?? true,
      locale: mobileConfig?.locale ?? 'fr-FR',
      timezoneId: mobileConfig?.timezoneId ?? 'Europe/Paris',
      permissions: ['geolocation'],
      viewport: mobileConfig?.viewport ?? { width: 390, height: 844 },
      userAgent: mobileConfig?.userAgent ?? 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Mobile/15E148 Safari/604.1',
      deviceScaleFactor: mobileConfig?.deviceScaleFactor ?? 3,
      javaScriptEnabled: true,
      bypassCSP: false,
      geolocation: mobileConfig?.geolocation ?? {
        longitude: -74.006,
        latitude: 40.7128
      },
      colorScheme: 'light'
    };

    if (userDataDir) {
      // Use launchPersistentContext for profiles
      this.context = await chromium.launchPersistentContext(userDataDir, {
        ...launchOptions,
        ...contextOptions
      });
      this.browser = this.context.browser();
    } else {
      // Use regular launch for no profile
      this.browser = await chromium.launch(launchOptions);
      this.context = await this.browser.newContext(contextOptions);
    }

    // Create CliskPage instances for pilot and worker
    this.workerPage = new CliskPage(this.context, 'worker');
    this.pilotPage = new CliskPage(this.context, 'pilot');

    // Create specialized services
    this.workerService = new WorkerService(this.workerPage);
    this.pilotService = new PilotService(this.pilotPage, this.workerPage, this.workerService);

    this.pilotService.destinationFolder = this.destinationFolder;

    this.pilotService.setLauncherClient(this.cozyClient);

    // Initialize pages SEQUENTIALLY to avoid Playwright exposeFunction conflicts

    await this.pilotPage.init();
    log('✅ Pilot page initialized');

    await this.workerPage.init();
    log('✅ Worker page initialized');

    // Navigate both pages to blank page
    await Promise.all([this.workerPage.navigate('about:blank'), this.pilotPage.navigate('about:blank')]);

    // Load connector on both pages
    log('📦 Loading connectors on both pages...');
    const [konnector] = await Promise.all([this.workerPage.loadConnector(this.connectorPath, loadConnector), this.pilotPage.loadConnector(this.connectorPath, loadConnector)]);
    this.pilotService.setKonnector(konnector);
    log('📦 Loaded');

    // Setup service-specific local methods
    this.pilotPage.addLocalMethods(this.pilotService.getLocalMethods());
    this.workerPage.addLocalMethods(this.workerService.getLocalMethods());

    // Enable URL monitoring for worker only (not for pilot)
    this.workerService.enableUrlMonitoring();

    // Initiate handshakes in parallel with appropriate content script types
    const [workerConnection, pilotConnection] = await Promise.all([this.workerPage.initiateHandshake({}, 'worker'), this.pilotPage.initiateHandshake({}, 'pilot')]);

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

      const cozyFlags = listFlags();
      const flagsWithValues = {};
      if (cozyFlags) {
        for (const cozyFlag of cozyFlags) {
          if (cozyFlag.startsWith('clisk')) {
            flagsWithValues[cozyFlag] = flag.default(cozyFlag);
          }
        }
      }

      log('🔐 Calling ensureAuthenticated on pilot...');
      await pilotConnection.remoteHandle().call('ensureAuthenticated', { account: {} });
      log('✅ ensureAuthenticated completed successfully!');
      log('🔐 Calling getUserDataFromWebsite on pilot...');
      const userDataResult = await pilotConnection.remoteHandle().call('getUserDataFromWebsite');
      log('✅ getUserDataFromWebsite result: %O', userDataResult);
      if (!userDataResult?.sourceAccountIdentifier) {
        throw new Error('getUserDataFromWebsite did not return any sourceAccountIdentifier. Cannot continue the execution.');
      }
      this.pilotService.setUserData({ sourceAccountIdentifier: userDataResult.sourceAccountIdentifier });
      log(`🧩 PilotService userData set: ${this.pilotService.getUserData()?.sourceAccountIdentifier}`);
      log('🔐 Calling fetch on pilot...');
      await pilotConnection.remoteHandle().call('fetch', { flags: flagsWithValues });
      log('✅  fetch completed successfully!');
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

  getDestinationFolder() {
    return this.destinationFolder;
  }
}

async function loadScopesFromManifestStrict({ connectorPath, __dirname, log }) {
  const manifestPath = path.resolve(__dirname, '..', connectorPath, 'manifest.konnector');
  let raw;
  try {
    raw = await fs.promises.readFile(manifestPath, 'utf8');
  } catch (err) {
    log(`❌ Cannot read manifest file: ${err.message}`);
    throw new Error(`Manifest not found or unreadable at ${manifestPath}`);
  }

  let manifest;
  try {
    manifest = JSON.parse(raw);
  } catch (err) {
    log(`❌ Invalid JSON manifest: ${err.message}`);
    throw new Error(`Manifest JSON invalid at ${manifestPath}`);
  }

  const perms = manifest.permissions;
  if (!perms || typeof perms !== 'object') {
    log('❌ No "permissions" section found in manifest');
    throw new Error(`No "permissions" in manifest at ${manifestPath}`);
  }

  const scopes = Array.from(
    new Set(
      Object.values(perms)
        .map(entry => (typeof entry === 'string' ? entry : entry?.type))
        .filter(Boolean)
    )
  );

  if (scopes.length === 0) {
    log('❌ No permission types found in manifest');
    throw new Error(`No permission types found in manifest at ${manifestPath}`);
  }

  return scopes;
}

export default PlaywrightLauncher;

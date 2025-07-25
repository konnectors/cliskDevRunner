import debug from 'debug';

/**
 * WorkerService - Gère la logique spécifique au worker
 * Responsable de la gestion des changements d'URL et des reconnexions automatiques
 */
export class WorkerService {
  constructor(workerPage) {
    this.workerPage = workerPage;
    this.log = debug('clisk:worker-service');
    this.navLog = debug('clisk:worker-service:nav');
    
    // URL monitoring state
    this.currentUrl = null;
    this.urlChangeTimeout = null;
    this.isMonitoringEnabled = false;
  }

  /**
   * Get worker-specific local methods for post-me communication
   */
  getLocalMethods() {
    return {
      // Basic worker methods can be added here
      // For now, return empty object as worker mainly receives commands
    };
  }

  /**
   * Enable URL change monitoring and automatic reconnection
   */
  enableUrlMonitoring() {
    if (this.isMonitoringEnabled) {
      this.log('⚠️ URL monitoring already enabled');
      return;
    }

    if (!this.workerPage.getPage()) {
      this.log('⚠️ Cannot enable URL monitoring: page not available');
      return;
    }

    this.navLog('🔍 Enabling URL change monitoring...');
    this.isMonitoringEnabled = true;
    
    // Listen for URL changes (navigation events)
    const page = this.workerPage.getPage();
    page.on('framenavigated', async (frame) => {
      // Only handle main frame navigation
      if (frame !== page.mainFrame()) return;
      
      const newUrl = frame.url();
      const oldUrl = this.currentUrl;
      
      // Skip if it's the same URL or initial navigation
      if (!oldUrl || newUrl === oldUrl) {
        this.currentUrl = newUrl;
        return;
      }
      
      this.navLog('🌍 URL changed: %s → %s', oldUrl, newUrl);
      this.currentUrl = newUrl;
      
      // Skip about:blank navigations (common during testing)
      if (newUrl === 'about:blank') {
        this.navLog('⏭️ Skipping about:blank navigation');
        return;
      }
      
      // Trigger reconnection
      await this.handleUrlChange(newUrl, oldUrl);
    });
    
    // Track initial URL
    this.currentUrl = page.url();
    this.navLog('📍 Initial URL: %s', this.currentUrl);
    this.navLog('✅ URL monitoring enabled');
  }

  /**
   * Disable URL change monitoring
   */
  disableUrlMonitoring() {
    if (!this.isMonitoringEnabled) {
      this.log('⚠️ URL monitoring already disabled');
      return;
    }

    this.navLog('🛑 Disabling URL monitoring...');
    this.isMonitoringEnabled = false;
    
    // Cancel any pending timeout
    if (this.urlChangeTimeout) {
      clearTimeout(this.urlChangeTimeout);
      this.urlChangeTimeout = null;
    }
    
    // Note: We don't remove the 'framenavigated' listener as Playwright doesn't 
    // provide a direct way to remove specific listeners, but we use the 
    // isMonitoringEnabled flag to ignore events
    
    this.navLog('✅ URL monitoring disabled');
  }

  /**
   * Handle URL change and attempt reconnection
   * @param {string} newUrl - New URL
   * @param {string} oldUrl - Previous URL
   * @private
   */
  async handleUrlChange(newUrl, oldUrl) {
    if (!this.isMonitoringEnabled) {
      this.navLog('⚠️ URL monitoring disabled, skipping auto-reconnection');
      return;
    }

    const page = this.workerPage.getPage();
    
    // Check if page is still valid and context is not closed
    if (!page || page.isClosed()) {
      this.navLog('⚠️ Page is closed, skipping auto-reconnection');
      return;
    }
    
    // Check if browser context is still valid
    try {
      if (!page.context() || page.context().isConnected && !page.context().isConnected()) {
        this.navLog('⚠️ Browser context is disconnected, skipping auto-reconnection');
        return;
      }
    } catch (error) {
      this.navLog('⚠️ Cannot access browser context, skipping auto-reconnection: %O', error);
      return;
    }
    
    // Set a timeout for the entire reconnection process
    const reconnectionTimeout = setTimeout(() => {
      this.navLog('⏰ Reconnection timeout after 15 seconds');
      if (this.workerPage.onReconnectionFailure) {
        this.workerPage.onReconnectionFailure(newUrl, new Error('Reconnection timeout'));
      }
    }, 15000);
    
    try {
      this.navLog('🔄 Starting auto-reconnection process...');
      
      // Close existing connection if any
      const connection = this.workerPage.getConnection();
      if (connection) {
        this.navLog('🔌 Closing existing connection...');
        try {
          connection.close();
        } catch (error) {
          this.navLog('⚠️ Error closing connection: %O', error);
        }
        // Connection will be reset when new handshake completes
      }
      
      // Check again if page is still valid after closing connection
      if (!page || page.isClosed()) {
        this.navLog('⚠️ Page was closed during reconnection, aborting');
        clearTimeout(reconnectionTimeout);
        return;
      }
      
      // Wait a bit for the new page to load
      this.navLog('⏳ Waiting for page to stabilize...');
      try {
        await page.waitForTimeout(2000); // Increased wait time
      } catch (error) {
        if (error.message.includes('Target page, context or browser has been closed')) {
          this.navLog('⚠️ Page closed during stabilization, aborting reconnection');
          clearTimeout(reconnectionTimeout);
          return;
        }
        throw error;
      }
      
      // The communication bridge doesn't need to be re-setup 
      // as functions are exposed at the context level and persist
      this.navLog('🔗 Communication bridge already available');
      
      // Re-inject connector on the new page if connector path is available
      if (this.workerPage.connectorPath && this.workerPage.loaderFunction) {
        this.navLog('📦 Re-injecting connector...');
        try {
          await this.workerPage.loaderFunction(page, this.workerPage.connectorPath);
          this.navLog('✅ Connector re-injected successfully');
        } catch (error) {
          this.navLog('❌ Failed to re-inject connector: %O', error);
          throw error;
        }
      } else {
        this.navLog('⚠️ No connector path or loader function available for re-injection');
      }
      
      // Re-establish handshake with timeout
      this.navLog('🤝 Re-establishing handshake...');
      
      // Check one more time if page is still valid before handshake
      if (!page || page.isClosed()) {
        this.navLog('⚠️ Page was closed before handshake, aborting');
        clearTimeout(reconnectionTimeout);
        return;
      }
      
      // Create a promise with timeout for handshake
      const handshakePromise = this.workerPage.initiateHandshake({}, 'worker');
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Handshake timeout')), 10000);
      });
      
      const newConnection = await Promise.race([handshakePromise, timeoutPromise]);
      
      this.navLog('✅ Auto-reconnection successful!');
      clearTimeout(reconnectionTimeout);
      
      // Signal reconnection completion
      if (this.workerPage.onReconnectionComplete) {
        this.navLog('📞 Calling onReconnectionComplete with URL: %s', newUrl);
        this.workerPage.onReconnectionComplete(newUrl);
      }
      
    } catch (error) {
      clearTimeout(reconnectionTimeout);
      
      // Don't log errors if page/context is closed (normal during cleanup)
      const isPageClosedError = error.message && (
        error.message.includes('Target page, context or browser has been closed') ||
        error.message.includes('Page was closed during handshake initialization') ||
        error.message.includes('Page was closed before handshake could complete')
      );
      
      if (isPageClosedError) {
        this.navLog('ℹ️ Reconnection cancelled due to page closure (normal during cleanup)');
      } else {
        this.navLog('❌ Auto-reconnection failed: %O', error);
        console.error('❌ Worker auto-reconnection failed:', error);
        
        // Signal reconnection failure
        if (this.workerPage.onReconnectionFailure) {
          this.workerPage.onReconnectionFailure(newUrl, error);
        }
      }
    }
  }

  /**
   * Manually trigger a reconnection (useful for testing)
   */
  async manualReconnect() {
    const page = this.workerPage.getPage();
    const currentUrl = page ? page.url() : null;
    if (currentUrl) {
      this.navLog('🔄 Manual reconnection triggered');
      await this.handleUrlChange(currentUrl, 'manual-trigger');
    } else {
      throw new Error('Page not available for manual reconnection');
    }
  }

  /**
   * Get current monitoring status
   */
  isMonitoring() {
    return this.isMonitoringEnabled;
  }

  /**
   * Clean up the service
   */
  cleanup() {
    this.disableUrlMonitoring();
    this.log('🧹 WorkerService cleaned up');
  }
} 
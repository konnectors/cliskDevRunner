import debug from 'debug';

/**
 * PilotService - Gère la logique spécifique au pilot
 * Responsable de la communication avec le worker et des opérations de pilotage
 */
export class PilotService {
  constructor(pilotPage, workerPage) {
    this.pilotPage = pilotPage;
    this.workerPage = workerPage;
    this.log = debug('clisk:pilot-service');
    this.reconnectionPromises = new Map(); // Track pending reconnection promises
  }

  /**
   * Get pilot-specific local methods for post-me communication
   */
  getLocalMethods() {
    return {
      setWorkerState: async (state) => {
        this.log('🎯 setWorkerState called with: %O', state);
        return await this._setWorkerState(state);
      },

      runInWorker: async (method, ...args) => {
        this.log('🔧 runInWorker called: method=%s, args=%O', method, args);
        
        if (!this.workerPage) {
          throw new Error('Worker page not available.');
        }
        
        const workerConnection = this.workerPage.getConnection();
        if (!workerConnection) {
          throw new Error('Worker connection not available.');
        }
        
        try {
          // Call the specified method on the worker with the provided arguments
          const result = await workerConnection.remoteHandle().call(method, ...args);
          this.log('✅ runInWorker result: %O', result);
          return result;
        } catch (error) {
          this.log('❌ runInWorker error: %O', error);
          throw error;
        }
      }
    };
  }

  /**
   * Set worker state (URL) and wait for reconnection
   * @param {Object} state - State object containing url
   * @param {Object} options - Options for setWorkerState
   * @param {boolean} options.waitForReconnection - Whether to wait for reconnection (default: true)
   * @returns {Promise} Promise that resolves when navigation is complete (and reconnection if enabled)
   */
  async _setWorkerState(state, options = {}) {
    if (!this.workerPage) {
      throw new Error('Worker page not available.');
    }
    
    const { url } = state;
    const { waitForReconnection = true } = options;
    
    if (!url) {
      throw new Error('setWorkerState requires a url in the state object');
    }
    
    this.log('🎯 Setting worker URL to: %s', url);
    const startTime = Date.now();
    
    // Navigate worker to new URL
    try {
      await this.workerPage.navigate(url);
      this.log('🌐 Worker navigation completed to: %s', url);
      
      // If not waiting for reconnection, return immediately
      if (!waitForReconnection) {
        return {
          success: true,
          url: url,
          duration: Date.now() - startTime
        };
      }
      
      // Setup reconnection waiting logic
      const reconnectionId = Date.now().toString();
      
      const reconnectionPromise = new Promise((resolve, reject) => {
        // Set a timeout to avoid hanging forever
        const timeout = setTimeout(() => {
          this.reconnectionPromises.delete(reconnectionId);
          reject(new Error(`Worker reconnection timeout after navigating to ${url}`));
        }, 30000); // 30 second timeout
        
        // Store the resolve function to be called when reconnection completes
        this.reconnectionPromises.set(reconnectionId, {
          resolve: (result) => {
            clearTimeout(timeout);
            this.reconnectionPromises.delete(reconnectionId);
            resolve(result);
          },
          reject: (error) => {
            clearTimeout(timeout);
            this.reconnectionPromises.delete(reconnectionId);
            reject(error);
          },
          url,
          startTime
        });
      });
      
      // Setup a one-time listener for worker reconnection
      this.setupWorkerReconnectionListener();
      
      // Return the promise that will resolve when reconnection is complete
      return reconnectionPromise;
      
    } catch (error) {
      this.log('❌ Worker navigation failed: %O', error);
      throw new Error(`Worker navigation failed: ${error.message}`);
    }
  }

  /**
   * Setup listener for worker reconnection events
   * @private
   */
  setupWorkerReconnectionListener() {
    if (!this.workerPage.onReconnectionComplete) {
      this.log('🔧 Setting up onReconnectionComplete callback on worker');
      this.workerPage.onReconnectionComplete = (reconnectedUrl) => {
        this.log('📞 onReconnectionComplete callback triggered for URL: %s', reconnectedUrl);
        // Find and resolve any pending promises for this URL
        for (const [id, promise] of this.reconnectionPromises.entries()) {
          // Normalize URLs for comparison (remove trailing slash)
          const normalizeUrl = (url) => url.replace(/\/$/, '');
          const expectedUrl = normalizeUrl(promise.url);
          const actualUrl = normalizeUrl(reconnectedUrl);
          
          this.log('🔍 Comparing URLs: expected="%s" actual="%s"', expectedUrl, actualUrl);
          
          if (expectedUrl === actualUrl) {
            this.log('✅ Worker reconnection complete for URL: %s (took %dms)', 
              reconnectedUrl, Date.now() - promise.startTime);
            promise.resolve({ 
              success: true, 
              url: reconnectedUrl, 
              duration: Date.now() - promise.startTime 
            });
          }
        }
      };
    }
  }

  /**
   * Clean up the service
   */
  cleanup() {
    // Clear any pending reconnection promises
    for (const [id, promise] of this.reconnectionPromises.entries()) {
      if (promise.reject) {
        promise.reject(new Error('PilotService cleanup'));
      }
    }
    this.reconnectionPromises.clear();
    
    // Clear worker reconnection callback
    if (this.workerPage && this.workerPage.onReconnectionComplete) {
      this.workerPage.onReconnectionComplete = null;
    }
    
    this.log('🧹 PilotService cleaned up');
  }
} 
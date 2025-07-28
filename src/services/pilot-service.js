import debug from 'debug';

/**
 * PilotService - Gère la logique spécifique au pilot
 * Responsable de la communication avec le worker et des opérations de pilotage
 */
export class PilotService {
  constructor(pilotPage, workerPage, workerService) {
    this.pilotPage = pilotPage;
    this.workerPage = workerPage;
    this.workerService = workerService;
    this.log = debug('clisk:pilot-service');
    this.activeTimers = new Set(); // Track active timers for cleanup
  }

  /**
   * Create a tracked timeout that will be automatically cleaned up
   */
  createTrackedTimeout(callback, delay) {
    const timeoutId = setTimeout(() => {
      this.activeTimers.delete(timeoutId);
      callback();
    }, delay);
    this.activeTimers.add(timeoutId);
    return timeoutId;
  }

  /**
   * Clear a tracked timeout
   */
  clearTrackedTimeout(timeoutId) {
    if (timeoutId && this.activeTimers.has(timeoutId)) {
      clearTimeout(timeoutId);
      this.activeTimers.delete(timeoutId);
    }
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
        this.log('🎯 runInWorker called: method=%s, args=%O', method, args);
        
        if (!this.workerPage) {
          throw new Error('Worker page not available.');
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
        await this.waitForReconnectionIfInProgress();
        return await this.executeWithUrlChangeRetry(async () => {
          const workerConnection = this.workerPage.getConnection();
          if (!workerConnection) {
            throw new Error('Worker connection not available.');
          }
          
          // Call the specified method on the worker with the provided arguments
          let result;
          try {
            result = await workerConnection.remoteHandle().call(method, ...args);
            this.log('✅ runInWorker result: %O', result);
            return result;
          } catch (error) {
            // Check if it's an execution context destroyed error
            if (error.message && error.message.includes('Execution context was destroyed')) {
              this.log('⚠️ Execution context destroyed during runInWorker, treating as URL change');
              throw new Error('URL_CHANGE_DETECTED: Execution context was destroyed');
            }
            throw error;
          }
        }, 'runInWorker');
      },

      blockWorkerInteractions: () => {
        this.log('🚫 blockWorkerInteractions called');
      },

      unblockWorkerInteractions: () => {
        this.log('✅ unblockWorkerInteractions called');
      }
    };
  }

  /**
   * Set worker state (URL) and wait for reconnection
   * @param {Object} state - State object containing url
   * @returns {Promise} Promise that resolves when reconnection is complete
   */
  async _setWorkerState(state) {
    if (!this.workerPage) {
      throw new Error('Worker page not available.');
    }
    
    const { url } = state;
    
    if (!url) {
      this.log('No url to set in worker state, canceling')
      return
    }
    
    return await this.executeWithUrlChangeRetry(async () => {
      this.log('🎯 Setting worker URL to: %s', url);
      const startTime = Date.now();
      
      // Check if we're already at the target URL (normalize URLs for comparison)
      const currentUrl = this.workerPage.page.url();
      const normalizeUrl = (url) => {
        try {
          const parsed = new URL(url);
          return parsed.href;  // This normalizes the URL (adds trailing slash if needed)
        } catch {
          return url;
        }
      };
      
      const normalizedCurrentUrl = normalizeUrl(currentUrl);
      const normalizedTargetUrl = normalizeUrl(url);
      
      if (normalizedCurrentUrl === normalizedTargetUrl) {
        this.log('✅ Already at target URL: %s (current: %s), no navigation needed', normalizedTargetUrl, normalizedCurrentUrl);
        return { success: true, url: normalizedCurrentUrl, duration: 0, alreadyAtUrl: true };
      }
      
      // Navigate worker to new URL
      await this.workerPage.navigate(url);
      this.log('🌐 Worker navigation completed to: %s', url);
      
      // Wait for reconnection using worker service's promise
      const reconnectionPromise = this.workerService.getReconnectionPromise();
      if (reconnectionPromise) {
        this.log('⏳ Waiting for worker reconnection...');
        try {
          const success = await reconnectionPromise;
          if (success) {
            this.log('✅ Worker reconnection successful');
            return { 
              success: true, 
              url: url, 
              duration: Date.now() - startTime 
            };
          } else {
            throw new Error('Worker reconnection failed');
          }
        } catch (error) {
          this.log('❌ Worker reconnection failed: %O', error);
          throw new Error(`Worker reconnection failed: ${error.message}`);
        }
      } else {
        this.log('⚠️ No reconnection promise available, assuming success');
        return { 
          success: true, 
          url: url, 
          duration: Date.now() - startTime 
        };
      }
    }, 'setWorkerState');
  }

  /**
   * Execute a command with automatic retry on URL change
   * @param {Function} commandFn - The command function to execute
   * @param {string} commandName - Name of the command for logging
   * @returns {Promise} Promise that resolves with the command result
   * @private
   */
  async executeWithUrlChangeRetry(commandFn, commandName) {
    const maxRetries = 3;
    let retryCount = 0;
    
    while (retryCount < maxRetries) {
      try {
        this.log(`🚀 Executing ${commandName} (attempt ${retryCount + 1}/${maxRetries})`);
        
        // Check if reconnection is in progress and wait for it to complete
        await this.waitForReconnectionIfInProgress();
        
        // Create a promise that will be rejected if URL change occurs
        const urlChangePromise = new Promise((_, reject) => {
          if (!this.workerService) {
            reject(new Error('WorkerService not available'));
            return;
          }
          
          // Listen for URL change events
          const urlChangeHandler = (eventData) => {
            this.log(`🔄 URL change detected during ${commandName}: ${eventData.oldUrl} → ${eventData.newUrl}`);
            reject(new Error(`URL_CHANGE_DETECTED: ${eventData.oldUrl} → ${eventData.newUrl}`));
          };
          
          this.workerService.once('url-change', urlChangeHandler);
          
          // Clean up listener after a timeout to prevent memory leaks
          this.createTrackedTimeout(() => {
            this.workerService.removeListener('url-change', urlChangeHandler);
          }, 30000); // 30 second timeout
        });
        
        // Race between command execution and URL change
        const result = await Promise.race([
          commandFn(),
          urlChangePromise
        ]);
        
        this.log(`✅ ${commandName} completed successfully`);
        return result;
        
      } catch (error) {
        retryCount++;
        
        // Check if it's a URL change error or execution context destroyed error
        if (error.message && (
          error.message.startsWith('URL_CHANGE_DETECTED') ||
          error.message.includes('Execution context was destroyed') ||
          error.message.startsWith('EXECUTION_CONTEXT_DESTROYED')
        )) {
          this.log(`🔄 URL change detected during ${commandName}, waiting for reconnection...`);
          
          // Wait for reconnection to complete
          await this.waitForReconnectionAfterUrlChange();
          
          if (retryCount >= maxRetries) {
            throw new Error(`${commandName} failed after ${maxRetries} retries due to URL changes`);
          }
          
          this.log(`🔄 Retrying ${commandName} after URL change...`);
          continue;
        }
        
        // If it's not a URL change error, throw immediately
        this.log(`❌ ${commandName} failed: %O`, error);
        throw error;
      }
    }
  }

  /**
   * Wait for reconnection to complete if one is in progress
   * @private
   */
  async waitForReconnectionIfInProgress() {
    if (!this.workerService) {
      return;
    }
    
    const reconnectionPromise = this.workerService.getReconnectionPromise();
    if (reconnectionPromise && !reconnectionPromise.settled) {
      this.log('⏳ Reconnection in progress, waiting for completion...');
      try {
        await reconnectionPromise;
        this.log('✅ Reconnection completed, proceeding with command');
      } catch (error) {
        this.log('❌ Reconnection failed: %O', error);
        throw error;
      }
    }
  }

  /**
   * Wait for reconnection to complete after a URL change
   * @private
   */
  async waitForReconnectionAfterUrlChange() {
    if (!this.workerService) {
      throw new Error('WorkerService not available');
    }
    
    this.log('⏳ Waiting for reconnection after URL change...');
    
    return new Promise((resolve, reject) => {
      const timeout = this.createTrackedTimeout(() => {
        reject(new Error('Timeout waiting for reconnection after URL change'));
      }, 30000); // 30 second timeout
      
      // Listen for reconnection success
      const reconnectionHandler = (eventData) => {
        clearTimeout(timeout);
        this.log('✅ Reconnection completed after URL change');
        resolve(eventData);
      };
      
      // Listen for reconnection error
      const errorHandler = (eventData) => {
        clearTimeout(timeout);
        this.log('❌ Reconnection failed after URL change: %O', eventData.error);
        reject(new Error(`Reconnection failed: ${eventData.error}`));
      };
      
      this.workerService.once('reconnection:success', reconnectionHandler);
      this.workerService.once('reconnection:error', errorHandler);
      
      // Clean up listeners after timeout
      this.createTrackedTimeout(() => {
        this.workerService.removeListener('reconnection:success', reconnectionHandler);
        this.workerService.removeListener('reconnection:error', errorHandler);
      }, 30000);
    });
  }

  /**
   * Block worker interaction
   */
  blockWorkerInteraction() {
    this.log('🚫 blockWorkerInteraction called');
  }

  /**
   * Unblock worker interaction
   */
  unblockWorkerInteraction() {
    this.log('✅ unblockWorkerInteraction called');
  }

  /**
   * Clean up the service
   */
  cleanup() {
    // Clear all active timers first
    for (const timeoutId of this.activeTimers) {
      clearTimeout(timeoutId);
    }
    this.activeTimers.clear();
    
    // Remove all listeners from worker service
    if (this.workerService) {
      this.workerService.removeAllListeners();
    }
    
    this.log('🧹 PilotService cleaned up');
  }
} 
import debug from 'debug';
import fs from 'fs/promises';
import path from 'path';
import { saveIdentity, saveFiles } from 'cozy-clisk';
import { Q } from 'cozy-client';
const CREDENTIALS_PATH = path.join(path.dirname(new URL(import.meta.url).pathname), '../../data/credentials.json');

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
    this.handleWorkerEvent = this.handleWorkerEvent.bind(this);
    this._firstFileSave = true;
    this.destinationFolder = null; // will be set by PlaywrightLauncher
    this.workerPage.on('connection:success', this.attachWorkerEvent.bind(this));
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
      setWorkerState: async state => {
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
      },

      saveIdentity: async contact => {
        this.log('💾 saveIdentity called: %O', contact);
        const { launcherClient: client } = this.getStartContext();
        const { sourceAccountIdentifier } = this.getUserData() || {};
        await saveIdentity(contact, sourceAccountIdentifier, { client });
      },

      saveBills: async entries => {
        this.log('💾 saveBills called: %O', entries);
      },

      saveFiles: async (entries, options) => {
        this.log('💾 saveFiles called');
        await this.ensureKonnectorFolder();

        const { launcherClient: client, konnector, destinationFolder } = this.getStartContext() || {};
        const { sourceAccountIdentifier } = this.getUserData() || {};

        if (!destinationFolder) {
          throw new Error('saveFiles: destinationFolder is not defined');
        }
        const folderPath = (destinationFolder.startsWith('/') ? destinationFolder : `/${destinationFolder}`) + `/${konnector.slug}`;

        const existingFilesIndex = await this.getExistingFilesIndex(this.shouldResetFileIndex());

        const saveFilesOptions = {
          ...options,
          manifest: konnector,
          // @ts-ignore
          sourceAccount: 'testaccountid',
          sourceAccountIdentifier,
          // @ts-ignore
          downloadAndFormatFile: async entry => ({
            ...entry,
            // @ts-ignore
            dataUri: await this.workerPage.getConnection().remoteHandle().call('downloadFileInWorker', entry)
          }),
          existingFilesIndex,
          log: this.log.bind(this)
        };

        try {
          const result = await saveFiles(client, entries, folderPath, saveFilesOptions);
          return result;
        } catch (err) {
          if (
            (err instanceof Error && err.message !== 'MAIN_FOLDER_REMOVED') ||
            !(err instanceof Error) // instanceof Error is here to fix typing error
          ) {
            throw err;
          }
          // main destination folder has been removed during the execution of the konnector. Trying one time to reset all and relaunch saveFiles
          return await this.retrySaveFiles(entries, saveFilesOptions);
        }
      },

      localSaveFiles: async entries => {
        this.log('💾 saveFiles called');
        await this.waitForReconnectionIfInProgress();
        const workerConnection = this.workerPage.getConnection();
        if (!workerConnection) {
          throw new Error('Worker connection not available.');
        }

        await fs.mkdir('./data', { recursive: true });
        for (const entry of entries) {
          // Call the specified method on the worker with the provided arguments
          let dataUri;
          try {
            dataUri = await workerConnection.remoteHandle().call('downloadFileInWorker', entry);

            const base64Data = dataUri.split(',')[1];
            const fileData = Buffer.from(base64Data, 'base64');

            await fs.writeFile(path.join('./data', entry.filename + ''), fileData);
            this.log('✅ File saved successfully to ./data/' + entry.filename);
          } catch (error) {
            // Check if it's an execution context destroyed error
            if (error.message && error.message.includes('Execution context was destroyed')) {
              this.log('⚠️ Execution context destroyed during runInWorker, treating as URL change');
              throw new Error('URL_CHANGE_DETECTED: Execution context was destroyed');
            }
            throw error;
          }
        }
      },

      getCredentials: async () => {
        try {
          await fs.access(CREDENTIALS_PATH);
        } catch (err) {
          log('⚠️  No credentials file found, please create it');
          return null;
        }

        try {
          const content = await fs.readFile(CREDENTIALS_PATH, 'utf-8');
          const data = JSON.parse(content);
          return data;
        } catch (err) {
          log('❌  Something went wrong when reading credentials file', err.message);
          throw err;
        }
      },

      saveCredentials: async newCredentials => {
        let currentData = {};
        try {
          const content = await fs.readFile(CREDENTIALS_PATH, 'utf-8');
          currentData = JSON.parse(content);
        } catch (err) {
          if (err.code !== 'ENOENT') {
            this.log('❌  Error reading credentials before saving', err.message);
            throw err;
          }
          this.log('ℹ️  No existing credentials file, creating a new one');
        }

        const merged = { ...currentData, ...newCredentials };

        try {
          await fs.writeFile(CREDENTIALS_PATH, JSON.stringify(merged, null, 2), 'utf-8');
          this.log('✅  Credentials saved successfully');
        } catch (err) {
          this.log('❌  Error saving credentials', err.message);
          throw err;
        }
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
      this.log('No url to set in worker state, canceling');
      return;
    }

    return await this.executeWithUrlChangeRetry(async () => {
      this.log('🎯 Setting worker URL to: %s', url);
      const startTime = Date.now();

      // Check if we're already at the target URL (normalize URLs for comparison)
      const currentUrl = this.workerPage.page.url();
      const normalizeUrl = url => {
        try {
          const parsed = new URL(url);
          return parsed.href; // This normalizes the URL (adds trailing slash if needed)
        } catch {
          return url;
        }
      };

      const normalizedCurrentUrl = normalizeUrl(currentUrl);
      const normalizedTargetUrl = normalizeUrl(url);

      if (normalizedCurrentUrl === normalizedTargetUrl) {
        this.log('✅ Already at target URL: %s (current: %s), no navigation needed', normalizedTargetUrl, normalizedCurrentUrl);
        return {
          success: true,
          url: normalizedCurrentUrl,
          duration: 0,
          alreadyAtUrl: true
        };
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
          const urlChangeHandler = eventData => {
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
        const result = await Promise.race([commandFn(), urlChangePromise]);

        this.log(`✅ ${commandName} completed successfully`);
        return result;
      } catch (error) {
        retryCount++;

        // Check if it's a URL change error or execution context destroyed error
        if (
          error.message &&
          (error.message.startsWith('URL_CHANGE_DETECTED') || error.message.includes('Execution context was destroyed') || error.message.startsWith('EXECUTION_CONTEXT_DESTROYED'))
        ) {
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
   * Attaches a workerEvent event listener to the worker page connection
   * This allows handling events emitted by the worker page
   * @returns {Promise<void>} Resolves when the event listener is attached
   */
  async attachWorkerEvent() {
    this.workerPage.getConnection().remoteHandle().addEventListener('workerEvent', this.handleWorkerEvent);
  }

  /**
   * Handles workerEvent events emitted by the worker page
   * @param {Object} event - The event object containing event details
   */
  async handleWorkerEvent(event) {
    this.pilotPage.getConnection().localHandle().emit('workerEvent', event);
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
      const reconnectionHandler = eventData => {
        clearTimeout(timeout);
        this.log('✅ Reconnection completed after URL change');
        resolve(eventData);
      };

      // Listen for reconnection error
      const errorHandler = eventData => {
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

  /**
   * Getter matching mobile launcher shape for saveIdentity()
   * Returns { launcherClient }
   */
  getStartContext() {
    return { konnector: this.konnector, launcherClient: this._launcherClient || null, destinationFolder: this.destinationFolder };
  }

  /** Optional user data (comes from the running connector) */
  getUserData() {
    return this._userData || null;
  }

  /** Setters used by PlaywrightLauncher (or other services) */
  setLauncherClient(client) {
    this._launcherClient = client;
  }

  setUserData(userData) {
    this._userData = userData;
  }

  // file methods
  shouldResetFileIndex() {
    if (this._firstFileSave) {
      this._firstFileSave = false;
      return false;
    } else {
      return true;
    }
  }

  /**
   * Get the index of existing files for the current konnector and the current sourceAccountIdentifier
   * The result is cached in this.existingFilesIndex to optimize the response time for multiple calls to saveFiles
   *
   * @return {Promise<Map<String, import('cozy-client/types/types').FileDocument>>} - index of existing files
   */
  async getExistingFilesIndex(reset = false) {
    this.log('🔨 getExistingFilesIndex starts');
    if (!reset && this.existingFilesIndex) {
      return this.existingFilesIndex;
    }

    const { sourceAccountIdentifier } = this.getUserData() || {};
    const { konnector, launcherClient: client } = this.getStartContext();
    const createdByApp = konnector.slug;
    if (!sourceAccountIdentifier) {
      throw new Error('getExistingFilesIndex: unexpected undefined sourceAccountIdentifier');
    }

    const existingFiles = await client.queryAll(
      Q('io.cozy.files')
        .where({
          trashed: false,
          cozyMetadata: {
            sourceAccountIdentifier,
            createdByApp
          }
        })
        .indexFields(['cozyMetadata.createdByApp', 'cozyMetadata.sourceAccountIdentifier', 'trashed'])
        .select(['metadata', 'cozyMetadata', 'name', 'dir_id', 'size', 'md5sum', 'mime', 'trashed'])
    );
    // @ts-ignore
    const existingFilesIndex = existingFiles.reduce((map, file) => {
      if (file.metadata?.fileIdAttributes) {
        // files without metadata will be replaced
        map.set(file.metadata.fileIdAttributes, file);
      }
      return map;
    }, new Map());
    return (this.existingFilesIndex = existingFilesIndex);
  }

  /**
   * Rerun the saveFiles function after have reindexed files and created the destination folder
   * @param {Array<FileDocument>} entries - list of file entries to save
   * @param {object} options - options object
   * @returns {Promise<Array<object>>} list of saved files
   */
  async retrySaveFiles(entries, options) {
    this.log('🔨 retrySaveFiles starts');
    const { launcherClient: client, konnector, destinationFolder } = this.getStartContext() || {};
    if (!destinationFolder) {
      throw new Error('retrySaveFiles: destinationFolder is not defined');
    }
    const folderPath = (destinationFolder.startsWith('/') ? destinationFolder : `/${destinationFolder}`) + `/${konnector.slug}`;
    this.log('saveFiles: Destination folder removed during konnector execution, trying again');
    const updatedFilesIndex = await this.getExistingFilesIndex(true); // update files index since the destination folder was removed

    return await saveFiles(client, entries, folderPath, {
      ...options,
      existingFilesIndex: updatedFilesIndex
    });
  }

  async ensureKonnectorFolder() {
    this.log('🔨 ensureKonnectorFolder starts');
    const { konnector, destinationFolder, launcherClient: client } = this.getStartContext();
    if (!destinationFolder) {
      throw new Error('ensureKonnectorFolder: destinationFolder is not defined');
    }
    const folderPath = destinationFolder + '/' + konnector.slug;
    this.log('🔍 ensureKonnectorFolder ' + folderPath);
    const fileCollection = client.collection('io.cozy.files');

    const { data: folder } = (await this.statDirectoryByPath(fileCollection, folderPath)) || (await fileCollection.createDirectoryByPath(folderPath));
    return folder;
  }

  /**
   * Retrieves a directory from its path
   *
   * @param  {CozyClient}  client CozyClient
   * @param  {string}  path   Directory path
   * @returns {Promise<import('../types').IOCozyFolder|null>}        Created io.cozy.files document
   * @throws will throw an error on any error without status === 404
   */
  async statDirectoryByPath(fileCollection, path) {
    this.log('🔨 statDirectoryByPath starts');
    try {
      const response = await fileCollection.statByPath(path);
      if (response.data.trashed) {
        return null;
      }
      return response.data;
    } catch (error) {
      if (error && error.status === 404) return null;
      throw new Error(error.message);
    }
  }

  setKonnector(konnector) {
    this.konnector = konnector;
  }
}

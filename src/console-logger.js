/**
 * Console Logger Module
 * Handles console message interception and logging from the page
 */

import debug from 'debug';

const log = debug('handshake:console');
const pageLog = debug('handshake:page');

/**
 * Setup console message logging from the page
 * @param {Page} page - Playwright page instance
 */
export function setupConsoleLogging(page) {
  log('📄 Setting up console logging...');
  
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    pageLog(`[${type}] ${text}`);
  });
  
  log('✅ Console logging is ready');
} 
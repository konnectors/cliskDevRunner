/**
 * Log Configuration Module
 * Centralizes debug namespace management and provides different log levels
 */

import debug from 'debug';

// Define debug namespaces for different components
export const DEBUG_NAMESPACES = {
  // Main CLI and launcher logs
  CLI: 'clisk:cli:main',
  LAUNCHER: 'clisk:launcher:playwright',
  
  // Page-specific logs
  PILOT_MAIN: 'clisk:pilot:main',
  PILOT_PAGE: 'clisk:pilot:page',
  PILOT_MESSAGE: 'clisk:pilot:message',
  PILOT_COMM: 'clisk:pilot:comm',
  PILOT_NAV: 'clisk:pilot:nav',
  
  WORKER_MAIN: 'clisk:worker:main',
  WORKER_PAGE: 'clisk:worker:page',
  WORKER_MESSAGE: 'clisk:worker:message',
  WORKER_COMM: 'clisk:worker:comm',
  WORKER_NAV: 'clisk:worker:nav',
  
  // Connector loader logs
  LOADER: 'clisk:loader',
  
  // Post-me communication logs
  POST_ME: 'clisk:post-me',
};

// Define log levels with their corresponding debug patterns
export const LOG_LEVELS = {
  EXTREME: 'clisk:*', // Everything - all debug namespaces
  FULL: 'clisk:cli:*,clisk:launcher:*,clisk:pilot:*,clisk:worker:*,clisk:loader:*,clisk:post-me:*', // All main logs but no page-level details
  NORMAL: 'clisk:cli:*,clisk:launcher:*', // Only CLI and launcher logs
  QUIET: '', // No debug logs
};

/**
 * Configure debug logging based on environment or explicit level
 * @param {string} level - Log level ('extreme', 'full', 'normal', 'quiet')
 */
export function configureLogging(level = null) {
  // Check if DEBUG is explicitly set to empty (quiet mode from npm script)
  if (process.env.DEBUG === '') {
    // Don't change anything, keep DEBUG empty for quiet mode
    return;
  }
  
  // Determine log level from environment or parameter
  const logLevel = level || process.env.LOG_LEVEL || 'normal';
  
  // Set DEBUG environment variable based on level
  const debugPattern = LOG_LEVELS[logLevel.toUpperCase()] || LOG_LEVELS.NORMAL;
  
  if (debugPattern) {
    process.env.DEBUG = debugPattern;
    if (logLevel.toLowerCase() !== 'quiet') {
      console.log(`🔧 Log level set to: ${logLevel.toUpperCase()}`);
      console.log(`🔧 Debug pattern: ${debugPattern}`);
    }
  } else {
    // Clear DEBUG for quiet mode
    delete process.env.DEBUG;
    // Don't show any messages for quiet mode
  }
}

/**
 * Get a debug logger for a specific namespace
 * @param {string} namespace - Debug namespace
 * @returns {Function} Debug logger function
 */
export function getLogger(namespace) {
  return debug(namespace);
}

/**
 * Create page-specific loggers
 * @param {string} pageName - Page name ('pilot' or 'worker')
 * @returns {Object} Object with different loggers for the page
 */
export function createPageLoggers(pageName) {
  return {
    main: debug(`clisk:${pageName}:main`),
    page: debug(`clisk:${pageName}:page`),
    message: debug(`clisk:${pageName}:message`),
    comm: debug(`clisk:${pageName}:comm`),
    nav: debug(`clisk:${pageName}:nav`),
  };
} 
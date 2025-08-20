/**
 * Log Configuration Module
 * Centralizes debug namespace management and provides different log levels
 */

import debug from 'debug';

// Define log levels with their corresponding debug patterns
export const LOG_LEVELS = {
  EXTREME: 'clisk:*', // Everything - all debug namespaces
  FULL: 'clisk:cli:*,clisk:launcher:*,clisk:*:main,clisk:*:page,clisk:*:nav,clisk:loader:*', // All main logs but no page-level details
  NORMAL: 'clisk:cli:*,clisk:launcher:*,clisk:pilot:main', // cli, launcher, + main page logs
  QUIET: '' // No debug logs
};

/**
 * Configure debug logging based on environment or explicit level
 * @param {string} level - Log level ('extreme', 'full', 'normal', 'quiet')
 */
export function configureLogging(level = null) {
  // Determine log level from environment or parameter
  const logLevel = level || process.env.LOG_LEVEL || 'normal';

  // Set DEBUG environment variable based on level
  const debugPattern = LOG_LEVELS[logLevel.toUpperCase()] || LOG_LEVELS.NORMAL;

  if (debugPattern) {
    process.env.DEBUG = debugPattern;
    // Force debug to re-read the DEBUG environment variable
    debug.enable(debugPattern);
    if (logLevel.toLowerCase() !== 'quiet') {
      console.log(`🔧 Log level set to: ${logLevel.toUpperCase()}`);
      console.log(`🔧 Debug pattern: ${debugPattern}`);
    }
  } else {
    // Clear DEBUG for quiet mode
    delete process.env.DEBUG;
    debug.disable();
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

/**
 * Connector Loader Module
 * Handles loading and injection of connector code into the page
 */

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import debug from 'debug';

const log = debug('clisk:handshake:loader');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load and inject connector code into the page
 * @param {Page} page - Playwright page instance
 * @param {string} connectorPath - Path to the connector directory
 */
export async function loadConnector(page, connectorPath) {
  log(`📦 Loading connector from ${connectorPath}...`);

  try {
    // Read connector main.js file - go up one level since we're now in src/
    const mainJsPath = path.join(__dirname, '..', connectorPath, 'main.js');
    const connectorCode = readFileSync(mainJsPath, 'utf8');

    // Read manifest - go up one level since we're now in src/
    const manifestPath = path.join(__dirname, '..', connectorPath, 'manifest.konnector');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

    log(`📋 Connector: ${manifest.name} v${manifest.version}`);

    // Inject connector code
    await page.addScriptTag({
      content: connectorCode
    });

    log('✅ Connector code injected successfully');

    return manifest;
  } catch (error) {
    log('❌ Error loading connector: %s', error.message);
    throw error;
  }
}

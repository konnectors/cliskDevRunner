/**
 * Console Logger Module
 * Handles console message interception and logging from the page
 */

/**
 * Setup console message logging from the page
 * @param {Page} page - Playwright page instance
 */
export function setupConsoleLogging(page) {
  console.log('📄 Setting up console logging...');
  
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    console.log(`📄 [Console ${type}]`, text);
  });
  
  console.log('✅ Console logging is ready');
} 
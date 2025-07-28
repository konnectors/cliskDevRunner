import { getLogger, configureLogging } from './log-config.js';
import PlaywrightLauncher from './PlaywrightLauncher.js';
import minimist from 'minimist';

// Parse command line arguments
const argv = minimist(process.argv.slice(2), {
  string: ['log-level'],
  boolean: ['help', 'h', 'stay-open'],
  alias: {
    h: 'help',
    l: 'log-level',
    s: 'stay-open'
  },
  default: {
    'log-level': process.env.LOG_LEVEL || 'normal'
  }
});

// Help function
function showHelp() {
  console.log(`
🚀 CliskDevRunner - Test connector with Playwright in React Native webview environment

Usage:
  node src/index.js [connector] [options]

Arguments:
  connector                    Path to the connector to test (default: examples/evaluate-konnector)

Options:
  -h, --help                  Show this help message
  -l, --log-level <level>     Set log level: quiet, normal, full, extreme (default: normal)
                              Can also be set via LOG_LEVEL environment variable
  -s, --stay-open             Keep browser window open after connector execution
                              User must manually close the browser window to exit

Examples:
  node src/index.js examples/evaluate-konnector
  node src/index.js examples/goto-konnector --log-level full
  node src/index.js --log-level quiet examples/minimal-konnector
  node src/index.js --stay-open examples/evaluate-konnector

Environment Variables:
  LOG_LEVEL                   Set log level (overrides --log-level option)
  DEBUG                       If set to empty string, enables quiet mode
`);
  process.exit(0);
}

// Show help if requested
if (argv.help) {
  showHelp();
}

// Get connector path from positional arguments
const connectorPath = argv._[0] || 'examples/evaluate-konnector';

// Configure logging
let logLevel = argv['log-level'];

// Check if DEBUG is explicitly set to empty (quiet mode from npm script)
if (process.env.DEBUG === '') {
  logLevel = 'quiet';
}

configureLogging(logLevel);

const log = getLogger('clisk:cli:main');

async function main() {
  log('🚀 Starting CliskDevRunner...');
  log(`📁 Using connector: ${connectorPath}`);
  if (logLevel.toLowerCase() !== 'quiet') {
    log(`🔧 Log level: ${logLevel.toUpperCase()}`);
  }
  
  if (argv['stay-open']) {
    log('🔓 Stay-open mode enabled - browser window will remain open after execution');
  }

  const launcher = new PlaywrightLauncher();
  
  try {
    await launcher.init(connectorPath);
    await launcher.start();
    
    if (argv['stay-open']) {
      log('\n🎯 Connector execution completed!');
      log('🔓 Browser window will remain open for inspection.');
      log('💡 Close the browser window manually to exit the program.');
      
      // Wait for browser to be closed manually
      await new Promise((resolve) => {
        let browserClosed = false;
        
        // Function to check if browser tabs are still accessible
        const checkTabsAccessible = async () => {
          try {
            const pilotPage = launcher.getPilotPage();
            const workerPage = launcher.getWorkerPage();
            
            if (!pilotPage || !workerPage) {
              return true;
            }
            
            // Try to access title of both tabs
            const pilotTitle = await pilotPage.page.title();
            const workerTitle = await workerPage.page.title();
            
            return false; // Both tabs are still accessible
          } catch (error) {
            log('🔍 One or both tabs are no longer accessible, assuming closed');
            return true; // At least one tab is closed
          }
        };
        
        // Check periodically
        const checkInterval = setInterval(async () => {
          if (browserClosed) return;
          
          const isClosed = await checkTabsAccessible();
          if (isClosed) {
            browserClosed = true;
            clearInterval(checkInterval);
            resolve();
          }
        }, 1000);
        
        // Also listen for process signals
        const cleanup = () => {
          if (!browserClosed) {
            browserClosed = true;
            clearInterval(checkInterval);
            resolve();
          }
        };
        
        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);
      });
      
      log('✅ Browser closed by user, exiting...');
      process.exit(0);
    } else {
      await launcher.stop();
    }
  } catch (error) {
    console.error('❌ Test failed:', error);
    
    // Cleanup on error (always stop, even in stay-open mode)
    try {
      await launcher.stop();
    } catch (cleanupError) {
      console.error('⚠️ Error during cleanup:', cleanupError);
    }
    
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  log('\n🛑 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

// Start the application
main().catch(console.error); 
import { getLogger, configureLogging } from './log-config.js';
import PlaywrightLauncher from './PlaywrightLauncher.js';
import minimist from 'minimist';
import Conf from 'conf';

// Parse command line arguments
const argv = minimist(process.argv.slice(2), {
  string: ['log-level', 'connector'],
  boolean: ['help', 'h', 'stay-open'],
  alias: {
    h: 'help',
    l: 'log-level',
    s: 'stay-open',
    c: 'connector'
  }
});

// Initialize configuration with conf
const config = new Conf({
  projectName: 'clisk-dev-runner',
  configName: 'config',
  cwd: process.cwd(),
  schema: {
    connector: {
      type: 'string',
      default: 'examples/evaluate-konnector'
    },
    logLevel: {
      type: 'string',
      enum: ['quiet', 'normal', 'full', 'extreme'],
      default: 'normal'
    },
    stayOpen: {
      type: 'boolean',
      default: false
    },
    browser: {
      type: 'object',
      properties: {
        headless: { type: 'boolean', default: false },
        args: { type: 'array', default: ['--no-sandbox', '--disable-web-security'] }
      }
    },
    mobile: {
      type: 'object',
      properties: {
        hasTouch: { type: 'boolean', default: true },
        isMobile: { type: 'boolean', default: true },
        locale: { type: 'string', default: 'fr-FR' },
        timezoneId: { type: 'string', default: 'Europe/Paris' },
        viewport: {
          type: 'object',
          properties: {
            width: { type: 'number', default: 390 },
            height: { type: 'number', default: 844 }
          }
        },
        userAgent: { type: 'string' },
        deviceScaleFactor: { type: 'number', default: 3 },
        geolocation: {
          type: 'object',
          properties: {
            longitude: { type: 'number', default: -74.006 },
            latitude: { type: 'number', default: 40.7128 }
          }
        }
      }
    }
  },
  defaults: {
    connector: 'examples/evaluate-konnector',
    logLevel: 'normal',
    stayOpen: false,
    browser: {
      headless: false,
      args: ['--no-sandbox', '--disable-web-security']
    },
    mobile: {
      hasTouch: true,
      isMobile: true,
      locale: 'fr-FR',
      timezoneId: 'Europe/Paris',
      viewport: { width: 390, height: 844 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Mobile/15E148 Safari/604.1',
      deviceScaleFactor: 3,
      geolocation: { longitude: -74.006, latitude: 40.7128 }
    }
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
  -c, --connector <path>      Specify connector path

Configuration:
  The application uses a configuration file that can be overridden by command line options.
  Configuration file location: ${config.path}
  
  You can set default values in the config file:
  - connector: Default connector to use
  - logLevel: Default log level
  - stayOpen: Default stay-open behavior
  - browser: Browser launch options
  - mobile: Mobile simulation settings

Examples:
  node src/index.js examples/evaluate-konnector
  node src/index.js --log-level full examples/goto-konnector
  node src/index.js --stay-open examples/minimal-konnector
  node src/index.js --connector examples/goto-konnector --log-level quiet

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

// Update configuration with command line arguments (command line takes precedence)
if (argv['log-level']) {
  config.set('logLevel', argv['log-level']);
}
if (argv['stay-open']) {
  config.set('stayOpen', true);
}
if (argv.connector) {
  config.set('connector', argv.connector);
}
// Handle positional connector argument
if (argv._[0]) {
  config.set('connector', argv._[0]);
}

// Get configuration values
const connectorPath = config.get('connector');
let logLevel = config.get('logLevel');

// Check if DEBUG is explicitly set to empty (quiet mode from npm script)
if (process.env.DEBUG === '') {
  logLevel = 'quiet';
}

configureLogging(logLevel);

const log = getLogger('clisk:cli:main');

async function main() {
  log('🚀 Starting CliskDevRunner...');
  log(`📁 Using connector: ${connectorPath}`);
  log(`⚙️  Configuration file: ${config.path}`);
  if (logLevel.toLowerCase() !== 'quiet') {
    log(`🔧 Log level: ${logLevel.toUpperCase()}`);
  }
  
  if (config.get('stayOpen')) {
    log('🔓 Stay-open mode enabled - browser window will remain open after execution');
  }

  const launcher = new PlaywrightLauncher();
  
  try {
    await launcher.init(connectorPath);
    await launcher.start();
    
    if (config.get('stayOpen')) {
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
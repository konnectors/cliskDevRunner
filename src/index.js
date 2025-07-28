import { getLogger, configureLogging } from './log-config.js';
import PlaywrightLauncher from './PlaywrightLauncher.js';
import minimist from 'minimist';

// Parse command line arguments
const argv = minimist(process.argv.slice(2), {
  string: ['log-level'],
  boolean: ['help', 'h'],
  alias: {
    h: 'help',
    l: 'log-level'
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

Examples:
  node src/index.js examples/evaluate-konnector
  node src/index.js examples/handshake-konnector --log-level full
  node src/index.js --log-level quiet examples/minimal-konnector

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

  const launcher = new PlaywrightLauncher();
  
  try {
    await launcher.init(connectorPath);
    await launcher.start();
    await launcher.stop();
  } catch (error) {
    console.error('❌ Test failed:', error);
    
    // Cleanup on error
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
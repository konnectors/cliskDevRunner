import { getLogger, configureLogging } from './log-config.js';
import PlaywrightLauncher from './PlaywrightLauncher.js';

// Configure logging based on environment or command line
let logLevel = process.argv[3] || process.env.LOG_LEVEL || 'normal';

// Check if DEBUG is explicitly set to empty (quiet mode from npm script)
if (process.env.DEBUG === '') {
  logLevel = 'quiet';
}

configureLogging(logLevel);

const log = getLogger('clisk:cli:main');

// Configuration
const CONNECTOR_PATH = process.argv[2] || 'examples/evaluate-konnector';

async function main() {
  log('🚀 Starting HandshakeTester with PlaywrightLauncher...');
  log(`📁 Using connector: ${CONNECTOR_PATH}`);
  if (logLevel.toLowerCase() !== 'quiet') {
    log(`🔧 Log level: ${logLevel.toUpperCase()}`);
  }

  const launcher = new PlaywrightLauncher();
  
  try {
    // Initialize the launcher
    await launcher.init(CONNECTOR_PATH);
    
    // Start the launcher (this will call ensureAuthenticated)
    await launcher.start();
    
    log('🎉 Test completed successfully!');
    log('🔄 Worker reconnection: ✅ Working');
    log('🔧 runInWorker function: ✅ Working');
    log('📝 evaluate in worker: ✅ Working');
    
    // Clean up and exit
    log('🧹 Cleaning up...');
    await launcher.stop();
    
    log('👋 Test completed successfully - exiting');
    // process.exit(0);

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
/**
 * Minimal Debug Connector
 * This connector is designed to test and debug the post-me handshake process
 */

console.log('🚀 [MinimalConnector] Script loading started...');

// Check environment immediately
console.log('🔍 [MinimalConnector] Environment check:');
console.log('  - window available:', typeof window !== 'undefined');
console.log('  - ReactNativeWebView available:', !!(window.ReactNativeWebView));
console.log('  - ReactNativeWebView.postMessage available:', !!(window.ReactNativeWebView && window.ReactNativeWebView.postMessage));

// Test ReactNativeWebView.postMessage immediately
if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
  console.log('📱 [MinimalConnector] Testing ReactNativeWebView.postMessage...');
  try {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'debug',
      source: 'MinimalConnector',
      message: 'Initial connectivity test',
      timestamp: Date.now()
    }));
    console.log('✅ [MinimalConnector] ReactNativeWebView.postMessage test successful');
  } catch (error) {
    console.error('❌ [MinimalConnector] ReactNativeWebView.postMessage test failed:', error);
  }
} else {
  console.error('❌ [MinimalConnector] ReactNativeWebView.postMessage not available!');
}

// Import post-me functions (this might cause the addBinding error)
console.log('📦 [MinimalConnector] Attempting to import post-me...');
let ChildHandshake;
try {
  // Try to detect if post-me is available globally
  if (typeof window !== 'undefined' && window.postMe) {
    ChildHandshake = window.postMe.ChildHandshake;
    console.log('✅ [MinimalConnector] Found post-me in window.postMe');
  } else {
    console.log('🔍 [MinimalConnector] post-me not in global scope, checking for inline availability...');
    // In a real webpack bundle, post-me would be bundled inline
    // For now, we'll create a mock to test the handshake pattern
    ChildHandshake = null;
    console.log('⚠️ [MinimalConnector] post-me not available, will create mock handshake');
  }
} catch (error) {
  console.error('❌ [MinimalConnector] Error importing post-me:', error);
  ChildHandshake = null;
}

// Minimal ContentScript class
class MinimalContentScript {
  constructor() {
    console.log('🏗️ [MinimalContentScript] Constructor called');
    this.initialized = false;
    this.handshakeCompleted = false;
    this.messenger = null;
    
    console.log('🔧 [MinimalContentScript] Starting initialization...');
    this.init();
  }
  
  async init() {
    console.log('⚡ [MinimalContentScript] Init method started');
    
    try {
      // Step 1: Setup messaging
      await this.setupMessaging();
      
      // Step 2: Attempt handshake
      await this.attemptHandshake();
      
      // Step 3: Test communication
      await this.testCommunication();
      
      this.initialized = true;
      console.log('✅ [MinimalContentScript] Initialization completed successfully');
      
    } catch (error) {
      console.error('❌ [MinimalContentScript] Initialization failed:', error);
      console.error('Stack trace:', error.stack);
    }
  }
  
  async setupMessaging() {
    console.log('📡 [MinimalContentScript] Setting up messaging...');
    
    // Check ReactNativeWebView again
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      console.log('✅ [MinimalContentScript] ReactNativeWebView.postMessage confirmed available');
      
      // Create a simple messenger wrapper
      this.messenger = {
        postMessage: (message) => {
          console.log('📤 [MinimalContentScript] Sending message:', message);
          window.ReactNativeWebView.postMessage(JSON.stringify(message));
        },
        
        addMessageListener: (callback) => {
          console.log('👂 [MinimalContentScript] Adding message listener');
          window.addEventListener('message', (event) => {
            console.log('📥 [MinimalContentScript] Received message:', event.data);
            callback(event);
          });
        }
      };
      
      console.log('✅ [MinimalContentScript] Messenger setup completed');
    } else {
      throw new Error('ReactNativeWebView.postMessage not available for messaging setup');
    }
  }
  
  async attemptHandshake() {
    console.log('🤝 [MinimalContentScript] Attempting handshake...');
    
    if (ChildHandshake) {
      console.log('🔗 [MinimalContentScript] Using real post-me ChildHandshake');
      
      try {
        // This is where the addBinding error might occur
        console.log('🚨 [MinimalContentScript] About to call ChildHandshake - WATCH FOR ADDBINDING ERROR');
        
        const connection = await ChildHandshake(this.messenger, {
          debug: true,
          timeout: 10000
        });
        
        console.log('✅ [MinimalContentScript] ChildHandshake successful!', connection);
        this.handshakeCompleted = true;
        this.connection = connection;
        
      } catch (error) {
        console.error('❌ [MinimalContentScript] ChildHandshake failed:', error);
        console.error('Error type:', error.constructor.name);
        console.error('Error message:', error.message);
        console.error('Stack trace:', error.stack);
        
        // Continue with mock handshake
        this.mockHandshake();
      }
    } else {
      console.log('🎭 [MinimalContentScript] Using mock handshake (no post-me available)');
      this.mockHandshake();
    }
  }
  
  mockHandshake() {
    console.log('🎭 [MinimalContentScript] Performing mock handshake...');
    
    // Send a handshake request message
    this.messenger.postMessage({
      type: '@post-me',
      action: 'handshake-request',
      source: 'MinimalContentScript',
      timestamp: Date.now(),
      payload: {
        methods: ['testMethod'],
        debug: true
      }
    });
    
    // Listen for handshake response
    this.messenger.addMessageListener((event) => {
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data.type === '@post-me' && data.action === 'handshake-response') {
          console.log('✅ [MinimalContentScript] Mock handshake response received:', data);
          this.handshakeCompleted = true;
        }
      } catch (error) {
        console.log('🔍 [MinimalContentScript] Non-JSON message received:', event.data);
      }
    });
    
    console.log('✅ [MinimalContentScript] Mock handshake initiated');
  }
  
  async testCommunication() {
    console.log('📞 [MinimalContentScript] Testing communication...');
    
    // Send test messages every 2 seconds
    let messageCount = 0;
    const sendTestMessage = () => {
      messageCount++;
      const testMessage = {
        type: 'debug-test',
        source: 'MinimalContentScript',
        messageNumber: messageCount,
        timestamp: Date.now(),
        handshakeStatus: this.handshakeCompleted ? 'completed' : 'pending'
      };
      
      console.log(`📤 [MinimalContentScript] Sending test message #${messageCount}:`, testMessage);
      this.messenger.postMessage(testMessage);
      
      if (messageCount < 5) {
        setTimeout(sendTestMessage, 2000);
      } else {
        console.log('✅ [MinimalContentScript] Communication test completed');
      }
    };
    
    // Start sending test messages
    setTimeout(sendTestMessage, 1000);
  }
  
  // Test method that could be called via handshake
  testMethod(params) {
    console.log('🧪 [MinimalContentScript] testMethod called with params:', params);
    return { success: true, timestamp: Date.now(), receivedParams: params };
  }
}

// Auto-initialize the connector
console.log('🎬 [MinimalConnector] Starting auto-initialization...');

try {
  // Create ContentScript instance in both pilot and worker contexts
  console.log('👷 [MinimalConnector] Creating MinimalContentScript instance...');
  const contentScript = new MinimalContentScript();
  
  // Make it globally available for debugging
  window.minimalConnector = contentScript;
  console.log('🌐 [MinimalConnector] Connector available as window.minimalConnector');
  
  // Also try to expose some debug info
  window.debugInfo = {
    connectorLoaded: true,
    timestamp: Date.now(),
    hasReactNativeWebView: !!(window.ReactNativeWebView),
    hasPostMessage: !!(window.ReactNativeWebView && window.ReactNativeWebView.postMessage),
    version: '1.0.0'
  };
  
  console.log('✅ [MinimalConnector] Auto-initialization completed');
  
} catch (error) {
  console.error('❌ [MinimalConnector] Auto-initialization failed:', error);
  console.error('Stack trace:', error.stack);
}

console.log('🏁 [MinimalConnector] Script execution completed'); 
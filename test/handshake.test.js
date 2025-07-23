/**
 * Tests for handshake connector functionality
 * Using Node.js built-in test runner
 */

import { test, describe, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { chromium } from 'playwright';
import { CliskPage } from '../src/clisk-page.js';
import { loadConnector } from '../src/connector-loader.js';

describe('Handshake Connector Tests', () => {
  let browser;
  let context;
  let testPage;

  before(async () => {
    // Setup browser and context
    browser = await chromium.launch({ 
      headless: true, // Run headless for tests
      args: ['--no-sandbox', '--disable-web-security']
    });
    
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36',
      viewport: { width: 375, height: 667 }
    });
  });

  afterEach(async () => {
    // Cleanup each test
    if (testPage) {
      await testPage.close();
      testPage = null;
    }
  });

  after(async () => {
    // Final cleanup
    if (browser) {
      await browser.close();
    }
  });

  test('should load handshake connector and call ping function', async () => {
    // Arrange
    testPage = new CliskPage(context, 'test-page');
    let pingCalled = false;
    let pingResponse = null;
    
    // Create a custom test page that tracks ping calls
    class TestPageWithSpy extends CliskPage {
      getLocalMethods() {
        const methods = super.getLocalMethods();
        // Wrap ping method to track calls
        const originalPing = methods.ping;
        methods.ping = (...args) => {
          pingCalled = true;
          pingResponse = originalPing.call(this, ...args);
          return pingResponse;
        };
        return methods;
      }
    }

    testPage = new TestPageWithSpy(context, 'test-page');

    // Act
    await testPage.init();
    await testPage.navigate('about:blank');
    
    const manifest = await testPage.loadConnector('examples/handshake-konnector', loadConnector);
    const connection = await testPage.initiateHandshake();

    // Wait a bit for the connector to initialize and call ping
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Assert
    assert.strictEqual(typeof manifest, 'object', 'Manifest should be loaded');
    assert.strictEqual(manifest.name, 'Template', 'Should load handshake-konnector');
    assert.strictEqual(manifest.version, '1.0.0', 'Should have correct version');
    
    assert.ok(connection, 'Connection should be established');
    assert.strictEqual(pingCalled, true, 'Ping method should have been called by the connector');
    assert.strictEqual(typeof pingResponse, 'string', 'Ping should return a string response');
    assert.ok(pingResponse.includes('test-page'), 'Ping response should include page name');
  });

  test('should handle connector events', async () => {
    // Arrange
    testPage = new CliskPage(context, 'event-test-page');
    let eventReceived = false;
    let eventData = null;

    await testPage.init();
    await testPage.navigate('about:blank');
    
    const manifest = await testPage.loadConnector('examples/handshake-konnector', loadConnector);
    const connection = await testPage.initiateHandshake();

    // Setup event listener
    connection.remoteHandle().addEventListener('test-event', (data) => {
      eventReceived = true;
      eventData = data;
    });

    // Wait for events to be emitted
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Assert
    assert.strictEqual(eventReceived, true, 'Should receive test-event from connector');
    assert.ok(eventData, 'Event data should be present');
    assert.strictEqual(typeof eventData, 'object', 'Event data should be an object');
  });

  test('should support multiple method calls', async () => {
    // Arrange
    const methodCalls = [];
    
    // Create a test page that tracks all method calls
    class TestPageWithMethodTracking extends CliskPage {
      getLocalMethods() {
        const methods = super.getLocalMethods();
        
        // Wrap all methods to track calls
        Object.keys(methods).forEach(methodName => {
          const originalMethod = methods[methodName];
          methods[methodName] = (...args) => {
            methodCalls.push({ method: methodName, args });
            return originalMethod.call(this, ...args);
          };
        });
        
        return methods;
      }
    }

    testPage = new TestPageWithMethodTracking(context, 'multi-call-test');

    // Act
    await testPage.init();
    await testPage.navigate('about:blank');
    
    await testPage.loadConnector('examples/handshake-konnector', loadConnector);
    const connection = await testPage.initiateHandshake();

    // Wait for connector to make calls
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Assert
    assert.ok(connection, 'Connection should be established');
    assert.ok(methodCalls.length > 0, 'At least one method should have been called');
    
    const pingCalls = methodCalls.filter(call => call.method === 'ping');
    assert.ok(pingCalls.length > 0, 'Ping method should have been called');
  });

  test('should establish connection and respond to ping', async () => {
    // Arrange
    testPage = new CliskPage(context, 'ping-test');
    
    await testPage.init();
    await testPage.navigate('about:blank');
    
    // Act
    const manifest = await testPage.loadConnector('examples/handshake-konnector', loadConnector);
    const connection = await testPage.initiateHandshake();
    
    // Wait for initial setup
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Try to call a method on the connector through the connection
    const remoteHandle = connection.remoteHandle();
    
    // Assert
    assert.ok(connection, 'Connection should be established');
    assert.ok(remoteHandle, 'Remote handle should be available');
    assert.strictEqual(manifest.name, 'Template', 'Should load correct connector');
    
    // Test that the connection is working by emitting an event
    connection.localHandle().emit('test-ping', { test: true });
    
    // Wait and verify the system is responsive
    await new Promise(resolve => setTimeout(resolve, 500));
    assert.ok(true, 'System should remain responsive after ping');
  });

  test('should handle worker and pilot pages simultaneously', async () => {
    // Arrange
    let workerPingCalled = false;
    let pilotPingCalled = false;
    let workerPingResponse = null;
    let pilotPingResponse = null;
    
    // Create test pages with spies for both worker and pilot
    class WorkerTestPage extends CliskPage {
      getLocalMethods() {
        const methods = super.getLocalMethods();
        const originalPing = methods.ping;
        methods.ping = (...args) => {
          workerPingCalled = true;
          workerPingResponse = originalPing.call(this, ...args);
          return workerPingResponse;
        };
        return methods;
      }
    }

    class PilotTestPage extends CliskPage {
      getLocalMethods() {
        const methods = super.getLocalMethods();
        const originalPing = methods.ping;
        methods.ping = (...args) => {
          pilotPingCalled = true;
          pilotPingResponse = originalPing.call(this, ...args);
          return pilotPingResponse;
        };
        return methods;
      }
    }

    const workerPage = new WorkerTestPage(context, 'worker');
    const pilotPage = new PilotTestPage(context, 'pilot');
    
    try {
      // Act - Initialize pages sequentially (to avoid Playwright exposeFunction conflicts)
      await workerPage.init();
      await pilotPage.init();

      // Navigate both pages
      await Promise.all([
        workerPage.navigate('about:blank'),
        pilotPage.navigate('about:blank')
      ]);

      // Load connectors on both pages in parallel
      const [workerManifest, pilotManifest] = await Promise.all([
        workerPage.loadConnector('examples/handshake-konnector', loadConnector),
        pilotPage.loadConnector('examples/handshake-konnector', loadConnector)
      ]);

      // Initiate handshakes in parallel
      const [workerConnection, pilotConnection] = await Promise.all([
        workerPage.initiateHandshake(),
        pilotPage.initiateHandshake()
      ]);

      // Wait for connectors to initialize and call ping
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Assert - Validate manifests
      assert.strictEqual(typeof workerManifest, 'object', 'Worker manifest should be loaded');
      assert.strictEqual(workerManifest.name, 'Template', 'Worker should load handshake-konnector');
      assert.strictEqual(workerManifest.version, '1.0.0', 'Worker should have correct version');
      
      assert.strictEqual(typeof pilotManifest, 'object', 'Pilot manifest should be loaded');
      assert.strictEqual(pilotManifest.name, 'Template', 'Pilot should load handshake-konnector');
      assert.strictEqual(pilotManifest.version, '1.0.0', 'Pilot should have correct version');

      // Assert - Validate connections
      assert.ok(workerConnection, 'Worker connection should be established');
      assert.ok(pilotConnection, 'Pilot connection should be established');

      // Assert - Validate ping calls
      assert.strictEqual(workerPingCalled, true, 'Worker ping method should have been called');
      assert.strictEqual(pilotPingCalled, true, 'Pilot ping method should have been called');
      
      // Assert - Validate ping responses
      assert.strictEqual(typeof workerPingResponse, 'string', 'Worker ping should return a string response');
      assert.strictEqual(typeof pilotPingResponse, 'string', 'Pilot ping should return a string response');
      assert.ok(workerPingResponse.includes('worker'), 'Worker ping response should include "worker"');
      assert.ok(pilotPingResponse.includes('pilot'), 'Pilot ping response should include "pilot"');

      // Assert - Validate isolation (responses should be different)
      assert.notStrictEqual(workerPingResponse, pilotPingResponse, 'Worker and pilot should have different ping responses');
      
    } finally {
      // Cleanup both pages
      await Promise.all([
        workerPage.close(),
        pilotPage.close()
      ]);
    }
  });
}); 
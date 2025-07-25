# Automated Tests

This folder contains automated tests to validate the proper functioning of the CliskDevRunner system.

## 🧪 Available Tests

### `handshake.test.js`
Main tests that validate:

1. **Connector loading**
   - Loads the handshake-konnector from `examples/`
   - Validates the manifest (name, version)
   - Confirms post-me connection establishment

2. **Ping function call**
   - Uses a spy to track method calls
   - Confirms that the connector automatically calls `ping()`
   - Validates that the response contains the page name

3. **Event handling**
   - Tests receiving events emitted by the connector
   - Validates event data structure

4. **Multiple method calls**
   - Tracks all local method calls
   - Confirms that multiple methods can be called

5. **Connection and responsiveness**
   - Tests post-me connection establishment
   - Validates that the system remains responsive

6. **Simultaneous Worker and Pilot** ⭐
   - Creates two independent pages (worker and pilot)
   - Validates simultaneous handshakes on both pages
   - Confirms that `ping()` is called on each page
   - Verifies complete isolation between pages
   - Tests multi-page architecture in real conditions

## 🚀 Usage

### Run all tests
```bash
yarn test
```

### Tests in watch mode (automatic re-execution on changes)
```bash
yarn test:watch
```

### Tests with detailed output
```bash
yarn test:verbose
```

### Run a specific test
```bash
node --test test/handshake.test.js
```

## 🏗 Test Architecture

Tests use:
- **Node.js built-in test runner** (no external dependency)
- **Playwright** for browser automation
- **CliskPage** for test page isolation
- **Headless mode** for fast execution
- **Spies/Mocks** via class inheritance to track calls

### Custom test example

```javascript
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { CliskPage } from '../src/clisk-page.js';

describe('My Custom Test', () => {
  let testPage;

  test('should do something', async () => {
    // Create a custom test page
    class MyTestPage extends CliskPage {
      getLocalMethods() {
        const methods = super.getLocalMethods();
        // Add spies or modifications
        return methods;
      }
    }

    testPage = new MyTestPage(context, 'my-test');
    
    // Your test logic here
    await testPage.init();
    // ...
    
    assert.ok(true, 'Test should pass');
  });
});
```

## 📊 Expected Results

```
▶ Handshake Connector Tests
  ✔ should load handshake connector and call ping function (5574ms)
  ✔ should handle connector events (5549ms)
  ✔ should support multiple method calls (5552ms)
  ✔ should establish connection and respond to ping (5048ms)
  ✔ should handle worker and pilot pages simultaneously (6581ms)
✔ Handshake Connector Tests (28424ms)
ℹ tests 5
ℹ suites 1
ℹ pass 5
ℹ fail 0
```

## 🔧 Configuration

Tests use a headless browser for speed:
- **User Agent** : Android Mobile WebView
- **Viewport** : 375x667 (mobile)
- **Security** : Disabled for tests
- **Sandbox** : Disabled

## 🐛 Debugging

To debug a failing test:

1. **Enable visible mode** :
   ```javascript
   browser = await chromium.launch({ 
     headless: false, // See the browser
     slowMo: 1000     // Slow down actions
   });
   ```

2. **Add debug logs** :
   ```bash
   DEBUG=clisk:* yarn test
   ```

3. **Increase timeouts** if necessary :
   ```javascript
   await new Promise(resolve => setTimeout(resolve, 5000));
   ```

## 📝 Conventions

- **Test names** : Descriptive in English starting with "should"
- **AAA structure** : Arrange, Act, Assert
- **Cleanup** : Each test cleans up its resources in `afterEach`
- **Isolation** : Each test uses its own CliskPage instance
- **Timeouts** : Adapted to handshake speed (2-5 seconds) 
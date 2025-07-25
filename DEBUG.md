# CliskDevRunner - Debug Logging Guide

This project uses the `debug` library for filtered and modular logs.

## Available Namespaces

### Main logs
- `handshake:main` - General program orchestration

### Per-page logs (worker/pilot)
Each page has its own isolated namespaces:

- `clisk:worker:main` / `clisk:pilot:main` - Page lifecycle
- `clisk:worker:page` / `clisk:pilot:page` - Web page console
- `clisk:worker:message` / `clisk:pilot:message` - Detailed post-me messages
- `clisk:worker:comm` / `clisk:pilot:comm` - Communication and handshake
- `clisk:worker:nav` / `clisk:pilot:nav` - **Navigation and auto-reconnection** ⭐

### Connector logs
- `clisk:connector` - Loading and injection of connectors

## Usage Examples

### Normal startup
```bash
yarn start
```

### Main logs only
```bash
DEBUG=handshake:main yarn start
```

### Specific page logs
```bash
DEBUG=clisk:worker:* yarn start
DEBUG=clisk:pilot:* yarn start
```

### Navigation and auto-reconnection logs ⭐
```bash
DEBUG=clisk:worker:nav,clisk:pilot:nav yarn start
```

### Communication logs only
```bash
DEBUG=clisk:*:comm yarn start
```

### All logs
```bash
DEBUG=* yarn start
```

### Multi-page logs with communication
```bash
DEBUG=handshake:main,clisk:*:main,clisk:*:comm yarn start
```

## Auto-Reconnection Feature ⭐

The new auto-reconnection feature allows the system to maintain communication with connectors even when the user navigates to new URLs.

### How it works
1. **Automatic detection** of URL changes via `framenavigated`
2. **Clean closure** of the old post-me connection
3. **Automatic reinjection** of the connector on the new page
4. **Reestablishment** of post-me communication

### How to test
1. Start the system: `yarn start`
2. In a tab, navigate to any URL (e.g. google.com)
3. Observe the automatic reconnection logs
4. Verify that communication still works

### Specific logs
```bash
# Monitor navigation and reconnection
DEBUG=clisk:worker:nav,clisk:pilot:nav yarn start

# See the entire reconnection process
DEBUG=clisk:*:nav,clisk:*:comm yarn start
```

### Programmatic control
```javascript
// Disable auto-reconnection
workerPage.setAutoReconnect(false);

// Re-enable auto-reconnection  
pilotPage.setAutoReconnect(true);

// Force manual reconnection
await workerPage.manualReconnect();
```

## Multi-Page Architecture

The system now perfectly supports multiple pages with:
- **Isolated communication** per page
- **Separate logs** per namespace
- **Independent auto-reconnection** per page
- **Optimized performance** (parallelism when possible)

### Initialization
- Pages: **sequential** (avoids Playwright `exposeFunction` conflicts)
- Navigation: **parallel** (safe)
- Connector loading: **parallel** (safe)
- Handshakes: **parallel** (safe after sequential init) 
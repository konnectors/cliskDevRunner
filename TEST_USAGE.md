# CliskDevRunner - Test Usage Guide

## Available test scripts

### Complete tests
```bash
# All tests (7 tests, ~50s)
yarn test

# All tests with detailed output  
yarn test:verbose

# Watch mode (automatically restarts)
yarn test:watch
```

### Individual filtered tests (faster for debugging)
```bash
# Simple ping test (~7s)
yarn test:ping

# Goto-konnector test with ensureAuthenticated (~10s)
yarn test:goto

# Simultaneous multi-page test (~7s)
yarn test:multi

# Pilot -> worker control test (~12s)
yarn test:worker-control
```

### Manual filtering (direct syntax)
```bash
# For custom filtering, use directly:
node --test --test-name-pattern="keyword" test/*.test.js

# Examples:
node --test --test-name-pattern="ping" test/*.test.js
node --test --test-name-pattern="goto" test/*.test.js  
node --test --test-name-pattern="worker" test/*.test.js
```

## Debugging

To debug a specific test, use the individual scripts which are faster and isolate problems. 
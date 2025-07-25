# CliskDevRunner - Log Levels Configuration

This project uses the debug system to control log levels. Here are the different available levels:

## Log Levels

### 🔥 EXTREME
**Command:** `npm run start:extreme` or `DEBUG=clisk:* npm start`

Displays **ALL** logs, including:
- CLI and launcher logs
- Page logs (pilot and worker)
- Post-me communication logs
- Navigation logs
- Message logs
- Page console logs

**Usage:** Complete debugging, see absolutely everything that happens

### 📊 FULL
**Command:** `npm run start:full` or `DEBUG=clisk:cli:*,clisk:launcher:*,clisk:pilot:*,clisk:worker:* npm start`

Displays main logs without page details:
- ✅ CLI and launcher logs
- ✅ Main page logs (pilot and worker)
- ❌ No detailed communication logs
- ❌ No navigation logs
- ❌ No page console logs

**Usage:** General debugging, see the main flow without being overwhelmed

### 📝 NORMAL
**Command:** `npm run start:normal` or `DEBUG=clisk:cli:*,clisk:launcher:* npm start`

Displays only essential logs:
- ✅ CLI and launcher logs
- ❌ No page logs
- ❌ No communication logs
- ❌ No navigation logs

**Usage:** Normal usage, minimal logs to follow execution

### 🔇 QUIET
**Command:** `npm run start:quiet` or `npm start`

No debug logs:
- ❌ No debug logs
- ✅ Only console.error errors
- ✅ Only explicit console.log messages

**Usage:** Production or when you want minimal output

## Advanced Usage

### Via Environment Variable
```bash
# Set level via environment variable
LOG_LEVEL=extreme npm start
LOG_LEVEL=full npm start
LOG_LEVEL=normal npm start
LOG_LEVEL=quiet npm start
```

### Via Command Line Parameter
```bash
# The third parameter sets the log level
node src/index.js examples/evaluate-konnector extreme
node src/index.js examples/evaluate-konnector full
node src/index.js examples/evaluate-konnector normal
node src/index.js examples/evaluate-konnector quiet
```

### Via Direct DEBUG Variable
```bash
# Use DEBUG variable directly for fine control
DEBUG=clisk:cli:*,clisk:launcher:* npm start
DEBUG=clisk:pilot:* npm start
DEBUG=clisk:worker:comm npm start
```

## Tests with Different Levels

The same levels are available for tests:

```bash
npm run test:extreme    # All logs during tests
npm run test:full       # Main logs during tests
npm run test:normal     # Minimal logs during tests
npm run test            # No debug logs (quiet)
```

## Debug Namespace Structure

```
clisk:cli:main          # Main CLI logs
clisk:launcher:playwright # Playwright launcher logs
clisk:pilot:main        # Main pilot page logs
clisk:pilot:page        # Pilot page console logs
clisk:pilot:message     # Pilot page message logs
clisk:pilot:comm        # Pilot page communication logs
clisk:pilot:nav         # Pilot page navigation logs
clisk:worker:main       # Main worker page logs
clisk:worker:page       # Worker page console logs
clisk:worker:message    # Worker page message logs
clisk:worker:comm       # Worker page communication logs
clisk:worker:nav        # Worker page navigation logs
```

## Usage Recommendations

- **Initial development:** `extreme` to see everything
- **Problem debugging:** `full` to see the main flow
- **Daily usage:** `normal` for basic tracking
- **Production/demo:** `quiet` for clean output 
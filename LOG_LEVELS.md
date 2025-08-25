# CliskDevRunner - Log Levels Configuration

This project uses the debug system to control log levels. Here are the different available levels:

## Log Levels

### 🔥 EXTREME
**Command:** `yarn start:extreme` or `DEBUG=clisk:* yarn start`

Displays **ALL** logs, including:
- CLI and launcher logs
- Page logs (pilot and worker)
- Post-me communication logs
- Navigation logs
- Message logs
- Page console logs

**Usage:** Complete debugging, see absolutely everything that happens

### 📊 FULL
**Command:** `yarn start:full`

Displays all logs except post-me communication logs:
- ✅ CLI and launcher logs
- ✅ Main page logs (pilot and worker)
- ✅ Navigation logs
- ✅ Page console logs
- ❌ Post-me communication logs ⭐

**Usage:** General debugging, see the main flow without being overwhelmed

### 📝 NORMAL
**Command:** `yarn start:normal`

Displays only essential logs:
- ✅ CLI and launcher logs
- ✅ Navigation logs
- ❌ No page logs
- ❌ No communication logs

**Usage:** Normal usage, minimal logs to follow execution

### 🔇 QUIET
**Command:** `yarn start:quiet`

No debug logs:
- ❌ No debug logs
- ✅ Only console.error errors
- ✅ Only explicit console.log messages

**Usage:** Production or when you want minimal output

## Advanced Usage

### Via Environment Variable
```bash
# Set level via environment variable
LOG_LEVEL=extreme yarn start
LOG_LEVEL=full yarn start
LOG_LEVEL=normal yarn start
LOG_LEVEL=quiet yarn start
```


### Via Direct DEBUG Variable
```bash
# Use DEBUG variable directly for fine control
DEBUG=clisk:cli:*,clisk:launcher:* yarn start
DEBUG=clisk:pilot:* yarn start
DEBUG=clisk:worker:comm yarn start
```

## Tests with Different Levels

The same levels are available for tests:

```bash
yarn test:extreme    # All logs during tests
yarn test:full       # Main logs during tests
yarn test:normal     # Minimal logs during tests
yarn test            # No debug logs (quiet)
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

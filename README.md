# CliskDevRunner

Simple project to test clisk connectors with Playwright in an environment simulating React Native webview.

## Purpose and Context

This project runs with Node.js, Yarn and Playwright. In the `examples` folder, there are different test connectors. These are JavaScript files accompanied by manifests.

The goal is to allow developers to create clisk connectors with the lightest possible environment while staying as close as possible to the final environment, React Native webviews

## Main Features

- **React Native webview environment simulation** : The connector expects to connect via the post-me library. For this it expects to communicate with the outside via `window.ReactNativeWebView.postMessage`. So we need to expose this function which doesn't exist by default.

- **Custom Playwright messenger** : If you look at the post-me documentation, you need to create a Playwright-specific messenger that will be able to send messages to the connector in the page by injecting JavaScript that calls `window.postMessage`.

- **Console logs** : All console messages that arrive in the page are shown in the standard output of the program.

## Architecture

The project uses a multi-page architecture with:
- **Worker pages** : Pages where connectors are injected
- **Pilot pages** : Control pages to orchestrate tests
- **Post-me communication** : Messaging system between pages
- **Auto-reconnection** : Maintaining poste-me communication during navigation

## Installation

```bash
yarn install
```

## Command Line Interface

The project provides a flexible command line interface with various options:

### Basic Usage

```bash
# Show help
node src/index.js --help

# Run with default connector
node src/index.js

# Run with specific connector
node src/index.js examples/evaluate-konnector
```

### Available Options

```bash
# Help
-h, --help                  Show help message

# Log level
-l, --log-level <level>     Set log level: quiet, normal, full, extreme (default: normal)
                            Can also be set via LOG_LEVEL environment variable

# Stay open mode
-s, --stay-open             Keep browser window open after connector execution
                            User must manually close the browser window to exit
```

### Examples

```bash
# Run with full logging
node src/index.js --log-level full examples/goto-konnector

# Run in quiet mode
node src/index.js -l quiet examples/minimal-konnector

# Keep browser open for inspection
node src/index.js --stay-open examples/evaluate-konnector

# Combine options
node src/index.js --stay-open --log-level extreme examples/goto-konnector
```

### Environment Variables

```bash
# Set log level via environment variable
LOG_LEVEL=full node src/index.js examples/evaluate-konnector

# Enable quiet mode
DEBUG="" node src/index.js examples/evaluate-konnector
```

## Launch (Legacy)

### Simplest goto connector

To launch the project with the simplest goto connector:

```bash
yarn start examples/goto-konnector
```

### Other available connectors

```bash
# Minimal connector for debug
yarn start examples/minimal-konnector

# Evaluation connector
yarn start examples/evaluate-konnector


# Default connector (evaluate-konnector)
yarn start
```

## Debug

The project uses an advanced debug system with the `debug` library for filtered and modular logs. This allows you to precisely control what you want to see in the logs.

**📖 See [DEBUG.md](DEBUG.md) for a complete guide to the debug system.**

## Log Levels

The project supports different log levels to control verbosity according to your needs:

```bash
# Extreme logs (see everything)
npm run start:extreme

# Full logs (main flow)
npm run start:full

# Normal logs (essential)
npm run start:normal

# Quiet logs (minimal)
npm run start:quiet
```

**📖 See [LOG_LEVELS.md](LOG_LEVELS.md) for more details on log levels.**

## Project Structure

- `src/index.js` - Main file with command line interface
- `src/log-config.js` - Log levels configuration
- `src/PlaywrightLauncher.js` - Playwright manager
- `src/connector-loader.js` - Connector loader
- `examples/` - Existing test connectors
- `package.json` - Dependencies configuration

## Tests

The project includes a complete test suite:

```bash
# All tests
yarn test

# Specific tests
yarn test:ping
yarn test:goto
yarn test:multi
yarn test:worker-control
```

**📖 See [TEST_USAGE.md](TEST_USAGE.md) for a detailed test guide.** 
# CliskDevRunner

Simple project to test clisk connectors with Playwright in an environment simulating React Native webview.

## Purpose and Context

This project runs with Node.js, Yarn and Playwright. In the `examples` folder, there are different test connectors. These are JavaScript files accompanied by manifests.

The goal is to allow developers to create clisk connectors with the lightest possible environment while staying as close as possible to the final environment, React Native webviews

## Main Features

- **React Native webview environment simulation** : The connector expects to connect via the post-me library. For this it expects to communicate with the outside via `window.ReactNativeWebView.postMessage`. So we need to expose this function which doesn't exist by default.

- **Custom Playwright messenger** : If you look at the post-me documentation, you need to create a Playwright-specific messenger that will be able to send messages to the connector in the page by injecting JavaScript that calls `window.postMessage`.

- **Console logs** : All console messages that arrive in the page are shown in the standard output of the program.

- **Configuration management** : Uses the `conf` library to manage settings with file-based configuration and command line overrides.

- **Browser profiles** : Support for persistent browser profiles to maintain session data, cookies, and browser state across test runs. Each profile is isolated and can be used for different testing scenarios.

- **Development server** : Built-in Express server with login form and PDF file listing for testing connector authentication and file download scenarios.

## Development Server

The project includes a simple development server that simulates a website with login authentication and file downloads. This is useful for testing connectors that need to handle login forms and download files.

### Quick Start

```bash
# Start the development server
yarn server

# Server will be available at http://localhost:3000
```

### Features

- **Login form** : Simple authentication page at `/login`
- **File listing** : Protected page showing available PDF files at `/files`
- **File downloads** : Secure download endpoints for PDF files
- **Session management** : Express sessions for maintaining authentication state

### Default Configuration

- **URL** : `http://localhost:3000`
- **Login credentials** : `user` / `pass`
- **PDF directory** : `data/pdfs/` (created automatically)

### Environment Variables

You can customize the server behavior with environment variables:

```bash
# Custom port
PORT=4000 yarn server

# Custom credentials
LOGIN_USER=alice LOGIN_PASS=secret yarn server
```

### Usage for Connector Development

1. **Place PDF files** in the `data/pdfs/` directory
2. **Start the server** with `yarn server`
3. **Test your connector** against `http://localhost:3000`

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

Then install [Playwright](https://playwright.dev/) if not done yet :

```bash
yarn playwright install
```

## Launch

## Configuration

The application uses a configuration system with the following hierarchy (highest priority first):

1. **Command line arguments** - Override all other settings
2. **Environment variables** - LOG_LEVEL, DEBUG
3. **Local configuration file** - `config.json` in the project root
4. **User configuration file** - `~/.config/clisk-dev-runner-nodejs/config.json`
5. **Default values** - Built-in defaults

### Local Configuration File

The project includes a local `config.json` file that serves as the default configuration. This file is **not versioned** in Git to allow each developer to have their own personal settings.

**File location**: `./config.json` (ignored by Git)

To set up your local configuration:

1. Copy the example configuration:

   ```bash
   cp config.example.json config.json
   ```

2. Modify `config.json` with your preferred settings:
   ```json
   {
     "connector": "examples/evaluate-konnector",
     "logLevel": "normal",
     "stayOpen": false,
     "browser": {
       "headless": false,
       "args": ["--no-sandbox", "--disable-web-security"]
     },
     "mobile": {
       "hasTouch": true,
       "isMobile": true,
       "locale": "fr-FR",
       "timezoneId": "Europe/Paris",
       "viewport": {
         "width": 390,
         "height": 844
       },
       "userAgent": "Mozilla/5.0 (iPhone; CPU iPhone OS 14_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Mobile/15E148 Safari/604.1",
       "deviceScaleFactor": 3,
       "geolocation": {
         "longitude": -74.006,
         "latitude": 40.7128
       }
     }
   }
   ```

**Note**: The `config.json` file is ignored by Git to prevent personal settings from being committed to the repository.

### User Configuration File

You can also create a personal configuration file that will override the local defaults:

**File location**: `~/.config/clisk-dev-runner-nodejs/config.json`

This file is created automatically when you first run the application and can be used to set your personal preferences.

Configuration: The application uses a configuration file that can be overridden by command line options. Configuration file location: ./config.json

You can set default values in the config file:

- connector: Default connector to use
- logLevel: Default log level
- stayOpen: Default stay-open behavior
- profile: Default profile to use
- browser: Browser launch options
- mobile: Mobile simulation settings

## Browser Profiles

CliskDevRunner supports browser profiles to maintain persistent browser state across test runs. Each profile maintains its own:

- Cookies and session data
- Browser history
- Saved passwords
- Extensions and settings

### Using Profiles

```bash
# Use a specific profile
node src/index.js --profile mobile examples/evaluate-konnector

# Use profile with other options
node src/index.js --profile desktop --stay-open examples/goto-konnector

# Use profile with log level
node src/index.js --profile test --log-level full examples/minimal-konnector
```

### Profile Configuration

You can set a default profile in your `config.json`:

```json
{
  "profile": "mobile",
  "connector": "examples/evaluate-konnector",
  "logLevel": "normal"
}
```

### Profile Management

- Profiles are created automatically when first used
- Each profile is stored in `./profile/{profile-name}/`
- Profiles are completely isolated from each other
- The `profile/` directory is ignored by Git

**📖 See [PROFILES.md](PROFILES.md) for detailed documentation on browser profiles.**

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

# Connector path
-c, --connector <path>      Specify connector path

# Browser profile
-p, --profile <name>        Specify a profile to use (e.g., "mobile", "desktop")
                            Profiles are stored in ./profile directory
```

### Examples

```bash
# Run with full logging
node src/index.js --log-level full examples/goto-konnector

# Run in quiet mode
node src/index.js -l quiet examples/minimal-konnector

# Keep browser open for inspection
node src/index.js --stay-open examples/evaluate-konnector

# Use a specific profile
node src/index.js --profile mobile examples/evaluate-konnector

# Combine options
node src/index.js --stay-open --log-level extreme examples/goto-konnector

# Use profile with other options
node src/index.js --profile desktop --stay-open examples/goto-konnector
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

- `src/index.js` - Main file with command line interface and configuration
- `src/log-config.js` - Log levels configuration
- `src/PlaywrightLauncher.js` - Playwright manager
- `src/connector-loader.js` - Connector loader
- `examples/` - Existing test connectors
- `package.json` - Dependencies configuration
- `config.example.json` - Example configuration file (copy to `config.json` for local settings)

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

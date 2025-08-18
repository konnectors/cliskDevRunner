# Browser Profiles Feature

## Overview

CliskDevRunner now supports browser profiles, allowing you to maintain separate browser states for different testing scenarios. Each profile maintains its own:

- Cookies and session data
- Browser history
- Saved passwords
- Extensions and settings
- Other browser-specific data

## Usage

### Command Line

Use the `--profile` option to specify a profile:

```bash
# Use a specific profile
node src/index.js --profile mobile examples/evaluate-konnector

# Use profile with other options
node src/index.js --profile desktop --stay-open examples/goto-konnector

# Use profile with log level
node src/index.js --profile test --log-level full examples/minimal-konnector
```

### Configuration File

You can set a default profile in your `config.json`:

```json
{
  "profile": "mobile",
  "connector": "examples/evaluate-konnector",
  "logLevel": "normal"
}
```

## Profile Management

### Automatic Creation

Profiles are created automatically when first used:

```bash
# This will create profile/my-new-profile/ directory
node src/index.js --profile my-new-profile examples/evaluate-konnector
```

### Profile Structure

Profiles are stored in the `./profile/` directory:

```
profile/
├── mobile/          # Mobile browser profile
├── desktop/         # Desktop browser profile
├── test/            # Test profile
└── README.md        # Profile documentation
```

### Profile Isolation

Each profile is completely isolated:

- **Persistent Sessions**: Login states and cookies are preserved between runs
- **Clean State**: Each profile starts with its own browser state
- **Parallel Testing**: Multiple profiles can be used simultaneously
- **Independent Data**: Changes in one profile don't affect others

## Examples

### Mobile Testing Profile

```bash
# Create and use a mobile testing profile
node src/index.js --profile mobile-test examples/evaluate-konnector
```

### Desktop Testing Profile

```bash
# Create and use a desktop testing profile
node src/index.js --profile desktop-test examples/goto-konnector
```

### Multiple Profiles

```bash
# Test with different profiles
node src/index.js --profile user1 examples/evaluate-konnector
node src/index.js --profile user2 examples/evaluate-konnector
node src/index.js --profile admin examples/evaluate-konnector
```

## Technical Details

### Implementation

- Profiles use Playwright's `launchPersistentContext()` API
- Each profile gets its own `userDataDir` in `./profile/{profile-name}/`
- When no profile is specified, regular `launch()` is used
- Profile directories are automatically created if they don't exist

### Configuration

The profile feature integrates with the existing configuration system:

- Command line `--profile` overrides config file
- Profile can be set in `config.json` as default
- Profile is ignored by Git (see `.gitignore`)

### Benefits

1. **Session Persistence**: Maintain login states across test runs
2. **Isolated Testing**: Different profiles for different scenarios
3. **Clean State**: Each profile starts fresh
4. **Parallel Execution**: Multiple profiles can run simultaneously
5. **Easy Management**: Simple directory structure for profiles

## Notes

- The `profile/` directory is automatically added to `.gitignore`
- Profiles can be manually deleted to reset browser state
- Each profile maintains its own browser data independently
- No profile = temporary browser session (no persistence)
# Build & Testing

> Build pipeline, dev commands, test framework, and release process.

---

## Development Commands

| Command | Purpose |
|---------|---------|
| `npm start` | Full dev: React (port 2907) + Electron |
| `npm run start:web` | React-only dev server |
| `npm run react-start` | Alias for `start:web` |
| `npm test` | Jest test runner |

### Python Backend (Standalone)

```bash
cd unchain_runtime/server && python main.py
```

---

## Build Pipeline

### Stage Order

```
1. npm run version:prepare-build    # Write version info
2. npm run build:web                # React production build
3. npm run build:electron:<target>  # Electron package
```

> Always run `version:prepare-build` before `react-scripts build`. Skipping it causes missing version info.

### Build Targets

| Command | Platform | Architecture |
|---------|----------|-------------|
| `npm run build:electron:mac` | macOS | ARM64 |
| `npm run build:electron:mac:intel` | macOS | x86_64 |
| `npm run build:electron:win` | Windows | x86_64 |
| `npm run build:electron:linux` | Linux | x86_64 |

### Output Formats

| Platform | Format |
|----------|--------|
| macOS | DMG |
| Windows | NSIS installer |
| Linux | AppImage, .deb |

### Build Configuration

Build config lives in `package.json` under the `build` key:
- App ID: `com.red.pupu`
- Main entry: `public/electron.js`
- electron-builder 26.8.1

---

## Testing

### Frontend Tests (Jest)

```bash
# Run all
npm test -- --watchAll=false

# Filter by path
npm test -- --watchAll=false --testPathPattern="chat_storage"

# Filter by test name
npm test -- --watchAll=false -t "should sanitize messages"
```

Test framework: Jest + `@testing-library/react`

### Electron Tests

```bash
# Main process tests
node --experimental-vm-modules node_modules/.bin/jest \
  electron/tests/main/ --config=electron/tests/jest.config.cjs

# Preload tests
node --experimental-vm-modules node_modules/.bin/jest \
  electron/tests/preload/ --config=electron/tests/jest.config.cjs
```

> Electron tests have both `.js` and `.cjs` variants. Keep them in sync.

### Python Backend Tests

```bash
cd unchain_runtime/server

# Run all
python -m pytest tests/ -q --tb=short

# Filter
python -m pytest tests/ -q --tb=short -k "test_character"
```

### Test File Locations

| Scope | Location | Pattern |
|-------|----------|---------|
| Frontend | Co-located with source | `*.test.js` |
| Electron main | `electron/tests/main/` | `*.test.js`, `*.test.cjs` |
| Electron preload | `electron/tests/preload/` | `*.test.js`, `*.test.cjs` |
| Python backend | `unchain_runtime/server/tests/` | `test_*.py` |

---

## Key Dependencies

| Dependency | Version | Purpose |
|-----------|---------|---------|
| React | 19.1.0 | UI framework |
| Electron | 40.6.0 | Desktop shell |
| electron-builder | 26.8.1 | Packaging |
| electron-updater | 6.6.2 | Auto-update |
| highlight.js | 11.9.0 | Code highlighting |
| react-showdown | 2.3.1 | Markdown rendering |
| react-spring | 10.0.3 | Animations |
| Three.js | 0.183.0 | 3D visualization |
| @dnd-kit | various | Drag and drop |
| @use-gesture/react | — | Gesture handling |
| vanilla-tilt | 1.8.1 | Tilt effects |

### Python Dependencies

| Dependency | Purpose |
|-----------|---------|
| Flask | HTTP server |
| Unchain SDK | Agent framework |
| qdrant-client | Vector database (optional) |

---

## macOS Code Signing

See `docs/MACOS_RELEASE.md` for:
- Apple Developer certificate setup
- Notarization credentials
- Signed build commands
- CI keychain configuration

---

## Init Setup Flow

On first run, PuPu shows a setup wizard (`src/COMPONENTs/init-setup/`):
1. Welcome screen
2. Workspace selection
3. Model provider configuration
4. Memory settings (optional)

The init setup uses the same settings storage patterns as the main Settings UI.

---

## Feature Flags

```javascript
// src/SERVICEs/feature_flags.js
readFeatureFlags()           // → { [key]: boolean }
isFeatureFlagEnabled(key)    // → boolean
writeFeatureFlags(patch)     // → updated flags
subscribeFeatureFlags(fn)    // → unsubscribe

// Current flags
enable_user_access_to_agents: false      // Agents tab in the agents modal
enable_user_access_to_characters: false  // Characters tab in the agents modal
```

In production builds, flags can be overridden via `REACT_APP_BUILD_FEATURE_FLAGS` env var.

---

## Console Logger

`src/SERVICEs/console_logger.js` provides debug logging that can be toggled in development. Runtime logs from the Flask sidecar are forwarded via the `unchain:runtime-log` IPC channel.

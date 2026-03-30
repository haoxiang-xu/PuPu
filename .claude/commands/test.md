# Run Tests

Run the PuPu test suite with optional filtering.

## Arguments
- $ARGUMENTS: Optional scope or filter (e.g. "api.miso", "chat_storage", "electron", "miso_runtime")

## Steps

1. Determine which test scope to run based on $ARGUMENTS:

   | Scope | Command |
   |-------|---------|
   | Frontend (all) | `npm test -- --watchAll=false` |
   | Frontend (filter) | `npm test -- --watchAll=false --testPathPattern="$ARGUMENTS"` |
   | Electron main | `node --experimental-vm-modules node_modules/.bin/jest electron/tests/main/ --config=electron/tests/jest.config.cjs` |
   | Electron preload | `node --experimental-vm-modules node_modules/.bin/jest electron/tests/preload/ --config=electron/tests/jest.config.cjs` |
   | Python backend | `cd miso_runtime/server && python -m pytest tests/ -q --tb=short` |
   | Python (filter) | `cd miso_runtime/server && python -m pytest tests/ -q --tb=short -k "$ARGUMENTS"` |

2. If no arguments, run frontend tests:
   ```bash
   npm test -- --watchAll=false
   ```

3. Report results. If failures:
   - Read the failing test file
   - Read the source file being tested
   - Identify root cause
   - Fix and re-run

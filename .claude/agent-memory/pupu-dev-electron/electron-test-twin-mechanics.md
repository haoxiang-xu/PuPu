---
name: electron-test-twin-mechanics
description: How the .js/.cjs electron-test twins actually wire up — the .cjs holds all tests, the .js is a one-line require shim, and the two jest runners split on extension
metadata:
  type: project
---

The electron `.js`/`.cjs` test twin (a project pitfall in CLAUDE.md) works as a **loader shim**, not duplicated bodies.

- `test:electron` script uses `--testMatch="**/electron/tests/**/*.test.cjs"` — the **electron jest runner only sees `.cjs`**. That is where all real test bodies live.
- The `.js` twin is a **one-line `require("./X.test.cjs")` shim**. It exists so the **frontend runner** (`test:frontend` = react-scripts test, which matches `*.test.js`) also executes the same suite. Both runners thus cover identical tests.
- The `.js` shim filename does not have to mirror the `.cjs` name. Example: `unchain_service.test.cjs` is loaded by `unchain_service_loader.test.js` (not `unchain_service.test.js`).

**Why:** keeps one source of truth for test bodies while satisfying two jest configs with different testMatch globs.

**How to apply:** When adding electron tests, put the real assertions in the `.cjs` and make sure a `.js` loader shim `require()`s it. Do NOT copy test bodies into both files. To keep parity, a brand-new `.cjs` test file needs a matching `.js` shim; editing an existing `.cjs` needs no `.js` change since its shim already re-exports it.

Related: the channel-parity guard is `electron/tests/main/ipc_channels.test.cjs` — it asserts every `PRELOAD_INVOKE_CHANNELS` entry (in `electron/preload/channels.js`) is registered in `IPC_HANDLE_CHANNELS`/`IPC_ON_CHANNELS`. Adding an invoke channel means adding it to `electron/preload/channels.js` too, or this guard fails. See [[mcp-ipc-channel-inventory]].

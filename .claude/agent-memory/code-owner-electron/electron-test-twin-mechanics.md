---
name: electron-test-twin-mechanics
description: How the .js/.cjs electron-test twins actually wire up — the .cjs holds all tests, the .js is a one-line require shim, and the two jest runners split on extension
metadata:
  type: project
---

The electron `.js`/`.cjs` test twin (a project pitfall in CLAUDE.md) works as a **loader shim**, not duplicated bodies.

- `test:electron` script uses `--testMatch="**/electron/tests/**/*.test.cjs"` — the **electron jest runner only sees `.cjs`**. That is where all real test bodies live.
- The `.js` twin is a **one-line require shim**. It exists so the **frontend runner** (`test:frontend` = react-scripts test) also executes the same suite.
- ⚠️ **There are TWO shim families and only one of them actually runs.** react-scripts roots at `src/`, so the shim it executes must live at `src/electron/tests/{main,preload}/X.test.js` containing `require("../../../../electron/tests/<dir>/X.test.cjs")`. The sibling shims at `electron/tests/**/X.test.js` are matched by **neither** runner (electron matches only `.cjs`; frontend never looks outside `src/`) — they are dead files. Verify with `npx react-scripts test --listTests | grep <name>`.
- Some `.cjs` suites have no `src/electron` shim at all — they run ONLY under `test:electron`. **Re-measured 2026-08-07: 45 `.cjs` vs 36 `src/electron` shims, gap = 9** — `main/boot_readiness_service` (**new since 2026-08-04, never had one**), `main/chat_storage_lifecycle`, `main/ollama_service`, `main/settings_quit_coordinator`, and the whole `test-api/` family (6). `main/chat_deletion_outbox` **now has a shim** (it was in the 2026-08-01 gap list). Check before assuming a suite has dual coverage; re-derive by scanning `src/electron/tests/**` for each `.test.cjs` filename.
- ⚠️ **`npm run test:electron` does not run a fixed set.** Its testMatch is a bare `**/electron/tests/**/*.test.cjs`, so on a machine with `.claude/worktrees/` checkouts it also runs every other worktree's copy — measured 2026-08-07: **332 suites / 4799 tests** instead of the main tree's **45 / 751**. For a citable baseline, pin it: `node node_modules/.bin/jest --env=node --runInBand --silent --moduleFileExtensions js --moduleFileExtensions cjs --moduleFileExtensions json --testMatch="<rootDir>/electron/tests/**/*.test.cjs"`. Fixing the script belongs to `code-owner-devtools`, not here.
- ⚠️ **A narrowed `--testPathPattern` under `react-scripts test` reaches ZERO electron tests.** Anyone scoping to `src/COMPONENTs/…` or `src/PAGEs/…` — which is what every other code owner does — has not run a single line of this boundary. Any acceptance plan touching `electron/` must name the electron runner explicitly.
- Suites that need jsdom polyfills in the shim: anything using `setImmediate` (e.g. `memory_vault_startup_assembly`) or `TextEncoder`/`TextDecoder` (`unchain_service`). Put the polyfill in the `.js` shim ABOVE the `require`, never in the `.cjs` body.
- The `.js` shim filename does not have to mirror the `.cjs` name. Example: `unchain_service.test.cjs` is loaded by `unchain_service_loader.test.js` (not `unchain_service.test.js`).

**Why:** keeps one source of truth for test bodies while satisfying two jest configs with different testMatch globs.

**How to apply:** When adding electron tests, put the real assertions in the `.cjs` and make sure a `.js` loader shim `require()`s it. Do NOT copy test bodies into both files. To keep parity, a brand-new `.cjs` test file needs a matching `.js` shim; editing an existing `.cjs` needs no `.js` change since its shim already re-exports it.

Related: the channel-parity guard is `electron/tests/main/ipc_channels.test.cjs` — it asserts every `PRELOAD_INVOKE_CHANNELS` entry (in `electron/preload/channels.js`) is registered in `IPC_HANDLE_CHANNELS`/`IPC_ON_CHANNELS`. Adding an invoke channel means adding it to `electron/preload/channels.js` too, or this guard fails. See [[mcp-ipc-channel-inventory]].

---
name: boot-readiness-gate-contract
description: The boot gate's invariants — what may and may not open it, why the MCP probe is GET /mcp/toolkits and nothing heavier, and which timer survives
metadata:
  type: project
---

Boot readiness gate (CHANNELS.BOOT namespace, `electron/main/services/boot_readiness/`,
`src/SERVICEs/boot_readiness.js`). Built 2026-08-04 on direct CEO order after the
boot overlay was found to flip ready purely on "chat reached first screen" plus an
unconditional 8s failsafe — i.e. it would hand the user a chat box on a dead sidecar.

**Why:** every send on an un-ready sidecar dies at `ensureMisoReady`. The gate exists
to make "the app let me in" mean "the backend is actually up".

**How to apply:** these are invariants, not preferences. Re-read before touching
anything in the boot path.

## The invariants

1. **No clock may open the backend gate.** Ever, in any code path. Two timers exist
   and neither can: the pre-takeOver `release()` failsafe (React never mounted — no
   overlay to explain anything, no bridge to ask, so legacy fade+remove still wins),
   and the post-takeOver renderer-milestone fallback, which satisfies ONLY
   `chatFirstScreen`. If you add a timer near this code, prove it cannot reach the
   backend gate.
2. **`chatFirstScreen` needs its own fallback.** Only `ChatInterface` calls
   `signalReady()`. `/mini`, a HashRouter reload on a stale `#/…`, or a chat render
   that threw means nobody ever signals it. Without the fallback the overlay hangs
   forever on a perfectly healthy backend. This bit me during implementation — the
   hole is not obvious from reading chat.js.
3. **A failure state is an escalated WAITING state, not a terminal one.** Main keeps
   polling; a backend that recovers on its own clears the failure and opens the gate
   with no user action. Retry exists for when it does not.
4. **The runtime `reason` string never crosses IPC.** It carries local filesystem
   paths and raw process errors ("Miso server entrypoint was not found",
   "Miso process exited (code=…)"). Main maps a whitelisted status token to a static
   message it composes itself. There is a test asserting the path never appears in
   the payload — keep it.

## "MCP ready" — the adopted definition and why

**MCP ready = `GET /mcp/toolkits` (via `unchainService.listMisoMcpToolkits()`)
returns a well-formed inventory.** An EMPTY list is ready; count is not a health
measure.

Chosen for a structural reason, not convenience: that route is a pure local store
read — no subprocess, no socket, no network — so it is *incapable* of blocking on a
third-party MCP server. Contrast the ones deliberately NOT used:
`POST /mcp/toolkits/<id>/health` and `POST /mcp/toolkits/reload` DO connect, spawning
stdio subprocesses and waiting up to ~120s per toolkit, serially. Gating boot on
those would let one broken user-installed server hold the whole app hostage.

Backing facts (recon 2026-08-04, re-verify if the sidecar changes):
- There is **no MCP readiness endpoint**. `/health` (route_catalog.py) reports Flask +
  runtime contract + memory-v2 only, nothing MCP.
- The only eager MCP work at Flask boot is the curated registry JSON parse at *import*
  time (`mcp_registry.py`, `_REGISTRY = _load_registry()`). If it fails the sidecar
  never binds its port — so it fails as "no server at all", already covered by health.
- Everything expensive (Node/uv managed-runtime download, subprocess spawn) is lazy:
  install / configure / health-probe / reload, or first chat-time toolkit construction.
  A **packaged** build never downloads a runtime (bundled `mcp_runtime` via
  `PUPU_MCP_RUNTIME_DIR` / `process.resourcesPath`); only a dev run on macOS without it can.
- `GET /toolkits/catalog` is also safe to call the instant Flask answers (reads
  persisted JSON, never dials a server) — but it swallows all installed MCP toolkits
  into `[]` on a single coarse `except`, so it cannot distinguish "broken" from
  "none installed". That is why the inventory route, not the catalog, is the probe.

## The overlay is a modal BARRIER, not a picture

Covering the app visually is not enough — the tree underneath stays live,
focusable and listening. Two leaks found in review, both real:

- **Tab walks underneath.** Focus reached the invisible chat composer and every
  keystroke was persisted into a draft the user could not see. Fixed with a
  `focusin` capture guard, **not** `inert` on siblings: BUILTIN Modal renders
  through a PORTAL to `document.body`, outside the overlay's subtree, where a
  sibling-scoped `inert` never reaches.
- **Escape reaches window-level listeners.** BUILTIN Modal binds Escape on
  `window` (`modal.js`), so on first run one Escape silently dismissed an
  `InitSetupModal` the user had never seen. Neither a focus trap nor `inert`
  stops a window listener — only a **capture-phase** listener on `window` does.
  Scope it to Escape: swallowing every key also kills the overlay's own buttons.

## Busy state inside a live region: label change, NOT `aria-busy`

`aria-busy` on a wrapper inside a `role="alert"` subtree means *"I am mutating,
do not announce yet"* — it **suppresses** the announcement it looks like it is
producing. For a button whose label flips to "Retrying…", the label change alone
is what gets announced. Likewise never set `disabled` on a control mid-flow: it
drops keyboard focus to `<body>` and removes the control from the a11y tree; put
the re-entrancy guard in the handler instead. (BUILTIN `Button` forwards neither
arbitrary props nor refs, so anything extra rides on a wrapper div — don't edit
the primitive for it.)

## boot_progress has TWO outputs — never gate the DOM write on the state guard

`set()` writes both module state and the static `#boot-progress-bar` node, and
the node can be **re-created independently** of state (a rebuilt shell, hot
reload, a test remounting into a fresh body). When the monotonic guard was added
it early-returned before the DOM write, so a freshly-created bar stayed at
`width: ""` forever while state said 88. Guard the *state update + notify*; then
always paint from `state.pct` (the authoritative value, never the rejected
argument). Caught only by the full frontend gate via `container.test.js` — the
targeted boot suites all passed.

## Failure copy: main sends CODES, the renderer owns the words

Main cannot know the user's language, so any string minted there is hardcoded
English bypassing all 11 locales. The BOOT payload carries `failure.code` only;
the renderer maps it to `boot.failure.<code>`. `FAILURE_CODES` in the main
service and the `boot.*` keys in `src/locales/*.json` must move together —
`src/SERVICEs/boot_locale_parity.test.js` is the guard.

## NEVER hand-roll `stopMiso(); startMiso();` — use `restartMiso()`

Caught by CTO review 2026-08-04 on my own retry path. The naive sequence is
**deterministically** broken, and silently so:

1. `stopMiso()` returns synchronously with SIGTERM in flight. It sets
   `unchainIsStopping = true` but does **not** clear `unchainProcess` — only the
   process's own `'exit'` handler does, and `'exit'` is a macrotask that cannot run
   before the caller's next `await`.
2. `startMiso()` then hits `if (unchainProcess || unchainStatus === "starting") return`
   and starts nothing.
3. The `'exit'` handler sees `unchainIsStopping`, marks status `"stopped"`, and
   returns **before** `scheduleMisoRestart()` — so the crash-restart net never arms.

Net: **a live backend is killed and never comes back.** `restartMiso()`
(unchain service) does stop → wait for `unchainProcess` to actually clear → start.
Completion of a stop is only observable inside that closure, which is why the
primitive must live there rather than in the caller.

Second trap in the same area: the most likely moment a user clicks Retry is an
`mcp_environment_unavailable` card — which is raised while the sidecar is
**perfectly alive**. Any retry path must early-return when already ready, or it
becomes a "kill the healthy backend" button.

## Probe placement — do not move it into startMiso()

The MCP probe deliberately lives in the boot readiness service, NOT inside
`startMiso()` alongside `verifyContextV2Readiness()`. `memory_v2_startup_readiness.test.cjs`
asserts exact `global.fetch` call counts and `toHaveBeenNthCalledWith` ordering after
`startMiso()`; adding a fetch there breaks those suites. Keeping the probe outside
leaves the startup fetch sequence untouched.

Related: [[electron-test-twin-mechanics]], [[mcp-ipc-channel-inventory]]

# Test API Conventions

## Adding a new endpoint

1. Pick a stable URL: `/v1/<noun>/<id?>/<verb?>`. Use HTTP verbs semantically.
2. Register the route in `electron/main/services/test-api/builtin_commands.js`. Choose:
   - Dispatch via `bridge.invoke('cmdName', payload)` — for renderer-bound ops
   - Implement natively (main-only) — for things only main can do (`screenshot`, `eval`, `dom`)
3. If renderer-bound, add a handler in either:
   - `src/SERVICEs/test_bridge/handlers/<area>.js` — for service-source ops; export a `register*Handlers({bridge, chatStorage, ...})` wired in `src/SERVICEs/test_bridge/index.js`
   - In a React component with `useEffect(() => __pupuTestBridge.register('cmd', impl); return cleanup)` — for component-source ops that need hook closures
4. Add a Jest test for the handler (mock `chatStorage` / `unchainAPI`).
5. Update `docs/api-reference/test-api.md`.

## Adding a new modal

Whenever you create a new modal/dialog component, add **one line** to make it visible to the test API:

```js
import { useModalLifecycle } from "<relative-path>/BUILTIN_COMPONENTs/mini_react/use_modal_lifecycle";

// inside component:
useModalLifecycle("my-modal-id", open);
```

Choose a stable kebab-case id. The id appears in `/v1/debug/state` payload (`modal_open`).

### Registered modal ids (Phase 1)

| id | component | location |
|---|---|---|
| `toolkit-modal` | `ToolkitModal` | `src/COMPONENTs/toolkit/toolkit_modal.js` |
| `settings-modal` | `SettingsModal` | `src/COMPONENTs/settings/settings_modal.js` |
| `workspace-modal` | `WorkspaceModal` | `src/COMPONENTs/workspace/workspace_modal.js` |
| `agents-modal` | `AgentsModal` | `src/COMPONENTs/agents/agents_modal.js` |
| `ui-testing-modal` | `UITestingModal` | `src/COMPONENTs/ui-testing/ui_testing_modal.js` |
| `memory-inspect-modal` | `MemoryInspectModal` | `src/COMPONENTs/memory-inspect/memory_inspect_modal.js` |

## Component-source handler rules

- The handler `impl` must be a stable reference (`useCallback`). Otherwise re-renders re-register and create races with in-flight calls.
- Always include the cleanup `return () => unregister()` so unmounted components don't leave stale handlers.
- **Last-mount-wins**: the most recently mounted instance receives the call. In multi-window setups the focused window owns the handler. (Phase 2 will introduce keyed routing.)

## Production safety

- The whole stack is gated by `process.env.NODE_ENV !== 'production'`. CRA inlines this constant at build time, so prod bundles do not include the `test_bridge` module (verified by Task 23 of the Phase 1 implementation plan).
- An additional kill-switch: `PUPU_TEST_API_DISABLE=1` env var stops the server even in dev mode.
- Server binds 127.0.0.1 only. No auth — the local-only binding is the security boundary.

## Where to look when something breaks

| Symptom | Where to look |
|---|---|
| `503 not_ready` after PuPu loaded | Renderer DevTools console — `installTestBridge()` in `src/SERVICEs/test_bridge/index.js` may have thrown |
| `409 no_handler` for `sendMessage` | Make sure you're on the chat page; `ChatInterface` registers it on mount |
| Port file stale | Restart PuPu; `client.mjs` validates PID is alive |
| `408 ipc_timeout` | Renderer handler too slow or threw; check `/v1/debug/logs?source=renderer` |
| Modal not in `modal_open` snapshot | Confirm component calls `useModalLifecycle('id', open)` with a stable boolean |

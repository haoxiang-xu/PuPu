# Runtime Events V3

> Frontend state layer for typed runtime events and the existing TraceChain UI.

---

## Status

Runtime Events V3 is the default frontend stream path when the Electron bridge
exposes `startStreamV3`.

V3 does **not** replace the TraceChain visual component. It replaces the
page-local frame adapter with a service-layer event store, reducer, and adapter
that can be reused by future permission, sandbox, channel, team, and plan
features.

V2 remains available as the fallback path when the bridge does not expose V3.

---

## Data Flow

```
Flask /chat/stream/v3
  -> SSE event: runtime_event
  -> Electron main relay
  -> preload startStreamV3
  -> api.unchain.startStreamV3
  -> use_chat_stream.js
  -> RuntimeEventStore
  -> ActivityTree reducer
  -> TraceChain adapter
  -> existing TraceChain props
```

The browser UI still receives legacy TraceChain props:

```javascript
{
  frames,
  status,
  streamingContent,
  subagentFrames,
  subagentMetaByRunId,
  toolConfirmationUiStateById,
  bundle,
  error,
}
```

---

## Service Layer

| File | Role |
|------|------|
| `src/SERVICEs/runtime_events/event_store.js` | Validates v3 events, dedupes by `event_id`, sorts by sequence if present, and records diagnostics |
| `src/SERVICEs/runtime_events/activity_tree.js` | Reduces event snapshots into run/tool/input/model state and TraceFrame effects |
| `src/SERVICEs/runtime_events/trace_chain_adapter.js` | Converts ActivityTree state into the existing TraceChain props |
| `src/SERVICEs/runtime_events/runtime_event_stream_gate.js` | Keeps the renderer V3 path default-on while bridge availability controls fallback |

Public interfaces:

```javascript
createRuntimeEventStore()
reduceActivityTree(previousState, eventStoreSnapshot)
adaptActivityTreeToTraceChain(activityTreeState)
isRuntimeEventStreamV3Enabled()
```

---

## Event Types

The current frontend store accepts these `schema_version: "v3"` event types:

| Type | Meaning |
|------|---------|
| `session.started` | Stream/session metadata, including model and thread id |
| `run.started` | Root or child run started |
| `run.completed` | Root or child run completed; root usage maps to the done bundle |
| `run.failed` | Root or child run failed |
| `turn.started` | Agent iteration started |
| `turn.completed` | Agent iteration completed |
| `model.started` | Model request/messages were prepared |
| `model.delta` | Text or reasoning delta; text whitespace is preserved |
| `model.completed` | Model response completed or final text is available |
| `tool.started` | Tool call started |
| `tool.delta` | Tool observation/progress |
| `tool.completed` | Tool call completed |
| `input.requested` | Human input or continuation request |
| `input.resolved` | Human input/confirmation resolved |

Unknown events are recorded in diagnostics and do not crash rendering.

---

## Run And Subagent Routing

Root frames are emitted through `frames`. Child run frames are emitted through
`subagentFrames[runId]`.

Preferred routing is explicit:

```javascript
{
  run_id: "child-run",
  links: {
    parent_run_id: "root-run"
  }
}
```

For compatibility with the current runtime bridge, the ActivityTree reducer also
handles cases where a subagent `ask_user_question` request is emitted with the
root run id while exactly one child run is active. In that case the request is
routed to the active child run so the Ask User card stays inside the subagent
branch. The later result frame, if it carries the child run id, joins the same
branch.

This compatibility heuristic should be removed once the backend emits explicit
`links.parent_run_id` for every child-run input event.

---

## Confirmation And Human Input

V3 maps human input into the existing confirmation UI contract:

- `input.requested` -> `tool_call` frame with `tool_name: "ask_user_question"`
- `input.resolved` -> `tool_confirmed` or `tool_denied`
- ActivityTree `inputRequestsById` -> `toolConfirmationUiStateById`

`use_chat_stream.js` registers pending confirmation state for both root frames
and subagent frames. When a user answers a subagent Ask User prompt, the
synthetic selected/confirmed frame is written back to that same subagent branch.

---

## Stream Selection

Runtime Events V3 is enabled by default in the renderer. `use_chat_stream.js`
uses V3 when the Electron bridge exposes `startStreamV3`; if that bridge method
is unavailable, it falls back to V2.

The retired settings and localStorage gates are ignored.

---

## Testing

Focused frontend tests:

```bash
CI=true npm test -- --runTestsByPath \
  src/SERVICEs/runtime_events/event_store.test.js \
  src/SERVICEs/runtime_events/activity_tree.test.js \
  src/SERVICEs/runtime_events/trace_chain_adapter.test.js \
  src/SERVICEs/runtime_events/runtime_event_stream_gate.test.js \
  src/PAGEs/chat/chat.test.js \
  src/COMPONENTs/chat-bubble/trace_chain.test.js \
  src/COMPONENTs/ui-testing/scenarios/trace_chain_scenarios.test.js \
  --watchAll=false
```

Manual testing can use the dev Test API to send real chats through the running
Electron app and inspect persisted `traceFrames`, `subagentFrames`, and
`subagentMetaByRunId`.

UI testing scenarios can replay V3 directly by providing `scenario.events`
instead of pre-adapted TraceFrames. `TraceChainRunner` feeds those events through
the same `RuntimeEventStore -> ActivityTree -> TraceChain adapter` path before
rendering the existing TraceChain component.

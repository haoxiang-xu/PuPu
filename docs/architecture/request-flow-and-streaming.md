# Request Flow & Streaming

> How a user message travels from the React UI to a model provider and back.

---

## End-to-End Request Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ REACT RENDERER                                                      │
│                                                                     │
│  ChatInterface (src/PAGEs/chat/chat.js)                            │
│    └─ use_chat_stream.js hook                                       │
│         └─ api.unchain.startStreamV2/startStreamV3(payload, handlers) │
│              └─ normalizeUnchainV2Payload(payload)                 │
│                   ├─ injectWorkspaceRootIntoPayload                │
│                   ├─ injectSystemPromptV2IntoPayload               │
│                   ├─ injectMemoryIntoPayload                       │
│                   └─ injectProviderApiKeyIntoPayload               │
│              └─ unchainBridge.startStreamV2/startStreamV3(...)     │
├─────────────────────────────────────────────────────────────────────┤
│ ELECTRON PRELOAD                                                    │
│                                                                     │
│  unchain_stream_client.js                                          │
│    └─ ipcRenderer.send(STREAM_START_V2 or STREAM_START_V3, payload)│
│    └─ ipcRenderer.on(CHANNELS.UNCHAIN.STREAM_EVENT, callback)      │
├─────────────────────────────────────────────────────────────────────┤
│ ELECTRON MAIN                                                       │
│                                                                     │
│  register_handlers.js → unchainService.handleStreamStartV2/V3()    │
│    └─ HTTP POST to Flask /chat/stream/v2 or /chat/stream/v3        │
│    └─ SSE relay: read Flask SSE → webContents.send(STREAM_EVENT)   │
├─────────────────────────────────────────────────────────────────────┤
│ PYTHON FLASK SIDECAR                                                │
│                                                                     │
│  route_chat.py: chat_stream_v2() / chat_stream_v3()                │
│    └─ unchain_adapter.py: stream_chat_events()                     │
│         └─ _UnchainAgent.run() in worker thread                    │
│              └─ Provider SDK (OpenAI / Anthropic / Gemini / Ollama) │
└─────────────────────────────────────────────────────────────────────┘
```

Events flow back through the same path: **Flask SSE → Electron main → IPC → preload stream client → React handlers**.

---

## Payload Injection Chain

Before the payload leaves the renderer, `normalizeUnchainV2Payload()` applies four injections in order:

### 1. Workspace Root Injection (`injectWorkspaceRootIntoPayload`)

Resolves `selectedWorkspaceIds` to absolute paths from `localStorage.settings.runtime.workspaces`. Injects:
- `workspaceRoot`: primary workspace path
- `workspace_root`: alias
- `workspace_roots`: array of all selected workspace paths

### 2. System Prompt V2 Injection (`injectSystemPromptV2IntoPayload`)

Applies the 3-layer system prompt architecture (see [System Prompt V2](system-prompt-v2.md)):
- Build defaults -> runtime config -> per-chat overrides
- Injects `system_prompt_v2_sections` into the payload

### 3. Memory Injection (`injectMemoryIntoPayload`)

Reads memory settings from `localStorage.settings.memory` and injects:
- `memory_enabled`: boolean
- `memory_session_id`: string
- `memory_embedding_provider`: `"auto"` | `"openai"` | `"ollama"`
- `memory_embedding_model`: string (optional)
- `memory_long_term_enabled`: boolean
- `memory_long_term_namespace`: string (default: `"pupu:default"`)

### 4. Provider API Key Injection (`injectProviderApiKeyIntoPayload`)

Reads stored API keys from `localStorage.settings.model_providers` and injects them into the payload based on the selected model's provider.

Supported remote providers: `openai`, `anthropic`.

---

## Stream Protocols

PuPu currently has two active stream protocols:

| Protocol | Endpoint | Renderer entry | Payload type | Frontend state path |
|----------|----------|----------------|--------------|---------------------|
| V2 | `/chat/stream/v2` | `startStreamV2` | `event: frame` TraceFrame payloads | direct `onFrame` handling in `use_chat_stream.js` |
| V3 | `/chat/stream/v3` | `startStreamV3` | `event: runtime_event` typed runtime events | `RuntimeEventStore -> ActivityTree -> TraceChain adapter` |

The chat hook chooses V3 by default when the bridge exposes `startStreamV3`.
Otherwise it falls back to V2.

See [Runtime Events V3](runtime-events-v3.md) for the service-layer state model.

---

## SSE Stream Protocol (V3)

V3 uses the same SSE transport but sends typed runtime events.

### Event Types

| Event | Description |
|-------|-------------|
| `runtime_event` | Carries a `schema_version: "v3"` RuntimeEvent |
| `error` | Top-level stream error |
| `done` | Stream termination signal plus diagnostics |

### RuntimeEvent Shape

```javascript
{
  schema_version: "v3",
  event_id: string,
  type: string,
  timestamp: string,
  session_id: string,
  run_id: string,
  agent_id: string,
  turn_id?: string | null,
  links: {
    parent_run_id?: string,
    tool_call_id?: string,
    input_request_id?: string,
  },
  visibility: "user" | "debug",
  payload: {},
  metadata: {},
}
```

The accepted event types are listed in
[Runtime Events V3](runtime-events-v3.md#event-types).

---

## SSE Stream Protocol (V2)

The Flask sidecar streams events using Server-Sent Events (SSE). V2 uses a frame-based protocol.

### Frame Structure

Each SSE line follows `event: <type>\ndata: <json>\n\n`.

### Event Types

| Event | Description |
|-------|------------|
| `frame` | Primary event type carrying typed payload |
| `error` | Top-level stream error |
| `done` | Stream termination signal |

### Frame Types (within `event: frame`)

| `type` field | Stage | Description |
|-------------|-------|-------------|
| `stream_started` | lifecycle | Stream initialized; carries `thread_id`, `model` |
| `token_delta` | stream | Token text fragment; carries `delta` |
| `request_messages` | model | Model request/messages were prepared |
| `response_received` | model | Model response received |
| `tool_call` | tool | Tool invocation begins; carries `tool_name`, `toolkit_id`, arguments |
| `tool_result` | tool | Tool invocation ends; carries `tool_name`, `toolkit_id`, result |
| `tool_call` with `confirmation_id` | tool/input | Requires user confirmation or human input |
| `memory_save` | memory | Memory write event |
| `memory_recall` | memory | Memory retrieval event |
| `subagent_started` | subagent | Child run started; carries `child_run_id`, `subagent_id`, `mode`, `template` |
| `subagent_completed` | subagent | Child run completed; carries `child_run_id`, `status` |
| `subagent_failed` | subagent | Child run failed |
| `reasoning` | stream | Model reasoning/thinking content |
| `observation` | stream | Agent observation content |
| `done` | lifecycle | Stream completed normally |
| `error` | lifecycle | Stream error; carries `code`, `message` |

### Tool Confirmation Flow

When a tool requires confirmation, or when `ask_user_question` needs human input:

1. Backend sends a `tool_call` frame with `confirmation_id`
2. Backend blocks on `threading.Event.wait()` until confirmation received
3. Frontend displays confirmation UI via `toolConfirmationUiStateById`
4. User approves/denies → `api.unchain.respondToolConfirmation({ confirmation_id, approved })`
5. Backend unblocks and continues or cancels

### Continuation Flow

When the agent wants to continue after a tool result:

1. Backend sends a continuation request frame
2. Frontend sets `pendingContinuationRequest` state
3. User can approve continuation or cancel
4. Response sent back via similar mechanism

---

## V1 Stream Protocol (Legacy)

The V1 protocol uses simple event types:

| Event | Data |
|-------|------|
| `meta` | `{ model, thread_id, ... }` |
| `token` | `{ delta: "text" }` |
| `done` | `{ result, ... }` |
| `error` | `{ code, message }` |

> V1 is maintained for backward compatibility. New stream work should use the V3 runtime-event path when possible, with V2 as the compatibility fallback.

---

## Frontend Stream Handling

The `use_chat_stream.js` hook manages the streaming lifecycle:

### Key State

- `streamHandleRef` — reference to the active stream (cancel function)
- `toolConfirmationUiStateById` — pending tool confirmations
- `pendingContinuationRequest` — pending continuation request
- `subagentFramesByRunIdRef` — nested frames keyed by child run id
- `currentStreamingMessageId` — ID of the message being streamed

### V3 Handler Pipeline

```
onRuntimeEvent(event)
  ├─ RuntimeEventStore.append(event)
  ├─ reduceActivityTree(snapshot)
  ├─ emit new effects only
  └─ pass TraceFrame effects into the same message/subagent handlers
```

### V2 Frame Handler Pipeline

```
onFrame(frame)
  ├─ stream_started → create assistant message, set status "streaming"
  ├─ token_delta → append to message content
  ├─ tool_call → add trace frame and maybe set confirmation UI state
  ├─ tool_result → add trace frame and resolve confirmation follow-up
  ├─ subagent_started → create subagent entry
  ├─ child run frame → append to subagentFrames[runId]
  ├─ subagent_completed/subagent_failed → update subagent meta
  ├─ memory_save / memory_recall → add trace frame
  ├─ reasoning / observation → add trace frame
  ├─ done → set status "done", clear stream handle
  └─ error → set status "error", store error meta
```

---

## Key Files

| File | Role |
|------|------|
| `src/PAGEs/chat/hooks/use_chat_stream.js` | Core streaming hook |
| `src/SERVICEs/runtime_events/` | V3 RuntimeEvent store, ActivityTree reducer, TraceChain adapter |
| `src/SERVICEs/api.unchain.js` | API facade with payload injection |
| `src/SERVICEs/bridges/unchain_bridge.js` | Renderer-side bridge wrapper |
| `electron/preload/bridges/unchain_bridge.js` | Preload IPC bridge factory |
| `electron/preload/stream/unchain_stream_client.js` | SSE stream client |
| `electron/main/ipc/register_handlers.js` | IPC handler registration |
| `electron/main/services/unchain/service.js` | Unchain service + SSE relay |
| `unchain_runtime/server/route_chat.py` | Flask chat stream endpoints |
| `unchain_runtime/server/unchain_adapter.py` | Agent orchestration |

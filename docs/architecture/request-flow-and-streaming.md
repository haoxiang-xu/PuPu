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
│         └─ api.unchain.startStreamV2(payload, handlers)            │
│              └─ normalizeMisoV2Payload(payload)                    │
│                   ├─ injectProviderApiKeyIntoPayload               │
│                   ├─ injectMemoryIntoPayload                       │
│                   ├─ injectWorkspaceRootIntoPayload                │
│                   └─ injectSystemPromptV2IntoPayload               │
│              └─ unchainBridge.startStreamV2(payload, handlers)     │
├─────────────────────────────────────────────────────────────────────┤
│ ELECTRON PRELOAD                                                    │
│                                                                     │
│  unchain_stream_client.js                                          │
│    └─ ipcRenderer.send(CHANNELS.UNCHAIN.STREAM_START_V2, payload)  │
│    └─ ipcRenderer.on(CHANNELS.UNCHAIN.STREAM_EVENT, callback)      │
├─────────────────────────────────────────────────────────────────────┤
│ ELECTRON MAIN                                                       │
│                                                                     │
│  register_handlers.js → unchainService.handleStreamStartV2()       │
│    └─ HTTP POST to Flask http://127.0.0.1:{port}/chat/stream/v2   │
│    └─ SSE relay: read Flask SSE → webContents.send(STREAM_EVENT)   │
├─────────────────────────────────────────────────────────────────────┤
│ PYTHON FLASK SIDECAR                                                │
│                                                                     │
│  routes.py: chat_stream_v2()                                       │
│    └─ unchain_adapter.py: stream_chat_events()                     │
│         └─ _UnchainAgent.run() in worker thread                    │
│              └─ Provider SDK (OpenAI / Anthropic / Gemini / Ollama) │
└─────────────────────────────────────────────────────────────────────┘
```

Events flow back through the same path: **Flask SSE → Electron main → IPC → preload stream client → React handlers**.

---

## Payload Injection Chain

Before the payload leaves the renderer, `normalizeMisoV2Payload()` applies four injections in order:

### 1. Provider API Key Injection (`injectProviderApiKeyIntoPayload`)

Reads stored API keys from `localStorage.settings.model_providers` and injects them into the payload based on the selected model's provider.

Supported remote providers: `openai`, `anthropic`.

### 2. Memory Injection (`injectMemoryIntoPayload`)

Reads memory settings from `localStorage.settings.memory` and injects:
- `memory_enabled`: boolean
- `memory_session_id`: string
- `memory_embedding_provider`: `"auto"` | `"openai"` | `"ollama"`
- `memory_embedding_model`: string (optional)
- `memory_long_term_enabled`: boolean
- `memory_long_term_namespace`: string (default: `"pupu:default"`)

### 3. Workspace Root Injection (`injectWorkspaceRootIntoPayload`)

Resolves `selectedWorkspaceIds` to absolute paths from `localStorage.settings.runtime.workspaces`. Injects:
- `workspaceRoot`: primary workspace path
- `workspace_root`: alias
- `workspace_roots`: array of all selected workspace paths

### 4. System Prompt V2 Injection (`injectSystemPromptV2IntoPayload`)

Applies the 3-layer system prompt architecture (see [System Prompt V2](system-prompt-v2.md)):
- Build defaults → runtime config → per-chat overrides
- Injects `system_prompt_v2_sections` into the payload

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
| `model_start` | model | Model inference begins; carries `model` |
| `model_end` | model | Model inference ends |
| `tool_call_start` | tool | Tool invocation begins; carries tool name, arguments |
| `tool_call_end` | tool | Tool invocation ends; carries result |
| `tool_confirmation_request` | tool | Requires user confirmation; carries `confirmation_id`, tool details |
| `memory_save` | memory | Memory write event |
| `memory_recall` | memory | Memory retrieval event |
| `subagent_spawn` | subagent | Sub-agent created; carries `run_id`, `subagent_id`, `mode`, `template` |
| `subagent_frame` | subagent | Nested frame from sub-agent; carries `run_id` + inner frame |
| `subagent_done` | subagent | Sub-agent completed; carries `run_id` |
| `reasoning` | stream | Model reasoning/thinking content |
| `observation` | stream | Agent observation content |
| `done` | lifecycle | Stream completed normally |
| `error` | lifecycle | Stream error; carries `code`, `message` |

### Tool Confirmation Flow

When a tool requires confirmation (`write_file`, `delete_file`, `move_file`, `terminal_exec`):

1. Backend sends `tool_confirmation_request` frame with `confirmation_id`
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

> V1 is maintained for backward compatibility. New features use V2.

---

## Frontend Stream Handling

The `use_chat_stream.js` hook (~2540 lines) manages the streaming lifecycle:

### Key State

- `streamHandleRef` — reference to the active stream (cancel function)
- `toolConfirmationUiStateById` — pending tool confirmations
- `pendingContinuationRequest` — pending continuation request
- `currentStreamingMessageId` — ID of the message being streamed

### Handler Pipeline

```
onFrame(frame)
  ├─ stream_started → create assistant message, set status "streaming"
  ├─ token_delta → append to message content
  ├─ tool_call_start → add trace frame
  ├─ tool_call_end → update trace frame with result
  ├─ tool_confirmation_request → set confirmation UI state
  ├─ subagent_spawn → create subagent entry
  ├─ subagent_frame → delegate to subagent frame handler
  ├─ subagent_done → finalize subagent
  ├─ memory_save / memory_recall → add trace frame
  ├─ reasoning / observation → add trace frame
  ├─ done → set status "done", clear stream handle
  └─ error → set status "error", store error meta
```

---

## Key Files

| File | Role |
|------|------|
| `src/PAGEs/chat/hooks/use_chat_stream.js` | Core streaming hook (~2540 lines) |
| `src/SERVICEs/api.unchain.js` | API facade with payload injection |
| `src/SERVICEs/bridges/unchain_bridge.js` | Renderer-side bridge wrapper |
| `electron/preload/bridges/unchain_bridge.js` | Preload IPC bridge factory |
| `electron/preload/stream/unchain_stream_client.js` | SSE stream client |
| `electron/main/ipc/register_handlers.js` | IPC handler registration |
| `electron/main/services/unchain/service.js` | Miso service + SSE relay |
| `unchain_runtime/server/routes.py` | Flask API endpoints |
| `unchain_runtime/server/unchain_adapter.py` | Agent orchestration |

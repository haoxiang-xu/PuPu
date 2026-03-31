# Subagent Event Flow & Chain Data Reference

How events flow from the unchain kernel through the backend, IPC, and into the React frontend when subagents are involved.

## SSE Frame Structure

Every event sent over the `/chat/stream/v2` SSE connection is wrapped in a **frame**:

```json
{
  "seq": 42,
  "ts": 1711900000000,
  "thread_id": "thread-171190000000",
  "run_id": "session:agent-id:uuid",
  "iteration": 3,
  "stage": "tool",
  "type": "tool_call",
  "payload": { ... }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `seq` | int | Monotonically increasing sequence number per stream |
| `ts` | int | Millisecond timestamp |
| `thread_id` | string | Session/conversation identifier |
| `run_id` | string | **Identifies which agent emitted this event.** Parent and child agents have different run_ids. Format: `{session_id}:{agent_id}:{uuid}` |
| `iteration` | int | Kernel loop iteration counter |
| `stage` | string | One of: `"model"`, `"tool"`, `"agent"`, `"stream"`, `"memory"` |
| `type` | string | Event type (see table below) |
| `payload` | object | Event-specific data |

## Run ID Semantics

```
Parent Agent (run_id = "sess:developer:abc-123")
  ├─ emits: token_delta, tool_call, final_message  (run_id = "sess:developer:abc-123")
  ├─ emits: subagent_spawned, subagent_started      (run_id = "sess:developer:abc-123", payload.child_run_id = "sess:developer.analyzer.1:def-456")
  │
  └─ Child Agent (run_id = "sess:developer.analyzer.1:def-456")
      ├─ emits: token_delta, tool_call, final_message  (run_id = "sess:developer.analyzer.1:def-456")
      └─ ...
```

**Key rules:**
- Lifecycle events (`subagent_spawned`, `subagent_started`, etc.) carry the **parent's** `run_id` and the **child's** `run_id` in `payload.child_run_id`
- Execution events (`token_delta`, `tool_call`, `tool_result`, `final_message`) from a child carry the **child's own** `run_id`
- To associate a child's execution events with its lifecycle, match `frame.run_id` against the `child_run_id` from the corresponding `subagent_spawned`/`subagent_started` event

## Event Types

### Model Events (stage: `"model"`)

| Type | Payload | Description |
|------|---------|-------------|
| `token_delta` | `{ delta: string }` | Incremental text chunk from the model |
| `reasoning` | `{ reasoning: string }` | Accumulated thinking/reasoning text |
| `final_message` | `{ content: string }` | Complete final response text |
| `request_messages` | `{ messages: array }` | Messages sent to the model (debug) |

### Tool Events (stage: `"tool"`)

| Type | Payload | Description |
|------|---------|-------------|
| `tool_call` | `{ call_id, tool_name, tool_display_name?, arguments }` | Tool invocation |
| `tool_result` | `{ call_id, tool_name, tool_display_name?, result, error? }` | Tool return value |
| `tool_confirmation_requested` | `{ call_id, tool_name, arguments, description }` | Awaiting user approval |
| `tool_confirmation_resolved` | `{ call_id, approved: bool }` | User responded to confirmation |

### Subagent Lifecycle Events (stage: `"agent"`)

| Type | Payload | Description |
|------|---------|-------------|
| `subagent_spawned` | `{ child_run_id, subagent_id, parent_id, mode, template, lineage, batch_id? }` | Child allocated |
| `subagent_started` | `{ child_run_id, subagent_id, mode, template, task? }` | Child execution begins |
| `subagent_completed` | `{ subagent_id, mode, template, output, summary }` | Child finished successfully |
| `subagent_failed` | `{ subagent_id, mode, template, error }` | Child errored |
| `subagent_handoff` | `{ child_run_id, subagent_id, mode, reason }` | Handoff delegation |
| `subagent_clarification_requested` | `{ subagent_id, clarification_request }` | Child needs user input |
| `subagent_batch_started` | `{ batch_id, tasks: array }` | Worker batch initiated |
| `subagent_batch_joined` | `{ batch_id, results: array }` | All workers completed |

### Stream Events (stage: `"stream"`)

| Type | Payload | Description |
|------|---------|-------------|
| `stream_started` | `{ model, started_at, trace_level }` | Stream opened |
| `done` | `{ finished_at, bundle? }` | Stream complete |
| `error` | `{ code, message }` | Stream error |
| `run_started` | `{ run_id }` | Kernel run began (sets parent run_id) |

### Memory Events (stage: `"memory"`)

| Type | Payload | Description |
|------|---------|-------------|
| `memory_prepare` | `{ applied, fallback_reason? }` | Memory retrieval status |
| `memory_commit` | `{ committed, facts_count? }` | Memory write status |

### Other Events

| Type | Payload | Description |
|------|---------|-------------|
| `human_input_requested` | `{ interact_config }` | Agent asks user a question |
| `human_input_resumed` | `{ response }` | User answered |
| `continuation_requested` | `{ reason, consumed_tokens }` | Max iterations hit, asking to continue |
| `continuation_resumed` | `{ continued: bool }` | User decided |

## Frontend Processing Pipeline

```
Backend (Flask SSE)
  │
  ▼
Electron Main Process (miso/service.js)
  │  Relays SSE events as IPC messages
  ▼
Preload (unchain_stream_client.js)
  │  Dispatches to handlers based on frame type:
  │
  ├─ ALL frames ──────────► handlers.onFrame(frame)     [full frame with run_id]
  │
  ├─ token_delta ─────────► handlers.onToken(delta)      [delta string ONLY, no run_id]
  │                          then return (no further dispatch)
  │
  ├─ stream_started ──────► handlers.onMeta(payload)
  │                          then return
  │
  ├─ done ────────────────► handlers.onDone(payload)
  │                          then cleanup
  │
  └─ error ───────────────► handlers.onError(payload)
                             then cleanup
```

### use_chat_stream.js Handler Logic

```
onFrame(frame):
  │
  ├─ token_delta?
  │    Check run_id → if subagent: set suppressNextTokenRef = true
  │    return (let onToken handle parent tokens)
  │
  ├─ final_message / tool_call / error / done?
  │    Flush buffered tokens first
  │    ↓ fall through
  │
  ├─ run_started?
  │    Set parentRunIdRef
  │
  ├─ subagent_spawned / subagent_started?
  │    Register child_run_id in subagentRunIdMapRef
  │
  ├─ ── Subagent Routing ──
  │    Check frame.run_id vs parentRunIdRef
  │    If child run_id → push to subagentFramesByRunIdRef, return
  │
  ├─ final_message → update message.content
  ├─ tool_call → append to traceFrames
  ├─ tool_result → append to traceFrames
  └─ ... other frame types

onToken(delta):
  │
  ├─ suppressNextTokenRef set? → reset flag, skip (subagent token)
  │
  └─ Feed into thinkTagParser → buffer → flush to message.content
```

### Subagent Frame Storage

```javascript
// Registered when subagent_spawned/subagent_started arrives
subagentRunIdMapRef: Map<childRunId, { subagentId, mode, template, batchId? }>

// Accumulated frames from child execution
subagentFramesByRunIdRef: Map<childRunId, frame[]>

// Exposed on message object for trace_chain rendering
message.subagentFrames: { [childRunId]: frame[] }
```

### trace_chain.js Rendering

The `TraceChain` component receives both `frames` (parent timeline) and `subagentFrames` (child frames by run_id).

When rendering a `delegate_to_subagent` or `spawn_worker_batch` tool call:
1. Matches child frames by agent name from `subagentFrames`
2. Renders `SubagentSubtree` — a nested tree showing the child's tool calls with execution times
3. Shows task description, output preview, and error info in `KVPanel`
4. For batch results, renders `WorkerResultList` with per-worker outcomes

## Backend Source Reference

| File | Purpose |
|------|---------|
| `unchain_runtime/server/routes.py` | `_build_trace_frame()` (L130-149), `chat_stream_v2()` (L1568-1740) |
| `unchain_runtime/server/unchain_adapter.py` | `stream_chat_events()` (L3409-3603), `on_event()` callback (L3467-3497) |
| `unchain/subagents/plugin.py` | `_run_child()` (L270-331), `_emit_subagent_event()` (L348-376), `delegate_to_subagent()` (L378-465), `spawn_worker_batch()` (L586-771) |
| `unchain/kernel/loop.py` | `emit_event()` — kernel event emission with run_id |
| `unchain/providers/model_io.py` | `_emit()` — model streaming events (token_delta, final_message) |

## Frontend Source Reference

| File | Purpose |
|------|---------|
| `electron/preload/stream/unchain_stream_client.js` | IPC → handler dispatch (onFrame/onToken/onDone) |
| `src/PAGEs/chat/hooks/use_chat_stream.js` | Stream state machine, subagent routing (L1583-1611), token buffering |
| `src/COMPONENTs/chat-bubble/trace_chain.js` | `SubagentSubtree` (L523-598), subagent tool rendering (L941-1068) |
| `src/COMPONENTs/chat-bubble/chat_bubble.js` | Passes `subagentFrames` to TraceChain (L112) |

# Skill: Miso Server Endpoints and Stream V2

Use this guide when you need to understand, call, or extend the local Miso sidecar.

Primary source files:

- Flask routes: `miso_runtime/server/routes.py`
- Runtime adapter: `miso_runtime/server/miso_adapter.py`
- Memory factory: `miso_runtime/server/memory_factory.py`
- Electron main service: `electron/main/services/miso/service.js`
- Electron preload stream client: `electron/preload/stream/miso_stream_client.js`
- Renderer facade: `src/SERVICEs/api.miso.js`
- Electron preload bridge: `electron/preload/bridges/miso_bridge.js`

The renderer should call Miso through `api.miso.*`. Do not call sidecar HTTP endpoints directly from pages or components.

---

## 1. Current endpoint list

Current Flask endpoints are:

- `GET /health`
- `GET /models/catalog`
- `GET /toolkits/catalog`
- `GET /memory/projection`
- `GET /memory/long-term/projection`
- `POST /chat/tool/confirmation`
- `POST /memory/session/replace`
- `POST /chat/stream`
- `POST /chat/stream/v2`

Guidance:

- `/chat/stream/v2` is the primary streaming contract for the app.
- `/chat/stream` is still present, but it is the legacy simple SSE path.
- memory projection now has separate session and long-term routes.

When `MISO_AUTH_TOKEN` is configured, protected routes require:

- header: `x-miso-auth: <token>`

---

## 2. Which path the UI should use

For normal chat generation in the renderer, use:

```js
api.miso.startStreamV2(payload, handlers)
```

That path goes through:

1. `src/SERVICEs/api.miso.js`
2. `electron/preload/stream/miso_stream_client.js`
3. `electron/main/ipc/register_handlers.js`
4. `electron/main/services/miso/service.js`
5. local Flask sidecar `/chat/stream/v2`

Do not add direct `fetch("http://127.0.0.1:...")` calls from renderer pages.

---

## 3. `/chat/stream/v2` request contract

Request body is JSON. The important fields are:

- `message`: string
- `attachments`: optional attachment blocks
- `threadId` or `thread_id`: optional thread or session identifier
- `history`: prior dialog messages
- `options`: runtime options
- `trace_level`: optional, `"minimal"` or `"full"`

`message` or `attachments` must be present.

In practice, renderer code usually injects these through `api.miso.startStreamV2(...)`:

- `options.system_prompt_v2`
- `options.toolkits`
- `options.memory_enabled`
- `options.memory_embedding_provider`
- `options.memory_embedding_model`
- `options.memory_last_n_turns`
- `options.memory_vector_top_k`
- `options.memory_namespace`
- `options.memory_long_term_enabled`
- `options.memory_long_term_extract_every_n_turns`
- `options.workspaceRoot`
- `options.workspace_root`
- `options.workspace_roots`

Important client-side nuance:

- `options.selectedWorkspaceIds` is internal renderer state
- `api.miso.js` resolves it into workspace paths, then removes the IDs before the sidecar sees the payload

---

## 4. `/chat/stream/v2` SSE contract

This endpoint streams `event: frame`.

Each frame is a trace object with this shape:

```js
{
  seq: number,
  ts: number,
  thread_id: string,
  run_id: string,
  iteration: number,
  stage: "agent" | "model" | "tool" | "stream",
  type: string,
  payload: object,
}
```

Important frame types currently used by the app:

- `stream_started`
- `request_messages`
- `memory_prepare`
- `memory_commit`
- `tool_confirmation_request`
- `continuation_request`
- `final_message`
- `token_delta`
- `error`
- `done`

Operational meaning:

- `stream_started`: initial metadata for the run; preload maps it to `onMeta`
- `request_messages`: exact provider request shape the runtime is about to send
- `memory_prepare`: memory recall and trimming outcome for the request
- `memory_commit`: memory persistence outcome after the run
- `tool_confirmation_request`: a tool call needs user approval or editing
- `continuation_request`: the agent is asking whether to continue after a limit or decision point
- `final_message`: the final assistant message content

Important trace rule:

- `final_message`, `token_delta`, and `request_messages` are intentionally not trace-sanitized in `routes.py`, because the frontend needs their full content

---

## 5. Legacy `/chat/stream`

`POST /chat/stream` is still supported, but it is the older simple SSE path.

It emits:

- `event: meta`
- `event: token`
- `event: done`
- `event: error`

Use it only when you specifically need the simple token stream and do not need v2 frames, memory trace, tool confirmation frames, or continuation frames.

---

## 6. Tool and memory endpoints

### `GET /toolkits/catalog`

Returns the toolkit catalog used by the tool picker.

Renderer entrypoint:

```js
api.miso.getToolkitCatalog()
```

### `POST /chat/tool/confirmation`

Submits the decision for a pending tool confirmation request.

Request body:

```js
{
  confirmation_id: string,
  approved: boolean,
  reason?: string,
  modified_arguments?: object,
}
```

Renderer entrypoint:

```js
api.miso.respondToolConfirmation(payload)
```

### `GET /memory/projection`

Returns projected short-term session memory points for the memory inspector.

Query:

```txt
session_id=<chat thread or session id>
```

Renderer entrypoint:

```js
api.miso.getMemoryProjection(sessionId)
```

### `GET /memory/long-term/projection`

Returns the aggregated long-term memory projection used by the long-term inspector mode.

Renderer entrypoint:

```js
api.miso.getLongTermMemoryProjection()
```

### `POST /memory/session/replace`

Replaces the short-term memory session payload with a sanitized message history.

Request body:

```js
{
  sessionId?: string,
  session_id?: string,
  messages: Message[],
  options?: object,
}
```

Renderer entrypoint:

```js
api.miso.replaceSessionMemory(payload)
```

---

## 7. Anthropic and trace inspection pitfall

Do not assume every provider request is fully represented by `messages`.

For Anthropic, system prompt content is separated from the `messages` array during provider formatting. That means:

- the request trace may have system content outside `payload.messages`
- inspecting only `request_messages.payload.messages` can make it look like rules disappeared when they actually moved to the provider-specific `system` field

When debugging Anthropic request shape, inspect both:

- the trace frame payload
- provider formatting in `miso_runtime/server/miso_adapter.py`

---

## 8. Adding or changing an endpoint safely

When you add server functionality, update layers in this order:

1. Flask route in `miso_runtime/server/routes.py`
2. adapter or runtime logic in `miso_runtime/server/miso_adapter.py` if needed
3. Electron main service in `electron/main/services/miso/service.js`
4. IPC channels and handler registry in `electron/shared/channels.js` and `electron/main/ipc/register_handlers.js`
5. preload bridge or stream client in `electron/preload/bridges/miso_bridge.js` or `electron/preload/stream/miso_stream_client.js`
6. renderer facade in `src/SERVICEs/api.miso.js`
7. UI usage through `api.miso.*`

Do not skip the facade layer.

---

## 9. Quick checks

```bash
rg -n "@api_blueprint\\.(get|post)" \
  miso_runtime/server/routes.py
```

```bash
rg -n "startStreamV2|getToolkitCatalog|respondToolConfirmation|getMemoryProjection|getLongTermMemoryProjection|replaceSessionMemory" \
  src/SERVICEs/api.miso.js \
  electron/preload/bridges/miso_bridge.js \
  electron/preload/stream/miso_stream_client.js
```

```bash
rg -n "STREAM_START_V2|GET_TOOLKIT_CATALOG|GET_MEMORY_PROJECTION|GET_LONG_TERM_MEMORY_PROJECTION|REPLACE_SESSION_MEMORY|handleStreamStartV2" \
  electron/shared/channels.js \
  electron/main/ipc/register_handlers.js \
  electron/main/services/miso/service.js
```

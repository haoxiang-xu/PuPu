# Skill: Chat Runtime, Memory, and Trace Onboarding

Use this guide when you need to touch request shaping, memory injection, trace frames, tool confirmation, session memory replacement, or provider-specific request formatting.

This is not a full handbook. It is the shortest path to not breaking the current chat path.

---

## 1. End-to-end request path

The normal v2 request path is:

1. `src/PAGEs/chat/chat.js`
2. `src/SERVICEs/api.js`
3. `src/SERVICEs/api.miso.js`
4. `electron/preload/stream/miso_stream_client.js`
5. `electron/preload/bridges/miso_bridge.js`
6. `electron/main/ipc/register_handlers.js`
7. `electron/main/services/miso/service.js`
8. `miso_runtime/server/routes.py`
9. `miso_runtime/server/miso_adapter.py`
10. provider/runtime code

For standard chat generation, the renderer entrypoint is:

```js
api.miso.startStreamV2(payload, handlers)
```

That is the path to reason about first before changing chat behavior.

---

## 2. Canonical payload entering the runtime

The renderer sends a payload shaped roughly like:

```js
{
  message: string,
  attachments?: AttachmentBlock[],
  threadId?: string,
  history: Message[],
  options: {
    modelId?: string,
    toolkits?: string[],
    selectedWorkspaceIds?: string[], // renderer-only, stripped before sidecar
    system_prompt_v2?: {
      enabled?: boolean,
      defaults?: { [sectionKey]: string },
      overrides?: { [sectionKey]: string | null },
    },
    memory_enabled?: boolean,
    memory_embedding_provider?: "auto" | "openai" | "ollama",
    memory_embedding_model?: string,
    memory_last_n_turns?: number,
    memory_vector_top_k?: number,
    memory_namespace?: string,
    memory_long_term_enabled?: boolean,
    memory_long_term_extract_every_n_turns?: number,
    openaiApiKey?: string,
    openai_api_key?: string,
    anthropicApiKey?: string,
    anthropic_api_key?: string,
  },
}
```

Important producer-side sources:

- chat/session state: `src/SERVICEs/chat_storage.js`
- attachment payload durability: `src/SERVICEs/attachment_storage.js`
- memory settings: `src/COMPONENTs/settings/memory/storage.js`
- workspace settings and named workspaces: `src/COMPONENTs/settings/runtime.js`
- request assembly and option injection: `src/SERVICEs/api.miso.js`

Important runtime-side sources:

- route sanitization and trace shaping: `miso_runtime/server/routes.py`
- prompt, toolkit, and memory orchestration: `miso_runtime/server/miso_adapter.py`
- embedding resolution and memory patching: `miso_runtime/server/memory_factory.py`

Important `api.miso.js` nuance:

- `selectedWorkspaceIds` is internal renderer state, not a server contract
- `startStreamV2(...)` injects `workspaceRoot`, `workspace_root`, and `workspace_roots`
- `startStreamV2(...)` injects `system_prompt_v2`, memory settings, provider API keys, and OpenAI embedding keys when needed
- default long-term memory namespace is currently `pupu:default`

---

## 3. Workspace and tool lifecycle

Workspace context spans settings, chat state, and the sidecar.

Renderer side:

- default workspace root: `settings.runtime.workspace_root`
- named workspaces: `settings.runtime.workspaces`
- per-chat selection: `chat.selectedWorkspaceIds`
- payload injection: `src/SERVICEs/api.miso.js`

Payload shaping rule:

- `selectedWorkspaceIds` is resolved against saved workspaces
- the field is then stripped from `options`
- the sidecar receives `workspaceRoot` / `workspace_root` / `workspace_roots`

Runtime side:

- workspace root extraction: `miso_runtime/server/miso_adapter.py`
- multi-root attachment: `multi_workspace_toolkit(...)`
- single-root fallback: `python_workspace_toolkit(...)`

Recent hard-earned rule:

- do not treat saved workspace IDs as the server contract; only resolved paths belong in sidecar payloads

---

## 4. Memory lifecycle

The current memory system spans renderer, Electron, and sidecar.

Renderer side:

- memory settings live in `src/COMPONENTs/settings/memory/storage.js`
- `api.miso.startStreamV2(...)` injects:
  - `memory_enabled`
  - `memory_embedding_provider`
  - `memory_embedding_model`
  - `memory_last_n_turns`
  - `memory_vector_top_k`
  - `memory_namespace`
  - `memory_long_term_enabled`
  - `memory_long_term_extract_every_n_turns`
- `chat.js` can call `api.miso.replaceSessionMemory(...)` to resync short-term session memory from sanitized history before continuing a chat flow

Server side:

- embedding provider resolution: `miso_runtime/server/memory_factory.py`
- short-term memory prepare and commit: `miso_runtime/server/miso_adapter.py`
- long-term namespace forwarding: `miso_runtime/server/miso_adapter.py`

Current embedding resolution order:

1. explicit `memory_embedding_provider`
2. current chat model provider, if it supports embeddings
3. OpenAI fallback if API key is available
4. Ollama fallback if reachable
5. no memory for this request

Runtime storage locations:

- vector store: runtime data dir under `memory/qdrant`
- short-term session history JSON: runtime data dir under `memory/sessions`
- long-term profile payloads: runtime data dir under `memory/long_term_profiles`

Memory inspector entrypoints:

- session view: `createMisoApi().getMemoryProjection(sessionId)`
- long-term view: `createMisoApi().getLongTermMemoryProjection()`
- UI surface: `src/COMPONENTs/memory-inspect/memory_inspect_modal.js`

Recent hard-earned rule:

- tool traffic is not dialog history and must not count as turns

The current memory sanitizer in `memory_factory.py` retroactively cleans stored dialog history before prepare and commit work. Do not document tool output as if it were durable user/assistant dialog.

---

## 5. Trace lifecycle

`/chat/stream/v2` streams `event: frame`.

Each frame has:

```js
{
  seq,
  ts,
  thread_id,
  run_id,
  iteration,
  stage,
  type,
  payload,
}
```

Important frame types in day-to-day debugging:

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

Frontend handling:

- `miso_stream_client.js` maps `stream_started` to `onMeta`
- `miso_stream_client.js` maps `token_delta` to `onToken`
- the chat page appends relevant frames to assistant-message `traceFrames`
- `chat_storage.js` persists a trimmed representation of those frames

Important trace nuance:

- `request_messages` is intentionally preserved with full payload for inspection
- `final_message` and `token_delta` are also kept unsanitized because the UI needs exact content
- many other frames are trace-sanitized by `routes.py` based on `trace_level`

---

## 6. Anthropic-specific request pitfall

Anthropic is where new engineers usually misread the trace.

The runtime can build a system prompt from `options.system_prompt_v2`, but Anthropic request formatting separates system content from the `messages` array.

Implications:

- a trace can look like it has lost the rules when you only inspect `messages`
- the real request may still contain the rules in a separate `system` field
- multiple system messages are dangerous because downstream provider formatting may keep only the last one unless you merge them deliberately

When debugging Anthropic request shape, inspect both:

- the trace frame payload
- provider formatting in `miso_runtime/server/miso_adapter.py`

---

## 7. High-risk pitfalls

### Memory behavior

- Do not treat tool calls or tool results as chat turns for `last_n_turns`.
- Do not assume `memory_enabled: true` means memory will definitely run.
- Do not remove the retroactive memory sanitization path in `memory_factory.py` unless you are also migrating existing stored sessions.
- Do not forget that long-term behavior now depends on `memory_namespace`, `memory_long_term_enabled`, and `memory_long_term_extract_every_n_turns`.

### Message and trace structure

- Do not assume every provider request stores everything in `messages`.
- Do not inspect only `request_messages.payload.messages` when debugging Anthropic.
- Do not persist raw trace payloads indiscriminately into localStorage; `chat_storage.js` already trims them for size.
- Do not forget that the stream path traverses preload and Electron main before the Flask sidecar.

### Attachments

- Do not assume attachment payload bytes are in chat localStorage.
- Do not break the split model: metadata in `chat_storage`, payload durability in IndexedDB via `attachment_storage`.

### Workspace and tools

- Do not persist raw workspace paths in chat sessions.
- Do not send `selectedWorkspaceIds` straight to the sidecar. `api.miso.js` must resolve them first.
- Do not assume multi-workspace support is automatic. The runtime explicitly falls back to single-root toolkit behavior.

### API facade

- Do not implement new backend logic directly in `src/SERVICEs/api.js`. It mostly delegates.

---

## 8. When editing this area, read these files first

- `src/PAGEs/chat/chat.js`
- `src/SERVICEs/api.miso.js`
- `src/SERVICEs/chat_storage.js`
- `src/SERVICEs/attachment_storage.js`
- `src/COMPONENTs/settings/memory/storage.js`
- `src/COMPONENTs/settings/runtime.js`
- `src/COMPONENTs/memory-inspect/memory_inspect_modal.js`
- `electron/preload/stream/miso_stream_client.js`
- `electron/main/services/miso/service.js`
- `miso_runtime/server/routes.py`
- `miso_runtime/server/miso_adapter.py`
- `miso_runtime/server/memory_factory.py`

If the change touches tool approval, also read:

- `electron/preload/bridges/miso_bridge.js`

---

## 9. Quick checks

```bash
rg -n "startStreamV2|replaceSessionMemory|system_prompt_v2|memory_namespace|memory_long_term_enabled|workspace_roots" \
  src/PAGEs/chat/chat.js \
  src/SERVICEs/api.miso.js
```

```bash
rg -n "STREAM_START_V2|STREAM_EVENT|getMisoStatusPayload|handleStreamStartV2|getLongTermMemoryProjection|replaceSessionMemory" \
  electron/preload/stream/miso_stream_client.js \
  electron/main/ipc/register_handlers.js \
  electron/main/services/miso/service.js \
  electron/preload/bridges/miso_bridge.js
```

```bash
rg -n "request_messages|memory_prepare|memory_commit|memory_namespace|long_term|continuation_request" \
  miso_runtime/server/routes.py \
  miso_runtime/server/miso_adapter.py \
  miso_runtime/server/memory_factory.py
```

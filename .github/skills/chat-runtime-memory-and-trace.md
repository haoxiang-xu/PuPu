# Skill: Chat Runtime, Memory, and Trace Onboarding

Use this guide when you are new to the chat runtime or when you need to touch request shaping, memory, trace frames, tool confirmation, or provider formatting.

This is not a full handbook. It is the shortest path to not breaking the current system.

---

## 1. End-to-end request path

The normal chat request path is:

1. `src/PAGEs/chat/chat.js`
2. `src/SERVICEs/api.js`
3. `src/SERVICEs/api.miso.js`
4. `electron/preload/bridges/miso_bridge.js`
5. `miso_runtime/server/routes.py`
6. `miso_runtime/server/miso_adapter.py`
7. provider/runtime code

For standard chat generation, the renderer entrypoint is:

```js
api.miso.startStreamV2(payload, handlers)
```

That is the path you should reason about first before changing any chat behavior.

---

## 2. Canonical data entering the runtime

The renderer sends a request shaped roughly like:

```js
{
  message: string,
  attachments?: AttachmentBlock[],
  threadId?: string,
  history: Message[],
  options: {
    modelId?: string,
    toolkits?: string[],
    system_prompt_v2?: {
      defaults?: { [sectionKey]: string },
      overrides?: { [sectionKey]: string },
    },
    memory_enabled?: boolean,
    memory_embedding_provider?: "auto" | "openai" | "ollama",
    memory_embedding_model?: string,
    memory_last_n_turns?: number,
    memory_vector_top_k?: number,
  },
}
```

Important producer-side sources:

- chat/session state: `src/SERVICEs/chat_storage.js`
- attachment payload durability: `src/SERVICEs/attachment_storage.js`
- memory settings: `src/COMPONENTs/settings/memory/storage.js`
- request assembly and option injection: `src/SERVICEs/api.miso.js`

Important runtime-side sources:

- route sanitization: `miso_runtime/server/routes.py`
- prompt/toolkit/memory shaping: `miso_runtime/server/miso_adapter.py`

---

## 3. Memory lifecycle

The current memory system spans both renderer and sidecar.

Renderer side:

- memory settings live in `src/COMPONENTs/settings/memory/storage.js`
- `api.miso.startStreamV2(...)` injects:
  - `memory_enabled`
  - `memory_embedding_provider`
  - `memory_embedding_model`
  - `memory_last_n_turns`
  - `memory_vector_top_k`

Server side:

- embedding resolution and memory patching: `miso_runtime/server/memory_factory.py`
- request orchestration: `miso_runtime/server/miso_adapter.py`

Current embedding resolution order:

1. explicit `memory_embedding_provider`
2. current chat model provider, if it supports embeddings
3. OpenAI fallback if API key is available
4. Ollama fallback if reachable
5. no memory for this request

Storage locations:

- vector store: runtime data dir under `memory/qdrant`
- session history JSON: runtime data dir under `memory/sessions`

How context is built:

- recent dialog comes from `last_n_turns`
- older recall comes from vector search (`vector_top_k`)
- the memory patching layer now sanitizes stored/incoming messages before turn logic

Recent hard-earned rule:

- tool traffic is not dialog history and must not count as turns

The current memory sanitizer in `memory_factory.py` does all of this:

- keeps dialog roles only (`system`, `user`, `assistant`)
- strips tool-related content blocks
- drops empty messages
- collapses consecutive assistant messages to the last one
- merges multiple system messages into one message
- retroactively cleans polluted stored session history during prepare/commit flow

---

## 4. Trace lifecycle

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

- `request_messages`
- `memory_prepare`
- `memory_commit`
- `tool_confirmation_request`
- `continuation_request`
- `final_message`

Frontend persistence:

- the chat page appends relevant frames to assistant-message `traceFrames`
- `chat_storage.js` persists a trimmed/sanitized representation of those frames

Important trace nuance:

- `request_messages` is intentionally preserved with full payload for inspection
- `final_message` and `token_delta` are also kept unsanitized because the UI needs the exact content
- many other frames are trace-sanitized by `routes.py` based on `trace_level`

---

## 5. Anthropic-specific request pitfall

Anthropic is where new engineers usually misread the trace.

The runtime can build a system prompt from `options.system_prompt_v2`, but Anthropic request formatting separates system content from the `messages` array.

Implications:

- a trace can look like it has "lost" the rules when you only inspect `messages`
- the real request may still contain the rules in a separate `system` field
- multiple system messages are dangerous because downstream provider formatting may keep only the last one unless you merge them deliberately

That is why the memory sanitization path now merges multiple system messages into one.

---

## 6. High-risk pitfalls

### Memory behavior

- Do not treat tool calls or tool results as chat turns for `last_n_turns`.
- Do not assume `memory_enabled: true` means memory will definitely run. If the embedding backend is unavailable, behavior differs depending on whether there is existing history.
- Do not remove the retroactive sanitization path in `memory_factory.py` unless you are also migrating existing stored sessions.

### Message and trace structure

- Do not assume every provider request stores everything in `messages`.
- Do not inspect only `request_messages.payload.messages` when debugging Anthropic.
- Do not persist raw trace payloads indiscriminately into localStorage; `chat_storage.js` already trims them for size.

### Attachments

- Do not assume attachment payload bytes are in chat localStorage.
- Do not break the split model: metadata in `chat_storage`, payload durability in IndexedDB via `attachment_storage`.

### Skills and maintenance

- Do not update `.github/skills` from memory. Verify exported symbols and file paths with `rg`.
- Do not let skill docs drift behind the current registry names (`BASE_SETTINGS_PAGES`, current bridge files, current endpoint set).
- Do not document a contract that only exists in old code. New engineers will trust the skill docs first.

### API facade

- Do not implement new backend logic directly in `src/SERVICEs/api.js`. It mostly delegates.

---

## 7. When editing this area, read these files first

- `src/PAGEs/chat/chat.js`
- `src/SERVICEs/api.miso.js`
- `src/SERVICEs/chat_storage.js`
- `src/SERVICEs/attachment_storage.js`
- `src/COMPONENTs/settings/memory/storage.js`
- `miso_runtime/server/routes.py`
- `miso_runtime/server/miso_adapter.py`
- `miso_runtime/server/memory_factory.py`

If the change touches tool approval, also read:

- `electron/preload/bridges/miso_bridge.js`

---

## 8. Quick checks

```bash
rg -n "startStreamV2|system_prompt_v2|memory_enabled|toolkits" \
  src/PAGEs/chat/chat.js \
  src/SERVICEs/api.miso.js \
  miso_runtime/server/miso_adapter.py
```

```bash
rg -n "_sanitize_dialog_messages|_merge_system_messages|request_messages|memory_prepare|memory_commit" \
  miso_runtime/server/memory_factory.py \
  miso_runtime/server/routes.py
```

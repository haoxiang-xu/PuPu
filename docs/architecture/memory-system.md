# Memory System

> Embedding-based memory with Qdrant vector storage.

---

## Overview

PuPu provides two tiers of memory:
- **Session memory (short-term)** — scoped to a single chat conversation
- **Long-term memory** — shared across conversations within a namespace

Both rely on vector embeddings stored in Qdrant (optional dependency).

---

## Embedding Resolution Order

When memory is enabled, `memory_factory.py` resolves the embedding provider in this order:

1. **Explicit setting** — `memory_embedding_provider` from user config (`openai` | `ollama`)
2. **Chat model's provider** — if the current model's provider supports embeddings
3. **OpenAI fallback** — if an OpenAI API key is present
4. **Ollama fallback** — if Ollama is reachable on `localhost:11434`
5. **None** — memory is disabled

Providers that do **not** support embeddings: `anthropic`.

### Default Embedding Models

| Provider | Model | Dimensions |
|----------|-------|-----------|
| OpenAI | `text-embedding-3-small` | auto (0) |
| Ollama | `nomic-embed-text` | 768 |

---

## Frontend Configuration

Memory settings are stored in `localStorage.settings.memory` and injected into the payload by `injectMemoryIntoPayload()` in `api.unchain.js`.

Injected fields:

| Field | Type | Description |
|-------|------|-------------|
| `memory_enabled` | boolean | Master toggle |
| `memory_session_id` | string | Session identifier |
| `memory_embedding_provider` | string | `"auto"` / `"openai"` / `"ollama"` |
| `memory_embedding_model` | string? | Specific model (optional) |
| `memory_long_term_enabled` | boolean | Long-term memory toggle |
| `memory_long_term_namespace` | string | Namespace (default: `"pupu:default"`) |

---

## Backend Memory Factory

`memory_factory.py` provides:

| Function | Purpose |
|----------|---------|
| `create_memory_manager_with_diagnostics(options, session_id)` | Creates manager + returns reason string |
| `create_memory_manager(options)` | Creates manager or returns None |
| `resolve_embedding_config(options)` | Resolves provider + model + dimensions |
| `replace_short_term_session_memory(session_id, messages, options)` | Replaces session vectors |
| `delete_short_term_session_memory(session_id)` | Deletes session vectors |
| `delete_long_term_memory_namespace(namespace)` | Deletes namespace vectors |

---

## Character Memory

Character chats use a special session ID format:

```
character_{normalized_character_id}__dm__{normalized_thread_id}
```

Built by `buildCharacterMemorySessionId(characterId, threadId)` in `chat_storage_sanitize.js`.

Character chats also maintain separate long-term memory profiles:
- **Self profile** — the character's self-knowledge
- **Relationship profile** — the character's knowledge of the user

---

## Memory SSE Events

During streaming, memory operations emit trace frames:

| Frame Type | Stage | Description |
|-----------|-------|-------------|
| `memory_save` | memory | A memory was written to the vector store |
| `memory_recall` | memory | Memories were retrieved from the vector store |

These appear as trace frames on assistant messages and can be inspected via the Memory Inspect component.

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/memory/projection` | GET | Visualization data for session memory vectors |
| `/memory/long-term/projection` | GET | Visualization data for long-term memory |
| `/memory/session/replace` | POST | Replace session memory from message history |
| `/memory/session/export` | GET | Export session memory as structured data |

---

## Storage on Disk

Memory data is stored in Electron's `userData` directory:

```
{userData}/
  memory/
    sessions/        # Per-session vector data
    long_term_profiles/  # Long-term memory by namespace
```

Size tracked via `runtimeService.getCharacterStorageSize()`.

---

## Key Files

| File | Role |
|------|------|
| `src/SERVICEs/api.unchain.js` | `injectMemoryIntoPayload()` |
| `src/COMPONENTs/settings/memory/` | Memory settings UI |
| `src/COMPONENTs/memory-inspect/` | Memory debug inspector |
| `unchain_runtime/server/memory_factory.py` | Manager creation + embedding resolution |
| `unchain_runtime/server/memory_qdrant.py` | Qdrant vector DB client |
| `unchain_runtime/server/memory_embeddings.py` | Embedding model management |
| `unchain_runtime/server/memory_storage.py` | Storage layer |
| `unchain_runtime/server/memory_paths.py` | File system paths |

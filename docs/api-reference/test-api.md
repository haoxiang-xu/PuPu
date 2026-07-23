# Test API (dev only)

A local HTTP REST endpoint for driving PuPu programmatically. **Dev mode only**, bound to `127.0.0.1` on a random port.

## Discovery

The port is written to `$HOME/Library/Application Support/pupu/test-api-port` (macOS):

```json
{"port": 49231, "pid": 12345, "started_at": 1714000000000}
```

Use `scripts/test-api/client.mjs` for a Node helper, or `curl` directly.

```bash
PORT=$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.env.HOME + '/Library/Application Support/pupu/test-api-port')).port)")
BASE="http://127.0.0.1:$PORT/v1"
```

## Endpoints

Base: `http://127.0.0.1:<port>/v1`

### Chat lifecycle

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/chats` | `{title?, model?}` | `{chat_id, created_at}` |
| GET | `/chats` | — | `{chats: [...]}` |
| GET | `/chats/:id` | — | `{id, title, model, character_id, toolkits, messages}` |
| POST | `/chats/:id/activate` | — | `{ok: true, chat_id, node_id, active_chat_id}`; fails closed if the exact chat cannot be selected |
| PATCH | `/chats/:id` | `{title?}` | `{ok: true}` |
| DELETE | `/chats/:id` | — | `{ok: true}` |

### Messages and async runs

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/chats/:id/messages` | `{text, attachments?}` | `{message_id, role, content, tool_calls?, finish_reason, latency_ms}` |
| POST | `/chats/:id/cancel` | — | `{ok, was_streaming}` |
| POST | `/chats/:id/runs` | `{text, attachments?}` | `{chat_id, execution_id, attempt_id, status}` |
| GET | `/chats/:id/runs/:attempt_id` | — | `{chat_id, execution_id, attempt_id, status, message_id?, content?}` |
| POST | `/chats/:id/runs/:attempt_id/cancel` | — | `{ok, chat_id, execution_id, attempt_id, status}` |

The blocking call holds the HTTP connection open until the assistant message completes (default timeout 5min).
Async start returns as soon as the runtime has assigned an attempt id. Activate the
chat before starting either form of request. Status and cancel are always scoped to
the chat and attempt ids in the URL; PuPu never falls back to the currently visible
chat when either id is wrong.

### Catalog and selection

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/catalog/models` | — | `{models: [...]}` |
| GET | `/catalog/toolkits` | — | `{toolkits: [...]}` |
| GET | `/catalog/characters` | — | `{characters: [...]}` |
| POST | `/chats/:id/model` | `{model_id}` | `{ok, model_id}` |
| POST | `/chats/:id/toolkits` | `{toolkit_ids: [...]}` | `{ok}` (override, not delta) |
| POST | `/chats/:id/character` | `{character_id\|null}` | `{ok, character_id}` when the requested value already matches |

An existing chat's character identity cannot be changed through the Test API.
The endpoint is idempotent when `character_id` exactly matches the chat's current
canonical value (including `null` for a default chat); any actual change fails
closed with `409 character_update_unsupported`. Open or create the canonical
character chat instead so its thread, memory, and orchestration invariants stay
aligned.

### Errors

| Status | Code | Meaning |
|---|---|---|
| 400 | `invalid_payload` / `invalid_json` | Bad body |
| 404 | `chat_not_found` / `run_not_found` / `not_found` | Unknown chat, run, or route |
| 408 | `ipc_timeout` | Renderer didn't respond |
| 409 | `no_handler` / `chat_not_active` / `attempt_mismatch` / `run_already_active` / `run_not_active` / `character_update_unsupported` | Command unavailable, the addressed chat/attempt cannot own the operation, or an existing chat's character identity would change |
| 500 | `handler_error` / `server_error` | Handler threw |
| 503 | `not_ready` / `no_window` | Renderer test bridge not yet `markReady()`, or no focused window |

### Examples

```bash
# Create a chat with default model
curl -s -X POST $BASE/chats \
  -H 'content-type: application/json' \
  -d '{"title":"hi","model":"gpt-5"}'
# => {"chat_id": "chat-...", "created_at": 1714000000000}

# List all chats
curl -s $BASE/chats | jq

# Send a message and wait for response
curl -s -X POST $BASE/chats/<id>/messages \
  -H 'content-type: application/json' \
  -d '{"text":"ping"}'
# => {"message_id": "...", "role": "assistant", "content": "pong", ...}

# Switch model
curl -s -X POST $BASE/chats/<id>/model \
  -H 'content-type: application/json' \
  -d '{"model_id":"claude-sonnet-4-6"}'
```

See [test-api-debug.md](./test-api-debug.md) for `/debug/*` endpoints.

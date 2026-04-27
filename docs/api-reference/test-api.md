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
| POST | `/chats/:id/activate` | — | `{ok: true}` |
| PATCH | `/chats/:id` | `{title?}` | `{ok: true}` |
| DELETE | `/chats/:id` | — | `{ok: true}` |

### Messages (blocking only in Phase 1)

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/chats/:id/messages` | `{text, attachments?}` | `{message_id, role, content, tool_calls?, finish_reason, latency_ms}` |
| POST | `/chats/:id/cancel` | — | `{ok, was_streaming}` |

The blocking call holds the HTTP connection open until the assistant message completes (default timeout 5min).

### Catalog and selection

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/catalog/models` | — | `{models: [...]}` |
| GET | `/catalog/toolkits` | — | `{toolkits: [...]}` |
| GET | `/catalog/characters` | — | `{characters: [...]}` |
| POST | `/chats/:id/model` | `{model_id}` | `{ok, model_id}` |
| POST | `/chats/:id/toolkits` | `{toolkit_ids: [...]}` | `{ok}` (override, not delta) |
| POST | `/chats/:id/character` | `{character_id\|null}` | `{ok}` |

### Errors

| Status | Code | Meaning |
|---|---|---|
| 400 | `invalid_payload` / `invalid_json` | Bad body |
| 404 | `chat_not_found` / `not_found` | Unknown id/route |
| 408 | `ipc_timeout` | Renderer didn't respond |
| 409 | `no_handler` / `chat_not_active` | Command unregistered or chat not active |
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

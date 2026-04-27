---
name: pupu-test-api
description: "Use when running QA / regression tests against PuPu, when verifying a code change actually works in the running app, or when reading PuPu UI/state without screenshotting manually. Triggers on tasks like \"test that PuPu still creates chats correctly\", \"verify the new model selector works end-to-end\", \"send a message and check the response\", \"what's PuPu's current state?\". Phase 1 covers chat lifecycle, message send (blocking), model/toolkit/character switching, logs, state snapshot, screenshot, eval."
---

# PuPu Test API — Skill

A local HTTP REST endpoint on PuPu (dev mode only, bound to `127.0.0.1`) that lets you drive PuPu like a human: create chats, switch models, send messages, read state, take screenshots. Use it to verify your code changes actually behave correctly in the running app.

## When to use

- After making code changes that touch chat creation, message send, model selection, toolkits, characters, or any chat-related path — run a quick regression to confirm the happy path still works
- When debugging "the UI is wrong" — pull `/v1/debug/state` to see what the app thinks vs. what it shows
- When debugging "why didn't X happen" — pull `/v1/debug/logs` to see renderer console + main stdout (Flask logs are Phase 2)
- When you need to demonstrate a fix to the user with a real screenshot

## Pre-flight check

Before invoking the API, confirm PuPu is running in dev mode:

```bash
ls "$HOME/Library/Application Support/pupu/test-api-port" && cat "$HOME/Library/Application Support/pupu/test-api-port"
```

Expected: a JSON `{port, pid, started_at}`. If the file is missing, ask the user to run `npm start` in the PuPu repo. If the file exists but `pid` references a dead process, ask the user to restart PuPu.

## How to call

### Quick path: curl

```bash
PORT=$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.env.HOME + '/Library/Application Support/pupu/test-api-port')).port)")
BASE="http://127.0.0.1:$PORT/v1"

# Always retry 503 not_ready a couple times — it just means renderer is still initializing
for i in 1 2 3; do
  S=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/debug/state")
  [ "$S" = "200" ] && break
  sleep 0.3
done
```

### Better path: use the helper

`scripts/test-api/client.mjs` does port discovery + 503 retry for you:

```bash
node -e "import('./scripts/test-api/client.mjs').then(({client}) => client.GET('/debug/state').then(s => console.log(JSON.stringify(s, null, 2))))"
```

For a complete end-to-end smoke (create chat → send → screenshot → cleanup), run the bundled script:

```bash
node scripts/test-api/smoke.mjs
```

## Common recipes

### 1. Verify a code change didn't break message send

```bash
node -e "
import('./scripts/test-api/client.mjs').then(async ({client}) => {
  const {models} = await client.GET('/catalog/models');
  const {chat_id} = await client.POST('/chats', {title: 'regression', model: models[0].id});
  const reply = await client.POST(\`/chats/\${chat_id}/messages\`, {text: 'Reply with the word OK and nothing else.'});
  console.log('reply:', reply.content);
  await client.DELETE(\`/chats/\${chat_id}\`);
})"
```

### 2. Read renderer logs after a manual UI action

```bash
node -e "import('./scripts/test-api/client.mjs').then(({client}) => client.GET('/debug/logs?source=renderer&n=50').then(r => r.entries.forEach(e => console.log(\`[\${e.level}] \${e.msg}\`))))"
```

Pass `?since=<ts_ms>` for incremental polling — keep the timestamp of the last entry you saw and ask for `since=that_ts`.

### 3. Snapshot UI state to debug a "why isn't this working" question

```bash
node -e "import('./scripts/test-api/client.mjs').then(({client}) => client.GET('/debug/state').then(s => console.log(JSON.stringify(s, null, 2))))"
```

The snapshot tells you: `active_chat_id`, `current_model`, `toolkits_active`, `character_id`, `modal_open`, `is_streaming`, `route`. Compare against expected before assuming the bug is elsewhere.

### 4. Take a screenshot for visual confirmation

```bash
node -e "import('./scripts/test-api/client.mjs').then(async ({client}) => { const png = await client.request('GET', '/debug/screenshot'); require('fs').writeFileSync('/tmp/pupu.png', Buffer.from(png)); })"
```

Then `Read` the file at `/tmp/pupu.png` to view it.

### 5. Last-mile escape hatch: arbitrary JS

```bash
node -e "import('./scripts/test-api/client.mjs').then(({client}) => client.POST('/debug/eval', {code: 'document.title', await: false}).then(r => console.log(r)))"
```

Use only when no dedicated endpoint covers the case. Result must be JSON-serializable.

## Endpoint cheatsheet

| Verb | Path | Purpose |
|---|---|---|
| POST | `/v1/chats` | Create chat (auto-activates) |
| GET | `/v1/chats` | List |
| GET | `/v1/chats/:id` | Detail with messages |
| POST | `/v1/chats/:id/activate` | Switch active without sending |
| PATCH | `/v1/chats/:id` | Rename |
| DELETE | `/v1/chats/:id` | Delete |
| POST | `/v1/chats/:id/messages` | Send (blocks until done, max 5min) |
| POST | `/v1/chats/:id/cancel` | Abort current stream |
| GET | `/v1/catalog/{models,toolkits,characters}` | List |
| POST | `/v1/chats/:id/{model,toolkits,character}` | Set per-chat |
| GET | `/v1/debug/state` | UI state snapshot |
| GET | `/v1/debug/logs` | Logs (renderer/main) |
| GET | `/v1/debug/screenshot` | PNG/JPEG of focused window |
| POST | `/v1/debug/eval` | Run JS in renderer |
| GET | `/v1/debug/dom` | outerHTML of selector |

Full reference: `docs/api-reference/test-api.md` and `docs/api-reference/test-api-debug.md`.

## Don'ts

- **Don't** use this against a packaged production build — the server is not started in `NODE_ENV=production`. Check the port file first.
- **Don't** assume `chat_id` = `nodeId`. Always use the chat_id returned by `POST /chats`.
- **Don't** call `sendMessage` on a chat that isn't currently active. The message handler is component-source and follows last-mount-wins (the latest mounted `ChatInterface` registers it). Call `POST /chats/:id/activate` first if you're switching chats.
- **Don't** poll `/debug/state` in a tight loop — it's cheap but not free; 200ms is plenty.
- **Don't** rely on logs `n` defaulting to 200 covering everything — for long sessions use `since=<ts>` for incremental fetch.

## Error decoder

| Status | Meaning | Fix |
|---|---|---|
| 503 `not_ready` | Renderer test bridge hasn't called `markReady()` yet | Retry a few times with 200ms sleep |
| 503 `no_window` | No focused PuPu window for screenshot/eval | Have the user click the PuPu window |
| 409 `no_handler` | Command isn't registered (likely component-source not mounted) | For `sendMessage`: are we on the chat page? Activate a chat first |
| 408 `ipc_timeout` | Renderer handler too slow or hung | Check `/debug/logs?source=renderer` for errors; default 30s, message send 5min |
| 404 `chat_not_found` | Chat id doesn't exist | List with `GET /chats` |
| 400 `invalid_payload` | Validator failed (e.g., missing `body.text`) | Read the message — it tells you what was missing |

## Phase 2 (not yet available)

- `stream=true` on `/chats/:id/messages` for SSE token-by-token streaming
- `?source=flask` on `/debug/logs` (Python sidecar)
- `GET /v1` capability discovery
- Settings/system-prompt/import-export operations
- Multi-window keyed handler routing

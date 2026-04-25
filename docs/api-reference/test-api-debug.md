# Test API — Debug Endpoints

All under `/v1/debug/*`.

## GET `/debug/state`

Returns a structured snapshot of renderer state. Optional `?chat_id=` to scope (currently unused — always returns active chat snapshot).

```json
{
  "active_chat_id": "chat-...",
  "active_chat": {
    "id": "chat-...",
    "title": "...",
    "model": "...",
    "message_count": 3,
    "last_message_role": "assistant"
  },
  "current_model": "gpt-5",
  "toolkits_active": ["tk1"],
  "character_id": null,
  "modal_open": ["toolkit-modal"],
  "is_streaming": false,
  "route": "#/chat",
  "window_state": {"width": 1280, "height": 800, "isDark": true, "locale": "en"},
  "catalog_loaded": {"models": 5, "toolkits": 3, "characters": 2}
}
```

## GET `/debug/logs`

Query params:
- `source=renderer|main` (default: renderer)
- `n=200` (max entries)
- `since=<ts ms>` (exclusive — returns entries with `ts > since`; for incremental polling)

```json
{
  "entries": [
    {"ts": 1714000000000, "level": "log", "source": "renderer", "msg": "..."}
  ]
}
```

`renderer` source captures all `console.log/info/warn/error`, `window.error`, and `unhandledrejection` events.
`main` source captures all writes to `process.stdout` (level `log`) and `process.stderr` (level `error`).

Phase 2 will add `source=flask` for the Python sidecar.

## GET `/debug/screenshot`

Captures the currently focused PuPu window.

Query params:
- `format=png|jpeg` (default: png)
- `quality=<0-100>` (jpeg only; default 80)

Returns binary image with `Content-Type: image/png` or `image/jpeg`.

## POST `/debug/eval`

Run arbitrary JavaScript inside the renderer. Useful for last-mile debugging or automating UI patterns.

Body:
```json
{
  "code": "return document.title",
  "await": false
}
```

- `code` must be ≤ 64KB
- `await: true` (default) wraps as `(async () => { <code> })()` — use `return` inside
- `await: false` wraps as `(() => { return (<code>); })()` — `code` is an expression
- Result must be JSON-serializable (DOM nodes will fail; use `el.outerHTML`)

```bash
curl -s -X POST $BASE/debug/eval \
  -H 'content-type: application/json' \
  -d '{"code":"document.title","await":false}'
# => {"ok": true, "value": "PuPu"}
```

On error:
```json
{"ok": false, "error": {"message": "...", "stack": "..."}}
```

## GET `/debug/dom`

Convenience wrapper for `eval`. Returns the `outerHTML` of a single element matching the selector.

Query: `selector=` (default: `body`)

```bash
curl -s $BASE/debug/dom?selector=.chat-input | jq
# => {"html": "<div class=\"chat-input\">...</div>"}
```

Returns `{"html": null}` if no element matches.

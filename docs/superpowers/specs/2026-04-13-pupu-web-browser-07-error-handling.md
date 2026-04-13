# PuPu Web Browser — 07 · Error Handling & Graceful Degradation

**Date:** 2026-04-13
**Part of:** [2026-04-13 PuPu Web Browser Design](./2026-04-13-pupu-web-browser-01-overview.md)

---

## 7.1 · Error Taxonomy

| Layer | Error type | Frequency | Scope | Strategy |
|---|---|---|---|---|
| Webview | Page crash (`render-process-gone`) | Medium | Single tab | Show crash page + Reload |
| Webview | Network failure (`did-fail-load`) | High | Single tab | Show built-in error page |
| Webview | Certificate error | Low | Single tab | Block + warn + "Continue anyway" |
| Webview | Unresponsive (`unresponsive`) | Low | Single tab | 3s grace → Kill & Reload prompt |
| CDP | Attach failure | Low | Single tab's agent capability | Disable agent tools + notify |
| CDP | Command timeout | Medium | Single tool call | Return failure; let the model retry |
| Agent tool | Selector not found | High | Single tool call | Detailed error + alternatives (see § 4.4) |
| Agent tool | Cross-origin blocked | Medium | Single tool call | Error + requires user confirm |
| Cookie import | See § 5.3 | — | Feature-level | See § 5.3 |
| Persistence | SQLite write failure | Very low | Data-loss risk | Exponential backoff + memory fallback |
| State | Schema version mismatch | Low | Single chat's browser state | Discard + reset |

## 7.2 · Webview Crash & Recovery

On `<webview>` firing `crashed` or `render-process-gone`:

1. Mark the tab: `runtime.lastError = { type: 'crashed', reason }`
2. **Do not destroy** the webview DOM node. Overlay it with:
   ```
   ┌─────────────────────────────┐
   │                             │
   │     😵 This tab crashed     │
   │                             │
   │        [Reload]             │
   │        [Close tab]          │
   │                             │
   └─────────────────────────────┘
   ```
3. Reload calls `webview.reload()`. After 3 consecutive failures, disable the Reload button and recommend Close.
4. **If the active tab crashes during agent execution**, the agent's tool call returns `{ok: false, reason: "webview_crashed"}`. The model can choose to retry (e.g., `wait_for` + `navigate`) or report to the user.

### Unresponsive (`unresponsive` event)

- 3 seconds of grace (the page may be running heavy logic)
- After 3 s: overlay with "This page isn't responding. [Wait] [Force Reload]"
- In agent mode, auto-waits 10 s then force-reloads (so the agent's rhythm isn't broken by prompts)

## 7.3 · Network Errors (`did-fail-load`)

**Built-in error page, not Chromium's default:**

```
┌─────────────────────────────┐
│  Can't reach example.com    │
│                             │
│  ERR_NAME_NOT_RESOLVED      │
│                             │
│  [Try again]                │
└─────────────────────────────┘
```

- The error page is rendered via `about:blank` + `executeJavaScript` injection. No remote HTML is loaded.
- In agent mode the error page is **not** displayed; the tool returns an error directly so the model can decide what to do.

### Ignored error codes

- `-3` (`ERR_ABORTED`) — user-initiated cancellation, not an error
- `-20` (`ERR_BLOCKED_BY_CLIENT`) — adblock/extension blocked, not an error

## 7.4 · Certificate Errors

`certificate-error` event:
- **Blocked by default.** Show a warning page: "This site's certificate is not trusted"
- "Continue anyway" calls `event.preventDefault()` and records the decision to an **in-memory session allowlist** (cleared on PuPu quit)
- **Agent mode is forbidden from auto-bypassing.** The tool returns `{ok: false, reason: "cert_error", url}`, and the user must manually click Continue. This is a hard security boundary — the model must not talk itself around it.

## 7.5 · CDP Layer Errors

### Attach failure

- Usually the webview isn't ready yet. Retry 3 times at 500 ms intervals.
- On final failure: mark the tab `agentCapable = false`. UrlBar shows an "Agent unavailable" icon.
- Clicking the icon shows the reason; the user can Reload to retry attach.

### Command timeout (default 15 s)

- `browser_wait_for` uses the caller-supplied `timeout_ms`
- All other commands default to 15 s
- On timeout: `{ok: false, reason: "cdp_timeout", command, elapsed_ms}`
- The model is told in its prompt that on timeout, it may retry or call `browser_screenshot` to diagnose

### CDP disconnection (usually a side effect of webview crash)

- Listen to `debugger.on('detach', ...)`
- Attempt re-attach automatically; give up and disable agent capability on repeated failure
- Does not affect the user's ability to browse manually

## 7.6 · Agent Tool Failure Return Contract

**All `browser_*` tools return a unified structure on failure:**

```ts
{
  ok: false,
  reason: "selector_not_found" | "timeout" | "cross_origin_blocked"
        | "cert_error" | "webview_crashed" | "cdp_timeout"
        | "element_not_clickable" | "permission_denied" | ...,
  details: string,        // human-readable
  recoverable: boolean,   // should the model retry?
  suggestions?: string[], // optional: recommended next action
  screenshot?: string,    // optional: base64 page screenshot at failure
}
```

### Key principle: failures ship a screenshot

Agent models can't see the screen, but a screenshot lets them "see" where they got stuck. This is core to whether agent-browser can recover from mistakes.

### Screenshot strategy

- `selector_not_found`: auto-attach screenshot (high value)
- `timeout`: auto-attach screenshot (high value)
- Success: no screenshot (too noisy, burns context)
- Compression: JPEG quality 60, max 1280 px width → single image stays under 100 KB

## 7.7 · Persistence Errors

### SQLite write failure (disk full / permission / file corruption)

- Exponential backoff retry: 1s, 2s, 4s, 8s (4 attempts total)
- All failed → mark `persistenceBroken = true` in memory
- Top banner: "Browser state can't be saved right now. Tabs will be lost on quit."
- **Does not block usage**; a fresh start after restart

### SQLite corruption on startup read

- Attempt a `vacuum` repair once
- On failure: back up the corrupted file to `browser_tabs.db.corrupted.${timestamp}` and rebuild an empty DB
- All chats' browser state is lost (but chats themselves are unaffected)
- Toast notice on next launch

## 7.8 · Schema Version Mismatch

- On startup, if a chat's `browser_tabs.state_json` has `schema_ver > current supported`:
  - Skip and log warning
  - That chat starts in browser mode with an empty tab list; user re-creates
- **No downgrade attempt** — we do not try to best-effort-parse a future version

## 7.9 · Global Degradation Mode

**Scenarios where browser mode is fully unavailable:**

1. Startup detects `<webview>` tag disabled (Electron config issue)
2. Critical IPC handler unregistered (main process `session_manager` crashed)

### Fallback

- The `attach_panel` globe icon **stays visible but disabled**. Tooltip: "Browser unavailable: <reason>"
- We do **not** hide the button — avoids the "feature just vanished" user confusion
- Log to console + write an error marker to `userData/browser_init_error.log`

## 7.10 · Explicitly Not Doing

- ❌ Auto network retry (we do not silently retry offline; user clicks Reload)
- ❌ Global error toast center (PuPu doesn't have one; we do not add one for this feature)
- ❌ DevTools panel (possible later, not gating the initial ship)
- ❌ Crash report upload (PuPu ships with none; we won't introduce it here)

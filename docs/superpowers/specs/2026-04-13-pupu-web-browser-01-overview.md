# PuPu Web Browser — 01 · Overview & Architecture

**Date:** 2026-04-13
**Status:** Design approved, pending implementation plan
**Related:**
- [02 · UI/UX](./2026-04-13-pupu-web-browser-02-ui-ux.md)
- [03 · Data Model](./2026-04-13-pupu-web-browser-03-data-model.md)
- [04 · Agent Tools](./2026-04-13-pupu-web-browser-04-agent-tools.md)
- [05 · Cookie Import](./2026-04-13-pupu-web-browser-05-cookie-import.md)
- [06 · State Management](./2026-04-13-pupu-web-browser-06-state-management.md)
- [07 · Error Handling](./2026-04-13-pupu-web-browser-07-error-handling.md)
- [08 · Phasing](./2026-04-13-pupu-web-browser-08-phasing.md)

---

## Feature Name

**PuPu Browser Mode** — a per-chat embedded web browser workspace with full agent control.

## Confirmed Decisions

| Decision | Choice |
|---|---|
| Layout | Edge-docked glass column (variant B'), three snap states: ribbon / column / full |
| Tabs scope | Per-chat, fully persisted (URL, scrollY, session) |
| Agent capability | Full read + control (C tier, agentic browser) |
| Confirmation model | Risk-based tiering (L0 auto / L1 auto-with-pause / L2 confirm / L3 hard confirm) |
| Cookies | Global shared jar + one-time import from Chrome (variant B + D1) |
| Entry/exit point | `chat-input` attach panel globe icon; same position toggles back |

## Architecture

```
┌─────────────────────────────────────────────┐
│  React UI Layer                             │
│  ├── BrowserWorkspace (new page-level)      │
│  │   ├── UrlBar + TabBar                    │
│  │   ├── WebviewHost (<webview> per tab)    │
│  │   └── ChatGlassColumn (B' edge column)   │
│  └── ChatInput.globe toggle                 │
├─────────────────────────────────────────────┤
│  State Layer                                │
│  ├── browser_store (new) — per-chat tabs    │
│  │   persisted via existing chat_storage    │
│  └── reuses chat_storage_store (msgs/draft) │
├─────────────────────────────────────────────┤
│  Agent Tool Layer                           │
│  ├── browser_tools.js (new) — exposes       │
│  │   navigate/click/fill/read/... to unchain│
│  └── reuses use_tool_confirmation (tiered)  │
├─────────────────────────────────────────────┤
│  Electron Main Process                      │
│  ├── BrowserSessionManager                  │
│  │   ├── Global partition: "persist:pupu-br"│
│  │   ├── cookie importer (chrome-cookies-secure)│
│  │   └── webContents control (CDP)          │
│  └── IPC: browser:* channels                │
└─────────────────────────────────────────────┘
```

## Technology Choices

- **Webview: Electron `<webview>` tag** (not BrowserView, not iframe)
  - Supports persistent partition (cookie sharing), per-instance processes, embeds in React tree, supports DnD reordering in DOM
  - BrowserView is faster but detached from DOM — no glass column overlay or DnD animation
  - iframe blocked by same-origin policy on most sites
- **Agent control: Chrome DevTools Protocol (CDP)**
  - Electron's `webContents.debugger.attach("1.3")` exposes CDP directly
  - No Playwright (too heavy, bundles a browser binary)
  - Tool layer wraps CDP commands as high-level actions (click by selector, fill, read_text)
- **Cookie import: `chrome-cookies-secure` npm package**
  - Handles macOS Keychain decryption
  - Runs in main process; silent fallback on failure (non-critical path)

## New Files

```
src/PAGEs/browser/browser_workspace.js
src/PAGEs/browser/hooks/use_browser_tabs.js
src/COMPONENTs/browser/url_bar.js
src/COMPONENTs/browser/tab_bar.js
src/COMPONENTs/browser/webview_host.js
src/COMPONENTs/browser/chat_glass_column.js
src/SERVICEs/browser_storage/browser_store.js
src/SERVICEs/agent_tools/browser_tools.js
electron/browser/session_manager.js
electron/browser/cdp_controller.js
electron/browser/chrome_cookie_importer.js
```

## Integration Points with Existing Code

1. `src/COMPONENTs/chat-input/components/attach_panel.js` — add globe icon
2. `src/PAGEs/chat/chat.js` — introduce browser-mode view state
3. `src/SERVICEs/chat_storage/chat_storage_store.js` — separate browser store (not an extension of this one — see state-management rationale)
4. `src/PAGEs/chat/hooks/use_tool_confirmation.js` — register risk tiers for `browser_*` tools
5. `unchain_runtime` tool registry — register browser tool set (scoped to browser-mode only)

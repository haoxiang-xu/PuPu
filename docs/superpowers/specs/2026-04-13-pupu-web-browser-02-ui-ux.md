# PuPu Web Browser — 02 · UI/UX Specification

**Date:** 2026-04-13
**Part of:** [2026-04-13 PuPu Web Browser Design](./2026-04-13-pupu-web-browser-01-overview.md)

---

## 2.1 · Overall Layout

```
┌─────────────────────────────────────────────────────────────┐
│  [◀]  [▶]  [↻]  │ https://example.com        │     [ + ]    │  ← UrlBar (48px)
├─────────────────────────────────────────────────────────────┤
│  ● example.com   ● github.com   ● hf.co       ...           │  ← TabBar (36px)
├─────────────────────────────────────────────────────┬───────┤
│                                                     │       │
│                                                     │ glass │
│                                                     │ column│
│          <webview src="current tab">                │       │
│                                                     │ (B')  │
│                                                     │       │
│                                                     │       │
└─────────────────────────────────────────────────────┴───────┘
```

- **UrlBar** pinned to top, Safari-style: minimal back/forward/reload on the left, URL input centered, "+" on the right
- **TabBar** sits below UrlBar, horizontally scrollable when overflowing
- **WebviewHost** occupies the remaining area. Only one `<webview>` is visible at a time; others are `display:none` to preserve their process state (not destroyed)
- **ChatGlassColumn** docks to the right edge with three width snap points

## 2.2 · ChatGlassColumn — Three Snap States

| State | Width | Content | Trigger |
|---|---|---|---|
| **Ribbon** | 12px | Pure glass strip; right side shows status dots: unread pulse, agent activity, tool confirmation red dot | Default; click ribbon to expand |
| **Column** | 380px | Full chat: message list + input + attach panel (includes globe back button); webview auto-shrinks to `calc(100% - 380px)` | Click ribbon / `Cmd+J` |
| **Full** | 100% | Takes over the screen entirely; webview becomes a blurred background; chat fills the viewport | From Column, click expand / `Cmd+Shift+J` |

### Critical Interactions

- Transitioning between Ribbon and Column does **not** reload the webview — width/transform CSS only
- In Full mode, webview is not destroyed; it renders as background with `filter: blur(20px) brightness(0.6)`
- In Ribbon state, new chat messages trigger a subtle pulse but do **not** force-expand
- `Esc` steps down: Full → Column → Ribbon

### Critical Constraint

**Webview cannot live inside a `transform` or `filter` ancestor** — Chromium has compositing restrictions for `<webview>`. Solution: webview is a **fixed-positioned** direct child; `ChatGlassColumn` is a separate fixed child overlaying on top — not nested.

## 2.3 · Glass Style Spec

```css
.glass-surface {
  background: color-mix(in srgb, var(--bg-color) 60%, transparent);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid color-mix(in srgb, var(--border-color) 40%, transparent);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
}
```

### Where it applies

- UrlBar (translucent top strip)
- TabBar — **merged into the same glass surface as UrlBar** to avoid stacking two `backdrop-filter` layers
- ChatGlassColumn (entire column)
- **Not applied to** webview content (webview renders itself)

### Performance Note

Chromium charges a compositor layer cost per `backdrop-filter`. **Browser mode must use at most 2 backdrop-filter layers** (top UrlBar+TabBar merged + ChatGlassColumn). More than 2 causes visible jank.

## 2.4 · Enter / Exit Animation

- **Enter:** click globe → chat page scales to 0.95 + fades to opacity 0 → browser workspace scales from 1.05 → 1 and fades in (250 ms ease-out)
- **Exit:** globe lives inside the chat-input attach panel in Column mode (different physical position from entry, but the same semantic — "toggle back") → reversed animation
- Transition duration 250 ms; webview state is preserved (no reload)

## 2.5 · Empty State / New Chat

- First time entering browser mode in a new chat: one blank "new tab", URL bar auto-focused, with a placeholder hint
- No auto-load homepage; no bookmark system (YAGNI)

## 2.6 · Accessibility

- Full keyboard reachability. `Cmd+T` is explicitly rejected (the user decided to use the "+" button only), but `Tab` cycles focus between UrlBar → TabBar → webview → GlassColumn
- Focus handoff between webview and React is managed by `<webview>` blur/focus events

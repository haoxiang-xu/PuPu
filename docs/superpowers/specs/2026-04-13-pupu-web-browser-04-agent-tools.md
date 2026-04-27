# PuPu Web Browser — 04 · Agent Tool Surface

**Date:** 2026-04-13
**Part of:** [2026-04-13 PuPu Web Browser Design](./2026-04-13-pupu-web-browser-01-overview.md)

---

## 4.1 · Design Principles

1. **Granularity matters.** Too coarse (e.g. `browser_do_task`) lets the model black-box random things; too fine (e.g. `browser_press_key`) makes simple tasks cost 20 tool calls.
2. **All tools act on the current active tab.** They do not accept a `tab_id` parameter (except tab-management tools). This shrinks the error surface.
3. **Read tools return structured data** (JSON). **Control tools return status** (ok/failure + new URL/title).
4. **All tools use the `browser_*` prefix** — consistent with unchain's tool registry convention; makes risk-tiering and confirmation filtering trivial.

## 4.2 · Tool Catalog

### Navigation — Read Tier (L0, auto-execute)

| Tool | Params | Returns | Notes |
|---|---|---|---|
| `browser_get_state` | — | `{url, title, tabs: [{id, url, title}], active_tab_id}` | Lets the model know where it is and what tabs exist |
| `browser_read_page` | `{mode: "text" \| "markdown" \| "structured"}` | `{content: string, truncated: bool}` | `text` = innerText; `markdown` = Readability + turndown; `structured` = JSON tree of headings/links/forms |
| `browser_screenshot` | `{full_page: bool}` | `{image: base64, width, height}` | Defaults to viewport; optional full page |
| `browser_query_selector` | `{selector, all: bool}` | `{elements: [{selector, text, visible, bounds}]}` | Find elements; returns stable `PupuSel` (see 4.4) |

### Control — Write Tier (L1/L2, requires confirmation)

| Tool | Params | Risk | Returns |
|---|---|---|---|
| `browser_navigate` | `{url}` | **L1** (→ **L2** on cross-origin) | `{ok, new_url, title}` |
| `browser_click` | `{selector}` | **L1** | `{ok, new_url_if_changed}` |
| `browser_type` | `{selector, text, submit: bool}` | **L1** (→ **L2** if `submit=true`) | `{ok}` |
| `browser_fill_form` | `{fields: [{selector, value}]}` | **L2** | `{ok, filled: n}` |
| `browser_scroll` | `{direction: "up" \| "down" \| "to", amount?, selector?}` | **L0** (auto) | `{ok, scroll_y}` |
| `browser_wait_for` | `{selector?, text?, timeout_ms}` | **L0** | `{ok, reason}` |
| `browser_back` / `browser_forward` | — | **L1** | `{ok, new_url}` |

### Tab Management

| Tool | Params | Risk | Returns |
|---|---|---|---|
| `browser_new_tab` | `{url?}` | **L1** | `{tab_id, url}` |
| `browser_switch_tab` | `{tab_id}` | **L0** | `{ok, url, title}` |
| `browser_close_tab` | `{tab_id}` | **L1** | `{ok}` |

### Special: Sensitive-field Detection (forced L3)

| Condition | Rule |
|---|---|
| `browser_type` targets `input[type=password]` | Forced to **L3** (preview with password warning) |
| `browser_type` target field name matches `cc\|card\|cvv\|ssn\|iban` | Forced to **L3** |
| `browser_click` target text matches `delete\|remove\|confirm.*purchase\|pay\|subscribe` | Forced to **L3** (with element-text preview) |
| Cross-origin `browser_navigate` (e.g. github.com → unknown domain) | Elevated to **L2** |

## 4.3 · Risk Tiering (L0/L1/L2/L3) and `use_tool_confirmation` Integration

| Level | Semantics | UI behavior |
|---|---|---|
| **L0** | Read-only or no state mutation | Silent execution; collapsed call card in the chat |
| **L1** | Mutates current page but does not submit or cross-origin | Default: auto-execute. Session-level "pause after each" toggle (default off). |
| **L2** | Submits data, cross-site navigation, or fills forms | Always requires confirmation. Shows action summary + URL preview. |
| **L3** | Involves credentials / money / irreversible operations | Always confirmed. **Must** show the specific content to be typed/clicked. Requires explicit "Allow once". |

### Integration with Existing `use_tool_confirmation`

- `use_tool_confirmation.js` already provides per-tool confirmation flow. We add a `getRiskLevel(toolName, params)` hook at tool registration time.
- Browser tools ship a dedicated `browser_tool_risk.js` module that implements the rules above as pure functions.
- The confirmation UI reuses the existing `ToolConfirmationPanel`, with a specialized browser-tool renderer that displays the **target element's screenshot with a highlight box** (via CDP `DOM.getBoxModel` + `Page.captureScreenshot` with a clip region).

## 4.4 · Selector Strategy — How Agents Stably Locate Elements

This is one of the hardest problems in agent-driven browsing. Our approach:

1. **`browser_read_page` and `browser_query_selector` generate a stable `PupuSel` for every element.**
   - Priority: `[data-testid]` > `[id]` > `[name]` > readable text content (`text=...`) > CSS path
   - We do **not** expose raw CSS paths to the model (brittle). The model uses `PupuSel` strings.
2. **All `selector` parameters accept `PupuSel` format** and the runtime maps back to real DOM nodes.
3. **On failure, return detailed error with alternatives:** `{ok: false, reason: "selector_not_found", alternatives: [...]}`. This gives the model a chance to retry with an alternative.

## 4.5 · CDP Implementation Notes

- Each webview gets `webContents.debugger.attach("1.3")` to attach CDP.
- Common command wrappers:
  - `browser_click` → `DOM.resolveNode` + `Runtime.callFunctionOn(el.click())` (not `Input.dispatchMouseEvent` — coordinates are too fragile)
  - `browser_type` → `DOM.focus` + `Input.insertText` (more stable than dispatching key events one by one)
  - `browser_read_page` → `Runtime.evaluate` running bundled Readability.js
- **CDP attach side-effect:** Chromium shows a "DevTools is being used on this page" warning strip. We can either suppress it via `webContents.setDevToolsWebContents`, or accept it as a visual cue that "this is agent mode" (which is arguably a feature).

## 4.6 · Tool Registration in unchain

- New file: `src/SERVICEs/agent_tools/browser_tools.js`
- Follows PuPu's existing unchain tool registration pattern — one file exports both tool definitions and implementations.
- `browser_*` tools are **only registered when browser mode is active.** Leaving browser mode unregisters them. This prevents the model from calling them in a plain chat context by mistake.

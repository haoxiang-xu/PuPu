---
name: computer-use-chat-entry
description: The chat "Computer" toolkit entry is synthetic (builtin.computer, outside the MCP catalog), lives in chat-input, and gates on getComputerUseStatus
metadata:
  type: project
---

The per-chat "Computer" toolkit menu entry (Gate B last-mile, branch
feat/cu-attach-toolkit, commit 5977c2d 2026-07-18).

Facts worth remembering (non-obvious):

- **It is synthetic.** `builtin.computer` is NOT in the MCP toolkit catalog.
  It is appended to the tools Select options in
  `src/COMPONENTs/chat-input/components/attach_panel.js` AFTER
  `build_toolkit_options`, so it never flows through the catalog-render path.
  Builder + capability-match logic: `chat-input/utils/computer_use_toolkit_option.js`;
  status read + reactive option: `chat-input/hooks/use_computer_use_toolkit_option.js`.
  Selecting it just rides the existing `selectedToolkits` payload — the sidecar
  funnel flag is server-authoritative, so a residual `builtin.computer` in a
  session's toolkits when the master switch is off is harmless (no frontend
  cleanup needed).

- **Surface boundary:** this feature lives in `chat-input/` which is
  **pupu-dev-chat-core's** surface, even though the synthetic-entry concept is
  toolkit-domain. It was dispatched to toolkit dev; chat-core should be looped
  in on future edits there. Catalog entry data stays with mcp-store-curator
  (N/A here — synthetic); tool-call semantics stay with pupu-llm-expert.

- **Facade gotcha:** `runtimeBridge.getComputerUseStatus`
  (`src/SERVICEs/bridges/unchain_bridge.js`, exposed as `api.runtime`)
  NORMALIZES the sidecar payload and DROPS unknown fields. Any new status
  field must be added to that normalization or it never reaches the renderer.
  Added `supportedModelPrefixes` (from sidecar `supported_model_prefixes`);
  capability = provider-stripped model id `.startsWith` any prefix; empty /
  missing list ⇒ unsupported ⇒ entry greyed. This facade is a shared artery
  (CTO-gated) — the passthrough was additive and coordinated with the parallel
  backend slice feat/cu-attach-backend that emits the field.

- **Reconcile (chat-core review SHOULD-FIX, commit 41a7cb3):** a disabled
  Select option can't be unchecked (BUILTIN `use_select.select_option`
  early-returns on `disabled` — do NOT touch that shared primitive). So when
  the entry becomes unselectable (switch off / bridge unavailable / model
  unsupported), the hook exposes `shouldDeselectComputer` and AttachPanel
  strips `builtin.computer` via the normal `onToolkitsChange` setter.
  **Invariant:** the hook's `resolution` is tri-state — `null` means
  UNKNOWN (initial load OR read error) and must NEVER strip; only a definitive
  answer reconciles. Stripping on the loading `null` would wrongly deselect a
  supported+enabled session on every mount. Read errors keep the prior
  resolution (no flicker, no strip over a transient sidecar hiccup).

**Why:** CEO wanted computer use attachable per-chat like any other tool;
chat-core flagged the stuck-disabled-selection wart in review.
**How to apply:** if reopening this, the entry is in chat-input not toolkit/;
to surface more sidecar status data in the UI, extend the facade normalization;
never reconcile on the unknown/loading state.

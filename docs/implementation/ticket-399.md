# Ticket #399 — Closed palette must not expose the Organize action

## Delivery identity

- Ticket: https://github.com/haoxiang-xu/PuPu/issues/399
- Workspace: `/Users/red/Desktop/GITRepo/pupu-399`
- Branch: `codex/ticket-399-organize-modal-hitbox`
- Base: `dev` at `38211377fb128a74698360357bc7f74c98e51b5d`
- Worker: `gpt-6-luna` for the bounded test-and-fix slice
- Reviewer: the strong parent agent at the single implementation checkpoint
- Start-phase rule: do not commit or push

## Goal and non-goals

Make the command palette's Organize Skill action impossible to hit while the palette is closed, including when a local model makes the visible Attach row narrower. Preserve the existing visible action and its focus-protecting mouse behavior when the palette is open.

Do not add or redesign UI. Do not change Attach-panel layout, model selection, organizer modal contents, animation timing, storage, IPC, the sidecar, or provider behavior.

## Reproduction and root cause

`ChatInput` always mounts `CommandPalettePanel` around `AttachPanel`. The palette keeps an absolutely positioned closed frame mounted for its morph animation. The frame sets `pointerEvents: on ? "auto" : "none"`, but the nested Organize wrapper always sets `pointerEvents: "auto"`. That descendant opts back into hit testing even under the closed parent, so an invisible button can receive a click. Its handler calls `ChatInput`'s `onOrganize`, which runs `setOrganizerOpen(true)`.

The local-model selection changes the visible model pill and Attach-row geometry, exposing the stale target beside the row. The model runtime is not part of the causal path.

## Code and impact evidence

- Edit `src/COMPONENTs/chat-input/components/command_palette_panel.js`, symbol `CommandPalettePanel`.
- Edit `src/COMPONENTs/chat-input/components/command_palette_panel.test.js`.
- Read-only references: `src/COMPONENTs/chat-input/chat_input.js` and `src/COMPONENTs/chat-input/components/attach_panel.js`.
- GitNexus index is current at the base commit. Upstream impact for `CommandPalettePanel` and `ChatInput` is `UNKNOWN` because callers were not resolved. Source search corroborates that `CommandPalettePanel` is imported by `ChatInput`; focused tests are the other references.
- Cross-boundary gate: `NOT_APPLICABLE`; the state and click remain inside one React tree.

## UI inventory and settled choice

- Attach panel: existing visible launch surface; no visual or interaction redesign.
- Command palette: existing morph and hint bar; only its closed hit-testing state changes.
- Skill Organizer modal: existing destination; no modal changes.

The project owner explicitly requested no new UI. No component needs alternative visual designs.

## Implementation slice and checkpoint

One bounded slice is authorized:

1. In `command_palette_panel.test.js`, add a regression that renders with `open={false}` and proves the Organize wrapper is not targetable. Retain or extend the open-state assertion so the wrapper becomes targetable after the double-`requestAnimationFrame` entrance latch and one explicit click calls `onOrganize` once.
2. Run the focused test before the product change and record the expected failure.
3. In `CommandPalettePanel`, make the Organize wrapper's `pointerEvents` depend on the same visible state `on`. Preserve the existing mousedown `preventDefault`/`stopPropagation`, DOM marker, layout, animation, and click handler.
4. Run the focused test after the fix. Stop at the checkpoint and report the diff, red-before-green result, deviations, and open questions. Do not commit or push.

The worker must stop if the regression cannot be expressed against the existing DOM contract, if fixing it requires changing layout/animation, or if another hidden action is discovered.

## Verification

- Focused: `npm test -- --watchAll=false --runInBand --testPathPattern=command_palette_panel.test.js`
- Reviewer follow-up: `npm test -- --watchAll=false --runInBand --testPathPattern="chat_input|attach_panel|command_palette_panel"`
- Manual acceptance remains for the user: local model selected, palette closed, repeated focus/click-away near Attach never opens the modal; type `/`, then the visible Organize action opens exactly one modal.

## Suitability assessment

**Suitable for a weaker implementation model.** The root cause is established, the edit is one state-coupled CSS property in one component, the regression surface is one existing focused test file, the visible behavior and non-goals are settled, and no architecture or boundary decision remains. `gpt-6-luna` receives only this bounded slice. A strong-model checkpoint reviews the actual diff and independently runs the related suite before the ticket can become implementation-ready.

## Checkpoint result — 2026-10-11

- Worker red evidence: the new closed-state assertion failed before the product change (`expected none`, `received auto`); 12 other focused tests passed.
- Worker green evidence: 13/13 focused tests passed after binding the wrapper to `on`.
- Strong review: **continue / implementation-ready**. The diff matches the settled repair, preserves the explicit open-state click and focus protection, and introduces no layout, animation, model, modal, persistence, IPC, or runtime change.
- Independent verification: 13/13 focused tests and 121/121 related ChatInput, Attach panel, attachment-focus, and command-palette tests passed. Existing asynchronous Icon `act(...)` warnings and pre-existing style warnings remain test noise; no test failed.
- Manual acceptance: the project owner exercised the exact #399 candidate in a running Electron instance with a local model selected and confirmed that repeated pointer interaction beside the Attach panel no longer opens the hidden Organize Skill modal. The explicit visible Organize action remains available. No local-model inference was invoked by the implementation agent.

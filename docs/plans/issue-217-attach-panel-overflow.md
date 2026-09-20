# Issue #217: attach panel widgets — overflow menu and user-defined order

Release parent: #203 (v0.1.11). Implemented on `dev` after d8662654; left
uncommitted for the project owner unless instructed otherwise. Renderer only;
no sidecar or Unchain change.

## Decisions (project owner, 2026-09-12)

Mockups: https://claude.ai/code/artifact/e1603d7f-92f8-4f9a-bf36-486cf0fe1b21
Chosen: option 1, arranging in place (drag inside the row, a tray for the
tucked widgets). Fixed: the model pill first, the queue segment last, the "…"
button at the end of the visible cluster; the six widgets between are
movable. With nothing tucked the row is unchanged and there is no "…" — so
arrange mode also opens from a right-click, a long press, or Shift+Enter on a
keyboard-highlighted widget.

## What changed

- `src/SERVICEs/attach_panel_layout.js` (new): the record
  `{version:1, order, hidden}` under settings namespace `attach_panel_layout`;
  `normalizeAttachPanelLayout`, `moveAttachWidget`, `setAttachWidgetHidden`,
  read / write / subscribe.
- `src/COMPONENTs/chat-input/hooks/use_attach_panel_layout.js` (new):
  `useSyncExternalStore` over the settings subscription.
- `attach_panel.js`: the movable widgets render through `renderRowWidget`
  in the user's order; the "…" button (BUILTIN `more` icon, Tooltip popover)
  lists tucked widgets via `renderMenuWidget` — tools and workspace render
  their Select in both forms with the form as `custom_trigger`, so their
  palette anchors to wherever it was opened from; the menu has its own open
  state (`moreOpen`) so it stays under a tucked palette. Keyboard: "…" is a
  stop; ↑/↓/Enter/Escape inside the menu. Arrange mode: `arrangeSlot`
  (dashed, inert, draggable), window pointer listeners, drop target from
  slot centres / the tray rect, `placeInRow` maps a visible index onto the
  record's order skipping unavailable widgets, every drop persisted; Done /
  Escape / outside click end it; ←/→, Shift+←/→, Enter on the keyboard with
  the highlight pinned to a widget across moves.
- `chat_input.js`: forwards `{shift}` to `handleKeyboardKey`.
- i18n (11 locales): `chat.attach.more`, `link`, `context_usage`, `arrange`,
  `done`.
- Docs: `docs/features/attach-panel-layout.md`, DEV_GUIDE index row.

## Boundary gate

- **BC-217 — persistence, CLOSED.** Producer: `writeAttachPanelLayout`
  (always normalized). Consumer: `readAttachPanelLayout` →
  `normalizeAttachPanelLayout`, the only reader. Canonical shape
  `{version: 1, order: string[], hidden: string[]}`; admission CLOSED —
  unknown ids dropped, repeats collapsed, `hidden ⊆ order`, missing ids
  appended in default order (forward compatibility for widgets added later),
  wrong version or malformed record → default. Transport: the settings
  repository's own namespace (SQLite `settings.db`, `localStorage`
  fallback), which preserves unknown namespaces verbatim, so no Electron
  change. Identity: namespace name + `version`.
- **SEQ-217.** Default → tuck `link` (write) → reorder (write) → restart
  (read → same row) → a widget becomes unavailable (skipped, slot kept) →
  it comes back (rendered in its slot) → settings reset (default). Restart
  is the persistence boundary; covered by the round-trip test plus the
  "written while open" subscription test (the same read path a restart
  uses).

| AC | Evidence | Status |
| --- | --- | --- |
| AC-217-1 move a widget between the row and the "…" menu; invoke it from either | `attach_panel.test.js` overflow suite: tucked widget in the menu, screenshot fires from the menu, tools palette opens from its menu row | PASS |
| AC-217-2 reorder | arrange suite: drag past neighbours reorders and persists; Shift+→ moves | PASS |
| AC-217-3 placement and order survive a restart | `attach_panel_layout.test.js` round-trip through the repository; the panel reads the record on mount | PASS |
| Unavailable widgets skipped in both places; no "…" when nothing available is tucked | overflow suite | PASS |
| Keyboard: "…" stop, menu ↑↓ Enter, arrange ←/→ Shift Enter Escape, Shift+Enter entry | overflow + arrange + entry-point suites | PASS |
| Entry points: right-click, long press (short press does not), Arrange… row | entry-point suite | PASS |
| In-app (test API, `openai:gpt-5.4`) | "…" menu → Arrange… → drag tools onto the tray (tray lights, ghost lifts) → drop tucks → drag attach out of the tray before screenshot → Done → row `[workspace, attach, screenshot]`, "…" lists the tucked one; screenshots `arrange-flow2.png` in the session scratchpad | PASS |
| A fresh install renders today's order with no "…" | overflow suite first test | PASS |

## Impact analysis

`AttachPanel` is UNKNOWN in the GitNexus graph (React components are not
resolvable); its two consumers are `chat_input.js` and the demo pages, found
by text search. `chat_input.js` change is one extra argument.
`useChatSessionState` / stream paths untouched. `detect-changes` run before
handing over.

## Verification

- Red before green for every suite: layout service (7), overflow menu (7),
  arrange mode (5), entry points (3).
- Renderer full suite: **390 suites, 4664 passed, 5 skipped**
  (`.release-qa/issue-217-js-tests-1.log`, before the entry-point work; see
  the final log named in the closing comment).
- Two CRA overlays during probing were my own eval scripts (a null slot);
  cleared by reload; not product.

### Addendum: iOS-style jiggle (owner feedback, 2026-09-12)

While arranging, every slot (row and tray) runs a 260 ms rotate ±1.6°
keyframe animation, each on its own phase (delay derived from the widget's
index), injected once into the document head (`data-pupu-attach-jiggle`);
the dragged ghost holds still and `prefers-reduced-motion` turns it off.
Tests: three cases in the jiggle suite (red before green). In-app: all four
slots report a running `pupu-attach-jiggle` animation with distinct delays.

### Addendum: Done geometry; drop gap instead of a line (owner feedback)

- Done is now a full `PILL_HEIGHT` (32px) pill like every other control, so
  its curve is concentric with the row (measured in-app: top 5px = 4px
  padding + 1px border, height 32, same as the model pill).
- The drop indicator line is gone. While dragging, the widget leaves the flow
  (a lifted ghost follows the pointer inside the widgets container) and one
  gap element per position grows to slot width at the drop index (the tray
  grows a trailing gap when hovered), with a 140 ms width transition. The
  target index is computed against a snapshot of slot centres and the tray
  rect taken at drag start — reading live positions would let the opening
  gap move the target it opened. Tests: "icons part to leave an empty slot",
  "hovering the tray opens a slot at its end", the jiggle suite's ghost case;
  attach panel suite 68 passing. In-app DOM check: gaps
  `closed:0, open:32, closed:0, closed:0` with the ghost present while
  dragging the first widget between the second and third.

### Addendum: no highlight on mouse entry; long press lifts into a drag (owner feedback)

- Mouse entries (Arrange…, right-click, long press) no longer highlight the
  first slot — that was the keyboard hover wash landing on index 0 and it
  read as "selected". Keyboard entry keeps its highlight; the first arrow key
  after a mouse entry lands on the first (→) or last (←) slot. Keys keep
  routing to the panel while arranging even with nothing highlighted.
- A long press now enters arrange mode with the pressed widget already in
  hand: the press location is remembered, arrange mode renders, and an
  effect starts the drag once the slots exist; the pointer that is still
  down carries on and drops it. Any press on a slot in arrange mode lifts
  the widget at once (iOS); a release in place writes nothing
  (`persistIfChanged`). Tests: two long-press/lift cases plus the updated
  keyboard case; attach panel suite 70 passing. In-app: long press on the
  first widget → arranging, ghost present, gap open at its origin, no
  highlight; the probe's own drop landed in the tray zone (8px past the last
  slot is the tray's threshold), which is the rule working, not a fault.
- The owner's live layout was reset to the default afterwards (all widgets
  in the row, default order).

### Addendum: drag targets follow a moving panel (owner feedback)

Reported: from an inactive composer, long-press → drag onto the tray did not
take. Measured in-app: arrange mode marks the panel keyboard-active, which
makes the composer active and floats the row up (y 211.8 → 169.3 → 156.3
over ~400 ms, the tray with it), and the drag started from the long press
had snapshotted the tray where it was. Fix: targets are read live on every
move (slot centres and the tray rect through refs, the latest render's list
through a ref); the tray gets hysteresis (8px to enter, 40px to leave)
because taking it as the target closes the row gap and shifts the tray
itself. Live reading is stable against the row gap: it always moves away
from the centre the pointer just crossed. Test: a long press whose tray
rect moves 60px between drag start and the pointer's arrival still lands in
the tray. In-app: long press on the first widget from an unfocused
composer, pointer walked to the tray's live position while the panel was
still rising → tray gap open, dropped → tucked; then restored. The owner's
own layout was left as found.

### Addendum: the "…" menu is the drop zone; palette surface; concentric pills (owner decisions)

The owner found the dashed tray unintuitive — the "…" opens a list in normal
use, and a horizontal tray did not say "what you drop here shows up in that
list". Three renderings were mocked (menu-as-drop-zone, icon column above
"…", folder well); the owner chose **A: the menu itself is the drop zone**,
and asked for the menu to share the palette surface with the other attach
menus and for each row to be a pill whose icon circle is concentric with the
pill and the menu's corner.

- **Menu surface and rows.** Radius 22, padding 8, `rgba(var(--pupu-surface-rgb),.85/.9)`,
  text-rgb edge, blur — the palette's own values. Rows are 28px pills
  (radius 14 = 22 − 8) with `padding-left: 0`; the icon sits in a 28px circle
  (`data-icon-circle`) flush with the pill's left cap. The context usage ring
  (a fixed 32px control) is scaled 0.875 into its circle. Arrange… uses the
  same geometry.
- **Arrange mode.** The tray is gone. Entering arrange opens the "…" menu and
  pins it open (`handleMoreOpenChange(false)` is ignored while arranging;
  `finishArranging` closes it); the "…" button renders whenever arranging or
  something is tucked. In the menu: a heading ("In the ⋯ menu"), one gap
  element per position (grows to a row height at the drop index), each
  tucked widget as an inert picture inside a dashed draggable row
  (`arrangeMenuRow`, `menuRowRefs`), and a dashed "Drop here to tuck away"
  row when empty. Drop targets carry a zone: `{zone: "row"|"menu", index}`;
  the menu rect is checked first with a 6px slack; menu row centres (y) give
  the index. `placeAmong` maps an index in either list onto the record's
  `order` (row list = available & not hidden; menu list = available &
  hidden), so the drop position is the widget's place in the menu. Keyboard
  Enter tucks at the END of the menu.
- **Ghost above the popover.** Portaled to `document.body` at a fixed
  position with `Z.DRAG_GHOST` (the menu popover sits at `Z.TOOLTIP`).
- **Menu follows the floating row.** Arranging marks the composer active and
  the row floats up ~55px; the popover used to stay where it opened and
  ended under the row. BUILTIN `Tooltip` gained `follow_trigger` (a frame
  loop that re-positions when the trigger's rect changes; off by default),
  and the "…" Tooltip passes `follow_trigger={arranging}`.
- Outside-click ends the session only for clicks outside both the row and
  the menu. i18n: `chat.attach.in_menu`, `drop_here` (11 locales).

Tests (red before green): menu geometry (1), drop-zone suite (10), entry
points (3), jiggle (3), Done geometry (1), long press (2), moving panel (1),
cursor (1), menu follows (1); `tooltip.test.js` follow_trigger (2). In-app
(test API, `openai:gpt-5.4`, from an inactive composer): right-click → menu
opens and follows the row up (menu bottom 145 → 116 while the "…" is at 124);
drag a row widget onto the menu → gap row opens at the end, ghost above the
popover, "…" lit; drop → tucked at that position; drag the three menu rows
back to the front of the row one by one → row restored, menu shows the
dashed drop row; Done closes the menu. Screenshot `b1-crop.png` in the
session scratchpad.

### Addendum: menu motion; ring centring (owner feedback)

- **Menu motion.** Two sources of unnatural movement. (1) When a row widget
  targeted the menu, the row closed its origin gap, the row shrank 32px, the
  "…" moved left and — through `follow_trigger` — the whole menu jumped
  sideways under the hand. Now the origin slot stays open while the widget
  hovers the other zone (and a menu-origin gap stays open while a menu row
  hovers the row), so neither the row's width nor the menu's height changes
  mid-drag; measured in-app the menu's left edge holds (342 → 339 → 342
  across press / hover-over-menu). (2) The menu simply popped in; rows now
  cascade in exactly like the palette's option rows (rise 8px + fade,
  200ms on the same curve, 60ms + 30ms per row), off under reduced motion.
- **Ring centring.** The context usage ring is a fixed 32px control; grid
  centring inside the 28px circle left it 2px right and down (measured
  dx=dy=2). It is now parked at −2,−2 in a relative circle and scaled 28/32
  about its own centre: measured dx=dy=0, visual 28px.

Tests: geometry test extended (entrance animation per row), ring-centring
test, origin-gap assertion in the drop-zone test; chat-input + tooltip +
z-layer suites green.

## Addendum — round 10: no Arrange… row, the menu opens under the hand

Project owner feedback after the round-9 build (2026-09-12): the plugin row
was narrower than its neighbours; the Arrange… row should go; a long press in
the menu should start a drag like one in the row, with the rows jiggling;
dragging a row out of the menu should close the menu; and the way to drag
INTO the menu is to hover the "…" with the widget in hand.

- Equal width: `menuRowStyle` sets `width: 100%`; the palette `Select` gained
  `trigger_wrapper_style` (→ Tooltip `wrapper_style`) and the plugin /
  workspace menu rows pass `{ width: "100%", display: "flex" }`.
- The Arrange… row and its hairline are gone; `chat.attach.arrange` removed
  from the 11 locales. Entry points: right-click, long press (row or menu
  row via `menuRowPressProps`), Shift+Enter (row, and now inside the menu).
- `startArranging` no longer pins the menu open; `handleMoreOpenChange` no
  longer refuses to close while arranging. During a drag `onMove` opens the
  menu when the target zone is "menu" and closes it otherwise;
  `computeTarget` treats the "…" button and the seam between it and the menu
  (the button's own width) as the menu's near end — the menu hangs BELOW
  the row when the composer sits at the top of an empty chat, so the near
  end is index 0 there. A drop that carried a row widget into the menu
  closes the menu; a move within the menu keeps it. The target is re-read
  once the menu the hover opened has mounted (effect on `moreOpen`).
- Menu rows in arrange mode jiggle with `pupu-attach-jiggle-row` (±0.5°).
- Follow-up the same day: the "In the ⋯ menu" heading is gone too
  (`chat.attach.in_menu` removed from the locales), and so are the dashed
  outlines in the menu (rows, gap, empty row): the drop point is plain
  empty space the rows part to leave, exactly like the row's gap. The row
  slots keep their dashed rings.
- Keyboard: walking the highlight onto a tucked widget opens the menu.

Tests: attach_panel.test.js 80 green (new: menu closed on entry; hover "…"
opens / leave closes; drop into menu closes; long press on a menu row lifts
it and dragging out closes the menu; menu rows jiggle; menu-below-the-row
geometry; no Arrange… row; full-width rows), select.trigger_wrapper.test.js
2 green. Full renderer suite 391 suites / 4685 passed. In-app (test-api,
`.release-qa/issue-217-round10-inapp.log`): all of the above driven with
real pointer events on the running build, project owner's layout restored.

## Addendum — first-launch default

Project owner (2026-09-12): a first launch shows context window, plugins and
workspace on the row and tucks everything else. `DEFAULT_ATTACH_PANEL_LAYOUT`
now has `hidden: ["attach", "screenshot", "link"]` (order unchanged). Only the
no-record case is affected; a persisted record is read as written, so users
who already arranged the row keep their arrangement. Tests that reasoned
about "nothing tucked" now write that record explicitly.

## Addendum — unavailable means absent

Project owner (2026-09-12, before acceptance): a widget the model has disabled
must not show its icon, and when every widget in the "…" menu is disabled the
"…" itself must go. `widgetAvailable.attach` / `.screenshot` now include
`attachmentsEnabled`, so the two widgets that used to render disabled with a
reason tooltip are simply absent (row and menu alike) and `hasMore` follows.
The disabled branches (`attachmentsDisabledReason`, the `*_unsupported`
labels) were unreachable after that and were removed, the two locale keys
with them. Verified in-app by switching a probe chat to `ollama:deepseek-r1:14b`
(no attachments, no tools): row empty, no "…"; back on gpt-4.1 everything
returns where the record says (`.release-qa/issue-217-disabled-hidden-inapp.log`).

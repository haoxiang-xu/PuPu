# Attach Panel Layout

> The row under the composer, what the user can move in it, and where that
> choice lives. Issue #217.

The attach panel is one row: the model pill, the movable widgets, the "…"
overflow menu, and the queue segment. The pill is always first and the queue
segment always last; neither moves. The six widgets between them are the
user's to arrange:

| id | Widget | Available when |
|----|--------|----------------|
| `context_composition` | Context usage ring | the chat has a context composition or usage view |
| `attach` | Attach image or PDF | the chat has a file handler and the model can read attachments |
| `screenshot` | Take a screenshot | file handler, screenshot handler, and the model can read attachments |
| `tools` | Plugin selector | file handler, tools shown, no agent recipe active |
| `workspace` | Workspace selector | file handler, workspaces shown |
| `link` | Attach link | the chat has a link handler |

A widget the current chat or model cannot offer is skipped wherever it would
render — never shown disabled — and keeps its place in the record for when it
comes back. When the last tucked widget is unavailable the "…" button goes
too, so a text-only model with everything tucked shows just the pill.

**First launch.** With no record yet, the row shows the context usage ring,
the plugin selector and the workspace selector, and the "…" menu holds
attach, screenshot and link (project owner's call). A record is honoured as
written — one that tucks nothing renders the full pre-#217 row.

## The "…" menu

When at least one available widget is tucked away, a 32px "…" button ends the
visible cluster. Its menu is the same surface as the model / plugins /
workspace palettes (radius 22, 8px padding, frosted); every row is a 28px pill
(radius 14, concentric with the menu's corner) whose icon sits in a 28px
circle flush with the pill's left cap, so circle, cap and corner share one
centre. Rows list the tucked widgets in the user's order — icon, label, and
the plugin/workspace count badge — every row the full width of the menu
(the plugin and workspace rows are a Select's custom trigger, so the Select
takes `trigger_wrapper_style` to stretch its wrapper). Invoking a row does
exactly what the widget does in the row: one-shot actions (attach,
screenshot, link) fire and close the menu; the plugin and workspace palettes
and the context usage panel open anchored to their menu row, with the menu
staying put underneath. There is no "Arrange…" row: a long press on a menu
row is the way into arrange mode from here. With nothing tucked (a record
that says so), the row is byte-for-byte what it was before #217 and the
button does not exist.

Keyboard: the "…" button is a stop in the row's ←/→ walk; inside the menu ↑/↓
move, Enter invokes, Shift+Enter arranges with that row highlighted, Escape
closes.

## Arrange mode

Entered from a right-click on any movable widget, from a long press (500 ms)
on one — in the row or in the "…" menu — which lifts that widget straight
into the hand, so the same gesture can carry it to its new place, or from
Shift+Enter on a keyboard-highlighted one. Mouse entries highlight nothing;
the keyboard entry keeps its highlight. The row itself becomes the editor:

- every movable widget sits in a dashed slot and is inert (its own action
  never fires), and rocks gently on its own phase the way an iOS home screen
  does while editing (off under `prefers-reduced-motion`; the slot being
  dragged holds still);
- the "…" button stays on the row even with nothing tucked, and its menu is
  the place tucked widgets go: each tucked widget in a draggable row that
  rocks like the slots do (a third of the angle), and a faint "drop here"
  caption row when it is empty — no heading, no outlines. The menu is not pinned open: with
  a widget in hand it opens when the pointer reaches the "…" (or the menu)
  and closes when the pointer leaves both — so dragging a menu row out
  closes the menu behind it — and a drop that carries a row widget into the
  menu closes it too. Opened by a click, it stays until something closes it,
  following the row as the composer floats up;
- a **Done** pill ends the session; so do Escape and a click outside the row
  and the menu.

A press on a slot (or a menu row) lifts the widget at once (a release in
place changes nothing). While a widget is dragged it leaves its place and
rides the pointer as a lifted ghost above everything, and the other icons
part to leave an empty slot where it would land; over the menu, the rows
part the same way — a plain row-height gap opens at the drop index, and over the "…" itself (or the seam between
it and the menu, the button's own width only) at the end of the menu
nearest the button — the top when the popover engine has hung the menu
below the row. Releasing drops it there: in the row at that position, or
into the menu at that position — the drop point IS the widget's place in
the menu from then on. The slot a widget came from stays open
while it hovers the other zone, so the row's width and the menu's height
hold still under the hand. The drop point is read against live positions on
every move, because the panel floats up under a drag that starts from a long
press. Keyboard: ←/→ walk the slots and menu rows, Shift+←/→ move the
highlighted widget one slot, Enter tucks a row widget at the end of the menu
or restores a menu one at the end of the row. Every drop is written at once.

## Persistence

`src/SERVICEs/attach_panel_layout.js`, settings namespace
`attach_panel_layout`:

```javascript
{ version: 1, order: [<every movable id, user order>], hidden: [<ids>] }
```

The menu order is the record's `order` filtered to `hidden`, so one array
carries both the row's and the menu's order; dropping into the menu between
two tucked widgets places the id between them in `order`.
`DEFAULT_ATTACH_PANEL_LAYOUT` (no record) tucks attach / screenshot / link.
`normalizeAttachPanelLayout` is the only reader: unknown ids are dropped,
repeats collapse, widgets the record never knew about (added later) are
appended in default order so a new widget shows up in the row, `hidden` is
kept to ids present in `order`, and a wrong version or malformed record reads
as the default. `moveAttachWidget` and `setAttachWidgetHidden` are the two
pure edits; `writeAttachPanelLayout` replaces the namespace whole. The panel
reads it through `useAttachPanelLayout` (`useSyncExternalStore` over the
settings repository subscription), so a write from any panel, or a settings
reset, reaches every mounted panel without a remount.

## Key files

| File | Role |
|------|------|
| `src/SERVICEs/attach_panel_layout.js` | Record shape, normalize, pure edits, read/write/subscribe |
| `src/COMPONENTs/chat-input/hooks/use_attach_panel_layout.js` | Live layout for the panel |
| `src/COMPONENTs/chat-input/components/attach_panel.js` | `renderRowWidget` / `renderMenuWidget`, the "…" menu, arrange mode (`arrangeSlot`, drag, tray, keyboard) |
| `src/COMPONENTs/chat-input/chat_input.js` | Forwards the Shift modifier to the panel's keyboard handler |

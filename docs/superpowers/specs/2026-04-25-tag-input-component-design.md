# TagInput Component & Agent Prompt Editor Redesign

**Date:** 2026-04-25
**Status:** Spec — pending implementation

## Goal

Replace the current edit/preview-toggle `ChipEditor` with a true WYSIWYG "text + inline tag chip" editor. Extract the editor primitive as a reusable BUILTIN component (`TagInput`) so any future PuPu surface that needs tag-aware text input can drop it in. Replace the bottom "+ Variable" `Select` picker with an inline `{`-triggered autocomplete popover anchored at the caret.

## Motivation

The current `chip_editor.js` has two friction points:

1. **Mode toggle is jarring.** Users see chips in preview mode but raw `{{#start.text#}}` tokens the moment they click to edit. They have to mentally translate the token strings every time they edit. The toggle is also fragile — `lastSelectionRef` plus `setTimeout`-based blur detection are workarounds for the fundamental "two views of the same string" design.
2. **Bottom "+ Variable" selector is awkward.** It lives outside the input, requires the user to break flow (move mouse down, open dropdown, search, click), and visually doesn't match the WYSIWYG promise of the chip preview. It's also a `Select` which was designed for value selection, not free-text insertion at a caret position.

A WYSIWYG `TagInput` solves both: chips render inline as the user types, and inserting a new variable is just typing `{` and picking from a popover that appears right at the caret — same heart as Notion mentions, Linear filter chips, Slack `@mentions`.

## Architecture

```
BUILTIN_COMPONENTs/input/tag_input.js       <-- NEW: business-agnostic primitive
  └── consumes parse_chips / render_chip / autocomplete from caller

COMPONENTs/agents/pages/recipes_page/
  chip_editor.js                            <-- REWRITTEN: thin business wrapper
    └── uses TagInput
    └── provides PuPu's parse_chips ({{#x.y#}} + {{SYSTEM_PROMPT}})
    └── provides PuPu's render_chip (color dots, diagnostic colors)
    └── provides autocomplete options from `scope` + system prompts
  chip_editor_parse.js                      <-- UNCHANGED (still owns regex)
```

**Single source of truth.** `TagInput`'s state is the controlled `value` string the caller passes in. Internally the component derives a segment array (text/chip) for rendering, and uses a DOM-position ↔ string-offset mapping for caret/selection. Every keystroke produces a new string, runs `parse_chips` on it, re-renders. There is no separate "rich" representation persisted anywhere.

## Component 1 — `BUILTIN_COMPONENTs/input/tag_input.js`

### Public API

```js
<TagInput
  value={string}                    // controlled
  onChange={(next: string) => void}
  parse_chips={(s: string) => Segment[]}
  render_chip={(seg: ChipSegment, isDark: bool) => ReactNode}
  autocomplete={{
    trigger: "{",                   // single character that opens the popover
    options: AutocompleteOption[],  // flat or grouped (see below)
    render_option: (opt) => ReactNode,
    on_select: (opt, ctx) => void,  // ctx = { insert(str), replace_range(start, end, str) }
  } | undefined}                    // omit to disable autocomplete
  placeholder={string}
  min_rows={number}                 // default 4
  max_display_rows={number}         // default 12
  style={Object}                    // override container fontSize, padding, etc.
  disabled={bool}
/>
```

`Segment` shape (returned by `parse_chips`):

```js
// text segment — rendered as plain text
{ kind: "text", value: "Hi " }

// chip segment — rendered via render_chip, treated as atomic
{
  kind: "chip",
  raw: "{{#start.text#}}",   // the source string slice this chip represents
  data: { ... },              // anything caller needs in render_chip
}
```

`AutocompleteOption` (flat or grouped):

```js
// flat
{ value: "{{#start.text#}}", label: "start.text", search: "start text", description: "string" }

// grouped — same shape as Select's grouped options for visual consistency
{ group: "From start", options: [ ...flat options ] }
```

### Internal Behavior

**Rendering.** `TagInput` renders a single `<div contentEditable suppressContentEditableWarning>`. On every render:

1. Run `parse_chips(value)` → segments.
2. Render text segments as plain text nodes; chip segments via `render_chip(seg, isDark)` wrapped in a `<span contentEditable={false} data-chip-raw={seg.raw}>` so the chip is atomic in the DOM.
3. After render, if the contentEditable's text content drifts from `value` (rare — caused by browser pasting weird HTML), force a reconciliation by setting `innerHTML` from segments and restoring caret.

**Controlled string.** On any user-driven mutation (input, paste, drop), compute the new string from the DOM:
- Walk the contentEditable's child nodes.
- For each text node, append `node.textContent`.
- For each chip span (`data-chip-raw`), append the `data-chip-raw` attribute value.
- Call `onChange(next)`.

**Caret & selection.** Maintain a bidirectional mapping between (DOM range) ↔ (string offset):
- `dom_to_offset(node, offset)` — walks ancestors to compute the string index, treating each chip span as a single "atomic" unit equal to its `data-chip-raw.length`.
- `offset_to_dom(stringOffset)` — inverse. Used after `onChange` to restore caret.

**Atomic chip behavior:**
- **Backspace** when caret is immediately to the right of a chip → delete the entire chip's `raw` substring in one step. Detect by inspecting the previous DOM sibling at caret position; if it's a chip span, splice `value.slice(0, chipStart) + value.slice(chipEnd)` and call `onChange`.
- **Delete** key, mirror behavior on the right.
- **Left/Right arrows** at a chip boundary → jump over the chip in one keypress (this falls out of the contentEditable's atomic span behavior automatically; verify in tests).
- **Selection that crosses a chip** — when collapsing the selection (typing/delete), treat the chip as atomic: any selection that starts or ends inside a chip span snaps outward to the chip's outer boundary before splicing.
- **Click inside a chip span** — set caret to the chip's outer right boundary (chip is unclickable as a target; the click is hijacked by the contentEditable=false on the span and lands on the wrapper, but we explicitly handle `onMouseDown` on chip spans to position caret outside).

**Paste.** Strip pasted HTML to plain text via the `paste` event handler (`event.clipboardData.getData("text/plain")`), then `document.execCommand("insertText", false, text)` so the contentEditable handles it as text input. Then `parse_chips` will re-detect any tokens that paste introduced.

### Autocomplete Popover

When `autocomplete.trigger` (e.g. `{`) is typed:

1. Open popover anchored at the caret (use `Range.getBoundingClientRect()` of the just-typed character; popover fixed-positioned with that origin, flipped vertically if it would overflow).
2. Track a `query` substring = text typed after the trigger up to the current caret.
3. Filter `options` by `query` (substring match against `option.search || option.label`).
4. **Keyboard:** ↑/↓ navigate, Enter / Tab to confirm, Esc to dismiss.
5. **Confirm:** call `autocomplete.on_select(option, ctx)`. The default ctx provides:
   - `ctx.insert(str)` — splice `str` at the current caret, replacing the trigger character + query (so `{start.te` → `{{#start.text#}}` end-to-end).
   - `ctx.replace_range(start, end, str)` — for advanced cases.
6. **Dismiss conditions:** Esc, click outside, caret moves out of the trigger run, or filtered options becomes empty AND user types another non-matching character (so a single typo doesn't kill the popover but a clearly wrong direction does).

The popover is implemented inline in `tag_input.js` (no new shared popover primitive) — it's a simple absolute-positioned `<div>` with the option list. Style matches `BUILTIN_COMPONENTs/select`'s dropdown for visual consistency (same border / shadow / row hover treatment).

### Theming

`TagInput` reads `ConfigContext.onThemeMode` for dark mode (matches `TextField`/`Input` convention). Caller can override container colors via `style`.

## Component 2 — `chip_editor.js` rewrite

`ChipEditor` becomes a thin business wrapper. Public API stays the same so `agent_panel.js` doesn't need to change:

```js
<ChipEditor value={...} onChange={...} scope={...} placeholder={...} />
```

Internally:

```js
function ChipEditor({ value, onChange, scope, placeholder }) {
  const cfg = useContext(ConfigContext);
  const isDark = cfg?.onThemeMode === "dark_mode";

  const parse_chips = useMemo(() => make_parse(scope), [scope]);
  const autocomplete_options = useMemo(() => build_autocomplete(scope), [scope]);
  const render_chip = useCallback((seg) => render_pupu_chip(seg, scope, isDark), [scope, isDark]);
  const diagnostics = get_diagnostics(value, scope);

  return (
    <div>
      <TagInput
        value={value}
        onChange={onChange}
        parse_chips={parse_chips}
        render_chip={render_chip}
        autocomplete={{
          trigger: "{",
          options: autocomplete_options,
          render_option: render_pupu_option,
          on_select: (opt, ctx) => ctx.insert(opt.value),
        }}
        placeholder={placeholder || "Type prompt; type { to insert a variable…"}
        min_rows={4}
        max_display_rows={12}
      />
      {diagnostics.length > 0 && <DiagnosticsBar items={diagnostics} isDark={isDark} />}
    </div>
  );
}
```

`make_parse(scope)` adapts existing `parse_chip_string` to TagInput's segment shape:

```js
function make_parse(scope) {
  return (s) => parse_chip_string(s).map((node) => {
    if (node.kind === "text") return { kind: "text", value: node.value };
    return {
      kind: "chip",
      raw: node_raw_text(node),
      data: { node, meta: get_chip_meta(node, scope) },
    };
  });
}
```

`render_pupu_chip` is the existing chip-rendering logic, but emits a non-button span (since chip clicks no longer do anything per the brainstorm decision 2a — chips are read-only visuals):

```js
function render_pupu_chip(seg, scope, isDark) {
  const { node, meta } = seg.data;
  // ... same color/dot/border logic as current render_chip ...
  return (
    <span data-var-chip={...} data-system-prompt-chip={...} data-chip-invalid={...}
          style={{ ... existing styles ..., cursor: "default" }}>
      <span style={{ /* dot */ }} />
      {label}
    </span>
  );
}
```

`build_autocomplete(scope)` produces grouped options identical to the current `build_variable_options(scope)` plus a "System prompts" group with the two known system prompts:

```js
function build_autocomplete(scope) {
  const var_groups = build_variable_options(scope); // existing
  const system_group = {
    group: "System prompts",
    options: Object.entries(KNOWN_SYSTEM_PROMPTS).map(([name, info]) => ({
      value: `{{${name}}}`,
      label: info.label,
      search: name + " " + info.label,
      description: info.description,
    })),
  };
  return [...var_groups, system_group];
}
```

**Removed:**
- The `editing` state and edit/preview toggle.
- The bottom-row `<Select>` for "+ Variable".
- The "Click a tag to edit the raw token." hint.
- All `lastSelectionRef`, `focus_editor`, `remember_selection*`, `handle_editor_blur` machinery.

**Kept:**
- Diagnostics bar below the input (shows unknown variables / unknown system prompts).
- All chip color/dot logic, just moved into `render_pupu_chip`.
- `KNOWN_SYSTEM_PROMPTS` constant.
- `parse_chip_string` and `serialize_chip_nodes` in `chip_editor_parse.js` — untouched.

## Data Model

The caller-facing string format is unchanged: `{{#node_id.field#}}` for variables, `{{NAME}}` for system prompts. `agent_panel.js`, `to_save_payload.js`, the unchain backend, and all existing tests keep working without changes.

## Keyboard / Caret Edge Cases

These are the hairy bits — explicitly addressed:

| Case | Behavior |
|---|---|
| Caret at end, type `{` | Trigger char enters string normally; popover opens. If user picks an option, the string `{` plus query is replaced with the option's `value`. If user dismisses (Esc / no match), the literal `{` stays. |
| Type `{{` literally (escaping) | First `{` opens popover. Second `{` either matches an option (token start) or doesn't. If user wants a literal `{{` for prompt syntax that isn't a variable, Esc after the first `{`, then continue typing — the literal `{` is preserved. |
| Selection spans a chip and plain text, then user types | Snap selection outward to whole-chip bounds, splice the typed character in. |
| Backspace at start of input | No-op (browser default). |
| Backspace immediately right of a chip | Delete the whole chip's `raw` from `value`. |
| Left arrow at start of a chip | Caret jumps to chip's left outer boundary. |
| Click in the middle of a chip's text | Caret lands at chip's right outer boundary. The chip span uses `contentEditable={false}` so the click can't position caret inside it; the wrapper's `onMouseDown` snaps caret to the chip's outer right boundary. |
| Cmd+A | Selects all (browser default), works because chips are normal DOM children. |
| Cmd+Z / Cmd+Y | Browser-native contentEditable undo is unreliable. We do NOT intercept undo here — the parent recipe-level undo/redo (just shipped) covers it. |
| Drag-and-drop from another field | `dragover`/`drop` handlers prevented; users must paste. |
| IME composition (Chinese, Japanese) | `compositionstart`/`compositionend` events bracket multi-keystroke input; defer `onChange` until composition ends. |

## Test Plan

### `BUILTIN_COMPONENTs/input/tag_input.test.js` (NEW)

1. **Renders text segments and chip segments.** Given `value = "Hi {{TOK}}"` and a parser that recognizes `{{TOK}}`, expect a `data-chip-raw="{{TOK}}"` element in the output.
2. **Typing in plain area calls onChange with new string.** Use `fireEvent.input` (or `userEvent.type`) and assert the controlled `onChange` receives expected string.
3. **Backspace immediately after a chip removes the whole chip.** Set caret position via `Selection` API, fire backspace, assert `onChange` called with the chip stripped.
4. **Autocomplete trigger opens popover.** Type `{`, assert a `[role="listbox"]` (or test-id) appears with the supplied options.
5. **Autocomplete arrow keys + Enter selects option.** Verify `on_select` is called with the right option, and after selection `onChange` receives the inserted string.
6. **Esc dismisses popover without changing value.** Type `{`, press Esc, assert popover gone and `value` unchanged except for the literal `{` typed.
7. **Click outside dismisses popover.**
8. **Empty options or filter-empty: popover closes when query doesn't match anything.**

Tests should mock `getBoundingClientRect` to return stable positions (jsdom returns zeros).

### `chip_editor.test.js` (UPDATE existing)

Existing tests in `agent_panel.test.js` reference `[data-var-chip="start.text"]` — keep that data attribute selector. Add or update:

1. **Renders chips for `{{#start.text#}}` in WYSIWYG mode.** No mode toggle; the chip element is in the DOM at first render.
2. **Type `{` and pick a variable from autocomplete inserts the token.** Replaces the existing "click bottom-row Select" test which is gone.
3. **Diagnostics bar renders for unknown variable.**
4. **Removed test** for "preview ↔ edit toggle" — no longer applies.

### `agent_panel.test.js` (UPDATE)

The `clicking an input variable appends it to the prompt` test (which clicks the upstream-variable list item in the panel header) still works — that's a separate UI path that already lives outside `ChipEditor`. No change needed.

## Compatibility / Invariants

- `ChipEditor`'s public API (`value`, `onChange`, `scope`, `placeholder`) is preserved.
- Existing `agent_panel.js` code passing `value=node.override?.prompt`, `onChange=(v) => set_override_silent({ prompt: v })`, `scope=compute_variable_scope(...)` keeps working without change.
- The recipe save payload format is unchanged; `to_save_payload.js` still handles the same string.
- The recipe undo/redo hook keeps working — every `onChange` from `TagInput` flows through `set_override_silent` (silent setter, no history push) which matches the current behavior. History snapshots happen on blur / explicit non-silent edits, which is unchanged.

## Non-Goals (YAGNI)

- **Multi-line chip editing.** Chips are single-line atomic units; no nested chips.
- **Custom chip drag-and-drop reorder.** Out of scope.
- **Inline chip editing (clicking a chip to edit the variable name).** Decision 2a — delete and reinsert.
- **A separate generic Popover primitive in BUILTIN.** The autocomplete popover is local to `TagInput`; if a future skill needs a popover, extract then.
- **Native browser undo within the contentEditable.** Recipe-level Cmd+Z covers it.
- **Replacing other inputs in the codebase with TagInput.** This spec ships TagInput + ChipEditor migration only. Other surfaces (chat input, settings forms) stay on `Input` / `TextField`.

## File Changes Summary

| File | Action | Purpose |
|---|---|---|
| `src/BUILTIN_COMPONENTs/input/tag_input.js` | NEW | Generic WYSIWYG tag input primitive |
| `src/BUILTIN_COMPONENTs/input/tag_input.test.js` | NEW | Unit tests for TagInput |
| `src/COMPONENTs/agents/pages/recipes_page/chip_editor.js` | REWRITE | Thin business wrapper around TagInput |
| `src/COMPONENTs/agents/pages/recipes_page/chip_editor.test.js` | NEW | Tests for ChipEditor wrapper (currently no dedicated tests, only via agent_panel.test.js) |
| `src/COMPONENTs/agents/pages/recipes_page/chip_editor_parse.js` | UNCHANGED | parse_chip_string + serialize_chip_nodes |
| `src/COMPONENTs/agents/pages/recipes_page/detail_panel/agent_panel.js` | UNCHANGED | Caller; uses ChipEditor's existing API |
| `src/COMPONENTs/agents/pages/recipes_page/detail_panel/agent_panel.test.js` | UNCHANGED | Existing tests still pass |

# TagInput Component & Agent Prompt Editor Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a generic WYSIWYG `TagInput` BUILTIN component (text + inline atomic chips + caret-anchored autocomplete popover) and rewrite `ChipEditor` as a thin business wrapper around it, replacing the current edit/preview-toggle UX and the bottom "+ Variable" Select picker.

**Architecture:** `TagInput` is a controlled `contentEditable` div that accepts a `value` string plus three injection points (`parse_chips`, `render_chip`, `autocomplete`). It owns a bidirectional mapping between DOM positions and string offsets so chips behave atomically (backspace deletes a whole chip; arrow keys jump over them). `ChipEditor` becomes a 50-line wrapper that supplies PuPu-specific parsing for `{{#node.field#}}` and `{{SYSTEM_PROMPT}}` tokens, plus the autocomplete option list built from the upstream-variable scope.

**Tech Stack:** React 19 (function components, hooks), inline styles via `ConfigContext.onThemeMode`, contentEditable div + manual Selection/Range, jsdom-based Jest tests via `@testing-library/react`.

**Spec:** `docs/superpowers/specs/2026-04-25-tag-input-component-design.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/BUILTIN_COMPONENTs/input/tag_input.js` | NEW | Generic WYSIWYG tag input primitive (~250 LOC) |
| `src/BUILTIN_COMPONENTs/input/tag_input_dom.js` | NEW | Pure helper: DOM offset ↔ string offset, value extraction (~80 LOC) |
| `src/BUILTIN_COMPONENTs/input/tag_input.test.js` | NEW | Unit tests for TagInput |
| `src/BUILTIN_COMPONENTs/input/tag_input_dom.test.js` | NEW | Unit tests for the pure helper |
| `src/COMPONENTs/agents/pages/recipes_page/chip_editor.js` | REWRITE | Thin business wrapper around TagInput |
| `src/COMPONENTs/agents/pages/recipes_page/chip_editor.test.js` | NEW | Tests for the new ChipEditor wrapper |
| `src/COMPONENTs/agents/pages/recipes_page/chip_editor_parse.js` | UNCHANGED | `parse_chip_string` / `serialize_chip_nodes` |
| `src/COMPONENTs/agents/pages/recipes_page/detail_panel/agent_panel.js` | UNCHANGED | Caller; uses ChipEditor's existing API |
| `src/COMPONENTs/agents/pages/recipes_page/detail_panel/agent_panel.test.js` | UNCHANGED | Existing 3 tests still pass after rewrite |

The pure helper file (`tag_input_dom.js`) exists so we can unit-test the DOM-position ↔ string-offset math without spinning up a full React tree.

---

## Task 1: Pure DOM ↔ string-offset helpers

**Files:**
- Create: `src/BUILTIN_COMPONENTs/input/tag_input_dom.js`
- Create: `src/BUILTIN_COMPONENTs/input/tag_input_dom.test.js`

These are the math primitives every later task relies on. Get them right first, in isolation.

- [ ] **Step 1: Write the failing tests**

Create `src/BUILTIN_COMPONENTs/input/tag_input_dom.test.js`:

```js
import {
  extract_value,
  dom_to_offset,
  offset_to_dom,
} from "./tag_input_dom";

function build(html) {
  const root = document.createElement("div");
  root.innerHTML = html;
  return root;
}

describe("extract_value", () => {
  test("plain text only", () => {
    const root = build("Hello world");
    expect(extract_value(root)).toBe("Hello world");
  });

  test("text + chip span", () => {
    const root = build('Hi <span data-chip-raw="{{#a.b#}}">a.b</span>!');
    expect(extract_value(root)).toBe("Hi {{#a.b#}}!");
  });

  test("two chips back to back", () => {
    const root = build(
      '<span data-chip-raw="{{X}}">X</span><span data-chip-raw="{{Y}}">Y</span>',
    );
    expect(extract_value(root)).toBe("{{X}}{{Y}}");
  });

  test("empty", () => {
    expect(extract_value(build(""))).toBe("");
  });
});

describe("dom_to_offset", () => {
  test("text node start", () => {
    const root = build("Hello");
    const text = root.firstChild;
    expect(dom_to_offset(root, text, 0)).toBe(0);
    expect(dom_to_offset(root, text, 5)).toBe(5);
  });

  test("after a chip", () => {
    const root = build('Hi <span data-chip-raw="{{TOK}}">TOK</span>!');
    // caret at offset 3 in root means after "Hi " text node (3 chars), at chip index
    expect(dom_to_offset(root, root, 2)).toBe(3 + 7); // "Hi " (3) + "{{TOK}}" (7)
  });

  test("inside text after chip", () => {
    const root = build('<span data-chip-raw="{{TOK}}">TOK</span>!!');
    const tail = root.childNodes[1]; // "!!"
    expect(dom_to_offset(root, tail, 1)).toBe(7 + 1); // {{TOK}} + 1 char
  });

  test("inside a chip span snaps to chip end", () => {
    const root = build('<span data-chip-raw="{{TOK}}">TOK</span>');
    const inner = root.firstChild.firstChild;
    expect(dom_to_offset(root, inner, 1)).toBe(7); // snap to chip end
  });
});

describe("offset_to_dom", () => {
  test("inside plain text", () => {
    const root = build("Hello");
    const r = offset_to_dom(root, 3);
    expect(r.node).toBe(root.firstChild);
    expect(r.offset).toBe(3);
  });

  test("at chip boundary returns container index", () => {
    const root = build('Hi <span data-chip-raw="{{TOK}}">TOK</span>');
    const r = offset_to_dom(root, 3); // before chip
    expect(r.node).toBe(root);
    expect(r.offset).toBe(1); // child index of chip
  });

  test("after a chip returns container index past it", () => {
    const root = build('<span data-chip-raw="{{TOK}}">TOK</span>X');
    const r = offset_to_dom(root, 7); // right after chip
    expect(r.node).toBe(root.childNodes[1]);
    expect(r.offset).toBe(0);
  });

  test("past end clamps to last position", () => {
    const root = build("Hi");
    const r = offset_to_dom(root, 100);
    expect(r.node).toBe(root.firstChild);
    expect(r.offset).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npx jest src/BUILTIN_COMPONENTs/input/tag_input_dom.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `src/BUILTIN_COMPONENTs/input/tag_input_dom.js`:

```js
function is_chip(node) {
  return (
    node &&
    node.nodeType === 1 &&
    node.dataset &&
    typeof node.dataset.chipRaw === "string"
  );
}

export function extract_value(container) {
  let value = "";
  for (const child of container.childNodes) {
    if (child.nodeType === 3) {
      value += child.textContent;
    } else if (is_chip(child)) {
      value += child.dataset.chipRaw;
    } else if (child.nodeType === 1) {
      // Defensive: walk unknown elements as text. Browsers can wrap pasted
      // content in <div>/<br> before our paste handler intervenes.
      value += child.textContent;
    }
  }
  return value;
}

export function dom_to_offset(container, node, dom_offset) {
  if (node === container) {
    let off = 0;
    for (let i = 0; i < dom_offset; i++) {
      const child = container.childNodes[i];
      if (child.nodeType === 3) off += child.textContent.length;
      else if (is_chip(child)) off += child.dataset.chipRaw.length;
      else off += child.textContent.length;
    }
    return off;
  }

  let off = 0;
  for (const child of container.childNodes) {
    if (child === node) {
      if (child.nodeType === 3) return off + dom_offset;
      if (is_chip(child)) {
        return dom_offset === 0 ? off : off + child.dataset.chipRaw.length;
      }
      return off + dom_offset;
    }
    if (child.contains && child.contains(node)) {
      // Inside this child (e.g., caret landed inside a chip's inner span).
      // Snap to chip's right outer boundary.
      if (is_chip(child)) {
        return off + child.dataset.chipRaw.length;
      }
      return off + child.textContent.length;
    }
    if (child.nodeType === 3) off += child.textContent.length;
    else if (is_chip(child)) off += child.dataset.chipRaw.length;
    else off += child.textContent.length;
  }
  return off;
}

export function offset_to_dom(container, target_offset) {
  let remaining = Math.max(0, target_offset);
  const children = container.childNodes;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.nodeType === 3) {
      const len = child.textContent.length;
      if (remaining <= len) return { node: child, offset: remaining };
      remaining -= len;
    } else if (is_chip(child)) {
      const len = child.dataset.chipRaw.length;
      if (remaining === 0) return { node: container, offset: i };
      if (remaining <= len) return { node: container, offset: i + 1 };
      remaining -= len;
    } else {
      const len = child.textContent.length;
      if (remaining <= len) return { node: child, offset: remaining };
      remaining -= len;
    }
  }
  // Past end — caret at very end of container.
  const last = children[children.length - 1];
  if (last && last.nodeType === 3) {
    return { node: last, offset: last.textContent.length };
  }
  return { node: container, offset: children.length };
}
```

- [ ] **Step 4: Run tests, confirm they pass**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npx jest src/BUILTIN_COMPONENTs/input/tag_input_dom.test.js`
Expected: PASS — all 11 tests.

- [ ] **Step 5: Stop. Do not commit.**

User wants to review changes before commits. Move to Task 2.

---

## Task 2: TagInput basic rendering (controlled value + segments)

**Files:**
- Create: `src/BUILTIN_COMPONENTs/input/tag_input.js`
- Create: `src/BUILTIN_COMPONENTs/input/tag_input.test.js`

Build the component skeleton. No interaction yet — just rendering segments from `parse_chips(value)`.

- [ ] **Step 1: Write the failing tests**

Create `src/BUILTIN_COMPONENTs/input/tag_input.test.js`:

```js
import React from "react";
import { render } from "@testing-library/react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import TagInput from "./tag_input";

const cfg = { theme: {}, onThemeMode: "light_mode" };
const wrap = (ui) => (
  <ConfigContext.Provider value={cfg}>{ui}</ConfigContext.Provider>
);

const tok_parser = (s) => {
  // Tokens of form {{X}} become chips; everything else is text.
  const re = /\{\{([A-Z]+)\}\}/g;
  const segs = [];
  let last = 0;
  let m;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) segs.push({ kind: "text", value: s.slice(last, m.index) });
    segs.push({ kind: "chip", raw: m[0], data: { name: m[1] } });
    last = m.index + m[0].length;
  }
  if (last < s.length) segs.push({ kind: "text", value: s.slice(last) });
  return segs;
};

const tok_render = (seg) => (
  <span data-testid={`chip-${seg.data.name}`}>{seg.data.name}</span>
);

describe("TagInput rendering", () => {
  test("renders plain text value", () => {
    const { container } = render(
      wrap(
        <TagInput
          value="Hello world"
          onChange={() => {}}
          parse_chips={tok_parser}
          render_chip={tok_render}
        />,
      ),
    );
    const editor = container.querySelector('[contenteditable="true"]');
    expect(editor).toBeTruthy();
    expect(editor.textContent).toBe("Hello world");
  });

  test("renders chip span with data-chip-raw and contentEditable=false", () => {
    const { container, getByTestId } = render(
      wrap(
        <TagInput
          value="Hi {{TOK}}!"
          onChange={() => {}}
          parse_chips={tok_parser}
          render_chip={tok_render}
        />,
      ),
    );
    const chip = container.querySelector('[data-chip-raw="{{TOK}}"]');
    expect(chip).toBeTruthy();
    expect(chip.getAttribute("contenteditable")).toBe("false");
    expect(getByTestId("chip-TOK")).toBeTruthy();
  });

  test("renders placeholder when value empty", () => {
    const { container } = render(
      wrap(
        <TagInput
          value=""
          onChange={() => {}}
          parse_chips={tok_parser}
          render_chip={tok_render}
          placeholder="Type here…"
        />,
      ),
    );
    expect(container.textContent).toContain("Type here…");
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npx jest src/BUILTIN_COMPONENTs/input/tag_input.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the minimal component**

Create `src/BUILTIN_COMPONENTs/input/tag_input.js`:

```js
import React, { useContext, useMemo, useRef } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";

export default function TagInput({
  value,
  onChange,
  parse_chips,
  render_chip,
  autocomplete,
  placeholder,
  min_rows = 4,
  max_display_rows = 12,
  style,
  disabled = false,
}) {
  const cfg = useContext(ConfigContext);
  const isDark = cfg?.onThemeMode === "dark_mode";
  const root_ref = useRef(null);
  const segments = useMemo(
    () => (parse_chips ? parse_chips(value || "") : [{ kind: "text", value: value || "" }]),
    [value, parse_chips],
  );

  const fontSize = style?.fontSize || 12;
  const lineHeight = style?.lineHeight || 1.7;
  const padding = style?.padding ?? 10;
  const minHeight = `calc(${lineHeight}em * ${min_rows} + ${padding * 2}px)`;
  const maxHeight = Number.isFinite(max_display_rows)
    ? `calc(${lineHeight}em * ${max_display_rows} + ${padding * 2}px)`
    : "none";

  const border = isDark
    ? "1px solid rgba(255,255,255,0.08)"
    : "1px solid rgba(0,0,0,0.08)";
  const background = isDark ? "rgba(30,30,30,0.95)" : "rgba(255,255,255,0.95)";

  const is_empty = !value;

  return (
    <div
      style={{ position: "relative", width: "100%" }}
    >
      <div
        ref={root_ref}
        contentEditable={!disabled}
        suppressContentEditableWarning
        style={{
          width: "100%",
          fontSize,
          lineHeight,
          fontFamily: "ui-monospace, Menlo, monospace",
          padding,
          borderRadius: 8,
          border,
          background,
          minHeight,
          maxHeight,
          overflowY: "auto",
          outline: "none",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          color: "inherit",
          ...style,
        }}
      >
        {segments.map((seg, i) => {
          if (seg.kind === "text") {
            return <React.Fragment key={`t-${i}`}>{seg.value}</React.Fragment>;
          }
          return (
            <span
              key={`c-${i}-${seg.raw}`}
              data-chip-raw={seg.raw}
              contentEditable={false}
              style={{ display: "inline-block", verticalAlign: "baseline" }}
            >
              {render_chip(seg, isDark)}
            </span>
          );
        })}
      </div>
      {is_empty && placeholder && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: padding,
            left: padding,
            color: "#86868b",
            fontSize,
            lineHeight,
            fontFamily: "ui-monospace, Menlo, monospace",
            pointerEvents: "none",
          }}
        >
          {placeholder}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests, confirm they pass**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npx jest src/BUILTIN_COMPONENTs/input/tag_input.test.js`
Expected: PASS — 3 tests.

- [ ] **Step 5: Stop. Move to Task 3.**

---

## Task 3: TagInput typing — input event triggers onChange

**Files:**
- Modify: `src/BUILTIN_COMPONENTs/input/tag_input.js`
- Modify: `src/BUILTIN_COMPONENTs/input/tag_input.test.js`

Wire the `input` event so user typing extracts the new value via `extract_value` and calls `onChange`.

- [ ] **Step 1: Add the failing test**

Append to `src/BUILTIN_COMPONENTs/input/tag_input.test.js` inside the existing `describe("TagInput rendering"` … or below it, adding a new describe:

```js
import { fireEvent } from "@testing-library/react";

describe("TagInput typing", () => {
  test("input event fires onChange with extracted value", () => {
    const onChange = jest.fn();
    const { container } = render(
      wrap(
        <TagInput
          value="Hi"
          onChange={onChange}
          parse_chips={tok_parser}
          render_chip={tok_render}
        />,
      ),
    );
    const editor = container.querySelector('[contenteditable="true"]');
    // Simulate user typing: mutate the DOM, then fire the input event.
    editor.firstChild.textContent = "Hello";
    fireEvent.input(editor);
    expect(onChange).toHaveBeenCalledWith("Hello");
  });

  test("input event with chip preserved emits raw token in extracted value", () => {
    const onChange = jest.fn();
    const { container } = render(
      wrap(
        <TagInput
          value="Hi {{TOK}}"
          onChange={onChange}
          parse_chips={tok_parser}
          render_chip={tok_render}
        />,
      ),
    );
    const editor = container.querySelector('[contenteditable="true"]');
    // Append "!" via a new text node at the end, then fire input.
    editor.appendChild(document.createTextNode("!"));
    fireEvent.input(editor);
    expect(onChange).toHaveBeenCalledWith("Hi {{TOK}}!");
  });
});
```

- [ ] **Step 2: Run tests, confirm new ones fail**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npx jest src/BUILTIN_COMPONENTs/input/tag_input.test.js`
Expected: FAIL — `onChange` not called or called with wrong args.

- [ ] **Step 3: Wire up the input handler**

In `src/BUILTIN_COMPONENTs/input/tag_input.js`:

Add at the top of the file:

```js
import { extract_value } from "./tag_input_dom";
```

Inside the component, before the `return`, add:

```js
function handle_input(e) {
  if (!root_ref.current) return;
  const next = extract_value(root_ref.current);
  if (next === value) return;
  onChange(next);
}
```

Add `onInput={handle_input}` to the contentEditable div (alongside `contentEditable`, `suppressContentEditableWarning`, etc.).

- [ ] **Step 4: Run tests, confirm pass**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npx jest src/BUILTIN_COMPONENTs/input/tag_input.test.js`
Expected: PASS — 5 tests.

- [ ] **Step 5: Stop. Move to Task 4.**

---

## Task 4: TagInput caret restoration after onChange

**Files:**
- Modify: `src/BUILTIN_COMPONENTs/input/tag_input.js`

When React re-renders due to a `value` change, the contentEditable's DOM is fully replaced and the browser caret resets to position 0. We need to remember the caret's string-offset before the render, and restore it after.

- [ ] **Step 1: Add the failing test**

Append to `tag_input.test.js`:

```js
describe("TagInput caret restoration", () => {
  test("caret preserved across onChange re-render", () => {
    function Controlled() {
      const [v, setV] = React.useState("Hi");
      return (
        <TagInput
          value={v}
          onChange={setV}
          parse_chips={tok_parser}
          render_chip={tok_render}
        />
      );
    }
    const { container } = render(wrap(<Controlled />));
    const editor = container.querySelector('[contenteditable="true"]');

    // Simulate caret at position 2 (end of "Hi"), then user types "!"
    const text = editor.firstChild;
    const sel = window.getSelection();
    const range = document.createRange();
    range.setStart(text, 2);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);

    text.textContent = "Hi!";
    fireEvent.input(editor);

    // After re-render, caret should be at position 3 (after the "!").
    const sel2 = window.getSelection();
    expect(sel2.rangeCount).toBe(1);
    const r = sel2.getRangeAt(0);
    // jsdom: caret is at editor's text node, offset 3
    const offset_after = r.startOffset;
    const node_after = r.startContainer;
    // text node's textContent should be "Hi!" with offset 3
    expect(node_after.textContent).toBe("Hi!");
    expect(offset_after).toBe(3);
  });
});
```

- [ ] **Step 2: Run tests, confirm new test fails**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npx jest src/BUILTIN_COMPONENTs/input/tag_input.test.js`
Expected: FAIL — caret not restored (jsdom caret will be at default position after re-render).

- [ ] **Step 3: Implement caret save/restore**

In `src/BUILTIN_COMPONENTs/input/tag_input.js`:

Add to imports:

```js
import { extract_value, dom_to_offset, offset_to_dom } from "./tag_input_dom";
import { useEffect, useLayoutEffect } from "react";
```

(merge into existing React import — `useContext, useMemo, useRef, useEffect, useLayoutEffect` from "react").

Inside the component, add a ref to track the desired caret string-offset:

```js
const pending_caret = useRef(null);
```

Modify `handle_input` to capture the current caret offset before emitting onChange:

```js
function handle_input(e) {
  if (!root_ref.current) return;
  const next = extract_value(root_ref.current);
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    const r = sel.getRangeAt(0);
    pending_caret.current = dom_to_offset(
      root_ref.current,
      r.startContainer,
      r.startOffset,
    );
  }
  if (next === value) return;
  onChange(next);
}
```

Add an effect that runs after every render to restore the caret if pending:

```js
useLayoutEffect(() => {
  if (pending_caret.current == null) return;
  if (!root_ref.current) return;
  const { node, offset } = offset_to_dom(root_ref.current, pending_caret.current);
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  try {
    range.setStart(node, offset);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch (_) {
    // Out-of-range; ignore.
  }
  pending_caret.current = null;
});
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npx jest src/BUILTIN_COMPONENTs/input/tag_input.test.js`
Expected: PASS — 6 tests.

- [ ] **Step 5: Stop. Move to Task 5.**

---

## Task 5: TagInput backspace deletes whole chip atomically

**Files:**
- Modify: `src/BUILTIN_COMPONENTs/input/tag_input.js`

When caret is immediately to the right of a chip span and user presses Backspace, splice the chip's `raw` substring out of `value` in one keypress.

- [ ] **Step 1: Add the failing test**

Append to `tag_input.test.js`:

```js
describe("TagInput chip deletion", () => {
  test("backspace right after chip deletes the whole chip", () => {
    function Controlled() {
      const [v, setV] = React.useState("Hi {{TOK}}");
      return (
        <TagInput
          value={v}
          onChange={setV}
          parse_chips={tok_parser}
          render_chip={tok_render}
        />
      );
    }
    const { container } = render(wrap(<Controlled />));
    const editor = container.querySelector('[contenteditable="true"]');

    // Place caret right after the chip span (index 2 in container = after chip).
    const sel = window.getSelection();
    const range = document.createRange();
    range.setStart(editor, 2);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);

    fireEvent.keyDown(editor, { key: "Backspace" });

    // Editor's extracted value should now be "Hi " (chip removed).
    expect(editor.querySelector("[data-chip-raw]")).toBeNull();
    expect(editor.textContent).toBe("Hi ");
  });
});
```

- [ ] **Step 2: Run tests, confirm new test fails**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npx jest src/BUILTIN_COMPONENTs/input/tag_input.test.js`
Expected: FAIL — chip still in DOM (no keydown handler yet).

- [ ] **Step 3: Add keydown handler**

In `src/BUILTIN_COMPONENTs/input/tag_input.js`, inside the component:

```js
function handle_key_down(e) {
  if (e.key === "Backspace") {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) return;
    const root = root_ref.current;
    if (!root) return;

    // Find the node immediately before the caret in document order.
    let prev = null;
    if (range.startContainer === root) {
      prev = root.childNodes[range.startOffset - 1] || null;
    } else if (
      range.startContainer.nodeType === 3 &&
      range.startOffset === 0
    ) {
      prev = range.startContainer.previousSibling;
    }
    if (!prev || prev.nodeType !== 1 || !prev.dataset || prev.dataset.chipRaw == null) return;

    e.preventDefault();
    const chip_start = dom_to_offset(root, prev, 0);
    const chip_end = chip_start + prev.dataset.chipRaw.length;
    const next_value = (value || "").slice(0, chip_start) + (value || "").slice(chip_end);
    pending_caret.current = chip_start;
    onChange(next_value);
  }
}
```

Add `onKeyDown={handle_key_down}` to the contentEditable div.

- [ ] **Step 4: Run tests, confirm pass**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npx jest src/BUILTIN_COMPONENTs/input/tag_input.test.js`
Expected: PASS — 7 tests.

- [ ] **Step 5: Stop. Move to Task 6.**

---

## Task 6: TagInput paste → plain text only

**Files:**
- Modify: `src/BUILTIN_COMPONENTs/input/tag_input.js`

Strip pasted HTML; only insert plain text. Tokens in the pasted text get re-parsed as chips on the next render.

- [ ] **Step 1: Add the failing test**

Append to `tag_input.test.js`:

```js
describe("TagInput paste", () => {
  test("paste inserts plain text and parses tokens", () => {
    function Controlled() {
      const [v, setV] = React.useState("");
      return (
        <TagInput
          value={v}
          onChange={setV}
          parse_chips={tok_parser}
          render_chip={tok_render}
        />
      );
    }
    const { container } = render(wrap(<Controlled />));
    const editor = container.querySelector('[contenteditable="true"]');

    const data = {
      getData: (type) => (type === "text/plain" ? "Pre {{TOK}} Post" : ""),
    };
    fireEvent.paste(editor, { clipboardData: data });

    // After paste, value reflects plain text and chip is re-parsed.
    const chip = editor.querySelector('[data-chip-raw="{{TOK}}"]');
    expect(chip).toBeTruthy();
    expect(editor.textContent).toBe("Pre TOK Post");
  });
});
```

- [ ] **Step 2: Run tests, confirm new test fails**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npx jest src/BUILTIN_COMPONENTs/input/tag_input.test.js`
Expected: FAIL — paste not handled.

- [ ] **Step 3: Add paste handler**

In `tag_input.js`, inside the component:

```js
function handle_paste(e) {
  e.preventDefault();
  const text =
    (e.clipboardData && e.clipboardData.getData("text/plain")) || "";
  if (!text) return;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) {
    onChange((value || "") + text);
    pending_caret.current = (value || "").length + text.length;
    return;
  }
  const range = sel.getRangeAt(0);
  const root = root_ref.current;
  const start = dom_to_offset(root, range.startContainer, range.startOffset);
  const end = range.collapsed
    ? start
    : dom_to_offset(root, range.endContainer, range.endOffset);
  const next = (value || "").slice(0, start) + text + (value || "").slice(end);
  pending_caret.current = start + text.length;
  onChange(next);
}
```

Add `onPaste={handle_paste}` to the contentEditable div.

- [ ] **Step 4: Run tests, confirm pass**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npx jest src/BUILTIN_COMPONENTs/input/tag_input.test.js`
Expected: PASS — 8 tests.

- [ ] **Step 5: Stop. Move to Task 7.**

---

## Task 7: TagInput autocomplete — popover renders on trigger

**Files:**
- Modify: `src/BUILTIN_COMPONENTs/input/tag_input.js`

When the user types the trigger character (e.g. `{`), open a popover anchored at the caret showing the option list.

- [ ] **Step 1: Add the failing test**

Append to `tag_input.test.js`:

```js
describe("TagInput autocomplete", () => {
  const ac_options = [
    { value: "{{#a.b#}}", label: "a.b", search: "a.b" },
    { value: "{{#c.d#}}", label: "c.d", search: "c.d" },
  ];

  test("typing trigger char opens popover with options", () => {
    function Controlled() {
      const [v, setV] = React.useState("");
      return (
        <TagInput
          value={v}
          onChange={setV}
          parse_chips={tok_parser}
          render_chip={tok_render}
          autocomplete={{
            trigger: "{",
            options: ac_options,
            render_option: (opt) => <span>{opt.label}</span>,
            on_select: (opt, ctx) => ctx.insert(opt.value),
          }}
        />
      );
    }
    const { container, queryByTestId } = render(wrap(<Controlled />));
    const editor = container.querySelector('[contenteditable="true"]');

    // Type "{".
    editor.appendChild(document.createTextNode("{"));
    const sel = window.getSelection();
    const range = document.createRange();
    range.setStart(editor.firstChild, 1);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    fireEvent.input(editor);

    expect(queryByTestId("tag-input-popover")).toBeTruthy();
    expect(queryByTestId("tag-input-popover").textContent).toContain("a.b");
    expect(queryByTestId("tag-input-popover").textContent).toContain("c.d");
  });
});
```

- [ ] **Step 2: Run tests, confirm fail**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npx jest src/BUILTIN_COMPONENTs/input/tag_input.test.js`
Expected: FAIL — popover not rendered.

- [ ] **Step 3: Implement popover state and rendering**

In `tag_input.js`:

Add `useState` to React import. Inside component, after `pending_caret`:

```js
const [popover, setPopover] = useState(null);
// popover shape: { trigger_offset: number, query: string, anchor: {top, left}, active_index: number }
```

After the `handle_input` function, add a helper to compute popover state from current caret:

```js
function compute_popover_state() {
  if (!autocomplete) return null;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!range.collapsed) return null;
  const root = root_ref.current;
  if (!root) return null;
  const caret = dom_to_offset(root, range.startContainer, range.startOffset);
  const trig = autocomplete.trigger;
  // Find the most recent trigger char to the left of caret without a whitespace
  // or another trigger between caret and it.
  const v = value || "";
  let i = caret - 1;
  let trigger_offset = -1;
  while (i >= 0) {
    const ch = v[i];
    if (ch === trig) { trigger_offset = i; break; }
    if (ch === "\n" || ch === " ") break;
    i--;
  }
  if (trigger_offset < 0) return null;
  const query = v.slice(trigger_offset + 1, caret);
  // Compute caret rect for anchor.
  let anchor = { top: 0, left: 0 };
  try {
    const rect = range.getBoundingClientRect();
    const root_rect = root.getBoundingClientRect();
    anchor = {
      top: rect.bottom - root_rect.top + 4,
      left: rect.left - root_rect.left,
    };
  } catch (_) {}
  return { trigger_offset, query, anchor, active_index: 0 };
}
```

Modify `handle_input`:

```js
function handle_input(e) {
  if (!root_ref.current) return;
  const next = extract_value(root_ref.current);
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    const r = sel.getRangeAt(0);
    pending_caret.current = dom_to_offset(
      root_ref.current,
      r.startContainer,
      r.startOffset,
    );
  }
  if (next !== value) onChange(next);
  // Defer popover update until after onChange-driven re-render.
  setTimeout(() => setPopover(compute_popover_state()), 0);
}
```

Build a flat option list (handle both flat and grouped option formats):

```js
const flat_options = useMemo(() => {
  if (!autocomplete) return [];
  const flatten = (items) => {
    const out = [];
    for (const it of items) {
      if (it && Array.isArray(it.options)) {
        for (const sub of it.options) out.push({ ...sub, group: it.group });
      } else if (it) {
        out.push(it);
      }
    }
    return out;
  };
  return flatten(autocomplete.options || []);
}, [autocomplete]);

const filtered_options = useMemo(() => {
  if (!popover) return [];
  const q = popover.query.toLowerCase();
  if (!q) return flat_options;
  return flat_options.filter((o) =>
    String(o.search || o.label || "").toLowerCase().includes(q),
  );
}, [flat_options, popover]);
```

Render the popover at the bottom of the wrapper div (after the contentEditable, before the placeholder block):

```jsx
{popover && filtered_options.length > 0 && (
  <div
    data-testid="tag-input-popover"
    style={{
      position: "absolute",
      top: popover.anchor.top,
      left: popover.anchor.left,
      zIndex: 50,
      minWidth: 200,
      maxHeight: 240,
      overflowY: "auto",
      borderRadius: 8,
      border,
      background,
      boxShadow: "0 8px 24px rgba(0,0,0,0.16)",
      fontSize: 12,
    }}
  >
    {filtered_options.map((opt, i) => (
      <div
        key={`${opt.value}-${i}`}
        data-tag-option-index={i}
        style={{
          padding: "6px 10px",
          cursor: "pointer",
          background: i === popover.active_index
            ? (isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)")
            : "transparent",
        }}
      >
        {autocomplete.render_option(opt)}
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npx jest src/BUILTIN_COMPONENTs/input/tag_input.test.js`
Expected: PASS — 9 tests. (Note: jsdom's `getBoundingClientRect` returns zeros — that's fine for visibility tests.)

- [ ] **Step 5: Stop. Move to Task 8.**

---

## Task 8: TagInput autocomplete — keyboard nav + select + dismiss

**Files:**
- Modify: `src/BUILTIN_COMPONENTs/input/tag_input.js`

Hook ↑/↓ to move active_index, Enter/Tab to confirm, Esc to dismiss. Also dismiss on outside click.

- [ ] **Step 1: Add the failing tests**

Append to `tag_input.test.js`:

```js
test("ArrowDown + Enter selects an option", () => {
    const onSelectSpy = jest.fn((opt, ctx) => ctx.insert(opt.value));
    function Controlled() {
      const [v, setV] = React.useState("");
      return (
        <TagInput
          value={v}
          onChange={setV}
          parse_chips={tok_parser}
          render_chip={tok_render}
          autocomplete={{
            trigger: "{",
            options: ac_options,
            render_option: (opt) => <span>{opt.label}</span>,
            on_select: onSelectSpy,
          }}
        />
      );
    }
    const { container, queryByTestId } = render(wrap(<Controlled />));
    const editor = container.querySelector('[contenteditable="true"]');

    editor.appendChild(document.createTextNode("{"));
    const sel = window.getSelection();
    const range = document.createRange();
    range.setStart(editor.firstChild, 1);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    fireEvent.input(editor);

    fireEvent.keyDown(editor, { key: "ArrowDown" });
    fireEvent.keyDown(editor, { key: "Enter" });

    expect(onSelectSpy).toHaveBeenCalled();
    // Second option (index 1 after ArrowDown) is c.d.
    expect(onSelectSpy.mock.calls[0][0].value).toBe("{{#c.d#}}");
    // Popover dismisses after selection.
    expect(queryByTestId("tag-input-popover")).toBeNull();
  });

  test("Escape dismisses popover", () => {
    function Controlled() {
      const [v, setV] = React.useState("");
      return (
        <TagInput
          value={v}
          onChange={setV}
          parse_chips={tok_parser}
          render_chip={tok_render}
          autocomplete={{
            trigger: "{",
            options: ac_options,
            render_option: (opt) => <span>{opt.label}</span>,
            on_select: (opt, ctx) => ctx.insert(opt.value),
          }}
        />
      );
    }
    const { container, queryByTestId } = render(wrap(<Controlled />));
    const editor = container.querySelector('[contenteditable="true"]');

    editor.appendChild(document.createTextNode("{"));
    const sel = window.getSelection();
    const range = document.createRange();
    range.setStart(editor.firstChild, 1);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    fireEvent.input(editor);

    expect(queryByTestId("tag-input-popover")).toBeTruthy();
    fireEvent.keyDown(editor, { key: "Escape" });
    expect(queryByTestId("tag-input-popover")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests, confirm fail**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npx jest src/BUILTIN_COMPONENTs/input/tag_input.test.js`
Expected: FAIL — keyboard handlers not implemented.

- [ ] **Step 3: Implement keyboard handling and selection**

In `tag_input.js`, inside `handle_key_down`, add at the top — BEFORE the existing Backspace block — popover-related handlers:

```js
function handle_key_down(e) {
  // Popover keyboard navigation takes priority when popover is open.
  if (popover && filtered_options.length > 0) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setPopover((p) => p ? { ...p, active_index: Math.min(filtered_options.length - 1, p.active_index + 1) } : p);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setPopover((p) => p ? { ...p, active_index: Math.max(0, p.active_index - 1) } : p);
      return;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      const opt = filtered_options[popover.active_index];
      if (opt) confirm_option(opt);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setPopover(null);
      return;
    }
  }

  if (e.key === "Backspace") {
    // ... (existing code unchanged)
  }
}
```

Add the `confirm_option` helper in the component:

```js
function confirm_option(opt) {
  if (!autocomplete || !popover) return;
  const ctx = {
    insert: (str) => {
      const v = value || "";
      const next = v.slice(0, popover.trigger_offset) + str + v.slice(popover.trigger_offset + 1 + popover.query.length);
      pending_caret.current = popover.trigger_offset + str.length;
      onChange(next);
    },
    replace_range: (start, end, str) => {
      const v = value || "";
      const next = v.slice(0, start) + str + v.slice(end);
      pending_caret.current = start + str.length;
      onChange(next);
    },
  };
  autocomplete.on_select(opt, ctx);
  setPopover(null);
}
```

Add outside-click dismissal effect:

```js
useEffect(() => {
  if (!popover) return undefined;
  function on_doc_mousedown(e) {
    if (!root_ref.current) return;
    if (root_ref.current.contains(e.target)) return;
    setPopover(null);
  }
  document.addEventListener("mousedown", on_doc_mousedown);
  return () => document.removeEventListener("mousedown", on_doc_mousedown);
}, [popover]);
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npx jest src/BUILTIN_COMPONENTs/input/tag_input.test.js`
Expected: PASS — 11 tests.

- [ ] **Step 5: Stop. Move to Task 9.**

---

## Task 9: ChipEditor wrapper — write tests for new behavior

**Files:**
- Create: `src/COMPONENTs/agents/pages/recipes_page/chip_editor.test.js`

Write tests against the NEW `ChipEditor` API behavior. We'll keep the existing public API (`value`/`onChange`/`scope`/`placeholder`) so `agent_panel.test.js` keeps passing.

- [ ] **Step 1: Write the failing tests**

Create `src/COMPONENTs/agents/pages/recipes_page/chip_editor.test.js`:

```js
import React from "react";
import { render, fireEvent, screen } from "@testing-library/react";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import ChipEditor from "./chip_editor";

const cfg = { theme: {}, onThemeMode: "light_mode" };
const wrap = (ui) => (
  <ConfigContext.Provider value={cfg}>{ui}</ConfigContext.Provider>
);

const scope = [
  { node_id: "start", field: "text", type: "string" },
  { node_id: "start", field: "image", type: "image[]" },
];

describe("ChipEditor", () => {
  test("renders chip for known variable token", () => {
    const { container } = render(
      wrap(
        <ChipEditor
          value="Hi {{#start.text#}}"
          onChange={() => {}}
          scope={scope}
        />,
      ),
    );
    expect(container.querySelector('[data-var-chip="start.text"]')).toBeTruthy();
  });

  test("renders chip for known system prompt token", () => {
    const { container } = render(
      wrap(
        <ChipEditor
          value="Use {{USE_BUILTIN_DEVELOPER_PROMPT}}"
          onChange={() => {}}
          scope={scope}
        />,
      ),
    );
    expect(
      container.querySelector('[data-system-prompt-chip="USE_BUILTIN_DEVELOPER_PROMPT"]'),
    ).toBeTruthy();
  });

  test("shows diagnostics row for unknown variable", () => {
    const { getByRole } = render(
      wrap(
        <ChipEditor
          value="Hi {{#missing.x#}}"
          onChange={() => {}}
          scope={scope}
        />,
      ),
    );
    const alert = getByRole("alert");
    expect(alert.textContent).toMatch(/Unknown variable/);
  });

  test("autocomplete options include scope variables and known system prompts", () => {
    function Controlled() {
      const [v, setV] = React.useState("");
      return <ChipEditor value={v} onChange={setV} scope={scope} />;
    }
    const { container, queryByTestId } = render(wrap(<Controlled />));
    const editor = container.querySelector('[contenteditable="true"]');

    editor.appendChild(document.createTextNode("{"));
    const sel = window.getSelection();
    const range = document.createRange();
    range.setStart(editor.firstChild, 1);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    fireEvent.input(editor);

    const popover = queryByTestId("tag-input-popover");
    expect(popover).toBeTruthy();
    expect(popover.textContent).toContain("start.text");
    expect(popover.textContent).toContain("Built-in developer prompt");
  });
});
```

- [ ] **Step 2: Run tests, confirm fail**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npx jest src/COMPONENTs/agents/pages/recipes_page/chip_editor.test.js`
Expected: FAIL — old `ChipEditor` doesn't have a contentEditable; tests assume new architecture.

- [ ] **Step 3: Stop. Move to Task 10 to actually rewrite ChipEditor.**

---

## Task 10: ChipEditor rewrite using TagInput

**Files:**
- Rewrite: `src/COMPONENTs/agents/pages/recipes_page/chip_editor.js`

Replace the entire file with a thin wrapper around `TagInput`.

- [ ] **Step 1: Replace `chip_editor.js` with the new implementation**

Overwrite `src/COMPONENTs/agents/pages/recipes_page/chip_editor.js` with:

```js
import React, { useContext, useCallback, useMemo } from "react";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import TagInput from "../../../../BUILTIN_COMPONENTs/input/tag_input";
import { parse_chip_string } from "./chip_editor_parse";

const SOURCE_DOT_COLOR = {
  start: "#4cbe8b",
  agent: "#6478f6",
  end: "#e06a9a",
};

const KNOWN_SYSTEM_PROMPTS = {
  USE_BUILTIN_DEVELOPER_PROMPT: {
    label: "Built-in developer prompt",
    description: "Applies the built-in developer prompt at runtime",
  },
  SUBAGENT_LIST: {
    label: "Subagent list",
    description: "Expands to the available subagent list at runtime",
  },
};

function get_chip_meta(node, scope) {
  if (node.kind === "system_prompt") {
    const known = KNOWN_SYSTEM_PROMPTS[node.name];
    if (known) {
      return { label: known.label, title: `${known.description}: {{${node.name}}}` };
    }
    return { unknown: true, title: `Unknown system prompt: {{${node.name}}}` };
  }
  if (node.kind === "var") {
    const key = `${node.node_id}.${node.field}`;
    const exists = (scope || []).some(
      (entry) => `${entry.node_id}.${entry.field}` === key,
    );
    if (!exists) return { unknown: true, title: `Unknown variable: {{#${key}#}}` };
  }
  return {};
}

function get_diagnostics(value, scope) {
  return parse_chip_string(value || "")
    .map((node) => {
      const meta = get_chip_meta(node, scope);
      if (!meta.unknown) return null;
      if (node.kind === "system_prompt") {
        return `Unknown system prompt {{${node.name}}}. Check spelling or remove it.`;
      }
      if (node.kind === "var") {
        return `Unknown variable {{#${node.node_id}.${node.field}#}}. Connect the source node or check spelling.`;
      }
      return null;
    })
    .filter(Boolean);
}

function node_raw_text(node) {
  if (node.kind === "var") return `{{#${node.node_id}.${node.field}#}}`;
  if (node.kind === "system_prompt") return `{{${node.name}}}`;
  return node.value || "";
}

function render_pupu_chip(seg) {
  const { node, meta } = seg.data;
  const isSystemPrompt = node.kind === "system_prompt";
  const isUnknown = !!meta.unknown;
  const label = isSystemPrompt ? (meta.label || node.name) : `${node.node_id}.${node.field}`;
  const dataAttrs = isSystemPrompt
    ? { "data-system-prompt-chip": node.name }
    : { "data-var-chip": `${node.node_id}.${node.field}` };
  const color = isUnknown ? "#c2410c" : isSystemPrompt ? "#0f766e" : "#4f46e5";
  const background = isUnknown
    ? "rgba(234,88,12,0.12)"
    : isSystemPrompt
      ? "rgba(20,184,166,0.12)"
      : "rgba(99,102,241,0.12)";
  const border = isUnknown
    ? "1px solid rgba(234,88,12,0.28)"
    : isSystemPrompt
      ? "1px solid rgba(20,184,166,0.28)"
      : "1px solid rgba(99,102,241,0.25)";
  const dotColor = isUnknown
    ? "#ea580c"
    : isSystemPrompt
      ? "#14b8a6"
      : SOURCE_DOT_COLOR[node.node_id] || SOURCE_DOT_COLOR.start;

  return (
    <span
      {...dataAttrs}
      data-chip-invalid={isUnknown ? "true" : undefined}
      title={meta.title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        background,
        color,
        borderRadius: 5,
        padding: "1px 6px 1px 4px",
        fontFamily: "ui-monospace, Menlo, monospace",
        fontSize: 11,
        fontWeight: 600,
        margin: "0 1px",
        border,
        userSelect: "none",
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: dotColor }} />
      {label}
    </span>
  );
}

function build_autocomplete_options(scope) {
  const groups = new Map();
  for (const entry of scope || []) {
    if (!entry || !entry.node_id || !entry.field) continue;
    if (!groups.has(entry.node_id)) groups.set(entry.node_id, []);
    const label = `${entry.node_id}.${entry.field}`;
    groups.get(entry.node_id).push({
      value: `{{#${entry.node_id}.${entry.field}#}}`,
      label,
      search: label,
      description: entry.type || "",
    });
  }
  const var_groups = [...groups.entries()].map(([node_id, options]) => ({
    group: `From ${node_id}`,
    options,
  }));
  const system_group = {
    group: "System prompts",
    options: Object.entries(KNOWN_SYSTEM_PROMPTS).map(([name, info]) => ({
      value: `{{${name}}}`,
      label: info.label,
      search: `${name} ${info.label}`,
      description: info.description,
    })),
  };
  return [...var_groups, system_group];
}

function render_pupu_option(opt) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11.5 }}>
        {opt.label}
      </span>
      {opt.description && (
        <span style={{ fontSize: 10, color: "#86868b" }}>{opt.description}</span>
      )}
    </div>
  );
}

export default function ChipEditor({ value, onChange, scope, placeholder }) {
  const cfg = useContext(ConfigContext);
  const isDark = cfg?.onThemeMode === "dark_mode";

  const parse_chips = useCallback(
    (s) =>
      parse_chip_string(s).map((node) => {
        if (node.kind === "text") return { kind: "text", value: node.value };
        return {
          kind: "chip",
          raw: node_raw_text(node),
          data: { node, meta: get_chip_meta(node, scope) },
        };
      }),
    [scope],
  );

  const autocomplete_options = useMemo(() => build_autocomplete_options(scope), [scope]);

  const diagnostics = useMemo(() => get_diagnostics(value, scope), [value, scope]);

  return (
    <div style={{ position: "relative" }}>
      <TagInput
        value={value || ""}
        onChange={onChange}
        parse_chips={parse_chips}
        render_chip={render_pupu_chip}
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
      {diagnostics.length > 0 && (
        <div
          role="alert"
          style={{
            marginTop: 6,
            padding: "6px 8px",
            borderRadius: 6,
            background: isDark ? "rgba(234,88,12,0.12)" : "#fff7ed",
            border: isDark
              ? "1px solid rgba(251,146,60,0.22)"
              : "1px solid rgba(251,146,60,0.28)",
            color: isDark ? "#fdba74" : "#9a3412",
            fontSize: 10.5,
            lineHeight: 1.45,
          }}
        >
          {diagnostics.map((message) => (
            <div key={message}>{message}</div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run new ChipEditor tests, confirm pass**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npx jest src/COMPONENTs/agents/pages/recipes_page/chip_editor.test.js`
Expected: PASS — 4 tests.

- [ ] **Step 3: Run agent_panel existing tests, confirm still pass**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npx jest src/COMPONENTs/agents/pages/recipes_page/detail_panel/agent_panel.test.js`
Expected: PASS — 3 tests.

If the "clicking an input variable appends it to the prompt" test fails, that's expected — it asserts on the panel-level upstream-variable list, not on `ChipEditor`. The panel's variable list is rendered by `agent_panel.js` and routes clicks through `set_override_silent`, which still works because `ChipEditor`'s `onChange` is wired to it. Verify the assertion `expect(call.nodes[1].override.prompt).toBe("Hi {{#start.text#}}")` still holds. If not, the failure is unrelated to ChipEditor — investigate before proceeding.

- [ ] **Step 4: Run all tests in the recipes_page tree to catch regressions**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npx jest src/COMPONENTs/agents/pages/recipes_page src/BUILTIN_COMPONENTs/input/tag_input`
Expected: PASS — all tests in scope.

- [ ] **Step 5: Stop. Move to Task 11.**

---

## Task 11: Manual smoke verification

This is unavoidable — contentEditable behavior in jsdom is heavily simplified. The real verification happens in the browser.

**Files:** None (manual verification).

- [ ] **Step 1: Start dev server**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npm start`

Wait for the React dev server (port 2907) and Electron window to open.

- [ ] **Step 2: Navigate to the Agents → Recipes page and select a recipe with at least one Agent node**

Use an existing recipe or create one with: start → agent → end.

- [ ] **Step 3: Click the agent node and verify the prompt input is now WYSIWYG**

Expect:
- The Prompt section shows a single editable area (no more edit/preview toggle).
- Existing tokens like `{{#start.text#}}` render as colored chips inline.
- No "+ Variable" Select picker below the input.

- [ ] **Step 4: Type plain text and verify**

Expect: Text appears as you type. No flicker, caret stays in expected position.

- [ ] **Step 5: Type `{` and verify the autocomplete popover**

Expect:
- A popover appears at the caret position with grouped options ("From start", "System prompts").
- ↑/↓ navigate, Enter inserts the selected option as a chip.
- The literal `{` and any typed query are replaced by the chip's raw token.
- Esc closes the popover, leaving the literal `{` in place.

- [ ] **Step 6: Position caret right after a chip and press Backspace**

Expect: The whole chip disappears in one keypress. Recipe history records the deletion (Cmd+Z restores it).

- [ ] **Step 7: Use arrow keys to move past a chip**

Expect: Left/Right arrows skip over a chip in one keypress (do not land "inside" the chip span).

- [ ] **Step 8: Test paste**

Copy `Hello {{#start.text#}} world` from elsewhere, paste into the editor.
Expect: Plain text inserts; the token re-renders as a chip.

- [ ] **Step 9: Test diagnostics**

Type `{{#nonexistent.x#}}` manually (Esc to skip the autocomplete).
Expect: An orange diagnostic bar appears below the editor noting the unknown variable.

- [ ] **Step 10: Test undo/redo**

Make a few edits, press Cmd+Z. Expect prior state restored. Cmd+Shift+Z redoes.

- [ ] **Step 11: Stop. Report results to user.**

If everything works, the user will commit. If anything fails, return to the failing task with concrete repro steps.

---

## Self-Review Checklist (run after writing this plan)

- ✅ **Spec coverage:** Every section of `2026-04-25-tag-input-component-design.md` has a corresponding task. The pure helper extraction (Task 1) is implementation detail not in spec but justifies clean unit testing.
- ✅ **No placeholders:** Each step has the complete code or exact command. No TBD/TODO.
- ✅ **Type consistency:** Function names match across tasks (`extract_value`, `dom_to_offset`, `offset_to_dom`, `compute_popover_state`, `confirm_option`, `handle_input`, `handle_key_down`, `handle_paste`).
- ✅ **TDD ordering:** Each task writes the test first, runs it to fail, implements, runs to pass.
- ✅ **No commits:** Per user's standing preference (memory: "永远不要主动 commit"), no task includes a commit step. User commits when satisfied.

import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import TagInput from "./tag_input";

const cfg = { theme: {}, onThemeMode: "light_mode" };
const wrap = (ui) => (
  <ConfigContext.Provider value={cfg}>{ui}</ConfigContext.Provider>
);

const tok_parser = (s) => {
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
    editor.appendChild(document.createTextNode("!"));
    fireEvent.input(editor);
    expect(onChange).toHaveBeenCalledWith("Hi {{TOK}}!");
  });

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

    const text = editor.firstChild;
    const sel = window.getSelection();
    const range = document.createRange();
    range.setStart(text, 2);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);

    text.textContent = "Hi!";
    const range_after = document.createRange();
    range_after.setStart(editor.firstChild, 3);
    range_after.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range_after);
    fireEvent.input(editor);

    const sel2 = window.getSelection();
    expect(sel2.rangeCount).toBe(1);
    const r = sel2.getRangeAt(0);
    expect(r.startContainer.textContent).toBe("Hi!");
    expect(r.startOffset).toBe(3);
  });

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

    const sel = window.getSelection();
    const range = document.createRange();
    range.setStart(editor, 2);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);

    fireEvent.keyDown(editor, { key: "Backspace" });

    expect(editor.querySelector("[data-chip-raw]")).toBeNull();
    expect(editor.textContent).toBe("Hi ");
  });

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

    const chip = editor.querySelector('[data-chip-raw="{{TOK}}"]');
    expect(chip).toBeTruthy();
    expect(editor.textContent).toBe("Pre TOK Post");
  });

  test("typing trigger char opens popover with options", () => {
    const ac_options = [
      { value: "{{#a.b#}}", label: "a.b", search: "a.b" },
      { value: "{{#c.d#}}", label: "c.d", search: "c.d" },
    ];
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

    const popover = queryByTestId("tag-input-popover");
    expect(popover).toBeTruthy();
    expect(popover.textContent).toContain("a.b");
    expect(popover.textContent).toContain("c.d");
  });

  test("ArrowDown + Enter selects an option", () => {
    const ac_options = [
      { value: "{{#a.b#}}", label: "a.b", search: "a.b" },
      { value: "{{#c.d#}}", label: "c.d", search: "c.d" },
    ];
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
    expect(onSelectSpy.mock.calls[0][0].value).toBe("{{#c.d#}}");
    expect(queryByTestId("tag-input-popover")).toBeNull();
  });

  test("Escape dismisses popover", () => {
    const ac_options = [
      { value: "{{#a.b#}}", label: "a.b", search: "a.b" },
    ];
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

  test("typing first char into empty editor does not duplicate (regression)", () => {
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

    editor.appendChild(document.createTextNode("h"));
    fireEvent.input(editor);

    expect(editor.textContent).toBe("h");
  });

  test("auto chip formation rebuilds DOM with chip span", () => {
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

    editor.appendChild(document.createTextNode("{{TOK}}"));
    fireEvent.input(editor);

    expect(editor.querySelector('[data-chip-raw="{{TOK}}"]')).toBeTruthy();
    expect(editor.textContent).toBe("TOK");
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

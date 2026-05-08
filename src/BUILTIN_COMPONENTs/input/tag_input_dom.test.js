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
    expect(dom_to_offset(root, root, 2)).toBe(3 + 7);
  });

  test("inside text after chip", () => {
    const root = build('<span data-chip-raw="{{TOK}}">TOK</span>!!');
    const tail = root.childNodes[1];
    expect(dom_to_offset(root, tail, 1)).toBe(7 + 1);
  });

  test("inside a chip span snaps to chip end", () => {
    const root = build('<span data-chip-raw="{{TOK}}">TOK</span>');
    const inner = root.firstChild.firstChild;
    expect(dom_to_offset(root, inner, 1)).toBe(7);
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
    const r = offset_to_dom(root, 3);
    expect(r.node).toBe(root);
    expect(r.offset).toBe(1);
  });

  test("after a chip returns container index past it", () => {
    const root = build('<span data-chip-raw="{{TOK}}">TOK</span>X');
    const r = offset_to_dom(root, 7);
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

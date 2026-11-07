import { is_valid_node_label, node_display_title } from "./node_display_labels";
import { NODE_KEYS, document_problems, drawn_node } from "./skeleton_document";

const graph = (node) => ({
  schema_version: 1, kind: "agent", id: "root", name: "Root", nodes: [node], edges: [],
});
const node = (label) => ({ id: "agent", type: "agent", config: { opaque: ["kept"] }, label });
const PYTHON_WHITESPACE = "\u0009\u000a\u000b\u000c\u000d\u001c\u001d\u001e\u001f\u0020\u0085\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000";

test.each(["Name", "  审核 e\u0301\n", "\ufeff", "\u0085name\u0085"])(
  "valid display label preserves exact text: %j", (label) => {
    const stored = node(label);
    expect(is_valid_node_label(label)).toBe(true);
    expect(document_problems(graph(stored))).toEqual([]);
    expect(drawn_node(stored)).toEqual(stored);
    expect(drawn_node(stored).config).toBe(stored.config);
    expect(node_display_title(stored, "Agent")).toBe(label);
    expect(stored.label).toBe(label);
  },
);

test.each(["", PYTHON_WHITESPACE, ...Array.from(PYTHON_WHITESPACE)])(
  "Python whitespace-only label diagnoses and cannot reach drawing: %j", (label) => {
    const stored = node(label);
    expect(is_valid_node_label(label)).toBe(false);
    expect(document_problems(graph(stored))).toContainEqual({
      code: "invalid_value", where: "document.nodes[0].label", message: "node label must be non-blank",
    });
    expect(drawn_node(stored)).toEqual({ id: stored.id, type: stored.type, config: stored.config });
    expect(node_display_title(stored, "Agent")).toBe("Agent");
    expect(stored.label).toBe(label);
  },
);

test.each([null, undefined, true, 2, [], {}, new String("Name"), { toString: () => { throw new Error("coerced"); } }])(
  "invalid label types remain diagnostic without coercion: %j", (label) => {
    const stored = node(label);
    expect(is_valid_node_label(label)).toBe(false);
    expect(document_problems(graph(stored))).toContainEqual({
      code: "invalid_type", where: "document.nodes[0].label", message: "node label must be a string",
    });
    expect(drawn_node(stored)).toEqual({ id: stored.id, type: stored.type, config: stored.config });
    expect(node_display_title(stored, "Agent")).toBe("Agent");
    expect(stored.label).toBe(label);
  },
);

test("optional label leaves required keys and unknown-field defenses intact", () => {
  expect(NODE_KEYS).toEqual(["id", "type", "config"]);
  const stored = { id: "start", type: "start", config: {} };
  expect(document_problems(graph(stored))).toEqual([]);
  expect(drawn_node(stored)).toEqual(stored);
  expect(node_display_title(stored, "Start")).toBe("Start");
  expect(document_problems(graph({ ...stored, label: "Named", display_name: "Unknown" })))
    .toContainEqual({ code: "unknown_field", where: "document.nodes[0].display_name", message: "unknown field" });
  const absent = { ...stored, label: "Named" };
  delete absent.config;
  expect(document_problems(graph(absent))).toContainEqual({
    code: "missing_field", where: "document.nodes[0].config", message: "required field is missing",
  });
});

test.each([null, undefined, 2, {}, { toString: () => { throw new Error("coerced"); } }])(
  "unknown title fallback is never stringified: %j", (fallback) => {
    expect(node_display_title(null, fallback)).toBe("");
    expect(node_display_title({ label: {} }, fallback)).toBe("");
  },
);

/* eslint-disable testing-library/no-node-access -- the highlight layer is aria-hidden markup; its token spans are what is under test. */
import React, { useState } from "react";

/* This suite checks the guidance's contract and document writes. The real
   disclosure interaction and compact surface are tested in panel_help.test.js. */
jest.mock("./panel_help", () => function GuidanceText({ children }) { return <>{children}</>; });
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import CodeSection from "./code_section";
import { python_profiles } from "../skeleton_resources";
import capture from "../code_capture.json";

/* The Code panel (#357), fed the store's own answers: the Python profile
 * list, the save and the probe were captured from the real store on the fixed
 * installed runtime (code_capture.json, code-01/out/code-store-capture.json).
 * Only the controls are probes. */

jest.mock("../skeleton_resources", () => ({
  python_profiles: jest.fn(),
}));
jest.mock("../../../../../BUILTIN_COMPONENTs/select/select", () => function MockSelect({ options, value, set_value, disabled, placeholder }) {
  return (
    <select data-testid="select" value={value === undefined || value === null ? "" : value} disabled={disabled}
      onChange={(event) => set_value(event.target.value)}>
      <option value="">{placeholder || ""}</option>
      {(options || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
});
jest.mock("../../../../../BUILTIN_COMPONENTs/input/input", () => function MockInput({ value, set_value, placeholder, disabled, aria_label, style }) {
  return <input aria-label={aria_label} placeholder={placeholder} value={value} disabled={disabled} data-style={JSON.stringify(style || {})}
    onChange={(event) => set_value(event.target.value)} />;
});
jest.mock("../../../../../BUILTIN_COMPONENTs/input/textfield", () => function MockTextField({ value, set_value, placeholder }) {
  return <textarea data-testid="json-text" placeholder={placeholder} value={value} onChange={(event) => set_value(event.target.value)} />;
});
jest.mock("../../../../../BUILTIN_COMPONENTs/input/button", () => function MockButton({ label, ariaLabel, onClick, disabled }) {
  return <button type="button" aria-label={ariaLabel} disabled={disabled} onClick={onClick}>{label || ariaLabel}</button>;
});
jest.mock("../../../../../BUILTIN_COMPONENTs/input/switch", () => {
  const MockSwitch = function MockSwitch({ on, set_on }) {
    return <input type="checkbox" role="switch" checked={Boolean(on)} onChange={(event) => set_on(event.target.checked)} />;
  };
  return { __esModule: true, default: MockSwitch, SemiSwitch: MockSwitch };
});

const PROFILES = capture.profiles.list_after;
const complete = capture.rows.find((row) => row.case === "complete").config.code;
const ref = (name, node_id, field) => ({ name, value: { kind: "ref", node_id, path: [field] }, missing: "error" });
const graph = (codeNode, kind = "agent") => ({
  schema_version: 1, kind, id: "doc", name: "doc",
  nodes: [
    { id: "start", type: "start", config: { execution: { outputs: [{ name: "message", source: { kind: "result", path: ["message"] } }] } } },
    codeNode,
    { id: "router", type: "agent", config: { execution: { inputs: [], outputs: [] } } },
  ],
  edges: [],
});
const codeNode = (code) => ({ id: "score", type: "code", config: { execution: { inputs: [ref("diff", "start", "message")], outputs: [] }, ...(code === undefined ? {} : { code }) } });

let latest;
let writes;
function Harness({ initial }) {
  const [document, setDocument] = useState(initial);
  latest = document;
  return (
    <CodeSection document={document} node={document.nodes[1]} revision={1} isDark={false}
      onChange={(next) => { writes.push(next); setDocument(next); }} />
  );
}
const settle = () => act(async () => {
  for (let tick = 0; tick < 6; tick += 1) await Promise.resolve();
});
const show = async (document) => {
  writes = [];
  render(<Harness initial={document} />);
  await settle();
};
const stored = () => latest.nodes[1].config.code;
/* Every problem the panel says, wherever it says it (each section says its
   own; the rest is said under the panel). */
const said = (root = document.body) => [...root.querySelectorAll('[data-testid^="code-problems"]')].map((node) => node.textContent).join(" ");
const limitBox = (label) => within(screen.getByTestId("code-limits")).getByRole("textbox", { name: label });
const TIME = "Run time ≤ seconds";
const RESULT = "Result size ≤ bytes";
const LOG = "Printed output kept ≤ bytes";

beforeEach(() => {
  python_profiles.mockResolvedValue({ ok: true, data: { profiles: PROFILES } });
});

describe("a new Code node", () => {
  test("an old node with no settings has ONE next step, and opening it writes nothing", async () => {
    await show(graph(codeNode(undefined)));
    expect(within(screen.getByTestId("code-source")).getByTestId("code-problems-source")).toHaveTextContent("Write the code for this step.");
    expect(within(screen.getByTestId("code-source")).getByTestId("process-problems-code-source")).toHaveTextContent("1");
    expect(said()).toBe("Write the code for this step.");
    expect(screen.queryByTestId("process-problems-code-limits")).toBeNull();
    expect(screen.queryByTestId("process-problems-code-result")).toBeNull();
    expect(writes).toEqual([]);

    /* Python only: no picker. */
    expect(screen.queryByTestId("code-runtime")).toBeNull();
    expect(screen.queryByTestId("select")).toBeNull();
    expect(screen.queryByRole("button", { name: /Name a Python/ })).toBeNull();
    /* Unset limits are their defaults: shown, not complained about. */
    fireEvent.change(limitBox(TIME), { target: { value: "45" } });
    expect(stored()).toStrictEqual({ timeout_ms: 45000 });
    expect(said()).toBe("Write the code for this step.");
  });

  test("code without a declared Result: exactly one problem, said at Result", async () => {
    const { result_schema: _gone, ...noResult } = complete;
    await show(graph(codeNode(noResult)));
    expect(within(screen.getByTestId("code-result")).getByTestId("code-problems-result")).toHaveTextContent("Add the fields your code returns.");
    expect(within(screen.getByTestId("code-result")).getByTestId("process-problems-code-result")).toHaveTextContent("1");
    expect(said()).toBe("Add the fields your code returns.");
  });

  test("the source is written only as a normalized relative path; other text is held, not stored", async () => {
    await show(graph(codeNode({ environment_profile_id: "builtin" })));
    /* A node with no source opens on the text (#357 G1); a file is the
       author's choice. */
    fireEvent.click(within(screen.getByTestId("code-source")).getByText("Use a workspace file"));
    const box = within(screen.getByTestId("code-source")).getByPlaceholderText("tools/score.py");
    fireEvent.change(box, { target: { value: "/abs/score.py" } });
    expect(stored()).toStrictEqual({ environment_profile_id: "builtin" });
    expect(screen.getByTestId("code-source-problem")).toHaveTextContent("relative");
    expect(box).toHaveValue("/abs/score.py");
    fireEvent.change(box, { target: { value: "tools/score.py" } });
    expect(stored().source).toStrictEqual({ kind: "file", path: "tools/score.py" });
    expect(screen.queryByTestId("code-source-problem")).toBeNull();
    expect(screen.getByTestId("code-source-note")).toHaveTextContent("read from this file inside the run's workspace");
  });

  test("limits are whole numbers inside the runtime's bounds; the timeout is typed in seconds", async () => {
    await show(graph(codeNode({ environment_profile_id: "builtin" })));
    fireEvent.change(limitBox(TIME), { target: { value: "0" } });
    expect(stored().timeout_ms).toBeUndefined();
    expect(screen.getByTestId("code-timeout-score-problem")).toHaveTextContent("whole number from 1 to 86400");
    fireEvent.change(limitBox(TIME), { target: { value: "30" } });
    expect(stored().timeout_ms).toBe(30000);
    fireEvent.change(limitBox(RESULT), { target: { value: "8388609" } });
    expect(stored().max_result_bytes).toBeUndefined();
    fireEvent.change(limitBox(RESULT), { target: { value: "1048576" } });
    fireEvent.change(limitBox(LOG), { target: { value: "1048576" } });
    expect(stored()).toMatchObject({ timeout_ms: 30000, max_result_bytes: 1048576, max_log_bytes: 1048576 });
  });

  test("each limit is one row: what it bounds, an upper-bound sign, a borderless number and its unit", async () => {
    await show(graph(codeNode({ environment_profile_id: "builtin" })));
    /* Unset: the placeholder is the default it stands for. */
    const rows = [["code-timeout-score", "Run time", "seconds", "30"],
      ["code-result-bytes-score", "Result size", "bytes", "1048576"],
      ["code-log-bytes-score", "Printed output kept", "bytes", "1048576"]];
    rows.forEach(([testid, label, unit, range]) => {
      const row = screen.getByTestId(testid);
      expect(row).toHaveTextContent(label);
      expect(within(row).getByTestId(`${testid}-sign`)).toHaveTextContent("≤");
      expect(row).toHaveTextContent(unit);
      const box = within(row).getByRole("textbox");
      /* The range it takes is the placeholder; nothing is pre-filled. */
      expect(box).toHaveAttribute("placeholder", range);
      expect(screen.queryByTestId("process-problems-code-limits")).toBeNull();
      expect(box).toHaveValue("");
      /* The variable row's field: no border, no fill at rest, hover or press. */
      const style = JSON.parse(box.getAttribute("data-style"));
      expect(style).toMatchObject({ border: 0, boxShadow: "none", hoverBackgroundColor: "transparent", activeBackgroundColor: "transparent",
        "--pupu-overlay-hover": "transparent", "--pupu-overlay-active": "transparent" });
    });
  });

  test("a half-typed limit is held unstored; emptying a box goes back to the default", async () => {
    await show(graph(codeNode(complete)));
    expect(limitBox(TIME)).toHaveValue("30");
    fireEvent.change(limitBox(TIME), { target: { value: "4." } });
    expect(stored().timeout_ms).toBe(30000);
    expect(limitBox(TIME)).toHaveValue("4.");
    expect(screen.getByTestId("code-timeout-score-problem")).toHaveTextContent("Enter a whole number. Nothing is stored until it is one.");
    fireEvent.change(limitBox(TIME), { target: { value: "45" } });
    expect(stored().timeout_ms).toBe(45000);
    fireEvent.change(limitBox(TIME), { target: { value: "" } });
    expect(Object.prototype.hasOwnProperty.call(stored(), "timeout_ms")).toBe(false);
    expect(limitBox(TIME)).toHaveValue("");
    expect(limitBox(TIME)).toHaveAttribute("placeholder", "30");
    expect(said()).toBe("");
    const { timeout_ms: _dropped, ...rest } = complete;
    expect(stored()).toStrictEqual(rest);
  });

  test("the first declared field creates a closed object schema; the Result's fields are the output roots", async () => {
    await show(graph(codeNode({ environment_profile_id: "builtin" })));
    fireEvent.click(screen.getByRole("button", { name: "+ Add field" }));
    expect(stored().result_schema).toStrictEqual({ type: "object", properties: { "": { type: "string" } }, additionalProperties: false });
    fireEvent.change(within(screen.getByTestId("schema-field-0")).getByPlaceholderText("field name"), { target: { value: "rows" } });
    expect(stored().result_schema.properties).toStrictEqual({ rows: { type: "string" } });
    expect(screen.getByTestId("code-result-closed-caption")).toHaveTextContent("Only these fields");
    /* The last switch is the schema's own; each field row carries a `required` one before it. */
    fireEvent.click(screen.getAllByRole("switch").at(-1));
    expect(stored().result_schema.additionalProperties).toBeUndefined();
    expect(screen.getByTestId("code-result-closed-caption")).toHaveTextContent("Other keys are allowed");
  });
});

describe("a stored Code node", () => {
  test("shows the real complete config as it is and has nothing to complain about", async () => {
    await show(graph(codeNode(complete)));
    expect(within(screen.getByTestId("code-source")).queryByTestId("select")).toBeNull();
    expect(within(screen.getByTestId("code-source")).getByPlaceholderText("tools/score.py")).toHaveValue("tools/score.py");
    expect(limitBox(TIME)).toHaveValue("30");
    expect(within(screen.getByTestId("schema-field-0")).getByPlaceholderText("field name")).toHaveValue("rows");
    expect(within(screen.getByTestId("schema-field-1")).getByPlaceholderText("field name")).toHaveValue("summary");
    expect(said()).toBe("");
    expect(writes).toEqual([]);
  });

  test("a Python this machine does not have is kept as stored, named, and has one way back", async () => {
    const missing = capture.rows.find((row) => row.case === "profile-missing").config.code;
    await show(graph(codeNode(missing)));
    expect(said()).toContain("uses a Python named “nope” that this computer doesn't have");
    /* An edit elsewhere keeps the stored Python exactly as it is. */
    fireEvent.change(limitBox(TIME), { target: { value: "31" } });
    expect(stored()).toStrictEqual({ ...missing, timeout_ms: 31000 });
    fireEvent.click(within(screen.getByTestId("code-python-repair")).getByRole("button", { name: "Use the built-in Python" }));
    expect(stored()).toStrictEqual({ ...missing, timeout_ms: 31000, environment_profile_id: "builtin" });
    expect(screen.queryByTestId("code-python-repair")).toBeNull();
  });

  test("a stored Python the machine has is never rewritten and offers nothing to change", async () => {
    await show(graph(codeNode({ ...complete, environment_profile_id: "pupu-tools" })));
    expect(screen.queryByTestId("code-python-repair")).toBeNull();
    expect(within(screen.getByTestId("code-source")).queryByTestId("select")).toBeNull();
    fireEvent.change(limitBox(RESULT), { target: { value: "2048" } });
    expect(stored()).toStrictEqual({ ...complete, environment_profile_id: "pupu-tools", max_result_bytes: 2048 });
  });

  test("a key this runtime does not read is named and can be removed; the rest is kept", async () => {
    const withExtra = capture.rows.find((row) => row.case === "unknown-code-key-on-error").config.code;
    await show(graph(codeNode(withExtra)));
    expect(screen.getByTestId("code-setting-on_error")).toHaveTextContent("Unsupported setting: on_error");
    expect(screen.getByTestId("code-problems")).toHaveTextContent("PuPu doesn't use the setting “on_error”. Remove it.");
    fireEvent.click(screen.getByRole("button", { name: "Remove setting on_error" }));
    expect(stored()).toStrictEqual(complete);
    expect(said()).toBe("");
  });

  test("a schema the fields cannot hold is shown as JSON, never rewritten; one that is not a schema is named", async () => {
    const referenced = { type: "object", properties: { rows: { $ref: "#/$defs/count" } }, $defs: { count: { type: "integer" } } };
    await show(graph(codeNode({ ...complete, result_schema: referenced })));
    expect(screen.getByTestId("code-result-not-field-shaped")).toHaveTextContent("reusable definitions");
    expect(JSON.parse(screen.getByTestId("json-text").value)).toEqual(referenced);
    fireEvent.change(screen.getByTestId("json-text"), { target: { value: "{ not json" } });
    expect(stored().result_schema).toEqual(referenced);
    expect(screen.getByTestId("code-result-json-unreadable")).toBeInTheDocument();
    expect(writes).toEqual([]);

    await show(graph(codeNode(capture.rows.find((row) => row.case === "schema-not-dict").config.code)));
    expect(screen.getAllByTestId("code-result-undeclared").at(-1)).toHaveTextContent("not a schema this editor can read");
    expect(screen.getAllByTestId("code-problems-result").at(-1)).toHaveTextContent("must describe an object");
  });

  test("stored artifacts are listed as they are and can only be removed", async () => {
    await show(graph(codeNode(capture.rows.find((row) => row.case === "complete-artifacts").config.code)));
    expect(screen.getByTestId("code-artifacts")).toHaveTextContent("report.txt ← att-1");
    fireEvent.click(screen.getByRole("button", { name: "Remove artifact 0" }));
    expect(stored().artifacts).toEqual([]);
  });

  /* #357 G7: a Workflow holds Code steps and is edited like an Agent; a
     document of any other kind stays read-only. */
  test("a Workflow document is editable here", async () => {
    await show(graph(codeNode(complete), "workflow"));
    expect(screen.getByTestId("code-section")).not.toHaveTextContent("read-only here");
    expect(limitBox(TIME)).not.toBeDisabled();
  });

  test("a document of another kind is read-only here", async () => {
    await show(graph(codeNode(complete), "recipe"));
    expect(screen.getByTestId("code-section")).toHaveTextContent("read-only here");
    expect(limitBox(TIME)).toBeDisabled();
  });
});

describe("R-357-02: On error says what the installed runtime does", () => {
  test("a bad return fails the run, an exception or timeout leaves it unknown; nothing is published downstream", async () => {
    await show(graph(codeNode(complete)));
    const section = screen.getByTestId("code-on-error");
    const text = section.textContent;
    /* Nothing to choose: two plain rows, no control. */
    expect(within(section).queryByRole("switch")).toBeNull();
    expect(within(section).queryByTestId("select")).toBeNull();
    expect(screen.getByTestId("code-on-error-raises")).toHaveTextContent("Error or time limit");
    expect(screen.getByTestId("code-on-error-raises")).toHaveTextContent("Run stops");
    expect(screen.getByTestId("code-on-error-mismatch")).toHaveTextContent("Result doesn't match");
    expect(screen.getByTestId("code-on-error-mismatch")).toHaveTextContent("Run stops");
    expect(text).toMatch(/outcome is unknown/);
    expect(text).toMatch(/fails at this node/);
    expect(text).toMatch(/nothing from this node is passed on/i);
    /* No raw codes in what the author reads. */
    expect(text).not.toMatch(/outcome_unknown|output_invalid|invalid_type|handler_error/);
  });
});

describe("R-357-03: the JSON editor stays with its author", () => {
  const titled = { type: "object", title: "Author JSON", properties: {}, additionalProperties: false };

  test("typing a row-shaped schema keeps the textbox mounted, focused and showing the typed text", async () => {
    await show(graph(codeNode({ ...complete, result_schema: titled })));
    const box = screen.getByTestId("json-text");
    box.focus();
    const typed = '{"type":"object","properties":{},"additionalProperties":false}';
    fireEvent.change(box, { target: { value: typed } });
    expect(stored().result_schema).toEqual({ type: "object", properties: {}, additionalProperties: false });
    expect(box).toBeInTheDocument();
    expect(box).toHaveFocus();
    expect(screen.getByTestId("json-text")).toHaveValue(typed);
    /* Only the explicit switch returns to the rows. */
    fireEvent.click(screen.getByRole("button", { name: "Edit as fields" }));
    expect(screen.queryByTestId("json-text")).toBeNull();
    expect(screen.getByRole("button", { name: "+ Add field" })).toBeInTheDocument();
  });

  test("a row-shaped schema can be opened as JSON on purpose", async () => {
    await show(graph(codeNode(complete)));
    fireEvent.click(screen.getByRole("button", { name: "Edit as JSON" }));
    expect(JSON.parse(screen.getByTestId("json-text").value)).toEqual(complete.result_schema);
  });
});

describe("R-357-04: a malformed artifacts value has a way out", () => {
  test("the raw value is shown and can be removed whole; nothing else moves", async () => {
    await show(graph(codeNode({ ...complete, artifacts: { stored: "not-a-list" } })));
    expect(screen.getByTestId("code-problems")).toHaveTextContent("can't be read. Remove them.");
    expect(screen.getByTestId("code-artifacts")).toHaveTextContent('{"stored":"not-a-list"}');
    expect(writes).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Remove artifacts" }));
    expect(stored()).toStrictEqual(complete);
    expect(screen.queryByTestId("code-artifacts")).toBeNull();
  });

  test("an unreadable item inside a real list is shown raw and removed alone", async () => {
    await show(graph(codeNode({ ...complete, artifacts: [{ name: "report.txt", attachment: "att-1" }, 5] })));
    expect(screen.getByTestId("code-artifacts")).toHaveTextContent("5");
    fireEvent.click(screen.getByRole("button", { name: "Remove artifact 1" }));
    expect(stored().artifacts).toEqual([{ name: "report.txt", attachment: "att-1" }]);
  });
});

/* Second review round, R-357-01a / 03a / 04a (code-01-review-fixes-independent-20261024). */
describe("R-357-03a: the JSON editor survives any value its own text parses to", () => {
  const titled = { type: "object", title: "Keep JSON", properties: {}, additionalProperties: false };

  test.each(["null", "[]", "0", '"text"', "true"])("typing %s keeps the box, its text and focus, and says what is wrong", async (text) => {
    await show(graph(codeNode({ ...complete, result_schema: titled })));
    const box = screen.getByTestId("json-text");
    box.focus();
    fireEvent.change(box, { target: { value: text } });
    expect(stored().result_schema).toEqual(JSON.parse(text));
    expect(box).toBeInTheDocument();
    expect(box).toHaveFocus();
    expect(box).toHaveValue(text);
    expect(screen.getByTestId("code-problems-result")).toHaveTextContent("must describe an object");
    const back = JSON.stringify(titled.properties ? { type: "object", properties: {}, additionalProperties: false } : titled);
    fireEvent.change(box, { target: { value: back } });
    expect(stored().result_schema).toEqual(JSON.parse(back));
    expect(box).toHaveFocus();
    expect(said()).toBe("");
  });

  test("a stored non-object schema opened fresh still offers rows, not a box nobody asked for", async () => {
    await show(graph(codeNode({ ...complete, result_schema: null })));
    expect(screen.queryByTestId("json-text")).toBeNull();
    expect(screen.getByTestId("code-result-undeclared")).toHaveTextContent("not a schema this editor can read");
  });
});

describe("R-357-04a: a falsy malformed artifacts is still there and still removable", () => {
  test.each([null, false, 0, ""])("artifacts %j is shown raw and removed whole; nothing else moves", async (value) => {
    await show(graph(codeNode({ ...complete, artifacts: value })));
    expect(writes).toEqual([]);
    expect(screen.getByTestId("code-artifacts")).toHaveTextContent(JSON.stringify(value));
    expect(screen.getByTestId("code-problems")).toHaveTextContent("can't be read. Remove them.");
    fireEvent.click(screen.getByRole("button", { name: "Remove artifacts" }));
    expect(stored()).toStrictEqual(complete);
    expect(writes).toHaveLength(1);
  });
});

describe("the code editor", () => {
  const program = "def main(input, context):\n    return {\"n\": 1}\n";
  const typed = async (text) => {
    const { sha256_text, managed_path } = jest.requireActual("../managed_code_sources");
    const sha = sha256_text(text);
    return { code: { ...complete, source: { kind: "file", path: managed_path(sha) } }, sources: { [sha]: text } };
  };
  function EditorHarness({ initial, sources }) {
    const [document, setDocument] = useState(initial);
    const [table, setTable] = useState(sources);
    latest = document;
    return (
      <CodeSection document={document} node={document.nodes[1]} revision={1} isDark={false} sources={table}
        onChange={(next, text) => { writes.push(next); if (text) setTable({ ...table, ...text }); setDocument(next); }} />
    );
  }

  test("Python is highlighted under the text, and the text round-trips byte for byte", async () => {
    const { code, sources } = await typed(program);
    writes = [];
    render(<EditorHarness initial={graph(codeNode(code))} sources={sources} />);
    await settle();
    const box = screen.getByRole("textbox", { name: "Code of score" });
    expect(box).toHaveValue(program);
    const layer = screen.getByTestId("code-text-editor-highlight");
    expect(layer.querySelector(".hljs-keyword")).toHaveTextContent("def");
    expect(layer.querySelector(".hljs-title")).toHaveTextContent("main");
    expect(layer.querySelector(".hljs-string")).toBeInTheDocument();
    expect(layer.textContent).toBe(program + "\n");
    /* The textarea's own text is invisible; its caret is not. */
    expect(box.style.color).toBe("transparent");
    expect(box.style.caretColor).not.toBe("transparent");
    expect(box).toHaveClass("scrollable");
    expect(screen.getByTestId("code-text-editor-gutter").textContent).toBe("1\n2\n3");

    const next = program + "print(1)\n";
    fireEvent.change(box, { target: { value: next } });
    expect(stored().source.path).toMatch(/^__pupu_code__\/sha256\/[0-9a-f]{64}\.py$/);
    expect(screen.getByRole("textbox", { name: "Code of score" })).toHaveValue(next);
    expect([...screen.getByTestId("code-text-editor-highlight").querySelectorAll(".hljs-built_in")].map((node) => node.textContent)).toContain("print");
  });

  test("Tab inserts four spaces where the caret is; Shift+Tab is left to the browser", async () => {
    const { code, sources } = await typed("def main(input, context):\nreturn {}\n");
    writes = [];
    render(<EditorHarness initial={graph(codeNode(code))} sources={sources} />);
    await settle();
    const box = screen.getByRole("textbox", { name: "Code of score" });
    box.focus();
    box.setSelectionRange(26, 26);
    fireEvent.keyDown(box, { key: "Tab" });
    expect(screen.getByRole("textbox", { name: "Code of score" })).toHaveValue("def main(input, context):\n    return {}\n");
    expect(box.selectionStart).toBe(30);
    const count = writes.length;
    fireEvent.keyDown(box, { key: "Tab", shiftKey: true });
    expect(writes.length).toBe(count);
  });

  test("an empty editor shows its example in the layer, not as text", async () => {
    await show(graph(codeNode({ environment_profile_id: "builtin" })));
    const box = screen.getByRole("textbox", { name: "Code of score" });
    expect(box).toHaveValue("");
    expect(screen.getByTestId("code-text-editor-highlight")).toHaveTextContent("def main(input, context):");
  });
});

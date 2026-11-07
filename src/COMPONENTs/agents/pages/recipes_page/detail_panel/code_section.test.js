import React, { useState } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import CodeSection from "./code_section";
import { probe_python_profile, python_profiles, save_python_profile } from "../skeleton_resources";
import capture from "../code_capture.json";

/* The Code panel (#357), fed the store's own answers: the Python profile
 * list, the save and the probe were captured from the real store on the fixed
 * installed runtime (code_capture.json, code-01/out/code-store-capture.json).
 * Only the controls are probes. */

jest.mock("../skeleton_resources", () => ({
  is_unavailable: (result) => Boolean(result) && result.ok === false && result.reason === "unavailable",
  python_profiles: jest.fn(),
  save_python_profile: jest.fn(),
  probe_python_profile: jest.fn(),
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
jest.mock("../../../../../BUILTIN_COMPONENTs/input/input", () => function MockInput({ value, set_value, placeholder, disabled }) {
  return <input placeholder={placeholder} value={value} disabled={disabled} onChange={(event) => set_value(event.target.value)} />;
});
jest.mock("../../../../../BUILTIN_COMPONENTs/input/textfield", () => function MockTextField({ value, set_value, placeholder }) {
  return <textarea data-testid="json-text" placeholder={placeholder} value={value} onChange={(event) => set_value(event.target.value)} />;
});
jest.mock("../../../../../BUILTIN_COMPONENTs/input/button", () => function MockButton({ label, ariaLabel, onClick, disabled }) {
  return <button type="button" aria-label={ariaLabel} disabled={disabled} onClick={onClick}>{label || ariaLabel}</button>;
});
jest.mock("../../../../../BUILTIN_COMPONENTs/input/switch", () => function MockSwitch({ on, set_on }) {
  return <input type="checkbox" role="switch" checked={Boolean(on)} onChange={(event) => set_on(event.target.checked)} />;
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
const selectIn = (testid) => within(screen.getByTestId(testid)).getByTestId("select");
const limitBox = (label) => within(screen.getByTestId("code-limits")).getByPlaceholderText(label);

beforeEach(() => {
  python_profiles.mockResolvedValue({ ok: true, data: { profiles: PROFILES } });
  save_python_profile.mockReset();
  probe_python_profile.mockReset();
});

describe("a new Code node", () => {
  test("has no settings, says what is missing, and writes only what the author chooses", async () => {
    await show(graph(codeNode(undefined)));
    expect(screen.getByTestId("code-problems")).toHaveTextContent("Choose a runtime, name the source file, set the limits and declare the Result.");
    expect(screen.getByTestId("code-result-undeclared")).toHaveTextContent("No fields yet");
    expect(screen.getByTestId("code-on-error")).toHaveTextContent("There is no error policy for Code");

    fireEvent.change(selectIn("code-runtime-picker"), { target: { value: "builtin" } });
    expect(stored()).toStrictEqual({ environment_profile_id: "builtin" });
    expect(screen.getByTestId("code-runtime-executable")).toHaveTextContent("the built-in interpreter");
    const messages = () => screen.getByTestId("code-problems").textContent;
    expect(messages()).toContain("Set timeout ms");
    expect(messages()).toContain("name the file");
    expect(messages()).toContain("Declare the Result");
    expect(messages()).not.toContain("Choose the Python");
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
    fireEvent.change(limitBox("seconds"), { target: { value: "0" } });
    expect(stored().timeout_ms).toBeUndefined();
    expect(screen.getByTestId("code-timeout-score-problem")).toHaveTextContent("whole number from 1 to 86400");
    fireEvent.change(limitBox("seconds"), { target: { value: "30" } });
    expect(stored().timeout_ms).toBe(30000);
    const [resultBox, logBox] = within(screen.getByTestId("code-limits")).getAllByPlaceholderText("bytes");
    fireEvent.change(resultBox, { target: { value: "8388609" } });
    expect(stored().max_result_bytes).toBeUndefined();
    fireEvent.change(resultBox, { target: { value: "1048576" } });
    fireEvent.change(logBox, { target: { value: "1048576" } });
    expect(stored()).toMatchObject({ timeout_ms: 30000, max_result_bytes: 1048576, max_log_bytes: 1048576 });
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
    expect(selectIn("code-runtime-picker")).toHaveValue("builtin");
    expect(within(screen.getByTestId("code-source")).getByPlaceholderText("tools/score.py")).toHaveValue("tools/score.py");
    expect(limitBox("seconds")).toHaveValue("30");
    expect(within(screen.getByTestId("schema-field-0")).getByPlaceholderText("field name")).toHaveValue("rows");
    expect(within(screen.getByTestId("schema-field-1")).getByPlaceholderText("field name")).toHaveValue("summary");
    expect(screen.queryByTestId("code-problems")).toBeNull();
    expect(writes).toEqual([]);
  });

  test("a profile the store no longer lists is shown as stored and named as the problem", async () => {
    await show(graph(codeNode(capture.rows.find((row) => row.case === "profile-missing").config.code)));
    expect(selectIn("code-runtime-picker")).toHaveValue("nope");
    expect(within(selectIn("code-runtime-picker")).getByText("nope (not on this machine)")).toBeInTheDocument();
    expect(screen.getByTestId("code-problems")).toHaveTextContent("No Python profile named “nope” is on this machine");
  });

  test("a key this runtime does not read is named and can be removed; the rest is kept", async () => {
    const withExtra = capture.rows.find((row) => row.case === "unknown-code-key-on-error").config.code;
    await show(graph(codeNode(withExtra)));
    expect(screen.getByTestId("code-setting-on_error")).toHaveTextContent("Unsupported setting: on_error");
    expect(screen.getByTestId("code-problems")).toHaveTextContent("does not read the setting “on_error”");
    fireEvent.click(screen.getByRole("button", { name: "Remove setting on_error" }));
    expect(stored()).toStrictEqual(complete);
    expect(screen.queryByTestId("code-problems")).toBeNull();
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
    expect(screen.getAllByTestId("code-problems").at(-1)).toHaveTextContent("must describe an object");
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
    expect(selectIn("code-runtime-picker")).not.toBeDisabled();
  });

  test("a document of another kind is read-only here", async () => {
    await show(graph(codeNode(complete), "recipe"));
    expect(screen.getByTestId("code-section")).toHaveTextContent("read-only here");
    expect(selectIn("code-runtime-picker")).toBeDisabled();
  });
});

describe("the Pythons on this machine", () => {
  test("checking a profile asks the store and shows the version it reported", async () => {
    probe_python_profile.mockResolvedValue({ ok: true, data: capture.profiles.probe_venv });
    await show(graph(codeNode({ ...complete, environment_profile_id: "pupu-tools" })));
    fireEvent.click(screen.getByRole("button", { name: "Check pupu-tools" }));
    await settle();
    expect(probe_python_profile).toHaveBeenCalledWith("pupu-tools");
    expect(screen.getByTestId("code-runtime-probe")).toHaveTextContent("Python 3.12.10 (cpython)");
  });

  test("naming a Python sends its id and absolute executable; the store's refusal is shown, a success is picked", async () => {
    save_python_profile.mockResolvedValueOnce({ ok: false, error: capture.profiles.save_relative.refusal });
    await show(graph(codeNode({ environment_profile_id: "builtin" })));
    fireEvent.click(screen.getByRole("button", { name: "Name a Python…" }));
    const add = screen.getByTestId("code-runtime-add");
    fireEvent.change(within(add).getByPlaceholderText(/profile name/), { target: { value: "rel" } });
    fireEvent.change(within(add).getByPlaceholderText(/absolute path/), { target: { value: "bin/python" } });
    fireEvent.click(within(add).getByRole("button", { name: "Add" }));
    await settle();
    expect(save_python_profile).toHaveBeenCalledWith("rel", "bin/python");
    expect(screen.getByTestId("code-runtime-add-problem")).toHaveTextContent("absolute path");
    expect(stored()).toStrictEqual({ environment_profile_id: "builtin" });

    save_python_profile.mockResolvedValueOnce({ ok: true, data: capture.profiles.save_venv });
    python_profiles.mockResolvedValue({ ok: true, data: { profiles: PROFILES } });
    fireEvent.change(within(add).getByPlaceholderText(/profile name/), { target: { value: "pupu-tools" } });
    fireEvent.change(within(add).getByPlaceholderText(/absolute path/), { target: { value: "/Users/someone/.venvs/pupu-tools/bin/python" } });
    fireEvent.click(within(add).getByRole("button", { name: "Add" }));
    await settle();
    expect(save_python_profile).toHaveBeenLastCalledWith("pupu-tools", "/Users/someone/.venvs/pupu-tools/bin/python");
    expect(stored().environment_profile_id).toBe("pupu-tools");
    expect(screen.queryByTestId("code-runtime-add")).toBeNull();
  });

  test("a list that cannot be read is a refusal with a retry, not an empty picker", async () => {
    python_profiles.mockResolvedValue({ ok: false, error: { code: "unauthorized", message: "no" } });
    await show(graph(codeNode(complete)));
    expect(screen.getByTestId("code-runtime-error")).toHaveTextContent("could not be read: no");
    expect(screen.queryByTestId("code-problems")).toBeNull();
    python_profiles.mockResolvedValue({ ok: true, data: { profiles: PROFILES } });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await settle();
    expect(screen.queryByTestId("code-runtime-error")).toBeNull();
    expect(selectIn("code-runtime-picker")).toHaveValue("builtin");
  });
});

/* Review corrections R-357-01..04 (code-01-independent-review-20261024/report.md). */
describe("R-357-01: a Python registered late selects itself only while the author still means it", () => {
  const beginAdd = () => {
    fireEvent.click(screen.getByRole("button", { name: "Name a Python…" }));
    const add = screen.getByTestId("code-runtime-add");
    fireEvent.change(within(add).getByPlaceholderText(/profile name/), { target: { value: "review-python" } });
    fireEvent.change(within(add).getByPlaceholderText(/absolute path/), { target: { value: "/tmp/owned-python" } });
    fireEvent.click(within(add).getByRole("button", { name: "Add" }));
  };
  const late = () => {
    let resolve;
    save_python_profile.mockReturnValue(new Promise((done) => { resolve = done; }));
    return (value) => act(async () => { resolve(value); for (let tick = 0; tick < 6; tick += 1) await Promise.resolve(); });
  };

  test("an edit made while the registration is pending survives its success; only the profile id changes", async () => {
    const answer = late();
    await show(graph(codeNode(complete)));
    beginAdd();
    fireEvent.change(within(screen.getByTestId("code-source")).getByPlaceholderText("tools/score.py"), { target: { value: "tools/new.py" } });
    expect(stored().source.path).toBe("tools/new.py");
    await answer({ ok: true, data: { ...capture.profiles.save_venv, id: "review-python" } });
    expect(stored()).toStrictEqual({ ...complete, source: { kind: "file", path: "tools/new.py" }, environment_profile_id: "review-python" });
  });

  test("Cancel before the reply revokes the selection; the profile may still exist on the machine", async () => {
    const answer = late();
    await show(graph(codeNode(complete)));
    beginAdd();
    fireEvent.click(within(screen.getByTestId("code-runtime-add")).getByRole("button", { name: "Cancel" }));
    await answer({ ok: true, data: { ...capture.profiles.save_venv, id: "review-python" } });
    expect(stored().environment_profile_id).toBe("builtin");
    expect(python_profiles).toHaveBeenCalledTimes(2);
  });

  test("a reply arriving after the section is gone writes nothing", async () => {
    const answer = late();
    writes = [];
    const view = render(<Harness initial={graph(codeNode(complete))} />);
    await act(async () => { for (let tick = 0; tick < 4; tick += 1) await Promise.resolve(); });
    beginAdd();
    view.unmount();
    await answer({ ok: true, data: { ...capture.profiles.save_venv, id: "review-python" } });
    expect(writes).toEqual([]);
  });
});

describe("R-357-02: On error says what the installed runtime does", () => {
  test("a bad return fails the run, an exception or timeout leaves it unknown; nothing is published downstream", async () => {
    await show(graph(codeNode(complete)));
    const text = screen.getByTestId("code-on-error").textContent;
    expect(text).toMatch(/fails the run/);
    expect(text).toMatch(/outcome_unknown/);
    expect(text).toMatch(/nothing is published/i);
    expect(text).not.toMatch(/route on what arrived/);
    expect(text).not.toMatch(/completes with/);
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
    expect(screen.getByTestId("code-problems")).toHaveTextContent("not a list");
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
describe("R-357-01a: an obsolete reply never touches the registration that replaced it", () => {
  const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
  const begin = (id) => {
    fireEvent.click(screen.getByRole("button", { name: "Name a Python…" }));
    const add = screen.getByTestId("code-runtime-add");
    fireEvent.change(within(add).getByPlaceholderText(/profile name/), { target: { value: id } });
    fireEvent.change(within(add).getByPlaceholderText(/absolute path/), { target: { value: `/tmp/python-${id}` } });
    fireEvent.click(within(add).getByRole("button", { name: "Add" }));
  };
  const cancel = () => fireEvent.click(within(screen.getByTestId("code-runtime-add")).getByRole("button", { name: "Cancel" }));
  const answer = async (request, value) => { await act(async () => request.resolve(value)); await settle(); };
  const success = (id) => ({ ok: true, data: { ...capture.profiles.save_venv, id } });

  test.each([
    ["success", success("old-python")],
    ["failure", { ok: false, error: capture.profiles.save_relative.refusal }],
  ])("old %s first, then the current success: only the current one settles the form and selects", async (_label, oldAnswer) => {
    const old = deferred(); const current = deferred();
    save_python_profile.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    await show(graph(codeNode(complete)));
    begin("old-python"); cancel(); begin("current-python");
    fireEvent.change(within(screen.getByTestId("code-source")).getByPlaceholderText("tools/score.py"), { target: { value: "tools/after.py" } });
    await answer(old, oldAnswer);
    expect(stored().environment_profile_id).toBe("builtin");
    expect(screen.getByRole("button", { name: "Probing…" })).toBeInTheDocument();
    expect(screen.queryByTestId("code-runtime-add-problem")).toBeNull();
    await answer(current, success("current-python"));
    expect(stored()).toStrictEqual({ ...complete, source: { kind: "file", path: "tools/after.py" }, environment_profile_id: "current-python" });
    expect(screen.queryByTestId("code-runtime-add")).toBeNull();
  });

  test("current first, then the old one: the old one changes nothing", async () => {
    const old = deferred(); const current = deferred();
    save_python_profile.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    await show(graph(codeNode(complete)));
    begin("old-python"); cancel(); begin("current-python");
    await answer(current, success("current-python"));
    const count = writes.length;
    await answer(old, success("old-python"));
    expect(stored().environment_profile_id).toBe("current-python");
    expect(writes.length).toBe(count);
    expect(screen.queryByTestId("code-runtime-add")).toBeNull();
  });

  test("an old failure arriving while the current request is pending does not end it as a failure", async () => {
    const old = deferred(); const current = deferred();
    save_python_profile.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    await show(graph(codeNode(complete)));
    begin("old-python"); cancel(); begin("current-python");
    await answer(old, { ok: false, error: capture.profiles.save_relative.refusal });
    await answer(current, { ok: false, error: capture.profiles.save_missing_exe.refusal });
    expect(screen.getByTestId("code-runtime-add-problem")).toHaveTextContent("runtime executable is unavailable");
    expect(stored().environment_profile_id).toBe("builtin");
  });
});

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
    expect(screen.getByTestId("code-problems")).toHaveTextContent("must describe an object");
    const back = JSON.stringify(titled.properties ? { type: "object", properties: {}, additionalProperties: false } : titled);
    fireEvent.change(box, { target: { value: back } });
    expect(stored().result_schema).toEqual(JSON.parse(back));
    expect(box).toHaveFocus();
    expect(screen.queryByTestId("code-problems")).toBeNull();
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
    expect(screen.getByTestId("code-problems")).toHaveTextContent("not a list");
    fireEvent.click(screen.getByRole("button", { name: "Remove artifacts" }));
    expect(stored()).toStrictEqual(complete);
    expect(writes).toHaveLength(1);
  });
});

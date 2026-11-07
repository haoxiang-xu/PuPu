import React, { useState } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import ToolCallSection from "./tool_call_section";
import { api } from "../../../../../SERVICEs/api";
import capture from "../tool_call_capture.json";

/* The Tool Call panel (#352), fed the sidecar's own answers: the tool library
 * and Core's schemas were captured from the real routes on the fixed installed
 * runtime (tool_call_capture.json, steps-352/probe/tool-catalog-capture-01).
 * Only the controls are probes; the facade calls are answered with those
 * bodies, so the rows on screen are the rows the runtime declares. */

jest.mock("../../../../../SERVICEs/api", () => ({ api: { unchain: {} } }));
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
jest.mock("../../../../../BUILTIN_COMPONENTs/input/button", () => function MockButton({ label, ariaLabel, onClick, disabled }) {
  return <button type="button" aria-label={ariaLabel} disabled={disabled} onClick={onClick}>{label || ariaLabel}</button>;
});
jest.mock("../../../../toolkit/components/segmented_control", () => function MockSegmented({ sections, selected, onChange }) {
  return (
    <span>
      {sections.map((section) => (
        <button key={section.key} type="button" aria-pressed={section.key === selected} onClick={() => onChange(section.key)}>
          {section.label}
        </button>
      ))}
    </span>
  );
});

const CATALOG = JSON.parse(capture.catalog_v2.body_text);
const CORE = JSON.parse(capture.core_schemas.body_text);
const SEP = "\u0000";

const out = (name, root) => ({ name, source: { kind: "result", path: [root] } });
const graph = (tool, extra = []) => ({
  schema_version: 1, kind: "agent", id: "doc", name: "doc",
  nodes: [
    { id: "start", type: "start", config: { execution: { outputs: [out("message", "message")] } } },
    tool,
    { id: "router", type: "agent", config: { execution: { inputs: [], outputs: [] } } },
    ...extra,
  ],
  edges: [
    { id: "e1", kind: "flow", source_node_id: "start", source_port_id: "out", target_node_id: "tool", target_port_id: "in" },
    { id: "e2", kind: "flow", source_node_id: "tool", source_port_id: "out", target_node_id: "router", target_port_id: "in" },
  ],
});
const toolNode = (config = {}) => ({ id: "tool", type: "tool_call", config: { execution: { inputs: [], outputs: [] }, ...config } });
const literal = (name, value) => ({ name, value: { kind: "literal", value }, missing: "error" });

let latest;
let writes;
function Harness({ initial }) {
  const [document, setDocument] = useState(initial);
  latest = document;
  return <ToolCallSection document={document} node={document.nodes.find((node) => node.id === "tool")} isDark={false}
    onChange={(next) => { writes.push(next); setDocument(next); }} />;
}
const show = async (document) => {
  render(<Harness initial={document} />);
  await act(async () => { await Promise.resolve(); });
};
const tool = () => latest.nodes.find((node) => node.id === "tool");
const pickTool = (name) => fireEvent.change(within(screen.getByTestId("tool-call-picker")).getByTestId("select"), { target: { value: `core${SEP}${name}` } });
const argument = (name) => screen.getByTestId(`tool-call-argument-${name}`);

beforeEach(() => {
  writes = [];
  latest = null;
  api.unchain.listToolModalCatalog = jest.fn(async () => CATALOG);
  api.unchain.listSkeletonToolSchemas = jest.fn(async (toolkitId) => {
    expect(toolkitId).toBe("core");
    return { toolkit_id: CORE.toolkit_id, tools: CORE.tools };
  });
});

describe("picking the tool", () => {
  test("an unpicked step says so and invents nothing", async () => {
    await show(graph(toolNode()));
    expect(screen.getByTestId("tool-call-arguments")).toHaveTextContent("Pick a tool first");
    expect(screen.getByTestId("tool-call-problems")).toHaveTextContent("Pick the tool this step runs.");
    expect(writes).toHaveLength(0);
  });

  test("picking writes the name only — no error policy or approval limit is chosen for the author", async () => {
    await show(graph(toolNode()));
    await act(async () => { pickTool("read"); });
    expect(tool().config.tool).toStrictEqual({ name: "read" });
    expect(api.unchain.listSkeletonToolSchemas).toHaveBeenCalledWith("core");
    expect(screen.getByTestId("tool-call-problems")).toHaveTextContent("Choose what happens when the tool fails.");
    expect(screen.getByTestId("tool-call-problems")).toHaveTextContent("Set how long to wait for an approval.");
  });

  test("the rows are the tool's own schema: required marked, type and description shown", async () => {
    await show(graph(toolNode({ tool: { name: "read" } })));
    await act(async () => { await Promise.resolve(); });
    const names = ["path", "offset", "limit"];
    names.forEach((name) => expect(argument(name)).toBeInTheDocument());
    expect(within(argument("path")).getByLabelText("required")).toBeInTheDocument();
    expect(within(argument("offset")).queryByLabelText("required")).toBeNull();
    expect(argument("offset")).toHaveTextContent("integer");
    expect(argument("path")).toHaveTextContent("Required by read.");
    expect(argument("limit")).toHaveTextContent("Not set. read uses its own default.");
    expect(screen.queryByRole("button", { name: /add/i })).toBeNull();
  });

  test("what the library says about approval and about where the tool comes from", async () => {
    await show(graph(toolNode({ tool: { name: "write" } })));
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId("tool-call-confirmation")).toHaveTextContent("asks for approval each time");
    expect(screen.getByTestId("tool-call-availability")).toHaveTextContent("No Toolkit Pool in this Agent includes Core");
  });

  test("a Toolkit Pool here that includes the tool removes the availability note", async () => {
    const pool = { id: "tools", type: "toolkit_pool", config: { toolkits: [{ id: "core", enabled_tools: null }], merge_with_user_selected: false } };
    await show(graph(toolNode({ tool: { name: "read" } }), [pool]));
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByTestId("tool-call-availability")).toBeNull();
  });
});

describe("arguments", () => {
  const ready = async (inputs = []) => {
    await show(graph(toolNode({ tool: { name: "read", on_error: "continue", approval_timeout_ms: 60000 }, execution: { inputs, outputs: [] } })));
    await act(async () => { await Promise.resolve(); });
  };

  test("a fixed text value is written as a literal row named for the argument", async () => {
    await ready();
    fireEvent.click(within(argument("path")).getByRole("button", { name: "Value" }));
    fireEvent.change(within(argument("path")).getByPlaceholderText("a value written here"), { target: { value: "/tmp/x.txt" } });
    expect(tool().config.execution.inputs).toStrictEqual([literal("path", "/tmp/x.txt")]);
  });

  test("an integer is written as a number; text that is not one is held and never written", async () => {
    await ready([literal("path", "/tmp/x.txt")]);
    fireEvent.click(within(argument("offset")).getByRole("button", { name: "Value" }));
    const box = within(argument("offset")).getByPlaceholderText("a value written here");
    fireEvent.change(box, { target: { value: "5x" } });
    expect(screen.getByTestId("tool-call-argument-offset-value-problem")).toHaveTextContent("Enter a whole number.");
    expect(tool().config.execution.inputs).toStrictEqual([literal("path", "/tmp/x.txt")]);
    fireEvent.change(box, { target: { value: "5" } });
    expect(tool().config.execution.inputs).toStrictEqual([literal("path", "/tmp/x.txt"), literal("offset", 5)]);
  });

  test("a variable binds an upstream export, kept in schema order", async () => {
    await ready([literal("limit", 3)]);
    fireEvent.click(within(argument("path")).getByRole("button", { name: "Variable" }));
    fireEvent.change(within(argument("path")).getAllByTestId("select")[0], { target: { value: `start${SEP}message` } });
    expect(tool().config.execution.inputs).toStrictEqual([
      { name: "path", value: { kind: "ref", node_id: "start", path: ["message"] }, missing: "error" },
      literal("limit", 3),
    ]);
  });

  test("an optional argument can be unset again; the row disappears from what is sent", async () => {
    await ready([literal("path", "/x"), literal("limit", 3)]);
    fireEvent.click(screen.getByRole("button", { name: "Unset limit" }));
    expect(tool().config.execution.inputs).toStrictEqual([literal("path", "/x")]);
  });

  test("a stored row the tool does not declare is shown and can be removed, never dropped silently", async () => {
    await ready([literal("path", "/x"), literal("encoding", "utf-8")]);
    expect(screen.getByTestId("tool-call-extra-1")).toHaveTextContent("encoding is not an argument of read");
    expect(screen.getByTestId("tool-call-problems")).toHaveTextContent("read has no argument “encoding”");
    expect(writes).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Remove stored argument encoding" }));
    expect(tool().config.execution.inputs).toStrictEqual([literal("path", "/x")]);
  });
});

describe("error policy and approval wait", () => {
  test("both are written only as the author chooses them, at the runtime's bounds", async () => {
    await show(graph(toolNode({ tool: { name: "read" }, execution: { inputs: [literal("path", "/x")], outputs: [] } })));
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId("tool-call-on-error-note")).toHaveTextContent("text the tool returns is never read as a failure");
    fireEvent.click(within(screen.getByTestId("tool-call-on-error")).getByRole("button", { name: "Continue" }));
    expect(tool().config.tool).toStrictEqual({ name: "read", on_error: "continue" });
    const box = within(screen.getByTestId("tool-call-approval")).getByPlaceholderText("seconds");
    fireEvent.change(box, { target: { value: "0" } });
    fireEvent.change(box, { target: { value: "86401" } });
    expect(screen.getByTestId("tool-call-approval-problem")).toBeInTheDocument();
    expect(tool().config.tool).toStrictEqual({ name: "read", on_error: "continue" });
    fireEvent.change(box, { target: { value: "60" } });
    expect(tool().config.tool).toStrictEqual({ name: "read", on_error: "continue", approval_timeout_ms: 60000 });
    fireEvent.click(within(screen.getByTestId("tool-call-on-error")).getByRole("button", { name: "Fail the run" }));
    expect(tool().config.tool.on_error).toBe("stop");
    expect(screen.queryByTestId("tool-call-problems")).toBeNull();
  });

  test("a setting the runtime does not read is shown and removable; the rest is kept", async () => {
    await show(graph(toolNode({ tool: { name: "read", on_error: "stop", approval_timeout_ms: 1000, toolkit: "core" } })));
    expect(screen.getByTestId("tool-call-setting-toolkit")).toHaveTextContent("Unsupported setting: toolkit");
    fireEvent.click(screen.getByRole("button", { name: "Remove setting toolkit" }));
    expect(tool().config.tool).toStrictEqual({ name: "read", on_error: "stop", approval_timeout_ms: 1000 });
  });
});

describe("when the library or the schema cannot be read", () => {
  test("a schema refusal is reported with a retry, and stored rows are not touched", async () => {
    api.unchain.listSkeletonToolSchemas = jest.fn(async () => {
      throw Object.assign(new Error("only builtin toolkits can be read for tool schemas"), { code: "toolkit_unsupported" });
    });
    await show(graph(toolNode({ tool: { name: "read" }, execution: { inputs: [literal("path", "/x")], outputs: [] } })));
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId("tool-call-schema-error")).toHaveTextContent("only builtin toolkits");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(writes).toHaveLength(0);
  });

  test("a stored tool the library no longer lists keeps its arguments", async () => {
    await show(graph(toolNode({ tool: { name: "retired_tool" }, execution: { inputs: [literal("x", 1)], outputs: [] } })));
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId("tool-call-arguments")).toHaveTextContent("retired_tool is not in the tool library now");
    expect(screen.getByTestId("tool-call-extra-0")).toHaveTextContent("x is stored for this step");
    expect(writes).toHaveLength(0);
  });
});

/* R-352-01: a required argument has no Unset, so switching Value/Variable is
   the only way to replace what is stored. Switching only opens the other
   editor; the stored source stays in the document, shown, until the author
   actually picks or types its replacement. */
describe("replacing what an argument has stored", () => {
  const ready = async (inputs) => {
    await show(graph(toolNode({ tool: { name: "read", on_error: "continue", approval_timeout_ms: 60000 }, execution: { inputs, outputs: [] } })));
    await act(async () => { await Promise.resolve(); });
  };
  const fromStart = (missing = "error") => ({ name: "path", value: { kind: "ref", node_id: "start", path: ["message"] }, missing });
  const pickStart = () => fireEvent.change(within(argument("path")).getAllByTestId("select")[0], { target: { value: `start${SEP}message` } });
  const kept = () => screen.queryByTestId("tool-call-argument-path-kept");

  test("a required value switched to Variable is kept until a variable is picked", async () => {
    await ready([literal("path", "/old.txt")]);
    fireEvent.click(within(argument("path")).getByRole("button", { name: "Variable" }));
    expect(writes).toHaveLength(0);
    expect(kept()).toHaveTextContent("\"/old.txt\"");
    pickStart();
    expect(tool().config.execution.inputs).toStrictEqual([fromStart()]);
    expect(kept()).toBeNull();
  });

  test("a required variable switched to Value is kept until a value is typed", async () => {
    await ready([fromStart()]);
    fireEvent.click(within(argument("path")).getByRole("button", { name: "Value" }));
    expect(writes).toHaveLength(0);
    expect(kept()).toHaveTextContent("start");
    const box = within(argument("path")).getByPlaceholderText("a value written here");
    expect(box).toHaveValue("");
    fireEvent.change(box, { target: { value: "/new.txt" } });
    expect(tool().config.execution.inputs).toStrictEqual([literal("path", "/new.txt")]);
    expect(kept()).toBeNull();
  });

  test("switching back before choosing anything shows the stored value again, untouched", async () => {
    await ready([literal("path", "/old.txt")]);
    fireEvent.click(within(argument("path")).getByRole("button", { name: "Variable" }));
    fireEvent.click(within(argument("path")).getByRole("button", { name: "Value" }));
    expect(within(argument("path")).getByPlaceholderText("a value written here")).toHaveValue("/old.txt");
    expect(kept()).toBeNull();
    expect(writes).toHaveLength(0);
  });

  test("a picked variable keeps the stored missing policy, its default included", async () => {
    const several = { kind: "first_present", values: [{ kind: "ref", node_id: "start", path: ["message"] }, { kind: "literal", value: "/a" }] };
    await ready([{ name: "path", value: several, missing: "default", default: "/fallback.txt" }]);
    pickStart();
    expect(tool().config.execution.inputs).toStrictEqual([{ ...fromStart("default"), default: "/fallback.txt" }]);
  });

  test("re-picking a stored variable keeps its default", async () => {
    const stored = { ...fromStart("default"), default: "/fallback.txt" };
    await ready([stored]);
    pickStart();
    expect(tool().config.execution.inputs).toStrictEqual([stored]);
  });

  /* R-352-04: the real store keeps a ref whose node or field is not a name
     (draft diagnostic invalid_value / invalid_path at that field;
     steps-352/probe/stored-shapes-01). The picker is handed only a ref it can
     read; the stored one stays, shown, until the author replaces it. */
  const UNREADABLE_REFS = [
    ["a node that is not a name", { toString: null }, ["message"]],
    ["a field that is not a name", "start", [{ toString: null }]],
    ["a node given as a list", ["start"], ["message"]],
  ];
  const quietly = async (run) => {
    const original = console.error;
    console.error = () => {};
    try { await run(); } finally { console.error = original; }
  };
  test.each(UNREADABLE_REFS)("a stored variable naming %s opens, is kept and shown, and a picked variable replaces it", async (_label, node_id, path) => {
    await quietly(() => ready([{ name: "path", value: { kind: "ref", node_id, path }, missing: "error" }]));
    expect(writes).toHaveLength(0);
    expect(kept()).toHaveTextContent("\"kind\":\"ref\"");
    expect(within(argument("path")).getAllByTestId("select")[0]).toHaveValue("");
    pickStart();
    expect(tool().config.execution.inputs).toStrictEqual([fromStart()]);
    expect(kept()).toBeNull();
  });
  test.each(UNREADABLE_REFS)("a stored variable naming %s can be replaced by a typed value", async (_label, node_id, path) => {
    await quietly(() => ready([{ name: "path", value: { kind: "ref", node_id, path }, missing: "error" }]));
    fireEvent.click(within(argument("path")).getByRole("button", { name: "Value" }));
    expect(writes).toHaveLength(0);
    fireEvent.change(within(argument("path")).getByPlaceholderText("a value written here"), { target: { value: "/typed.txt" } });
    expect(tool().config.execution.inputs).toStrictEqual([literal("path", "/typed.txt")]);
  });

  const UNCOMPOSED = [
    ["several sources", { kind: "first_present", values: [{ kind: "ref", node_id: "start", path: ["message"] }, { kind: "literal", value: "/fallback" }] }],
    ["a source kind this row does not compose", { kind: "template", text: "{start.message}" }],
  ];
  test.each(UNCOMPOSED)("a stored %s is kept and shown, and a picked variable replaces it", async (_label, value) => {
    await ready([{ name: "path", value, missing: "null" }]);
    expect(kept()).toBeInTheDocument();
    expect(writes).toHaveLength(0);
    pickStart();
    expect(tool().config.execution.inputs).toStrictEqual([fromStart("null")]);
  });
  test.each(UNCOMPOSED)("a stored %s is kept and shown, and a typed value replaces it", async (_label, value) => {
    await ready([{ name: "path", value, missing: "null" }]);
    fireEvent.click(within(argument("path")).getByRole("button", { name: "Value" }));
    expect(writes).toHaveLength(0);
    expect(kept()).toBeInTheDocument();
    fireEvent.change(within(argument("path")).getByPlaceholderText("a value written here"), { target: { value: "/typed.txt" } });
    expect(tool().config.execution.inputs).toStrictEqual([literal("path", "/typed.txt")]);
  });
});

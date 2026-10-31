import {
  APPROVAL_LIMIT_MS,
  argument_layout,
  literal_from_text,
  literal_to_text,
  schema_arguments,
  tool_availability,
  tool_call_problems,
  tool_settings,
  with_argument,
  with_tool_settings,
} from "./tool_call_config";

/* The Tool Call node's configuration (#352), as the fixed runtime defines it:
 * `tool: {name, on_error: stop|continue, approval_timeout_ms: 1…86 400 000}`,
 * CLOSED; the tool's arguments are the node's inputs, one per row. The real
 * `read` schema below is the runtime's own (steps-352/probe/tool-schemas-02). */

const READ = {
  type: "object",
  properties: {
    path: { type: "string", description: "Absolute path to the file inside the workspace roots." },
    offset: { type: "integer", description: "Zero-based line offset to start reading from." },
    limit: { type: "integer", description: "Maximum number of lines to return. Omit for the full file." },
  },
  required: ["path"],
  additionalProperties: false,
};
const literal = (name, value) => ({ name, value: { kind: "literal", value }, missing: "error" });
const ref = (name, node_id, field) => ({ name, value: { kind: "ref", node_id, path: [field] }, missing: "error" });
const node = (tool, inputs = []) => ({ id: "tool", type: "tool_call", config: { execution: { inputs, outputs: [] }, ...(tool === undefined ? {} : { tool }) } });
const doc = (...nodes) => ({ schema_version: 1, kind: "agent", id: "a", name: "A", nodes: [{ id: "start", type: "start", config: { execution: { outputs: [] } } }, ...nodes], edges: [] });
const complete = { name: "read", on_error: "continue", approval_timeout_ms: 60000 };

describe("reading and writing the tool settings", () => {
  test("absent until picked; written whole, other config kept", () => {
    expect(tool_settings(node(undefined))).toBeNull();
    const written = with_tool_settings(doc(node(undefined, [literal("path", "/x")])), "tool", { name: "read" });
    expect(written.nodes[1].config).toStrictEqual({ execution: { inputs: [literal("path", "/x")], outputs: [] }, tool: { name: "read" } });
  });

  test("refuses to write anywhere but one Tool Call node", () => {
    const original = doc(node(undefined), node(undefined));
    expect(with_tool_settings(original, "tool", { name: "read" })).toBe(original);
    const agent = doc({ id: "tool", type: "agent", config: { execution: { inputs: [], outputs: [] } } });
    expect(with_tool_settings(agent, "tool", { name: "read" })).toBe(agent);
  });
});

describe("the schema, as argument rows", () => {
  test("one row per property in the schema's own order, with required, type and description", () => {
    const read = schema_arguments(READ);
    expect(read.readable).toBe(true);
    expect(read.rows.map((row) => [row.name, row.required, row.type])).toEqual([
      ["path", true, "string"], ["offset", false, "integer"], ["limit", false, "integer"],
    ]);
    expect(read.rows[0].description).toMatch(/Absolute path/);
    expect(read.rows[0].has_default).toBe(false);
  });

  test("required arguments lead in the schema's own `required` order, whatever order the object keys arrived in", () => {
    const sorted = { type: "object", properties: { limit: { type: "integer" }, offset: { type: "integer" }, path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] };
    expect(schema_arguments(sorted).rows.map((row) => row.name)).toEqual(["path", "content", "limit", "offset"]);
  });

  test("defaults and enumerations are carried; an unreadable schema says so", () => {
    const parsed = schema_arguments({ type: "object", properties: { mode: { type: "string", enum: ["a", "b"], default: "a" } } });
    expect(parsed.rows[0]).toMatchObject({ name: "mode", has_default: true, default: "a", enum: ["a", "b"], required: false });
    expect(schema_arguments({ type: "array" }).readable).toBe(false);
    expect(schema_arguments(null).readable).toBe(false);
  });

  test("bound rows land on their property; rows that are not properties are kept apart, not dropped", () => {
    const layout = argument_layout(READ, [literal("limit", 5), ref("path", "start", "message"), literal("encoding", "utf-8")]);
    expect(layout.rows.map((row) => [row.name, row.binding ? row.binding.value.kind : null])).toEqual([
      ["path", "ref"], ["offset", null], ["limit", "literal"],
    ]);
    expect(layout.extras.map((extra) => extra.binding.name)).toEqual(["encoding"]);
  });
});

describe("typed literals", () => {
  test.each([
    ["string", "hello", "hello"],
    ["integer", "20000", 20000],
    ["integer", "-3", -3],
    ["number", "1.5", 1.5],
    ["boolean", "true", true],
    ["boolean", "false", false],
    ["object", '{"a": 1}', { a: 1 }],
    ["array", "[1, 2]", [1, 2]],
  ])("a %s from %p", (type, text, value) => {
    expect(literal_from_text(text, type)).toStrictEqual({ ok: true, value });
  });

  test.each([
    ["integer", "1.5"], ["integer", "12abc"], ["integer", ""], ["number", "NaN"], ["number", "1e999"],
    ["boolean", "yes"], ["object", "[1]"], ["array", "{}"], ["object", "{bad"],
  ])("refuses %s %p rather than sending something else", (type, text) => {
    const parsed = literal_from_text(text, type);
    expect(parsed.ok).toBe(false);
    expect(typeof parsed.problem).toBe("string");
  });

  test("shown back as written", () => {
    expect(literal_to_text("hello", "string")).toBe("hello");
    expect(literal_to_text(20000, "integer")).toBe("20000");
    expect(literal_to_text({ a: 1 }, "object")).toBe('{"a":1}');
  });
});

describe("what the panel says is wrong", () => {
  const codes = (problems) => problems.map((problem) => problem.argument ? `${problem.code}:${problem.argument}` : problem.code);

  test("an unpicked tool is the only thing to say", () => {
    expect(codes(tool_call_problems(node(undefined), null))).toEqual(["tool_missing"]);
  });

  test("a picked tool still needs its error policy and approval limit", () => {
    expect(codes(tool_call_problems(node({ name: "read" }, [literal("path", "/x")]), READ)))
      .toEqual(["on_error_missing", "approval_limit_missing"]);
  });

  test("values the runtime refuses are named, at the runtime's bounds", () => {
    expect(APPROVAL_LIMIT_MS).toStrictEqual({ min: 1, max: 86400000 });
    const bad = node({ name: "read", on_error: "fail_run", approval_timeout_ms: 86400001, toolkit: "core" }, [literal("path", "/x")]);
    expect(codes(tool_call_problems(bad, READ))).toEqual(["on_error_invalid", "approval_limit_invalid", "unknown_setting"]);
  });

  test("a required argument left unset, an argument the tool does not have, and a name used twice", () => {
    const rows = [literal("encoding", "utf-8"), literal("limit", 1), literal("limit", 2)];
    expect(codes(tool_call_problems(node(complete, rows), READ)))
      .toEqual(["required_argument_unset:path", "unknown_argument:encoding", "duplicate_argument:limit"]);
  });

  test("a complete node has nothing to say; without a loaded schema only the settings are checked", () => {
    expect(tool_call_problems(node(complete, [ref("path", "start", "message")]), READ)).toEqual([]);
    expect(codes(tool_call_problems(node(complete, [literal("anything", 1)]), null))).toEqual([]);
  });
});

describe("setting one argument", () => {
  test("a new row lands in schema order; setting again replaces it; null removes it", () => {
    const start = doc(node(complete, [literal("limit", 5)]));
    const order = ["path", "offset", "limit"];
    const withPath = with_argument(start, "tool", "path", literal("path", "/x"), order);
    expect(withPath.nodes[1].config.execution.inputs.map((row) => row.name)).toEqual(["path", "limit"]);
    const replaced = with_argument(withPath, "tool", "limit", literal("limit", 9), order);
    expect(replaced.nodes[1].config.execution.inputs).toStrictEqual([literal("path", "/x"), literal("limit", 9)]);
    const removed = with_argument(replaced, "tool", "limit", null, order);
    expect(removed.nodes[1].config.execution.inputs).toStrictEqual([literal("path", "/x")]);
  });

  test("an argument the schema does not name cannot be created here", () => {
    const start = doc(node(complete, []));
    expect(with_argument(start, "tool", "encoding", literal("encoding", "x"), ["path", "offset", "limit"])).toBe(start);
  });

  test("a kept row that is not an argument can still be removed", () => {
    const start = doc(node(complete, [literal("encoding", "x")]));
    const removed = with_argument(start, "tool", "encoding", null, ["path"]);
    expect(removed.nodes[1].config.execution.inputs).toStrictEqual([]);
  });
});

describe("whether this Agent can run the tool by itself", () => {
  const pool = (toolkits) => ({ id: "tools", type: "toolkit_pool", config: { toolkits, merge_with_user_selected: false } });

  test("attached when a Toolkit Pool here includes the toolkit and does not exclude the tool", () => {
    expect(tool_availability(doc(node(complete), pool([{ id: "core", enabled_tools: null }])), "read", "core")).toBe("attached");
    expect(tool_availability(doc(node(complete), pool([{ id: "core", enabled_tools: ["read"] }])), "read", "core")).toBe("attached");
  });

  test("otherwise it depends on the chat's own toolkit selection", () => {
    expect(tool_availability(doc(node(complete)), "read", "core")).toBe("chat_only");
    expect(tool_availability(doc(node(complete), pool([{ id: "core", enabled_tools: ["write"] }])), "read", "core")).toBe("chat_only");
    expect(tool_availability(doc(node(complete), pool([{ id: "plan", enabled_tools: null }])), "read", "core")).toBe("chat_only");
  });
});

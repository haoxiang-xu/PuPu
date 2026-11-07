import {
  OPERATORS,
  branch_ports,
  case_display,
  case_problems,
  compare_problems,
  condition_at,
  condition_is_readable,
  free_case_id,
  grouped_with,
  input_value_type,
  move_case,
  new_compare,
  operators_for,
  remove_case,
  with_branch_execution,
  with_condition_at,
  without_condition_at,
} from "./skeleton_branch_config";

const input = (path) => ({ kind: "input", path });
const literal = (value) => ({ kind: "literal", value });
const compare = (operator, left, right) => ({ kind: "compare", operator, left, ...(right === undefined ? {} : { right }) });
const binding = (name, value) => ({ name, value, missing: "error" });
const ref = (node_id, path) => ({ kind: "ref", node_id, path });
const output = (name, kind, path) => ({ name, source: { kind, path } });

/* A small graph whose value types the editor can prove: an Agent's message is
   text, its context an object; a JSON-schema field has its declared type; a
   Start's result is the caller's business and stays unknown. */
const typedGraph = () => ({
  schema_version: 1, kind: "agent", id: "typed", name: "typed",
  nodes: [
    { id: "start", type: "start", config: { execution: { outputs: [output("message", "result", ["message"])] } } },
    { id: "agent", type: "agent", config: {
      execution: { inputs: [], outputs: [output("reply", "result", ["message"]), output("ctx", "result", ["context"]),
        output("score", "result", ["score"]), output("tags", "result", ["tags"]), output("passed", "input", ["seen"])] },
      kernel: { json_schema: { type: "object", properties: { score: { type: "integer" }, tags: { type: "array" } } } },
    } },
    { id: "if", type: "if_else", config: { execution: { inputs: [
      binding("reply", ref("agent", ["reply"])), binding("ctx", ref("agent", ["ctx"])),
      binding("score", ref("agent", ["score"])), binding("tags", ref("agent", ["tags"])),
      binding("raw", ref("start", ["message"])), binding("fixed", literal(3)),
      binding("either", { kind: "first_present", values: [ref("agent", ["reply"]), ref("agent", ["reply"])] }),
      binding("deep", ref("agent", ["ctx", "inner"])),
    ] } } },
  ],
  edges: [],
});
const ifNode = (graph) => graph.nodes.find((node) => node.id === "if");

describe("value types the editor can prove, and the ones it will not guess", () => {
  test.each([
    [["reply"], "string"], [["ctx"], "object"], [["score"], "number"], [["tags"], "array"],
    [["fixed"], "number"], [["either"], "string"],
    [["raw"], null], [["deep"], null], [["reply", "x"], null], [["nope"], null], [[], null],
  ])("%j → %s", (path, type) => {
    const graph = typedGraph();
    expect(input_value_type(graph, ifNode(graph), path)).toBe(type);
  });
});

/* A Tool Call's result is closed `{result, ok, error}` (tool_runtime.py
   `_execute`): `ok` is always true or false, `error` is null or `{code}` —
   never text — and `result` is whatever the tool returned. */
describe("a Tool Call's result fields", () => {
  const toolGraph = () => ({
    schema_version: 1, kind: "agent", id: "t", name: "t",
    nodes: [
      { id: "tool", type: "tool_call", config: { execution: { inputs: [], outputs: [
        output("ok", "result", ["ok"]), output("error", "result", ["error"]), output("page", "result", ["result"]),
        output("code", "result", ["error", "code"]),
      ] }, tool: { name: "read", on_error: "continue", approval_timeout_ms: 1000 } } },
      { id: "if", type: "if_else", config: { execution: { inputs: [
        binding("ok", ref("tool", ["ok"])), binding("error", ref("tool", ["error"])),
        binding("page", ref("tool", ["page"])), binding("code", ref("tool", ["code"])),
      ] } } },
    ],
    edges: [],
  });
  test.each([[["ok"], "boolean"], [["error"], null], [["page"], null], [["code"], null]])("%j → %s", (path, type) => {
    const graph = toolGraph();
    expect(input_value_type(graph, ifNode(graph), path)).toBe(type);
  });
});

describe("operators", () => {
  test("the menu is exactly the runtime's nine, filtered only when the left type is known", () => {
    expect(OPERATORS.map((op) => op.value)).toEqual(["eq", "ne", "gt", "gte", "lt", "lte", "contains", "is_null", "is_not_null"]);
    expect(operators_for(null).map((op) => op.value)).toHaveLength(9);
    expect(operators_for("string").map((op) => op.value)).toEqual(["eq", "ne", "contains", "is_null", "is_not_null"]);
    expect(operators_for("number").map((op) => op.value)).toEqual(["eq", "ne", "gt", "gte", "lt", "lte", "is_null", "is_not_null"]);
    expect(operators_for("boolean").map((op) => op.value)).toEqual(["eq", "ne", "is_null", "is_not_null"]);
    expect(operators_for("array").map((op) => op.value)).toEqual(["eq", "ne", "contains", "is_null", "is_not_null"]);
  });

  test("local problems name exactly what the runtime refuses when the branch runs", () => {
    const graph = typedGraph();
    const node = ifNode(graph);
    const codes = (condition) => compare_problems(graph, node, condition).map((problem) => problem.code);
    expect(codes(compare("eq", input(["reply"]), literal("yes")))).toEqual([]);
    expect(codes(compare("eq", input(["score"]), literal("2")))).toEqual(["type_mismatch"]);
    expect(codes(compare("eq", literal(1), literal("1")))).toEqual(["type_mismatch"]);
    expect(codes(compare("eq", literal(true), literal(1)))).toEqual(["type_mismatch"]);
    expect(codes(compare("eq", literal(1), literal(1.0)))).toEqual([]);
    expect(codes(compare("gt", input(["reply"]), literal(2)))).toEqual(["ordering_requires_numbers"]);
    expect(codes(compare("contains", input(["score"]), literal(2)))).toEqual(["contains_requires_text_or_list"]);
    expect(codes(compare("contains", input(["reply"]), literal(2)))).toEqual(["type_mismatch"]);
    expect(codes(compare("contains", input(["tags"]), literal(2)))).toEqual([]);
    expect(codes(compare("eq", input(["reply"]), literal(null)))).toEqual(["null_needs_null_operator"]);
    expect(codes(compare("is_null", input(["raw"])))).toEqual([]);
    expect(codes(compare("eq", input(["missing"]), literal("x")))).toEqual(["unknown_input"]);
    expect(codes(compare("eq", input(["raw"]), literal(2)))).toEqual([]); // unknown type: the runtime decides
  });
});

describe("the condition tree", () => {
  const tree = {
    kind: "any", conditions: [
      compare("contains", input(["reply"]), literal("yes")),
      { kind: "all", conditions: [compare("gt", input(["score"]), literal(3)), compare("is_not_null", input(["raw"]))] },
    ],
  };

  test("addressing, replacing and removing by path never mutates the original", () => {
    const frozen = JSON.stringify(tree);
    expect(condition_at(tree, [1, 0]).operator).toBe("gt");
    const replaced = with_condition_at(tree, [1, 0], compare("lt", input(["score"]), literal(9)));
    expect(replaced.conditions[1].conditions[0].operator).toBe("lt");
    expect(replaced.conditions[0]).toBe(tree.conditions[0]);
    const removed = without_condition_at(tree, [1, 1]);
    expect(removed.conditions[1].conditions).toHaveLength(1);
    expect(without_condition_at(removed, [1, 0])).toBeNull(); // a group may not become empty
    expect(JSON.stringify(tree)).toBe(frozen);
  });

  test("grouping wraps a comparison with an explicit joiner; nothing gets an implicit precedence", () => {
    const one = compare("eq", input(["reply"]), literal("a"));
    const grouped = grouped_with(one, "all", compare("eq", input(["reply"]), literal("b")));
    expect(grouped).toStrictEqual({ kind: "all", conditions: [one, compare("eq", input(["reply"]), literal("b"))] });
    expect(grouped.conditions[0]).toBe(one);
  });

  test("a new comparison reads the first input with a literal that matches its type", () => {
    const graph = typedGraph();
    expect(new_compare(graph, ifNode(graph), "score")).toStrictEqual(compare("eq", input(["score"]), literal(0)));
    expect(new_compare(graph, ifNode(graph), "reply")).toStrictEqual(compare("eq", input(["reply"]), literal("")));
    expect(new_compare(graph, ifNode(graph), "raw")).toStrictEqual(compare("eq", input(["raw"]), literal("")));
  });

  test.each([
    [{ kind: "compare", operator: "matches", left: input(["a"]), right: literal(1) }, false],
    [{ kind: "compare", operator: "eq", left: { kind: "ref", node_id: "x", path: [] }, right: literal(1) }, false],
    [{ kind: "compare", operator: "eq", left: input(["a"]), right: literal(1), note: "x" }, false],
    [{ kind: "compare", operator: "is_null", left: input(["a"]), right: literal(null) }, false],
    [{ kind: "compare", operator: "eq", left: input(["a"]) }, false],
    [{ kind: "nand", conditions: [] }, false],
    [{ kind: "all", conditions: "x" }, false],
    [{ kind: "all", conditions: [] }, true],
    [compare("eq", input(["a", 0, "b"]), literal({ x: [1] })), true],
    [compare("is_null", input(["a"])), true],
  ])("readable %#", (condition, readable) => {
    expect(condition_is_readable(condition)).toBe(readable);
  });
});

describe("switch cases", () => {
  const cases = [{ id: "case-1", value: "a" }, { id: "case-2", value: 2 }, { id: "case-3", value: true }];

  test("fresh ids are stable strings that collide with no case and no port name", () => {
    expect(free_case_id(cases)).toBe("case-4");
    expect(free_case_id([{ id: "case-1" }, { id: "case-3" }])).toBe("case-2");
    expect(free_case_id([null, "x", { id: 5 }])).toBe("case-1");
  });

  test("problems follow the runtime's strict scalar rule", () => {
    const codes = (list) => case_problems(list).map((row) => row.map((problem) => problem.code));
    expect(codes(cases)).toEqual([[], [], []]);
    expect(codes([{ id: "a", value: 1 }, { id: "b", value: 1.0 }])).toEqual([[], ["duplicate_value"]]);
    expect(codes([{ id: "a", value: 1 }, { id: "b", value: "1" }, { id: "c", value: true }])).toEqual([[], [], []]);
    expect(codes([{ id: "default", value: 1 }, { id: "x", value: [1] }, { id: "x", value: 2 }, null, { value: 3 }]))
      .toEqual([["reserved_id"], ["not_a_scalar"], ["duplicate_id"], ["unreadable_case"], ["missing_id"]]);
  });

  test("display reads values exactly, never coerced", () => {
    expect(case_display({ id: "c", value: "" })).toBe("(empty text)");
    expect(case_display({ id: "c", value: "a" })).toBe("“a”");
    expect(case_display({ id: "c", value: 2 })).toBe("2");
    expect(case_display({ id: "c", value: false })).toBe("false");
    expect(case_display({ id: "c", value: null })).toBe("null");
    expect(case_display({ id: "c", value: { toString: null } })).toBe("(not a single value)");
  });

  test("moving keeps every case object, so outlets keep their edges", () => {
    const moved = move_case(cases, 2, 0);
    expect(moved.map((entry) => entry.id)).toEqual(["case-3", "case-1", "case-2"]);
    expect(moved[1]).toBe(cases[0]);
    expect(move_case(cases, 0, -1)).toBe(cases);
    expect(move_case(cases, 2, 3)).toBe(cases);
  });

  test("removing a wired case removes exactly that case and that outlet's edge in one edit", () => {
    const document = {
      schema_version: 1, kind: "agent", id: "d", name: "d",
      nodes: [{ id: "sw", type: "switch_case", config: { execution: { inputs: [], value: input(["v"]), cases } } }, { id: "end", type: "end", config: {} }],
      edges: [
        { id: "e1", kind: "flow", source_node_id: "sw", source_port_id: "case-1", target_node_id: "end", target_port_id: "in" },
        { id: "e2", kind: "flow", source_node_id: "sw", source_port_id: "case-2", target_node_id: "end", target_port_id: "in" },
      ],
    };
    const result = remove_case(document, "sw", "case-1");
    expect(result.removed_edge_ids).toEqual(["e1"]);
    expect(result.document.edges).toStrictEqual([document.edges[1]]);
    expect(result.document.nodes[0].config.execution.cases.map((entry) => entry.id)).toEqual(["case-2", "case-3"]);
    expect(result.document.nodes[0].config.execution.value).toBe(document.nodes[0].config.execution.value);
    expect(result.document.nodes[1]).toBe(document.nodes[1]);
    expect(remove_case(document, "sw", "nope").document).toBe(document);
    const ambiguous = { ...document, nodes: [...document.nodes, document.nodes[0]] };
    expect(remove_case(ambiguous, "sw", "case-1").document).toBe(ambiguous);
  });
});

describe("writing a branch's execution", () => {
  test("only the named field changes; others, unknown keys and other nodes are kept by reference", () => {
    const node = { id: "if", type: "if_else", config: { execution: { inputs: [binding("a", literal(1))], extra: 1 }, other: { x: 1 } } };
    const document = { schema_version: 1, kind: "agent", id: "d", name: "d", nodes: [node, { id: "n2", type: "end", config: {} }], edges: [] };
    const written = with_branch_execution(document, "if", "condition", compare("is_null", input(["a"])));
    expect(written.nodes[0].config.execution).toStrictEqual({ inputs: node.config.execution.inputs, extra: 1, condition: compare("is_null", input(["a"])) });
    expect(written.nodes[0].config.other).toBe(node.config.other);
    expect(written.nodes[1]).toBe(document.nodes[1]);
    const cleared = with_branch_execution(written, "if", "condition", undefined);
    expect(Object.keys(cleared.nodes[0].config.execution)).toEqual(["inputs", "extra"]);
  });

  test("an ambiguous id, a non-branch node or a foreign document is not written", () => {
    const node = { id: "if", type: "if_else", config: { execution: { inputs: [] } } };
    const twice = { schema_version: 1, kind: "agent", id: "d", name: "d", nodes: [node, { ...node }], edges: [] };
    expect(with_branch_execution(twice, "if", "condition", compare("is_null", input(["a"])))).toBe(twice);
    const agent = { ...twice, nodes: [{ id: "a", type: "agent", config: { execution: {} } }] };
    expect(with_branch_execution(agent, "a", "condition", 1)).toBe(agent);
    /* #357 G7: a Workflow's branch is written; a document of any other kind is not. */
    const foreign = { ...twice, kind: "recipe", nodes: [node] };
    expect(with_branch_execution(foreign, "if", "condition", 1)).toBe(foreign);
    const workflow = { ...twice, kind: "workflow", nodes: [node] };
    const written = with_branch_execution(workflow, "if", "condition", 1);
    expect(written).not.toBe(workflow);
    expect(written.nodes[0].config.execution.condition).toBe(1);
  });
});

describe("canvas ports", () => {
  test("in on the left, one outlet per declared row on the right, plus any outlet an edge still leaves through", () => {
    const node = { id: "sw", type: "switch_case", config: { execution: { inputs: [], cases: [{ id: "case-1", value: "a" }] } } };
    const document = { nodes: [node], edges: [
      { id: "e", kind: "flow", source_node_id: "sw", source_port_id: "case-9", target_node_id: "end", target_port_id: "in" },
      { id: "f", kind: "flow", source_node_id: "sw", source_port_id: "default", target_node_id: "end", target_port_id: "in" },
    ] };
    expect(branch_ports(document, node)).toStrictEqual({
      ports: [
        { id: "in", side: "left", kind: "in" },
        { id: "case-1", side: "right", kind: "out" },
        { id: "default", side: "right", kind: "out" },
        { id: "case-9", side: "right", kind: "out" },
      ],
      rows: [
        { port_id: "case-1", label: "“a”", declared: true },
        { port_id: "default", label: "Default", declared: true },
        { port_id: "case-9", label: "case-9", declared: false },
      ],
      readable: true,
    });
    const ifNode = { id: "if", type: "if_else", config: {} };
    expect(branch_ports({ nodes: [ifNode], edges: [] }, ifNode).rows.map((row) => row.label)).toEqual(["True", "False"]);
  });

  test("an unreadable switch still draws its edges and says it cannot list cases", () => {
    const node = { id: "sw", type: "switch_case", config: { execution: { cases: "broken" } } };
    const result = branch_ports({ nodes: [node], edges: [
      { id: "e", kind: "flow", source_node_id: "sw", source_port_id: "case-1", target_node_id: "end", target_port_id: "in" },
    ] }, node);
    expect(result.readable).toBe(false);
    expect(result.ports.map((port) => port.id)).toEqual(["in", "case-1"]);
  });
});

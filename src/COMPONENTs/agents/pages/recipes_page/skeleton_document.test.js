import {
  EXECUTION_CONFIG_KEY,
  NODE_TYPES,
  WORKFLOW_FORBIDDEN_NODE_TYPES,
  document_problems,
  execution_keys_for,
  find_node,
  node_bindings,
  node_declares_outputs,
  node_output_mappings,
  node_takes_inputs,
  output_source_kinds_for,
  upstream_node_ids,
  with_node_bindings,
  with_node_output_mappings,
  node_output_schema,
  with_node_output_schema,
} from "./skeleton_document";
import { SKELETON_DOCUMENT_CASES } from "./skeleton_document_cases";

const flow = (id, a, b) => ({
  id,
  kind: "flow",
  source_node_id: a,
  source_port_id: "out",
  target_node_id: b,
  target_port_id: "in",
});

const doc = () => ({
  schema_version: 1,
  kind: "workflow",
  id: "w",
  name: "W",
  nodes: [
    {
      id: "start",
      type: "start",
      config: { execution: { outputs: [{ name: "text", source: { kind: "result", path: ["text"] } }] } },
    },
    {
      id: "mid",
      type: "code",
      config: {
        execution: { inputs: [], outputs: [{ name: "rows", source: { kind: "result", path: ["rows"] } }] },
        code: {},
      },
    },
    { id: "end", type: "end", config: { execution: { inputs: [], outputs: [] } } },
  ],
  edges: [flow("e1", "start", "mid"), flow("e2", "mid", "end")],
});

describe("the IO lists live inside the execution config, not beside it", () => {
  test("bindings and mappings are read from config.execution", () => {
    /* An agent node's config is closed to exactly {execution, kernel}, so a
     * binding written one level up would be a refused document. */
    const d = doc();
    expect(node_output_mappings(d.nodes[0]).map((m) => m.name)).toEqual(["text"]);
    expect(node_bindings(d.nodes[1])).toEqual([]);
    expect(EXECUTION_CONFIG_KEY).toBe("execution");
  });

  test("writing a binding leaves the rest of that node's execution config alone", () => {
    const d = doc();
    const next = with_node_bindings(d, "mid", [{ name: "a", value: {}, missing: "error" }]);
    expect(Object.keys(next.nodes[1].config.execution).sort()).toEqual(["inputs", "outputs"]);
    expect(next.nodes[1].config.code).toEqual({});
    expect(node_output_mappings(next.nodes[1]).map((m) => m.name)).toEqual(["rows"]);
  });

  test("writing one node's list does not touch another node", () => {
    const d = doc();
    const next = with_node_output_mappings(d, "end", [
      { name: "out", source: { kind: "input", path: ["a"] } },
    ]);
    expect(next.nodes[0]).toBe(d.nodes[0]);
    expect(d.nodes[2].config.execution.outputs).toEqual([]);
  });

  test("a node with no execution config reads as empty rather than throwing", () => {
    expect(node_bindings({ id: "x", type: "code", config: {} })).toEqual([]);
    expect(node_bindings(null)).toEqual([]);
    expect(node_output_mappings(undefined)).toEqual([]);
  });

  test("find_node answers by id", () => {
    expect(find_node(doc(), "mid").type).toBe("code");
    expect(find_node(doc(), "ghost")).toBeNull();
  });
});

describe("which nodes carry inputs is the runtime's table, not a guess", () => {
  test("Start has outputs and no inputs", () => {
    expect(execution_keys_for("start")).toEqual(["outputs"]);
    expect(node_takes_inputs("start")).toBe(false);
    expect(node_declares_outputs("start")).toBe(true);
  });

  test("the executing nodes take both", () => {
    ["end", "agent", "code", "tool_call", "skill_read", "workflow_call"].forEach((type) => {
      expect(execution_keys_for(type)).toEqual(["inputs", "outputs"]);
    });
  });

  test("a branch takes inputs and its own decision, not outputs", () => {
    expect(execution_keys_for("if_else")).toEqual(["inputs", "condition"]);
    expect(execution_keys_for("switch_case")).toEqual(["inputs", "value", "cases"]);
    expect(node_declares_outputs("if_else")).toBe(false);
  });

  test("a pool attaches rather than runs, so it has no execution config", () => {
    WORKFLOW_FORBIDDEN_NODE_TYPES.filter((type) => type !== "agent").forEach((type) => {
      expect(execution_keys_for(type)).toBeNull();
      expect(node_takes_inputs(type)).toBe(false);
    });
  });
});

describe("an input can only bind to something already upstream", () => {
  test("upstream is walked through flow edges, nearest first", () => {
    expect(upstream_node_ids(doc(), "end")).toEqual(["mid", "start"]);
    expect(upstream_node_ids(doc(), "mid")).toEqual(["start"]);
    expect(upstream_node_ids(doc(), "start")).toEqual([]);
  });

  test("attach edges are not flow, so a pool is never an upstream source", () => {
    const d = doc();
    d.edges.push({
      id: "a1",
      kind: "attach",
      source_node_id: "mid",
      source_port_id: "attach_bot",
      target_node_id: "start",
      target_port_id: "attach_top",
    });
    expect(upstream_node_ids(d, "mid")).toEqual(["start"]);
  });

  test("a cycle is walked once rather than forever", () => {
    const d = doc();
    d.edges.push(flow("e3", "end", "start"));
    expect(upstream_node_ids(d, "end").sort()).toEqual(["end", "mid", "start"]);
  });
});

describe("the envelope's own rules", () => {
  test("every case agrees with the builder", () => {
    SKELETON_DOCUMENT_CASES.forEach((c) => {
      expect({ label: c.label, accepted: document_problems(c.doc).length === 0 }).toEqual({
        label: c.label,
        accepted: c.accepted,
      });
    });
  });

  test("the set covers both verdicts", () => {
    expect(SKELETON_DOCUMENT_CASES.some((c) => c.accepted)).toBe(true);
    expect(SKELETON_DOCUMENT_CASES.some((c) => !c.accepted)).toBe(true);
  });

  test("the twelve node types are the runtime's", () => {
    expect(NODE_TYPES).toHaveLength(12);
    expect(NODE_TYPES).toContain("hooks_pool");
    expect(NODE_TYPES).not.toContain("llm");
  });
});

describe("an Agent's output schema lives in its kernel config", () => {
  const kernel = {
    schema_version: 1,
    profile: { id: "p" },
    prompt: "go",
    max_iterations: 1,
    output_tokens: 10,
    history: "none",
    overflow: "error",
    json_schema: null,
  };

  const doc = (config) => ({
    schema_version: 1,
    kind: "workflow",
    id: "d",
    name: "D",
    nodes: [{ id: "k", type: "agent", config }],
    edges: [],
  });

  test("null and absent are different answers", () => {
    /* `null` is "this Agent replies in prose". Absent is "this node has no
       model configuration", which is not the schema editor's to fix. */
    expect(node_output_schema(doc({ kernel }).nodes[0])).toBe(null);
    expect(node_output_schema(doc({ execution: {} }).nodes[0])).toBe(undefined);
    expect(node_output_schema(null)).toBe(undefined);
  });

  test("writing a schema leaves the rest of the kernel alone", () => {
    const next = with_node_output_schema(doc({ execution: {}, kernel }), "k", {
      type: "object",
      properties: {},
    });
    const written = next.nodes[0].config.kernel;
    expect(written.json_schema).toEqual({ type: "object", properties: {} });
    expect(written.prompt).toBe("go");
    expect(Object.keys(written).sort()).toEqual(Object.keys(kernel).sort());
    expect(next.nodes[0].config.execution).toEqual({});
  });

  test("the schema object is stored by reference, not copied", () => {
    /* The editor compares the schema it last wrote against the one it is given
       to tell its own edit from a reload. A copy here would break that. */
    const schema = { type: "object", properties: {} };
    const next = with_node_output_schema(doc({ kernel }), "k", schema);
    expect(node_output_schema(next.nodes[0])).toBe(schema);
  });

  test("a node with no kernel is returned unchanged", () => {
    /* `validate_kernel_config` closes that object to a fixed key set, so one
       built here to hold a schema would be a refused document. */
    const before = doc({ execution: {} });
    const after = with_node_output_schema(before, "k", { type: "object" });
    expect(after.nodes[0]).toBe(before.nodes[0]);
  });

  test("another node is not touched", () => {
    const before = {
      ...doc({ execution: {}, kernel }),
      nodes: [
        { id: "k", type: "agent", config: { execution: {}, kernel } },
        { id: "other", type: "agent", config: { execution: {}, kernel } },
      ],
    };
    const after = with_node_output_schema(before, "k", { type: "object" });
    expect(after.nodes[1]).toBe(before.nodes[1]);
    expect(before.nodes[0].config.kernel.json_schema).toBe(null);
  });

  test("a document that is not one does not throw", () => {
    expect(() => with_node_output_schema(null, "k", {})).not.toThrow();
    expect(with_node_output_schema(null, "k", {})).toBe(null);
  });
});

describe("a node type the document does not know", () => {
  /* `is_skeleton_node` asks for a config object and nothing else, so a draft
     node of any type reaches the panel. A table read with that type answered
     `Object.prototype` for `__proto__` — truthy, and with no `includes` — and
     the panel went down inside the code deciding which sections to draw. */
  ["__proto__", "constructor", "toString", "valueOf", "something_new"].forEach((type) => {
    test(`${type} is unknown, not whatever a prototype answers`, () => {
      expect(execution_keys_for(type)).toBe(null);
      expect(node_takes_inputs(type)).toBe(false);
      expect(node_declares_outputs(type)).toBe(false);
      expect(output_source_kinds_for(type)).toEqual([]);
    });
  });

  test("and the types it does know are unaffected", () => {
    expect(execution_keys_for("agent")).toEqual(["inputs", "outputs"]);
    expect(output_source_kinds_for("end")).toEqual(["input"]);
    expect(output_source_kinds_for("start")).toEqual(["result"]);
    expect(output_source_kinds_for("agent")).toEqual(["input", "result"]);
  });
});

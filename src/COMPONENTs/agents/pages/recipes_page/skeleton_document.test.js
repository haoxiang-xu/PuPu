import {
  EXECUTION_CONFIG_KEY,
  LEGACY_FIELDS_CONFIG_KEY,
  NODE_KEYS,
  NODE_TYPES,
  drawn_node,
  node_pool_is_legacy,
  node_subagents,
  with_node_subagents,
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
  with_node_kernel,
  with_node_output_schema,
} from "./skeleton_document";
import { SKELETON_DOCUMENT_CASES } from "./skeleton_document_cases";
import { ENVELOPE_ROWS } from "./skeleton_drill_replacement_capture";

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

describe("writing the whole kernel is how a node gets a model", () => {
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
    kind: "agent",
    id: "d",
    name: "D",
    nodes: [{ id: "k", type: "agent", config }],
    edges: [],
  });

  test("a node with no kernel is given one", () => {
    /* The one write that may create it. `with_node_output_schema` refuses to,
       because turning JSON output on must not invent a profile; choosing a
       model is the act that makes a Kernel exist. */
    const after = with_node_kernel(doc({ execution: { inputs: [] } }), "k", kernel);
    expect(after.nodes[0].config.kernel).toBe(kernel);
  });

  test("the execution half is left exactly as it was", () => {
    const execution = { inputs: [{ name: "a" }], outputs: [] };
    const after = with_node_kernel(doc({ execution }), "k", kernel);
    expect(after.nodes[0].config.execution).toBe(execution);
    expect(Object.keys(after.nodes[0].config).sort()).toEqual(["execution", "kernel"]);
  });

  test("an existing kernel is replaced whole", () => {
    /* The runtime closes the object, so there is no partial kernel it would
       keep — a merge would be a way to leave a key from the previous model
       behind. */
    const next = { ...kernel, prompt: "other" };
    const after = with_node_kernel(doc({ kernel }), "k", next);
    expect(after.nodes[0].config.kernel).toBe(next);
  });

  test("another node is not touched", () => {
    const before = {
      ...doc({ kernel }),
      nodes: [
        { id: "k", type: "agent", config: { kernel } },
        { id: "other", type: "agent", config: { kernel } },
      ],
    };
    const after = with_node_kernel(before, "k", { ...kernel, prompt: "x" });
    expect(after.nodes[1]).toBe(before.nodes[1]);
  });

  test("nothing that is not a kernel is written", () => {
    const before = doc({ execution: {} });
    expect(with_node_kernel(before, "k", null)).toBe(before);
    expect(with_node_kernel(before, "k", [kernel])).toBe(before);
    expect(with_node_kernel(before, "k", "kernel")).toBe(before);
  });

  test("a document that is not one does not throw", () => {
    expect(with_node_kernel(null, "k", kernel)).toBe(null);
    expect(() => with_node_kernel({ nodes: "none" }, "k", kernel)).not.toThrow();
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

describe("what a Subagent Pool node holds", () => {
  const pool = (config) => ({
    schema_version: 1,
    kind: "agent",
    id: "d",
    name: "D",
    nodes: [{ id: "pool", type: "subagent_pool", config }],
    edges: [],
  });

  const entry = {
    id: "subagent-1",
    name: "Summarizer",
    description: "",
    source: { kind: "agent_ref", agent_id: "res-1" },
    allowed_modes: ["delegate"],
    output_mode: "summary",
    memory_policy: "ephemeral",
    parallel_safe: true,
    allowed_tools: null,
    disabled_tools: [],
  };

  test("the entries are returned as the document has them", () => {
    expect(node_subagents({ config: { subagents: [entry] } })).toEqual([entry]);
  });

  test("a pool with no subagents key is not a pool holding nothing", () => {
    /* The runtime refuses the two differently — `missing_field` against
       `missing_value` — so flattening them into one empty array here would
       make one of them unsayable and the editor's account of the document
       wrong. */
    expect(node_subagents({ config: {} })).toBeUndefined();
    expect(node_subagents({ config: { subagents: [] } })).toEqual([]);
  });

  test("a shape that is not an array comes back as it is, not as empty", () => {
    expect(node_subagents({ config: { subagents: "Summarizer" } })).toBe("Summarizer");
  });

  test("a node with no config at all answers nothing", () => {
    expect(node_subagents({ id: "pool", type: "subagent_pool" })).toBeUndefined();
    expect(node_subagents(null)).toBeUndefined();
  });

  test("writing entries leaves everything else on the node alone", () => {
    const next = with_node_subagents(pool({ subagents: [] }), "pool", [entry]);
    expect(next.nodes[0].config.subagents).toEqual([entry]);
    expect(next.nodes[0].type).toBe("subagent_pool");
  });

  test("an unknown node id changes nothing", () => {
    const document = pool({ subagents: [] });
    expect(with_node_subagents(document, "nope", [entry])).toBe(document);
  });
});

describe("a pool converted from a legacy definition", () => {
  const legacy = {
    schema_version: 1,
    kind: "agent",
    id: "d",
    name: "D",
    nodes: [
      {
        id: "pool",
        type: "subagent_pool",
        config: { [LEGACY_FIELDS_CONFIG_KEY]: { subagents: [{ kind: "recipe_ref", recipe_name: "S" }] } },
      },
    ],
    edges: [],
  };

  test("is recognised by the store's own test, which is the subagents key", () => {
    /* `skeleton_resource_store.py:328`: the store expands `legacy_fields`
       only while there is no `subagents` key. */
    expect(node_pool_is_legacy(legacy.nodes[0])).toBe(true);
    expect(
      node_pool_is_legacy({ config: { subagents: [], legacy_fields: { subagents: [] } } }),
    ).toBe(false);
    expect(node_pool_is_legacy({ config: { subagents: [] } })).toBe(false);
    expect(node_pool_is_legacy({ config: {} })).toBe(false);
  });

  test("cannot be written to, because one entry would delete all of them", () => {
    /* Adding a `subagents` key is exactly the condition that stops the store
       expanding the legacy entries. The author would lose every subagent they
       had, at Run, with nothing said. */
    expect(with_node_subagents(legacy, "pool", [entry_for_legacy()])).toBe(legacy);
    expect(
      with_node_subagents(legacy, "pool", []).nodes[0].config[LEGACY_FIELDS_CONFIG_KEY],
    ).toEqual(legacy.nodes[0].config[LEGACY_FIELDS_CONFIG_KEY]);
  });

  function entry_for_legacy() {
    return {
      id: "subagent-1",
      name: "Summarizer",
      description: "",
      source: { kind: "agent_ref", agent_id: "res-1" },
      allowed_modes: ["delegate"],
      output_mode: "summary",
      memory_policy: "ephemeral",
      parallel_safe: true,
      allowed_tools: null,
      disabled_tools: [],
    };
  }
});

describe("the node a drawing is given", () => {
  /* A node is closed to `{id, type, config}`, and the rows below are the real
     store refusing everything else: on a parent `save_draft` itself refuses
     the key, and inside an embedded child — where the draft check never looks
     — the draft saves with `diagnostics: []`, comes back verbatim, and Run
     refuses the key with `unknown_field` AT it.
     So a value beside those three is not part of the graph. The drawings read
     a node's own `label` and `model`; what they must be handed is the node. */

  const row = (name) => ENVELOPE_ROWS.find((item) => item.case === name);

  test("the store's answer is the same for a plausible value as for junk", () => {
    const junk = row("child_node_label_unreadable");
    const text = row("child_node_label_text");
    [junk, text].forEach((item) => {
      expect([item.case, item.saved, item.round_trip]).toEqual([item.case, true, true]);
      expect([item.case, item.run.code, item.run.path.slice(-1)]).toEqual([
        item.case, "unknown_field", ["label"],
      ]);
      /* Since the #356 repair the draft check says the same thing, at the
         same path, rather than nothing — which is why the drawing may not
         read the key but the author is told about it. */
      expect([item.case, item.draft_diagnostics.map((found) => found.code)]).toEqual([
        item.case, ["unknown_field"],
      ]);
      expect([item.case, item.draft_diagnostics[0].path.slice(-1)]).toEqual([
        item.case, ["label"],
      ]);
    });
    /* And on a parent it never gets stored at all. */
    expect(row("parent_node_label_unreadable").save_refused.code).toBe("unknown_field");
    expect(row("parent_node_label_text").save_refused.code).toBe("unknown_field");
  });

  test("it keeps exactly the keys a node has, and nothing beside them", () => {
    const stored = {
      id: "agent",
      type: "agent",
      config: { kernel: { prompt: "hello" } },
      label: { toString: null },
      model: { toString: null },
      override: { model: {} },
      x: 10,
    };
    const drawn = drawn_node(stored);
    expect(Object.keys(drawn).sort()).toEqual([...NODE_KEYS].sort());
    expect(drawn.config).toBe(stored.config);
    /* The stored node is untouched: this is what the DRAWING is given. */
    expect(Object.keys(stored)).toHaveLength(7);
  });

  test("a key a node simply does not have stays absent rather than becoming undefined", () => {
    /* `label in node` is how a drawing asks, and a key present with
       `undefined` answers yes. */
    expect("config" in drawn_node({ id: "a", type: "start" })).toBe(false);
    expect(drawn_node({ id: "a", type: "start" })).toEqual({ id: "a", type: "start" });
  });

  test("something that is not a node is handed back as it is", () => {
    expect(drawn_node(null)).toBeNull();
    expect(drawn_node("agent")).toBe("agent");
  });
});

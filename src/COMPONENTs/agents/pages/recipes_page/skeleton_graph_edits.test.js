import {
  ADDABLE_NODE_TYPES,
  add_node,
  connect_nodes,
  delete_edge,
  delete_node,
  new_agent_document,
} from "./skeleton_graph_edits";
import capture from "./skeleton_graph_edits_capture.json";
import admissionCapture from "./skeleton_graph_admission_capture.json";

/* The pure authoring core, checked two ways.
 *
 * First against the real producer: `skeleton_graph_edits_capture.json` is a
 * verbatim copy of native-seed-capture.json, produced by root on 2026-10-22
 * by running the source `SkeletonResourceStore` (unchain_runtime/server/
 * skeleton_resource_store.py @ e24e993f) with the fixed installed runtime
 * through save_draft → get_resource → diagnose → preflight for seven draft
 * shapes. Each test below replays the same commands the producer script
 * hand-built and compares the JS document with what the store saved and
 * read back. The capture also records that every one of those drafts is
 * refused by preflight — that is the intended, unfinished state of a draft
 * without a Kernel, and nothing here claims otherwise.
 *
 * Then against the rules the plan froze: closed wire, deterministic ids,
 * reference preservation, refusal with the original object, no guessing. */

const SOURCE_HEAD = "e24e993fe9aaf70920cd94e43cfdb4fbc139e302";
const STORE_SOURCE_SHA256 = "267cfc3faa16cbda440d2ca9eafff1d73f7194dddb2ecce7d44acb7574c24611";

const RESULT_KEYS = ["document", "ok", "problem"];
const DOCUMENT_KEYS = ["schema_version", "kind", "id", "name", "nodes", "edges"];
const NODE_KEYS = ["id", "type", "config"];
const EDGE_KEYS = [
  "id",
  "kind",
  "source_node_id",
  "source_port_id",
  "target_node_id",
  "target_port_id",
];

const accepted = (result) => {
  expect(Object.keys(result).sort()).toEqual(RESULT_KEYS);
  expect(result.ok).toBe(true);
  expect(result.problem).toBeNull();
  return result.document;
};

const refused = (result, original, code) => {
  expect(Object.keys(result).sort()).toEqual(RESULT_KEYS);
  expect(result.ok).toBe(false);
  expect(result.document).toBe(original);
  expect(Object.keys(result.problem).sort()).toEqual(["code", "message"]);
  expect(result.problem.code).toBe(code);
  expect(typeof result.problem.message).toBe("string");
  expect(result.problem.message.length).toBeGreaterThan(0);
  return result.problem;
};

const seed = (id = "native-seed") => accepted(new_agent_document({ id, name: "New Agent" }));

const flow = (source_node_id, target_node_id, extra = {}) => ({
  kind: "flow",
  source_node_id,
  source_port_id: "out",
  target_node_id,
  target_port_id: "in",
  ...extra,
});

const attach = (source_node_id, source_port_id, target_node_id, target_port_id, extra = {}) => ({
  kind: "attach",
  source_node_id,
  source_port_id,
  target_node_id,
  target_port_id,
  ...extra,
});

const node = (document, id) => document.nodes.find((entry) => entry.id === id);

/* start → agent → agent-2, End still dangling, built only through the
 * public commands. */
function chain() {
  let document = accepted(add_node(seed("native-chain"), { type: "agent", id: "agent-2" }));
  document = accepted(delete_edge(document, "flow-agent-end"));
  return accepted(connect_nodes(document, flow("agent", "agent-2", { id: "to-agent-2" })));
}

/* The command sequence root's producer script hand-built for each case. */
function replay(row) {
  let document = seed(row.input_document.id);
  switch (row.case) {
    case "seed":
      break;
    case "added_agent":
      document = accepted(add_node(document, { type: "agent", id: "agent-2" }));
      break;
    case "added_pool":
      document = accepted(add_node(document, { type: "subagent_pool", id: "pool" }));
      break;
    case "attached_pool":
      document = accepted(add_node(document, { type: "subagent_pool", id: "pool" }));
      document = accepted(
        connect_nodes(
          document,
          attach("agent", "attach_bot", "pool", "attach_top", { id: "attach-agent-pool" }),
        ),
      );
      break;
    case "reversed_attach":
      document = accepted(add_node(document, { type: "subagent_pool", id: "pool" }));
      document = accepted(
        connect_nodes(
          document,
          attach("pool", "attach_top", "agent", "attach_bot", { id: "attach-agent-pool" }),
        ),
      );
      break;
    case "removed_agent":
      document = accepted(delete_node(document, "agent"));
      break;
    case "disconnected":
      document = accepted(delete_edge(document, "flow-start-agent"));
      document = accepted(delete_edge(document, "flow-agent-end"));
      break;
    default:
      throw new Error(`capture case "${row.case}" has no replay; the fixture changed`);
  }
  return document;
}

describe("the real producer capture this core is compared against", () => {
  test("is the root capture of the source store at the frozen base", () => {
    expect(capture.schema).toBe("qa.native-seed-producer.v1");
    expect(capture.source_head).toBe(SOURCE_HEAD);
    expect(capture.store_source_sha256).toBe(STORE_SOURCE_SHA256);
    expect(capture.unchain_origin).toContain("/fixed-pair/install-venv/");
    expect(capture.cases.map((row) => row.case)).toEqual([
      "seed",
      "added_agent",
      "added_pool",
      "attached_pool",
      "reversed_attach",
      "removed_agent",
      "disconnected",
    ]);
  });

  test("every draft shape was saved and read back equal, and none is runnable", () => {
    capture.cases.forEach((row) => {
      expect(row.saved).toBe(true);
      expect(row.roundtrip_equal).toBe(true);
      expect(row.edit_token).toMatch(/^edit-1-[0-9a-f]{24}$/);
      expect(row.preflight.ok).toBe(false);
    });
  });

  test("the seed saves with no diagnostics yet preflight refuses it for its missing Kernel", () => {
    const row = capture.cases.find((entry) => entry.case === "seed");
    expect(row.diagnostics).toEqual([]);
    expect(row.preflight).toEqual({
      ok: false,
      code: "invalid_shape",
      path: ["document", "nodes", 1, "config"],
    });
  });

  test("the unfinished drafts carry the store's own diagnostics, not invented ones", () => {
    const codes = (name) =>
      capture.cases.find((row) => row.case === name).diagnostics.map((entry) => entry.code);
    expect(codes("added_agent")).toEqual([
      "flow_input_required",
      "flow_output_required",
      "unreachable_node",
      "cannot_reach_end",
    ]);
    expect(codes("added_pool")).toEqual(["pool_attachment_required"]);
    expect(codes("attached_pool")).toEqual([]);
    expect(codes("reversed_attach")).toEqual([]);
    expect(codes("removed_agent")).toContain("agent_required");
    expect(codes("disconnected")).toContain("flow_output_required");
  });
});

describe("factory and commands reproduce each real-store roundtrip exactly", () => {
  capture.cases.forEach((row) => {
    test(`${row.case}: the JS document equals what the store saved and read back`, () => {
      expect(replay(row)).toStrictEqual(row.document);
    });
  });

  test("the wire is closed: document, node and edge keys and nothing else", () => {
    let document = accepted(add_node(seed(), { type: "subagent_pool" }));
    document = accepted(
      connect_nodes(document, attach("agent", "attach_bot", "pool", "attach_top")),
    );
    expect(Object.keys(document)).toEqual(DOCUMENT_KEYS);
    expect(document.schema_version).toBe(1);
    expect(document.kind).toBe("agent");
    document.nodes.forEach((entry) => expect(Object.keys(entry)).toEqual(NODE_KEYS));
    document.edges.forEach((entry) => expect(Object.keys(entry)).toEqual(EDGE_KEYS));
    expect(Object.prototype.hasOwnProperty.call(document, "description")).toBe(false);
  });

  test("no Kernel, model, layout or label is invented for any node", () => {
    const document = accepted(add_node(seed(), { type: "agent" }));
    document.nodes.forEach((entry) => {
      expect(Object.prototype.hasOwnProperty.call(entry.config, "kernel")).toBe(false);
      ["x", "y", "position", "label", "model", "deletable", "outputs"].forEach((key) => {
        expect(Object.prototype.hasOwnProperty.call(entry, key)).toBe(false);
      });
    });
    expect(node(document, "start").config).toEqual({ execution: { outputs: [] } });
    expect(node(document, "agent").config).toEqual({ execution: { inputs: [], outputs: [] } });
    expect(node(document, "agent-2").config).toEqual({ execution: { inputs: [], outputs: [] } });
    expect(node(document, "end").config).toEqual({ execution: { inputs: [], outputs: [] } });
  });
});

describe("only the supported Agent and Workflow document protocol can be edited", () => {
  /* #357 G7: a Workflow is editable now; a model node in it is still refused. */
  test("a real stored Workflow is refused a forbidden Agent", () => {
    const workflow = admissionCapture.cases.find((row) => row.case === "workflow-no-agent");
    const withAgent = admissionCapture.cases.find((row) => row.case === "workflow-with-agent");
    expect(workflow.saved).toBe(true);
    expect(withAgent.refusal).toEqual({
      code: "invalid_value",
      path: ["document", "nodes", 2, "type"],
    });
    refused(add_node(workflow.document, { type: "agent" }), workflow.document, "not_allowed_in_workflow");
  });

  test.each([
    ["unknown kind", { kind: "future-kind" }],
    ["unreadable kind", { kind: { toString: null } }],
    ["future version", { schema_version: 2 }],
    ["string version", { schema_version: "1" }],
    ["missing version", { schema_version: undefined }],
  ])("%s: every mutation refuses with the original document", (label, patch) => {
    const document = { ...seed(), ...patch };
    const before = JSON.stringify(document);
    [
      add_node(document, { type: "agent" }),
      delete_node(document, "agent"),
      connect_nodes(document, flow("start", "end")),
      delete_edge(document, "flow-agent-end"),
    ].forEach((result) => refused(result, document, "invalid_document"));
    expect(JSON.stringify(document)).toBe(before);
  });
});

describe("new_agent_document", () => {
  test("names the factory nodes and edges exactly", () => {
    const document = seed("native-seed");
    expect(document.id).toBe("native-seed");
    expect(document.name).toBe("New Agent");
    expect(document.nodes.map((entry) => entry.id)).toEqual(["start", "agent", "end"]);
    expect(document.nodes.map((entry) => entry.type)).toEqual(["start", "agent", "end"]);
    expect(document.edges.map((entry) => entry.id)).toEqual([
      "flow-start-agent",
      "flow-agent-end",
    ]);
    expect(document.edges[0]).toEqual({
      id: "flow-start-agent",
      kind: "flow",
      source_node_id: "start",
      source_port_id: "out",
      target_node_id: "agent",
      target_port_id: "in",
    });
  });

  test("the resource id follows the store's rule, which is not the node-id rule", () => {
    expect(seed("constructor").id).toBe("constructor");
    expect(seed("a").id).toBe("a");
    expect(seed(`a${"b".repeat(199)}`).id).toHaveLength(200);
    expect(seed("A1._:-z").id).toBe("A1._:-z");
    refused(new_agent_document({ id: "__proto__", name: "New Agent" }), null, "invalid_resource_id");
    refused(new_agent_document({ id: "", name: "New Agent" }), null, "invalid_resource_id");
    refused(new_agent_document({ id: "-leading", name: "New Agent" }), null, "invalid_resource_id");
    refused(new_agent_document({ id: "has space", name: "New Agent" }), null, "invalid_resource_id");
    refused(
      new_agent_document({ id: `a${"b".repeat(200)}`, name: "New Agent" }),
      null,
      "invalid_resource_id",
    );
    refused(new_agent_document({ id: 7, name: "New Agent" }), null, "invalid_resource_id");
  });

  test("the name is a non-empty string and is not coerced", () => {
    refused(new_agent_document({ id: "x", name: "" }), null, "invalid_resource_name");
    refused(new_agent_document({ id: "x", name: 3 }), null, "invalid_resource_name");
    refused(new_agent_document({ id: "x", name: { toString: null } }), null, "invalid_resource_name");
    refused(new_agent_document({ id: "x" }), null, "invalid_command");
  });

  test("refuses extra argument keys and non-object arguments with document null", () => {
    refused(
      new_agent_document({ id: "x", name: "n", description: "" }),
      null,
      "invalid_command",
    );
    refused(new_agent_document({ id: "x", name: "n", nodes: [] }), null, "invalid_command");
    refused(new_agent_document(null), null, "invalid_command");
    refused(new_agent_document("x"), null, "invalid_command");
    refused(new_agent_document(["x", "n"]), null, "invalid_command");
  });

  test("two documents share no object", () => {
    const a = seed("native-isolation-a");
    const b = seed("native-isolation-b");
    expect(a.nodes).not.toBe(b.nodes);
    expect(a.edges).not.toBe(b.edges);
    a.nodes[1].config.execution.inputs.push({
      name: "private",
      value: { kind: "literal", value: 1 },
      missing: "error",
    });
    a.nodes[0].config.execution.outputs.push({ name: "x" });
    expect(b.nodes[1].config.execution.inputs).toEqual([]);
    expect(b.nodes[0].config.execution.outputs).toEqual([]);
  });
});

describe("add_node", () => {
  test("offers exactly the native types with business editors", () => {
    /* #351 adds If / Else and Switch / Case together with their editors
       (branch_section.js); the list stays exact. */
    /* #352 adds Tool Call and Skill Read, #357 adds Code, Workflow Call and Hooks Pool; the list stays exact. */
    expect([...ADDABLE_NODE_TYPES]).toEqual(["toolkit_pool", "agent", "subagent_pool", "if_else", "switch_case", "tool_call", "skill_read", "code", "workflow_call", "hooks_pool"]);
    expect(Object.isFrozen(ADDABLE_NODE_TYPES)).toBe(true);
  });

  test("appends a pool with the captured empty config", () => {
    const base = seed();
    const document = accepted(add_node(base, { type: "subagent_pool" }));
    expect(document.nodes.at(-1)).toEqual({
      id: "pool",
      type: "subagent_pool",
      config: { subagents: [] },
    });
  });

  test("refuses the factory types, unknown types and non-string types", () => {
    const base = seed();
    refused(add_node(base, { type: "start" }), base, "protected_node_type");
    refused(add_node(base, { type: "end" }), base, "protected_node_type");
    ["workflow", "branch", "some_future_step", "__proto__", "constructor", ""].forEach(
      (type) => refused(add_node(base, { type }), base, "unsupported_node_type"),
    );
    refused(add_node(base, { type: { toString: null } }), base, "invalid_command");
    refused(add_node(base, { type: 1 }), base, "invalid_command");
    refused(add_node(base, {}), base, "invalid_command");
    refused(add_node(base, null), base, "invalid_command");
    refused(add_node(base, "agent"), base, "invalid_command");
  });

  test("refuses extra command keys instead of carrying them onto the node", () => {
    const base = seed();
    refused(add_node(base, { type: "agent", extra: true }), base, "invalid_command");
    refused(add_node(base, { type: "agent", config: {} }), base, "invalid_command");
    refused(add_node(base, { type: "agent", x: 0, y: 0 }), base, "invalid_command");
  });

  test("an explicit id is used verbatim and must be new and non-empty", () => {
    const base = seed();
    expect(accepted(add_node(base, { type: "agent", id: "writer" })).nodes.at(-1).id).toBe(
      "writer",
    );
    refused(add_node(base, { type: "agent", id: "agent" }), base, "duplicate_node_id");
    refused(add_node(base, { type: "subagent_pool", id: "end" }), base, "duplicate_node_id");
    refused(add_node(base, { type: "agent", id: "" }), base, "invalid_node_id");
    refused(add_node(base, { type: "agent", id: undefined }), base, "invalid_node_id");
    refused(add_node(base, { type: "agent", id: 2 }), base, "invalid_node_id");
  });

  test("deterministic ids step past every id the document holds", () => {
    const base = seed();
    const second = accepted(add_node(base, { type: "agent" }));
    expect(second.nodes.at(-1).id).toBe("agent-2");
    const third = accepted(add_node(second, { type: "agent" }));
    expect(third.nodes.at(-1).id).toBe("agent-3");
    expect(new Set(third.nodes.map((entry) => entry.id)).size).toBe(third.nodes.length);
    expect(accepted(add_node(base, { type: "agent" })).nodes.at(-1).id).toBe("agent-2");

    const taken = accepted(add_node(base, { type: "agent", id: "agent-2" }));
    expect(accepted(add_node(taken, { type: "agent" })).nodes.at(-1).id).toBe("agent-3");

    const pooled = accepted(add_node(base, { type: "subagent_pool" }));
    expect(pooled.nodes.at(-1).id).toBe("pool");
    expect(accepted(add_node(pooled, { type: "subagent_pool" })).nodes.at(-1).id).toBe("pool-2");
  });

  test("prototype-member node ids are ordinary ids", () => {
    const base = seed();
    ["__proto__", "constructor", "toString", "valueOf", "hasOwnProperty"].forEach((id) => {
      const document = accepted(add_node(base, { type: "agent", id }));
      expect(document.nodes.at(-1).id).toBe(id);
      expect(document.nodes).toHaveLength(4);
      refused(add_node(document, { type: "agent", id }), document, "duplicate_node_id");
    });
  });

  test("carries every untouched node, the edges array and unknown top-level keys by reference", () => {
    const base = seed();
    const odd = {
      ...base,
      description: "kept",
      layout_hint: { x: 1 },
      nodes: [...base.nodes, { id: "agent-2", type: "agent", config: { sentinel: "preserve" } }],
    };
    const before = JSON.stringify(odd);
    const document = accepted(add_node(odd, { type: "agent" }));
    expect(document).not.toBe(odd);
    expect(document.nodes).not.toBe(odd.nodes);
    expect(document.edges).toBe(odd.edges);
    expect(document.description).toBe("kept");
    expect(document.layout_hint).toBe(odd.layout_hint);
    odd.nodes.forEach((entry, index) => expect(document.nodes[index]).toBe(entry));
    expect(document.nodes.at(-1).id).toBe("agent-3");
    expect(JSON.stringify(odd)).toBe(before);
  });

  test("does not crash on, strip or repair malformed stored entries", () => {
    const base = seed();
    const bad = {
      ...base,
      nodes: [...base.nodes, null, 5, [], { id: 7 }, { id: "typed", type: 9 }, { type: "agent" }],
    };
    const document = accepted(add_node(bad, { type: "agent" }));
    expect(document.nodes).toHaveLength(bad.nodes.length + 1);
    bad.nodes.forEach((entry, index) => expect(document.nodes[index]).toBe(entry));
    expect(document.nodes.at(-1).id).toBe("agent-2");
  });

  test("refuses a document it cannot read, returning that very value", () => {
    [null, "doc", [], {}, { nodes: "x", edges: [] }, { nodes: [], edges: {} }].forEach(
      (document) => refused(add_node(document, { type: "agent" }), document, "invalid_document"),
    );
  });
});

describe("delete_node", () => {
  test("keeps Start and End, refuses what is missing or ambiguous", () => {
    const base = seed();
    refused(delete_node(base, "start"), base, "protected_node");
    refused(delete_node(base, "end"), base, "protected_node");
    refused(delete_node(base, "missing"), base, "node_not_found");
    refused(delete_node(base, ""), base, "invalid_node_id");
    refused(delete_node(base, 1), base, "invalid_node_id");
    refused(delete_node(base, { toString: null }), base, "invalid_node_id");
    const ambiguous = {
      ...base,
      nodes: [...base.nodes, { id: "agent", type: "agent", config: { sentinel: "preserve" } }],
    };
    refused(delete_node(ambiguous, "agent"), ambiguous, "ambiguous_node_id");
    const twice = { ...base, nodes: [...base.nodes, base.nodes[1]] };
    refused(delete_node(twice, "agent"), twice, "ambiguous_node_id");
  });

  test("removes the node and its incident edges only", () => {
    let document = accepted(add_node(seed(), { type: "agent", id: "agent-2" }));
    document = accepted(add_node(document, { type: "subagent_pool", id: "pool" }));
    document = accepted(
      connect_nodes(document, attach("agent-2", "attach_bot", "pool", "attach_top")),
    );
    document = accepted(connect_nodes(document, attach("agent", "attach_bot", "pool", "attach_top")));
    document = accepted(connect_nodes(document, flow("agent-2", "end")));
    const removed = accepted(delete_node(document, "agent"));
    expect(removed.nodes.map((entry) => entry.id)).toEqual(["start", "end", "agent-2", "pool"]);
    expect(removed.edges.map((entry) => entry.id)).toEqual([
      "attach-agent-2-pool",
      "flow-agent-2-end",
    ]);
    removed.nodes.forEach((entry) => expect(document.nodes).toContain(entry));
    removed.edges.forEach((entry) => expect(document.edges).toContain(entry));
    expect(removed.id).toBe(document.id);
    expect(removed.name).toBe(document.name);
  });

  test("deleting a pool drops its attachments and keeps the flow by reference", () => {
    let document = accepted(add_node(seed(), { type: "subagent_pool", id: "pool" }));
    document = accepted(connect_nodes(document, attach("agent", "attach_bot", "pool", "attach_top")));
    const removed = accepted(delete_node(document, "pool"));
    expect(removed.nodes.map((entry) => entry.id)).toEqual(["start", "agent", "end"]);
    expect(removed.edges).toEqual(document.edges.slice(0, 2));
    expect(removed.edges[0]).toBe(document.edges[0]);
    expect(removed.edges[1]).toBe(document.edges[1]);
  });

  test("leaves consumers' refs, defaults and missing policies for the real diagnose", () => {
    const document = seed("native-ref-preserve");
    const end = node(document, "end");
    const binding = {
      name: "answer",
      value: { kind: "ref", node_id: "agent", path: ["message"] },
      missing: "default",
      default: { toString: null },
    };
    end.config.execution.inputs.push(binding);
    const removed = accepted(delete_node(document, "agent"));
    expect(node(removed, "end")).toBe(end);
    expect(node(removed, "end").config.execution.inputs[0]).toBe(binding);
    expect(binding.value.node_id).toBe("agent");
    expect(binding.default).toEqual({ toString: null });
    expect(removed.edges).toEqual([]);
    expect(removed.nodes.map((entry) => entry.id)).toEqual(["start", "end"]);
  });

  test("deletes a node whose stored type is bad, and tolerates bad edge entries", () => {
    const base = seed();
    const odd = {
      ...base,
      nodes: [...base.nodes, { id: "typed", type: 9, config: null }],
      edges: [...base.edges, null, "edge", { id: "half", source_node_id: "typed" }],
    };
    const removed = accepted(delete_node(odd, "typed"));
    expect(removed.nodes).toEqual(base.nodes);
    expect(removed.edges).toHaveLength(4);
    expect(removed.edges[2]).toBeNull();
    expect(removed.edges[3]).toBe("edge");
    expect(removed.edges.find((entry) => entry && entry.id === "half")).toBeUndefined();
  });
});

describe("connect_nodes: flow", () => {
  test("a second edge into one inlet is a join, not a cycle", () => {
    const extra = accepted(add_node(seed(), { type: "agent", id: "agent-2" }));
    const joined = accepted(connect_nodes(extra, flow("agent-2", "end")));
    expect(joined.edges.filter((entry) => entry.target_node_id === "end")).toHaveLength(2);
    expect(joined.edges.at(-1)).toEqual({
      id: "flow-agent-2-end",
      kind: "flow",
      source_node_id: "agent-2",
      source_port_id: "out",
      target_node_id: "end",
      target_port_id: "in",
    });
    expect(joined.nodes).toBe(extra.nodes);
    extra.edges.forEach((entry, index) => expect(joined.edges[index]).toBe(entry));
  });

  test("one outlet feeds one edge; the existing edge is never replaced", () => {
    const extra = accepted(add_node(seed(), { type: "agent", id: "agent-2" }));
    const before = JSON.stringify(extra);
    refused(connect_nodes(extra, flow("agent", "agent-2")), extra, "outlet_occupied");
    refused(connect_nodes(extra, flow("start", "agent-2")), extra, "outlet_occupied");
    expect(JSON.stringify(extra)).toBe(before);
  });

  test("refuses a genuine cycle, however long, and a self loop", () => {
    const linked = chain();
    refused(connect_nodes(linked, flow("agent-2", "agent")), linked, "flow_cycle");
    refused(connect_nodes(linked, flow("agent", "agent")), linked, "self_connection");

    let long = accepted(add_node(linked, { type: "agent", id: "agent-3" }));
    long = accepted(connect_nodes(long, flow("agent-2", "agent-3")));
    refused(connect_nodes(long, flow("agent-3", "agent")), long, "flow_cycle");
    refused(connect_nodes(long, flow("agent-3", "agent-2")), long, "flow_cycle");
    const finished = accepted(connect_nodes(long, flow("agent-3", "end")));
    expect(finished.edges.map((entry) => entry.id)).toEqual([
      "flow-start-agent",
      "to-agent-2",
      "flow-agent-2-agent-3",
      "flow-agent-3-end",
    ]);
  });

  test("Start never arrives, End never leaves, pools never take part", () => {
    let document = accepted(add_node(seed(), { type: "agent", id: "agent-2" }));
    document = accepted(add_node(document, { type: "subagent_pool", id: "pool" }));
    document = accepted(delete_edge(document, "flow-agent-end"));
    refused(connect_nodes(document, flow("end", "agent-2")), document, "invalid_flow_source");
    refused(connect_nodes(document, flow("agent", "start")), document, "invalid_flow_target");
    refused(connect_nodes(document, flow("pool", "agent-2")), document, "invalid_flow_source");
    refused(connect_nodes(document, flow("agent", "pool")), document, "invalid_flow_target");
  });

  test("flow leaves through out and arrives through in; other ports are unknown", () => {
    const open = chain();
    refused(
      connect_nodes(open, flow("agent-2", "end", { source_port_id: "unknown" })),
      open,
      "unknown_port",
    );
    refused(
      connect_nodes(open, flow("agent-2", "end", { source_port_id: "in" })),
      open,
      "unknown_port",
    );
    refused(
      connect_nodes(open, flow("agent-2", "end", { target_port_id: "attach_top" })),
      open,
      "unknown_port",
    );
    refused(
      connect_nodes(open, flow("agent-2", "end", { target_port_id: "out" })),
      open,
      "unknown_port",
    );
    expect(accepted(connect_nodes(open, flow("agent-2", "end"))).edges).toHaveLength(3);
  });

  test("refuses missing, ambiguous and malformed endpoints and commands", () => {
    const base = seed();
    refused(connect_nodes(base, flow("agent", "missing")), base, "node_not_found");
    refused(connect_nodes(base, flow("missing", "end")), base, "node_not_found");
    const ambiguous = {
      ...base,
      nodes: [...base.nodes, { id: "agent", type: "agent", config: { sentinel: "preserve" } }],
    };
    refused(connect_nodes(ambiguous, flow("agent", "end")), ambiguous, "ambiguous_node_id");
    refused(connect_nodes(ambiguous, flow("start", "agent")), ambiguous, "ambiguous_node_id");
    refused(connect_nodes(base, flow("agent", "end", { extra: 1 })), base, "invalid_command");
    refused(connect_nodes(base, flow("agent", "end", { label: "" })), base, "invalid_command");
    refused(connect_nodes(base, { kind: "flow", source_node_id: "agent" }), base, "invalid_command");
    refused(connect_nodes(base, null), base, "invalid_command");
    refused(
      connect_nodes(base, flow("agent", "end", { kind: { toString: null } })),
      base,
      "invalid_command",
    );
    refused(connect_nodes(base, flow("agent", "end", { kind: "wire" })), base, "unknown_edge_kind");
    refused(connect_nodes(base, flow("agent", "end", { kind: "__proto__" })), base, "unknown_edge_kind");
    refused(connect_nodes(base, flow(5, "end")), base, "invalid_command");
    refused(connect_nodes(base, flow("agent", "")), base, "invalid_command");
    refused(
      connect_nodes(base, flow("agent", "end", { source_port_id: { toString: null } })),
      base,
      "invalid_command",
    );
  });

  test("an explicit edge id is used verbatim and must be new; implicit ids step past taken ones", () => {
    const extra = accepted(add_node(seed(), { type: "agent", id: "agent-2" }));
    const named = accepted(connect_nodes(extra, flow("agent-2", "end", { id: "custom" })));
    expect(named.edges.at(-1).id).toBe("custom");
    refused(
      connect_nodes(extra, flow("agent-2", "end", { id: "flow-start-agent" })),
      extra,
      "duplicate_edge_id",
    );
    refused(connect_nodes(extra, flow("agent-2", "end", { id: "" })), extra, "invalid_edge_id");
    refused(connect_nodes(extra, flow("agent-2", "end", { id: 3 })), extra, "invalid_edge_id");

    const taken = {
      ...extra,
      edges: [extra.edges[0], { ...extra.edges[1], id: "flow-agent-2-end" }],
    };
    expect(accepted(connect_nodes(taken, flow("agent-2", "end"))).edges.at(-1).id).toBe(
      "flow-agent-2-end-2",
    );
  });

  test("a prototype-member node id connects like any other", () => {
    let document = accepted(add_node(seed(), { type: "agent", id: "__proto__" }));
    document = accepted(delete_edge(document, "flow-agent-end"));
    document = accepted(connect_nodes(document, flow("agent", "__proto__")));
    refused(connect_nodes(document, flow("__proto__", "agent")), document, "flow_cycle");
    document = accepted(connect_nodes(document, flow("__proto__", "end")));
    expect(document.edges.map((entry) => entry.id)).toEqual([
      "flow-start-agent",
      "flow-agent-__proto__",
      "flow-__proto__-end",
    ]);
  });
});

describe("connect_nodes: attach", () => {
  const pooled = () => accepted(add_node(seed(), { type: "subagent_pool", id: "pool" }));

  test("joins an Agent and a Pool through attach_bot/attach_top in either direction", () => {
    const base = pooled();
    const down = accepted(connect_nodes(base, attach("agent", "attach_bot", "pool", "attach_top")));
    expect(down.edges.at(-1)).toEqual({
      id: "attach-agent-pool",
      kind: "attach",
      source_node_id: "agent",
      source_port_id: "attach_bot",
      target_node_id: "pool",
      target_port_id: "attach_top",
    });
    const up = accepted(connect_nodes(base, attach("pool", "attach_top", "agent", "attach_bot")));
    expect(up.edges.at(-1).id).toBe("attach-pool-agent");
    expect(up.edges.at(-1).source_node_id).toBe("pool");
    /* top and bottom are placement only: a pool drawn above its agent */
    accepted(connect_nodes(base, attach("agent", "attach_top", "pool", "attach_bot")));
    accepted(connect_nodes(base, attach("pool", "attach_bot", "agent", "attach_top")));
    expect(down.nodes).toBe(base.nodes);
    base.edges.forEach((entry, index) => expect(down.edges[index]).toBe(entry));
  });

  test.each(["attach_top", "attach_bot"])("%s can join the same side, matching the real store", (port) => {
    const row = admissionCapture.cases.find((entry) => entry.case === `same-${port}`);
    expect(row.saved).toBe(true);
    expect(row.execution_structure_admitted).toBe(true);
    expect(row.diagnostics).toEqual([]);
    const base = accepted(add_node(seed(row.document.id), { type: "subagent_pool", id: "pool" }));
    const document = accepted(connect_nodes(base, attach("agent", port, "pool", port, { id: "attach-agent-pool" })));
    expect(document).toStrictEqual(row.document);
    const reverse = accepted(connect_nodes(base, attach("pool", port, "agent", port)));
    expect(reverse.edges.at(-1)).toEqual({
      id: "attach-pool-agent",
      ...attach("pool", port, "agent", port),
    });
  });

  test("both ends must still be supported attach ports", () => {
    const base = pooled();
    refused(connect_nodes(base, attach("agent", "out", "pool", "attach_top")), base, "unknown_port");
    refused(connect_nodes(base, attach("agent", "attach_bot", "pool", "in")), base, "unknown_port");
    refused(
      connect_nodes(base, attach("agent", "attach_bot", "pool", "attach_left")),
      base,
      "unknown_port",
    );
  });

  test("only an Agent and a Pool attach", () => {
    let base = accepted(add_node(pooled(), { type: "agent", id: "agent-2" }));
    base = accepted(add_node(base, { type: "subagent_pool", id: "pool-2" }));
    refused(
      connect_nodes(base, attach("agent", "attach_bot", "agent-2", "attach_top")),
      base,
      "invalid_attachment",
    );
    refused(
      connect_nodes(base, attach("pool", "attach_bot", "pool-2", "attach_top")),
      base,
      "invalid_attachment",
    );
    refused(
      connect_nodes(base, attach("start", "attach_bot", "pool", "attach_top")),
      base,
      "invalid_attachment",
    );
    refused(
      connect_nodes(base, attach("pool", "attach_top", "end", "attach_bot")),
      base,
      "invalid_attachment",
    );
    refused(
      connect_nodes(base, attach("pool", "attach_top", "pool", "attach_bot")),
      base,
      "self_connection",
    );
  });

  test("a pool port accepts several owners, an agent may own several pools", () => {
    let owners = accepted(add_node(pooled(), { type: "agent", id: "agent-2" }));
    owners = accepted(connect_nodes(owners, attach("agent", "attach_bot", "pool", "attach_top")));
    owners = accepted(connect_nodes(owners, attach("agent-2", "attach_bot", "pool", "attach_top")));
    expect(owners.edges.filter((entry) => entry.kind === "attach").map((entry) => entry.id)).toEqual(
      ["attach-agent-pool", "attach-agent-2-pool"],
    );
    let pools = accepted(add_node(owners, { type: "subagent_pool" }));
    expect(pools.nodes.at(-1).id).toBe("pool-2");
    pools = accepted(connect_nodes(pools, attach("agent", "attach_bot", "pool-2", "attach_top")));
    expect(pools.edges.filter((entry) => entry.source_node_id === "agent")).toHaveLength(3);
  });

  test("a pair is attached once, in whichever direction it was drawn", () => {
    const attached = accepted(
      connect_nodes(pooled(), attach("agent", "attach_bot", "pool", "attach_top")),
    );
    const before = JSON.stringify(attached);
    refused(
      connect_nodes(attached, attach("agent", "attach_bot", "pool", "attach_top")),
      attached,
      "duplicate_attachment",
    );
    refused(
      connect_nodes(attached, attach("pool", "attach_top", "agent", "attach_bot")),
      attached,
      "duplicate_attachment",
    );
    refused(
      connect_nodes(attached, attach("agent", "attach_top", "pool", "attach_bot", { id: "again" })),
      attached,
      "duplicate_attachment",
    );
    expect(JSON.stringify(attached)).toBe(before);
  });

  test("attachments neither occupy a flow outlet nor form a flow cycle", () => {
    let document = accepted(add_node(pooled(), { type: "agent", id: "agent-2" }));
    document = accepted(connect_nodes(document, attach("agent", "attach_bot", "pool", "attach_top")));
    document = accepted(connect_nodes(document, attach("pool", "attach_top", "agent-2", "attach_bot")));
    document = accepted(delete_edge(document, "flow-agent-end"));
    document = accepted(connect_nodes(document, flow("agent", "agent-2")));
    document = accepted(connect_nodes(document, flow("agent-2", "end")));
    expect(document.edges.map((entry) => entry.kind)).toEqual([
      "flow",
      "attach",
      "attach",
      "flow",
      "flow",
    ]);
  });
});

describe("delete_edge", () => {
  test("refuses what is missing, ambiguous or not an id", () => {
    const base = seed();
    refused(delete_edge(base, "missing"), base, "edge_not_found");
    refused(delete_edge(base, ""), base, "invalid_edge_id");
    refused(delete_edge(base, 0), base, "invalid_edge_id");
    refused(delete_edge(base, null), base, "invalid_edge_id");
    const equal = { ...base, edges: [...base.edges, { ...base.edges[0] }] };
    refused(delete_edge(equal, "flow-start-agent"), equal, "ambiguous_edge_id");
    const twice = { ...base, edges: [...base.edges, base.edges[0]] };
    refused(delete_edge(twice, "flow-start-agent"), twice, "ambiguous_edge_id");
  });

  test("removes that edge only and reconnects nothing", () => {
    const base = seed();
    const end = node(base, "end");
    end.config.execution.inputs.push({
      name: "answer",
      value: { kind: "ref", node_id: "agent", path: ["message"] },
      missing: "error",
    });
    const cut = accepted(delete_edge(base, "flow-start-agent"));
    expect(cut.edges).toHaveLength(1);
    expect(cut.edges[0]).toBe(base.edges[1]);
    expect(cut.nodes).toBe(base.nodes);
    expect(node(cut, "end")).toBe(end);
    expect(node(cut, "end").config.execution.inputs[0].value.node_id).toBe("agent");
    const bare = accepted(delete_edge(cut, "flow-agent-end"));
    expect(bare.edges).toEqual([]);
    expect(bare.nodes).toBe(base.nodes);
  });
});

describe("refusals never touch the draft, however bad it already is", () => {
  test("every refusal hands back the same object, byte for byte", () => {
    const base = seed("native-bad-draft");
    const draft = {
      ...base,
      description: 7,
      nodes: [
        ...base.nodes,
        { id: "agent", type: "agent", config: { sentinel: "preserve" } },
        { id: "pool", type: "subagent_pool", config: { subagents: [{ toString: null }] } },
        null,
      ],
      edges: [...base.edges, { ...base.edges[0] }, { id: "dangling", kind: "flow" }],
    };
    const before = JSON.stringify(draft);
    const attempts = [
      add_node(draft, { type: "agent", id: "pool" }),
      add_node(draft, { type: "workflow" }),
      delete_node(draft, "agent"),
      delete_node(draft, "start"),
      delete_node(draft, "nobody"),
      connect_nodes(draft, flow("agent", "end")),
      connect_nodes(draft, flow("start", "pool")),
      connect_nodes(draft, attach("agent", "attach_bot", "pool", "attach_top")),
      connect_nodes(draft, attach("start", "attach_bot", "pool", "attach_top")),
      delete_edge(draft, "flow-start-agent"),
      delete_edge(draft, "nobody"),
    ];
    attempts.forEach((result) => {
      expect(result.ok).toBe(false);
      expect(result.document).toBe(draft);
      expect(typeof result.problem.code).toBe("string");
      expect(typeof result.problem.message).toBe("string");
    });
    expect(JSON.stringify(draft)).toBe(before);
  });

  test("a bad draft can still be edited where the command is unambiguous", () => {
    const base = seed("native-bad-draft");
    const draft = {
      ...base,
      nodes: [...base.nodes, { id: "pool", type: "subagent_pool", config: "not an object" }],
      edges: [...base.edges, { id: "dangling", kind: "flow" }],
    };
    const document = accepted(connect_nodes(draft, attach("agent", "attach_bot", "pool", "attach_top")));
    expect(document.nodes).toBe(draft.nodes);
    expect(document.edges.slice(0, 3)).toEqual(draft.edges);
    expect(node(document, "pool").config).toBe("not an object");
  });

  test("a message never stringifies an unvalidated value", () => {
    const base = seed();
    const poison = { toString: null };
    [
      add_node(base, { type: poison }),
      add_node(base, { type: "agent", id: poison }),
      delete_node(base, poison),
      delete_edge(base, poison),
      connect_nodes(base, flow("agent", "end", { kind: poison })),
      connect_nodes(base, flow(poison, "end")),
      connect_nodes(base, flow("agent", poison)),
      connect_nodes(base, flow("agent", "end", { target_port_id: poison })),
      connect_nodes(base, flow("agent", "end", { id: poison })),
      new_agent_document({ id: poison, name: "n" }),
      new_agent_document({ id: "x", name: poison }),
    ].forEach((result) => {
      expect(result.ok).toBe(false);
      expect(typeof result.problem.message).toBe("string");
    });
  });
});

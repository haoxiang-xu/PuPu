import capture from "./workflow_authoring_capture.json";
import {
  ADDABLE_NODE_TYPES,
  add_node,
  addable_node_types,
  connect_nodes,
  delete_edge,
  delete_node,
  new_agent_document,
  new_workflow_document,
} from "./skeleton_graph_edits";
import { apply_graph_command } from "./skeleton_graph_commands";

/* #357 G7: native Workflow authoring in the pure command core. Every expected
 * shape below is the real producer's (workflow_authoring_capture.json: the
 * host's v2 store on the fixed wheel, offline). */

const copy = (value) => JSON.parse(JSON.stringify(value));
const row = (name) => capture.rows.find((item) => item.case === name);
/* The store answers documents with sorted keys; compare as JSON values. */
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
};
const seed = () => new_workflow_document({ id: "wf-new", name: "New Workflow" }).document;

describe("new_workflow_document", () => {
  test("writes exactly the Workflow the real store saves, diagnoses clean and preflights", () => {
    const result = new_workflow_document({ id: "wf-new", name: "New Workflow" });
    expect(result.ok).toBe(true);
    expect(result.problem).toBeNull();
    expect(canonical(result.document)).toEqual(canonical(row("wf_seed_save").reply.resource.document));
    expect(canonical(result.document)).toEqual(canonical(row("wf_seed_save").document));
    expect(row("wf_seed_diagnose").reply).toEqual([]);
    expect(row("wf_seed_preflight").reply.preflight.ok).toBe(true);
    expect(Object.keys(result.document).sort()).toEqual(["edges", "id", "kind", "name", "nodes", "schema_version"]);
  });

  test("refuses what the Agent factory refuses, and nothing else", () => {
    expect(new_workflow_document({ id: "__proto__", name: "x" }).problem.code).toBe("invalid_resource_id");
    expect(new_workflow_document({ id: "wf", name: "" }).problem.code).toBe("invalid_resource_name");
    expect(new_workflow_document({ id: "wf", name: "x", kind: "workflow" }).problem.code).toBe("invalid_command");
    expect(new_workflow_document(null).document).toBeNull();
  });

  test("the Agent factory is unchanged", () => {
    expect(canonical(new_agent_document({ id: "agent-new", name: "New Agent" }).document))
      .toEqual(canonical(row("agent_seed_save").reply.resource.document));
  });
});

describe("editing a Workflow", () => {
  test.each(["if_else", "switch_case", "tool_call", "skill_read", "code", "workflow_call"])(
    "adds a %s seed the real store saves inside a Workflow", (type) => {
      const result = add_node(seed(), { type, id: "n" });
      expect(result.ok).toBe(true);
      const added = result.document.nodes.find((node) => node.id === "n");
      const stored = row(`wf_add_${type}_save`).reply.resource.document.nodes.find((node) => node.id === "n");
      expect(canonical(added)).toEqual(canonical(stored));
    });

  test.each(["agent", "toolkit_pool", "subagent_pool", "hooks_pool"])(
    "refuses a %s node in a Workflow, as the real store does", (type) => {
      const before = seed();
      const result = add_node(before, { type });
      expect(result).toEqual({ ok: false, document: before, problem: { code: "not_allowed_in_workflow", message: expect.any(String) } });
      expect(result.document).toBe(before);
      const store = row(type === "agent" ? "wf_add_agent_save" : `wf_pool_${type}_save`).refusal;
      expect([store.code, store.path.slice(-1)[0]]).toEqual(["invalid_value", "type"]);
    });

  test("the addable types per graph kind", () => {
    expect(addable_node_types("agent")).toEqual(ADDABLE_NODE_TYPES);
    expect(addable_node_types("workflow")).toEqual(["if_else", "switch_case", "tool_call", "skill_read", "code", "workflow_call"]);
    expect(addable_node_types("other")).toEqual([]);
  });

  test("connects flow edges, and refuses any attachment in a Workflow", () => {
    const withCode = add_node(seed(), { type: "code", id: "code" }).document;
    /* The seed already leaves Start for End; Code is wired on to End. */
    const flow = connect_nodes(withCode, { kind: "flow", source_node_id: "code", source_port_id: "out", target_node_id: "end", target_port_id: "in" });
    expect(flow.ok).toBe(true);
    const before = flow.document;
    const attach = connect_nodes(before, { kind: "attach", source_node_id: "code", source_port_id: "attach_bot", target_node_id: "end", target_port_id: "attach_top" });
    expect(attach.ok).toBe(false);
    expect(attach.document).toBe(before);
    expect(attach.problem.code).toBe("not_allowed_in_workflow");
    /* The real store saves such an edge but diagnoses it. */
    expect(row("wf_attach_edge_diagnose").reply.map((item) => item.code)).toEqual(["attach_endpoints"]);
  });

  test("deletes nodes and edges; Start and End stay", () => {
    const withCode = add_node(seed(), { type: "code", id: "code" }).document;
    expect(delete_node(withCode, "code").document.nodes.map((node) => node.id)).toEqual(["start", "end"]);
    expect(delete_node(withCode, "end").problem.code).toBe("protected_node");
    expect(delete_edge(seed(), "flow-start-end").document.edges).toEqual([]);
  });

  test("the canvas adapter edits a Workflow and keeps its refusals", () => {
    const added = apply_graph_command(seed(), { type: "add_node", node_type: "code" });
    expect(added.ok).toBe(true);
    expect(added.document.kind).toBe("workflow");
    const refused = apply_graph_command(seed(), { type: "add_node", node_type: "agent" });
    expect(refused.problem.code).toBe("not_allowed_in_workflow");
    const other = { ...seed(), kind: "recipe" };
    expect(apply_graph_command(other, { type: "add_node", node_type: "code" }).ok).toBe(false);
  });

  test("an edited Workflow keeps unknown and untouched values by reference", () => {
    const base = copy(seed());
    base.description = "kept";
    base.nodes[0].config.extra = { kept: true };
    const next = add_node(base, { type: "code" }).document;
    expect(next.description).toBe("kept");
    expect(next.nodes[0]).toBe(base.nodes[0]);
  });
});

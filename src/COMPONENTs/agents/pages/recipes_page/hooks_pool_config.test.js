import {
  DECISION_SHAPES,
  attached_agents,
  decision_fit,
  free_hook_id,
  hook_entry_problems,
  hook_workflow_shape,
  hooks_list,
  kernel_hook_order,
  pool_problems,
  remove_hook,
  scope_duplicate_ids,
  with_hook,
} from "./hooks_pool_config";
import { add_node, connect_nodes } from "./skeleton_graph_edits";
import { admit_version_aggregate } from "./managed_code_sources";
import { forget_workflow_versions, remember_workflow_version } from "./workflow_versions";
import capture from "./hooks_pool_capture.json";

/* Every store and runtime answer is the real producer's (hooks_pool_capture.json). */
jest.mock("../../../../SERVICEs/api", () => ({ api: { unchain: {} } }));

const copy = (value) => JSON.parse(JSON.stringify(value));
const row = (name) => {
  const found = capture.rows.find((item) => item.case === name);
  if (!found) throw new Error(`no captured row ${name}`);
  return copy(found);
};
const agent = (name) => row(`${name}_get`).reply.resource.document;
const pool = (document, id = "hooks") => document.nodes.find((node) => node.id === id);
const codes_for = (name, index = 0) => {
  const document = agent(name);
  const node = pool(document);
  const list = hooks_list(node);
  return hook_entry_problems(Array.isArray(list) ? list[index] : undefined, { siblings: Array.isArray(list) ? list : [], scope_duplicates: scope_duplicate_ids(document, node.id) }).map((problem) => problem.code);
};

beforeEach(() => {
  forget_workflow_versions();
  Object.keys(capture.revisions).forEach((workflow_id) => {
    remember_workflow_version(admit_version_aggregate(row(`${workflow_id}_version`).reply).version);
  });
});

describe("every stored shape the runtime refuses is named, and only those", () => {
  test("the complete pool passes preflight, and the panel names nothing", () => {
    expect(row("complete_preflight").reply.preflight.ok).toBe(true);
    const document = agent("complete");
    hooks_list(pool(document)).forEach((_, index) => expect(codes_for("complete", index)).toEqual([]));
    expect(pool_problems(pool(document), document)).toEqual([]);
  });

  test.each([
    ["order_negative", "invalid_value", ["order_invalid"]],
    ["order_float", "invalid_type", ["order_invalid"]],
    ["order_bool", "invalid_type", ["order_invalid"]],
    ["order_over", "invalid_value", ["order_invalid"]],
    ["event_unknown", "unknown_variant", ["event_invalid"]],
    ["tool_empty", "invalid_value", ["tool_invalid"]],
    ["tool_number", "invalid_type", ["tool_invalid"]],
    ["force_string", "invalid_type", ["force_invalid"]],
    ["workflow_no_revision", "missing_field", ["workflow_invalid"]],
    ["workflow_extra", "unknown_field", ["workflow_invalid"]],
    /* #357 Hook on/off: this capture is the old wheel, which refuses `enabled`.
       Without a confirmed Hook contract the panel does not guess either way. */
    ["entry_extra_enabled", "unknown_field", ["enabled_unconfirmed"]],
    ["entry_missing_force", "missing_field", ["force_missing"]],
    ["entry_not_object", "invalid_type", ["entry_invalid"]],
  ])("%s: preflight refuses it (%s); the panel says %j", (name, code, expected) => {
    expect(row(`${name}_preflight`).refusal.code).toBe(code);
    expect(row(`${name}_preflight`).refusal.path.slice(0, 6)).toEqual(["document", "nodes", 3, "config", "hooks", ...(name === "hooks_not_list" ? [] : [0])].slice(0, 6));
    expect(codes_for(name)).toEqual(expected);
  });

  test("a duplicate id in one pool is refused by preflight and named on both", () => {
    expect(row("duplicate_id_preflight").refusal).toMatchObject({ code: "duplicate_name", path: ["document", "nodes", 3, "config", "hooks", 1, "id"] });
    expect(codes_for("duplicate_id", 0)).toEqual(["id_duplicate"]);
    expect(codes_for("duplicate_id", 1)).toEqual(["id_duplicate"]);
  });

  test("pool-level problems: no hooks, not a list, an unknown setting, not attached", () => {
    expect(row("seed_preflight").refusal).toMatchObject({ code: "missing_value", path: ["document", "nodes", 3, "config", "hooks"] });
    expect(pool_problems(pool(agent("seed")), agent("seed")).map((p) => p.code)).toEqual(["hooks_empty"]);
    expect(row("hooks_not_list_preflight").refusal.code).toBe("invalid_type");
    expect(pool_problems(pool(agent("hooks_not_list")), agent("hooks_not_list")).map((p) => p.code)).toEqual(["hooks_invalid"]);
    expect(row("config_extra_preflight").refusal.code).toBe("unknown_field");
    expect(pool_problems(pool(agent("config_extra")), agent("config_extra")).map((p) => p.code)).toEqual(["unknown_setting"]);
    expect(row("not_attached_diagnose").reply.map((d) => d.code)).toEqual(["pool_attachment_required"]);
    expect(pool_problems(pool(agent("not_attached")), agent("not_attached")).map((p) => p.code)).toEqual(["not_attached"]);
  });
});

describe("what preflight lets through, said before Run", () => {
  test("the same id in two pools on one Agent: preflight passes, the run's admission refuses", () => {
    expect(row("scope_duplicate_id_preflight").reply.preflight.ok).toBe(true);
    expect(row("scope_duplicate_id_hook_admission").refusal).toMatchObject({ code: "duplicate_name", message: "Hook id is duplicated in the attached Kernel scope" });
    const document = agent("scope_duplicate_id");
    expect(scope_duplicate_ids(document, "hooks")).toEqual(new Set(["same"]));
    expect(codes_for("scope_duplicate_id")).toEqual(["id_scope_duplicate"]);
  });

  test("a Workflow whose End is not a decision: preflight and admission pass; the wheel refuses that shape", () => {
    expect(row("bad_decision_workflow_preflight").reply.preflight.ok).toBe(true);
    expect(row("bad_decision_workflow_hook_admission").reply).toEqual({ kernel: ["x"] });
    expect(row("before_end_of_wrong_shape").refusal.code).toBe("invalid_type");
    expect(codes_for("bad_decision_workflow")).toEqual(["decision_shape"]);
  });

  test("a pinned revision nobody published: preflight refuses it", () => {
    expect(row("revision_missing_preflight").refusal.code).toBe("resource_missing");
    expect(row("target_unpublished_preflight").refusal.code).toBe("resource_missing");
  });
});

describe("the run's own rules, read from the wheel", () => {
  test("every hook of every pool on one Agent runs by (order, id)", () => {
    expect(row("order_two_pools").reply).toEqual({ kernel: ["late", "guard"] });
    expect(kernel_hook_order(agent("two_pools"), "kernel").map((item) => item.id)).toEqual(["late", "guard"]);
    expect(row("complete_hook_admission").reply).toEqual({ kernel: ["guard", "audit"] });
    expect(kernel_hook_order(agent("complete"), "kernel").map((item) => item.id)).toEqual(["guard", "audit"]);
    expect(row("validate_sorts").reply).toEqual(["c", "a", "b"]);
  });

  test("the decisions the wheel accepts are exactly the shapes the panel offers", () => {
    const accepted = (name) => "reply" in row(name);
    expect([accepted("before_continue"), accepted("before_require"), accepted("before_arguments"), accepted("before_block")]).toEqual([true, true, true, true]);
    expect([accepted("before_unknown"), accepted("before_missing_approval"), accepted("before_extra_field")]).toEqual([false, false, false]);
    expect([accepted("after_continue"), accepted("after_replace"), accepted("after_continue_extra"), accepted("after_unknown")]).toEqual([true, true, false, false]);
    expect(DECISION_SHAPES.before_tool_call.map((item) => item.keys.join(","))).toEqual(["decision,require_approval", "arguments,decision,require_approval", "decision,reason"]);
    expect(DECISION_SHAPES.after_tool_call.map((item) => item.keys.join(","))).toEqual(["decision", "decision,result"]);
    /* force_approval ORs into the requirement. */
    expect(row("before_continue_force").reply.require_approval).toBe(true);
  });

  test("each published hook Workflow is read for what it returns", () => {
    const fitting = (workflow_id, event) => decision_fit(event, hook_workflow_shape(admit_version_aggregate(row(`${workflow_id}_version`).reply).version.document));
    expect(fitting("wf-hook-continue", "before_tool_call").matches).toEqual(["continue"]);
    expect(fitting("wf-hook-args", "before_tool_call").matches).toEqual(["continue with new arguments"]);
    expect(fitting("wf-hook-block", "before_tool_call").matches).toEqual(["block"]);
    expect(fitting("wf-hook-replace", "after_tool_call").matches).toEqual(["replace the result"]);
    expect(fitting("wf-hook-replace", "before_tool_call").matches).toEqual([]);
    expect(fitting("wf-hook-bad", "after_tool_call").matches).toEqual([]);
  });
});

describe("editing writes only what was chosen", () => {
  test("a new hook carries only an id nobody in the pool uses", () => {
    expect(free_hook_id(["hook-1", "hook-3"])).toBe("hook-2");
  });

  test("one entry replaced by position; a removed entry leaves the rest", () => {
    const document = agent("complete");
    const next = with_hook(document, "hooks", 1, { ...hooks_list(pool(document))[1], order: 15 });
    expect(hooks_list(pool(next)).map((entry) => entry.order)).toEqual([20, 15]);
    expect(hooks_list(pool(remove_hook(document, "hooks", 0))).map((entry) => entry.id)).toEqual(["guard"]);
    expect(with_hook(agent("hooks_not_list"), "hooks", 0, {})).toEqual(agent("hooks_not_list"));
  });

  test("attach joins an Agent and a Hooks Pool; nothing else", () => {
    const document = agent("not_attached");
    expect(attached_agents(document, "hooks")).toEqual([]);
    const joined = connect_nodes(document, { kind: "attach", source_node_id: "kernel", source_port_id: "attach_bot", target_node_id: "hooks", target_port_id: "attach_top" });
    expect(joined.ok).toBe(true);
    expect(attached_agents(joined.document, "hooks")).toEqual(["kernel"]);
    expect(connect_nodes(document, { kind: "attach", source_node_id: "start", source_port_id: "attach_bot", target_node_id: "hooks", target_port_id: "attach_top" }).ok).toBe(false);
    const added = add_node(agent("complete"), { type: "hooks_pool" });
    expect(added.ok).toBe(true);
    expect(added.document.nodes.at(-1)).toEqual({ id: expect.any(String), type: "hooks_pool", config: { hooks: [] } });
    expect(row("seed_save").reply).toBeDefined();
  });
});

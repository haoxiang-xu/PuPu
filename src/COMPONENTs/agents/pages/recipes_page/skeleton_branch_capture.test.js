import capture from "./skeleton_branch_capture.json";
import { add_node, connect_nodes, delete_edge, new_agent_document } from "./skeleton_graph_edits";

/* `skeleton_branch_capture.json` was produced on 2026-10-22 by the strict
 * consumer for #351 (native-advanced/branch-351/tools/qualify_branch_page.py,
 * round 02): the source SkeletonResourceStore with the fixed installed runtime
 * saved, read back, diagnosed and preflighted
 *   - the two branch seeds this core builds, and
 *   - the exact Save requests the real page sent in
 *     skeleton_resource_page_branch.test.js,
 * then ran each page document through the real Skeleton chat stream with an
 * offline scripted SDK. Every value below is the consumer's, not this file's. */

const must = (result) => {
  expect(result.ok).toBe(true);
  return result.document;
};
const flow = (source_node_id, source_port_id, target_node_id) => ({
  kind: "flow", source_node_id, source_port_id, target_node_id, target_port_id: "in",
});
const seed = (name) => capture.seeds.find((row) => row.case === name);

test("the capture comes from the fixed installed runtime", () => {
  expect(capture.manifest).toBe("sha256:f6daf3894dd947723ee7dc60392277896b88c4890d35373b26442a1833a28101");
});

test("the core's If seed is exactly what the real store saved and read back", () => {
  let document = must(new_agent_document({ id: "seed-if", name: "Seed if" }));
  document = must(add_node(document, { type: "if_else" }));
  document = must(delete_edge(document, "flow-agent-end"));
  document = must(connect_nodes(document, flow("agent", "out", "if")));
  document = must(connect_nodes(document, flow("if", "true", "end")));
  document = must(connect_nodes(document, flow("if", "false", "end")));
  expect(document).toStrictEqual(seed("seed-if").document);
  expect(seed("seed-if").roundtrip_equal).toBe(true);
  expect(seed("seed-if").diagnostics).toStrictEqual([{ code: "missing_field", path: ["document", "nodes", 3, "config", "execution", "condition"] }]);
  expect(seed("seed-if").preflight.ok).toBe(false); // an unfinished draft, never claimed runnable
});

test("the core's Switch seed is exactly what the real store saved and read back", () => {
  let document = must(new_agent_document({ id: "seed-switch", name: "Seed switch" }));
  document = must(add_node(document, { type: "switch_case" }));
  document = must(delete_edge(document, "flow-agent-end"));
  document = must(connect_nodes(document, flow("agent", "out", "switch")));
  document = must(connect_nodes(document, flow("switch", "default", "end")));
  expect(document).toStrictEqual(seed("seed-switch").document);
  expect(seed("seed-switch").diagnostics).toStrictEqual([{ code: "missing_field", path: ["document", "nodes", 3, "config", "execution", "value"] }]);
  expect(seed("seed-switch").preflight.ok).toBe(false);
});

test("both page payloads were saved, read back equal, admitted, and a stale token was refused", () => {
  expect(capture.pages.map((row) => row.case)).toEqual(["if-page", "switch-page"]);
  capture.pages.forEach((row) => {
    expect(row.roundtrip_equal).toBe(true);
    expect(row.diagnostics).toEqual([]);
    expect(row.preflight).toStrictEqual({ ok: true });
    expect(row.stale_token_save).toMatchObject({ code: "edit_conflict", path: ["expected_edit_token"] });
  });
  expect(capture.pages[0].branch_node.config.execution.condition).toStrictEqual({
    kind: "compare", operator: "contains", left: { kind: "input", path: ["reply"] }, right: { kind: "literal", value: "yes" },
  });
  expect(capture.pages[1].branch_node.config.execution.cases).toStrictEqual([{ id: "case-1", value: "x" }]);
});

test("each run left through exactly the outlet its value selected, and only that path's Agent was called", () => {
  expect(capture.runs.map((run) => [run.resource, run.router_reply, run.selected_outlets, run.sdk_markers])).toStrictEqual([
    ["if-page", "yes please", ["start.out", "router.out", "if.true", "agent.out"], ["router", "yes-branch"]],
    ["if-page", "no thanks", ["start.out", "router.out", "if.false"], ["router"]],
    ["switch-page", "x", ["start.out", "router.out", "switch.case-1"], ["router"]],
    ["switch-page", "zzz", ["start.out", "router.out", "switch.default"], ["router"]],
  ]);
  expect(capture.runs.every((run) => run.status === "completed" && run.as_expected)).toBe(true);
  expect(capture.runs[0].root_finals).toEqual(["YES-BRANCH-REPLY"]); // the rejoin's first_present took the branch that ran
  expect(capture.runs[1].root_finals).toEqual(["no thanks"]);
});

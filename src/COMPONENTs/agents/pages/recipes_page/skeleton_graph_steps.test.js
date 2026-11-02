import {
  ADDABLE_NODE_TYPES,
  add_node,
  connect_nodes,
  flow_outlets,
  new_agent_document,
} from "./skeleton_graph_edits";
import { NATIVE_PALETTE_ENTRIES, native_step_ports } from "./skeleton_node_catalog";

/* The deterministic steps in the pure authoring core (#352).
 *
 * Measured on the fixed installed pair before this was written
 * (native-advanced/steps-352/probe/tool-call-store-01.json): the seed
 * `tool_call {execution: {inputs: [], outputs: []}}` saves as an unfinished
 * draft — the store's draft check says nothing, preflight refuses it with
 * `missing_field` at `config.tool` — and an ordinary flow node leaves through
 * `out` and arrives at `in`. Nothing is chosen for the author: no tool, no
 * error policy, no approval limit. */

const seed = () => new_agent_document({ id: "steps-core", name: "Steps core" }).document;
const flow = (source_node_id, target_node_id) => ({
  kind: "flow", source_node_id, source_port_id: "out", target_node_id, target_port_id: "in",
});
const ok = (result) => {
  expect(result.ok).toBe(true);
  return result.document;
};

test("Tool Call is addable, after the types that already had editors", () => {
  expect(ADDABLE_NODE_TYPES).toContain("tool_call");
  expect(ADDABLE_NODE_TYPES.indexOf("tool_call")).toBeGreaterThan(ADDABLE_NODE_TYPES.indexOf("switch_case"));
});

test("a new Tool Call carries exactly the measured seed and nothing invented", () => {
  const added = ok(add_node(seed(), { type: "tool_call" }));
  expect(added.nodes.at(-1)).toStrictEqual({ id: "tool", type: "tool_call", config: { execution: { inputs: [], outputs: [] } } });
  const again = ok(add_node(added, { type: "tool_call" }));
  expect(again.nodes.at(-1).id).toBe("tool-2");
});

test("it is an ordinary flow step: one way in, one way out, between Start and an Agent", () => {
  const added = ok(add_node(seed(), { type: "tool_call" }));
  const tool = added.nodes.at(-1);
  expect(flow_outlets(tool)).toStrictEqual({ ok: true, outlets: ["out"], problem: null });
  const unwired = { ...added, edges: added.edges.filter((edge) => edge.source_node_id !== "start") };
  const intoTool = ok(connect_nodes(unwired, flow("start", "tool")));
  const wired = ok(connect_nodes(intoTool, flow("tool", "agent")));
  expect(wired.edges.filter((edge) => edge.kind === "flow").map((edge) => `${edge.source_node_id}>${edge.target_node_id}`))
    .toEqual(expect.arrayContaining(["start>tool", "tool>agent"]));
});

test("it does not attach to a pool and has no outlet but `out`", () => {
  const withPool = ok(add_node(ok(add_node(seed(), { type: "tool_call" })), { type: "toolkit_pool" }));
  const attach = connect_nodes(withPool, {
    kind: "attach", source_node_id: "tools", source_port_id: "attach_top", target_node_id: "tool", target_port_id: "attach_bot",
  });
  expect(attach.ok).toBe(false);
  expect(attach.document).toBe(withPool);
  const badOutlet = connect_nodes(withPool, { ...flow("tool", "agent"), source_port_id: "true" });
  expect(badOutlet.ok).toBe(false);
});

test("the native palette offers it, with the step ports the canvas draws", () => {
  const entry = NATIVE_PALETTE_ENTRIES.find((item) => item.type === "tool_call");
  expect(entry).toMatchObject({ type: "tool_call", label: "Tool call", group: "steps", icon: "tool" });
  expect(native_step_ports("tool_call")).toStrictEqual([
    { id: "in", side: "left", kind: "in" },
    { id: "out", side: "right", kind: "out" },
  ]);
  expect(native_step_ports("agent")).toBeNull();
});

/* Skill Read (#352 B2), measured the same way
 * (native-advanced/steps-352/probe/skill-read-store-01.json): the seed
 * `skill_read {execution: {inputs: [], outputs: []}}` saves as an unfinished
 * draft — no draft diagnostics, preflight `missing_field` at `config.skill` —
 * and no skill is chosen for the author. */
describe("Skill Read", () => {
  test("is addable, after Tool Call", () => {
    expect(ADDABLE_NODE_TYPES.indexOf("skill_read")).toBeGreaterThan(ADDABLE_NODE_TYPES.indexOf("tool_call"));
  });

  test("a new Skill Read carries exactly the measured seed", () => {
    const added = ok(add_node(seed(), { type: "skill_read" }));
    expect(added.nodes.at(-1)).toStrictEqual({ id: "skill", type: "skill_read", config: { execution: { inputs: [], outputs: [] } } });
    expect(ok(add_node(added, { type: "skill_read" })).nodes.at(-1).id).toBe("skill-2");
  });

  test("it is an ordinary flow step between Start and an Agent", () => {
    const added = ok(add_node(seed(), { type: "skill_read" }));
    expect(flow_outlets(added.nodes.at(-1))).toStrictEqual({ ok: true, outlets: ["out"], problem: null });
    const unwired = { ...added, edges: added.edges.filter((edge) => edge.source_node_id !== "start") };
    const wired = ok(connect_nodes(ok(connect_nodes(unwired, flow("start", "skill"))), flow("skill", "agent")));
    expect(wired.edges.filter((edge) => edge.kind === "flow").map((edge) => `${edge.source_node_id}>${edge.target_node_id}`))
      .toEqual(expect.arrayContaining(["start>skill", "skill>agent"]));
  });

  test("the native palette offers it, with one inlet and one outlet", () => {
    expect(NATIVE_PALETTE_ENTRIES.find((item) => item.type === "skill_read")).toMatchObject({
      type: "skill_read", label: "Skill read", group: "steps", icon: "book_open",
    });
    expect(native_step_ports("skill_read")).toStrictEqual([
      { id: "in", side: "left", kind: "in" },
      { id: "out", side: "right", kind: "out" },
    ]);
  });
});

/* Code (#357), measured the same way (code-01/out/code-store-capture.json,
 * "seed"): the seed `code {execution: {inputs: [], outputs: []}}` saves, its
 * draft check says nothing and preflight passes it — the runtime admits
 * `config.code` only when it is present — so it fails at run start. Nothing
 * is chosen for the author: no runtime, no source, no limit, no schema. */
describe("Code", () => {
  test("is addable, after the two deterministic steps", () => {
    expect(ADDABLE_NODE_TYPES).toContain("code");
    expect(ADDABLE_NODE_TYPES.indexOf("code")).toBeGreaterThan(ADDABLE_NODE_TYPES.indexOf("skill_read"));
  });

  test("a new Code node carries exactly the measured seed and nothing invented", () => {
    const added = ok(add_node(seed(), { type: "code" }));
    expect(added.nodes.at(-1)).toStrictEqual({ id: "code", type: "code", config: { execution: { inputs: [], outputs: [] } } });
    expect(ok(add_node(added, { type: "code" })).nodes.at(-1).id).toBe("code-2");
  });

  test("it is an ordinary flow step between Start and an Agent, with no outlet but `out`", () => {
    const added = ok(add_node(seed(), { type: "code" }));
    expect(flow_outlets(added.nodes.at(-1))).toStrictEqual({ ok: true, outlets: ["out"], problem: null });
    const unwired = { ...added, edges: added.edges.filter((edge) => edge.source_node_id !== "start") };
    const wired = ok(connect_nodes(ok(connect_nodes(unwired, flow("start", "code"))), flow("code", "agent")));
    expect(wired.edges.filter((edge) => edge.kind === "flow").map((edge) => `${edge.source_node_id}>${edge.target_node_id}`))
      .toEqual(expect.arrayContaining(["start>code", "code>agent"]));
    expect(connect_nodes(wired, { ...flow("code", "agent"), source_port_id: "true" }).ok).toBe(false);
    const withPool = ok(add_node(wired, { type: "toolkit_pool" }));
    expect(connect_nodes(withPool, {
      kind: "attach", source_node_id: "tools", source_port_id: "attach_top", target_node_id: "code", target_port_id: "attach_bot",
    }).ok).toBe(false);
  });

  test("the native palette offers it for both graph kinds, with the step ports", () => {
    expect(NATIVE_PALETTE_ENTRIES.find((item) => item.type === "code")).toMatchObject({
      type: "code", label: "Code", group: "steps", icon: "code", graph_kinds: ["agent", "workflow"],
    });
    /* Level with the header, not centred: the node grows below it. */
    expect(native_step_ports("code")).toStrictEqual([
      { id: "in", side: "left", kind: "in", anchor: 27 },
      { id: "out", side: "right", kind: "out", anchor: 27 },
    ]);
    expect(native_step_ports("tool_call")[0]).not.toHaveProperty("anchor");
  });
});

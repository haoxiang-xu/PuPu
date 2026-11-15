import { explain_problem, node_at_path, panel_state } from "./test_status";
import { agentEnglishText } from "../agents_i18n";

const t = agentEnglishText;
/* The two documents measured on a real store (2026-11-15): Agents migrated
   from chat whose model was never picked, and a Switch whose value was never
   chosen. Both are refused by the preflight with an engineer's sentence. */
const agent = {
  schema_version: 1, kind: "agent", id: "a", name: "A",
  nodes: [
    { id: "start", type: "start", config: { execution: { outputs: [] } } },
    { id: "agent", type: "agent", config: { execution: { inputs: [], outputs: [] }, kernel_draft: { model: null, prompt: "hi", max_iterations: null } } },
  ],
  edges: [],
};
const workflow = {
  schema_version: 1, kind: "workflow", id: "w", name: "W",
  nodes: [
    { id: "start", type: "start", config: { execution: { outputs: [] } } },
    { id: "switch", type: "switch_case", label: "Route", config: { execution: { cases: [{ id: "c", value: "1" }], inputs: [] } } },
    { id: "code", type: "code", config: { execution: { inputs: [], outputs: [] } } },
  ],
  edges: [],
};

test("a store path is read back into the top-level node it points into, by position or id", () => {
  expect(node_at_path(agent, ["document", "nodes", 1, "config"]).id).toBe("agent");
  expect(node_at_path(workflow, ["nodes", "code", "config"]).id).toBe("code");
  expect(node_at_path(workflow, ["document", "nodes", 9])).toBeNull();
  expect(node_at_path(workflow, ["arguments", "city"])).toBeNull();
});

test("an Agent with no model picked is said in words and points at its node", () => {
  const problem = explain_problem({ code: "invalid_shape", path: ["document", "nodes", 1, "config"],
    message: "Agent node requires execution and kernel configuration" }, agent, t);
  expect(problem).toEqual({ node_id: "agent", text: "“Agent” has no model selected." });
});

test("a Switch with nothing to switch on is said in words and points at its node", () => {
  const problem = explain_problem({ code: "invalid_shape", path: ["document", "nodes", 1, "config", "execution"],
    message: "execution config fields are invalid" }, workflow, t);
  expect(problem).toEqual({ node_id: "switch", text: "“Route” has no value to switch on." });
});

test("any other refusal names its node and keeps the store's sentence; one with no node keeps only the sentence", () => {
  expect(explain_problem({ code: "x", path: ["document", "nodes", 2], message: "code is empty" }, workflow, t))
    .toEqual({ node_id: "code", text: "“code”: code is empty" });
  expect(explain_problem({ code: "x", path: ["document", "edges"], message: "edge loop" }, workflow, t))
    .toEqual({ node_id: null, text: "edge loop" });
});

test("the panel's first line: a refused preflight blocks Run and offers the node; unsaved work and a pass do not", () => {
  const base = { status: "ready", resource_id: "a", edit_token: "e", dirty: false, document: agent };
  const refused = panel_state({ kind: "agent", session: { ...base, preflight: { ok: false, error: {
    code: "invalid_shape", path: ["document", "nodes", 1, "config"], message: "m" } } } }, t);
  expect(refused).toMatchObject({ tone: "bad", action: "fix", node_id: "agent", blocks: true,
    text: "Can’t run yet: “Agent” has no model selected." });
  expect(panel_state({ kind: "agent", session: { ...base, dirty: true } }, t)).toMatchObject({ tone: "idle" });
  expect(panel_state({ kind: "agent", session: { ...base, dirty: true } }, t).blocks).toBeFalsy();
  expect(panel_state({ kind: "agent", session: { ...base } }, t).text).toBe("Checking whether it can run…");
  expect(panel_state({ kind: "workflow", session: { ...base, preflight: { ok: true } } }, t))
    .toMatchObject({ tone: "good", text: "Ready. Fill in the inputs and press Run." });
  expect(panel_state({ kind: "workflow", session: { ...base, preflight: { ok: true } }, last: { status: "running" } }, t).tone).toBe("busy");
});

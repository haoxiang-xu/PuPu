import React from "react";
import { act, render, screen, within } from "@testing-library/react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import DetailPanel from "./detail_panel";
import { api } from "../../../../../SERVICEs/api";
import { kernel_profiles, list_resources } from "../skeleton_resources";
import toolCapture from "../tool_call_capture.json";
import skillCapture from "../skill_read_capture.json";

/* R-352-04: a Tool Call's and a Skill Read's input rows are not drawn by the
 * IO editor, so a store diagnostic about one of them must not be routed to a
 * row nobody renders — it would be shown nowhere. The diagnostics below are
 * the real store's answers for drafts it keeps exactly
 * (steps-352/probe/stored-shapes-01 and -02). */

jest.mock("../../../../../SERVICEs/api", () => ({ api: { unchain: {} } }));
jest.mock("../skeleton_resources", () => ({
  is_unavailable: (result) => Boolean(result) && result.ok === false && result.reason === "unavailable",
  list_resources: jest.fn(),
  kernel_profiles: jest.fn(),
}));

const NODE_ID_DIAGNOSTIC = {
  code: "invalid_value",
  path: ["document", "nodes", 1, "config", "execution", "inputs", 0, "value", "node_id"],
  message: "node_id must be a non-empty string",
};
const PATH_DIAGNOSTIC = {
  code: "invalid_path",
  path: ["document", "nodes", 1, "config", "execution", "inputs", 0, "value", "path", 0],
  message: "path item must be a string or non-negative integer",
};
const out = (name) => ({ name, source: { kind: "result", path: [name] } });
const doc = (step) => ({
  schema_version: 1, kind: "agent", id: "d", name: "d",
  nodes: [
    { id: "start", type: "start", config: { execution: { outputs: [out("message")] } } },
    step,
    { id: "end", type: "end", config: { execution: { inputs: [{ name: "reply", value: { kind: "ref", node_id: "start", path: ["message"] }, missing: "error" }], outputs: [] } } },
  ],
  edges: [
    { id: "e1", kind: "flow", source_node_id: "start", source_port_id: "out", target_node_id: "step", target_port_id: "in" },
    { id: "e2", kind: "flow", source_node_id: "step", source_port_id: "out", target_node_id: "end", target_port_id: "in" },
  ],
});
const badRef = (node_id, path) => ({ name: "path", value: { kind: "ref", node_id, path }, missing: "error" });
const toolStep = (binding) => ({ id: "step", type: "tool_call", config: { execution: { inputs: [binding], outputs: [] },
  tool: { name: "read", on_error: "continue", approval_timeout_ms: 60000 } } });
const skillStep = (binding) => ({ id: "step", type: "skill_read", config: { execution: { inputs: [binding], outputs: [] },
  skill: (({ source, source_id, name }) => ({ source, source_id, name }))(JSON.parse(skillCapture.inventory.body_text).skills[0]) } });

beforeEach(() => {
  list_resources.mockResolvedValue({ ok: true, data: { resources: [] } });
  kernel_profiles.mockReturnValue(new Promise(() => {}));
  api.unchain.listToolModalCatalog = jest.fn(async () => JSON.parse(toolCapture.catalog_v2.body_text));
  const core = JSON.parse(toolCapture.core_schemas.body_text);
  api.unchain.listSkeletonToolSchemas = jest.fn(async () => ({ toolkit_id: core.toolkit_id, tools: core.tools }));
  api.unchain.getSkillInventory = jest.fn(async () => JSON.parse(skillCapture.inventory.body_text));
  api.unchain.previewSkeletonSkill = jest.fn(async () => { throw Object.assign(new Error("no preview here"), { code: "skill_unavailable" }); });
});

const show = async (document, selectedNodeId, diagnostics) => {
  const original = console.error;
  console.error = () => {};
  try {
    await act(async () => {
      render(
        <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
          <DetailPanel recipe={null} selectedNodeId={selectedNodeId} onChange={() => {}} onChangeSilent={() => {}}
            document={document} onDocumentChange={() => {}} diagnostics={diagnostics} />
        </ConfigContext.Provider>,
      );
      for (let tick = 0; tick < 6; tick += 1) await Promise.resolve();
    });
    await act(async () => { for (let tick = 0; tick < 6; tick += 1) await Promise.resolve(); });
  } finally {
    console.error = original;
  }
};
const notice = () => screen.queryByTestId("skeleton-diagnostics-notice");

test.each([
  ["a node that is not a name", badRef({ toString: null }, ["message"]), NODE_ID_DIAGNOSTIC],
  ["a field that is not a name", badRef("start", [{ toString: null }]), PATH_DIAGNOSTIC],
])("a Tool Call argument naming %s opens, and the store's diagnostic about it is shown", async (_label, binding, diagnostic) => {
  await show(doc(toolStep(binding)), "step", [diagnostic]);
  expect(await screen.findByTestId("tool-call-argument-path")).toBeInTheDocument();
  expect(screen.queryByTestId("tool-call-argument-path-ref-no-sources")).toBeNull();
  expect(notice()).not.toBeNull();
  expect(within(notice()).getByText(diagnostic.message)).toBeInTheDocument();
});

test("a Skill Read input the store diagnoses is shown in the notice, beside the panel that removes it", async () => {
  await show(doc(skillStep(badRef({ toString: null }, ["message"]))), "step", [NODE_ID_DIAGNOSTIC]);
  expect(screen.getByTestId("skill-read-inputs")).toHaveTextContent("One input is stored");
  expect(notice()).not.toBeNull();
  expect(within(notice()).getByText(NODE_ID_DIAGNOSTIC.message)).toBeInTheDocument();
});

test("positive control: an input row the IO editor draws still carries its own diagnostic", async () => {
  const diagnostic = { ...NODE_ID_DIAGNOSTIC, path: ["document", "nodes", 2, "config", "execution", "inputs", 0, "value", "node_id"] };
  await show(doc(toolStep(badRef("start", ["message"]))), "end", [diagnostic]);
  expect(screen.getByText("Input Variables")).toBeInTheDocument();
  expect(notice()).toBeNull();
  expect(screen.getByText(diagnostic.message)).toBeInTheDocument();
});

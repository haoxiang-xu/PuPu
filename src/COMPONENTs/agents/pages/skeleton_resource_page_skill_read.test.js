/* eslint-disable testing-library/no-container, testing-library/no-node-access -- Ports and edges are driven on the actual shared editor. */
import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import SkeletonResourcePage from "./skeleton_resource_page";
import { api } from "../../../SERVICEs/api";
import capture from "./recipes_page/skeleton_native_embedded_capture.json";
import toolCapture from "./recipes_page/tool_call_capture.json";
import skillFixture from "./recipes_page/skill_read_capture.json";
import { RESOURCE_RESULT_KEYS } from "./recipes_page/skeleton_resource_capture";
import { openAddNode, pressCanvasNode } from "./recipes_page/skeleton_canvas_test_helpers";

/* The #352 Skill Read author flow on the real page: actual SkeletonResourcePage,
 * FlowEditor, DetailPanel, Select, Input and SegmentedControl. Only the
 * renderer facade is mocked, answering with the sidecar's own captured bodies.
 * With NATIVE_STEPS_SKILL_CAPTURE_PATH set, the skill list and previews are a
 * capture the checkpoint script just took from the home it will run in, so the
 * identity the page stores is one that run can read; with
 * NATIVE_STEPS_BASE_RESULT_PATH / NATIVE_STEPS_PAYLOAD_DIR as in the Tool Call
 * flow (qualify_tool_call_page.py consumes both). */

jest.mock("../../../SERVICEs/api", () => ({ api: { unchain: {} } }));

const fs = require("fs");
const profile = capture.rows[1].document.nodes[1].config.kernel.profile;
const CATALOG = JSON.parse(toolCapture.catalog_v2.body_text);
const CORE = JSON.parse(toolCapture.core_schemas.body_text);
const SKILLS = process.env.NATIVE_STEPS_SKILL_CAPTURE_PATH
  ? JSON.parse(fs.readFileSync(process.env.NATIVE_STEPS_SKILL_CAPTURE_PATH, "utf8")) : skillFixture;
const INVENTORY = JSON.parse(SKILLS.inventory.body_text);
const PREVIEWS = Object.keys(SKILLS).filter((key) => key.startsWith("preview_") && SKILLS[key].status === 200)
  .map((key) => JSON.parse(SKILLS[key].body_text));
const NOTES = INVENTORY.skills.find((skill) => skill.name === "notes");
const NOTES_ID = { source: NOTES.source, source_id: NOTES.source_id, name: NOTES.name };
const BASE = require("./recipes_page/skeleton_branch_page_base.json");
const ref = (node_id, path) => ({ kind: "ref", node_id, path });
const baseRecord = () => {
  if (process.env.NATIVE_STEPS_BASE_RESULT_PATH) return JSON.parse(fs.readFileSync(process.env.NATIVE_STEPS_BASE_RESULT_PATH, "utf8"));
  return { ...Object.fromEntries(RESOURCE_RESULT_KEYS.map((key) => [key, key === "diagnostics" ? [] : null])),
    id: BASE.id, kind: BASE.kind, name: BASE.name, document: JSON.parse(JSON.stringify(BASE)), edit_token: "base-token" };
};
const stored = (document, token) => ({ ...baseRecord(), document, edit_token: token });
const exportPayload = (name, payload) => {
  if (process.env.NATIVE_STEPS_PAYLOAD_DIR) fs.writeFileSync(`${process.env.NATIVE_STEPS_PAYLOAD_DIR}/${name}.json`, JSON.stringify(payload, null, 2) + "\n");
};

let view;
async function open(record) {
  api.unchain.getSkeletonResource = jest.fn().mockResolvedValue(record);
  view = render(<ConfigContext.Provider value={{ theme: {} }}><SkeletonResourcePage resourceId={record.id} /></ConfigContext.Provider>);
  await screen.findByTestId("skeleton-node-router");
}
const add = async (type) => {
  openAddNode();
  fireEvent.click(screen.getByTestId(`palette-entry-${type}`));
};
const port = (node, id) => view.container.querySelector(`[data-node-id="${node}"][data-port-id="${id}"]`);
const drag = (from, out, to, into) => {
  const source = port(from, out);
  const target = port(to, into);
  expect(source).not.toBeNull();
  expect(target).not.toBeNull();
  const original = document.elementFromPoint;
  document.elementFromPoint = () => target;
  try { fireEvent.mouseDown(source, { button: 0 }); fireEvent.mouseUp(window); } finally { document.elementFromPoint = original; }
};
const deleteEdge = (id) => {
  fireEvent.click(view.container.querySelector(`[data-flow-edge-id="${id}"]`));
  fireEvent.click(view.container.querySelector(`[data-edge-delete-btn="${id}"]`));
};
const choose = (container, label, which = 0) => {
  fireEvent.click(within(container).getAllByRole("combobox")[which]);
  const lists = screen.getAllByRole("listbox", { hidden: true });
  fireEvent.click(within(lists[lists.length - 1]).getByText(label, { exact: true }));
};
const save = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }));
  await waitFor(() => expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent(/^Saved$/));
  return api.unchain.saveSkeletonResource.mock.calls.at(-1)[0];
};
const nodeOf = (document, id) => document.nodes.find((node) => node.id === id);
const edgeSet = (document) => document.edges.map((edge) => `${edge.source_node_id}.${edge.source_port_id}>${edge.target_node_id}.${edge.target_port_id}`).sort();
const addOutput = (row, root, name) => {
  fireEvent.click(screen.getByText("+ Add output"));
  choose(screen.getByTestId(`output-row-${row}`), "What this node produced", 0);
  choose(screen.getByTestId(`output-row-${row}`), root, 1);
  fireEvent.change(within(screen.getByTestId(`output-row-${row}`)).getByPlaceholderText("name"), { target: { value: name } });
};
const pickNotes = async () => {
  choose(screen.getByTestId("skill-read-picker"), `notes · your skills (~/.unchain)`);
  await screen.findByTestId("skill-read-preview-body");
};
const bindGuideIntoRouter = () => {
  pressCanvasNode("router");
  fireEvent.click(screen.getByText("+ Add input"));
  fireEvent.change(within(screen.getByTestId("binding-row-1")).getByPlaceholderText("name"), { target: { value: "guide" } });
  choose(screen.getByTestId("binding-row-1"), "skill · guide", 1);
};
const SKILL_CONFIG = {
  execution: { inputs: [], outputs: [
    { name: "guide", source: { kind: "result", path: ["content"] } },
    { name: "skill_name", source: { kind: "result", path: ["name"] } },
  ] },
  skill: NOTES_ID,
};

beforeEach(() => {
  localStorage.clear();
  Object.keys(api.unchain).forEach((key) => delete api.unchain[key]);
  api.unchain.listSkeletonResources = jest.fn().mockResolvedValue({ resources: [] });
  api.unchain.listSkeletonKernelProfiles = jest.fn().mockResolvedValue({ profiles: [profile], unavailable: [] });
  api.unchain.listToolModalCatalog = jest.fn().mockResolvedValue(CATALOG);
  api.unchain.listSkeletonToolSchemas = jest.fn().mockResolvedValue({ toolkit_id: CORE.toolkit_id, tools: CORE.tools });
  api.unchain.getSkillInventory = jest.fn().mockResolvedValue(INVENTORY);
  api.unchain.previewSkeletonSkill = jest.fn(async (identity) => {
    const found = PREVIEWS.find((item) => item.identity.source_id === identity.source_id && item.identity.name === identity.name);
    if (!found) throw new Error(`no captured preview for ${identity.name}`);
    return { identity: found.identity, body: found.body, revision: found.revision, bytes: found.bytes };
  });
  api.unchain.saveSkeletonResource = jest.fn().mockImplementation(async ({ document }) => stored(document, "saved-token"));
});

test("Skill Read: add, pick, preview, map content and name, feed the router, save, reopen", async () => {
  await open(baseRecord());
  deleteEdge("a");
  await add("skill_read");
  await screen.findByTestId("skill-read-section");
  expect(screen.getByTestId("skill-read-node-skill")).toHaveTextContent("Skill read · pick a skill");
  drag("start", "out", "skill", "in");
  drag("skill", "out", "router", "in");
  await pickNotes();
  const preview = PREVIEWS.find((item) => item.identity.name === "notes");
  expect(screen.getByTestId("skill-read-preview-body").textContent).toBe(preview.body);
  addOutput(0, "content", "guide");
  addOutput(1, "name", "skill_name");
  expect(screen.queryByTestId("skill-read-problems")).toBeNull();
  bindGuideIntoRouter();

  const payload = await save();
  expect(payload.expected_edit_token).toBe(baseRecord().edit_token);
  const document = payload.document;
  expect(nodeOf(document, "skill")).toStrictEqual({ id: "skill", type: "skill_read", config: SKILL_CONFIG });
  expect(nodeOf(document, "router").config.execution.inputs[1]).toStrictEqual({ name: "guide", value: ref("skill", ["guide"]), missing: "error" });
  expect(edgeSet(document)).toEqual(["router.out>end.in", "skill.out>router.in", "start.out>skill.in"]);
  expect(JSON.stringify(document)).not.toContain(preview.body.split("\n")[0]);
  expect(document.nodes.every((node) => Object.keys(node).sort().join() === "config,id,type")).toBe(true);
  exportPayload("skill-read-page", payload);

  view.unmount();
  await open(stored(document, "saved-token"));
  expect(screen.getByTestId("skill-read-node-skill")).toHaveTextContent("Skill read · your skills (~/.unchain)");
  pressCanvasNode("skill");
  await screen.findByTestId("skill-read-preview-body");
  expect(within(screen.getByTestId("skill-read-picker")).getByRole("combobox")).toHaveTextContent("notes · your skills (~/.unchain)");
  expect(screen.getByTestId("skill-read-inputs")).toHaveTextContent("No inputs");
  expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent(/^Saved$/);
});

test("Skill Read before an approval: the read happens first, a Write waits, the router gets the skill", async () => {
  await open(baseRecord());
  deleteEdge("a");
  await add("skill_read");
  await screen.findByTestId("skill-read-section");
  await pickNotes();
  addOutput(0, "content", "guide");
  addOutput(1, "name", "skill_name");
  await add("tool_call");
  await screen.findByTestId("tool-call-section");
  drag("start", "out", "skill", "in");
  drag("skill", "out", "tool", "in");
  drag("tool", "out", "router", "in");
  choose(screen.getByTestId("tool-call-picker"), "Write · Core");
  await screen.findByTestId("tool-call-argument-content");
  fireEvent.click(within(screen.getByTestId("tool-call-argument-path")).getByRole("button", { name: "Variable" }));
  choose(screen.getByTestId("tool-call-argument-path"), "start · message");
  fireEvent.click(within(screen.getByTestId("tool-call-argument-content")).getByRole("button", { name: "Value" }));
  fireEvent.change(within(screen.getByTestId("tool-call-argument-content")).getByPlaceholderText("a value written here"), { target: { value: "after the skill" } });
  fireEvent.click(within(screen.getByTestId("tool-call-on-error")).getByRole("button", { name: "Fail the run" }));
  fireEvent.change(within(screen.getByTestId("tool-call-approval")).getByPlaceholderText("seconds"), { target: { value: "60" } });
  bindGuideIntoRouter();

  const payload = await save();
  const document = payload.document;
  expect(nodeOf(document, "skill").config).toStrictEqual(SKILL_CONFIG);
  expect(nodeOf(document, "tool").config.tool).toStrictEqual({ name: "write", on_error: "stop", approval_timeout_ms: 60000 });
  expect(edgeSet(document)).toEqual(["router.out>end.in", "skill.out>tool.in", "start.out>skill.in", "tool.out>router.in"]);
  exportPayload("skill-wait-page", payload);

  view.unmount();
  await open(stored(document, "saved-token"));
  expect(screen.getByTestId("skill-read-node-skill")).toHaveTextContent("notes");
  expect(screen.getByTestId("tool-call-node-tool")).toHaveTextContent("write");
});

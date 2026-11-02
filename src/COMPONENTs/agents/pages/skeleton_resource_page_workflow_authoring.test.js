/* eslint-disable testing-library/no-container, testing-library/no-node-access -- Ports and edges are driven on the actual shared editor. */
import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import SkeletonResourcePage from "./skeleton_resource_page";
import { api } from "../../../SERVICEs/api";
import capture from "./recipes_page/workflow_authoring_capture.json";
import codeCapture from "./recipes_page/code_capture.json";
import { forget_workflow_versions } from "./recipes_page/workflow_versions";
import { openAddNode, pressCanvasNode } from "./recipes_page/skeleton_canvas_test_helpers";

/* #357 G7 on the real page: a new Workflow is created, edited on the canvas,
 * saved, reopened, published and pinned by an Agent's Workflow Call.
 * SkeletonResourcePage, FlowEditor, the palette, DetailPanel and the Workflow
 * Call pin control are real. Only the renderer facade is replaced. Every
 * listing, resource and publication shape it answers with is the real
 * producer's (workflow_authoring_capture.json); where a reply has to carry the
 * document this test saved, that document is put into the producer's reply
 * (constructed, and said so where it happens). Whether the real store takes the
 * exact Save requests written here is the replay's job
 * (workflow-authoring-01/tools/replay_workflow_authoring.py), with
 * WFA_PAYLOAD_DIR set. */

jest.mock("../../../SERVICEs/api", () => ({ api: { unchain: {} } }));

const fs = require("fs");
const copy = (value) => JSON.parse(JSON.stringify(value));
const row = (name) => copy(capture.rows.find((item) => item.case === name));
const REVISION = capture.revision;
const profile = require("./recipes_page/skeleton_native_embedded_capture.json").rows[1].document.nodes[1].config.kernel.profile;
const exportPayload = (name, edit) => {
  if (process.env.WFA_PAYLOAD_DIR) fs.writeFileSync(`${process.env.WFA_PAYLOAD_DIR}/${name}.json`, JSON.stringify(edit, null, 2) + "\n");
};

/* A strict stand-in for Save/Get/Publish: closed v2 edit, compare-and-set, the
   resource answered whole in the producer's reply shape. */
function makeStore() {
  const held = Object.create(null);
  let revision = 10;
  const template = row("wf_seed_save").reply;
  const missing = () => Object.assign(new Error("Skeleton resource was not found."), { code: "resource_missing", path: ["resource_id"], status: 404 });
  const store = {
    held,
    get: jest.fn(async (id) => {
      if (!held[id]) throw missing();
      return copy(held[id]);
    }),
    save: jest.fn(async (edit) => {
      expect(Object.keys(edit).sort()).toEqual(["document", "expected_edit_token", "managed_sources", "schema"]);
      expect(edit.schema).toBe("pupu.skeleton-edit.v2");
      expect(edit.managed_sources).toEqual([]);
      const id = edit.document.id;
      const expected = held[id] ? held[id].resource.edit_token : null;
      if (edit.expected_edit_token !== expected) {
        const { code, path, message, status } = row("wf_edit_stale_token").refusal;
        throw Object.assign(new Error(message), { code, path, status });
      }
      revision += 1;
      /* Constructed: the producer's reply, holding the document just saved. */
      held[id] = {
        ...template,
        resource: { ...template.resource, id, kind: edit.document.kind, name: edit.document.name,
          document: copy(edit.document), edit_token: `edit-${revision}-test`, diagnostics: [] },
      };
      return copy(held[id]);
    }),
    publish: jest.fn(async (id, token) => {
      expect([id, token]).toEqual(["wf-new", held["wf-new"].resource.edit_token]);
      /* Constructed: the producer's publication, holding the draft it publishes. */
      const reply = row("wf_publish").reply;
      reply.version.document = copy(held["wf-new"].resource.document);
      return reply;
    }),
  };
  api.unchain.getManagedSkeletonResource = store.get;
  api.unchain.saveManagedSkeletonResource = store.save;
  api.unchain.publishManagedSkeletonWorkflow = store.publish;
  api.unchain.getManagedSkeletonWorkflowVersion = jest.fn(async () => row("wf_version").reply);
  return store;
}

let view;
const page = (props) => (
  <ConfigContext.Provider value={{ theme: {} }}><SkeletonResourcePage {...props} /></ConfigContext.Provider>
);
const save = async (store) => {
  const before = store.save.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }));
  await waitFor(() => expect(store.save.mock.calls.length).toBe(before + 1));
  await waitFor(() => expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent(/^Saved$/));
  return store.save.mock.calls.at(-1)[0];
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
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
};
const edgeSet = (document) => document.edges.map((edge) => `${edge.kind}:${edge.source_node_id}.${edge.source_port_id}>${edge.target_node_id}.${edge.target_port_id}`).sort();

beforeEach(() => {
  localStorage.clear();
  forget_workflow_versions();
  Object.keys(api.unchain).forEach((key) => delete api.unchain[key]);
  api.unchain.listSkeletonResources = jest.fn().mockResolvedValue(row("list_after_publish").reply);
  api.unchain.listSkeletonKernelProfiles = jest.fn().mockResolvedValue({ profiles: [profile], unavailable: [] });
  api.unchain.listSkeletonPythonProfiles = jest.fn().mockResolvedValue({ profiles: codeCapture.profiles.list_after });
});

test("a new Workflow is created, edited on the canvas, saved, reopened and still editable", async () => {
  const store = makeStore();
  view = render(page({ resourceId: "wf-new", newDraft: { id: "wf-new", name: "New Workflow", kind: "workflow" } }));
  await screen.findByTestId("skeleton-node-start");
  expect(screen.getByTestId("skeleton-node-end")).toBeInTheDocument();
  expect(screen.queryByTestId("skeleton-node-agent")).toBeNull();
  expect(screen.getByTestId("skeleton-save-state")).not.toHaveTextContent(/^Saved$/);

  /* The palette offers exactly what a Workflow can hold. */
  openAddNode();
  ["if_else", "switch_case", "tool_call", "skill_read", "code", "workflow_call"].forEach((type) =>
    expect(screen.getByTestId(`palette-entry-${type}`)).toBeInTheDocument());
  ["agent", "toolkit_pool", "subagent_pool", "hooks_pool"].forEach((type) =>
    expect(screen.queryByTestId(`palette-entry-${type}`)).toBeNull());

  /* The first Save stores the seed the producer stores. */
  fireEvent.keyDown(document, { key: "Escape" });
  const first = await save(store);
  expect(first.expected_edit_token).toBeNull();
  expect(canonical(first.document)).toEqual(canonical(row("wf_seed_save").reply.resource.document));
  exportPayload("01-seed", first);

  /* Edit: put a Code step between Start and End. */
  openAddNode();
  fireEvent.click(screen.getByTestId("palette-entry-code"));
  await screen.findByTestId("skeleton-node-code");
  deleteEdge("flow-start-end");
  drag("start", "out", "code", "in");
  drag("code", "out", "end", "in");
  const second = await save(store);
  expect(second.expected_edit_token).toBe("edit-11-test");
  expect(second.document.kind).toBe("workflow");
  /* The Code seed is the one the store saved inside a Workflow (there named "n"). */
  expect(canonical({ ...second.document.nodes.find((node) => node.id === "code"), id: "n" }))
    .toEqual(canonical(row("wf_add_code_save").reply.resource.document.nodes.find((node) => node.id === "n")));
  expect(edgeSet(second.document)).toEqual(["flow:code.out>end.in", "flow:start.out>code.in"]);
  exportPayload("02-code-step", second);

  /* Reopen from the store: the same graph, and its Code step is editable. */
  view.unmount();
  view = render(page({ resourceId: "wf-new" }));
  await screen.findByTestId("skeleton-node-code");
  expect(store.get).toHaveBeenLastCalledWith("wf-new");
  pressCanvasNode("code");
  await screen.findByTestId("code-section");
  expect(screen.queryByText("These stored settings are read-only here.")).toBeNull();
});

test("a Workflow draws no attachment port, so nothing can be attached; the core refuses it anyway", async () => {
  const store = makeStore();
  view = render(page({ resourceId: "wf-new", newDraft: { id: "wf-new", name: "New Workflow", kind: "workflow" } }));
  await screen.findByTestId("skeleton-node-start");
  openAddNode();
  fireEvent.click(screen.getByTestId("palette-entry-code"));
  await screen.findByTestId("skeleton-node-code");
  ["attach_top", "attach_bot"].forEach((id) => expect(view.container.querySelector(`[data-port-id="${id}"]`)).toBeNull());
  const edit = await save(store);
  expect(edit.document.nodes.map((node) => node.type)).toEqual(["start", "end", "code"]);
  expect(edit.document.edges.every((edge) => edge.kind === "flow")).toBe(true);
});

test("a published draft of the new Workflow is pinned by an Agent's Workflow Call", async () => {
  const store = makeStore();
  /* The new Workflow as the first test leaves it in the store. */
  await store.save({ schema: "pupu.skeleton-edit.v2", document: row("wf_seed_save").reply.resource.document, expected_edit_token: null, managed_sources: [] });
  /* Constructed: the producer's caller, before anything is pinned. */
  const caller = row("caller_save").reply.resource.document;
  const call = caller.nodes.find((node) => node.id === "call");
  delete call.config.workflow;
  await store.save({ schema: "pupu.skeleton-edit.v2", document: caller, expected_edit_token: null, managed_sources: [] });

  view = render(page({ resourceId: "caller-of-new" }));
  await screen.findByTestId("skeleton-node-call");
  pressCanvasNode("call");
  await screen.findByTestId("workflow-call-section");
  await waitFor(() => expect(within(screen.getByTestId("workflow-call-picker")).getByRole("combobox")).not.toBeDisabled());
  choose(screen.getByTestId("workflow-call-picker"), "New Workflow · 1 published");
  fireEvent.click(screen.getByRole("button", { name: "Publish its current draft and pin it" }));
  await screen.findByText(/Pinned revision 1\./);
  expect(store.publish).toHaveBeenCalledTimes(1);
  const edit = await save(store);
  expect(edit.document.nodes.find((node) => node.id === "call").config.workflow).toEqual({ workflow_id: "wf-new", revision_id: REVISION });
  expect(canonical(edit.document)).toEqual(canonical(row("caller_save").reply.resource.document));
  exportPayload("03-caller-pin", edit);
});

/* Every step a Workflow can hold is editable in a Workflow, on the documents
   the real store saved (wf_add_<type>_save). */
test.each([
  ["if_else", "branch-section", "These settings belong to an Agent graph this editor cannot write; they are shown read-only."],
  ["switch_case", "branch-section", "These settings belong to an Agent graph this editor cannot write; they are shown read-only."],
  ["tool_call", "tool-call-section", "These stored settings are read-only here."],
  ["skill_read", "skill-read-section", "These stored settings are read-only here."],
  ["code", "code-section", "These stored settings are read-only here."],
  ["workflow_call", "workflow-call-section", "These stored settings are read-only here."],
])("a stored Workflow's %s step opens editable", async (type, section, readOnly) => {
  const store = makeStore();
  const stored = row(`wf_add_${type}_save`).reply.resource.document;
  await store.save({ schema: "pupu.skeleton-edit.v2", document: stored, expected_edit_token: null, managed_sources: [] });
  api.unchain.listToolModalCatalog = jest.fn().mockResolvedValue({ toolkits: [] });
  api.unchain.listSkeletonToolSchemas = jest.fn().mockResolvedValue({ toolkit_id: "core", tools: [] });
  api.unchain.listSkills = jest.fn().mockResolvedValue({ skills: [] });
  view = render(page({ resourceId: stored.id }));
  await screen.findByTestId("skeleton-node-n");
  pressCanvasNode("n");
  await screen.findByTestId(section);
  expect(screen.queryByText(readOnly)).toBeNull();
});

test("a Workflow's Switch step is written, not only shown: a case added in its panel is saved", async () => {
  const store = makeStore();
  const stored = row("wf_add_switch_case_save").reply.resource.document;
  await store.save({ schema: "pupu.skeleton-edit.v2", document: stored, expected_edit_token: null, managed_sources: [] });
  view = render(page({ resourceId: stored.id }));
  await screen.findByTestId("skeleton-node-n");
  pressCanvasNode("n");
  await screen.findByTestId("branch-section");
  fireEvent.click(screen.getByRole("button", { name: "+ Add a case" }));
  fireEvent.change(within(screen.getByTestId("branch-case-0-value-text")).getByPlaceholderText("text"), { target: { value: "a" } });
  const edit = await save(store);
  const node = edit.document.nodes.find((entry) => entry.id === "n");
  expect(edit.document.kind).toBe("workflow");
  expect(node.config.execution.cases).toHaveLength(1);
  expect(node.config.execution.cases[0].value).toBe("a");
});

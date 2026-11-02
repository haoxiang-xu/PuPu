import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import SkeletonResourcePage from "./skeleton_resource_page";
import { api } from "../../../SERVICEs/api";
import capture from "./recipes_page/hooks_pool_capture.json";
import toolCapture from "./recipes_page/tool_call_capture.json";
import { forget_workflow_versions } from "./recipes_page/workflow_versions";
import { openAddNode, pressCanvasNode } from "./recipes_page/skeleton_canvas_test_helpers";

/* #357 Hooks Pool on the real page: SkeletonResourcePage, FlowEditor,
 * DetailPanel, the hook editor's Select / Input / SegmentedControl and the
 * shared Workflow pin control. Only the renderer facade is replaced, with the
 * v2 methods, the library listing and the tool library; every resource,
 * revision, publication and refusal it answers with is the real producer's
 * (hooks_pool_capture.json; the tool library from tool_call_capture.json).
 * A Save is answered by a strict in-test store; whether the real store and
 * the fixed sidecar take the exact Save requests written here is the replay's
 * job (hooks-pool-01/tools/replay_hooks_*), with HOOKS_PAYLOAD_DIR set. */

jest.mock("../../../SERVICEs/api", () => ({ api: { unchain: {} } }));

const fs = require("fs");
const copy = (value) => JSON.parse(JSON.stringify(value));
const row = (name) => copy(capture.rows.find((item) => item.case === name));
const REV = capture.revisions;
const CATALOG = JSON.parse(toolCapture.catalog_v2.body_text);
const exported = [];
const exportPayload = (name, base, edit) => {
  exported.push(name);
  if (process.env.HOOKS_PAYLOAD_DIR) fs.writeFileSync(`${process.env.HOOKS_PAYLOAD_DIR}/${name}.json`, JSON.stringify({ base, edit }, null, 2) + "\n");
};
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

function makeStore(names) {
  const held = Object.create(null);
  names.forEach((name) => {
    const reply = row(name).reply;
    held[reply.resource.id] = reply;
  });
  Object.keys(REV).forEach((workflow_id) => { held[workflow_id] = row(`${workflow_id}_create`).reply; });
  let revision = 10;
  const store = {
    held,
    get: jest.fn(async (id) => {
      if (!held[id]) throw Object.assign(new Error("Skeleton resource was not found."), { code: "resource_missing", path: ["resource_id"], status: 404 });
      return copy(held[id]);
    }),
    save: jest.fn(async (edit) => {
      expect(Object.keys(edit).sort()).toEqual(["document", "expected_edit_token", "managed_sources", "schema"]);
      const id = edit.document.id;
      if (edit.expected_edit_token !== (held[id] ? held[id].resource.edit_token : null)) throw Object.assign(new Error("Resource changed in another editor."), { code: "edit_conflict", path: ["expected_edit_token"], status: 409 });
      revision += 1;
      held[id] = { ...held[id], resource: { ...held[id].resource, document: copy(edit.document), edit_token: `edit-${revision}-test`, diagnostics: [] } };
      return copy(held[id]);
    }),
    version: jest.fn(async (id, rev) => {
      if (REV[id] === rev) return row(`${id}_version`).reply;
      throw Object.assign(new Error("Workflow version was not found."), { code: "resource_missing", path: ["revision_id"], status: 404 });
    }),
    publish: jest.fn(async (id, token) => {
      expect(token).toBe(row(`${id}_create`).reply.resource.edit_token);
      return row(`${id}_publish`).reply;
    }),
  };
  api.unchain.getManagedSkeletonResource = store.get;
  api.unchain.saveManagedSkeletonResource = store.save;
  api.unchain.getManagedSkeletonWorkflowVersion = store.version;
  api.unchain.publishManagedSkeletonWorkflow = store.publish;
  return store;
}

let view;
async function open(id) {
  view = render(<ConfigContext.Provider value={{ theme: {} }}><SkeletonResourcePage resourceId={id} /></ConfigContext.Provider>);
  await screen.findByTestId("skeleton-node-start");
}
const openPool = async (id = "hooks") => {
  pressCanvasNode(id);
  await screen.findByTestId("hooks-pool-section");
};
const choose = (container, label) => {
  fireEvent.click(within(container).getAllByRole("combobox")[0]);
  const lists = screen.getAllByRole("listbox", { hidden: true });
  fireEvent.click(within(lists[lists.length - 1]).getByText(label, { exact: true }));
};
const save = async (store) => {
  const before = store.save.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }));
  await waitFor(() => expect(store.save.mock.calls.length).toBe(before + 1));
  await waitFor(() => expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent(/^Saved$/));
  return store.save.mock.calls.at(-1)[0];
};
const hooksOf = (document, id = "hooks") => document.nodes.find((node) => node.id === id).config.hooks;
const pinByPublish = async (index, label) => {
  const control = screen.getByTestId(`hook-${index}-workflow`);
  await waitFor(() => expect(within(screen.getByTestId(`hook-${index}-workflow-picker`)).getByRole("combobox")).not.toBeDisabled());
  choose(screen.getByTestId(`hook-${index}-workflow-picker`), label);
  fireEvent.click(within(control).getByRole("button", { name: /Publish its current draft and pin/ }));
  await within(screen.getByTestId(`hook-${index}-workflow`)).findByText(/Pinned revision 1\./);
};

beforeEach(() => {
  localStorage.clear();
  forget_workflow_versions();
  Object.keys(api.unchain).forEach((key) => delete api.unchain[key]);
  api.unchain.listSkeletonResources = jest.fn().mockResolvedValue(row("list_active").reply);
  api.unchain.listToolModalCatalog = jest.fn().mockResolvedValue(CATALOG);
  api.unchain.listSkeletonKernelProfiles = jest.fn().mockResolvedValue({ profiles: [], unavailable: [] });
  api.unchain.listSkeletonPythonProfiles = jest.fn().mockResolvedValue({ profiles: [] });
});

afterAll(() => {
  if (process.env.HOOKS_PAYLOAD_DIR) fs.writeFileSync(`${process.env.HOOKS_PAYLOAD_DIR}/index.json`, JSON.stringify(exported, null, 2) + "\n");
});

test("add a hook, configure every field, pin its Workflow by publishing, Save, reopen", async () => {
  const store = makeStore(["seed_get"]);
  await open("agent-seed");
  expect(screen.getByTestId("hooks-pool-node-hooks")).toHaveTextContent("No hooks yet");
  await openPool();
  expect(screen.getByTestId("hooks-pool-problems")).toHaveTextContent("Add a hook.");
  fireEvent.click(screen.getByRole("button", { name: "+ Add hook" }));
  /* Only the id is written; every other field is the author's. */
  await screen.findByTestId("hook-0-editor");
  const problems = () => screen.getByTestId("hook-0-problems").textContent;
  expect(problems()).toContain("Set the order");
  expect(problems()).toContain("Choose when it runs");
  expect(problems()).toContain("Choose which tool calls it sees");
  expect(problems()).toContain("Pin the published Workflow");

  fireEvent.change(within(screen.getByTestId("hook-0-editor")).getByPlaceholderText("0 … 1,000,000"), { target: { value: "1.5" } });
  expect(screen.getByTestId("hook-0-order-problem")).toBeInTheDocument();
  fireEvent.change(within(screen.getByTestId("hook-0-editor")).getByPlaceholderText("0 … 1,000,000"), { target: { value: "10" } });
  choose(screen.getByTestId("hook-0-event"), "Before the tool call");
  fireEvent.click(within(screen.getByTestId("hook-0-tool")).getByText("One tool"));
  choose(screen.getByTestId("hook-0-tool-picker"), "write");
  fireEvent.click(within(screen.getByTestId("hook-0-approval")).getByText("Always ask"));
  await pinByPublish(0, "Allow · 1 published");
  expect(screen.queryByTestId("hook-0-problems")).toBeNull();
  expect(screen.getByTestId("hook-0-exports")).toHaveTextContent("decision, require_approval");
  expect(screen.getByTestId("hooks-pool-order-kernel")).toHaveTextContent("hook-1");
  expect(screen.getByTestId("hooks-pool-node-hooks")).toHaveTextContent("Allow · rev 1");

  const edit = await save(store);
  expect(hooksOf(edit.document)).toEqual([{
    id: "hook-1", order: 10, event: "before_tool_call", tool_name: "write",
    workflow: { workflow_id: "wf-hook-continue", revision_id: REV["wf-hook-continue"] }, force_approval: true,
  }]);
  expect(edit.managed_sources).toEqual([]);
  exportPayload("add-and-configure", "seed_get", edit);

  view.unmount();
  forget_workflow_versions();
  await open("agent-seed");
  await openPool();
  fireEvent.click(screen.getByRole("button", { name: "Edit hook 1" }));
  expect(within(screen.getByTestId("hook-0-editor")).getByPlaceholderText("0 … 1,000,000")).toHaveValue("10");
  await waitFor(() => expect(screen.getByTestId("hook-0-workflow-pinned")).toHaveTextContent("revision 1 of Allow"));
});

test("stored values the runtime refuses are shown as stored and can be fixed in place", async () => {
  const store = makeStore(["order_float_get"]);
  await open("agent-order-float");
  await openPool();
  expect(screen.getByTestId("hook-row-0")).toHaveTextContent("1 to fix");
  fireEvent.click(screen.getByRole("button", { name: "Edit hook 1" }));
  expect(within(screen.getByTestId("hook-0-editor")).getByPlaceholderText("stored: 1.5")).toBeInTheDocument();
  expect(screen.getByTestId("hook-0-problems")).toHaveTextContent("whole number");
  fireEvent.change(within(screen.getByTestId("hook-0-editor")).getByPlaceholderText("stored: 1.5"), { target: { value: "2" } });
  expect(screen.queryByTestId("hook-0-problems")).toBeNull();
  const edit = await save(store);
  expect(hooksOf(edit.document)[0].order).toBe(2);
  exportPayload("fix-order", "order_float_get", edit);
});

/* #357 Hook on/off: this capture is the old wheel, which refuses `enabled`.
   With no confirmed Hook contract the panel shows the stored value, says it
   cannot be checked, and still removes it on request. */
test("an unconfirmed on/off setting is shown with its value and removed only on request", async () => {
  const store = makeStore(["entry_extra_enabled_get"]);
  await open("agent-entry-extra-enabled");
  await openPool();
  fireEvent.click(screen.getByRole("button", { name: "Edit hook 1" }));
  expect(screen.getByTestId("hook-0-extra-enabled")).toHaveTextContent("true");
  expect(screen.getByTestId("hook-0-problems")).toHaveTextContent("has not confirmed it can turn hooks on or off");
  fireEvent.click(screen.getByRole("button", { name: "Remove stored setting enabled" }));
  const edit = await save(store);
  expect(Object.keys(hooksOf(edit.document)[0]).sort()).toEqual(["event", "force_approval", "id", "order", "tool_name", "workflow"]);
  exportPayload("remove-extra", "entry_extra_enabled_get", edit);
});

test("a stored list that is not a list is shown raw and replaced only by the explicit action", async () => {
  const store = makeStore(["hooks_not_list_get"]);
  await open("agent-hooks-not-list");
  await openPool();
  expect(screen.getByTestId("hooks-pool-stored-invalid")).toHaveTextContent('{"guard":1}');
  expect(screen.getByTestId("hooks-pool-node-hooks")).toHaveTextContent("Hook settings unreadable");
  fireEvent.click(screen.getByRole("button", { name: "Replace the stored hooks with an empty list" }));
  expect(screen.getByTestId("hooks-pool-problems")).toHaveTextContent("Add a hook.");
  const edit = await save(store);
  expect(hooksOf(edit.document)).toEqual([]);
});

test("a non-object entry is shown and removable; the others are untouched", async () => {
  const store = makeStore(["entry_not_object_get"]);
  await open("agent-entry-not-object");
  await openPool();
  expect(screen.getByTestId("hook-row-0")).toHaveTextContent("guard");
  expect(screen.getByTestId("hook-row-0")).toHaveTextContent("not an object");
  fireEvent.click(screen.getByRole("button", { name: "Remove stored entry 1" }));
  const edit = await save(store);
  expect(hooksOf(edit.document)).toEqual([]);
});

test("what preflight lets through is said: the same id in two pools on one Agent, and an End that is not a decision", async () => {
  makeStore(["scope_duplicate_id_get"]);
  await open("agent-scope-duplicate-id");
  await openPool("more");
  fireEvent.click(screen.getByRole("button", { name: "Edit hook 1" }));
  expect(screen.getByTestId("hook-0-problems")).toHaveTextContent("Preflight lets this through, but the run refuses it");
  /* Seen from the second pool: the first pool's `same` (order 1) runs first. */
  expect(screen.getByTestId("hooks-pool-order-kernel")).toHaveTextContent("same (hooks) → same.");
  view.unmount();

  makeStore(["bad_decision_workflow_get"]);
  await open("agent-bad-decision-workflow");
  await openPool();
  fireEvent.click(screen.getByRole("button", { name: "Edit hook 1" }));
  await waitFor(() => expect(screen.getByTestId("hook-0-problems")).toHaveTextContent("is not a before decision"));
  expect(screen.getByTestId("hook-0-exports")).toHaveTextContent("verdict");
});

test("a publication that answers after the author changed Workflow pins nothing", async () => {
  const store = makeStore(["seed_get"]);
  const late = deferred();
  store.publish.mockImplementation(() => late.promise);
  await open("agent-seed");
  await openPool();
  fireEvent.click(screen.getByRole("button", { name: "+ Add hook" }));
  await screen.findByTestId("hook-0-editor");
  await waitFor(() => expect(within(screen.getByTestId("hook-0-workflow-picker")).getByRole("combobox")).not.toBeDisabled());
  choose(screen.getByTestId("hook-0-workflow-picker"), "Allow · 1 published");
  fireEvent.click(within(screen.getByTestId("hook-0-workflow")).getByRole("button", { name: /Publish its current draft and pin/ }));
  await waitFor(() => expect(store.publish).toHaveBeenCalledTimes(1));
  choose(screen.getByTestId("hook-0-workflow-picker"), "Block · 1 published");
  await act(async () => {
    late.resolve(row("wf-hook-continue_publish").reply);
    await late.promise;
  });
  expect(screen.getByTestId("hook-0-problems")).toHaveTextContent("Pin the published Workflow");
});

test("a new Hooks Pool from the palette starts empty and unattached; the draft check says so", async () => {
  const store = makeStore(["complete_get"]);
  await open("agent-complete");
  openAddNode();
  fireEvent.click(screen.getByTestId("palette-entry-hooks_pool"));
  await screen.findByTestId("hooks-pool-section");
  const problems = screen.getByTestId("hooks-pool-problems").textContent;
  expect(problems).toContain("Add a hook.");
  expect(problems).toContain("Attach this pool to an Agent");
  const edit = await save(store);
  const added = edit.document.nodes.filter((node) => node.type === "hooks_pool").find((node) => node.id !== "hooks");
  expect(added.config).toEqual({ hooks: [] });
});

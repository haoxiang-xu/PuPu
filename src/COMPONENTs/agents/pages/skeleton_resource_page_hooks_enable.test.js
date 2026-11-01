/* eslint-disable testing-library/no-node-access -- the run-order rows are dragged with native drag events on the actual panel. */
import React from "react";
import { createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import SkeletonResourcePage from "./skeleton_resource_page";
import { api } from "../../../SERVICEs/api";
import capture from "./recipes_page/hooks_enable_order_capture.json";
import capabilityCapture from "../../../SERVICEs/skeleton_hook_capabilities_capture.json";
import toolCapture from "./recipes_page/tool_call_capture.json";
import { forget_workflow_versions } from "./recipes_page/workflow_versions";
import { pressCanvasNode } from "./recipes_page/skeleton_canvas_test_helpers";
import { hook_scope_entries, kernel_hook_order } from "./recipes_page/hooks_pool_config";

/* #357 Hook on/off and run order on the real page: SkeletonResourcePage,
 * DetailPanel, the Hooks Pool section's SegmentedControl, run-order list and
 * Save. Only the renderer facade is replaced. Every resource, revision and
 * capability it answers with is the real producer's
 * (hooks_enable_order_capture.json from the new fixed pair, and the sidecar's
 * own capability reply, skeleton_hook_capabilities_capture.json). Whether the
 * real store takes the exact Save requests written here, and what order the
 * runtime then runs them in, is the replay's job
 * (hooks-ui-01/tools/replay_hooks_ui.py), with HOOKS_UI_PAYLOAD_DIR set. */

jest.mock("../../../SERVICEs/api", () => ({ api: { unchain: {} } }));

const fs = require("fs");
const copy = (value) => JSON.parse(JSON.stringify(value));
const row = (name) => copy(capture.rows.find((item) => item.case === name));
const REV = capture.revisions;
const CATALOG = JSON.parse(toolCapture.catalog_v2.body_text);
const exportPayload = (name, base, edit) => {
  /* What the panel says runs, so the replay can hold the runtime to it. */
  const ui_run_order = kernel_hook_order(edit.document, "kernel").map((item) => item.id);
  if (process.env.HOOKS_UI_PAYLOAD_DIR) fs.writeFileSync(`${process.env.HOOKS_UI_PAYLOAD_DIR}/${name}.json`, JSON.stringify({ base, edit, ui_run_order }, null, 2) + "\n");
};

function makeStore(names) {
  const held = Object.create(null);
  names.forEach((name) => {
    const reply = row(`${name}_get`).reply;
    held[reply.resource.id] = reply;
  });
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
  };
  api.unchain.getManagedSkeletonResource = store.get;
  api.unchain.saveManagedSkeletonResource = store.save;
  api.unchain.getManagedSkeletonWorkflowVersion = store.version;
  return store;
}

let view;
const page = (id) => <ConfigContext.Provider value={{ theme: {} }}><SkeletonResourcePage resourceId={id} /></ConfigContext.Provider>;
async function open(id) {
  view = render(page(id));
  await screen.findByTestId("skeleton-node-start");
}
const openPool = async (id = "hooks") => {
  pressCanvasNode(id);
  await screen.findByTestId("hooks-pool-section");
};
const save = async (store) => {
  const before = store.save.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }));
  await waitFor(() => expect(store.save.mock.calls.length).toBe(before + 1));
  await waitFor(() => expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent(/^Saved$/));
  return store.save.mock.calls.at(-1)[0];
};
const hooksOf = (document, id = "hooks") => document.nodes.find((node) => node.id === id).config.hooks;
const runs = (index) => within(screen.getByTestId(`hook-${index}-runs`));
const scopeIds = (document) => hook_scope_entries(document, "kernel").map((item) => item.id);
const drag = (fromTestId, toTestId) => {
  const source = screen.getByTestId(fromTestId);
  const target = screen.getByTestId(toTestId);
  const transfer = { effectAllowed: "", setData() {}, getData() { return ""; } };
  fireEvent(source, Object.assign(createEvent.dragStart(source), { dataTransfer: transfer }));
  fireEvent.dragOver(target);
  fireEvent.drop(target);
  fireEvent.dragEnd(source);
};

beforeEach(() => {
  localStorage.clear();
  forget_workflow_versions();
  Object.keys(api.unchain).forEach((key) => delete api.unchain[key]);
  api.unchain.listSkeletonResources = jest.fn().mockResolvedValue(row("list_active").reply);
  api.unchain.listToolModalCatalog = jest.fn().mockResolvedValue(CATALOG);
  api.unchain.listSkeletonKernelProfiles = jest.fn().mockResolvedValue({ profiles: [], unavailable: [] });
  api.unchain.listSkeletonPythonProfiles = jest.fn().mockResolvedValue({ profiles: [] });
  api.unchain.getSkeletonHookCapabilities = jest.fn().mockResolvedValue(copy(capabilityCapture));
});

test("turn one hook off: only its enabled is written, it leaves the run order; Save, reopen, turn it on again", async () => {
  const store = makeStore(["enabled_missing"]);
  const base = row("enabled_missing_get").reply.resource.document;
  await open("agent-enabled-missing");
  await openPool();
  fireEvent.click(screen.getByRole("button", { name: "Edit hook 1" }));
  await waitFor(() => expect(screen.getByTestId("hook-0-runs-note")).toHaveTextContent("a hook without this setting runs"));
  /* Choosing On for a hook that already runs writes nothing. */
  fireEvent.click(runs(0).getByText("On"));
  expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent(/^Saved$/);

  fireEvent.click(runs(0).getByText("Off"));
  expect(screen.getByTestId("skeleton-save-state")).not.toHaveTextContent(/^Saved$/);
  expect(screen.getByTestId("hooks-pool-order-kernel")).toHaveTextContent(/run by order, then id: audit\./);
  expect(screen.getByTestId("hook-row-0")).toHaveTextContent("· off");
  const edit = await save(store);
  expect(hooksOf(edit.document)).toEqual([{ ...hooksOf(base)[0], enabled: false }, hooksOf(base)[1]]);
  expect(edit.document.nodes.filter((node) => node.id !== "hooks")).toEqual(base.nodes.filter((node) => node.id !== "hooks"));
  expect(edit.document.edges).toEqual(base.edges);
  exportPayload("01-off", "enabled_missing_get", edit);

  view.unmount();
  await open("agent-enabled-missing");
  await openPool();
  expect(screen.getByTestId("hook-row-0")).toHaveTextContent("· off");
  fireEvent.click(screen.getByRole("button", { name: "Edit hook 1" }));
  await waitFor(() => expect(screen.getByTestId("hook-0-runs-note")).toHaveTextContent("is not run"));
  fireEvent.click(runs(0).getByText("On"));
  const again = await save(store);
  expect(hooksOf(again.document)[0]).toEqual({ ...hooksOf(base)[0], enabled: true });
  expect(hooksOf(again.document)[1]).toEqual(hooksOf(base)[1]);
  exportPayload("02-on", "enabled_missing_get", again);
});

test("a malformed stored on/off is shown raw, refused in words, and replaced only by a choice", async () => {
  const store = makeStore(["enabled_string"]);
  await open("agent-enabled-string");
  await openPool();
  expect(screen.getByTestId("hook-row-0")).toHaveTextContent("1 to fix");
  fireEvent.click(screen.getByRole("button", { name: "Edit hook 1" }));
  await waitFor(() => expect(screen.getByTestId("hook-0-problems")).toHaveTextContent('On/off is stored as "yes"'));
  expect(screen.getByTestId("hook-0-runs")).toHaveTextContent('Stored: "yes"');
  expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent(/^Saved$/);
  fireEvent.click(runs(0).getByText("Off"));
  const edit = await save(store);
  expect(hooksOf(edit.document)[0].enabled).toBe(false);
  exportPayload("03-fix-malformed", "enabled_string_get", edit);
});

test("when the runtime's Hook contract is unavailable nothing is guessed and nothing is written", async () => {
  const store = makeStore(["enabled_false"]);
  api.unchain.getSkeletonHookCapabilities = jest.fn().mockRejectedValue(Object.assign(new Error("This runtime does not support Hook enable state."), { code: "skeleton_hook_enable_unavailable" }));
  await open("agent-enabled-false");
  await openPool();
  fireEvent.click(screen.getByRole("button", { name: "Edit hook 1" }));
  await waitFor(() => expect(screen.getByTestId("hook-0-runs-note")).toHaveTextContent("has not confirmed it can turn hooks off (skeleton_hook_enable_unavailable)"));
  expect(screen.getByTestId("hook-0-problems")).toHaveTextContent("Whether the run accepts it cannot be checked here");
  expect(screen.getByTestId("hook-0-extra-enabled")).toHaveTextContent("false");
  fireEvent.click(runs(0).getByText("On"));
  fireEvent.click(runs(0).getByText("Off"));
  expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent(/^Saved$/);
  expect(store.save).not.toHaveBeenCalled();
});

test("dragging a hook writes real order values; sibling pools, ties and off hooks keep the runtime's (order, id)", async () => {
  const store = makeStore(["siblings_same_order"]);
  const base = row("siblings_same_order_get").reply.resource.document;
  await open("agent-siblings");
  await openPool();
  const list = () => within(screen.getByTestId("hooks-run-list-kernel")).getAllByTestId(/^hooks-run-row-/).map((node) => node.getAttribute("data-testid").replace("hooks-run-row-kernel-", ""));
  expect(list()).toEqual(["more-d", "hooks-e", "hooks-a", "more-b", "hooks-c"]);
  expect(screen.getByTestId("hooks-run-row-kernel-hooks-a")).toHaveTextContent("off, not run");
  /* Another pool's hook is listed but cannot be dragged. */
  expect(screen.getByTestId("hooks-run-row-kernel-more-d")).not.toHaveAttribute("draggable", "true");

  /* e to the end: only e's order moves. */
  drag("hooks-run-row-kernel-hooks-e", "hooks-run-end-kernel");
  expect(list()).toEqual(["more-d", "hooks-a", "more-b", "hooks-c", "hooks-e"]);
  /* e before d: d is another pool's hook at order 0 and e sorts after it. */
  drag("hooks-run-row-kernel-hooks-e", "hooks-run-row-kernel-more-d");
  expect(screen.getByTestId("hooks-run-problem-kernel")).toHaveTextContent("A hook from another pool on this Agent sits where this one would go");
  expect(list()).toEqual(["more-d", "hooks-a", "more-b", "hooks-c", "hooks-e"]);
  /* c one earlier with its arrow: past b (same order, smaller id). */
  fireEvent.click(screen.getByRole("button", { name: "Move c earlier on kernel" }));
  expect(list()).toEqual(["more-d", "hooks-a", "hooks-c", "more-b", "hooks-e"]);
  expect(screen.getByTestId("hooks-pool-order-kernel")).toHaveTextContent("d (more) → c → b (more) → e.");

  const edit = await save(store);
  const before = hooksOf(base);
  const after = hooksOf(edit.document);
  /* The stored list keeps its positions; only order values changed. */
  expect(after.map((entry) => entry.id)).toEqual(before.map((entry) => entry.id));
  after.forEach((entry, at) => expect({ ...entry, order: before[at].order }).toEqual(before[at]));
  expect(hooksOf(edit.document, "more")).toEqual(hooksOf(base, "more"));
  expect(scopeIds(edit.document)).toEqual(["d", "a", "c", "b", "e"]);
  exportPayload("04-reorder", "siblings_same_order_get", edit);

  view.unmount();
  await open("agent-siblings");
  await openPool();
  expect(list()).toEqual(["more-d", "hooks-a", "hooks-c", "more-b", "hooks-e"]);
});

/* R-HUI-01: dropping a hook back on its own row writes nothing and does not
   make the graph dirty; a real move afterwards still works. */
test("a drop on the hook's own row is not a move", async () => {
  const store = makeStore(["enabled_missing"]);
  await open("agent-enabled-missing");
  await openPool();
  const list = () => within(screen.getByTestId("hooks-run-list-kernel")).getAllByTestId(/^hooks-run-row-/).map((node) => node.getAttribute("data-testid").replace("hooks-run-row-kernel-", ""));
  expect(list()).toEqual(["hooks-guard", "hooks-audit"]);
  for (const id of ["audit", "guard"]) {
    drag(`hooks-run-row-kernel-hooks-${id}`, `hooks-run-row-kernel-hooks-${id}`);
    expect(list()).toEqual(["hooks-guard", "hooks-audit"]);
    expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent(/^Saved$/);
    expect(screen.queryByTestId("hooks-run-problem-kernel")).toBeNull();
  }
  drag("hooks-run-row-kernel-hooks-audit", "hooks-run-row-kernel-hooks-guard");
  expect(list()).toEqual(["hooks-audit", "hooks-guard"]);
  const edit = await save(store);
  expect(hooksOf(edit.document).map((entry) => entry.id)).toEqual(["guard", "audit"]);
  exportPayload("05-self-drop-then-move", "enabled_missing_get", edit);
});

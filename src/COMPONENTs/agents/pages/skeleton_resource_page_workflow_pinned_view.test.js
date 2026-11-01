/* eslint-disable testing-library/no-node-access -- the code block is read off the real shared editor. */
import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import SkeletonResourcePage from "./skeleton_resource_page";
import Modal from "../../../BUILTIN_COMPONENTs/modal/modal";
import { api } from "../../../SERVICEs/api";
import capture from "./recipes_page/workflow_call_capture.json";
import codeCapture from "./recipes_page/code_capture.json";
import managedCapture from "./recipes_page/managed_code_capture.json";
import { forget_workflow_versions } from "./recipes_page/workflow_versions";
import { pinned_view_key } from "./recipes_page/pinned_workflow_view";
import { readSkeletonLayout, writeSkeletonViewport } from "../../../SERVICEs/skeleton_layout";
import { openAddNode, pressCanvasNode } from "./recipes_page/skeleton_canvas_test_helpers";

/* #357 Workflow Call: opening the graph a call is pinned to, read-only, on the
 * real page (SkeletonResourcePage, FlowEditor, DetailPanel, the breadcrumb).
 * Only the renderer facade is replaced, with its v2 methods; every resource,
 * revision and refusal is the real producer's (workflow_call_capture.json),
 * except the one revision carrying host-kept Code text: no producer capture of
 * such a revision exists yet, so `g1_revision` re-wraps the real G1 resource
 * aggregate (managed_code_capture.json `root_create`) as a version aggregate.
 * That case is about this page drawing the text the aggregate carries; that
 * the host answers a published managed Workflow this way is the producer
 * capture's job, not this test's. */

jest.mock("../../../SERVICEs/api", () => ({ api: { unchain: {} } }));

const copy = (value) => JSON.parse(JSON.stringify(value));
const row = (name) => copy(capture.rows.find((item) => item.case === name));
const refusal = (name) => {
  const { code, path, message, status } = row(name).refusal;
  return Object.assign(new Error(message), { code, path, status });
};
const REV1 = capture.rev1;
const REV2 = capture.rev2;
const profile = require("./recipes_page/skeleton_native_embedded_capture.json").rows[1].document.nodes[1].config.kernel.profile;
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

const G1_REVISION = "rev-1-0000000000000g1a";
function g1_revision() {
  const reply = copy(managedCapture.rows.find((item) => item.case === "root_create").reply);
  return {
    schema: "pupu.skeleton-workflow-version.v2",
    version: {
      workflow_id: reply.resource.id,
      revision_id: G1_REVISION,
      ordinal: 1,
      definition_digest: reply.content_digest,
      document: { ...reply.resource.document, kind: "workflow" },
      dependencies: [],
    },
    sources_manifest: reply.sources_manifest,
    contents: reply.contents,
    content_digest: reply.content_digest,
  };
}

/* The facade, as in the Workflow Call page test. A Save is answered by a
   strict in-test store; `gate`, when set, holds the next revision reads so a
   test decides when (and in which order) they answer. */
function makeStore(names, { extraVersions = {} } = {}) {
  const held = Object.create(null);
  names.forEach((name) => {
    const reply = row(name).reply;
    held[reply.resource.id] = reply;
  });
  let revision = 10;
  const versions = Object.create(null);
  ["wf_version_1", "wf_version_2"].forEach((name) => {
    const reply = row(name).reply;
    versions[`${reply.version.workflow_id}\u0000${reply.version.revision_id}`] = reply;
  });
  Object.entries(extraVersions).forEach(([key, reply]) => { versions[key] = reply; });
  const store = {
    held,
    gate: null,
    get: jest.fn(async (id) => {
      if (!held[id]) throw Object.assign(new Error("Skeleton resource was not found."), { code: "resource_missing", path: ["resource_id"], status: 404 });
      return copy(held[id]);
    }),
    save: jest.fn(async (edit) => {
      expect(Object.keys(edit).sort()).toEqual(["document", "expected_edit_token", "managed_sources", "schema"]);
      expect(edit.managed_sources).toEqual([]);
      const id = edit.document.id;
      if (edit.expected_edit_token !== (held[id] ? held[id].resource.edit_token : null)) throw refusal("wf_publish_stale_token");
      revision += 1;
      held[id] = { ...held[id], resource: { ...held[id].resource, document: copy(edit.document), edit_token: `edit-${revision}-test`, diagnostics: [] } };
      return copy(held[id]);
    }),
    version: jest.fn(async (id, rev) => {
      if (store.gate) await store.gate(id, rev);
      const reply = versions[`${id}\u0000${rev}`];
      if (!reply) throw refusal("wf_version_missing");
      return copy(reply);
    }),
    publish: jest.fn(async () => {
      throw new Error("Opening a pinned graph must never publish.");
    }),
  };
  api.unchain.getManagedSkeletonResource = store.get;
  api.unchain.saveManagedSkeletonResource = store.save;
  api.unchain.getManagedSkeletonWorkflowVersion = store.version;
  api.unchain.publishManagedSkeletonWorkflow = store.publish;
  return store;
}

async function open(id) {
  render(<ConfigContext.Provider value={{ theme: {} }}><SkeletonResourcePage resourceId={id} /></ConfigContext.Provider>);
  await screen.findByTestId("skeleton-node-start");
}
const openCall = async (id = "call") => {
  pressCanvasNode(id);
  await screen.findByTestId("workflow-call-section");
};
const setValue = (name, text) => {
  const argument = screen.getByTestId(`tool-call-argument-${name}`);
  fireEvent.click(within(argument).getByText("Value"));
  fireEvent.change(within(screen.getByTestId(`tool-call-argument-${name}`)).getByPlaceholderText("a value written here"), { target: { value: text } });
};
const OPEN = { name: "Open the pinned graph (read-only)" };
const openPinned = () => fireEvent.click(screen.getByRole("button", OPEN));
const pinnedView = () => screen.queryByTestId("workflow-pinned-view");
/* The revision reads made to open a view, as opposed to the panel's one read
   of the pin it shows. */
const viewReads = (store, from) => store.version.mock.calls.slice(from);

beforeEach(() => {
  localStorage.clear();
  forget_workflow_versions();
  Object.keys(api.unchain).forEach((key) => delete api.unchain[key]);
  api.unchain.listSkeletonResources = jest.fn().mockResolvedValue(row("list_active").reply);
  api.unchain.listSkeletonKernelProfiles = jest.fn().mockResolvedValue({ profiles: [profile], unavailable: [] });
  api.unchain.listSkeletonPythonProfiles = jest.fn().mockResolvedValue({ profiles: codeCapture.profiles.list_after });
});

test("opens exactly the pinned workflow_id + revision_id, read-only: nothing is published, saved or read as latest", async () => {
  const store = makeStore(["caller_complete_rev2_get", "wf_get_after_2"]);
  await open("caller-complete-rev2");
  await openCall();
  await screen.findByText(`revision 2`, { exact: false });
  const before = store.version.mock.calls.length;
  openPinned();
  await waitFor(() => expect(pinnedView()).not.toBeNull());

  expect(viewReads(store, before)).toEqual([["wf-summarize", REV2]]);
  /* The Workflow's own draft is never read: the view is the revision. */
  expect(store.get.mock.calls.map(([id]) => id)).not.toContain("wf-summarize");
  expect(store.publish).not.toHaveBeenCalled();
  expect(store.save).not.toHaveBeenCalled();

  const crumbs = screen.getByTestId("skeleton-drill-crumbs");
  expect(crumbs).toHaveTextContent("caller-complete-rev2");
  expect(crumbs).toHaveTextContent("Workflow Call · call");
  expect(crumbs).toHaveTextContent("Summarize · revision 2");
  expect(screen.getByTestId("workflow-pinned-caption")).toHaveTextContent(`Read-only: revision 2 of Summarize · ${REV2}`);

  /* Read-only: no palette, no Save/Undo/Run, and pressing a node opens no editor. */
  expect(screen.queryByTestId("skeleton-control-center")).toBeNull();
  expect(screen.queryByRole("button", { name: "Save", exact: true })).toBeNull();
  openAddNode();
  expect(screen.queryByTestId("recipe-node-palette")).toBeNull();
  pressCanvasNode("end");
  expect(screen.getByTestId("skeleton-detail-panel-shell")).toHaveStyle({ pointerEvents: "none" });
  expect(screen.queryByTestId("skeleton-node-call")).toBeNull();
});

test("going back keeps the unsaved edit, the open panel, the selection and the viewport; Save then writes only that edit", async () => {
  const store = makeStore(["caller_complete_rev2_get"]);
  writeSkeletonViewport("caller-complete-rev2", { x: 37, y: -12, zoom: 0.8 });
  await open("caller-complete-rev2");
  await openCall();
  await screen.findByText(`revision 2`, { exact: false });
  setValue("limit", "7");
  expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent("Unsaved changes");

  openPinned();
  await waitFor(() => expect(pinnedView()).not.toBeNull());
  fireEvent.wheel(screen.getByTestId("skeleton-canvas"), { deltaY: 120 });
  /* Undo is the editor's, and the editor is not on screen. */
  fireEvent.keyDown(window, { key: "z", metaKey: true });

  fireEvent.keyDown(window.document, { key: "Escape" });
  await waitFor(() => expect(pinnedView()).toBeNull());
  expect(screen.getByTestId("skeleton-detail-panel-shell")).toHaveStyle({ pointerEvents: "auto" });
  expect(screen.getByTestId("workflow-call-section")).toBeInTheDocument();
  expect(within(screen.getByTestId("tool-call-argument-limit")).getByPlaceholderText("a value written here")).toHaveValue("7");
  expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent("Unsaved changes");
  expect(readSkeletonLayout("caller-complete-rev2", { nodes: [] }).viewport).toEqual({ x: 37, y: -12, zoom: 0.8 });
  /* The view's drawing is kept under its own key, never the editor's. */
  expect(pinned_view_key({ workflow_id: "wf-summarize", revision_id: REV2 })).not.toBe("caller-complete-rev2");

  fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }));
  await waitFor(() => expect(store.save).toHaveBeenCalledTimes(1));
  const edit = store.save.mock.calls[0][0];
  const call = edit.document.nodes.find((node) => node.id === "call");
  expect(call.config.workflow).toEqual({ workflow_id: "wf-summarize", revision_id: REV2 });
  expect(call.config.execution.inputs.find((input) => input.name === "limit").value).toEqual({ kind: "literal", value: "7" });
});

test("the breadcrumb goes back too, to the same open panel, with nothing written", async () => {
  makeStore(["caller_complete_rev2_get"]);
  await open("caller-complete-rev2");
  await openCall();
  await screen.findByText(`revision 2`, { exact: false });
  openPinned();
  await waitFor(() => expect(pinnedView()).not.toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "Back to caller-complete-rev2" }));
  await waitFor(() => expect(pinnedView()).toBeNull());
  expect(screen.queryByTestId("skeleton-drill-breadcrumb")).toBeNull();
  expect(screen.getByTestId("workflow-call-section")).toBeInTheDocument();
  expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent(/^Saved$/);
});

test("a re-pinned call opens the new revision; a late answer about the old pin opens nothing", async () => {
  const store = makeStore(["caller_complete_rev2_get"]);
  await open("caller-complete-rev2");
  await openCall();
  await screen.findByText(`revision 2`, { exact: false });

  /* Ask for revision 2, and hold the answer. */
  const held = deferred();
  store.gate = (id, rev) => (rev === REV2 ? held.promise : undefined);
  openPinned();
  /* Meanwhile the author pins revision 1 by its id. */
  store.gate = null;
  fireEvent.change(screen.getByPlaceholderText("or a revision id, e.g. rev-2-…"), { target: { value: REV1 } });
  fireEvent.click(screen.getByRole("button", { name: "Pin this revision" }));
  await screen.findByText(/Pinned revision 1\./);

  /* The old answer lands: it is about a pin this node no longer holds. */
  await act(async () => { held.resolve(); });
  expect(pinnedView()).toBeNull();
  expect(screen.getByTestId("skeleton-drill-notice")).toHaveTextContent("The pin changed while its revision was being read");

  /* Opening now reads and shows revision 1. */
  const before = store.version.mock.calls.length;
  openPinned();
  await waitFor(() => expect(pinnedView()).not.toBeNull());
  expect(viewReads(store, before)).toEqual([["wf-summarize", REV1]]);
  expect(screen.getByTestId("skeleton-drill-crumbs")).toHaveTextContent("Summarize · revision 1");
  expect(store.publish).not.toHaveBeenCalled();
});

test("of two opens in flight only the last one may show; the first answer, arriving last, is dropped", async () => {
  const store = makeStore(["caller_complete_rev2_get"]);
  await open("caller-complete-rev2");
  await openCall();
  await screen.findByText(`revision 2`, { exact: false });
  const first = deferred();
  const second = deferred();
  const queue = [first, second];
  store.gate = () => queue.shift().promise;
  openPinned();
  openPinned();
  await act(async () => { second.resolve(); });
  await waitFor(() => expect(pinnedView()).not.toBeNull());
  fireEvent.keyDown(window.document, { key: "Escape" });
  await waitFor(() => expect(pinnedView()).toBeNull());
  await act(async () => { first.resolve(); });
  expect(pinnedView()).toBeNull();
  expect(screen.queryByTestId("skeleton-drill-notice")).toBeNull();
});

test("a revision that cannot be read opens nothing and says why; the editor is untouched", async () => {
  const store = makeStore(["caller_revision_missing_get"]);
  await open("caller-revision-missing");
  await openCall();
  await screen.findByRole("button", OPEN);
  openPinned();
  await waitFor(() => expect(screen.getByTestId("skeleton-drill-notice")).toHaveTextContent("The pinned revision could not be read"));
  expect(screen.getByTestId("skeleton-drill-notice")).toHaveTextContent(row("wf_version_missing").refusal.message);
  expect(pinnedView()).toBeNull();
  expect(screen.getByTestId("workflow-call-section")).toBeInTheDocument();
  expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent(/^Saved$/);
  expect(store.save).not.toHaveBeenCalled();
  expect(store.publish).not.toHaveBeenCalled();
});

test("a pinned revision with host-kept Code text draws that text from its own aggregate, not the caller's", async () => {
  const reply = g1_revision();
  const store = makeStore(["caller_complete_rev2_get"], {
    extraVersions: { [`${reply.version.workflow_id}\u0000${G1_REVISION}`]: reply },
  });
  const caller = store.held["caller-complete-rev2"];
  caller.resource.document.nodes.find((node) => node.id === "call").config.workflow = { workflow_id: reply.version.workflow_id, revision_id: G1_REVISION };
  await open("caller-complete-rev2");
  await openCall();
  await screen.findByText("revision 1", { exact: false });
  openPinned();
  await waitFor(() => expect(pinnedView()).not.toBeNull());
  expect(screen.getByTestId("code-node-score-block")).toHaveTextContent("def main(input, context):");
  expect(screen.queryByTestId("code-node-score-text-missing")).toBeNull();
  expect(screen.getByTestId("skeleton-drill-crumbs")).toHaveTextContent("G1 Root · revision 1");
  fireEvent.keyDown(window.document, { key: "Escape" });
  await waitFor(() => expect(pinnedView()).toBeNull());
  expect(store.save).not.toHaveBeenCalled();
});

test("without a pin there is nothing to open", async () => {
  makeStore(["caller_seed_get"]);
  await open("caller-seed");
  await openCall();
  expect(screen.queryByRole("button", OPEN)).toBeNull();
});

/* Escape from the pinned read-only view inside the real Modal that closes the
   Agents Builder (#357): the view is the top layer, even when the value box
   behind it still has focus. */
test.each([["nothing focused", false], ["the value box still focused", true]])(
  "Escape from the pinned view (%s) leaves the view only: the Builder and the unsaved value stay; nothing is saved",
  async (_label, focusBox) => {
    const store = makeStore(["caller_complete_rev2_get"]);
    const onClose = jest.fn();
    render(<ConfigContext.Provider value={{ theme: {} }}><Modal open onClose={onClose}><SkeletonResourcePage resourceId="caller-complete-rev2" /></Modal></ConfigContext.Provider>);
    await screen.findByTestId("skeleton-node-start");
    await openCall();
    await screen.findByText(`revision 2`, { exact: false });
    setValue("limit", "7");
    const box = within(screen.getByTestId("tool-call-argument-limit")).getByPlaceholderText("a value written here");
    if (focusBox) box.focus();
    openPinned();
    await waitFor(() => expect(pinnedView()).not.toBeNull());
    fireEvent.keyDown(document.activeElement || document.body, { key: "Escape" });
    await waitFor(() => expect(pinnedView()).toBeNull());
    expect(onClose).not.toHaveBeenCalled();
    expect(within(screen.getByTestId("tool-call-argument-limit")).getByPlaceholderText("a value written here")).toHaveValue("7");
    expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent("Unsaved changes");
    expect(store.save).not.toHaveBeenCalled();
  },
);

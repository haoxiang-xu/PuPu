import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import SkeletonResourcePage from "./skeleton_resource_page";
import Modal from "../../../BUILTIN_COMPONENTs/modal/modal";
import { api } from "../../../SERVICEs/api";
import capture from "../../../SERVICEs/managed_hook_source_capture.json";
import workflowCapture from "../../../SERVICEs/skeleton_hook_workflow_capabilities_capture.json";
import enableCapture from "../../../SERVICEs/skeleton_hook_capabilities_capture.json";
import toolSetCapture from "../../../SERVICEs/skeleton_hook_tool_set_capabilities_capture.json";
import pinnedCapture from "./recipes_page/hook_tool_set_capture.json";
import toolCapture from "./recipes_page/tool_call_capture.json";
import codeCapture from "./recipes_page/code_capture.json";
import { code_node_at, managed_path, sha256_text } from "./recipes_page/managed_code_sources";
import { forget_workflow_versions } from "./recipes_page/workflow_versions";
import { pressCanvasNode } from "./recipes_page/skeleton_canvas_test_helpers";

/* #357 a hook's own Workflow on the real page: SkeletonResourcePage, the
 * Hooks Pool section, the drill, the Workflow canvas, the Code panel and
 * Save. Only the renderer facade is replaced. Every resource answer is the
 * real combined producer's (c5c01351 / 3a79 wheel, managed_hook_source_capture
 * = managed-import-execution-01 out/owned-producer.json): `saved` is the real
 * v2 aggregate the Store answered. A Save is answered by the strict in-test
 * store of the G1 page test, which projects the edit the way the host does;
 * whether the real store takes these exact requests is the combined pair's
 * replay, not this test's. The capability is the sidecar's own reply. */

jest.mock("../../../SERVICEs/api", () => ({ api: { unchain: {} } }));

const copy = (value) => JSON.parse(JSON.stringify(value));
const caseOf = (name) => copy(capture.cases.find((item) => item.name === name).saved);
const CATALOG = JSON.parse(toolCapture.catalog_v2.body_text);
const HOOK_CODE = ["nodes", 3, "config", "hooks", 0, "workflow", "document", "nodes", 1];
const CHILD = (j) => ["nodes", 4, "config", "subagents", j, "source", "document", "nodes", 3, "config", "hooks", 0, "workflow", "document", "nodes", 1];

function rank(a, b) {
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const ta = typeof a[index] === "string" ? 0 : 1;
    const tb = typeof b[index] === "string" ? 0 : 1;
    if (ta !== tb) return ta - tb;
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return a.length - b.length;
}

/* The G1 page test's strict store: closed v2 edit, compare-and-set (a new id
   needs a null token, an existing one its own), each bound node's source
   rewritten to its text's generated path, manifest in canonical order. */
function makeStore(replies) {
  const held = Object.create(null);
  replies.forEach((reply) => { held[reply.resource.id] = reply; });
  let revision = 10;
  const store = {
    held,
    get: jest.fn(async (id) => {
      if (!held[id]) throw Object.assign(new Error("Skeleton resource was not found."), { code: "resource_missing", path: ["resource_id"], status: 404 });
      return copy(held[id]);
    }),
    save: jest.fn(async (edit) => {
      expect(Object.keys(edit).sort()).toEqual(["document", "expected_edit_token", "managed_sources", "schema"]);
      expect(edit.schema).toBe("pupu.skeleton-edit.v2");
      const id = edit.document.id;
      if (edit.expected_edit_token !== (held[id] ? held[id].resource.edit_token : null)) {
        throw Object.assign(new Error("Resource changed in another editor."), { code: "edit_conflict", path: ["expected_edit_token"], status: 409 });
      }
      const document = copy(edit.document);
      const entries = [];
      const bodies = Object.create(null);
      edit.managed_sources.forEach((item) => {
        expect(Object.keys(item).sort()).toEqual(["node_path", "text"]);
        const node = code_node_at(document, item.node_path);
        expect(node).not.toBeNull();
        const sha = sha256_text(item.text);
        node.config.code = { ...node.config.code, source: { kind: "file", path: managed_path(sha) } };
        entries.push({ node_path: item.node_path, sha256: sha });
        bodies[sha] = item.text;
      });
      entries.sort((a, b) => rank(a.node_path, b.node_path));
      revision += 1;
      const before = held[id] ? held[id].resource : { kind: document.kind, name: document.name, description: "", archived: false, draft_digest: "d".repeat(64), source_identity: null };
      held[id] = {
        schema: "pupu.skeleton-resource.v2",
        resource: { ...before, id, kind: document.kind, name: document.name, document, edit_token: `edit-${revision}-test`, diagnostics: [] },
        sources_manifest: { schema: "pupu.skeleton-code-sources.v1", entries },
        contents: Object.keys(bodies).sort().map((sha) => ({ sha256: sha, text: bodies[sha] })),
        content_digest: "a".repeat(64),
      };
      return copy(held[id]);
    }),
  };
  api.unchain.getManagedSkeletonResource = store.get;
  api.unchain.saveManagedSkeletonResource = store.save;
  api.unchain.getManagedSkeletonWorkflowVersion = jest.fn(async (id, rev) => {
    const reply = pinnedCapture.rows.find((item) => item.case === "wf-hook-continue_version").reply;
    if (id === "wf-hook-continue" && rev === pinnedCapture.revision) return copy(reply);
    throw Object.assign(new Error("Workflow version was not found."), { code: "resource_missing", path: ["revision_id"], status: 404 });
  });
  return store;
}

let view;
const page = (id) => <ConfigContext.Provider value={{ theme: {} }}><SkeletonResourcePage resourceId={id} /></ConfigContext.Provider>;
async function open(id) {
  view = render(page(id));
  await screen.findByTestId("skeleton-node-start");
}
const openHook = async (index = 0) => {
  pressCanvasNode("hooks");
  await screen.findByTestId("hooks-pool-section");
  fireEvent.click(screen.getByRole("button", { name: `Edit hook ${index + 1}` }));
  await screen.findByTestId(`hook-${index}-editor`);
};
const save = async (store) => {
  const before = store.save.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }));
  await waitFor(() => expect(store.save.mock.calls.length).toBe(before + 1));
  await waitFor(() => expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent(/^Saved$/));
  return store.save.mock.calls.at(-1)[0];
};
const textOf = (edit, path) => edit.managed_sources.find((row) => JSON.stringify(row.node_path) === JSON.stringify(path))?.text;
const source = (index = 0) => within(screen.getByTestId(`hook-${index}-source`));
const saved = () => expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent(/^Saved$/);
const typeCode = async (text) => {
  pressCanvasNode("step");
  await screen.findByTestId("code-section");
  fireEvent.change(screen.getByRole("textbox", { name: "Code of step" }), { target: { value: text } });
};
const up = () => fireEvent.keyDown(window.document, { key: "Escape" });

beforeEach(() => {
  localStorage.clear();
  forget_workflow_versions();
  Object.keys(api.unchain).forEach((key) => delete api.unchain[key]);
  api.unchain.listSkeletonResources = jest.fn().mockResolvedValue({ resources: [] });
  api.unchain.listToolModalCatalog = jest.fn().mockResolvedValue(CATALOG);
  api.unchain.listSkeletonKernelProfiles = jest.fn().mockResolvedValue({ profiles: [], unavailable: [] });
  api.unchain.listSkeletonPythonProfiles = jest.fn().mockResolvedValue({ profiles: codeCapture.profiles.list_after });
  api.unchain.getSkeletonHookCapabilities = jest.fn().mockResolvedValue(copy(enableCapture));
  api.unchain.getSkeletonHookToolSetCapabilities = jest.fn().mockResolvedValue(copy(toolSetCapture));
  api.unchain.getSkeletonHookWorkflowCapabilities = jest.fn().mockResolvedValue(copy(workflowCapture));
});

test("open a hook's own Workflow on the canvas, edit its Code, go back, Save: only that text moves, at its full address; reopen keeps it", async () => {
  const base = caseOf("owned-hook");
  const original = base.contents[0].text;
  const store = makeStore([base]);
  await open("import-owned-hook");
  await openHook();
  expect(screen.getByTestId("hook-row-0")).toHaveTextContent("its own Workflow · Owned Hook");
  expect(screen.getByTestId("hook-0-own")).toHaveTextContent("Owned Hook · owned-hook");
  await waitFor(() => expect(source().getByRole("button", { name: "Open the Workflow of hook policy" })).not.toBeDisabled());
  fireEvent.click(source().getByRole("button", { name: "Open the Workflow of hook policy" }));
  await screen.findByTestId("skeleton-node-step");
  expect(screen.getByTestId("skeleton-drill-crumbs")).toHaveTextContent("Hooks Pool");
  expect(screen.getByTestId("skeleton-drill-save-target")).toHaveTextContent("Save writes");
  saved();

  await typeCode("def main(input, context):\n    return {\"decision\": \"continue\", \"require_approval\": False}\n");
  expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent("Unsaved changes");
  up();
  await screen.findByTestId("skeleton-node-hooks");
  const edit = await save(store);
  expect(edit.document.id).toBe("import-owned-hook");
  expect(edit.expected_edit_token).toBe(base.resource.edit_token);
  expect(edit.managed_sources.map((row) => row.node_path)).toEqual([HOOK_CODE]);
  expect(textOf(edit, HOOK_CODE)).toContain("\"require_approval\": False");
  expect(textOf(edit, HOOK_CODE)).not.toBe(original);
  /* Everything but the step's text is as it was. */
  const before = copy(base.resource.document);
  const after = copy(edit.document);
  code_node_at(before, HOOK_CODE).config.code.source = null;
  code_node_at(after, HOOK_CODE).config.code.source = null;
  expect(after).toEqual(before);

  view.unmount();
  await open("import-owned-hook");
  await openHook();
  await waitFor(() => expect(source().getByRole("button", { name: "Open the Workflow of hook policy" })).not.toBeDisabled());
  fireEvent.click(source().getByRole("button", { name: "Open the Workflow of hook policy" }));
  await screen.findByTestId("skeleton-node-step");
  pressCanvasNode("step");
  await screen.findByTestId("code-section");
  expect(screen.getByRole("textbox", { name: "Code of step" })).toHaveValue(textOf(edit, HOOK_CODE));
});

test("two embedded Agents each with a hook step of the same id: editing one leaves its sibling's text as stored", async () => {
  const base = caseOf("nested");
  const original = base.contents[0].text;
  const store = makeStore([base]);
  await open("import-nested-hooks");
  fireEvent.doubleClick(within(screen.getByTestId("skeleton-node-children")).getByTestId("pool-node-row-0"));
  await screen.findByTestId("skeleton-node-hooks");
  await openHook();
  await waitFor(() => expect(source().getByRole("button", { name: "Open the Workflow of hook policy" })).not.toBeDisabled());
  fireEvent.click(source().getByRole("button", { name: "Open the Workflow of hook policy" }));
  await screen.findByTestId("skeleton-node-step");
  await typeCode("def main(input, context):\n    return {\"decision\": \"continue\", \"require_approval\": True}  # one\n");
  up();
  up();
  await screen.findByTestId("skeleton-node-children");
  const edit = await save(store);
  expect(edit.managed_sources.map((row) => row.node_path)).toEqual([CHILD(0), CHILD(1)]);
  expect(textOf(edit, CHILD(0))).toContain("# one");
  expect(textOf(edit, CHILD(1))).toBe(original);
});

test("a hook's own Workflow keeps its text through a reorder of the run and a disable, and leaves the Save when the hook is removed", async () => {
  const base = caseOf("owned-hook");
  const original = base.contents[0].text;
  const store = makeStore([base]);
  await open("import-owned-hook");
  await openHook();
  /* Off: kept, with its text. */
  fireEvent.click(within(screen.getByTestId("hook-0-runs")).getByText("Off"));
  let edit = await save(store);
  expect(edit.document.nodes[3].config.hooks[0].enabled).toBe(false);
  expect(textOf(edit, HOOK_CODE)).toBe(original);
  /* Order: a write of its order, the text stays where it is. A Save hands
     the panel the stored version, so the editor is opened again. */
  await openHook();
  fireEvent.change(within(screen.getByTestId("hook-0-editor")).getByPlaceholderText("0 … 1,000,000"), { target: { value: "9" } });
  edit = await save(store);
  expect(edit.document.nodes[3].config.hooks[0].order).toBe(9);
  expect(textOf(edit, HOOK_CODE)).toBe(original);
  /* Removed: nothing of it is sent any more. */
  await openHook();
  fireEvent.click(screen.getByRole("button", { name: "Remove hook \"policy\"" }));
  edit = await save(store);
  expect(edit.document.nodes[3].config.hooks).toEqual([]);
  expect(edit.managed_sources).toEqual([]);
});

test("a pinned hook stays pinned until the author chooses its own Workflow; then a Start→End Workflow is written in place of the pin", async () => {
  const pinned = copy(pinnedCapture.rows.find((item) => item.case === "every_get").reply);
  const store = makeStore([pinned]);
  await open("agent-tool-every");
  await openHook();
  await waitFor(() => expect(source().getByText("Its own Workflow")).toBeInTheDocument());
  saved();
  /* Looking at the pin control writes nothing. */
  fireEvent.click(source().getByText("A pinned Workflow"));
  saved();
  fireEvent.click(source().getByText("Its own Workflow"));
  expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent("Unsaved changes");
  const edit = await save(store);
  const hook = edit.document.nodes.find((node) => node.id === "hooks").config.hooks[0];
  expect(Object.keys(hook.workflow).sort()).toEqual(["document", "kind"]);
  expect(hook.workflow.kind).toBe("embedded");
  expect(hook.workflow.document).toMatchObject({ schema_version: 1, kind: "workflow", id: "guard-workflow", name: "guard Workflow" });
  expect(hook.workflow.document.nodes.map((node) => node.type)).toEqual(["start", "end"]);
  /* Every other field of the hook is the stored one. */
  const stored = pinned.resource.document.nodes.find((node) => node.id === "hooks").config.hooks[0];
  expect({ ...hook, workflow: stored.workflow }).toEqual(stored);
  expect(edit.managed_sources).toEqual([]);
});

test("without the host's Hook Workflow contract, its own Workflow is not offered and a stored one is reported, not opened", async () => {
  api.unchain.getSkeletonHookWorkflowCapabilities = jest.fn().mockRejectedValue(Object.assign(new Error("This runtime does not support embedded Hook Workflows."), { code: "skeleton_hook_workflow_unavailable" }));
  makeStore([caseOf("owned-hook")]);
  await open("import-owned-hook");
  await openHook();
  expect(await screen.findByTestId("hook-0-source-note")).toHaveTextContent("not offered");
  expect(source().queryByText("Its own Workflow")).toBeNull();
  expect(source().getByRole("button", { name: "Open the Workflow of hook policy" })).toBeDisabled();
  expect(screen.getByTestId("hook-0-problems")).toHaveTextContent("this runtime has not confirmed it reads one");
  saved();
});

test("Save as a Workflow is a separate draft under the author's id, with the hook's Code text; the hook and the Agent are not changed", async () => {
  const base = caseOf("owned-hook");
  const store = makeStore([base]);
  await open("import-owned-hook");
  await openHook();
  fireEvent.click(source().getByRole("button", { name: "Save as a Workflow…" }));
  const form = within(screen.getByTestId("hook-0-save-as"));
  fireEvent.change(form.getByPlaceholderText("new Workflow id, e.g. redact-paths"), { target: { value: "policy-copy" } });
  fireEvent.change(form.getByPlaceholderText("its name"), { target: { value: "Policy copy" } });
  fireEvent.click(form.getByRole("button", { name: "Save the copy" }));
  await screen.findByText(/Saved a copy as the Workflow “policy-copy”/);
  expect(store.save).toHaveBeenCalledTimes(1);
  const [edit] = store.save.mock.calls[0];
  expect(edit.expected_edit_token).toBeNull();
  expect(edit.document).toMatchObject({ id: "policy-copy", name: "Policy copy", kind: "workflow" });
  expect(edit.managed_sources).toEqual([{ node_path: ["nodes", 1], text: base.contents[0].text }]);
  expect(store.held["import-owned-hook"]).toEqual(base);
  saved();
});

test("Save as a Workflow under an id the library already has is refused by the store and nothing is replaced", async () => {
  const base = caseOf("owned-hook");
  const other = caseOf("root");
  const store = makeStore([base, other]);
  await open("import-owned-hook");
  await openHook();
  fireEvent.click(source().getByRole("button", { name: "Save as a Workflow…" }));
  const form = within(screen.getByTestId("hook-0-save-as"));
  fireEvent.change(form.getByPlaceholderText("new Workflow id, e.g. redact-paths"), { target: { value: "import-root-code" } });
  fireEvent.click(form.getByRole("button", { name: "Save the copy" }));
  expect(await screen.findByTestId("hook-0-save-as-state")).toHaveTextContent("Nothing was saved");
  expect(screen.getByTestId("hook-0-save-as-state")).toHaveTextContent("edit_conflict");
  expect(store.held["import-root-code"]).toEqual(other);
});

/* ── Escape inside the Builder (#357, packaged App run 41273700851) ─────────
   The page sits in the real Modal, whose window listener is what closes the
   Agents Builder. Escape is pressed where a person presses it: on the field
   that has focus. Nothing blurs the field first. */
describe("Escape never closes the Builder over an edit", () => {
  const inModal = (id, onClose) => <ConfigContext.Provider value={{ theme: {} }}><Modal open onClose={onClose}><SkeletonResourcePage resourceId={id} /></Modal></ConfigContext.Provider>;
  async function openInModal(id, onClose) {
    view = render(inModal(id, onClose));
    await screen.findByTestId("skeleton-node-start");
  }
  const escapeOn = (element) => fireEvent.keyDown(element, { key: "Escape" });
  const heldTexts = (store, id) => copy(store.held[id]);

  test("in a Code text box: the Builder, the box and its draft stay; nothing is saved", async () => {
    const base = caseOf("root");
    const store = makeStore([base]);
    const before = heldTexts(store, "import-root-code");
    const onClose = jest.fn();
    await openInModal("import-root-code", onClose);
    pressCanvasNode("code");
    await screen.findByTestId("code-section");
    const box = screen.getByRole("textbox", { name: "Code of code" });
    const draft = "def main(input, context):\n    return {\"rows\": 1}\n";
    fireEvent.change(box, { target: { value: draft } });
    box.focus();
    expect(document.activeElement).toBe(box);
    escapeOn(box);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId("skeleton-node-start")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Code of code" })).toHaveValue(draft);
    expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent("Unsaved changes");
    expect(store.save).not.toHaveBeenCalled();
    expect(heldTexts(store, "import-root-code")).toEqual(before);
  });

  test("in a hook's own Workflow, in its Code text box: still in the drill, the draft stays; nothing is saved", async () => {
    const base = caseOf("owned-hook");
    const store = makeStore([base]);
    const before = heldTexts(store, "import-owned-hook");
    const onClose = jest.fn();
    await openInModal("import-owned-hook", onClose);
    await openHook();
    await waitFor(() => expect(source().getByRole("button", { name: "Open the Workflow of hook policy" })).not.toBeDisabled());
    fireEvent.click(source().getByRole("button", { name: "Open the Workflow of hook policy" }));
    await screen.findByTestId("skeleton-node-step");
    const draft = "def main(input, context):\n    return {\"decision\": \"continue\", \"require_approval\": True}  # draft\n";
    await typeCode(draft);
    const box = screen.getByRole("textbox", { name: "Code of step" });
    box.focus();
    escapeOn(box);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId("skeleton-drill-crumbs")).toHaveTextContent("Hooks Pool");
    expect(screen.getByRole("textbox", { name: "Code of step" })).toHaveValue(draft);
    expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent("Unsaved changes");
    expect(store.save).not.toHaveBeenCalled();
    expect(heldTexts(store, "import-owned-hook")).toEqual(before);
  });

  test("with an unsaved edit and nothing focused: the Builder stays and says why; nothing is saved", async () => {
    const base = caseOf("root");
    const store = makeStore([base]);
    const onClose = jest.fn();
    await openInModal("import-root-code", onClose);
    pressCanvasNode("code");
    await screen.findByTestId("code-section");
    fireEvent.change(screen.getByRole("textbox", { name: "Code of code" }), { target: { value: "x = 2\n" } });
    expect(document.activeElement).toBe(document.body);
    escapeOn(document.body);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId("skeleton-escape-unsaved")).toHaveTextContent("Unsaved changes");
    expect(screen.getByRole("textbox", { name: "Code of code" })).toHaveValue("x = 2\n");
    expect(store.save).not.toHaveBeenCalled();
  });

  test("control: with nothing unsaved, Escape closes the Builder as before", async () => {
    makeStore([caseOf("root")]);
    const onClose = jest.fn();
    await openInModal("import-root-code", onClose);
    saved();
    escapeOn(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

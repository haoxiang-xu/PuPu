import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import SkeletonResourcePage from "./skeleton_resource_page";
import Modal from "../../../BUILTIN_COMPONENTs/modal/modal";
import { api } from "../../../SERVICEs/api";
import capture from "./recipes_page/hook_tool_set_capture.json";
import enableCapture from "../../../SERVICEs/skeleton_hook_capabilities_capture.json";
import toolSetCapture from "../../../SERVICEs/skeleton_hook_tool_set_capabilities_capture.json";
import toolCapture from "./recipes_page/tool_call_capture.json";
import { forget_workflow_versions } from "./recipes_page/workflow_versions";
import { pressCanvasNode } from "./recipes_page/skeleton_canvas_test_helpers";

/* #357 Hook tool sets on the real page: SkeletonResourcePage, DetailPanel, the
 * Hooks Pool section, its SegmentedControl and multi Select, and Save. Only the
 * renderer facade is replaced. Every resource, revision and capability it
 * answers with is the real producer's (hook_tool_set_capture.json on the fixed
 * pair 447fe170, and the sidecar's own capability replies); the tool library is
 * tool_call_capture.json's. Whether the real store takes the exact Save
 * requests written here is the replay's job (hook-set-ui-01/tools/
 * replay_hook_set_ui.py), with HOOK_SET_PAYLOAD_DIR set. */

jest.mock("../../../SERVICEs/api", () => ({ api: { unchain: {} } }));

const fs = require("fs");
const copy = (value) => JSON.parse(JSON.stringify(value));
const row = (name) => copy(capture.rows.find((item) => item.case === name));
const CATALOG = JSON.parse(toolCapture.catalog_v2.body_text);
const exportPayload = (name, base, edit) => {
  if (process.env.HOOK_SET_PAYLOAD_DIR) fs.writeFileSync(`${process.env.HOOK_SET_PAYLOAD_DIR}/${name}.json`, JSON.stringify({ base, edit }, null, 2) + "\n");
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
  };
  api.unchain.getManagedSkeletonResource = store.get;
  api.unchain.saveManagedSkeletonResource = store.save;
  api.unchain.getManagedSkeletonWorkflowVersion = jest.fn(async (id, rev) => {
    if (id === "wf-hook-continue" && rev === capture.revision) return row("wf-hook-continue_version").reply;
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
const hooksOf = (document) => document.nodes.find((node) => node.id === "hooks").config.hooks;
const tool = (index = 0) => within(screen.getByTestId(`hook-${index}-tool`));
/* The tools are picked in the Tool Call's explorer: open the picker, open
   the toolkit's folder (folded by default), pick. A choice of the hook's own
   ("Every tool", a stored name the library no longer lists) sits on top. */
const lastList = () => {
  const lists = screen.getAllByRole("listbox", { hidden: true });
  return within(lists[lists.length - 1]);
};
const openPicker = (index = 0) => fireEvent.click(within(screen.getByTestId(`hook-${index}-tool-picker`)).getByRole("combobox"));
const addTool = (index, label, folder = "Core") => {
  openPicker(index);
  if (folder) fireEvent.click(lastList().getByText(folder, { exact: true }));
  fireEvent.click(lastList().getByText(label, { exact: true }));
};
const chips = (index = 0) => screen.queryByTestId(`hook-${index}-tool-set-names`);
const removeTool = (name) => fireEvent.click(screen.getByRole("button", { name: `Remove ${name}` }));
const saved = () => expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent(/^Saved$/);

beforeEach(() => {
  localStorage.clear();
  forget_workflow_versions();
  Object.keys(api.unchain).forEach((key) => delete api.unchain[key]);
  api.unchain.listSkeletonResources = jest.fn().mockResolvedValue(row("list_active").reply);
  api.unchain.listToolModalCatalog = jest.fn().mockResolvedValue(CATALOG);
  api.unchain.listSkeletonKernelProfiles = jest.fn().mockResolvedValue({ profiles: [], unavailable: [] });
  api.unchain.listSkeletonPythonProfiles = jest.fn().mockResolvedValue({ profiles: [] });
  api.unchain.getSkeletonHookCapabilities = jest.fn().mockResolvedValue(copy(enableCapture));
  api.unchain.getSkeletonHookToolSetCapabilities = jest.fn().mockResolvedValue(copy(toolSetCapture));
});

test("a single stored name opens as its one chip; adding a tool writes the set; Save, reopen", async () => {
  const store = makeStore(["single"]);
  const base = row("single_get").reply.resource.document;
  await open("agent-tool-single");
  await openHook();
  /* Opening writes nothing. */
  await waitFor(() => expect(chips()).toHaveTextContent("Read"));
  saved();
  addTool(0, "Write");
  expect(screen.getByTestId("hook-row-0")).toHaveTextContent("read, write");
  const edit = await save(store);
  expect(hooksOf(edit.document)).toEqual([{ ...hooksOf(base)[0], tool_name: ["read", "write"] }]);
  expect(edit.document.nodes.filter((node) => node.id !== "hooks")).toEqual(base.nodes.filter((node) => node.id !== "hooks"));
  exportPayload("01-single-to-set", "single_get", edit);

  view.unmount();
  await open("agent-tool-single");
  await openHook();
  await waitFor(() => expect(chips()).toHaveTextContent("ReadWrite"));
  expect(screen.queryByTestId("hook-0-problems")).toBeNull();
});

test("a stored name not in the library is kept and said; removing the last tool writes nothing", async () => {
  const store = makeStore(["set_not_in_library"]);
  await open("agent-tool-set-not-in-library");
  await openHook();
  await waitFor(() => expect(chips()).toHaveTextContent("legacy_tool (not in the tool library now)"));
  removeTool("read");
  const edit = await save(store);
  expect(hooksOf(edit.document)[0].tool_name).toEqual(["legacy_tool"]);
  exportPayload("02-keep-unlisted", "set_not_in_library_get", edit);
  /* After Save the editor is closed (as for every hook edit); open it again. */
  if (!screen.queryByTestId("hook-0-editor")) fireEvent.click(screen.getByRole("button", { name: "Edit hook 1" }));
  await screen.findByTestId("hook-0-tool-set-names");
  removeTool("legacy_tool");
  expect(screen.getByTestId("hook-0-tool-set-held")).toHaveTextContent("A set needs at least one tool. Nothing is stored until you pick one");
  saved();
  expect(screen.getByTestId("hook-row-0")).toHaveTextContent("legacy_tool");
});

test.each([
  ["set_empty", "[]", "This set of tools is empty"],
  ["set_duplicate", '["read","read"]', "is in the set twice"],
  ["set_python_space", '["read","\\u001c"]', "not a tool name"],
])("%s is shown as stored, said, and replaced only by a pick", async (name, rawText, problem) => {
  const store = makeStore([name]);
  await open(`agent-tool-${name.replace(/_/g, "-")}`);
  await openHook();
  await waitFor(() => expect(screen.getByTestId("hook-0-problems")).toHaveTextContent(problem));
  expect(screen.getByTestId("hook-0-tool-stored")).toHaveTextContent(`Stored: ${rawText}`);
  expect(screen.getByTestId("hook-row-0")).toHaveTextContent("1 to fix");
  saved();
  addTool(0, "Write");
  const edit = await save(store);
  expect(hooksOf(edit.document)[0].tool_name).toEqual(["write"]);
  exportPayload(`03-replace-${name}`, `${name}_get`, edit);
});

test("only this hook's tool_name changes: on/off, order, Workflow and the other hook stay", async () => {
  const store = makeStore(["set_with_enabled_and_order"]);
  const base = row("set_with_enabled_and_order_get").reply.resource.document;
  await open("agent-tool-set-with-enabled-and-order");
  await openHook(0);
  await waitFor(() => expect(chips()).toHaveTextContent("Read"));
  addTool(0, "Write");
  const edit = await save(store);
  expect(hooksOf(edit.document)[0]).toEqual({ ...hooksOf(base)[0], tool_name: ["read", "write"] });
  expect(hooksOf(edit.document)[0].enabled).toBe(true);
  expect(hooksOf(edit.document)[1]).toEqual(hooksOf(base)[1]);
  exportPayload("04-set-keeps-the-rest", "set_with_enabled_and_order_get", edit);
});

test("Every tool replaces a set only when chosen", async () => {
  const store = makeStore(["set"]);
  await open("agent-tool-set");
  await openHook();
  await waitFor(() => expect(chips()).toHaveTextContent("Read"));
  saved();
  addTool(0, "Every tool", null);
  const edit = await save(store);
  expect(hooksOf(edit.document)[0].tool_name).toBeNull();
  exportPayload("05-set-to-every", "set_get", edit);
});

test("without the tool-set contract nothing is guessed: no set, the stored set is shown raw, and on/off and order still work", async () => {
  const store = makeStore(["set"]);
  api.unchain.getSkeletonHookToolSetCapabilities = jest.fn().mockRejectedValue(Object.assign(new Error("This runtime does not support exact Hook tool sets."), { code: "skeleton_hook_tool_set_unavailable" }));
  await open("agent-tool-set");
  await openHook();
  await waitFor(() => expect(screen.getByTestId("hook-0-problems")).toHaveTextContent("Whether the run accepts it cannot be checked here"));
  expect(screen.getByTestId("hook-0-problems")).toHaveTextContent("skeleton_hook_tool_set_unavailable");
  expect(chips()).toBeNull();
  expect(screen.getByTestId("hook-0-tool-stored")).toHaveTextContent('Stored: ["read","write"]');
  saved();
  /* The on/off contract is separate and still works. */
  fireEvent.click(screen.getByTestId("hook-0-runs"));
  const edit = await save(store);
  expect(hooksOf(edit.document)[0]).toEqual({ ...hooksOf(row("set_get").reply.resource.document)[0], enabled: false });
  if (!screen.queryByTestId("hook-0-editor")) fireEvent.click(screen.getByRole("button", { name: "Edit hook 1" }));
  expect(screen.getByRole("button", { name: "Move guard earlier on kernel" })).toBeInTheDocument();
});

/* R-HTS-01: a stored single name the runtime refuses (U+0085 is blank by
   Python's str.strip()) is not carried into a set; opening writes nothing. */
test("an invalid old single name is replaced by the first pick, not kept in the set", async () => {
  const store = makeStore(["single_python_space"]);
  await open("agent-tool-single-python-space");
  await openHook();
  await screen.findByTestId("hook-0-tool-picker");
  saved();
  expect(chips()).toBeNull();
  addTool(0, "Read");
  const edit = await save(store);
  expect(hooksOf(edit.document)[0].tool_name).toEqual(["read"]);
  expect(hooksOf(edit.document)[0]).toEqual({ ...hooksOf(row("single_python_space_get").reply.resource.document)[0], tool_name: ["read"] });
  exportPayload("06-repair-invalid-single", "single_python_space_get", edit);
});

/* R-HTS-02: U+FEFF is a valid exact name for the runtime; it is shown as the
   stored choice, said to be outside the library, and nothing is written. */
test("a valid U+FEFF single name is shown as the stored choice", async () => {
  const store = makeStore(["single_bom"]);
  await open("agent-tool-single-bom");
  await openHook();
  await waitFor(() => expect(chips()).toHaveTextContent("(not in the tool library now)"));
  expect(screen.queryByTestId("hook-0-problems")).toBeNull();
  saved();
  expect(store.save).not.toHaveBeenCalled();
  expect(hooksOf(row("single_bom_get").reply.resource.document)[0].tool_name).toBe("﻿");
});

/* Escape with the tool list open, inside the real Modal that closes the
   Agents Builder (#357, run 41272967179): the list is the top layer. */
test("Escape with the tool list open closes the list only: the Builder, the picks and the draft stay; nothing is saved", async () => {
  const store = makeStore(["single"]);
  const before = copy(store.held["agent-tool-single"]);
  const onClose = jest.fn();
  view = render(<ConfigContext.Provider value={{ theme: {} }}><Modal open onClose={onClose}><SkeletonResourcePage resourceId="agent-tool-single" /></Modal></ConfigContext.Provider>);
  await screen.findByTestId("skeleton-node-start");
  await openHook();
  await waitFor(() => expect(chips()).toHaveTextContent("Read"));
  addTool(0, "Write");
  openPicker(0);
  expect(screen.queryAllByRole("listbox", { hidden: true }).length).toBeGreaterThan(0);
  fireEvent.keyDown(document.activeElement || document.body, { key: "Escape" });
  await waitFor(() => expect(screen.queryAllByRole("listbox", { hidden: true })).toHaveLength(0));
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByTestId("hook-0-editor")).toBeInTheDocument();
  expect(screen.getByTestId("hook-row-0")).toHaveTextContent("read, write");
  expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent("Unsaved changes");
  expect(store.save).not.toHaveBeenCalled();
  expect(store.held["agent-tool-single"]).toEqual(before);
});

/* The tool library is open-ended. In a 300px Hooks panel the unbounded list
   opened upward past the window's top edge (packaged App run 41329960253), so
   the tool picker carries the bound the Builder's other library pickers use
   (Kernel model, Skill Read, Tool Call): min(280px, 40vh), scrolling inside. */
test("the list of the tool library is bounded and scrolls inside", async () => {
  makeStore(["single"]);
  await open("agent-tool-single");
  await openHook();
  await screen.findByTestId("hook-0-tool-picker");
  openPicker(0);
  const lists = screen.getAllByRole("listbox", { hidden: true });
  const list = lists[lists.length - 1];
  expect(list.style.maxHeight).toBe("min(280px, 40vh)");
  expect(list.style.overflowY).toBe("auto");
});

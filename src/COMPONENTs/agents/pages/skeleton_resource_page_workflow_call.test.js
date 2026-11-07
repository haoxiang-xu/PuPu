import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import SkeletonResourcePage from "./skeleton_resource_page";
import { api } from "../../../SERVICEs/api";
import capture from "./recipes_page/workflow_call_capture.json";
import codeCapture from "./recipes_page/code_capture.json";
import { forget_workflow_versions } from "./recipes_page/workflow_versions";
import { openAddNode, pressCanvasNode } from "./recipes_page/skeleton_canvas_test_helpers";

/* #357 Workflow Call on the real page: SkeletonResourcePage, FlowEditor,
 * DetailPanel, Select, Input, the argument rows and the Output Variables.
 * Only the renderer facade is replaced, with its v2 methods and the library
 * listing; every resource, revision, publication and refusal it answers with
 * is the real producer's (workflow_call_capture.json). A Save is answered by a
 * strict in-test store; whether the real store and the fixed sidecar take the
 * exact Save requests written here is the replay's job
 * (workflow-call-01/tools/replay_wfc_*), with WFC_PAYLOAD_DIR set. */

jest.mock("../../../SERVICEs/api", () => ({ api: { unchain: {} } }));

const fs = require("fs");
const copy = (value) => JSON.parse(JSON.stringify(value));
const row = (name) => copy(capture.rows.find((item) => item.case === name));
const refusal = (name) => {
  const { code, path, message, status } = row(name).refusal;
  return Object.assign(new Error(message), { code, path, status });
};
const REV1 = capture.rev1;
const REV2 = capture.rev2;
const profile = require("./recipes_page/skeleton_native_embedded_capture.json").rows[1].document.nodes[1].config.kernel.profile;
const exported = [];
const exportPayload = (name, base, edit) => {
  exported.push(name);
  if (process.env.WFC_PAYLOAD_DIR) fs.writeFileSync(`${process.env.WFC_PAYLOAD_DIR}/${name}.json`, JSON.stringify({ base, edit }, null, 2) + "\n");
};
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

/* The strict stand-in for a Save, as in the G1 page test: closed v2 edit,
   compare-and-set, the resource answered whole. These callers hold no Code
   text, so the edit's set is empty. */
function makeStore(names) {
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
  const store = {
    held,
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
      const reply = versions[`${id}\u0000${rev}`];
      if (!reply) throw refusal("wf_version_missing");
      return copy(reply);
    }),
    publish: jest.fn(async (id, token) => {
      expect([id, token]).toEqual(["wf-summarize", row("wf_get_after_2").reply.resource.edit_token]);
      return row("wf_publish_2").reply;
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
const openCall = async (id = "call") => {
  pressCanvasNode(id);
  await screen.findByTestId("workflow-call-section");
};
/* jsdom reports the popover list as visibility:hidden (see the Code page test). */
const choose = (container, label, which = 0) => {
  fireEvent.click(within(container).getAllByRole("combobox")[which]);
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
const callOf = (document) => document.nodes.find((node) => node.type === "workflow_call");
const setVariable = (name, label) => {
  const argument = screen.getByTestId(`tool-call-argument-${name}`);
  fireEvent.click(within(argument).getByText("Variable"));
  choose(screen.getByTestId(`tool-call-argument-${name}`), label);
};
const setValue = (name, text) => {
  const argument = screen.getByTestId(`tool-call-argument-${name}`);
  fireEvent.click(within(argument).getByText("Value"));
  fireEvent.change(within(screen.getByTestId(`tool-call-argument-${name}`)).getByPlaceholderText("a value written here"), { target: { value: text } });
};

beforeEach(() => {
  localStorage.clear();
  forget_workflow_versions();
  Object.keys(api.unchain).forEach((key) => delete api.unchain[key]);
  api.unchain.listSkeletonResources = jest.fn().mockResolvedValue(row("list_active").reply);
  api.unchain.listSkeletonKernelProfiles = jest.fn().mockResolvedValue({ profiles: [profile], unavailable: [] });
  api.unchain.listSkeletonPythonProfiles = jest.fn().mockResolvedValue({ profiles: codeCapture.profiles.list_after });
});

afterAll(() => {
  if (process.env.WFC_PAYLOAD_DIR) fs.writeFileSync(`${process.env.WFC_PAYLOAD_DIR}/index.json`, JSON.stringify(exported, null, 2) + "\n");
});

test("choose a Workflow, publish its draft and pin that revision, fill the inputs its Start reads, export what its End gives, Save, reopen", async () => {
  const store = makeStore(["caller_seed_get", "wf_get_after_2"]);
  await open("caller-seed");
  expect(screen.getByTestId("workflow-call-node-call-revision")).toHaveTextContent("pin a revision");
  await openCall();
  expect(screen.getByTestId("workflow-call-problems")).toHaveTextContent("Choose a Workflow and pin");
  await waitFor(() => expect(within(screen.getByTestId("workflow-call-picker")).getByRole("combobox")).not.toBeDisabled());
  choose(screen.getByTestId("workflow-call-picker"), "Summarize · 2 published");
  /* Choosing writes nothing: a reference is only ever a pinned revision. */
  expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent(/^Saved$/);
  fireEvent.click(screen.getByRole("button", { name: "Publish its current draft and pin it" }));
  await screen.findByText(/Pinned revision 2\./);
  expect(store.publish).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId("workflow-call-pinned")).toHaveTextContent(`revision 2 of Summarize · ${REV2}`);

  /* Its Start reads `message` and `limit`; both are required, nothing else is offered. */
  expect(screen.getByTestId("workflow-call-problems")).toHaveTextContent("reads “message”");
  expect(screen.getByTestId("tool-call-argument-message")).toHaveTextContent("its Start reads it as text");
  expect(screen.getByTestId("tool-call-argument-limit")).toHaveTextContent("its Start reads it as n");
  setVariable("message", "start · message");
  setValue("limit", "3");
  expect(screen.queryByTestId("workflow-call-problems")).toBeNull();
  expect(screen.getByTestId("workflow-call-exports")).toHaveTextContent("summary, count, echo");

  /* The Output Variables pick from exactly its End's exports. */
  fireEvent.click(screen.getByText("+ Add output"));
  choose(screen.getByTestId("output-row-0"), "What this node produced", 0);
  choose(screen.getByTestId("output-row-0"), "summary", 1);
  fireEvent.change(within(screen.getByTestId("output-row-0")).getByPlaceholderText("name"), { target: { value: "summary" } });

  expect(screen.getByTestId("workflow-call-node-call-revision")).toHaveTextContent("revision 2");
  expect(screen.getByTestId("workflow-call-node-call-exports")).toHaveTextContent("summary, count, echo");
  const edit = await save(store);
  expect(edit.expected_edit_token).toBe(row("caller_seed_get").reply.resource.edit_token);
  expect(callOf(edit.document).config).toEqual({
    execution: {
      inputs: [
        { name: "message", value: { kind: "ref", node_id: "start", path: ["message"] }, missing: "error" },
        { name: "limit", value: { kind: "literal", value: "3" }, missing: "error" },
      ],
      outputs: [{ name: "summary", source: { kind: "result", path: ["summary"] } }],
    },
    workflow: { workflow_id: "wf-summarize", revision_id: REV2 },
  });
  exportPayload("publish-and-pin", "caller_seed_get", edit);

  view.unmount();
  forget_workflow_versions();
  await open("caller-seed");
  await screen.findByText("revision 2", { exact: false });
  await openCall();
  expect(screen.getByTestId("workflow-call-pinned")).toHaveTextContent(`revision 2 of Summarize`);
  expect(store.version).toHaveBeenCalledWith("wf-summarize", REV2);
  expect(screen.queryByTestId("workflow-call-problems")).toBeNull();
});

test("a typed revision id is read back before it is pinned; one nobody published pins nothing", async () => {
  const store = makeStore(["caller_seed_get"]);
  await open("caller-seed");
  await openCall();
  await waitFor(() => expect(within(screen.getByTestId("workflow-call-picker")).getByRole("combobox")).not.toBeDisabled());
  choose(screen.getByTestId("workflow-call-picker"), "Summarize · 2 published");
  fireEvent.change(screen.getByPlaceholderText("or a revision id, e.g. rev-2-…"), { target: { value: "rev-9-0000000000000000" } });
  fireEvent.click(screen.getByRole("button", { name: "Pin this revision" }));
  await screen.findByText(/has no published revision “rev-9-0000000000000000”\. Nothing was pinned\./);
  expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent(/^Saved$/);

  fireEvent.change(screen.getByPlaceholderText("or a revision id, e.g. rev-2-…"), { target: { value: ` ${REV1} ` } });
  fireEvent.click(screen.getByRole("button", { name: "Pin this revision" }));
  await screen.findByText(/Pinned revision 1\./);
  expect(store.publish).not.toHaveBeenCalled();
  expect(screen.getByTestId("workflow-call-exports")).toHaveTextContent("summary, count");
  expect(screen.getByTestId("workflow-call-exports")).not.toHaveTextContent("echo");
  setValue("message", "hello");
  setValue("limit", "2");
  /* End reads call.summary, so the call has to export it. */
  fireEvent.click(screen.getByText("+ Add output"));
  choose(screen.getByTestId("output-row-0"), "What this node produced", 0);
  choose(screen.getByTestId("output-row-0"), "summary", 1);
  fireEvent.change(within(screen.getByTestId("output-row-0")).getByPlaceholderText("name"), { target: { value: "summary" } });
  const edit = await save(store);
  expect(callOf(edit.document).config.workflow).toEqual({ workflow_id: "wf-summarize", revision_id: REV1 });
  exportPayload("typed-pin", "caller_seed_get", edit);
});

test("stored rows the revision does not read are shown and removable; the missing ones are named", async () => {
  const store = makeStore(["caller_inputs_wrong_names_get"]);
  await open("caller-inputs-wrong-names");
  await openCall();
  await screen.findByTestId("workflow-call-extra-0");
  expect(screen.getByTestId("workflow-call-extra-0")).toHaveTextContent("text");
  expect(screen.getByTestId("workflow-call-extra-1")).toHaveTextContent("n");
  const problems = screen.getByTestId("workflow-call-problems").textContent;
  expect(problems).toContain("reads “message”");
  expect(problems).toContain("reads “limit”");
  expect(screen.getByTestId("workflow-call-node-call-input-message")).toHaveTextContent("missing");
  fireEvent.click(screen.getByRole("button", { name: "Remove stored input n" }));
  fireEvent.click(screen.getByRole("button", { name: "Remove stored input text" }));
  setVariable("message", "start · message");
  setVariable("limit", "start · message");
  expect(screen.queryByTestId("workflow-call-problems")).toBeNull();
  const edit = await save(store);
  expect(callOf(edit.document).config.execution.inputs.map((item) => item.name)).toEqual(["message", "limit"]);
  exportPayload("wrong-names-fixed", "caller_inputs_wrong_names_get", edit);
});

test("a publication that answers after the author chose another Workflow pins nothing", async () => {
  const store = makeStore(["caller_seed_get", "wf_get_after_2"]);
  const late = deferred();
  store.publish.mockImplementation(() => late.promise);
  await open("caller-seed");
  await openCall();
  await waitFor(() => expect(within(screen.getByTestId("workflow-call-picker")).getByRole("combobox")).not.toBeDisabled());
  choose(screen.getByTestId("workflow-call-picker"), "Summarize · 2 published");
  fireEvent.click(screen.getByRole("button", { name: "Publish its current draft and pin it" }));
  await waitFor(() => expect(store.publish).toHaveBeenCalledTimes(1));
  choose(screen.getByTestId("workflow-call-picker"), "Draft only · never published");
  await act(async () => {
    late.resolve(row("wf_publish_2").reply);
    await late.promise;
  });
  expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent(/^Saved$/);
  expect(screen.queryByTestId("workflow-call-pinned")).toBeNull();
});

test("a stale publication is refused by the host and pins nothing", async () => {
  const store = makeStore(["caller_seed_get", "wf_get_after_2"]);
  store.publish.mockRejectedValue(refusal("wf_publish_stale_token"));
  await open("caller-seed");
  await openCall();
  await waitFor(() => expect(within(screen.getByTestId("workflow-call-picker")).getByRole("combobox")).not.toBeDisabled());
  choose(screen.getByTestId("workflow-call-picker"), "Summarize · 2 published");
  fireEvent.click(screen.getByRole("button", { name: "Publish its current draft and pin it" }));
  await screen.findByText(/Nothing was pinned: Workflow changed before publication\./);
  expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent(/^Saved$/);
});

test("a new Workflow Call from the palette starts unpinned; preflight's refusal is said before Run", async () => {
  const store = makeStore(["caller_complete_get"]);
  await open("caller-complete");
  openAddNode();
  fireEvent.click(screen.getByTestId("palette-entry-workflow_call"));
  await screen.findByTestId("workflow-call-section");
  expect(screen.getByTestId("workflow-call-problems")).toHaveTextContent("Choose a Workflow and pin one of its published revisions.");
  const edit = await save(store);
  const added = edit.document.nodes.filter((node) => node.type === "workflow_call").find((node) => node.id !== "call");
  expect(added.config).toEqual({ execution: { inputs: [], outputs: [] } });
});

test("a host without the v2 revision read says the pin cannot be read; nothing falls back", async () => {
  makeStore(["caller_complete_get"]);
  delete api.unchain.getManagedSkeletonWorkflowVersion;
  api.unchain.getSkeletonWorkflowVersion = jest.fn();
  await open("caller-complete");
  await waitFor(() => expect(screen.getByTestId("workflow-call-node-call-revision")).toHaveTextContent("revision unreadable"));
  await openCall();
  expect(screen.getByTestId("workflow-call-problems")).toHaveTextContent("The pinned revision could not be read");
  expect(api.unchain.getSkeletonWorkflowVersion).not.toHaveBeenCalled();
});

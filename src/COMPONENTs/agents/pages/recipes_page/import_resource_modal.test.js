import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import ImportResourceModal from "./import_resource_modal";
import { import_occurrences, import_payload } from "./resource_import";
import { subscribeSkeletonLibraryRefresh } from "../../../../SERVICEs/skeleton_library_refresh";
import producer from "../../../../SERVICEs/managed_transfer_producer.json";
import codeCapture from "./code_capture.json";
import managedCapture from "./managed_code_capture.json";
import owned from "./owned_import_producer_capture.json";

/* #357 import with a local Python per Code step, on the real modal, the real
 * strict facade (`api.unchain` → managed_transfer_api) and the real store
 * wrappers. Only the preload bridge is replaced. Every transfer answer is the
 * real producer's (managed_transfer_producer.json, the sealed capture); the
 * two refusals are copied verbatim from the real binary run
 * (managed-source-import-01-20261030/out/binary-02). The profile rows are the
 * real Code-profile capture's shapes under the ids this import names. */

if (typeof global.TextDecoder === "undefined") global.TextDecoder = require("util").TextDecoder;

const copy = (value) => JSON.parse(JSON.stringify(value));
const CONFLICT = { code: "import_conflict", path: ["source_json", "document", "id"], message: "Resource id already exists with different graph or source content.", status: 409 };
const MISSING = { code: "profile_missing", path: ["runtime_bindings", 0, "environment_profile_id"], message: "Python profile was not found", status: 404 };
const profile = (id) => ({ ...copy(codeCapture.profiles.save_venv), id });
const PROFILES = [copy(codeCapture.profiles.list_before[0]), profile("local-python"), profile("foreign-python")];
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const file = (text, name = "managed-code.json") => new File([text], name, { type: "application/json" });

let bridge;
beforeEach(() => {
  bridge = {
    getManagedSkeletonTransferCapabilities: jest.fn(async () => copy(producer.capabilities)),
    importManagedSkeletonResource: jest.fn(async () => copy(producer.resource)),
    exportManagedSkeletonResource: jest.fn(),
    listSkeletonPythonProfiles: jest.fn(async () => ({ profiles: copy(PROFILES) })),
    saveSkeletonPythonProfile: jest.fn(async (payload) => ({ ...profile(payload.profile_id), probe: { ok: true, version: "3.12.10", implementation: "cpython" } })),
    saveManagedSkeletonResource: jest.fn(),
    saveSkeletonResource: jest.fn(),
  };
  window.unchainAPI = bridge;
});

function open(props = {}) {
  const onClose = jest.fn();
  const onImported = jest.fn();
  const view = render(
    <ConfigContext.Provider value={{ theme: {} }}>
      <ImportResourceModal open onClose={onClose} onImported={onImported} isDark={false} {...props} />
    </ConfigContext.Provider>,
  );
  return { view, onClose, onImported };
}
const pick = async (text, name) => {
  await waitFor(() => expect(screen.getByRole("button", { name: /Choose a(nother)? file/ })).not.toBeDisabled());
  fireEvent.change(screen.getByTestId("import-file-input"), { target: { files: [file(text, name)] } });
};
const choosePython = (index, id) => {
  fireEvent.click(within(screen.getByTestId(`import-runtime-${index}`)).getByRole("combobox"));
  const lists = screen.getAllByRole("listbox", { hidden: true });
  fireEvent.click(within(lists[lists.length - 1]).getByText(new RegExp(`^${id} ·`)));
};
const importButton = () => screen.getByRole("button", { name: /^Import(ing…)?$/ });
const noWrites = () => {
  expect(bridge.importManagedSkeletonResource).not.toHaveBeenCalled();
  expect(bridge.saveManagedSkeletonResource).not.toHaveBeenCalled();
  expect(bridge.saveSkeletonResource).not.toHaveBeenCalled();
};

test("the exported text goes back byte for byte with the one Python the author chose; the library is told", async () => {
  const announced = [];
  const off = subscribeSkeletonLibraryRefresh((payload) => announced.push(payload));
  const { onImported } = open();
  await pick(producer.export.source_json);
  await screen.findByTestId("import-preview");
  expect(screen.getByTestId("import-preview")).toHaveTextContent("Workflow Managed Code · managed-code");
  expect(screen.getByTestId("import-preview")).toHaveTextContent("1 Code step");
  expect(importButton()).toBeDisabled();
  await waitFor(() => expect(within(screen.getByTestId("import-runtime-0")).getByRole("combobox")).not.toBeDisabled());
  choosePython(0, "local-python");
  expect(importButton()).not.toBeDisabled();
  noWrites();
  fireEvent.click(importButton());
  await screen.findByTestId("import-done");
  expect(bridge.importManagedSkeletonResource).toHaveBeenCalledTimes(1);
  const [sent] = bridge.importManagedSkeletonResource.mock.calls[0];
  expect(sent).toEqual(producer.request);
  expect(sent.source_json).toBe(producer.export.source_json);
  expect(onImported).toHaveBeenCalledWith(producer.resource.resource);
  expect(announced).toEqual([{ reason: "imported", resource_id: "managed-code" }]);
  expect(screen.getByTestId("import-done-diagnostics")).toHaveTextContent("Imported means stored, not checked to run");
  off();
});

test("Python's own number lexemes survive: the text sent is the text read", async () => {
  bridge.importManagedSkeletonResource.mockRejectedValue(CONFLICT);
  open();
  await pick(producer.numeric_source_json);
  await screen.findByTestId("import-preview");
  await waitFor(() => expect(within(screen.getByTestId("import-runtime-0")).getByRole("combobox")).not.toBeDisabled());
  choosePython(0, "builtin");
  fireEvent.click(importButton());
  await screen.findByTestId("import-refusal");
  const [sent] = bridge.importManagedSkeletonResource.mock.calls[0];
  expect(sent.source_json).toBe(producer.numeric_source_json);
  ["1.0", "-0.0", "9007199254740993"].forEach((lexeme) => expect(sent.source_json).toContain(lexeme));
});

test("nothing is chosen for the author, not even a local Python with the exported name", async () => {
  open();
  await pick(producer.export.source_json);
  await screen.findByTestId("import-preview");
  await waitFor(() => expect(within(screen.getByTestId("import-runtime-0")).getByRole("combobox")).not.toBeDisabled());
  expect(screen.getByTestId("import-runtime-0")).toHaveTextContent("it used “foreign-python” where it was exported");
  expect(within(screen.getByTestId("import-runtime-0")).getByRole("combobox")).toHaveTextContent("choose a Python");
  expect(screen.getByTestId("import-pending")).toHaveTextContent("Choose a Python for 1 more step.");
  expect(importButton()).toBeDisabled();
  noWrites();
});

test("same id, other content: import_conflict is shown as it came, nothing retried or renamed", async () => {
  bridge.importManagedSkeletonResource.mockRejectedValue(CONFLICT);
  open();
  await pick(producer.export.source_json);
  await screen.findByTestId("import-preview");
  await waitFor(() => expect(within(screen.getByTestId("import-runtime-0")).getByRole("combobox")).not.toBeDisabled());
  choosePython(0, "local-python");
  fireEvent.click(importButton());
  const refusal = await screen.findByTestId("import-refusal");
  expect(refusal).toHaveTextContent("“managed-code” already exists here with different content. Nothing was changed");
  /* Renaming or archiving keeps the id, so neither is offered as a way out. */
  expect(refusal.textContent).not.toMatch(/rename|archive/i);
  expect(refusal).toHaveTextContent(`import_conflict · ["source_json","document","id"] · ${CONFLICT.message}`);
  expect(bridge.importManagedSkeletonResource).toHaveBeenCalledTimes(1);
  expect(bridge.saveManagedSkeletonResource).not.toHaveBeenCalled();
  expect(screen.queryByTestId("import-done")).toBeNull();
});

test("a missing local Python names the step it was chosen for, with the host's path", async () => {
  bridge.importManagedSkeletonResource.mockRejectedValue(MISSING);
  open();
  await pick(producer.export.source_json);
  await screen.findByTestId("import-preview");
  await waitFor(() => expect(within(screen.getByTestId("import-runtime-0")).getByRole("combobox")).not.toBeDisabled());
  choosePython(0, "local-python");
  fireEvent.click(importButton());
  const refusal = await screen.findByTestId("import-refusal");
  expect(refusal).toHaveTextContent("The Python chosen for code is not on this machine.");
  expect(refusal).toHaveTextContent(`profile_missing · ["runtime_bindings",0,"environment_profile_id"] · ${MISSING.message}`);
});

test("an import answering after another file was chosen does nothing to the new one", async () => {
  const held = deferred();
  bridge.importManagedSkeletonResource.mockReturnValueOnce(held.promise);
  const { onImported } = open();
  await pick(producer.export.source_json);
  await screen.findByTestId("import-preview");
  await waitFor(() => expect(within(screen.getByTestId("import-runtime-0")).getByRole("combobox")).not.toBeDisabled());
  choosePython(0, "local-python");
  fireEvent.click(importButton());
  await pick(producer.numeric_source_json, "numbers.json");
  await waitFor(() => expect(screen.getByTestId("import-file-name")).toHaveTextContent("numbers.json"));
  await act(async () => { held.resolve(copy(producer.resource)); });
  expect(screen.queryByTestId("import-done")).toBeNull();
  expect(onImported).not.toHaveBeenCalled();
  /* The new file starts with nothing chosen. Its own read may still be
     finishing, so wait for its preview rather than racing it. */
  await screen.findByTestId("import-preview");
  expect(within(await screen.findByTestId("import-runtime-0")).getByRole("combobox")).toHaveTextContent("choose a Python");
  expect(importButton()).toBeDisabled();
});

test("a refusal answering after Clear is not shown; a read answering after another file is dropped", async () => {
  const held = deferred();
  bridge.importManagedSkeletonResource.mockReturnValueOnce(held.promise);
  open();
  await pick(producer.export.source_json);
  await screen.findByTestId("import-preview");
  await waitFor(() => expect(within(screen.getByTestId("import-runtime-0")).getByRole("combobox")).not.toBeDisabled());
  choosePython(0, "local-python");
  fireEvent.click(importButton());
  fireEvent.click(screen.getByRole("button", { name: "Clear" }));
  await act(async () => { held.reject(CONFLICT); });
  expect(screen.queryByTestId("import-refusal")).toBeNull();
  expect(screen.queryByTestId("import-preview")).toBeNull();
});

test("closing with an import in flight: the late answer is ignored and nothing else is written", async () => {
  const held = deferred();
  bridge.importManagedSkeletonResource.mockReturnValueOnce(held.promise);
  const { onClose, onImported } = open();
  await pick(producer.export.source_json);
  await screen.findByTestId("import-preview");
  await waitFor(() => expect(within(screen.getByTestId("import-runtime-0")).getByRole("combobox")).not.toBeDisabled());
  choosePython(0, "local-python");
  fireEvent.click(importButton());
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onClose).toHaveBeenCalledTimes(1);
  await act(async () => { held.resolve(copy(producer.resource)); });
  expect(onImported).not.toHaveBeenCalled();
  expect(bridge.importManagedSkeletonResource).toHaveBeenCalledTimes(1);
});

test("choosing, reading and cancelling write nothing", async () => {
  const { onClose } = open();
  await pick(producer.export.source_json);
  await screen.findByTestId("import-preview");
  await waitFor(() => expect(within(screen.getByTestId("import-runtime-0")).getByRole("combobox")).not.toBeDisabled());
  choosePython(0, "local-python");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onClose).toHaveBeenCalledTimes(1);
  noWrites();
  expect(bridge.saveSkeletonPythonProfile).not.toHaveBeenCalled();
});

test("a file that is not UTF-8, not JSON, or another schema is refused with its reason and nothing is sent", async () => {
  open();
  await pick(new Uint8Array([0x7b, 0xff, 0xfe, 0x7d]), "bytes.json");
  expect(await screen.findByTestId("import-file-problem")).toHaveTextContent("not UTF-8 text");
  await pick("{ not json", "broken.json");
  await waitFor(() => expect(screen.getByTestId("import-file-problem")).toHaveTextContent("not JSON"));
  await pick(JSON.stringify({ schema: "pupu.skeleton-code-snapshot.v9", document: {} }), "future.json");
  await waitFor(() => expect(screen.getByTestId("import-file-problem")).toHaveTextContent("pupu.skeleton-code-snapshot.v9"));
  expect(screen.queryByTestId("import-preview")).toBeNull();
  noWrites();
});

test("a file over the host's advertised size is refused before it is read", async () => {
  const caps = copy(producer.capabilities);
  caps.file_bytes = 41943040;
  bridge.getManagedSkeletonTransferCapabilities.mockResolvedValue(caps);
  open();
  await waitFor(() => expect(screen.getByRole("button", { name: "Choose a file…" })).not.toBeDisabled());
  const big = file("x");
  Object.defineProperty(big, "size", { value: 41943041 });
  fireEvent.change(screen.getByTestId("import-file-input"), { target: { files: [big] } });
  expect(await screen.findByTestId("import-file-problem")).toHaveTextContent("at most 41943040");
  noWrites();
});

test("an old or mismatched host leaves import unavailable with its reason; there is no fallback", async () => {
  delete bridge.getManagedSkeletonTransferCapabilities;
  open();
  expect(await screen.findByTestId("import-unavailable")).toHaveTextContent("Import is not available here");
  expect(screen.getByRole("button", { name: "Choose a file…" })).toBeDisabled();
  noWrites();
});

test("a capability answer the strict reader refuses is unavailable too", async () => {
  const caps = copy(producer.capabilities);
  caps.binding_policy = "use-existing";
  bridge.getManagedSkeletonTransferCapabilities.mockResolvedValue(caps);
  open();
  expect(await screen.findByTestId("import-unavailable")).toHaveTextContent("Invalid managed source transfer response");
  noWrites();
});

test("naming a Python uses the existing registration, refreshes the list and selects nothing", async () => {
  open();
  await pick(producer.export.source_json);
  await screen.findByTestId("import-preview");
  await waitFor(() => expect(within(screen.getByTestId("import-runtime-0")).getByRole("combobox")).not.toBeDisabled());
  fireEvent.click(screen.getByRole("button", { name: "Name a Python…" }));
  const form = screen.getByTestId("import-runtime-add");
  fireEvent.change(within(form).getByPlaceholderText("profile name, e.g. pupu-tools"), { target: { value: "fresh" } });
  fireEvent.change(within(form).getByPlaceholderText("absolute path to its python"), { target: { value: "/opt/py/bin/python3" } });
  const lists = bridge.listSkeletonPythonProfiles.mock.calls.length;
  fireEvent.click(within(form).getByRole("button", { name: "Add" }));
  await screen.findByText(/fresh was added\./);
  expect(bridge.saveSkeletonPythonProfile).toHaveBeenCalledWith({ profile_id: "fresh", executable: "/opt/py/bin/python3" });
  await waitFor(() => expect(bridge.listSkeletonPythonProfiles.mock.calls.length).toBe(lists + 1));
  expect(within(screen.getByTestId("import-runtime-0")).getByRole("combobox")).toHaveTextContent("choose a Python");
  expect(importButton()).toBeDisabled();
  noWrites();
});

describe("occurrences are addresses, not ids", () => {
  const nested = copy(managedCapture.rows.find((row) => row.case === "nested_create").reply.resource.document);

  test("a root step and an embedded step with the same id are two choices, each with where it sits", () => {
    /* The real nested capture, with the embedded step given the root step's
       id — legal, since ids are only unique within one graph. */
    const same = copy(nested);
    same.nodes[5].config.subagents[0].source.document.nodes[1].id = "first";
    const found = import_occurrences(same);
    expect(found.map((item) => [item.node_id, item.node_path])).toEqual([
      ["first", ["nodes", 1]],
      ["second", ["nodes", 3]],
      ["first", ["nodes", 5, "config", "subagents", 0, "source", "document", "nodes", 1]],
    ]);
    expect(new Set(found.map((item) => item.key)).size).toBe(3);
    expect(found[0].inside).toEqual([]);
    expect(found[2].inside).toHaveLength(1);
  });

  test("a payload exists only when every occurrence is chosen, in listed order", () => {
    const found = import_occurrences(nested);
    const choices = Object.fromEntries(found.slice(1).map((item) => [item.key, "builtin"]));
    expect(import_payload("{}", found, choices)).toBeNull();
    choices[found[0].key] = "builtin";
    expect(import_payload("{}", found, choices).runtime_bindings.map((row) => row.node_path)).toEqual(found.map((item) => item.node_path));
  });
});

/* The combined pair (c5c01351): Code owned by an embedded Hook Workflow, and
 * by Hook Workflows inside two embedded Agents with the same step id. Every
 * answer is the real Store's (owned_import_producer_capture.json, copied
 * verbatim from managed-import-execution-01-20261030/out/owned-producer.json).
 * This is the import dialog over those captures, not an execution claim. */
describe("owned Hook Code, from the real combined producer", () => {
  const caseOf = (name) => copy(owned.cases.find((item) => item.name === name));

  test.each([
    ["root", [["code", []]]],
    ["owned-hook", [["step", ["hooks › hook policy"]]]],
    ["nested", [["step", ["children › one", "hooks › hook policy"]], ["step", ["children › two", "hooks › hook policy"]]]],
  ])("%s: every owned step is listed by address with where it sits", (name, expected) => {
    const found = import_occurrences(JSON.parse(caseOf(name).exported.source_json).document);
    expect(found.map((item) => [item.node_id, item.inside])).toEqual(expected);
    expect(found.map((item) => item.node_path)).toEqual(caseOf(name).payload.runtime_bindings.map((row) => row.node_path));
  });

  test.each(["root", "owned-hook", "nested"])("%s: the dialog sends the producer's exact import request", async (name) => {
    const item = caseOf(name);
    bridge.getManagedSkeletonTransferCapabilities.mockResolvedValue(copy(owned.capabilities));
    bridge.importManagedSkeletonResource.mockResolvedValue(copy(item.imported));
    open();
    await pick(item.exported.source_json, `${name}.json`);
    await screen.findByTestId("import-preview");
    const count = item.payload.runtime_bindings.length;
    for (let index = 0; index < count; index += 1) {
      await waitFor(() => expect(within(screen.getByTestId(`import-runtime-${index}`)).getByRole("combobox")).not.toBeDisabled());
      expect(importButton()).toBeDisabled();
      choosePython(index, item.payload.runtime_bindings[index].environment_profile_id);
    }
    fireEvent.click(importButton());
    await screen.findByTestId("import-done");
    const [sent] = bridge.importManagedSkeletonResource.mock.calls[0];
    expect(sent).toEqual(item.payload);
    expect(sent.source_json).toBe(item.exported.source_json);
  });

  test("the two same-id steps in the nested case are two separate choices", async () => {
    const item = caseOf("nested");
    bridge.getManagedSkeletonTransferCapabilities.mockResolvedValue(copy(owned.capabilities));
    open();
    await pick(item.exported.source_json, "nested.json");
    await screen.findByTestId("import-preview");
    await waitFor(() => expect(within(screen.getByTestId("import-runtime-0")).getByRole("combobox")).not.toBeDisabled());
    expect(screen.getByTestId("import-runtime-0")).toHaveTextContent("inside children › one › hooks › hook policy");
    expect(screen.getByTestId("import-runtime-1")).toHaveTextContent("inside children › two › hooks › hook policy");
    choosePython(0, "local-python");
    expect(importButton()).toBeDisabled();
    expect(screen.getByTestId("import-pending")).toHaveTextContent("Choose a Python for 1 more step.");
    noWrites();
  });
});

/* R-IUI-01 / R-IUI-02: a Python registration belongs to the form that sent
 * it as it was sent, and the Python list shows the newest read asked. The
 * independent probe (managed-import-ui-independent-01-20261030) covers the
 * old-success cases; these are the old-failure controls beside them. */
describe("registration and list replies only settle their own intent", () => {
  const ready = async () => {
    open();
    await pick(producer.export.source_json);
    await screen.findByTestId("import-preview");
    await waitFor(() => expect(within(screen.getByTestId("import-runtime-0")).getByRole("combobox")).not.toBeDisabled());
  };
  const fill = (name, executable) => {
    const form = screen.getByTestId("import-runtime-add");
    fireEvent.change(within(form).getByPlaceholderText("profile name, e.g. pupu-tools"), { target: { value: name } });
    fireEvent.change(within(form).getByPlaceholderText("absolute path to its python"), { target: { value: executable } });
  };
  /* The real Store's refusal of a relative executable (code_capture.json). */
  const REFUSED = copy(codeCapture.profiles.save_relative.refusal);

  test("an old registration failing after Cancel says nothing on the new form", async () => {
    const held = deferred();
    bridge.saveSkeletonPythonProfile.mockReturnValueOnce(held.promise);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Name a Python…" }));
    fill("qa-old", "/qa/python-a");
    fireEvent.click(within(screen.getByTestId("import-runtime-add")).getByRole("button", { name: "Add" }));
    fireEvent.click(within(screen.getByTestId("import-runtime-add")).getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Name a Python…" }));
    fill("qa-new", "/qa/python-b");
    const lists = bridge.listSkeletonPythonProfiles.mock.calls.length;
    await act(async () => { held.reject(REFUSED); });
    expect(screen.getByTestId("import-runtime-add")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("profile name, e.g. pupu-tools")).toHaveValue("qa-new");
    expect(screen.queryByTestId("import-runtime-add-state")).toBeNull();
    expect(within(screen.getByTestId("import-runtime-add")).getByRole("button", { name: "Add" })).not.toBeDisabled();
    /* A refused Python is not in the store, so nothing is re-read for it. */
    expect(bridge.listSkeletonPythonProfiles.mock.calls.length).toBe(lists);
  });

  test("an old registration failing after the form was edited leaves the edit and no error", async () => {
    const held = deferred();
    bridge.saveSkeletonPythonProfile.mockReturnValueOnce(held.promise);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Name a Python…" }));
    fill("qa-old", "/qa/python-a");
    fireEvent.click(within(screen.getByTestId("import-runtime-add")).getByRole("button", { name: "Add" }));
    fill("qa-revised", "/qa/python-revised");
    await act(async () => { held.reject(REFUSED); });
    expect(screen.getByPlaceholderText("profile name, e.g. pupu-tools")).toHaveValue("qa-revised");
    expect(screen.queryByTestId("import-runtime-add-state")).toBeNull();
  });

  test("the current registration's own failure is still said on its form", async () => {
    bridge.saveSkeletonPythonProfile.mockRejectedValueOnce(REFUSED);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Name a Python…" }));
    fill("qa-bad", "python");
    fireEvent.click(within(screen.getByTestId("import-runtime-add")).getByRole("button", { name: "Add" }));
    expect(await screen.findByTestId("import-runtime-add-state")).toHaveTextContent("Python executable must be an absolute path");
    expect(screen.getByPlaceholderText("profile name, e.g. pupu-tools")).toHaveValue("qa-bad");
  });

  test("an old registration succeeding after Cancel refreshes the list and selects nothing", async () => {
    const held = deferred();
    bridge.saveSkeletonPythonProfile.mockReturnValueOnce(held.promise);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Name a Python…" }));
    fill("qa-old", "/qa/python-a");
    fireEvent.click(within(screen.getByTestId("import-runtime-add")).getByRole("button", { name: "Add" }));
    fireEvent.click(within(screen.getByTestId("import-runtime-add")).getByRole("button", { name: "Cancel" }));
    const lists = bridge.listSkeletonPythonProfiles.mock.calls.length;
    await act(async () => { held.resolve({ ...profile("qa-old"), probe: { ok: true, version: "3.12.10", implementation: "cpython" } }); });
    await waitFor(() => expect(bridge.listSkeletonPythonProfiles.mock.calls.length).toBe(lists + 1));
    expect(screen.queryByTestId("import-runtime-add-state")).toBeNull();
    expect(within(screen.getByTestId("import-runtime-0")).getByRole("combobox")).toHaveTextContent("choose a Python");
    expect(importButton()).toBeDisabled();
  });

  test("an older list read answering last cannot replace the newest one", async () => {
    const older = deferred();
    bridge.listSkeletonPythonProfiles
      .mockReturnValueOnce(older.promise)
      .mockResolvedValue({ profiles: [...copy(PROFILES), profile("qa-added")] });
    open();
    await pick(producer.export.source_json);
    await screen.findByTestId("import-preview");
    fireEvent.click(screen.getByRole("button", { name: "Name a Python…" }));
    fill("qa-added", "/qa/python-a");
    fireEvent.click(within(screen.getByTestId("import-runtime-add")).getByRole("button", { name: "Add" }));
    await waitFor(() => expect(within(screen.getByTestId("import-runtime-0")).getByRole("combobox")).not.toBeDisabled());
    await act(async () => { older.resolve({ profiles: [copy(PROFILES[0])] }); });
    choosePython(0, "qa-added");
    expect(within(screen.getByTestId("import-runtime-0")).getByRole("combobox")).toHaveTextContent("qa-added");
  });
});

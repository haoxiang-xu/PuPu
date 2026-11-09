import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfigContext, LocaleContext } from "../../../../CONTAINERs/config/context";
import ImportResourceModal from "./import_resource_modal";
import { import_document, import_occurrences, import_refusal, read_import_file } from "./resource_import";
import { renderAgentMessage } from "./agents_i18n";
import producer from "../../../../SERVICEs/managed_transfer_producer.json";
import capture from "./code_capture.json";

if (typeof global.TextDecoder === "undefined") global.TextDecoder = require("util").TextDecoder;
const copy = (value) => JSON.parse(JSON.stringify(value));
const raw = "agents.import.title {name} · OPAQUE";
const localize = (locale, children) => <ConfigContext.Provider value={{ theme: {} }}>
  <LocaleContext.Provider value={{ locale }}>{children}</LocaleContext.Provider>
</ConfigContext.Provider>;
let bridge;
beforeEach(() => {
  bridge = {
    getManagedSkeletonTransferCapabilities: jest.fn(async () => copy(producer.capabilities)),
    listSkeletonPythonProfiles: jest.fn(async () => ({ profiles: copy(capture.profiles.list_before) })),
    saveSkeletonPythonProfile: jest.fn(),
    importManagedSkeletonResource: jest.fn(),
  };
  window.unchainAPI = bridge;
});

test("import locale changes preserve the same partially entered Python, focus and file without new reads or writes", async () => {
  const element = <ImportResourceModal open onClose={jest.fn()} onImported={jest.fn()} isDark={false} />;
  const view = render(localize("en", element));
  await waitFor(() => expect(screen.getByRole("button", { name: "Choose a file…" })).not.toBeDisabled());
  fireEvent.change(screen.getByTestId("import-file-input"), { target: { files: [new File([producer.export.source_json], raw + ".json")] } });
  await screen.findByTestId("import-runtime-0");
  fireEvent.click(screen.getByRole("button", { name: "Name a Python…" }));
  const input = screen.getByPlaceholderText("profile name, e.g. pupu-tools");
  fireEvent.change(input, { target: { value: raw } });
  input.focus(); input.setSelectionRange(3, 9);
  const reads = [bridge.getManagedSkeletonTransferCapabilities.mock.calls.length, bridge.listSkeletonPythonProfiles.mock.calls.length];
  view.rerender(localize("zh-CN", element));
  expect(screen.getByTestId("import-resource-modal")).not.toHaveTextContent("Import an Agent or Workflow");
  expect(screen.getByTestId("import-resource-modal")).not.toHaveTextContent("Python for each Code step");
  expect(within(screen.getByTestId("import-runtime-add")).getAllByRole("textbox")[0]).toBe(input);
  expect(input).toHaveFocus(); expect(input.value).toBe(raw);
  expect([input.selectionStart, input.selectionEnd]).toEqual([3, 9]);
  expect(screen.getByTestId("import-file-name")).toHaveTextContent(raw + ".json");
  view.rerender(localize("de", element));
  expect(input).toHaveFocus(); expect(input.value).toBe(raw);
  expect([bridge.getManagedSkeletonTransferCapabilities.mock.calls.length, bridge.listSkeletonPythonProfiles.mock.calls.length]).toEqual(reads);
  expect(bridge.saveSkeletonPythonProfile).not.toHaveBeenCalled();
  expect(bridge.importManagedSkeletonResource).not.toHaveBeenCalled();
});

test("local import explanations translate while backend code, path and message remain opaque", async () => {
  const t = (key, vars) => `${key}:${JSON.stringify(vars || {})}`;
  const error = { code: "import_conflict", path: [raw], message: raw };
  const document = { id: raw };
  const result = import_refusal(error, document, [], t);
  expect(result.code).toBe(error.code); expect(result.path).toBe(JSON.stringify(error.path)); expect(result.message).toBe(raw);
  expect(result.sentence).toContain("agents.import."); expect(result.sentence).toContain(raw);
  expect(import_document("no", t).message).toContain("agents.import.");
  const read = await read_import_file(null, 100, t);
  expect(read.message).toContain("agents.import.");
});

test("locally retained notices can rerender in a new locale but a backend string never acquires provenance", async () => {
  const read = await read_import_file(null, 100, (key, vars) => ({ key, vars }));
  expect(read.message).toEqual(expect.objectContaining({ key: expect.stringMatching(/^agents\.import\./) }));
  expect(renderAgentMessage(raw, () => "WRONG")).toBe(raw);
  const body = import_document(producer.export.source_json);
  expect(body.ok).toBe(true);
  const occurrences = import_occurrences(body.document);
  expect(occurrences.map(({ node_path }) => node_path)).toEqual([["nodes", 1]]);
});

import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { api } from "../../../SERVICEs/api";
import SkeletonResourcePage from "./skeleton_resource_page";
import capture from "./recipes_page/skeleton_native_embedded_capture.json";
import { RESOURCE_RESULT_KEYS } from "./recipes_page/skeleton_resource_capture";

jest.mock("../../../SERVICEs/api", () => ({ api: { unchain: {} } }));
const draft = { id: "native-embedded-page", name: "Embedded authoring" };
const kernel = capture.rows[1].document.nodes[1].config.kernel;
const stored = (document) => ({ ...Object.fromEntries(RESOURCE_RESULT_KEYS.map((key) => [key, key === "diagnostics" ? [] : null])), document, id: document.id, kind: document.kind, name: document.name, edit_token: "embedded-saved", archived: false });
async function show() {
  render(<ConfigContext.Provider value={{ theme: {} }}><SkeletonResourcePage resourceId={draft.id} newDraft={draft} /></ConfigContext.Provider>);
  await screen.findByTestId("skeleton-node-agent");
  fireEvent.click(screen.getByRole("button", { name: "Add node", exact: true }));
  fireEvent.click(screen.getByTestId("palette-entry-subagent_pool"));
  await screen.findByTestId("skeleton-subagent-pool");
}
async function save() {
  fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }));
  await waitFor(() => expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent(/^Saved$/));
  return api.unchain.saveSkeletonResource.mock.calls.at(-1)[0];
}
async function chooseModel() {
  fireEvent.click(screen.getByTestId("skeleton-node-agent"));
  const models = await screen.findByTestId("kernel-model");
  fireEvent.click(within(models).getByRole("combobox"));
  fireEvent.click(screen.getByText("openai · gpt-6-luna", { exact: true }));
  await screen.findByPlaceholderText("what this Agent is for");
}
beforeEach(() => {
  jest.restoreAllMocks();
  localStorage.clear();
  Object.keys(api.unchain).forEach((key) => delete api.unchain[key]);
  api.unchain.listSkeletonResources = jest.fn().mockResolvedValue({ resources: [] });
  api.unchain.listSkeletonKernelProfiles = jest.fn().mockResolvedValue({ profiles: [kernel.profile], unavailable: [] });
  api.unchain.saveSkeletonResource = jest.fn().mockImplementation(async ({ document }) => stored(document));
});
afterEach(() => jest.restoreAllMocks());

test("create an embedded Agent, open and edit it, then save only the owning resource", async () => {
  await show();
  fireEvent.click(screen.getByRole("button", { name: "New embedded Agent", exact: true }));
  expect(api.unchain.saveSkeletonResource).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Open New Agent", exact: true })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Open New Agent", exact: true }));
  expect(screen.getByTestId("skeleton-drill-crumbs")).toHaveTextContent("New Agent");
  await chooseModel();
  fireEvent.change(screen.getByPlaceholderText("what this Agent is for"), { target: { value: "Child's own prompt" } });
  const payload = await save();
  const pool = payload.document.nodes.find((n) => n.type === "subagent_pool");
  const entry = pool.config.subagents[0];
  expect(payload.document.id).toBe(draft.id);
  expect(entry.source.kind).toBe("embedded");
  expect(Object.keys(entry.source).sort()).toEqual(["document", "kind"]);
  expect(entry.source.document.nodes[1].config.kernel.prompt).toBe("Child's own prompt");
  expect(payload.document.nodes[1].config.kernel).toBeUndefined();
  expect(api.unchain.getSkeletonResource).toBeUndefined();
  expect(screen.getByTestId("skeleton-drill-crumbs")).toHaveTextContent("New Agent");
  if (process.env.NATIVE_EMBEDDED_PAYLOAD_PATH) require("fs").writeFileSync(process.env.NATIVE_EMBEDDED_PAYLOAD_PATH, JSON.stringify(payload, null, 2) + "\n");
});

test("two locally-created children keep separate graphs and nested creation saves the same parent", async () => {
  await show();
  fireEvent.click(screen.getByRole("button", { name: "New embedded Agent", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "New embedded Agent", exact: true }));
  let payload = await save();
  const entries = payload.document.nodes.at(-1).config.subagents;
  expect(entries.map((e) => e.name)).toEqual(["New Agent", "New Agent 2"]);
  expect(new Set(entries.map((e) => e.source.document.id)).size).toBe(2);
  fireEvent.click(screen.getByRole("button", { name: "Open New Agent 2", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "Add node", exact: true }));
  fireEvent.click(screen.getByTestId("palette-entry-subagent_pool"));
  fireEvent.click(screen.getByRole("button", { name: "New embedded Agent", exact: true }));
  payload = await save();
  const after = payload.document.nodes.at(-1).config.subagents;
  expect(after[0]).toEqual(entries[0]);
  expect(after[1].source.document.nodes.at(-1).config.subagents).toHaveLength(1);
  expect(payload.expected_edit_token).toBe("embedded-saved");
  expect(payload.document.id).toBe(draft.id);
  expect(screen.getByTestId("skeleton-drill-crumbs")).toHaveTextContent("New Agent 2");
});

test("a drilled child checks ancestor graph ids supplied by the owning page", async () => {
  const parent = JSON.parse(JSON.stringify(capture.rows[0].document));
  parent.id = "embedded-" + "07".repeat(16);
  api.unchain.getSkeletonResource = jest.fn().mockResolvedValue(stored(parent));
  let draws = 0;
  jest.spyOn(window.crypto, "getRandomValues").mockImplementation((bytes) => bytes.fill(++draws === 1 ? 7 : 8));
  render(<ConfigContext.Provider value={{ theme: {} }}><SkeletonResourcePage resourceId={parent.id} /></ConfigContext.Provider>);
  fireEvent.click(await screen.findByTestId("skeleton-node-pool"));
  fireEvent.click(screen.getByRole("button", { name: "Open New Agent", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "Add node", exact: true }));
  fireEvent.click(screen.getByTestId("palette-entry-subagent_pool"));
  fireEvent.click(screen.getByRole("button", { name: "New embedded Agent", exact: true }));
  const payload = await save();
  const child = payload.document.nodes.at(-1).config.subagents[0].source.document;
  const grandchild = child.nodes.at(-1).config.subagents[0].source.document;
  expect(draws).toBe(2);
  expect(grandchild.id).toBe("embedded-" + "08".repeat(16));
  expect(payload.document.id).toBe(parent.id);
});

test("identity creation failure keeps the current graph and does not add or save an entry", async () => {
  await show();
  jest.spyOn(window.crypto, "getRandomValues").mockImplementation(() => { throw new Error("entropy unavailable"); });
  fireEvent.click(screen.getByRole("button", { name: "New embedded Agent", exact: true }));
  expect(screen.getByRole("alert")).toHaveTextContent("No entry was added");
  expect(screen.queryByTestId("subagent-entry-0")).not.toBeInTheDocument();
  expect(api.unchain.saveSkeletonResource).not.toHaveBeenCalled();
  const payload = await save();
  expect(payload.document.nodes.at(-1).config.subagents).toEqual([]);
});

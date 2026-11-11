import React, { useState } from "react";
import { act, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import ToolkitPoolSection from "./toolkit_pool_section";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import { api } from "../../../../../SERVICEs/api";
import { emitToolkitCatalogRefresh } from "../../../../../SERVICEs/toolkit_catalog_refresh";
import capture from "../skeleton_toolkit_capture.json";

jest.mock("../../../../../SERVICEs/api", () => ({ api: { unchain: {} } }));
let latest;
const config = () => ({ toolkits: [], merge_with_user_selected: false });
function Harness({ initial = config(), owner = "p" }) {
  const [document, setDocument] = useState({ id: "section", kind: "agent", schema_version: 1, nodes: [{ id: owner, type: "toolkit_pool", config: initial }], edges: [] });
  latest = document;
  return <ConfigContext.Provider value={{ theme: {} }}><ToolkitPoolSection document={document} node={document.nodes[0]} onChange={setDocument} isDark={false} /></ConfigContext.Provider>;
}
const show = async (initial) => {
  const view = render(<Harness initial={initial} />);
  await screen.findByTestId("native-toolkit-library-ready");
  return view;
};
const row = (i = 0) => screen.getByTestId(`native-toolkit-row-${i}`);
const expand = (i = 0, name = "Core") => fireEvent.click(within(row(i)).getByRole("button", { name, exact: true }));
beforeEach(() => { api.unchain.listToolModalCatalog = jest.fn().mockResolvedValue(capture.catalog); });

test("adds exact native reference, selects all by null, and toggles merge explicitly", async () => {
  await show();
  fireEvent.click(screen.getByRole("button", { name: "Add Core" }));
  expect(latest.nodes[0].config).toEqual({ toolkits: [{ id: "core", enabled_tools: null }], merge_with_user_selected: false });
  fireEvent.click(screen.getByRole("switch", { name: "Merge with user-selected" }));
  expect(latest.nodes[0].config.merge_with_user_selected).toBe(true);
  /* A click on the glass switch itself, which does not bubble, toggles too. */
  fireEvent.click(within(screen.getByRole("switch", { name: "Merge with user-selected" })).getByRole("switch"));
  expect(latest.nodes[0].config.merge_with_user_selected).toBe(false);
  expect(api.unchain.listToolModalCatalog).toHaveBeenCalledWith({ strict: true });
});
test("all -> subset -> all -> none preserves the exact distinction", async () => {
  await show({ toolkits: [{ id: "core", enabled_tools: null }], merge_with_user_selected: false });
  const total = capture.catalog.toolkits[0].tools.length;
  expect(within(row()).queryByRole("checkbox", { name: "read" })).not.toBeInTheDocument();
  expand();
  fireEvent.click(within(row()).getByRole("checkbox", { name: "read" }));
  expect(latest.nodes[0].config.toolkits[0].enabled_tools).toEqual(capture.catalog.toolkits[0].tools.map((t) => t.name).filter((n) => n !== "read"));
  expect(screen.getByTestId("native-toolkit-count-0")).toHaveTextContent(`${total - 1}/${total}`);
  fireEvent.click(within(row()).getByRole("button", { name: "All", exact: true }));
  expect(latest.nodes[0].config.toolkits[0].enabled_tools).toBeNull();
  fireEvent.click(within(row()).getByRole("button", { name: "None", exact: true }));
  expect(latest.nodes[0].config.toolkits[0].enabled_tools).toEqual([]);
  expect(screen.getByTestId("native-toolkit-count-0")).toHaveTextContent(`0/${total}`);
});
test("unknown names and malformed selected values survive other edits and can be removed individually", async () => {
  const bad = { toString: null };
  await show({ toolkits: [{ id: "core", enabled_tools: ["gone", bad] }], merge_with_user_selected: false });
  expand();
  fireEvent.click(within(row()).getByRole("checkbox", { name: "read" }));
  expect(latest.nodes[0].config.toolkits[0].enabled_tools).toEqual(["gone", bad, "read"]);
  fireEvent.click(within(row()).getByRole("button", { name: "Remove stored selection 2" }));
  expect(latest.nodes[0].config.toolkits[0].enabled_tools).toEqual(["gone", "read"]);
});
test("every shape of bad entry can be removed; duplicates are addressed by clicked row", async () => {
  await show({ toolkits: [null, { toString: null }, { id: "core", enabled_tools: [] }, { id: "core", enabled_tools: ["read"] }], merge_with_user_selected: false });
  fireEvent.click(within(row(2)).getByRole("button", { name: "Remove toolkit" }));
  expect(latest.nodes[0].config.toolkits).toEqual([null, { toString: null }, { id: "core", enabled_tools: ["read"] }]);
  fireEvent.click(within(row(0)).getByRole("button", { name: "Remove toolkit" }));
  fireEvent.click(within(row(0)).getByRole("button", { name: "Remove toolkit" }));
  expect(latest.nodes[0].config.toolkits).toEqual([{ id: "core", enabled_tools: ["read"] }]);
});
test("prototype IDs and unknown configuration fields are not coerced, normalized or lost", async () => {
  const initial = { toolkits: [{ id: "__proto__", enabled_tools: null }], merge_with_user_selected: false, future: { toString: null } };
  await show(initial);
  expect(within(row()).getByText("__proto__")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("switch", { name: "Merge with user-selected" }));
  expect(latest.nodes[0].config.future).toBe(initial.future);
  expect(latest.nodes[0].config.toolkits).toBe(initial.toolkits);
});
test("unavailable/malformed library is a failure, not an empty installation", async () => {
  api.unchain.listToolModalCatalog.mockResolvedValue({ toolkits: {} });
  render(<Harness />);
  expect(await screen.findByTestId("native-toolkit-library-error")).toBeInTheDocument();
  expect(screen.queryByText("No toolkits are listed in this library.")).not.toBeInTheDocument();
});
test("valid empty directory and loading are visible and do not clear stored references", async () => {
  let resolve;
  api.unchain.listToolModalCatalog.mockReturnValue(new Promise((done) => { resolve = done; }));
  render(<Harness initial={{ toolkits: [{ id: "gone", enabled_tools: ["read"] }], merge_with_user_selected: false }} />);
  expect(screen.getByText("Reading the tool library…")).toBeInTheDocument();
  await act(async () => { resolve({ toolkits: [] }); });
  expect(screen.getByText("No toolkits are listed in this library.")).toBeInTheDocument();
  expect(latest.nodes[0].config.toolkits).toEqual([{ id: "gone", enabled_tools: ["read"] }]);
});
test("refresh answers are ordered; a pending refresh offers no stale new selections", async () => {
  await show();
  let old, current;
  api.unchain.listToolModalCatalog.mockReturnValueOnce(new Promise((r) => { old = r; })).mockReturnValueOnce(new Promise((r) => { current = r; }));
  act(() => { emitToolkitCatalogRefresh(); emitToolkitCatalogRefresh(); });
  expect(screen.queryByRole("button", { name: "Add Core" })).not.toBeInTheDocument();
  await act(async () => { current({ toolkits: [] }); old(capture.catalog); });
  expect(screen.getByText("No toolkits are listed in this library.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Add Core" })).not.toBeInTheDocument();
});
test("refresh failure preserves selected restrictions and permits a subsequent retry", async () => {
  await show({ toolkits: [{ id: "core", enabled_tools: ["read"] }], merge_with_user_selected: false });
  api.unchain.listToolModalCatalog.mockRejectedValueOnce(new Error("offline"));
  act(() => emitToolkitCatalogRefresh());
  await screen.findByTestId("native-toolkit-library-error");
  expect(latest.nodes[0].config.toolkits[0].enabled_tools).toEqual(["read"]);
  fireEvent.click(screen.getByRole("button", { name: "Read tool library again" }));
  await waitFor(() => expect(screen.queryByTestId("native-toolkit-library-error")).not.toBeInTheDocument());
});
test("legacy configuration remains read-only rather than gaining ignored native fields", async () => {
  const initial = { legacy_fields: { toolkits: [{ id: "core", enabled_tools: null }], merge_with_user_selected: false } };
  render(<Harness initial={initial} />);
  expect(screen.getByTestId("native-toolkit-legacy")).toBeInTheDocument();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(latest.nodes[0].config).toBe(initial);
});

import React, { useState } from "react";
import { act, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import ToolkitPoolSection, { chosenToolTag, chosenToolTagFilter } from "./toolkit_pool_section";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import { api } from "../../../../../SERVICEs/api";
import { emitToolkitCatalogRefresh } from "../../../../../SERVICEs/toolkit_catalog_refresh";
import capture from "../skeleton_toolkit_capture.json";

jest.mock("../../../../../SERVICEs/api", () => ({ api: { unchain: {} } }));
let latest;
const config = () => ({ toolkits: [], merge_with_user_selected: false });
function Harness({ initial = config(), owner = "p", isDark = false }) {
  const [document, setDocument] = useState({ id: "section", kind: "agent", schema_version: 1, nodes: [{ id: owner, type: "toolkit_pool", config: initial }], edges: [] });
  latest = document;
  return <ConfigContext.Provider value={{ theme: {} }}><ToolkitPoolSection document={document} node={document.nodes[0]} onChange={setDocument} isDark={isDark} /></ConfigContext.Provider>;
}
const show = async (initial, isDark = false) => {
  const view = render(<Harness initial={initial} isDark={isDark} />);
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
  /* A click on the switch itself, which does not bubble, toggles exactly once. */
  // eslint-disable-next-line testing-library/no-node-access
  fireEvent.click(screen.getByRole("switch", { name: "Merge with user-selected" }).querySelector(".mini-ui-switch-track"));
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

describe("a chosen tool's tag is green", () => {
  test("the colours: success green, white text in the light, near-black green in the dark, semibold", () => {
    expect(chosenToolTag(false)).toEqual({ background: "var(--pupu-success, #22c55e)", color: "#ffffff", fontWeight: 600 });
    expect(chosenToolTag(true)).toEqual({ background: "var(--pupu-success, #4ade80)", color: "#052e16", fontWeight: 600 });
    expect([chosenToolTagFilter(false, false), chosenToolTagFilter(true, false), chosenToolTagFilter(true, true)])
      .toEqual(["none", "brightness(0.93)", "brightness(0.86)"]);
  });

  test.each([false, true])("chosen tags carry it and unchosen ones stay quiet (isDark=%s)", async (isDark) => {
    await show({ toolkits: [{ id: "core", enabled_tools: ["read"] }], merge_with_user_selected: false }, isDark);
    expand();
    // eslint-disable-next-line testing-library/no-node-access
    const tag = (name) => within(row()).getByRole("checkbox", { name }).closest("label");
    const chosen = tag("read");
    expect(chosen.style.color).toBe(isDark ? "rgb(5, 46, 22)" : "rgb(255, 255, 255)");
    expect(chosen.style.fontWeight).toBe("600");
    expect(chosen.style.borderRadius).toBe("999px");
    expect(chosen.style.padding).toBe("3px 8px");
    const other = capture.catalog.toolkits[0].tools.map((t) => t.name).find((n) => n !== "read");
    expect(tag(other).style.background).toBe("transparent");
    expect(tag(other).style.fontWeight).toBe("");
    fireEvent.mouseEnter(chosen);
    expect(chosen.style.filter).toBe("brightness(0.93)");
    fireEvent.mouseDown(chosen);
    expect(chosen.style.filter).toBe("brightness(0.86)");
    fireEvent.mouseLeave(chosen);
    expect(chosen.style.filter).toBe("none");
  });
});

test("the merge option leads the pool on its own surface, ahead of every toolkit", async () => {
  /* dark, where the region surface is a plain rgba jsdom keeps */
  await show({ toolkits: [{ id: "core", enabled_tools: null }], merge_with_user_selected: false }, true);
  const merge = screen.getByTestId("native-toolkit-merge");
  expect(merge).toContainElement(screen.getByRole("switch", { name: "Merge with user-selected" }));
  /* its own region surface, the panel's corners */
  expect(merge.style.background).toBe("rgba(255, 255, 255, 0.035)");
  expect(merge.style.borderRadius).toBe("10px");
  /* before the toolkit list, in reading and tab order */
  // eslint-disable-next-line no-bitwise
  expect(merge.compareDocumentPosition(row()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  /* above the Pool heading, not inside it: the first thing in the panel */
  expect(screen.getByTestId("process-section-toolkits")).not.toContainElement(merge);
  // eslint-disable-next-line testing-library/no-node-access
  expect(screen.getByTestId("native-toolkit-section").firstElementChild).toContainElement(merge);
});

describe("the one Add under the list", () => {
  const openAdd = () => fireEvent.click(screen.getByRole("button", { name: "Add", exact: true }));
  // eslint-disable-next-line testing-library/no-node-access
  const menuRow = (testid) => screen.getByTestId(testid).parentElement.parentElement;

  test("Toolkit replaces the menu's rows with the toolkits not yet pooled; picking one adds it like Installed's Add", async () => {
    await show({ toolkits: [{ id: "plan", enabled_tools: ["x"] }], merge_with_user_selected: false });
    expect(screen.getByRole("region", { name: "Tools and Workflows" })).toContainElement(screen.getByRole("button", { name: "Add", exact: true }));
    openAdd();
    fireEvent.click(screen.getByTestId("native-toolkit-add-menu-toolkit"));
    /* the same menu, now one level down */
    expect(screen.queryByTestId("native-toolkit-add-menu-toolkit")).not.toBeInTheDocument();
    expect(screen.getByTestId("native-toolkit-add-menu-back")).toHaveTextContent("Toolkit");
    expect(screen.getByTestId("native-toolkit-add-menu-item-core")).toHaveTextContent("Core");
    expect(screen.getByTestId("native-toolkit-add-menu-item-agent_reach")).toHaveTextContent("Agent Reach");
    expect(screen.queryByTestId("native-toolkit-add-menu-item-plan")).not.toBeInTheDocument();
    /* back goes up a level without closing */
    fireEvent.click(screen.getByTestId("native-toolkit-add-menu-back"));
    expect(screen.getByTestId("native-toolkit-add-menu-toolkit")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("native-toolkit-add-menu-toolkit"));
    fireEvent.click(screen.getByTestId("native-toolkit-add-menu-item-core"));
    expect(latest.nodes[0].config).toEqual({ toolkits: [{ id: "plan", enabled_tools: ["x"] }, { id: "core", enabled_tools: null }], merge_with_user_selected: false });
    expect(screen.queryByTestId("native-toolkit-add-menu-item-agent_reach")).not.toBeInTheDocument();
    expect(screen.getByTestId("process-aside-toolkits")).toHaveTextContent("2");
  });

  test("the keyboard walks the menu: arrows, Enter into Toolkit and onto a toolkit, Escape out", async () => {
    await show();
    openAdd();
    fireEvent.keyDown(document, { key: "ArrowDown" });
    fireEvent.keyDown(document, { key: "Enter" });
    expect(screen.getByTestId("native-toolkit-add-menu-back")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("native-toolkit-add-menu-back")).not.toBeInTheDocument();
    expect(latest.nodes[0].config.toolkits).toEqual([]);
    openAdd();
    /* a fresh menu opens at the top level */
    fireEvent.keyDown(document, { key: "ArrowDown" });
    fireEvent.keyDown(document, { key: "Enter" });
    /* one level down the highlight starts over: back first, then past the
       separator to the first toolkit */
    fireEvent.keyDown(document, { key: "ArrowDown" });
    fireEvent.keyDown(document, { key: "ArrowDown" });
    fireEvent.keyDown(document, { key: "Enter" });
    expect(latest.nodes[0].config.toolkits).toEqual([{ id: "core", enabled_tools: null }]);
    expect(screen.queryByTestId("native-toolkit-add-menu-back")).not.toBeInTheDocument();
  });

  test("Toolkit is disabled once every installed toolkit is in the pool", async () => {
    const all = capture.catalog.toolkits.map((item) => ({ id: item.toolkitId, enabled_tools: null }));
    await show({ toolkits: all, merge_with_user_selected: false });
    openAdd();
    expect(menuRow("native-toolkit-add-menu-toolkit").style.cursor).toBe("not-allowed");
    fireEvent.click(screen.getByTestId("native-toolkit-add-menu-toolkit"));
    expect(screen.getByTestId("native-toolkit-add-menu-toolkit")).toBeInTheDocument();
    expect(screen.queryByTestId("native-toolkit-add-menu-back")).not.toBeInTheDocument();
    expect(latest.nodes[0].config.toolkits).toEqual(all);
  });

  test("Toolkit is disabled while the stored toolkit list is not a list", async () => {
    await show({ toolkits: { bad: true }, merge_with_user_selected: false });
    openAdd();
    expect(menuRow("native-toolkit-add-menu-toolkit").style.cursor).toBe("not-allowed");
  });
});

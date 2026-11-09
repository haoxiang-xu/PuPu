import React from "react";
import { render, screen, act } from "@testing-library/react";
import { ConfigContext, LocaleContext } from "../../../../CONTAINERs/config/context";
import HooksPoolSection from "./detail_panel/hooks_pool_section";
import SubagentPoolSection from "./detail_panel/subagent_pool_section";
import { hook_entry_problems, move_hook } from "./hooks_pool_config";
import { subagent_pool_problems } from "./subagent_pool_config";
import { list_resources } from "./skeleton_resources";

jest.mock("./skeleton_resources", () => ({ is_unavailable: (value) => value?.reason === "unavailable", list_resources: jest.fn() }));
jest.mock("../../../../SERVICEs/api", () => ({ api: { unchain: {} } }));
jest.mock("../../../../SERVICEs/toolkit_catalog_refresh", () => ({ subscribeToolkitCatalogRefresh: () => () => {} }));
const t = (key, vars) => `T:${key}:${JSON.stringify(vars || {})}`;
const tree = (locale, element) => <ConfigContext.Provider value={{ theme: {} }}><LocaleContext.Provider value={{ locale }}>{element}</LocaleContext.Provider></ConfigContext.Provider>;
const graph = (node) => ({ schema_version: 1, kind: "agent", id: "raw-parent", name: "raw parent", nodes: [node], edges: [] });
beforeEach(() => { list_resources.mockResolvedValue({ ok: true, data: { resources: [] } }); });
test("Hook entry validation changes only explanation strings, including unsafe stored shapes", () => {
  for (const value of [null, {}, { id: "raw", event: "unknown", tool_name: [], order: -1 }, { id: { toString: null } }]) {
    const original = hook_entry_problems(value); const translated = hook_entry_problems(value, {}, t);
    expect(translated.map(({ message, ...issue }) => issue)).toEqual(original.map(({ message, ...issue }) => issue));
    expect(translated.map((issue) => issue.message)).toEqual(original.map(() => expect.stringMatching(/^T:agents\.hooks\./)));
  }
});
test("Subagent local validation retains every code/path/document while translating owned reasons", () => {
  for (const value of [null, {}, { subagents: false }, { subagents: [null, { id: "", source: null }] }]) {
    const before = JSON.stringify(value); const original = subagent_pool_problems(value); const translated = subagent_pool_problems(value, ["config"], t);
    expect(translated.map(({ message, ...issue }) => issue)).toEqual(original.map(({ message, ...issue }) => issue));
    expect(translated.map((issue) => issue.message)).toEqual(original.map(() => expect.stringMatching(/^T:agents\./)));
    expect(JSON.stringify(value)).toBe(before);
  }
});
test("a refused Hook move changes no document while its local reason can follow the display language", () => {
  const document = graph({ id: "pool", type: "hooks_pool", config: { hooks: [] } });
  const original = move_hook(document, "pool", "owner", 0, 0); const translated = move_hook(document, "pool", "owner", 0, 0, t);
  expect(translated.document).toBe(original.document); expect(translated.problem.message).toMatch(/^T:agents\.hooks\./);
});
test.each([["hooks_pool", HooksPoolSection, { hooks: [] }, "+ Add hook"], ["subagent_pool", SubagentPoolSection, { subagents: [] }, "+ Add an Agent"]])("%s locale-only switch retains the control and performs no write or library reread", async (type, Section, config, label) => {
  const node = { id: "pool", type, config }; const document = graph(node); const before = JSON.stringify(document); const onChange = jest.fn();
  const element = <Section node={node} document={document} isDark={false} onChange={onChange} />;
  const view = render(tree("en", element)); await act(async () => { await Promise.resolve(); });
  const button = screen.getByRole("button", { name: label }); const reads = list_resources.mock.calls.length;
  view.rerender(tree("zh-CN", element));
  expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument();
  expect(button).toBeInTheDocument(); expect(list_resources).toHaveBeenCalledTimes(reads); expect(onChange).not.toHaveBeenCalled();
  expect(JSON.stringify(document)).toBe(before);
});

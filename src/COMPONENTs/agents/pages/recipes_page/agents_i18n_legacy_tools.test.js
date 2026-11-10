import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ConfigContext, LocaleContext } from "../../../../CONTAINERs/config/context";
import ToolPoolPanel from "./detail_panel/toolpool_panel";
import { validate_recipe_connection } from "./recipe_connection_rules";
import { api } from "../../../../SERVICEs/api";

jest.mock("../../../../SERVICEs/api", () => ({ api: { unchain: { listToolModalCatalog: jest.fn() } } }));
test("legacy tool pool captions follow locale while search/focus and raw document remain unchanged", async () => {
  api.unchain.listToolModalCatalog.mockResolvedValue({ toolkits: [] });
  const node = { id: "tp", type: "toolkit_pool", toolkits: [] }; const recipe = { nodes: [node], edges: [] }; const onChange = jest.fn();
  const before = JSON.stringify(recipe);
  const tree = (locale) => <ConfigContext.Provider value={{ theme: {} }}><LocaleContext.Provider value={{ locale }}>
    <ToolPoolPanel node={node} recipe={recipe} isDark={false} onChange={onChange} />
  </LocaleContext.Provider></ConfigContext.Provider>;
  const view = render(tree("en")); const input = screen.getByPlaceholderText("Search tools...");
  fireEvent.change(input, { target: { value: "raw {name} · é" } }); input.focus(); input.setSelectionRange(2, 5);
  await waitFor(() => expect(api.unchain.listToolModalCatalog).toHaveBeenCalledTimes(1));
  view.rerender(tree("zh-CN")); expect(screen.getByDisplayValue("raw {name} · é")).toBe(input); expect(input).toHaveFocus();
  expect(input.selectionStart).toBe(2); expect(input.selectionEnd).toBe(5);
  expect(screen.queryByText("Merge with user-selected")).not.toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled(); expect(api.unchain.listToolModalCatalog).toHaveBeenCalledTimes(1); expect(JSON.stringify(recipe)).toBe(before);
});
test("legacy connection validation still returns true or a plain string; only refusal copy changes", () => {
  const node = { id: "raw", ports: [] }; const source = { node, port: "out" }; const target = { node, port: "in" };
  const english = validate_recipe_connection(source, target, {});
  const translated = validate_recipe_connection(source, target, {}, (key) => `T:${key}`);
  expect(typeof translated).toBe(typeof english); expect(translated).toMatch(/^T:agents\./);
});

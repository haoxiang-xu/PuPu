import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfigContext, LocaleContext } from "../../../../CONTAINERs/config/context";
import { api } from "../../../../SERVICEs/api";
import ToolkitPoolSection from "./detail_panel/toolkit_pool_section";
import { toolkit_pool_problems } from "./toolkit_pool_config";
import capture from "./skeleton_toolkit_capture.json";

jest.mock("../../../../SERVICEs/api", () => ({ api: { unchain: {} } }));
jest.mock("./detail_panel/workflow_tools_section", () => () => null);
const localized = (locale, children) => <ConfigContext.Provider value={{ theme: {} }}>
  <LocaleContext.Provider value={{ locale }}>{children}</LocaleContext.Provider>
</ConfigContext.Provider>;
test("toolkit captions translate but stored names, selections, focus and library reads do not change", async () => {
  api.unchain.listToolModalCatalog = jest.fn(async () => capture.catalog);
  const raw = "agents.toolkit.all {raw}";
  const node = { id: "pool", type: "toolkit_pool", config: { toolkits: [{ id: raw, enabled_tools: [raw] }], merge_with_user_selected: false } };
  const document = { schema_version: 1, kind: "agent", nodes: [node], edges: [] };
  const before = JSON.stringify(document); const onChange = jest.fn();
  const element = <ToolkitPoolSection document={document} node={node} onChange={onChange} isDark={false} />;
  const view = render(localized("en", element));
  await screen.findByTestId("native-toolkit-library-ready");
  const input = screen.getByPlaceholderText("Search toolkits");
  fireEvent.change(input, { target: { value: "Core" } }); input.focus(); input.setSelectionRange(1, 3);
  view.rerender(localized("zh-CN", element));
  expect(screen.getByTestId("native-toolkit-section")).not.toHaveTextContent("Include chat-selected toolkits");
  expect(screen.getByTestId("native-toolkit-row-0")).toHaveTextContent(raw);
  expect(within(screen.getByTestId("native-toolkit-library-ready")).getByRole("textbox")).toBe(input);
  expect(input).toHaveFocus(); expect(input.value).toBe("Core"); expect([input.selectionStart, input.selectionEnd]).toEqual([1, 3]);
  expect(JSON.stringify(document)).toBe(before); expect(onChange).not.toHaveBeenCalled();
  await waitFor(() => expect(api.unchain.listToolModalCatalog).toHaveBeenCalledTimes(1));
});

test("each toolkit validator message has locale provenance without changing native acceptance or authored values", () => {
  const config = { toolkits: [null, { id: "x", enabled_tools: [] }, { id: "x", enabled_tools: [false, "raw", "raw"] }], merge_with_user_selected: false };
  const before = JSON.stringify(config);
  const english = toolkit_pool_problems(config);
  const translated = toolkit_pool_problems(config, (key) => `T:${key}`);
  expect(translated).toHaveLength(english.length);
  expect(translated.every((message) => message.startsWith("T:agents.toolkit."))).toBe(true);
  expect(JSON.stringify(config)).toBe(before);
  expect(toolkit_pool_problems({ toolkits: [], merge_with_user_selected: false }, () => "BAD")).toEqual([]);
});

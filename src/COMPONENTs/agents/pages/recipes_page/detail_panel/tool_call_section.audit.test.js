import React from "react";
import { render, screen, within } from "@testing-library/react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import { api } from "../../../../../SERVICEs/api";
import ToolCallSection from "./tool_call_section";
import fixture from "./../tool_call_capture.json";
import documents from "../../../../../../e2e/fixtures/skeleton_step_documents.json";

jest.mock("../../../../../SERVICEs/api", () => ({ api: { unchain: {} } }));

test.each([false, true])("required marker follows the theme and unset policy stays unset (dark=%s)", async (isDark) => {
  const document = JSON.parse(JSON.stringify(documents.tool));
  const node = document.nodes.find((item) => item.id === "tool");
  delete node.config.tool.on_error;
  const change = jest.fn();
  api.unchain.listToolModalCatalog = jest.fn().mockResolvedValue(JSON.parse(fixture.catalog_v2.body_text));
  api.unchain.listSkeletonToolSchemas = jest.fn().mockResolvedValue(JSON.parse(fixture.core_schemas.body_text));
  render(<ConfigContext.Provider value={{ theme: {}, onThemeMode: isDark ? "dark_mode" : "light_mode" }}>
    <ToolCallSection document={document} node={node} isDark={isDark} onChange={change} />
  </ConfigContext.Provider>);
  const content = await screen.findByTestId("tool-call-argument-content");
  expect(within(content).getByLabelText("required")).toHaveStyle({
    color: isDark ? "rgba(255,140,140,0.95)" : "rgba(176,32,32,0.95)",
  });
  const policy = screen.getByTestId("tool-call-on-error");
  expect(within(policy).getByRole("button", { name: "Fail the run" })).toHaveAttribute("aria-pressed", "false");
  expect(within(policy).getByRole("button", { name: "Continue" })).toHaveAttribute("aria-pressed", "false");
  expect(change).not.toHaveBeenCalled();
});

import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ConfigContext, LocaleContext } from "../../../../CONTAINERs/config/context";
import { api } from "../../../../SERVICEs/api";
import WorkflowToolsSection from "./detail_panel/workflow_tools_section";
import capability from "../../../../SERVICEs/skeleton_workflow_tool_capabilities_capture.json";

jest.mock("../../../../SERVICEs/api", () => ({ api: { unchain: {} } }));
jest.mock("./detail_panel/workflow_pin_control", () => () => null);
const localized = (locale, children) => <ConfigContext.Provider value={{ theme: {} }}>
  <LocaleContext.Provider value={{ locale }}>{children}</LocaleContext.Provider>
</ConfigContext.Provider>;
test("Workflow tool locale rerenders retain invalid pending id text, raw function identity and no writes", async () => {
  api.unchain.getSkeletonWorkflowToolCapabilities = jest.fn(async () => capability);
  const node = { id: "pool", type: "toolkit_pool", config: { workflow_tools: [{ id: "raw_id" }] } };
  const document = { nodes: [node], edges: [] }; const commit = jest.fn(); const before = JSON.stringify(document);
  const element = <WorkflowToolsSection document={document} node={node} editable commit={commit} isDark={false} />;
  const view = render(localized("en", element));
  await screen.findByTestId("native-workflow-tools-ready");
  const row = screen.getByTestId("native-workflow-tool-row-0");
  const input = within(row).getByRole("textbox");
  fireEvent.change(input, { target: { value: "agents.workflow.tools {bad}" } }); input.focus(); input.setSelectionRange(1, 5);
  const english = row.textContent;
  view.rerender(localized("zh-CN", element));
  expect(row.textContent).not.toBe(english); expect(row).toHaveTextContent("workflow_raw_id");
  expect(within(row).getByRole("textbox")).toBe(input); expect(input).toHaveFocus();
  expect(input.value).toBe("agents.workflow.tools {bad}"); expect([input.selectionStart, input.selectionEnd]).toEqual([1, 5]);
  expect(JSON.stringify(document)).toBe(before); expect(commit).not.toHaveBeenCalled();
  expect(api.unchain.getSkeletonWorkflowToolCapabilities).toHaveBeenCalledTimes(1);
});
test("a missing capability stays unavailable across language changes without creating a contract", async () => {
  api.unchain.getSkeletonWorkflowToolCapabilities = undefined;
  const node = { id: "pool", config: {} }; const commit = jest.fn();
  const element = <WorkflowToolsSection document={{ nodes: [node] }} node={node} editable commit={commit} />;
  const view = render(localized("en", element));
  const notice = await screen.findByTestId("native-workflow-tools-unavailable"); const english = notice.textContent;
  view.rerender(localized("zh-CN", element));
  expect(notice.textContent).not.toBe(english); expect(notice).not.toHaveTextContent("This host has no Workflow Tool contract.");
  expect(commit).not.toHaveBeenCalled();
});

import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConfigContext, LocaleContext } from "../../../../CONTAINERs/config/context";
import { api } from "../../../../SERVICEs/api";
import WorkflowPinControl from "./detail_panel/workflow_pin_control";
import WorkflowCallSection from "./detail_panel/workflow_call_section";
import { workflow_call_problems } from "./workflow_call_config";
import capture from "./workflow_call_capture.json";
import { forget_workflow_versions } from "./workflow_versions";

jest.mock("../../../../SERVICEs/api", () => ({ api: { unchain: {} } }));
jest.mock("./detail_panel/tool_call_section", () => ({ ArgumentRow: () => null }));
const copy = (value) => JSON.parse(JSON.stringify(value));
const row = (name) => copy(capture.rows.find((item) => item.case === name).reply);
const raw = "agents.workflow.title {raw} · OPAQUE";
const localize = (locale, children) => <ConfigContext.Provider value={{ theme: {} }}>
  <LocaleContext.Provider value={{ locale }}>{children}</LocaleContext.Provider>
</ConfigContext.Provider>;
beforeEach(() => {
  forget_workflow_versions();
  api.unchain.listSkeletonResources = jest.fn(async () => row("list_active"));
  api.unchain.getManagedSkeletonResource = jest.fn(async () => row("wf_get_after_2"));
  api.unchain.publishManagedSkeletonWorkflow = jest.fn(async () => row("wf_publish_2"));
});

test("both Workflow controls translate without remounting typed revision or reading/pinning again", async () => {
  const onPin = jest.fn();
  const control = <WorkflowPinControl pin={null} stored={{ workflow_id: "wf-summarize" }} editable onPin={onPin} isDark={false} testid="pin-probe" />;
  const view = render(localize("en", control));
  const input = await screen.findByPlaceholderText("or a revision id, e.g. rev-2-…");
  await waitFor(() => expect(api.unchain.listSkeletonResources).toHaveBeenCalledTimes(1));
  fireEvent.change(input, { target: { value: raw } }); input.focus(); input.setSelectionRange(4, 8);
  view.rerender(localize("zh-CN", control));
  expect(screen.getByTestId("pin-probe")).not.toHaveTextContent("Publish its current draft and pin it");
  expect(screen.getByDisplayValue(raw)).toBe(input); expect(input).toHaveFocus();
  expect([input.selectionStart, input.selectionEnd]).toEqual([4, 8]);
  expect(api.unchain.listSkeletonResources).toHaveBeenCalledTimes(1);
  expect(api.unchain.publishManagedSkeletonWorkflow).not.toHaveBeenCalled(); expect(onPin).not.toHaveBeenCalled();
});

test("an in-flight publication produces a current-language notice with the exact original pin", async () => {
  let finish;
  api.unchain.publishManagedSkeletonWorkflow.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const onPin = jest.fn();
  const control = <WorkflowPinControl pin={null} stored={{ workflow_id: "wf-summarize" }} editable onPin={onPin} isDark={false} testid="pin-probe" />;
  const view = render(localize("en", control));
  fireEvent.click(await screen.findByRole("button", { name: "Publish its current draft and pin it" }));
  await waitFor(() => expect(api.unchain.publishManagedSkeletonWorkflow).toHaveBeenCalledTimes(1));
  view.rerender(localize("zh-CN", control));
  await act(async () => finish(row("wf_publish_2")));
  const notice = screen.getByTestId("pin-probe-pin-state");
  expect(notice).not.toHaveTextContent("Pinned revision");
  expect(onPin).toHaveBeenCalledWith("wf-summarize", row("wf_publish_2").version.revision_id);
  expect(api.unchain.publishManagedSkeletonWorkflow).toHaveBeenCalledTimes(1);
});

test("Workflow Call local missing-pin guidance translates while config and output names remain raw", async () => {
  const node = { id: raw, type: "workflow_call", config: {} };
  const document = { schema_version: 1, kind: "agent", nodes: [node], edges: [] };
  const snapshot = JSON.stringify(document); const onChange = jest.fn();
  const element = <WorkflowCallSection document={document} node={node} onChange={onChange} isDark={false} />;
  const view = render(localize("en", element));
  await waitFor(() => expect(api.unchain.listSkeletonResources).toHaveBeenCalledTimes(1));
  expect(screen.getByTestId("workflow-call-problems")).toHaveTextContent("Choose a Workflow");
  view.rerender(localize("zh-CN", element));
  expect(screen.getByTestId("workflow-call-problems")).not.toHaveTextContent("Choose a Workflow");
  expect(JSON.stringify(document)).toBe(snapshot); expect(onChange).not.toHaveBeenCalled();
});

test("Workflow helper translator only changes messages and omitted translator retains English", () => {
  const node = { id: raw, type: "workflow_call", config: { [raw]: false } };
  const english = workflow_call_problems(node);
  const local = workflow_call_problems(node, (key, vars) => `T:${key}:${JSON.stringify(vars || {})}`);
  expect(local.map(({ message, ...fields }) => fields)).toEqual(english.map(({ message, ...fields }) => fields));
  expect(local.every((item) => item.message.startsWith("T:agents.workflow."))).toBe(true);
  expect(english[0].message).toContain(raw);
});

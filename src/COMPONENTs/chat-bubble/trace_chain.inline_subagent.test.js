import React from "react";
import { render, screen } from "@testing-library/react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import TraceChain from "./trace_chain";
import capture from "./__fixtures__/ticket_356_inline_subagent.json";

jest.mock("../../BUILTIN_COMPONENTs/icon/icon", () => () => null);

const show = (result, toolName = "delegate_to_subagent") => render(
  <ConfigContext.Provider value={{ theme: { color: "#222", font: { fontFamily: "sans-serif" } }, onThemeMode: "light_mode" }}>
    <TraceChain status="done" messageId="inline-child" frames={[
      { seq: 1, ts: 1, type: "tool_call", payload: { ...capture.call.payload, tool_name: toolName } },
      { seq: 2, ts: 2, type: "tool_result", payload: { ...capture.result.payload, tool_name: toolName, result } },
    ]} />
  </ConfigContext.Provider>,
);

test("the actual packaged V4 reply shows the completed child instead of pending", () => {
  show(capture.result.payload.result);
  expect(screen.getByText("completed", { exact: true })).toBeVisible();
  expect(screen.queryByText("pending", { exact: true })).not.toBeInTheDocument();
});

test("legacy direct subagent results keep their status", () => {
  show(JSON.parse(capture.result.payload.result.preview));
  expect(screen.getByText("completed", { exact: true })).toBeVisible();
});

const envelope = (result) => {
  const preview = JSON.stringify(result);
  return { inline: true, preview, content_bytes: new Blob([preview]).size };
};

test.each(["failed", "cancelled", "timeout"])("an inline child keeps its actual %s state", status => {
  show(envelope({ agent_name: "child", template_name: "Reviewer", status }));
  screen.getAllByText(status, { exact: true }).forEach(label => expect(label).toBeVisible());
  expect(screen.queryByText("completed", { exact: true })).not.toBeInTheDocument();
});

test("handoff uses the same complete result without losing identity", () => {
  show(capture.result.payload.result, "handoff_to_subagent");
  expect(screen.getByText("completed", { exact: true })).toBeVisible();
});

test("a worker batch decodes all distinct child results", () => {
  show(envelope({ status: "partial_failure", results: [
    { agent_name: "first", template_name: "First worker", status: "completed" },
    { agent_name: "second", template_name: "Second worker", status: "failed" },
  ] }), "spawn_worker_batch");
  expect(screen.getByText("completed", { exact: true })).toBeVisible();
  expect(screen.getByText("failed", { exact: true })).toBeVisible();
});

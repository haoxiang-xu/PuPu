import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import { createRuntimeEventStore } from "../../SERVICEs/runtime_events/event_store";
import { reduceActivityTree } from "../../SERVICEs/runtime_events/activity_tree";
import TraceChain from "./trace_chain";
import capture from "./__fixtures__/ticket_356_workflow_tool_settlement.json";

jest.mock("../../BUILTIN_COMPONENTs/icon/icon", () => () => null);

const copy = (value) => JSON.parse(JSON.stringify(value));
const show = (events = capture.v4_events) => {
  const store = createRuntimeEventStore();
  store.appendMany(copy(events));
  const tree = reduceActivityTree(null, store.getSnapshot());
  const framesByRunId = tree.framesByRunId;
  const consumer = capture.projection.consumer_attempt.attempt_id;
  // This source capture starts at the Kernel callback, so the real reducer
  // treats its consumer as the root. Nested child frames remain separate.
  const frames = [...tree.frames, ...(framesByRunId[consumer] || [])]
    .filter((frame) => frame.run_id === consumer);
  const before = JSON.stringify(frames);
  render(
    <ConfigContext.Provider value={{ theme: { color: "#222", font: { fontFamily: "sans-serif" } }, onThemeMode: "light_mode" }}>
      <TraceChain status="done" messageId="workflow-tool" frames={frames}
        subagentFrames={Object.fromEntries(Object.entries(framesByRunId).filter(([id]) => id !== consumer))} />
    </ConfigContext.Provider>,
  );
  return { frames, before };
};

test("the real resumed Workflow tool displays its verified End outputs without rewriting the wait result", () => {
  const { frames, before } = show();
  expect(screen.getAllByText("completed", { exact: true })[0]).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /detail/i }));
  expect(screen.getByText(/committed-workflow-End-output/)).toBeVisible();
  expect(screen.queryByText(/skeleton_subagent_wait_marker/)).not.toBeInTheDocument();
  expect(JSON.stringify(frames)).toBe(before);
  expect(frames.find((frame) => frame.type === "tool_result").payload.result.preview).toContain("waiting");
});

test("a constructed non-inline receipt shows its terminal status without inventing End output", () => {
  const events = copy(capture.v4_events);
  const result = events.find((frame) => frame.payload?.settlement).payload.settlement.result;
  result.inline = false;
  result.content_bytes = 9000;
  // Non-inline previews are deliberately not decoded as a complete body.
  result.preview = "bounded preview";
  show(events);
  expect(screen.getAllByText("completed", { exact: true })[0]).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /detail/i }));
  expect(screen.queryByText(/committed-workflow-End-output/)).not.toBeInTheDocument();
  expect(screen.queryByText(/skeleton_subagent_wait_marker/)).not.toBeInTheDocument();
});

test.each(["missing", "foreign-call", "bad-digest", "conflict"])("%s settlement cannot replace the original Workflow wait result", (variant) => {
  const events = copy(capture.v4_events);
  const event = events.find((frame) => frame.payload?.settlement);
  if (variant === "missing") events.splice(events.indexOf(event), 1);
  if (variant === "foreign-call") event.payload.settlement.call_id = "other-call";
  if (variant === "bad-digest") event.payload.settlement.result.content_sha256 = "0".repeat(64);
  if (variant === "conflict") {
    const other = copy(event);
    other.event_id = "evt_conflicting_workflow_settlement";
    other.seq += 0.5;
    other.payload.settlement.cursor.store_seq += 1;
    other.payload.settlement.cursor.event_id += ".conflict";
    events.push(other);
  }
  show(events);
  expect(screen.queryByText("completed", { exact: true })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /detail/i }));
  expect(screen.queryByText(/committed-workflow-End-output/)).not.toBeInTheDocument();
  expect(screen.getByText(/skeleton_subagent_wait_marker/)).toBeVisible();
});

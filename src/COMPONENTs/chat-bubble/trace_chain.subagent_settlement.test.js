import React from "react";
import { render, screen } from "@testing-library/react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import TraceChain from "./trace_chain";
import fixture from "./__fixtures__/ticket_357_subagent_settlement.json";
import { createRuntimeEventStore } from "../../SERVICEs/runtime_events/event_store";
import { reduceActivityTree } from "../../SERVICEs/runtime_events/activity_tree";

/* R-SHARED-COLD-TRACE-01 (#357): the actual waiting card of the cold-resumed
   parked-old chat, settled only by the Journal settlement replayed through the
   new wheel (the positive origin). Negatives are labelled constructed variants. */

jest.mock("../../BUILTIN_COMPONENTs/icon/icon", () => () => null);

const copy = (value) => JSON.parse(JSON.stringify(value));
const message = fixture.reprojection.persisted_message;

const reduce = (events) => {
  const store = createRuntimeEventStore();
  store.appendMany(events);
  return reduceActivityTree(null, store.getSnapshot()).framesByRunId;
};

const show = ({ frames = message.traceFrames, subagentFrames = {}, status = "done" } = {}) => render(
  <ConfigContext.Provider value={{ theme: { color: "#222", font: { fontFamily: "sans-serif" } }, onThemeMode: "light_mode" }}>
    <TraceChain
      status={status}
      messageId="cold-parked-old"
      frames={copy(frames)}
      subagentFrames={subagentFrames}
      subagentMetaByRunId={copy(message.subagentMetaByRunId)}
    />
  </ConfigContext.Provider>,
);

test("without a settlement the real cold card stays waiting, even though the root completed", () => {
  show();
  expect(screen.getByText("waiting", { exact: true })).toBeVisible();
  expect(screen.queryByText("completed", { exact: true })).not.toBeInTheDocument();
});

test("the real Journal settlement settles exactly that card as completed", () => {
  show({ subagentFrames: reduce([copy(fixture.reprojection.v4_event)]) });
  expect(screen.getByText("completed", { exact: true })).toBeVisible();
  expect(screen.queryByText("waiting", { exact: true })).not.toBeInTheDocument();
  // error:"" is success; no error section is shown.
  expect(screen.queryByText("error", { exact: true })).not.toBeInTheDocument();
});

test.each(["failed", "cancelled", "outcome_unknown"])("a %s settlement is shown as itself, never as completed", (status) => {
  const event = copy(fixture.reprojection.v4_event);
  const settlement = event.payload.settlement;
  const preview = JSON.stringify({
    error: status === "failed" ? "child failed" : "",
    outputs: null,
    schema: "unchain.skeleton_child_completion.v1",
    status,
    summary: "",
  });
  // eslint-disable-next-line global-require
  const { sha256_text, utf8_bytes } = require("../agents/pages/recipes_page/managed_code_sources");
  event.type = "run.failed";
  event.payload.status = status;
  settlement.status = status;
  settlement.result.preview = preview;
  settlement.result.content_bytes = utf8_bytes(preview).length;
  settlement.result.content_sha256 = sha256_text(preview);
  show({ subagentFrames: reduce([event]) });
  screen.getAllByText(status, { exact: true }).forEach((label) => expect(label).toBeVisible());
  expect(screen.queryByText("completed", { exact: true })).not.toBeInTheDocument();
});

test("a malformed settlement leaves the card waiting", () => {
  const event = copy(fixture.reprojection.v4_event);
  event.payload.settlement.result.content_sha256 = "0".repeat(64);
  show({ subagentFrames: reduce([event]) });
  expect(screen.getByText("waiting", { exact: true })).toBeVisible();
});

test("a settlement for another chat leaves the card waiting", () => {
  const event = copy(fixture.reprojection.v4_event);
  const s = event.payload.settlement;
  for (const ref of [s.consumer_attempt, s.source_attempt]) ref.generation.execution_id = "chat-other";
  event.session_id = "chat-other";
  show({ subagentFrames: reduce([event]) });
  expect(screen.getByText("waiting", { exact: true })).toBeVisible();
});

test("conflicting receipts for the same call leave the card waiting", () => {
  const failed = copy(fixture.reprojection.v4_event);
  failed.event_id = "evt_conflict";
  failed.payload.settlement.cursor.store_seq = 65;
  failed.payload.settlement.cursor.event_id = "event.skeleton.subagent-tool-settlement.conflict";
  show({ subagentFrames: reduce([copy(fixture.reprojection.v4_event), failed]) });
  expect(screen.getByText("waiting", { exact: true })).toBeVisible();
});

test("only the settled card changes when two delegate cards exist", () => {
  const call = message.traceFrames.find((frame) => frame.payload?.call_id === "qa-retention-parked-old-delegate" && frame.type === "tool_call");
  const result = message.traceFrames.find((frame) => frame.payload?.call_id === "qa-retention-parked-old-delegate" && frame.type === "tool_result");
  // Constructed second card: its own call id, step and runtime event ids.
  const other = (frame, seq, eventId) => ({
    ...copy(frame),
    seq,
    event_id: eventId,
    links: { ...copy(frame.links), step_id: "tool:other-delegate", tool_call_id: "other-delegate" },
    payload: {
      ...copy(frame.payload),
      call_id: "other-delegate",
      step_id: "tool:other-delegate",
      runtime_event_id: eventId,
    },
  });
  const frames = [
    ...message.traceFrames,
    other(call, 30, "evt_other_call"),
    other(result, 31, "evt_other_result"),
  ];
  show({ frames, subagentFrames: reduce([copy(fixture.reprojection.v4_event)]) });
  expect(screen.getAllByText("completed", { exact: true })).toHaveLength(1);
  expect(screen.getAllByText("waiting", { exact: true })).toHaveLength(1);
});

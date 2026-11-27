import React from "react";
import { render, screen } from "@testing-library/react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import TraceChain from "./trace_chain";
import capture from "./__fixtures__/ticket_357_cancelled_approval.json";
import {
  admitDurableInteractionCancellation,
  settleCancelledInteraction,
} from "../../SERVICEs/runtime_events/cancelled_interaction_settlement";

/* Cancelled-tool Pending (#357): the real hooks-cancel message after Stop.
   "not run" is shown only for the approval the backend proved it cancelled;
   without that proof a stopped card keeps the accepted #384 "Pending". */

jest.mock("../../BUILTIN_COMPONENTs/icon/icon", () => () => null);

const copy = (value) => JSON.parse(JSON.stringify(value));
const request = capture.cancel_request;
const target = {
  sessionId: request.execution_id,
  attemptId: request.attempt_id,
  interactionId: request.interaction_id,
};
const settledFrames = () => {
  const evidence = admitDurableInteractionCancellation(capture.cancel_response, target);
  return settleCancelledInteraction([copy(capture.persisted_message)], evidence).messages[0].traceFrames;
};

const show = (frames, status = "done", props = {}) => render(
  <ConfigContext.Provider value={{ theme: { color: "#222", font: { fontFamily: "sans-serif" } }, onThemeMode: "light_mode" }}>
    <TraceChain status={status} messageId="hooks-cancel" frames={frames} {...props} />
  </ConfigContext.Provider>,
);

test("the proved cancelled approval reads as cancelled before it ran", () => {
  show(settledFrames());
  expect(screen.getByText("Cancelled · not run")).toBeVisible();
  expect(screen.queryByText("Pending")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
});

test("a real wait with no cancellation stays pending", () => {
  show(copy(capture.persisted_message.traceFrames));
  expect(screen.getByText("Pending")).toBeVisible();
  expect(screen.queryByText(/Cancelled/)).not.toBeInTheDocument();
});

test("a cancellation for another interaction does not settle this card", () => {
  const frames = settledFrames().map((frame) => frame.type === "interaction_cancelled"
    ? { ...frame, payload: { ...frame.payload, confirmation_id: "interaction-other" } }
    : frame);
  show(frames);
  expect(screen.getByText("Pending")).toBeVisible();
});

test("an approved call is never called not run", () => {
  const frames = settledFrames();
  const call = frames.find((frame) => frame.payload?.confirmation_id === target.interactionId && frame.type === "tool_call");
  frames.push({ seq: 20, ts: 20, type: "tool_confirmed", run_id: call.run_id, links: call.links, stage: "client",
    payload: { tool_name: "write", call_id: call.payload.call_id, confirmation_id: target.interactionId, synthetic: true } });
  show(frames);
  expect(screen.queryByText("Cancelled · not run")).not.toBeInTheDocument();
});

test("a stopped run without backend proof never claims the call did not run", () => {
  show(copy(capture.persisted_message.traceFrames), "cancelled");
  expect(screen.getByText("Pending")).toBeVisible();
  expect(screen.queryByText("Cancelled · not run")).not.toBeInTheDocument();
});

test("a proved cancellation in a stopped message also reads as not run", () => {
  show(settledFrames(), "cancelled");
  expect(screen.getByText("Cancelled · not run")).toBeVisible();
});

/* R-CANCEL-03: the real cold-resumed message after Stop (no rebinding). */
describe("cancelled second approval after a cold resume", () => {
  // eslint-disable-next-line global-require
  const real = require("./__fixtures__/ticket_357_resumed_second_cancel.json");
  const request = real.actual_cancel.request;
  const settled = () => settleCancelledInteraction([copy(real.owning_message_after_stop)],
    admitDurableInteractionCancellation(real.actual_cancel.response, {
      sessionId: request.execution_id, attemptId: request.attempt_id,
      sourceAttemptId: request.source_attempt_id, interactionId: request.interaction_id,
    })).messages[0];

  test("as stored, the second write is still pending", () => {
    show(copy(real.owning_message_after_stop.traceFrames));
    expect(screen.getByText("Pending")).toBeVisible();
    expect(screen.queryByText("Cancelled · not run")).not.toBeInTheDocument();
  });

  test("with the proof, only the second write reads cancelled; the approved first does not", () => {
    show(settled().traceFrames);
    expect(screen.getAllByText("Cancelled · not run")).toHaveLength(1);
    expect(screen.queryByText("Pending")).not.toBeInTheDocument();
  });
});

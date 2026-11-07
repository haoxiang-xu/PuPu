import capture from "../../COMPONENTs/chat-bubble/__fixtures__/ticket_357_cancelled_approval.json";
import {
  INTERACTION_CANCELLED_FRAME_TYPE,
  admitDurableInteractionCancellation,
  cancelledInteractionIds,
  settleCancelledInteraction,
} from "./cancelled_interaction_settlement";

/* Cancelled-tool Pending (#357). Real data: the persisted assistant message of
   the hooks-cancel chat and the exact /chat/executions/cancel reply. */

const copy = (value) => JSON.parse(JSON.stringify(value));
const request = capture.cancel_request;
const target = {
  sessionId: request.execution_id,
  attemptId: request.attempt_id,
  interactionId: request.interaction_id,
};
const userMessage = { id: "user-1", role: "user", content: "hooks-cancel" };
const messages = () => [userMessage, copy(capture.persisted_message)];

describe("admitDurableInteractionCancellation", () => {
  test("admits the real reply for the exact execution, attempt and interaction", () => {
    expect(admitDurableInteractionCancellation(capture.cancel_response, target)).toEqual({
      executionId: target.sessionId,
      attemptId: target.attemptId,
      sourceAttemptId: target.attemptId,
      interactionId: target.interactionId,
      reason: "user_stop",
    });
  });

  test.each([
    ["no durable interaction was cancelled", { durable_interaction_cancelled: false }],
    ["the durable flag is missing", { durable_interaction_cancelled: undefined }],
    ["the run is only cancel_requested", { state: "cancel_requested" }],
    ["another attempt answered", { attempt_id: "unchain-other" }],
    ["another execution answered", { execution_id: "chat-other" }],
    ["the reply names no execution", { execution_id: undefined }],
    ["the source attempt differs", { source_attempt_id: "unchain-other" }],
    ["the request failed", { status: "error" }],
  ])("refuses when %s", (_label, patch) => {
    const reply = { ...copy(capture.cancel_response), ...patch };
    Object.keys(patch).forEach((key) => patch[key] === undefined && delete reply[key]);
    expect(admitDurableInteractionCancellation(reply, target)).toBeNull();
  });

  test("refuses when Stop named no interaction", () => {
    expect(admitDurableInteractionCancellation(capture.cancel_response, { ...target, interactionId: "" })).toBeNull();
  });
});

describe("settleCancelledInteraction", () => {
  const evidence = admitDurableInteractionCancellation(capture.cancel_response, target);

  test("records one identity-bound frame on the owning call and nothing else", () => {
    const before = messages();
    const { changed, messages: after } = settleCancelledInteraction(before, evidence, 5);
    expect(changed).toBe(true);
    expect(after[0]).toBe(before[0]);
    const added = after[1].traceFrames.slice(before[1].traceFrames.length);
    expect(added).toEqual([expect.objectContaining({
      type: INTERACTION_CANCELLED_FRAME_TYPE,
      ts: 5,
      stage: "client",
      payload: {
        tool_name: "write",
        call_id: "qa-hooks-cancel-write-1",
        confirmation_id: target.interactionId,
        execution_id: target.sessionId,
        attempt_id: target.attemptId,
        source_attempt_id: target.attemptId,
        reason: "user_stop",
        durable_interaction_cancelled: true,
        synthetic: true,
      },
    })]);
    expect(cancelledInteractionIds(after[1].traceFrames)).toEqual(new Set([target.interactionId]));
    expect(after[1].traceFrames.slice(0, before[1].traceFrames.length)).toEqual(before[1].traceFrames);
  });

  test("is idempotent", () => {
    const once = settleCancelledInteraction(messages(), evidence, 5).messages;
    const twice = settleCancelledInteraction(once, evidence, 6);
    expect(twice.changed).toBe(false);
    expect(twice.messages).toBe(once);
  });

  test.each([
    ["approved", "tool_confirmed"],
    ["denied", "tool_denied"],
  ])("never overrides a call already %s", (_label, type) => {
    const list = messages();
    const call = list[1].traceFrames.find((frame) => frame.payload?.confirmation_id === target.interactionId);
    list[1].traceFrames.push({ seq: 7, type, payload: { call_id: call.payload.call_id, confirmation_id: target.interactionId } });
    expect(settleCancelledInteraction(list, evidence).changed).toBe(false);
  });

  test("never marks a call with a result, whatever the reply says", () => {
    const list = messages();
    list[1].traceFrames.push({ seq: 7, type: "tool_result", payload: { call_id: "qa-hooks-cancel-write-1", status: "success" } });
    expect(settleCancelledInteraction(list, evidence).changed).toBe(false);
  });

  test("leaves a call owned by another attempt alone", () => {
    /* R-CANCEL-03 note: changing only meta.attemptId while the call frame still
       runs on the cancelled attempt is exactly the real cold-resume shape, and
       that call is now settled (see below). A call of another attempt has both
       its message and its own frame on that attempt. */
    const list = messages();
    list[1].meta = { ...list[1].meta, attemptId: "unchain-successor" };
    list[1].traceFrames = list[1].traceFrames.map((frame) => (
      frame.payload?.confirmation_id === target.interactionId
        ? { ...frame, run_id: "unchain-successor" } : frame));
    expect(settleCancelledInteraction(list, evidence).changed).toBe(false);
  });

  test("a resumed message keeps the cancelled call it still holds", () => {
    const list = messages();
    list[1].meta = { ...list[1].meta, attemptId: "unchain-successor" };
    expect(settleCancelledInteraction(list, evidence).changed).toBe(true);
  });

  test("leaves another chat's identical-looking call alone", () => {
    const other = messages();
    other[1].meta = { ...other[1].meta, executionSessionId: "chat-other" };
    expect(settleCancelledInteraction(other, evidence).changed).toBe(false);
  });

  test("refuses an ambiguous owner", () => {
    const list = messages();
    const call = list[1].traceFrames.find((frame) => frame.payload?.confirmation_id === target.interactionId);
    list[1].traceFrames.push({ ...copy(call), seq: 9, payload: { ...call.payload, call_id: "another-call" } });
    expect(settleCancelledInteraction(list, evidence).changed).toBe(false);
  });

  test("does nothing without admitted evidence", () => {
    const list = messages();
    expect(settleCancelledInteraction(list, null)).toEqual({ changed: false, messages: list });
  });
});

/* R-CANCEL-02: after an approved first wait the run resumes as a new attempt.
   Real host reply for the second wait: attempt_id is the resumed attempt and
   source_attempt_id the original root; both are checked, separately. */
describe("a resumed attempt's cancelled approval", () => {
  // eslint-disable-next-line global-require
  const resumed = require("../../COMPONENTs/chat-bubble/__fixtures__/ticket_357_resumed_cancel.json");
  const resumedTarget = resumed.target;
  const resumedMessages = (attemptId = resumedTarget.attemptId) => [
    { id: "user-r", role: "user", content: "run it twice" },
    {
      id: "assistant-r",
      role: "assistant",
      status: "done",
      meta: { attemptId, executionSessionId: resumedTarget.sessionId },
      traceFrames: [{ ...copy(resumed.pending_before_cancel.presentation.trace_frame), seq: 1 }],
    },
  ];

  test("the real reply names a different current attempt and original source", () => {
    expect(resumed.cancel_response.attempt_id).toBe(resumedTarget.attemptId);
    expect(resumed.cancel_response.source_attempt_id).toBe(resumedTarget.sourceAttemptId);
    expect(resumedTarget.attemptId).not.toBe(resumedTarget.sourceAttemptId);
  });

  test("is admitted with both identities", () => {
    expect(admitDurableInteractionCancellation(resumed.cancel_response, resumedTarget)).toEqual({
      executionId: resumedTarget.sessionId,
      attemptId: resumedTarget.attemptId,
      sourceAttemptId: resumedTarget.sourceAttemptId,
      interactionId: resumedTarget.interactionId,
      reason: "user_stop",
    });
  });

  test.each([
    ["another original source", { source_attempt_id: "another-root" }],
    ["the original root as current attempt", { attempt_id: "review-cancel-root" }],
    ["no source for a resumed target", { source_attempt_id: undefined }],
  ])("refuses %s", (_label, patch) => {
    const reply = { ...copy(resumed.cancel_response), ...patch };
    Object.keys(patch).forEach((key) => patch[key] === undefined && delete reply[key]);
    expect(admitDurableInteractionCancellation(reply, resumedTarget)).toBeNull();
  });

  test("refuses a resumed reply when Stop did not know the original source", () => {
    expect(admitDurableInteractionCancellation(resumed.cancel_response, {
      ...resumedTarget, sourceAttemptId: "",
    })).toBeNull();
  });

  test("settles the second approval on the resumed message", () => {
    const evidence = admitDurableInteractionCancellation(resumed.cancel_response, resumedTarget);
    const { changed, messages: after } = settleCancelledInteraction(resumedMessages(), evidence, 9);
    expect(changed).toBe(true);
    expect(after[1].traceFrames[1].payload).toEqual(expect.objectContaining({
      call_id: "call-1",
      confirmation_id: resumedTarget.interactionId,
      attempt_id: resumedTarget.attemptId,
      source_attempt_id: resumedTarget.sourceAttemptId,
    }));
  });

  test("does not settle a message owned by an unrelated attempt", () => {
    const evidence = admitDurableInteractionCancellation(resumed.cancel_response, resumedTarget);
    expect(settleCancelledInteraction(resumedMessages("review-other"), evidence).changed).toBe(false);
  });

  test("still never overrides the already-approved first call", () => {
    const evidence = admitDurableInteractionCancellation(resumed.cancel_response, resumedTarget);
    const list = resumedMessages();
    list[1].traceFrames.push({ seq: 2, type: "tool_result", payload: { call_id: "call-1", status: "success" } });
    expect(settleCancelledInteraction(list, evidence).changed).toBe(false);
  });
});

/* R-CANCEL-03: cold-resumed child, first write approved, second approval
   stopped. Real desktop data, no identity rebinding: Stop targets the original
   root (which owns the pending interaction) and the reply names that root;
   the owning message's meta carries the later resume attempt. */
describe("a cancelled second approval after a cold resume", () => {
  // eslint-disable-next-line global-require
  const real = require("../../COMPONENTs/chat-bubble/__fixtures__/ticket_357_resumed_second_cancel.json");
  const targetOf = (request) => ({
    sessionId: request.execution_id,
    attemptId: request.attempt_id,
    sourceAttemptId: request.source_attempt_id,
    interactionId: request.interaction_id,
  });
  const stopped = () => [copy(real.owning_message_after_stop)];
  const evidence = () => admitDurableInteractionCancellation(
    real.actual_cancel.response, targetOf(real.actual_cancel.request),
  );
  const ROOT = "unchain-1793079055807-f1070b2e724e78";
  const RESUME = "unchain-1793079080594-b59010a21f0b4";

  test("the three identities are as observed", () => {
    const message = real.owning_message_after_stop;
    const second = message.traceFrames.find((frame) => frame.payload?.confirmation_id === real.actual_cancel.request.interaction_id);
    expect(message.meta.attemptId).toBe(RESUME);
    expect(real.actual_cancel.request.attempt_id).toBe(ROOT);
    expect(real.actual_cancel.response.attempt_id).toBe(ROOT);
    expect(second.run_id).toBe(ROOT);
  });

  test("the real reply is admitted for the root it targeted", () => {
    expect(evidence()).toEqual(expect.objectContaining({ attemptId: ROOT, sourceAttemptId: ROOT }));
  });

  test("settles the second approval on the resumed message", () => {
    const { changed, messages: after } = settleCancelledInteraction(stopped(), evidence(), 7);
    expect(changed).toBe(true);
    const added = after[0].traceFrames.filter((frame) => frame.type === INTERACTION_CANCELLED_FRAME_TYPE);
    expect(added).toHaveLength(1);
    expect(added[0].payload).toEqual(expect.objectContaining({
      call_id: "qa-cancel-after-cold-write-2",
      confirmation_id: real.actual_cancel.request.interaction_id,
      attempt_id: ROOT,
    }));
    expect(added[0].run_id).toBe(ROOT);
  });

  test("the approved first write is never marked as not run", () => {
    const first = admitDurableInteractionCancellation(real.actual_cancel.response, {
      ...targetOf(real.actual_cancel.request), interactionId: "interaction_c978dbda8ecdaf29ed8f42030bafcd80",
    });
    expect(settleCancelledInteraction(stopped(), first).changed).toBe(false);
  });

  test("the direct waiting Stop still settles (positive control)", () => {
    const message = copy(real.direct_control_message);
    message.traceFrames = message.traceFrames.filter((frame) => frame.type !== INTERACTION_CANCELLED_FRAME_TYPE);
    const direct = admitDurableInteractionCancellation(real.direct_cancel.response, targetOf(real.direct_cancel.request));
    expect(settleCancelledInteraction([message], direct).changed).toBe(true);
  });

  test("another chat's message is not settled", () => {
    const list = stopped();
    list[0].meta = { ...list[0].meta, executionSessionId: "chat-other" };
    expect(settleCancelledInteraction(list, evidence()).changed).toBe(false);
  });

  test("a frame owned by an unrelated attempt is not settled when the message is not the attempt's either", () => {
    const list = stopped();
    list[0].traceFrames = list[0].traceFrames.map((frame) => (
      frame.payload?.confirmation_id === real.actual_cancel.request.interaction_id
        ? { ...frame, run_id: "unchain-other-root" } : frame));
    expect(settleCancelledInteraction(list, evidence()).changed).toBe(false);
  });

  test("a frame in another chat's session is not settled", () => {
    const list = stopped();
    list[0].traceFrames = list[0].traceFrames.map((frame) => (
      frame.payload?.confirmation_id === real.actual_cancel.request.interaction_id
        ? { ...frame, session_id: "chat-other" } : frame));
    expect(settleCancelledInteraction(list, evidence()).changed).toBe(false);
  });

  test("a different interaction is not settled", () => {
    const wrong = admitDurableInteractionCancellation(real.actual_cancel.response, {
      ...targetOf(real.actual_cancel.request), interactionId: "interaction_unrelated",
    });
    expect(settleCancelledInteraction(stopped(), wrong).changed).toBe(false);
  });
});

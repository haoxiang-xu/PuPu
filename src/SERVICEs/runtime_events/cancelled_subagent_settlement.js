import { admitDurableInteractionCancellation } from "./cancelled_interaction_settlement";
import {
  SETTLEMENT_RECORD_FRAME_TYPE,
  SETTLEMENT_RECORD_ORIGIN,
  admitSettlementProjection,
  bindingKey,
  collectSubagentSettlements,
} from "./subagent_settlement";

/* Delegate cancellation settlement (#357). A Stop reply may carry
   subagent_settlements: the producer's own versioned projections of each
   child it committed as cancelled. They are used only when the reply itself
   passed the exact Stop admission, each projection passes the same strict
   validator as a streamed settlement, and it names exactly one original
   delegate/handoff call in this execution (call id + tool + the consumer node
   attempt that made the call). The record keeps every earlier frame, only
   moves the known child's status, and never infers anything from the root
   being cancelled. */

const text = (value) => (typeof value === "string" ? value.trim() : "");
const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const containersOf = (message) => [
  ["traceFrames", null, Array.isArray(message?.traceFrames) ? message.traceFrames : []],
  ...Object.entries(isObject(message?.subagentFrames) ? message.subagentFrames : {})
    .filter(([, frames]) => Array.isArray(frames))
    .map(([branchId, frames]) => ["subagentFrames", branchId, frames]),
];

const frameGroupsOf = (message) => containersOf(message).map(([, , frames]) => frames);

export const recordCancelledSubagentSettlements = (messages, response, target, now = Date.now()) => {
  let list = Array.isArray(messages) ? messages : [];
  const evidence = admitDurableInteractionCancellation(response, target || {});
  const projections = response?.subagent_settlements;
  if (!evidence || !Array.isArray(projections)) {
    return { changed: false, messages: list };
  }
  // The whole reply is judged per call before anything is written: identical
  // receipts (by canonical bytes, so key order does not matter) collapse, and
  // a call that receives two different receipts is left unresolved rather
  // than settled by whichever came first.
  const groups = new Map();
  projections.forEach((projection) => {
    const admitted = admitSettlementProjection(projection);
    if (!admitted || admitted.executionId !== evidence.executionId) return;
    const key = bindingKey(admitted.consumerAttemptId, admitted.callId, admitted.toolName);
    const group = groups.get(key);
    if (!group) {
      groups.set(key, { admitted, projection, conflicted: false });
    } else if (group.admitted.fingerprint !== admitted.fingerprint) {
      group.conflicted = true;
    }
  });
  let changed = false;
  groups.forEach(({ admitted, projection, conflicted }) => {
    if (conflicted) return;
    // Exactly one original call, made by the consumer node attempt.
    const owners = [];
    list.forEach((message, messageIndex) => {
      if (
        message?.role !== "assistant" ||
        (text(message?.meta?.executionSessionId) &&
          text(message.meta.executionSessionId) !== evidence.executionId)
      ) {
        return;
      }
      containersOf(message).forEach(([container, branchId, frames]) => {
        frames.forEach((frame) => {
          if (
            frame?.type === "tool_call" &&
            frame.run_id === admitted.consumerAttemptId &&
            frame.payload?.call_id === admitted.callId &&
            frame.payload?.tool_name === admitted.toolName &&
            (frame.session_id === undefined || frame.session_id === evidence.executionId)
          ) {
            owners.push({ messageIndex, container, branchId, frames });
          }
        });
      });
    });
    if (owners.length !== 1) return;
    const { messageIndex, container, branchId, frames } = owners[0];
    const message = list[messageIndex];
    // Same receipt already recorded: nothing to do. Any other settlement for
    // this call (e.g. a streamed completion) is a contradiction: keep both
    // out rather than overwrite.
    const known = collectSubagentSettlements(frameGroupsOf(message)).get(
      bindingKey(admitted.consumerAttemptId, admitted.callId, admitted.toolName),
    );
    if (known) return;
    const maxSeq = frames.reduce((highest, frame) => {
      const seq = Number(frame?.seq);
      return Number.isFinite(seq) && seq > highest ? seq : highest;
    }, 0);
    const recordFrame = {
      seq: maxSeq + 0.1,
      ts: now,
      type: SETTLEMENT_RECORD_FRAME_TYPE,
      stage: "client",
      run_id: admitted.sourceAttemptId,
      session_id: evidence.executionId,
      links: {
        parent_run_id: admitted.consumerAttemptId,
        tool_call_id: admitted.callId,
      },
      payload: {
        origin: SETTLEMENT_RECORD_ORIGIN,
        status: admitted.status,
        settlement: JSON.parse(JSON.stringify(projection)),
        cancel_attempt_id: evidence.attemptId,
        cancel_source_attempt_id: evidence.sourceAttemptId,
        interaction_id: evidence.interactionId,
      },
    };
    const nextFrames = [...frames, recordFrame];
    const savedMeta = isObject(message.subagentMetaByRunId)
      ? message.subagentMetaByRunId[admitted.sourceAttemptId]
      : null;
    const nextMessage = {
      ...message,
      updatedAt: now,
      ...(container === "traceFrames"
        ? { traceFrames: nextFrames }
        : { subagentFrames: { ...message.subagentFrames, [branchId]: nextFrames } }),
      // Only this child's own settled status moves; known fields stay.
      ...(isObject(savedMeta)
        ? {
            subagentMetaByRunId: {
              ...message.subagentMetaByRunId,
              [admitted.sourceAttemptId]: { ...savedMeta, status: admitted.status },
            },
          }
        : {}),
    };
    list = list.map((item, index) => (index === messageIndex ? nextMessage : item));
    changed = true;
  });
  return { changed, messages: list };
};

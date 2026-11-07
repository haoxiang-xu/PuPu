/* Cancelled approvals (#357). Stop confirms through /chat/executions/cancel;
   only a reply that names this exact execution and attempt, reports the run
   cancelled and says the durable interaction itself was cancelled proves the
   approval-gated call never ran. That proof is recorded once, as a client
   frame on the one call that owns the interaction, so a reopened chat shows
   the same state. Nothing here infers from the run's or the model's text. */

export const INTERACTION_CANCELLED_FRAME_TYPE = "interaction_cancelled";

const text = (value) => (typeof value === "string" ? value.trim() : "");
const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/* The current attempt and the original source are separate identities: a run
   resumed after an earlier approval answers with its own attempt_id and the
   root it continues as source_attempt_id. Each must match what Stop sent. */
export const admitDurableInteractionCancellation = (
  response,
  { sessionId, attemptId, sourceAttemptId, interactionId } = {},
) => {
  const expectedSession = text(sessionId);
  const expectedAttempt = text(attemptId);
  const expectedSource = text(sourceAttemptId) || expectedAttempt;
  const expectedInteraction = text(interactionId);
  if (!isObject(response) || !expectedSession || !expectedAttempt || !expectedInteraction) {
    return null;
  }
  const hasSource = Object.prototype.hasOwnProperty.call(response, "source_attempt_id");
  if (
    !["ok", "cancelled"].includes(text(response.status)) ||
    text(response.state) !== "cancelled" ||
    response.durable_interaction_cancelled !== true ||
    text(response.execution_id) !== expectedSession ||
    text(response.attempt_id) !== expectedAttempt ||
    (hasSource
      ? text(response.source_attempt_id) !== expectedSource
      : expectedSource !== expectedAttempt)
  ) {
    return null;
  }
  return {
    executionId: expectedSession,
    attemptId: expectedAttempt,
    sourceAttemptId: expectedSource,
    interactionId: expectedInteraction,
    reason: text(response.cancellation?.reason),
  };
};

const SETTLED_TYPES = new Set([
  "tool_confirmed",
  "tool_denied",
  "tool_result",
  INTERACTION_CANCELLED_FRAME_TYPE,
]);

const frameContainers = (message) => [
  ["traceFrames", null, Array.isArray(message?.traceFrames) ? message.traceFrames : []],
  ...Object.entries(isObject(message?.subagentFrames) ? message.subagentFrames : {})
    .filter(([, frames]) => Array.isArray(frames))
    .map(([branchId, frames]) => ["subagentFrames", branchId, frames]),
];

export const cancelledInteractionIds = (frames) =>
  new Set(
    (Array.isArray(frames) ? frames : [])
      .filter(
        (frame) =>
          frame?.type === INTERACTION_CANCELLED_FRAME_TYPE &&
          frame.payload?.durable_interaction_cancelled === true &&
          text(frame.payload?.confirmation_id),
      )
      .map((frame) => text(frame.payload.confirmation_id)),
  );

export const settleCancelledInteraction = (messages, evidence, now = Date.now()) => {
  const list = Array.isArray(messages) ? messages : [];
  if (!evidence) {
    return { changed: false, messages: list };
  }
  /* The owning call belongs to the verified attempts either through its
     message (meta.attemptId) or through its own frame (run_id). After a cold
     resume the message carries the later resume attempt while the waiting
     call, the Stop target and the reply all stay on the original root; the
     frame binding covers that without trusting any other attempt. */
  const verified = [evidence.attemptId, evidence.sourceAttemptId];
  const owners = [];
  list.forEach((message, messageIndex) => {
    if (
      message?.role !== "assistant" ||
      (text(message?.meta?.executionSessionId) &&
        text(message.meta.executionSessionId) !== evidence.executionId)
    ) {
      return;
    }
    const messageOwned = verified.includes(text(message?.meta?.attemptId));
    frameContainers(message).forEach(([container, branchId, frames]) => {
      frames.forEach((frame) => {
        if (
          frame?.type === "tool_call" &&
          frame.payload?.requires_confirmation === true &&
          text(frame.payload?.confirmation_id) === evidence.interactionId &&
          (messageOwned || verified.includes(text(frame.run_id))) &&
          (frame.session_id === undefined ||
            text(frame.session_id) === evidence.executionId)
        ) {
          owners.push({ messageIndex, container, branchId, frames, frame });
        }
      });
    });
  });
  if (owners.length !== 1) {
    return { changed: false, messages: list };
  }
  const { messageIndex, container, branchId, frames, frame: call } = owners[0];
  const callId = text(call.payload?.call_id);
  const alreadySettled = frames.some(
    (frame) =>
      SETTLED_TYPES.has(frame?.type) &&
      ((callId && text(frame.payload?.call_id) === callId) ||
        text(frame.payload?.confirmation_id) === evidence.interactionId),
  );
  if (alreadySettled) {
    return { changed: false, messages: list };
  }
  const maxSeq = frames.reduce((highest, frame) => {
    const seq = Number(frame?.seq);
    return Number.isFinite(seq) && seq > highest ? seq : highest;
  }, 0);
  const cancelledFrame = {
    seq: maxSeq + 0.1,
    ts: now,
    type: INTERACTION_CANCELLED_FRAME_TYPE,
    stage: "client",
    ...(call.run_id !== undefined ? { run_id: call.run_id } : {}),
    ...(call.links !== undefined ? { links: call.links } : {}),
    ...(call.session_id !== undefined ? { session_id: call.session_id } : {}),
    payload: {
      tool_name: call.payload?.tool_name,
      call_id: callId,
      confirmation_id: evidence.interactionId,
      execution_id: evidence.executionId,
      attempt_id: evidence.attemptId,
      source_attempt_id: evidence.sourceAttemptId,
      reason: evidence.reason,
      durable_interaction_cancelled: true,
      synthetic: true,
    },
  };
  const nextFrames = [...frames, cancelledFrame];
  const next = list.map((message, index) => {
    if (index !== messageIndex) return message;
    if (container === "traceFrames") {
      return { ...message, updatedAt: now, traceFrames: nextFrames };
    }
    return {
      ...message,
      updatedAt: now,
      subagentFrames: { ...message.subagentFrames, [branchId]: nextFrames },
    };
  });
  return { changed: true, messages: next };
};

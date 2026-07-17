const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const normalizedString = (value) =>
  typeof value === "string" ? value.trim() : "";

const traceFrameConfirmationId = (frame) =>
  normalizedString(frame?.payload?.confirmation_id);

const traceFrameCallId = (frame) => normalizedString(frame?.payload?.call_id);

const messageTraceCollections = (message) => {
  const collections = [
    Array.isArray(message?.traceFrames) ? message.traceFrames : [],
  ];
  const subagentFrames = isObject(message?.subagentFrames)
    ? message.subagentFrames
    : {};
  Object.values(subagentFrames).forEach((frames) => {
    if (Array.isArray(frames)) {
      collections.push(frames);
    }
  });
  return collections;
};

export const normalizePendingInteraction = (
  rawPending,
  expectedSessionId = "",
) => {
  if (!isObject(rawPending)) {
    return null;
  }

  const status = normalizedString(rawPending.status);
  const sessionId = normalizedString(rawPending.session_id);
  const interactionId = normalizedString(rawPending.interaction_id);
  const normalizedExpectedSessionId = normalizedString(expectedSessionId);
  if (status === "none") {
    return {
      status: "none",
      sessionId: sessionId || normalizedExpectedSessionId,
    };
  }
  if (
    !["awaiting_response", "receipt_recorded"].includes(status) ||
    !sessionId ||
    !interactionId ||
    (normalizedExpectedSessionId && sessionId !== normalizedExpectedSessionId)
  ) {
    return null;
  }

  const presentation = isObject(rawPending.presentation)
    ? rawPending.presentation
    : {};
  const toolCall = isObject(presentation.tool_call)
    ? { ...presentation.tool_call }
    : {};
  const rawTraceFrame = isObject(presentation.trace_frame)
    ? presentation.trace_frame
    : null;
  const traceFrame = rawTraceFrame
    ? {
        ...rawTraceFrame,
        payload: {
          ...toolCall,
          ...(isObject(rawTraceFrame.payload) ? rawTraceFrame.payload : {}),
          confirmation_id: interactionId,
          requires_confirmation: true,
        },
      }
    : {
        seq: 0,
        ts: Date.now(),
        type: "tool_call",
        stage: "durable_recovery",
        payload: {
          ...toolCall,
          confirmation_id: interactionId,
          requires_confirmation: true,
        },
      };
  const callId =
    traceFrameCallId(traceFrame) || normalizedString(toolCall.call_id) || interactionId;

  return {
    status,
    sessionId,
    interactionId,
    kind: normalizedString(rawPending.kind),
    sourceRunId: normalizedString(rawPending.source_run_id),
    activeAttemptId: normalizedString(rawPending.active_attempt_id),
    receiptId: normalizedString(rawPending.receipt_id),
    resumeAvailable: rawPending.resume_available === true,
    resumeUnavailableReason: normalizedString(
      rawPending.resume_unavailable_reason,
    ),
    resumeOptions: isObject(rawPending.resume_options)
      ? { ...rawPending.resume_options }
      : {},
    resolution: isObject(rawPending.resolution)
      ? { ...rawPending.resolution }
      : null,
    callId,
    traceFrame: {
      ...traceFrame,
      payload: {
        ...(isObject(traceFrame.payload) ? traceFrame.payload : {}),
        call_id: callId,
        confirmation_id: interactionId,
        requires_confirmation: true,
      },
    },
  };
};

export const findDurableInteractionOwnerMessageId = (
  messages,
  interactionId,
  callId = "",
) => {
  const normalizedInteractionId = normalizedString(interactionId);
  const normalizedCallId = normalizedString(callId);
  if (!normalizedInteractionId && !normalizedCallId) {
    return "";
  }

  for (const message of Array.isArray(messages) ? messages : []) {
    for (const frames of messageTraceCollections(message)) {
      if (
        frames.some(
          (frame) =>
            frame?.type === "tool_call" &&
            ((normalizedInteractionId &&
              traceFrameConfirmationId(frame) === normalizedInteractionId) ||
              (normalizedCallId && traceFrameCallId(frame) === normalizedCallId)),
        )
      ) {
        return normalizedString(message?.id);
      }
    }
  }
  return "";
};

const durableMessageId = (interactionId) => {
  const safeId = normalizedString(interactionId).replace(/[^a-zA-Z0-9_.-]/g, "_");
  return `assistant-durable-${safeId || "pending"}`;
};

export const ensureDurableInteractionMessage = (
  messages,
  pending,
  now = Date.now(),
) => {
  const sourceMessages = Array.isArray(messages) ? messages : [];
  if (!pending || pending.status === "none") {
    return { messages: sourceMessages, ownerMessageId: "", created: false };
  }
  const existingOwnerId = findDurableInteractionOwnerMessageId(
    sourceMessages,
    pending.interactionId,
    pending.callId,
  );
  if (existingOwnerId) {
    return {
      messages: sourceMessages,
      ownerMessageId: existingOwnerId,
      created: false,
    };
  }

  const ownerMessageId = durableMessageId(pending.interactionId);
  return {
    messages: [
      ...sourceMessages,
      {
        id: ownerMessageId,
        role: "assistant",
        content: "",
        createdAt: now,
        updatedAt: now,
        status: "done",
        traceFrames: [pending.traceFrame],
        subagentFrames: {},
        subagentMetaByRunId: {},
        meta: {
          durableInteraction: {
            sessionId: pending.sessionId,
            interactionId: pending.interactionId,
          },
        },
      },
    ],
    ownerMessageId,
    created: true,
  };
};

export const prepareDurableInteractionResumeMessages = (
  messages,
  pending,
  ownerMessageId = "",
  now = Date.now(),
) => {
  const ensured = ensureDurableInteractionMessage(messages, pending, now);
  const resolvedOwnerId =
    normalizedString(ownerMessageId) || ensured.ownerMessageId;
  return {
    ownerMessageId: resolvedOwnerId,
    messages: ensured.messages.map((message) =>
      normalizedString(message?.id) === resolvedOwnerId
        ? {
            ...message,
            updatedAt: now,
            status: "streaming",
          }
        : message,
    ),
  };
};

export const buildRecoveredConfirmationRequest = ({
  pending,
  chatId,
  ownerMessageId,
  requestedAt = Date.now(),
}) => {
  const payload = isObject(pending?.traceFrame?.payload)
    ? pending.traceFrame.payload
    : {};
  return {
    confirmationId: pending.interactionId,
    callId: pending.callId,
    chatId: normalizedString(chatId),
    sessionId: pending.sessionId,
    ownerMessageId: normalizedString(ownerMessageId),
    toolName: normalizedString(payload.tool_name),
    toolkitId: normalizedString(payload.toolkit_id),
    toolDisplayName: normalizedString(payload.tool_display_name),
    arguments: isObject(payload.arguments) ? payload.arguments : {},
    description: normalizedString(payload.description),
    interactType: normalizedString(payload.interact_type) || "confirmation",
    interactConfig: isObject(payload.interact_config)
      ? payload.interact_config
      : {},
    requestedAt,
    durable: true,
  };
};

export const buildDurableResumePayload = (pending) => ({
  mode: "resume_interaction",
  threadId: pending.sessionId,
  interaction_id: pending.interactionId,
  ...(normalizedString(pending.sourceRunId)
    ? { source_attempt_id: normalizedString(pending.sourceRunId) }
    : {}),
  message: "",
  history: [],
  attachments: [],
  options: isObject(pending.resumeOptions) ? pending.resumeOptions : {},
  trace_level: "minimal",
});

const RETRYABLE_DURABLE_ERROR_CODES = new Set([
  "active_execution_lease",
  "execution_lease_conflict",
  "execution_lease_expired",
  "execution_lease_not_owned",
  "interaction_temporarily_locked",
  "session_revision_conflict",
  "stale_execution_lease",
]);

export const isRetryableDurableInteractionError = (error) => {
  const code = normalizedString(error?.code);
  if (RETRYABLE_DURABLE_ERROR_CODES.has(code)) {
    return true;
  }
  const message = normalizedString(error?.message).toLowerCase();
  return [...RETRYABLE_DURABLE_ERROR_CODES].some((candidate) =>
    message.includes(candidate),
  );
};

export const durableInteractionRetryDelayMs = (attempt) => {
  const normalizedAttempt = Number.isFinite(Number(attempt))
    ? Math.max(0, Math.floor(Number(attempt)))
    : 0;
  return Math.min(15000, 1000 * 2 ** normalizedAttempt);
};

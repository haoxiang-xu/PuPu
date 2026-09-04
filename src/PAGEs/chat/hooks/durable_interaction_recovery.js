const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const normalizedString = (value) =>
  typeof value === "string" ? value.trim() : "";

const DURABLE_INTERACTION_KINDS = new Set([
  "human_input",
  "max_budget",
  "tool_approval",
]);
const PENDING_INTERACTION_BASE_KEYS = [
  "status",
  "session_id",
  "interaction_id",
  "source_run_id",
  "active_attempt_id",
  "kind",
  "provider",
  "model",
  "presentation",
  "resume_available",
  "resume_options",
];

const hasExactKeys = (value, expectedKeys) => {
  const keys = Object.keys(value);
  return (
    keys.length === expectedKeys.length &&
    expectedKeys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
};

const DURABLE_PRESENTATION_KEYS = ["trace_frame", "tool_call"];
const DURABLE_TRACE_FRAME_KEYS = [
  "seq",
  "ts",
  "type",
  "run_id",
  "stage",
  "payload",
];
const DURABLE_TOOL_CALL_KEYS = [
  "tool_name",
  "tool_display_name",
  "toolkit_id",
  "toolkit_name",
  "call_id",
  "arguments",
  "description",
  "confirmation_id",
  "requires_confirmation",
  "interact_type",
  "interact_config",
];
const DURABLE_MAX_BUDGET_TOOL_CALL_KEYS = DURABLE_TOOL_CALL_KEYS.filter(
  (key) => key !== "toolkit_id" && key !== "toolkit_name",
);
const HUMAN_INPUT_ARGUMENT_KEYS = [
  "request_id",
  "kind",
  "title",
  "question",
  "selection_mode",
  "options",
  "allow_other",
  "other_label",
  "other_placeholder",
  "min_selected",
  "max_selected",
];
const HUMAN_INPUT_OPTION_KEYS = ["label", "value", "description"];
const MAX_BUDGET_CONFIG_KEYS = [
  "effective_max",
  "suggested_extra_iterations",
];

const jsonValuesEqual = (left, right) => {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => jsonValuesEqual(value, right[index]))
    );
  }
  if (!isObject(left) || !isObject(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] && jsonValuesEqual(left[key], right[key]),
    )
  );
};

const isCanonicalHumanInputPayload = (toolCall) => {
  const payload = toolCall.arguments;
  if (
    !isObject(payload) ||
    !hasExactKeys(payload, HUMAN_INPUT_ARGUMENT_KEYS) ||
    !jsonValuesEqual(payload, toolCall.interact_config) ||
    normalizedString(payload.request_id) !== normalizedString(toolCall.call_id) ||
    payload.kind !== "selector" ||
    !normalizedString(payload.title) ||
    !normalizedString(payload.question) ||
    !["single", "multiple"].includes(payload.selection_mode) ||
    !Array.isArray(payload.options) ||
    payload.options.length === 0 ||
    payload.options.some(
      (option) =>
        !isObject(option) ||
        !hasExactKeys(option, HUMAN_INPUT_OPTION_KEYS) ||
        !normalizedString(option.label) ||
        !normalizedString(option.value) ||
        typeof option.description !== "string",
    ) ||
    typeof payload.allow_other !== "boolean" ||
    typeof payload.other_label !== "string" ||
    typeof payload.other_placeholder !== "string" ||
    !Number.isInteger(payload.min_selected) ||
    !Number.isInteger(payload.max_selected) ||
    toolCall.description !== payload.question ||
    toolCall.interact_type !==
      (payload.selection_mode === "single" ? "single" : "multi")
  ) {
    return false;
  }
  return true;
};

const isCanonicalDurablePresentation = (
  presentation,
  { kind, interactionId, sourceRunId },
) => {
  if (!isObject(presentation) || !hasExactKeys(presentation, DURABLE_PRESENTATION_KEYS)) {
    return false;
  }
  const traceFrame = presentation.trace_frame;
  const toolCall = presentation.tool_call;
  const expectedToolKeys =
    kind === "max_budget"
      ? DURABLE_MAX_BUDGET_TOOL_CALL_KEYS
      : DURABLE_TOOL_CALL_KEYS;
  if (
    !isObject(traceFrame) ||
    !hasExactKeys(traceFrame, DURABLE_TRACE_FRAME_KEYS) ||
    traceFrame.seq !== 0 ||
    !Number.isSafeInteger(traceFrame.ts) ||
    traceFrame.ts < 0 ||
    traceFrame.type !== "tool_call" ||
    normalizedString(traceFrame.run_id) !== sourceRunId ||
    traceFrame.stage !== "durable_recovery" ||
    !isObject(toolCall) ||
    !isObject(traceFrame.payload) ||
    !hasExactKeys(toolCall, expectedToolKeys) ||
    !hasExactKeys(traceFrame.payload, expectedToolKeys) ||
    !jsonValuesEqual(toolCall, traceFrame.payload) ||
    normalizedString(toolCall.confirmation_id) !== interactionId ||
    toolCall.requires_confirmation !== true ||
    !normalizedString(toolCall.call_id) ||
    !normalizedString(toolCall.tool_name) ||
    typeof toolCall.tool_display_name !== "string" ||
    !isObject(toolCall.arguments) ||
    typeof toolCall.description !== "string" ||
    !normalizedString(toolCall.interact_type) ||
    (!isObject(toolCall.interact_config) &&
      !Array.isArray(toolCall.interact_config))
  ) {
    return false;
  }
  if (
    kind === "human_input" &&
    (toolCall.tool_name !== "ask_user_question" ||
      toolCall.tool_display_name !== "Ask User" ||
      toolCall.toolkit_id !== "core" ||
      toolCall.toolkit_name !== "Core" ||
      !isCanonicalHumanInputPayload(toolCall))
  ) {
    return false;
  }
  if (
    kind === "max_budget" &&
    (toolCall.tool_name !== "__continuation__" ||
      toolCall.tool_display_name !== "Continue?" ||
      toolCall.call_id !== `continuation-${interactionId}` ||
      !hasExactKeys(toolCall.arguments, []) ||
      toolCall.description !==
        "Agent reached its iteration limit without a final response." ||
      toolCall.interact_type !== "confirmation" ||
      !isObject(toolCall.interact_config) ||
      !hasExactKeys(toolCall.interact_config, MAX_BUDGET_CONFIG_KEYS) ||
      !Number.isInteger(toolCall.interact_config.effective_max) ||
      !Number.isInteger(
        toolCall.interact_config.suggested_extra_iterations,
      ))
  ) {
    return false;
  }
  return true;
};

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
    if (
      !normalizedExpectedSessionId ||
      !sessionId ||
      sessionId !== normalizedExpectedSessionId ||
      !hasExactKeys(rawPending, ["status", "session_id"])
    ) {
      return null;
    }
    return {
      status: "none",
      sessionId,
    };
  }
  const kind = normalizedString(rawPending.kind);
  const sourceRunId = normalizedString(rawPending.source_run_id);
  const activeAttemptId = normalizedString(rawPending.active_attempt_id);
  const hasGraphResumeKeys = [
    "resume_kind",
    "graph_step_attempt_id",
    "graph_coordinator_attempt_id",
  ].some((key) => Object.prototype.hasOwnProperty.call(rawPending, key));
  const hasUnavailableReason = Object.prototype.hasOwnProperty.call(
    rawPending,
    "resume_unavailable_reason",
  );
  const resumeKeys = hasGraphResumeKeys
    ? [
        "resume_kind",
        "graph_step_attempt_id",
        "graph_coordinator_attempt_id",
      ]
    : hasUnavailableReason
      ? ["resume_unavailable_reason"]
      : [];
  const statusKeys =
    status === "receipt_recorded" ? ["receipt_id", "resolution"] : [];
  if (
    !["awaiting_response", "receipt_recorded"].includes(status) ||
    !normalizedExpectedSessionId ||
    !sessionId ||
    !interactionId ||
    sessionId !== normalizedExpectedSessionId ||
    !DURABLE_INTERACTION_KINDS.has(kind) ||
    typeof rawPending.provider !== "string" ||
    typeof rawPending.model !== "string" ||
    !sourceRunId ||
    !activeAttemptId ||
    activeAttemptId !== sourceRunId ||
    typeof rawPending.resume_available !== "boolean" ||
    !isObject(rawPending.resume_options) ||
    (hasGraphResumeKeys &&
      (rawPending.resume_kind !== "graph_step" || hasUnavailableReason)) ||
    (!hasGraphResumeKeys && rawPending.resume_kind !== undefined) ||
    (rawPending.resume_available === false && !hasUnavailableReason) ||
    (rawPending.resume_available === true && hasUnavailableReason) ||
    !hasExactKeys(rawPending, [
      ...PENDING_INTERACTION_BASE_KEYS,
      ...resumeKeys,
      ...statusKeys,
    ])
  ) {
    return null;
  }

  const presentation = rawPending.presentation;
  if (
    !isCanonicalDurablePresentation(presentation, {
      kind,
      interactionId,
      sourceRunId,
    })
  ) {
    return null;
  }
  const toolCall = presentation.tool_call;
  const rawTraceFrame = presentation.trace_frame;
  const rawTracePayload = rawTraceFrame.payload;
  const toolCallId = normalizedString(toolCall?.call_id);
  const traceCallId = normalizedString(rawTracePayload?.call_id);
  if (
    !toolCallId ||
    toolCallId !== traceCallId
  ) {
    return null;
  }
  const expectedToolName =
    kind === "human_input"
      ? "ask_user_question"
      : kind === "max_budget"
        ? "__continuation__"
        : "";
  if (
    expectedToolName &&
    (normalizedString(toolCall.tool_name) !== expectedToolName ||
      normalizedString(rawTracePayload.tool_name) !== expectedToolName)
  ) {
    return null;
  }

  const resumeKind = normalizedString(rawPending.resume_kind);
  if (
    (resumeKind && resumeKind !== "graph_step") ||
    (resumeKind === "graph_step" &&
      (normalizedString(rawPending.graph_step_attempt_id) !== sourceRunId ||
        !normalizedString(rawPending.graph_coordinator_attempt_id)))
  ) {
    return null;
  }

  const receiptId = normalizedString(rawPending.receipt_id);
  const resolution = isObject(rawPending.resolution)
    ? rawPending.resolution
    : null;
  if (status === "awaiting_response") {
    if (receiptId || resolution) {
      return null;
    }
  } else {
    const outcome = normalizedString(resolution?.outcome);
    const response = isObject(resolution?.response)
      ? resolution.response
      : null;
    const validHumanInputResolution =
      kind === "human_input" && outcome === "submitted" && response;
    const validDecisionResolution =
      kind !== "human_input" &&
      ["approved", "denied"].includes(outcome) &&
      response &&
      typeof response.approved === "boolean" &&
      response.approved === (outcome === "approved");
    if (!receiptId || (!validHumanInputResolution && !validDecisionResolution)) {
      return null;
    }
  }

  const traceFrame = {
    ...rawTraceFrame,
    payload: { ...rawTracePayload },
  };

  return {
    status,
    sessionId,
    interactionId,
    kind,
    sourceRunId,
    activeAttemptId,
    receiptId,
    resumeAvailable: rawPending.resume_available === true,
    resumeUnavailableReason: normalizedString(
      rawPending.resume_unavailable_reason,
    ),
    resumeOptions: isObject(rawPending.resume_options)
      ? { ...rawPending.resume_options }
      : {},
    resolution: resolution ? { ...resolution } : null,
    callId: toolCallId,
    traceFrame: {
      ...traceFrame,
      payload: {
        ...(isObject(traceFrame.payload) ? traceFrame.payload : {}),
        call_id: toolCallId,
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

const RECONCILE_DURABLE_RESUME_ERROR_CODES = new Set([
  "interaction_not_found",
  "interaction_superseded",
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

export const shouldReconcileDurableResumeError = (error) => {
  const code = normalizedString(error?.code);
  if (RECONCILE_DURABLE_RESUME_ERROR_CODES.has(code)) {
    return true;
  }
  const message = normalizedString(error?.message).toLowerCase();
  return (
    message.includes("no durable interaction found for this session and id") ||
    [...RECONCILE_DURABLE_RESUME_ERROR_CODES].some((candidate) =>
      message.includes(candidate),
    )
  );
};

export const durableInteractionRetryDelayMs = (attempt) => {
  const normalizedAttempt = Number.isFinite(Number(attempt))
    ? Math.max(0, Math.floor(Number(attempt)))
    : 0;
  return Math.min(15000, 1000 * 2 ** normalizedAttempt);
};

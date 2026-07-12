const HUMAN_INPUT_TOOL_NAME = "ask_user_question";
const CONTINUATION_TOOL_NAME = "__continuation__";
const RUN_PROMOTED_ARTIFACT_KINDS = new Set(["plan"]);
const INCREMENTAL_REDUCTION_META = Symbol("runtimeEventReductionMeta");
const ARTIFACT_SUMMARY_ORDER = Symbol("artifactSummaryOrder");

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const stringValue = (value, fallback = "") =>
  typeof value === "string" && value.trim() ? value.trim() : fallback;

const rawStringValue = (value, fallback = "") =>
  typeof value === "string" ? value : fallback;

const clone = (value) => {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_error) {
    return value;
  }
};

const parseTimestampMs = (value, fallback = Date.now()) => {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const iterationFromTurnId = (turnId) => {
  if (typeof turnId !== "string") {
    return null;
  }
  const match = turnId.match(/:turn-(\d+)$/);
  if (!match) {
    return null;
  }
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
};

const payloadOf = (event) => (isObject(event?.payload) ? event.payload : {});
const linksOf = (event) => (isObject(event?.links) ? event.links : {});
const surfaceOf = (event) => (isObject(event?.surface) ? event.surface : {});

const createProjectedActivityTreeState = () => ({
  session: null,
  status: "idle",
  rootRunId: "",
  rootRunIds: [],
  runsById: {},
  toolCallsById: {},
  inputRequestsById: {},
  modelTextByRunId: {},
  frames: [],
  framesByRunId: {},
  artifactSummariesByTurnId: {},
  effects: [],
  completionBundle: null,
  error: null,
  diagnostics: {
    unknownEvents: [],
    droppedEvents: [],
    duplicateEvents: [],
  },
  seq: 0,
});

const cloneDiagnostics = (diagnostics) => ({
  unknownEvents: Array.isArray(diagnostics?.unknownEvents)
    ? [...diagnostics.unknownEvents]
    : [],
  droppedEvents: Array.isArray(diagnostics?.droppedEvents)
    ? [...diagnostics.droppedEvents]
    : [],
  duplicateEvents: Array.isArray(diagnostics?.duplicateEvents)
    ? [...diagnostics.duplicateEvents]
    : [],
});

const createFrame = (state, event, type, payload = {}) => {
  const nextSeq = Number(state.seq) + 1;
  state.seq = nextSeq;
  const iteration = iterationFromTurnId(event.turn_id);
  return {
    seq: nextSeq,
    ts: parseTimestampMs(event.timestamp),
    type,
    run_id: stringValue(event.run_id),
    stage: "runtime_event",
    ...(iteration !== null ? { iteration } : {}),
    payload: {
      ...(isObject(payload) ? payload : {}),
      runtime_event_id: stringValue(event.event_id),
    },
  };
};

const isValidArtifactDescriptor = (artifact) =>
  isObject(artifact) &&
  Boolean(stringValue(artifact.artifact_id)) &&
  Boolean(stringValue(artifact.kind)) &&
  isObject(artifact.snapshot);

const resolveTurnId = (event) => {
  const direct = stringValue(event?.turn_id);
  if (direct) return direct;
  const payload = payloadOf(event);
  const fromOwner = stringValue(payload?.owner?.turn_id);
  if (fromOwner) return fromOwner;
  const links = linksOf(event);
  return stringValue(links?.turn_id);
};

const ensureArtifactBucket = (state, turnId) => {
  if (!turnId) return null;
  if (!state.artifactSummariesByTurnId[turnId]) {
    if (!Object.prototype.hasOwnProperty.call(state, ARTIFACT_SUMMARY_ORDER)) {
      Object.defineProperty(state, ARTIFACT_SUMMARY_ORDER, {
        configurable: true,
        writable: true,
        value: Object.keys(state.artifactSummariesByTurnId).length,
      });
    }
    state[ARTIFACT_SUMMARY_ORDER] += 1;
    state.artifactSummariesByTurnId[turnId] = {
      order: state[ARTIFACT_SUMMARY_ORDER],
      status: "pending",
      artifacts: [],
    };
  }
  return state.artifactSummariesByTurnId[turnId];
};

const upsertArtifactDescriptor = (bucket, artifact) => {
  const artifactId = stringValue(artifact?.artifact_id);
  if (!artifactId || !Array.isArray(bucket?.artifacts)) {
    return { changed: false, replaced: false };
  }

  const existingIdx = bucket.artifacts.findIndex(
    (a) => a?.artifact_id === artifactId,
  );
  if (existingIdx < 0) {
    bucket.artifacts.push(clone(artifact));
    return { changed: true, replaced: false };
  }

  const existing = bucket.artifacts[existingIdx];
  const incomingRevision = Number(artifact.revision);
  const existingRevision = Number(existing.revision);
  if (
    Number.isFinite(existingRevision) &&
    Number.isFinite(incomingRevision) &&
    incomingRevision < existingRevision
  ) {
    return { changed: false, replaced: true };
  }

  if (
    existingRevision === incomingRevision &&
    JSON.stringify(existing) === JSON.stringify(artifact)
  ) {
    return { changed: false, replaced: true };
  }

  bucket.artifacts[existingIdx] = clone(artifact);
  return { changed: true, replaced: true };
};

const ensureRun = (state, event, overrides = {}) => {
  const runId = stringValue(event.run_id);
  if (!runId) {
    return null;
  }
  const links = linksOf(event);
  const parentRunId = stringValue(links.parent_run_id);
  const previous = state.runsById[runId] || {};
  const payload = payloadOf(event);
  const next = {
    runId,
    agentId: stringValue(event.agent_id, stringValue(payload.agent_id)),
    parentRunId: parentRunId || previous.parentRunId || "",
    status: previous.status || "running",
    mode: stringValue(payload.mode, previous.mode || ""),
    template: stringValue(payload.template, previous.template || ""),
    batchId: stringValue(payload.batch_id, previous.batchId || ""),
    parentId: stringValue(payload.parent_id, previous.parentId || parentRunId),
    lineage: Array.isArray(payload.lineage)
      ? payload.lineage
      : Array.isArray(previous.lineage)
        ? previous.lineage
        : [],
    payload: {
      ...(isObject(previous.payload) ? previous.payload : {}),
      ...payload,
    },
    ...overrides,
  };
  state.runsById[runId] = next;
  if (!next.parentRunId && !state.rootRunIds.includes(runId)) {
    state.rootRunIds.push(runId);
  }
  return next;
};

const isChildRunEvent = (state, event) => {
  const links = linksOf(event);
  const parentRunId = stringValue(links.parent_run_id);
  if (parentRunId) {
    return true;
  }
  const runId = stringValue(event.run_id);
  return Boolean(state.rootRunId && runId && runId !== state.rootRunId);
};

const routeFrame = (state, event, frame) => {
  const runId = stringValue(event.run_id);
  const isChild = runId && isChildRunEvent(state, event);
  if (isChild) {
    if (!state.framesByRunId[runId]) {
      state.framesByRunId[runId] = [];
    }
    state.framesByRunId[runId].push(frame);
  } else {
    state.frames.push(frame);
  }
  state.effects.push({
    type: "frame",
    eventId: stringValue(event.event_id),
    frame,
  });
};

const activeChildRunIds = (state) =>
  Object.values(state.runsById)
    .filter(
      (run) =>
        run &&
        typeof run === "object" &&
        run.parentRunId &&
        run.status === "running",
    )
    .map((run) => run.runId)
    .filter(Boolean);

const eventForRun = (event, runId, parentRunId = "") => {
  const normalizedRunId = stringValue(runId);
  if (!normalizedRunId || normalizedRunId === stringValue(event.run_id)) {
    return event;
  }
  return {
    ...event,
    run_id: normalizedRunId,
    links: {
      ...linksOf(event),
      ...(parentRunId ? { parent_run_id: parentRunId } : {}),
    },
  };
};

const resolveHumanInputEvent = (state, event, { callId = "", requestId = "" } = {}) => {
  const runId = stringValue(event.run_id);
  if (!state.rootRunId || !runId || runId !== state.rootRunId) {
    return event;
  }

  const existingRunId =
    (requestId && state.inputRequestsById[requestId]?.runId) ||
    (callId && state.toolCallsById[callId]?.runId) ||
    "";
  if (existingRunId && existingRunId !== state.rootRunId) {
    return eventForRun(event, existingRunId, state.rootRunId);
  }

  const candidates = activeChildRunIds(state);
  if (candidates.length !== 1) {
    return event;
  }
  return eventForRun(event, candidates[0], state.rootRunId);
};

const buildSubagentPayload = (state, event, status = "") => {
  const payload = payloadOf(event);
  const links = linksOf(event);
  return {
    ...payload,
    root_run_id: stringValue(links.parent_run_id, state.rootRunId),
    child_run_id: stringValue(event.run_id),
    subagent_id: stringValue(event.agent_id, stringValue(payload.agent_id)),
    parent_id: stringValue(payload.parent_id, stringValue(links.parent_run_id)),
    ...(status ? { status } : {}),
  };
};

const inputRequestToToolCallPayload = (event) => {
  const payload = payloadOf(event);
  const links = linksOf(event);
  const inputRequestId = stringValue(
    links.input_request_id,
    stringValue(payload.request_id),
  );
  const callId = stringValue(
    links.tool_call_id,
    stringValue(payload.call_id, inputRequestId),
  );
  const kind = stringValue(payload.kind);
  const isContinuation = kind === "continue";
  const interactConfig = {
    ...(isObject(payload.interact_config) ? payload.interact_config : {}),
    ...(payload.title ? { title: payload.title } : {}),
    ...(payload.question ? { question: payload.question } : {}),
    ...(Array.isArray(payload.options) ? { options: payload.options } : {}),
    ...(payload.allow_other !== undefined
      ? { allow_other: payload.allow_other }
      : {}),
    ...(payload.other_label ? { other_label: payload.other_label } : {}),
    ...(payload.other_placeholder
      ? { other_placeholder: payload.other_placeholder }
      : {}),
    ...(payload.min_selected !== undefined
      ? { min_selected: payload.min_selected }
      : {}),
    ...(payload.max_selected !== undefined
      ? { max_selected: payload.max_selected }
      : {}),
  };

  return {
    call_id: callId,
    confirmation_id: inputRequestId,
    requires_confirmation: true,
    tool_name: isContinuation ? CONTINUATION_TOOL_NAME : HUMAN_INPUT_TOOL_NAME,
    description: stringValue(payload.question, stringValue(payload.title)),
    arguments: {
      request_id: inputRequestId,
      kind,
      ...(payload.question ? { question: payload.question } : {}),
      ...(Array.isArray(payload.options) ? { options: payload.options } : {}),
    },
    interact_type: stringValue(payload.interact_type, "confirmation"),
    interact_config: interactConfig,
  };
};

const inputResolvedToFramePayload = (event) => {
  const payload = payloadOf(event);
  const links = linksOf(event);
  const callId = stringValue(links.tool_call_id, stringValue(payload.call_id));
  const requestId = stringValue(
    links.input_request_id,
    stringValue(payload.confirmation_id),
  );
  return {
    call_id: callId || requestId,
    confirmation_id: requestId,
    user_response: payload.response,
    decision: stringValue(payload.decision, "approved"),
    ...(payload.reason ? { reason: payload.reason } : {}),
  };
};

const applyEvent = (state, event) => {
  const eventType = stringValue(event.type);
  const payload = payloadOf(event);
  const links = linksOf(event);
  const runId = stringValue(event.run_id);

  if (eventType === "session.started") {
    const threadId = stringValue(payload.thread_id, stringValue(event.session_id));
    const model = stringValue(payload.model);
    state.session = {
      sessionId: stringValue(event.session_id),
      threadId,
      model,
      traceLevel: stringValue(payload.trace_level),
    };
    state.effects.push({
      type: "meta",
      eventId: stringValue(event.event_id),
      meta: {
        ...(threadId ? { thread_id: threadId } : {}),
        ...(model ? { model } : {}),
      },
    });
    routeFrame(
      state,
      event,
      createFrame(state, event, "stream_started", {
        thread_id: threadId,
        model,
        trace_level: stringValue(payload.trace_level),
      }),
    );
    return;
  }

  if (eventType === "run.started") {
    if (isChildRunEvent(state, event)) {
      ensureRun(state, event, { status: "running" });
      routeFrame(
        state,
        event,
        createFrame(
          state,
          event,
          "subagent_started",
          buildSubagentPayload(state, event, "running"),
        ),
      );
      return;
    }
    if (!state.rootRunId && runId) {
      state.rootRunId = runId;
    }
    state.status = "running";
    ensureRun(state, event, { status: "running" });
    routeFrame(
      state,
      event,
      createFrame(state, event, "run_started", {
        ...payload,
        run_id: runId,
      }),
    );
    return;
  }

  if (eventType === "run.completed") {
    if (isChildRunEvent(state, event)) {
      ensureRun(state, event, {
        status: stringValue(payload.status, "completed"),
      });
      routeFrame(
        state,
        event,
        createFrame(
          state,
          event,
          "subagent_completed",
          buildSubagentPayload(
            state,
            event,
            stringValue(payload.status, "completed"),
          ),
        ),
      );
      return;
    }
    if (!state.rootRunId && runId) {
      state.rootRunId = runId;
    }
    ensureRun(state, event, {
      status: stringValue(payload.status, "completed"),
    });
    state.status = "completed";
    state.completionBundle = isObject(payload.usage) ? payload.usage : null;
    routeFrame(
      state,
      event,
      createFrame(state, event, "done", {
        ...payload,
        ...(state.completionBundle ? { bundle: state.completionBundle } : {}),
      }),
    );
    for (const [turnId, bucket] of Object.entries(state.artifactSummariesByTurnId)) {
      if (bucket.status !== "completed") {
        bucket.status = "completed";
        state.effects.push({
          type: "artifact_summary",
          eventId: stringValue(event.event_id),
          turnId,
          reason: "flushed",
        });
      }
    }
    return;
  }

  if (eventType === "run.failed") {
    const error = isObject(payload.error)
      ? payload.error
      : { code: "run_failed", message: "Run failed" };
    if (isChildRunEvent(state, event)) {
      ensureRun(state, event, {
        status: stringValue(payload.status, "failed"),
      });
      routeFrame(
        state,
        event,
        createFrame(
          state,
          event,
          "subagent_failed",
          buildSubagentPayload(
            state,
            event,
            stringValue(payload.status, "failed"),
          ),
        ),
      );
      return;
    }
    if (!state.rootRunId && runId) {
      state.rootRunId = runId;
    }
    state.status = "failed";
    state.error = {
      code: stringValue(error.code, "run_failed"),
      message: stringValue(error.message, "Run failed"),
    };
    routeFrame(
      state,
      event,
      createFrame(state, event, "error", {
        code: state.error.code,
        message: state.error.message,
        recoverable: payload.recoverable === true,
      }),
    );
    state.effects.push({
      type: "error",
      eventId: stringValue(event.event_id),
      error: state.error,
    });
    return;
  }

  if (eventType === "turn.started" || eventType === "turn.completed") {
    routeFrame(
      state,
      event,
      createFrame(
        state,
        event,
        eventType === "turn.started" ? "iteration_started" : "iteration_completed",
        payload,
      ),
    );
    if (eventType === "turn.completed") {
      const turnId = resolveTurnId(event);
      const bucket = state.artifactSummariesByTurnId[turnId];
      if (bucket && bucket.status !== "completed") {
        bucket.status = "completed";
        state.effects.push({
          type: "artifact_summary",
          eventId: stringValue(event.event_id),
          turnId,
          reason: "completed",
        });
      }
    }
    return;
  }

  if (eventType === "artifact.created") {
    const artifact = payloadOf(event);
    if (!isValidArtifactDescriptor(artifact)) {
      return;
    }
    const turnId = resolveTurnId(event);
    const bucket = ensureArtifactBucket(state, turnId);
    if (!bucket) return;
    const result = upsertArtifactDescriptor(bucket, artifact);
    if (result.changed && bucket.status === "completed") {
      state.effects.push({
        type: "artifact_summary",
        eventId: stringValue(event.event_id),
        turnId,
        reason: "created",
      });
    }
    return;
  }

  if (eventType === "artifact.updated") {
    const artifact = payloadOf(event);
    if (!isValidArtifactDescriptor(artifact)) {
      return;
    }
    const kind = stringValue(artifact.kind);
    const turnId = resolveTurnId(event);
    const bucket = ensureArtifactBucket(state, turnId);
    if (!bucket) return;
    const artifactId = stringValue(artifact.artifact_id);
    const result = upsertArtifactDescriptor(bucket, artifact);
    if (!result.changed) {
      return;
    }
    if (result.replaced && kind === "file_diff") {
      // eslint-disable-next-line no-console
      console.warn(
        `[activity_tree] unexpected artifact.updated for file_diff ${artifactId}; replacing in place`,
      );
    }
    if (bucket.status === "completed") {
      state.effects.push({
        type: "artifact_summary",
        eventId: stringValue(event.event_id),
        turnId,
        reason: "updated",
      });
    }
    return;
  }

  if (eventType === "model.started") {
    routeFrame(state, event, createFrame(state, event, "request_messages", payload));
    return;
  }

  if (eventType === "interaction.fyi_injected") {
    routeFrame(state, event, createFrame(state, event, "fyi_injected", payload));
    return;
  }

  if (eventType === "model.delta") {
    const kind = stringValue(payload.kind, "text");
    const delta = rawStringValue(payload.delta);
    if (kind === "reasoning") {
      routeFrame(
        state,
        event,
        createFrame(state, event, "reasoning", { reasoning: delta }),
      );
      return;
    }
    state.modelTextByRunId[runId] = `${state.modelTextByRunId[runId] || ""}${delta}`;
    routeFrame(state, event, createFrame(state, event, "token_delta", payload));
    if (delta) {
      state.effects.push({
        type: "token",
        eventId: stringValue(event.event_id),
        delta,
        runId,
      });
    }
    return;
  }

  if (eventType === "model.completed") {
    if (typeof payload.final_text === "string") {
      routeFrame(
        state,
        event,
        createFrame(state, event, "final_message", {
          content: payload.final_text,
        }),
      );
      return;
    }
    routeFrame(state, event, createFrame(state, event, "response_received", payload));
    return;
  }

  if (eventType === "tool.started") {
    const callId = stringValue(links.tool_call_id, stringValue(payload.call_id));
    const routeEvent =
      stringValue(payload.tool_name) === HUMAN_INPUT_TOOL_NAME
        ? resolveHumanInputEvent(state, event, { callId })
        : event;
    const routeRunId = stringValue(routeEvent.run_id);
    state.toolCallsById[callId] = {
      callId,
      runId: routeRunId,
      status: "running",
      payload,
    };
    routeFrame(
      state,
      routeEvent,
      createFrame(state, routeEvent, "tool_call", {
        ...payload,
        call_id: callId,
        ...(links.input_request_id && !payload.confirmation_id
          ? { confirmation_id: links.input_request_id }
          : {}),
      }),
    );
    return;
  }

  if (eventType === "tool.delta") {
    routeFrame(
      state,
      event,
      createFrame(state, event, "observation", {
        ...payload,
        call_id: stringValue(links.tool_call_id, stringValue(payload.call_id)),
      }),
    );
    return;
  }

  if (eventType === "tool.completed") {
    const callId = stringValue(links.tool_call_id, stringValue(payload.call_id));
    const routeEvent =
      stringValue(payload.tool_name) === HUMAN_INPUT_TOOL_NAME
        ? resolveHumanInputEvent(state, event, { callId })
        : event;
    const routeRunId = stringValue(routeEvent.run_id);
    state.toolCallsById[callId] = {
      ...(state.toolCallsById[callId] || {}),
      callId,
      runId: routeRunId,
      status: stringValue(payload.status, "completed"),
      payload,
    };
    routeFrame(
      state,
      routeEvent,
      createFrame(state, routeEvent, "tool_result", {
        ...payload,
        call_id: callId,
      }),
    );
    return;
  }

  if (eventType === "input.requested") {
    const requestId = stringValue(links.input_request_id, stringValue(payload.request_id));
    const callId = stringValue(links.tool_call_id, stringValue(payload.call_id, requestId));
    const routeEvent = resolveHumanInputEvent(state, event, {
      callId,
      requestId,
    });
    const routeRunId = stringValue(routeEvent.run_id);
    state.inputRequestsById[requestId] = {
      requestId,
      callId,
      runId: routeRunId,
      status: "idle",
      resolved: false,
      payload,
    };
    routeFrame(
      state,
      routeEvent,
      createFrame(state, routeEvent, "tool_call", inputRequestToToolCallPayload(event)),
    );
    return;
  }

  if (eventType === "input.resolved") {
    const requestId = stringValue(
      links.input_request_id,
      stringValue(payload.confirmation_id),
    );
    const callId = stringValue(links.tool_call_id, stringValue(payload.call_id, requestId));
    const routeEvent = resolveHumanInputEvent(state, event, {
      callId,
      requestId,
    });
    const routeRunId = stringValue(routeEvent.run_id);
    const decision = stringValue(payload.decision, "approved");
    state.inputRequestsById[requestId] = {
      ...(state.inputRequestsById[requestId] || {}),
      requestId,
      callId,
      runId: routeRunId,
      status: "submitted",
      resolved: true,
      decision,
      response: payload.response,
      payload,
    };
    routeFrame(
      state,
      routeEvent,
      createFrame(
        state,
        routeEvent,
        decision === "denied" ? "tool_denied" : "tool_confirmed",
        inputResolvedToFramePayload(routeEvent),
      ),
    );
  }
};

const reduceProjectedActivityTree = (_previousState, eventStoreSnapshot = {}) => {
  const state = createProjectedActivityTreeState();
  state.diagnostics = cloneDiagnostics(eventStoreSnapshot.diagnostics);
  const eventIds = Array.isArray(eventStoreSnapshot.orderedEventIds)
    ? eventStoreSnapshot.orderedEventIds
    : [];
  const eventsById = isObject(eventStoreSnapshot.eventsById)
    ? eventStoreSnapshot.eventsById
    : {};

  eventIds.forEach((eventId) => {
    const event = eventsById[eventId];
    if (isObject(event)) {
      applyEvent(state, event);
    }
  });

  return state;
};

export const createInitialActivityTreeState = () => ({
  ...createProjectedActivityTreeState(),
  runArtifactSummary: null,
});

const baseProjectedEvent = (
  event,
  type,
  payload = payloadOf(event),
  links = linksOf(event),
) => ({
  schema_version: "runtime_projection",
  event_id: stringValue(event?.event_id),
  type,
  timestamp: stringValue(event?.timestamp),
  session_id: stringValue(event?.session_id),
  run_id: stringValue(event?.run_id),
  agent_id: stringValue(event?.agent_id),
  turn_id: stringValue(event?.turn_id),
  links: isObject(links) ? { ...links } : {},
  visibility: stringValue(event?.visibility, "user"),
  payload: isObject(payload) ? clone(payload) : {},
  metadata: {
    ...(isObject(event?.metadata) ? clone(event.metadata) : {}),
    ...(Number.isFinite(Number(event?.seq)) ? { seq: Number(event.seq) } : {}),
  },
});

const stepEventToProjected = (event) => {
  const payload = payloadOf(event);
  const stepType = stringValue(payload.step_type);
  if (event.type === "step.started") {
    if (stepType === "model_request") {
      return baseProjectedEvent(event, "model.started", payload);
    }
    if (stepType === "tool") {
      return baseProjectedEvent(event, "tool.started", payload);
    }
  }

  if (event.type === "step.delta") {
    if (stepType === "model_response") {
      return baseProjectedEvent(event, "model.delta", payload);
    }
    if (stepType === "tool") {
      return baseProjectedEvent(event, "tool.delta", payload);
    }
  }

  if (event.type === "step.completed") {
    if (stepType === "model_response") {
      return baseProjectedEvent(event, "model.completed", payload);
    }
    if (stepType === "tool") {
      return baseProjectedEvent(event, "tool.completed", payload);
    }
  }

  return null;
};

const interactionRequestedToProjected = (event) => {
  const payload = payloadOf(event);
  const links = linksOf(event);
  const target = isObject(payload.target) ? payload.target : {};
  const targetArguments = isObject(target.arguments) ? target.arguments : {};
  const callId = stringValue(
    links.tool_call_id,
    stringValue(target.tool_call_id, stringValue(payload.interaction_id)),
  );
  const confirmationId = stringValue(
    links.interaction_id,
    stringValue(payload.interaction_id, callId),
  );
  const renderer = stringValue(payload.renderer, stringValue(payload.kind, "confirmation"));
  const toolName =
    stringValue(target.tool_name) ||
    (payload.kind === "continuation" ? CONTINUATION_TOOL_NAME : HUMAN_INPUT_TOOL_NAME);
  const interactConfig = {
    ...(isObject(payload.config) ? clone(payload.config) : {}),
    ...(payload.title ? { title: payload.title } : {}),
    ...(payload.prompt ? { question: payload.prompt } : {}),
    ...(payload.selection_mode ? { selection_mode: payload.selection_mode } : {}),
    ...(Array.isArray(payload.options) ? { options: clone(payload.options) } : {}),
    ...(payload.allow_other !== undefined ? { allow_other: payload.allow_other } : {}),
    ...(payload.other_label ? { other_label: payload.other_label } : {}),
    ...(payload.other_placeholder
      ? { other_placeholder: payload.other_placeholder }
      : {}),
    ...(payload.min_selected !== undefined ? { min_selected: payload.min_selected } : {}),
    ...(payload.max_selected !== undefined ? { max_selected: payload.max_selected } : {}),
  };

  return baseProjectedEvent(
    event,
    "tool.started",
    {
      call_id: callId,
      confirmation_id: confirmationId,
      requires_confirmation: true,
      tool_name: toolName,
      toolkit_id: stringValue(target.toolkit_id),
      description: stringValue(payload.prompt, stringValue(payload.title)),
      arguments:
        Object.keys(targetArguments).length > 0
          ? clone(targetArguments)
          : {
              request_id: confirmationId,
              kind: stringValue(payload.kind),
              ...(payload.prompt ? { question: payload.prompt } : {}),
              ...(Array.isArray(payload.options)
                ? { options: clone(payload.options) }
                : {}),
            },
      interact_type: renderer,
      interact_config: interactConfig,
    },
    {
      ...links,
      tool_call_id: callId,
      input_request_id: confirmationId,
    },
  );
};

const interactionResolvedToProjected = (event) => {
  const payload = payloadOf(event);
  const links = linksOf(event);
  const confirmationId = stringValue(
    links.interaction_id,
    stringValue(payload.interaction_id),
  );
  const callId = stringValue(links.tool_call_id, confirmationId);
  const outcome = stringValue(payload.outcome);
  const decision =
    outcome === "denied" || outcome === "cancelled" ? "denied" : "approved";

  return baseProjectedEvent(
    event,
    "input.resolved",
    {
      call_id: callId,
      confirmation_id: confirmationId,
      decision,
      response: clone(payload.response),
      ...(payload.reason ? { reason: payload.reason } : {}),
    },
    {
      ...links,
      tool_call_id: callId,
      input_request_id: confirmationId,
    },
  );
};

const isRunSummaryArtifactEvent = (event) => {
  const surface = surfaceOf(event);
  return surface.scope === "run" || surface.slot === "run_summary";
};

const toProjectedEvent = (event) => {
  const type = stringValue(event?.type);
  if (
    type === "session.started" ||
    type === "run.started" ||
    type === "run.completed" ||
    type === "run.failed" ||
    type === "turn.started" ||
    type === "turn.completed" ||
    type === "interaction.fyi_injected"
  ) {
    return baseProjectedEvent(event, type);
  }

  if (type === "step.started" || type === "step.delta" || type === "step.completed") {
    return stepEventToProjected(event);
  }

  if (type === "interaction.requested") {
    return interactionRequestedToProjected(event);
  }

  if (type === "interaction.resolved") {
    return interactionResolvedToProjected(event);
  }

  if (type === "artifact.created" || type === "artifact.updated") {
    if (isRunSummaryArtifactEvent(event)) {
      return null;
    }
    return baseProjectedEvent(event, type);
  }

  return null;
};

const projectedSnapshotFromRuntimeEvents = (eventStoreSnapshot = {}) => {
  const eventIds = Array.isArray(eventStoreSnapshot.orderedEventIds)
    ? eventStoreSnapshot.orderedEventIds
    : [];
  const eventsById = isObject(eventStoreSnapshot.eventsById)
    ? eventStoreSnapshot.eventsById
    : {};
  const projectedEventsById = {};
  const orderedProjectedEventIds = [];

  eventIds.forEach((eventId) => {
    const projectedEvent = toProjectedEvent(eventsById[eventId]);
    if (!projectedEvent || !projectedEvent.event_id) {
      return;
    }
    projectedEventsById[projectedEvent.event_id] = projectedEvent;
    orderedProjectedEventIds.push(projectedEvent.event_id);
  });

  return {
    eventsById: projectedEventsById,
    orderedEventIds: orderedProjectedEventIds,
    diagnostics: isObject(eventStoreSnapshot.diagnostics)
      ? clone(eventStoreSnapshot.diagnostics)
      : { unknownEvents: [], droppedEvents: [], duplicateEvents: [] },
  };
};

const buildRunArtifactSummary = (eventStoreSnapshot = {}) => {
  const eventIds = Array.isArray(eventStoreSnapshot.orderedEventIds)
    ? eventStoreSnapshot.orderedEventIds
    : [];
  const eventsById = isObject(eventStoreSnapshot.eventsById)
    ? eventStoreSnapshot.eventsById
    : {};
  let bucket = null;
  let runSettled = false;
  let runSettledEventId = "";
  const effects = [];

  const ensureBucket = () => {
    if (!bucket) {
      bucket = {
        order: 0,
        status: runSettled ? "completed" : "pending",
        artifacts: [],
      };
    }
    return bucket;
  };

  eventIds.forEach((eventId) => {
    const event = eventsById[eventId];
    const type = stringValue(event?.type);
    if (type === "run.completed" || type === "run.failed") {
      runSettled = true;
      runSettledEventId = stringValue(event?.event_id);
      if (bucket && bucket.status !== "completed") {
        bucket.status = "completed";
        effects.push({
          type: "run_artifact_summary",
          eventId: runSettledEventId,
          reason: "flushed",
        });
      }
      return;
    }

    if (type !== "artifact.created" && type !== "artifact.updated") {
      return;
    }
    if (!isRunSummaryArtifactEvent(event)) {
      return;
    }
    const artifact = payloadOf(event);
    if (!isValidArtifactDescriptor(artifact)) {
      return;
    }
    const currentBucket = ensureBucket();
    const result = upsertArtifactDescriptor(currentBucket, artifact);
    if (result.changed && currentBucket.status === "completed") {
      effects.push({
        type: "run_artifact_summary",
        eventId: stringValue(event?.event_id),
        reason: type === "artifact.updated" ? "updated" : "created",
      });
    }
  });

  return { bucket, effects, runSettled, runSettledEventId };
};

const collectRunPromotedArtifacts = (artifactSummariesByTurnId) => {
  if (!isObject(artifactSummariesByTurnId)) {
    return [];
  }

  const bucket = {
    order: 0,
    status: "completed",
    artifacts: [],
  };
  Object.values(artifactSummariesByTurnId)
    .sort((a, b) => (a?.order || 0) - (b?.order || 0))
    .forEach((turnBucket) => {
      if (!isObject(turnBucket) || !Array.isArray(turnBucket.artifacts)) {
        return;
      }
      turnBucket.artifacts.forEach((artifact) => {
        if (!RUN_PROMOTED_ARTIFACT_KINDS.has(stringValue(artifact?.kind))) {
          return;
        }
        if (!isValidArtifactDescriptor(artifact)) {
          return;
        }
        upsertArtifactDescriptor(bucket, artifact);
      });
    });

  return bucket.artifacts;
};

const mergeRunPromotedArtifacts = ({
  bucket,
  effects,
  projectedState,
  runSettled,
  runSettledEventId,
}) => {
  const promotedArtifacts = collectRunPromotedArtifacts(
    projectedState?.artifactSummariesByTurnId,
  );
  if (promotedArtifacts.length === 0) {
    return { bucket, effects };
  }
  if (!bucket && !runSettled) {
    return { bucket: null, effects };
  }

  const currentBucket =
    bucket ||
    {
      order: 0,
      status: runSettled ? "completed" : "pending",
      artifacts: [],
    };

  let changed = false;
  promotedArtifacts.forEach((artifact) => {
    const result = upsertArtifactDescriptor(currentBucket, artifact);
    if (result.changed) changed = true;
  });

  const nextEffects = Array.isArray(effects) ? [...effects] : [];
  const alreadyEmittedRunFlush = nextEffects.some(
    (effect) =>
      effect?.type === "run_artifact_summary" &&
      effect?.eventId === runSettledEventId &&
      effect?.reason === "flushed",
  );
  if (changed && runSettled && runSettledEventId && !alreadyEmittedRunFlush) {
    nextEffects.push({
      type: "run_artifact_summary",
      eventId: runSettledEventId,
      reason: "flushed",
    });
  }

  return { bucket: currentBucket, effects: nextEffects };
};

const attachReductionMeta = (state, meta) => {
  Object.defineProperty(state, INCREMENTAL_REDUCTION_META, {
    configurable: true,
    value: meta,
  });
  return state;
};

const cloneArtifactBucket = (bucket) => {
  if (!isObject(bucket)) return null;
  return {
    ...bucket,
    artifacts: Array.isArray(bucket.artifacts)
      ? bucket.artifacts.map((artifact) => clone(artifact))
      : [],
  };
};

const copyArtifactBucket = (bucket) => {
  if (!isObject(bucket)) return null;
  return {
    ...bucket,
    artifacts: Array.isArray(bucket.artifacts) ? [...bucket.artifacts] : [],
  };
};

const createArtifactIndex = (bucket) =>
  new Map(
    (Array.isArray(bucket?.artifacts) ? bucket.artifacts : []).map(
      (artifact, index) => [stringValue(artifact?.artifact_id), index],
    ),
  );

const upsertIndexedArtifact = (
  bucket,
  indexById,
  artifact,
  { cloneValue = false } = {},
) => {
  const artifactId = stringValue(artifact?.artifact_id);
  if (!artifactId || !Array.isArray(bucket?.artifacts)) {
    return { changed: false, replaced: false };
  }
  const existingIdx = indexById.get(artifactId);
  if (!Number.isInteger(existingIdx)) {
    indexById.set(artifactId, bucket.artifacts.length);
    bucket.artifacts.push(cloneValue ? clone(artifact) : artifact);
    return { changed: true, replaced: false };
  }

  const existing = bucket.artifacts[existingIdx];
  const incomingRevision = Number(artifact.revision);
  const existingRevision = Number(existing?.revision);
  if (
    Number.isFinite(existingRevision) &&
    Number.isFinite(incomingRevision) &&
    incomingRevision < existingRevision
  ) {
    return { changed: false, replaced: true };
  }
  if (
    existingRevision === incomingRevision &&
    JSON.stringify(existing) === JSON.stringify(artifact)
  ) {
    return { changed: false, replaced: true };
  }
  bucket.artifacts[existingIdx] = cloneValue ? clone(artifact) : artifact;
  return { changed: true, replaced: true };
};

const buildPromotedArtifactIndex = (projectedState) => {
  const bucket = { order: 0, status: "completed", artifacts: [] };
  const indexById = new Map();
  const sourceTurnById = new Map();
  const duplicateArtifactIds = new Set();
  let lastTurnOrder = 0;

  Object.entries(projectedState?.artifactSummariesByTurnId || {})
    .sort(([, left], [, right]) => (left?.order || 0) - (right?.order || 0))
    .forEach(([turnId, turnBucket]) => {
      const turnOrder = Number(turnBucket?.order) || 0;
      const artifacts = Array.isArray(turnBucket?.artifacts)
        ? turnBucket.artifacts
        : [];
      artifacts.forEach((artifact) => {
        if (!RUN_PROMOTED_ARTIFACT_KINDS.has(stringValue(artifact?.kind))) {
          return;
        }
        const artifactId = stringValue(artifact?.artifact_id);
        if (!artifactId) return;
        if (sourceTurnById.has(artifactId)) {
          duplicateArtifactIds.add(artifactId);
        } else {
          sourceTurnById.set(artifactId, turnId);
        }
        upsertIndexedArtifact(bucket, indexById, artifact);
        lastTurnOrder = Math.max(lastTurnOrder, turnOrder);
      });
    });

  return {
    promotedRunArtifactSummary: bucket,
    promotedRunArtifactIndexById: indexById,
    promotedSourceTurnById: sourceTurnById,
    promotedDuplicateArtifactIds: duplicateArtifactIds,
    lastPromotedTurnOrder: lastTurnOrder,
  };
};

const createReductionMeta = (
  eventStoreSnapshot,
  eventIds,
  runSummary,
  projectedState,
) => {
  const explicitRunArtifactSummary = cloneArtifactBucket(runSummary?.bucket);
  return {
    processedLength: eventIds.length,
    lastEventId: eventIds[eventIds.length - 1] || "",
    storeRevision: Number(eventStoreSnapshot.__runtimeEventStoreRevision),
    orderRevision: Number(eventStoreSnapshot.__runtimeEventOrderRevision),
    storeGeneration: Number(eventStoreSnapshot.__runtimeEventStoreGeneration),
    storeIdentity: eventStoreSnapshot.__runtimeEventStoreIdentity,
    runSettled: Boolean(runSummary?.runSettled),
    runSettledEventId: stringValue(runSummary?.runSettledEventId),
    explicitRunArtifactSummary,
    explicitRunArtifactIndexById: createArtifactIndex(
      explicitRunArtifactSummary,
    ),
    ...buildPromotedArtifactIndex(projectedState),
  };
};

const canReduceIncrementally = (previousState, eventStoreSnapshot, eventIds) => {
  const meta = previousState?.[INCREMENTAL_REDUCTION_META];
  const storeRevision = Number(eventStoreSnapshot.__runtimeEventStoreRevision);
  const orderRevision = Number(eventStoreSnapshot.__runtimeEventOrderRevision);
  const storeGeneration = Number(
    eventStoreSnapshot.__runtimeEventStoreGeneration,
  );
  if (
    !meta ||
    !Number.isFinite(storeRevision) ||
    !Number.isFinite(orderRevision) ||
    !Number.isFinite(storeGeneration) ||
    !eventStoreSnapshot.__runtimeEventStoreIdentity ||
    meta.storeIdentity !== eventStoreSnapshot.__runtimeEventStoreIdentity ||
    meta.storeGeneration !== storeGeneration ||
    storeRevision < meta.storeRevision ||
    eventIds.length < meta.processedLength
  ) {
    return false;
  }
  if (
    meta.processedLength > 0 &&
    eventIds[meta.processedLength - 1] !== meta.lastEventId
  ) {
    return false;
  }
  return true;
};

const runSummaryInputKind = (state, event) => {
  const type = stringValue(event?.type);
  if (type === "run.completed" || type === "run.failed") {
    return "settled";
  }
  if (
    (type !== "artifact.created" && type !== "artifact.updated") ||
    !isValidArtifactDescriptor(payloadOf(event))
  ) {
    return "";
  }
  if (isRunSummaryArtifactEvent(event)) {
    return "explicit";
  }
  const artifact = payloadOf(event);
  const incomingIsPromoted = RUN_PROMOTED_ARTIFACT_KINDS.has(
    stringValue(artifact?.kind),
  );
  const turnId = resolveTurnId(event);
  const artifactId = stringValue(artifact?.artifact_id);
  const previousArtifact = Array.isArray(
    state?.artifactSummariesByTurnId?.[turnId]?.artifacts,
  )
    ? state.artifactSummariesByTurnId[turnId].artifacts.find(
        (candidate) => stringValue(candidate?.artifact_id) === artifactId,
      )
    : null;
  const previousWasPromoted = RUN_PROMOTED_ARTIFACT_KINDS.has(
    stringValue(previousArtifact?.kind),
  );
  return incomingIsPromoted || previousWasPromoted ? "promoted" : "";
};

const updateExplicitRunSummary = (reductionMeta, event, inputKind) => {
  if (inputKind === "settled") {
    reductionMeta.runSettled = true;
    reductionMeta.runSettledEventId = stringValue(event?.event_id);
    if (reductionMeta.explicitRunArtifactSummary) {
      reductionMeta.explicitRunArtifactSummary.status = "completed";
    }
    return;
  }
  if (inputKind !== "explicit") {
    return;
  }
  const artifact = payloadOf(event);
  if (!reductionMeta.explicitRunArtifactSummary) {
    reductionMeta.explicitRunArtifactSummary = {
      order: 0,
      status: reductionMeta.runSettled ? "completed" : "pending",
      artifacts: [],
    };
    reductionMeta.explicitRunArtifactIndexById = new Map();
  }
  upsertIndexedArtifact(
    reductionMeta.explicitRunArtifactSummary,
    reductionMeta.explicitRunArtifactIndexById,
    artifact,
    { cloneValue: true },
  );
};

const refreshPromotedArtifactIndex = (reductionMeta, projectedState) => {
  Object.assign(
    reductionMeta,
    buildPromotedArtifactIndex(projectedState),
  );
};

const updatePromotedArtifactIndex = (
  reductionMeta,
  projectedState,
  event,
  inputKind,
  indexIsDirty = false,
) => {
  if (inputKind !== "promoted" || indexIsDirty) return indexIsDirty;
  const artifactId = stringValue(payloadOf(event)?.artifact_id);
  const turnId = resolveTurnId(event);
  const turnBucket = projectedState?.artifactSummariesByTurnId?.[turnId];
  const turnOrder = Number(turnBucket?.order) || 0;
  const turnArtifacts = Array.isArray(turnBucket?.artifacts)
    ? turnBucket.artifacts
    : [];
  const currentArtifactIndex = turnArtifacts.findIndex(
    (artifact) => stringValue(artifact?.artifact_id) === artifactId,
  );
  const currentArtifact =
    currentArtifactIndex >= 0 ? turnArtifacts[currentArtifactIndex] : null;
  const currentIsPromoted = RUN_PROMOTED_ARTIFACT_KINDS.has(
    stringValue(currentArtifact?.kind),
  );
  const existingIdx = reductionMeta.promotedRunArtifactIndexById?.get(
    artifactId,
  );
  const sourceTurnId = reductionMeta.promotedSourceTurnById?.get(artifactId);
  const hasPromotedArtifactAfter =
    !Number.isInteger(existingIdx) &&
    currentIsPromoted &&
    turnArtifacts.slice(currentArtifactIndex + 1).some(
      (artifact) =>
        RUN_PROMOTED_ARTIFACT_KINDS.has(stringValue(artifact?.kind)) &&
        reductionMeta.promotedRunArtifactIndexById?.has(
          stringValue(artifact?.artifact_id),
        ),
    );

  if (
    reductionMeta.promotedDuplicateArtifactIds?.has(artifactId) ||
    (sourceTurnId && sourceTurnId !== turnId) ||
    (!Number.isInteger(existingIdx) &&
      currentIsPromoted &&
      (turnOrder < reductionMeta.lastPromotedTurnOrder ||
        hasPromotedArtifactAfter))
  ) {
    return true;
  }

  if (currentIsPromoted) {
    if (Number.isInteger(existingIdx)) {
      reductionMeta.promotedRunArtifactSummary.artifacts[existingIdx] =
        currentArtifact;
    } else {
      const nextIndex =
        reductionMeta.promotedRunArtifactSummary.artifacts.length;
      reductionMeta.promotedRunArtifactSummary.artifacts.push(currentArtifact);
      reductionMeta.promotedRunArtifactIndexById.set(artifactId, nextIndex);
      reductionMeta.promotedSourceTurnById.set(artifactId, turnId);
      reductionMeta.lastPromotedTurnOrder = Math.max(
        reductionMeta.lastPromotedTurnOrder,
        turnOrder,
      );
    }
    return false;
  }

  if (Number.isInteger(existingIdx)) {
    // Removal can reveal a duplicate from another turn and can change the
    // promoted ordering; defer this rare canonical rebuild to the batch end.
    return true;
  }
  return false;
};

const composeRunArtifactSummary = ({
  explicitBucket,
  promotedBucket,
  projectedState,
  runSettled,
}) => {
  if (!explicitBucket && !runSettled) {
    return null;
  }
  const promotedArtifacts = promotedBucket
    ? promotedBucket.artifacts
    : collectRunPromotedArtifacts(projectedState?.artifactSummariesByTurnId);
  if (!explicitBucket && promotedArtifacts.length === 0) {
    return null;
  }
  const bucket = copyArtifactBucket(explicitBucket) || {
    order: 0,
    status: runSettled ? "completed" : "pending",
    artifacts: [],
  };
  if (runSettled) {
    bucket.status = "completed";
  }
  const indexById = createArtifactIndex(bucket);
  promotedArtifacts.forEach((artifact) => {
    upsertIndexedArtifact(bucket, indexById, artifact);
  });
  return bucket;
};

const artifactBucketsEqual = (left, right) => {
  if (left === right) return true;
  if (!left || !right) return false;
  if (
    left.order !== right.order ||
    left.status !== right.status ||
    !Array.isArray(left.artifacts) ||
    !Array.isArray(right.artifacts) ||
    left.artifacts.length !== right.artifacts.length
  ) {
    return false;
  }
  for (let index = 0; index < left.artifacts.length; index += 1) {
    if (left.artifacts[index] === right.artifacts[index]) continue;
    if (
      JSON.stringify(left.artifacts[index]) !==
      JSON.stringify(right.artifacts[index])
    ) {
      return false;
    }
  }
  return true;
};

const appendRunSummaryEffect = ({
  effects,
  event,
  inputKind,
  previousBucket,
  nextBucket,
  reductionMeta,
}) => {
  if (
    artifactBucketsEqual(previousBucket, nextBucket) ||
    (nextBucket
      ? nextBucket.status !== "completed"
      : previousBucket?.status !== "completed")
  ) {
    return;
  }

  if (inputKind === "settled") {
    if (reductionMeta.runSettledEventId) {
      effects.push({
        type: "run_artifact_summary",
        eventId: reductionMeta.runSettledEventId,
        reason: "flushed",
      });
    }
    return;
  }

  const type = stringValue(event?.type);
  effects.push({
    type: "run_artifact_summary",
    eventId: stringValue(event?.event_id),
    reason: type === "artifact.updated" ? "updated" : "created",
  });
};

const reduceActivityTreeIncrementally = (
  previousState,
  eventStoreSnapshot,
  eventIds,
) => {
  const eventsById = isObject(eventStoreSnapshot.eventsById)
    ? eventStoreSnapshot.eventsById
    : {};
  const previousMeta = previousState[INCREMENTAL_REDUCTION_META];
  const nextMeta = {
    ...previousMeta,
    storeRevision: Number(eventStoreSnapshot.__runtimeEventStoreRevision),
    orderRevision: Number(eventStoreSnapshot.__runtimeEventOrderRevision),
    storeGeneration: Number(
      eventStoreSnapshot.__runtimeEventStoreGeneration,
    ),
  };
  const runSummaryEffects = [];
  const previousRunArtifactSummary = previousState.runArtifactSummary;
  let latestRunSummaryInput = null;
  let settleInput = null;
  let promotedIndexDirty = false;

  // Effects are a dispatch queue, not durable tree state. Returning only the
  // newly produced effects keeps the stream flush O(batch); frames and all
  // other projected state remain cumulative.
  previousState.effects = [];
  previousState.diagnostics = cloneDiagnostics(eventStoreSnapshot.diagnostics);

  for (let index = previousMeta.processedLength; index < eventIds.length; index += 1) {
    const event = eventsById[eventIds[index]];
    if (!isObject(event)) continue;
    const inputKind = runSummaryInputKind(previousState, event);
    updateExplicitRunSummary(nextMeta, event, inputKind);
    const projectedEvent = toProjectedEvent(event);
    if (projectedEvent) {
      applyEvent(previousState, projectedEvent);
    }
    promotedIndexDirty = updatePromotedArtifactIndex(
      nextMeta,
      previousState,
      event,
      inputKind,
      promotedIndexDirty,
    );
    if (inputKind) {
      latestRunSummaryInput = { event, inputKind };
      if (inputKind === "settled") {
        settleInput = latestRunSummaryInput;
      }
    }
  }

  if (promotedIndexDirty) {
    refreshPromotedArtifactIndex(nextMeta, previousState);
  }

  if (latestRunSummaryInput) {
    const nextRunArtifactSummary = composeRunArtifactSummary({
      explicitBucket: nextMeta.explicitRunArtifactSummary,
      promotedBucket: nextMeta.promotedRunArtifactSummary,
      projectedState: previousState,
      runSettled: nextMeta.runSettled,
    });
    const effectiveInput =
      settleInput && previousRunArtifactSummary?.status !== "completed"
        ? settleInput
        : latestRunSummaryInput;
    appendRunSummaryEffect({
      effects: runSummaryEffects,
      event: effectiveInput.event,
      inputKind: effectiveInput.inputKind,
      previousBucket: previousRunArtifactSummary,
      nextBucket: nextRunArtifactSummary,
      reductionMeta: nextMeta,
    });
    previousState.runArtifactSummary = nextRunArtifactSummary;
  }

  previousState.effects.push(...runSummaryEffects);
  nextMeta.processedLength = eventIds.length;
  nextMeta.lastEventId = eventIds[eventIds.length - 1] || "";
  return attachReductionMeta(previousState, nextMeta);
};

export const reduceActivityTree = (_previousState, eventStoreSnapshot = {}) => {
  const eventIds = Array.isArray(eventStoreSnapshot.orderedEventIds)
    ? eventStoreSnapshot.orderedEventIds
    : [];
  const projectedState = reduceProjectedActivityTree(
    null,
    projectedSnapshotFromRuntimeEvents(eventStoreSnapshot),
  );
  const runSummary = buildRunArtifactSummary(eventStoreSnapshot);
  const { bucket, effects } = mergeRunPromotedArtifacts({
    bucket: cloneArtifactBucket(runSummary.bucket),
    effects: runSummary.effects,
    projectedState,
    runSettled: runSummary.runSettled,
    runSettledEventId: runSummary.runSettledEventId,
  });
  const nextState = {
    ...projectedState,
    runArtifactSummary: bucket,
    effects: [
      ...(Array.isArray(projectedState.effects) ? projectedState.effects : []),
      ...effects,
    ],
  };
  return attachReductionMeta(
    nextState,
    createReductionMeta(
      eventStoreSnapshot,
      eventIds,
      runSummary,
      projectedState,
    ),
  );
};

// Internal stream projector: owns its mutable working tree so the public
// reduceActivityTree contract stays pure/detached for tests, adapters, and
// non-stream callers.
export const createIncrementalActivityTreeProjector = () => {
  let state = null;

  return {
    reduce(eventStoreSnapshot = {}) {
      const eventIds = Array.isArray(eventStoreSnapshot.orderedEventIds)
        ? eventStoreSnapshot.orderedEventIds
        : [];
      if (canReduceIncrementally(state, eventStoreSnapshot, eventIds)) {
        state = reduceActivityTreeIncrementally(
          state,
          eventStoreSnapshot,
          eventIds,
        );
      } else {
        state = reduceActivityTree(null, eventStoreSnapshot);
      }
      return state;
    },
  };
};

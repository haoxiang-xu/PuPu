const HUMAN_INPUT_TOOL_NAME = "ask_user_question";
const CONTINUATION_TOOL_NAME = "__continuation__";

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const stringValue = (value, fallback = "") =>
  typeof value === "string" && value.trim() ? value.trim() : fallback;

const rawStringValue = (value, fallback = "") =>
  typeof value === "string" ? value : fallback;

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

export const createInitialActivityTreeState = () => ({
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
    return;
  }

  if (eventType === "model.started") {
    routeFrame(state, event, createFrame(state, event, "request_messages", payload));
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

export const reduceActivityTree = (_previousState, eventStoreSnapshot = {}) => {
  const state = createInitialActivityTreeState();
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

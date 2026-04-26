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

export const createInitialRuntimeEventTraceState = () => ({
  seq: 0,
  rootRunId: "",
  completionBundle: null,
  failed: false,
});

const runtimeEventPayload = (event) =>
  isObject(event?.payload) ? event.payload : {};

const runtimeEventLinks = (event) =>
  isObject(event?.links) ? event.links : {};

const isRuntimeEvent = (event) =>
  isObject(event) && event.schema_version === "v3" && stringValue(event.type);

const isChildRunEvent = (state, event) => {
  const links = runtimeEventLinks(event);
  const parentRunId = stringValue(links.parent_run_id);
  if (parentRunId) {
    return true;
  }
  return Boolean(
    state.rootRunId &&
      stringValue(event.run_id) &&
      stringValue(event.run_id) !== state.rootRunId,
  );
};

const buildSubagentPayload = (state, event, status = "") => {
  const payload = runtimeEventPayload(event);
  const links = runtimeEventLinks(event);
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
  const payload = runtimeEventPayload(event);
  const links = runtimeEventLinks(event);
  const inputRequestId = stringValue(
    links.input_request_id,
    stringValue(payload.request_id),
  );
  const callId = stringValue(
    links.tool_call_id,
    stringValue(payload.call_id, inputRequestId),
  );
  const kind = stringValue(payload.kind);
  const interactType = stringValue(payload.interact_type, "confirmation");
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
    interact_type: interactType,
    interact_config: interactConfig,
  };
};

const inputResolvedToFramePayload = (event) => {
  const payload = runtimeEventPayload(event);
  const links = runtimeEventLinks(event);
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

const normalizeRootRunId = (state, event) => {
  const runId = stringValue(event.run_id);
  if (!state.rootRunId && runId && !runtimeEventLinks(event).parent_run_id) {
    state.rootRunId = runId;
  }
};

export const reduceRuntimeEventTraceState = (state, runtimeEvent) => {
  const nextState = {
    ...createInitialRuntimeEventTraceState(),
    ...(isObject(state) ? state : {}),
  };
  const effects = [];
  if (!isRuntimeEvent(runtimeEvent)) {
    return { state: nextState, effects };
  }

  const payload = runtimeEventPayload(runtimeEvent);
  const links = runtimeEventLinks(runtimeEvent);
  const eventType = runtimeEvent.type;

  if (eventType === "session.started") {
    const threadId = stringValue(
      payload.thread_id,
      stringValue(runtimeEvent.session_id),
    );
    const model = stringValue(payload.model);
    effects.push({
      type: "meta",
      meta: {
        ...(threadId ? { thread_id: threadId } : {}),
        ...(model ? { model } : {}),
      },
    });
    effects.push({
      type: "frame",
      frame: createFrame(nextState, runtimeEvent, "stream_started", {
        thread_id: threadId,
        model,
        trace_level: stringValue(payload.trace_level),
      }),
    });
    return { state: nextState, effects };
  }

  if (eventType === "run.started") {
    if (isChildRunEvent(nextState, runtimeEvent)) {
      effects.push({
        type: "frame",
        frame: createFrame(
          nextState,
          runtimeEvent,
          "subagent_started",
          buildSubagentPayload(nextState, runtimeEvent, "running"),
        ),
      });
      return { state: nextState, effects };
    }
    normalizeRootRunId(nextState, runtimeEvent);
    effects.push({
      type: "frame",
      frame: createFrame(nextState, runtimeEvent, "run_started", {
        ...payload,
        run_id: stringValue(runtimeEvent.run_id),
      }),
    });
    return { state: nextState, effects };
  }

  if (eventType === "run.completed") {
    if (isChildRunEvent(nextState, runtimeEvent)) {
      effects.push({
        type: "frame",
        frame: createFrame(
          nextState,
          runtimeEvent,
          "subagent_completed",
          buildSubagentPayload(
            nextState,
            runtimeEvent,
            stringValue(payload.status, "completed"),
          ),
        ),
      });
      return { state: nextState, effects };
    }
    normalizeRootRunId(nextState, runtimeEvent);
    const usage = isObject(payload.usage) ? payload.usage : null;
    nextState.completionBundle = usage;
    effects.push({
      type: "frame",
      frame: createFrame(nextState, runtimeEvent, "done", {
        ...payload,
        ...(usage ? { bundle: usage } : {}),
      }),
    });
    return { state: nextState, effects };
  }

  if (eventType === "run.failed") {
    const error = isObject(payload.error)
      ? payload.error
      : { code: "run_failed", message: "Run failed" };
    if (isChildRunEvent(nextState, runtimeEvent)) {
      effects.push({
        type: "frame",
        frame: createFrame(
          nextState,
          runtimeEvent,
          "subagent_failed",
          buildSubagentPayload(
            nextState,
            runtimeEvent,
            stringValue(payload.status, "failed"),
          ),
        ),
      });
      return { state: nextState, effects };
    }
    nextState.failed = true;
    effects.push({
      type: "frame",
      frame: createFrame(nextState, runtimeEvent, "error", {
        code: stringValue(error.code, "run_failed"),
        message: stringValue(error.message, "Run failed"),
        recoverable: payload.recoverable === true,
      }),
    });
    effects.push({
      type: "error",
      error: {
        code: stringValue(error.code, "run_failed"),
        message: stringValue(error.message, "Run failed"),
      },
    });
    return { state: nextState, effects };
  }

  if (eventType === "turn.started" || eventType === "turn.completed") {
    effects.push({
      type: "frame",
      frame: createFrame(
        nextState,
        runtimeEvent,
        eventType === "turn.started" ? "iteration_started" : "iteration_completed",
        payload,
      ),
    });
    return { state: nextState, effects };
  }

  if (eventType === "model.started") {
    effects.push({
      type: "frame",
      frame: createFrame(nextState, runtimeEvent, "request_messages", payload),
    });
    return { state: nextState, effects };
  }

  if (eventType === "model.delta") {
    const kind = stringValue(payload.kind, "text");
    const delta = rawStringValue(payload.delta);
    if (kind === "reasoning") {
      effects.push({
        type: "frame",
        frame: createFrame(nextState, runtimeEvent, "reasoning", {
          reasoning: delta,
        }),
      });
      return { state: nextState, effects };
    }
    effects.push({
      type: "frame",
      frame: createFrame(nextState, runtimeEvent, "token_delta", payload),
    });
    if (delta) {
      effects.push({ type: "token", delta, runId: stringValue(runtimeEvent.run_id) });
    }
    return { state: nextState, effects };
  }

  if (eventType === "model.completed") {
    if (typeof payload.final_text === "string") {
      effects.push({
        type: "frame",
        frame: createFrame(nextState, runtimeEvent, "final_message", {
          content: payload.final_text,
        }),
      });
      return { state: nextState, effects };
    }
    effects.push({
      type: "frame",
      frame: createFrame(nextState, runtimeEvent, "response_received", payload),
    });
    return { state: nextState, effects };
  }

  if (eventType === "tool.started") {
    const inputRequestId = stringValue(links.input_request_id);
    effects.push({
      type: "frame",
      frame: createFrame(nextState, runtimeEvent, "tool_call", {
        ...payload,
        ...(inputRequestId && !payload.confirmation_id
          ? { confirmation_id: inputRequestId }
          : {}),
      }),
    });
    return { state: nextState, effects };
  }

  if (eventType === "tool.delta") {
    effects.push({
      type: "frame",
      frame: createFrame(nextState, runtimeEvent, "observation", {
        ...payload,
        call_id: stringValue(links.tool_call_id, stringValue(payload.call_id)),
      }),
    });
    return { state: nextState, effects };
  }

  if (eventType === "tool.completed") {
    effects.push({
      type: "frame",
      frame: createFrame(nextState, runtimeEvent, "tool_result", {
        ...payload,
        call_id: stringValue(links.tool_call_id, stringValue(payload.call_id)),
      }),
    });
    return { state: nextState, effects };
  }

  if (eventType === "input.requested") {
    effects.push({
      type: "frame",
      frame: createFrame(
        nextState,
        runtimeEvent,
        "tool_call",
        inputRequestToToolCallPayload(runtimeEvent),
      ),
    });
    return { state: nextState, effects };
  }

  if (eventType === "input.resolved") {
    const frameType =
      stringValue(payload.decision, "approved") === "denied"
        ? "tool_denied"
        : "tool_confirmed";
    effects.push({
      type: "frame",
      frame: createFrame(
        nextState,
        runtimeEvent,
        frameType,
        inputResolvedToFramePayload(runtimeEvent),
      ),
    });
    return { state: nextState, effects };
  }

  return { state: nextState, effects };
};

export const createRuntimeEventTraceAdapter = () => {
  let state = createInitialRuntimeEventTraceState();

  return {
    ingest(runtimeEvent) {
      const result = reduceRuntimeEventTraceState(state, runtimeEvent);
      state = result.state;
      return result.effects;
    },
    complete(done = {}) {
      if (!isObject(done)) {
        return {};
      }
      if (state.completionBundle && !isObject(done.bundle)) {
        return { ...done, bundle: state.completionBundle };
      }
      return done;
    },
    getState() {
      return { ...state };
    },
  };
};

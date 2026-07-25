const path = require("node:path");

const LIVE_DURATION_MS = 20 * 60 * 1000;
const LIVE_ROOT_MAX_ITERATIONS = 40;
const LIVE_WAIT_COUNT = 19;
const LIVE_WAIT_MILLISECONDS = 65000;
const LIVE_WORKLOAD_STEP_COUNT = 3;
const LIVE_MARKER = "PUPU-DETERMINISTIC-SOAK";
const LIVE_GATE_CHECKPOINT = "durable-pause";
const LIVE_MIN_MCP_TIME_SCALE = 0.2;

const LIVE_MODELS = Object.freeze([
  Object.freeze({
    provider: "openai",
    modelId: "openai:gpt-5.2-codex",
    credentialNames: Object.freeze([
      "PUPU_LIVE_OPENAI_API_KEY",
      "OPENAI_API_KEY",
    ]),
    settingsKey: "openai_api_key",
  }),
  Object.freeze({
    provider: "anthropic",
    modelId: "anthropic:claude-sonnet-4-6",
    credentialNames: Object.freeze([
      "PUPU_LIVE_ANTHROPIC_API_KEY",
      "ANTHROPIC_API_KEY",
    ]),
    settingsKey: "anthropic_api_key",
  }),
]);

const LIVE_WORKLOADS = Object.freeze(["coding", "mcp", "web"]);

const LIVE_MATRIX = Object.freeze(
  LIVE_WORKLOADS.flatMap((workload) =>
    LIVE_MODELS.map((model) =>
      Object.freeze({
        id: `${workload}-${model.provider}`,
        workload,
        provider: model.provider,
        modelId: model.modelId,
        credentialNames: model.credentialNames,
        settingsKey: model.settingsKey,
      }),
    ),
  ),
);

const WEB_SOURCES = Object.freeze([
  Object.freeze({
    url: "https://www.iana.org/help/example-domains",
    evidence: "IANA",
  }),
  Object.freeze({
    url: "https://www.rfc-editor.org/rfc/rfc9110",
    evidence: "HTTP",
  }),
  Object.freeze({
    url: "https://www.example.com/",
    evidence: "Example Domain",
  }),
]);

const getLiveCell = (id) => {
  const normalized = String(id || "").trim().toLowerCase();
  return LIVE_MATRIX.find((cell) => cell.id === normalized) || null;
};

const selectLiveCells = (ids = []) => {
  const requested = Array.isArray(ids)
    ? ids.map((id) => String(id || "").trim().toLowerCase()).filter(Boolean)
    : [];
  if (!requested.length || requested.includes("all")) {
    return [...LIVE_MATRIX];
  }
  const selected = [];
  const seen = new Set();
  for (const id of requested) {
    const cell = getLiveCell(id);
    if (!cell) {
      throw new Error(
        `unknown live long-run cell ${JSON.stringify(id)}; expected all or one of ${LIVE_MATRIX.map((item) => item.id).join(", ")}`,
      );
    }
    if (!seen.has(cell.id)) {
      seen.add(cell.id);
      selected.push(cell);
    }
  }
  return selected;
};

const iterationMarker = (cell, iteration) =>
  `LIVE_LONG_RUN_OK cell=${cell.id} model=${cell.modelId} iteration=${iteration}`;

const liveCompletionMarker = (cell, rootToolCalls) =>
  `LIVE_AGENT_LONG_RUN_OK cell=${cell.id} model=${cell.modelId} root_tool_calls=${rootToolCalls}`;

const liveFyiMarker = (cell, nonce) => {
  const normalized = String(nonce || "").trim();
  if (!normalized) throw new Error("live FYI marker requires an unknown nonce");
  return `LIVE_FYI_ACK cell=${cell.id} nonce=${normalized}`;
};

const codingArtifact = ({ cell, iteration, workspaceRoot }) => {
  if (!Number.isSafeInteger(iteration) || iteration < 0) {
    throw new Error("coding iteration must be a non-negative safe integer");
  }
  const filename = `live-coding-${cell.provider}-${String(iteration).padStart(3, "0")}.txt`;
  const root = path.resolve(String(workspaceRoot || ""));
  const absolutePath = path.resolve(root, filename);
  if (!root || !absolutePath.startsWith(`${root}${path.sep}`)) {
    throw new Error("coding artifact escaped its isolated workspace");
  }
  return {
    filename,
    absolutePath,
    marker: iterationMarker(cell, iteration),
  };
};

const mcpLaneForCell = (cell) => (cell.provider === "openai" ? "A" : "B");

const buildLiveWorkloadSteps = ({ cell, workspaceRoot }) => {
  const lane = mcpLaneForCell(cell);
  if (cell.workload === "coding") {
    return Array.from(
      { length: LIVE_WORKLOAD_STEP_COUNT },
      (_, iteration) => {
        const artifact = codingArtifact({ cell, iteration, workspaceRoot });
        return [
          {
            category: "workload",
            tool: "write",
            arguments: {
              path: artifact.absolutePath,
              content: `${artifact.marker}\n`,
            },
          },
          {
            category: "workload",
            tool: "read",
            arguments: {
              path: artifact.absolutePath,
              offset: 0,
              limit: 5,
            },
          },
        ];
      },
    ).flat();
  }
  if (cell.workload === "mcp") {
    return Array.from(
      { length: LIVE_WORKLOAD_STEP_COUNT },
      (_, iteration) => ({
        category: "workload",
        tool: "soak_probe",
        arguments: {
          lane,
          iteration,
          marker: LIVE_MARKER,
        },
      }),
    );
  }
  if (cell.workload === "web") {
    return WEB_SOURCES.slice(0, LIVE_WORKLOAD_STEP_COUNT).map((source) => ({
      category: "workload",
      tool: "web_fetch",
      arguments: {
        url: source.url,
        mode: "raw",
        offset: 0,
        max_chars: 8000,
      },
    }));
  }
  throw new Error(`unsupported live workload: ${cell.workload}`);
};

const buildLiveWorkerBatchStep = (cell) => {
  const tasks = ["a", "b"].map((suffix) => ({
    target: `live-observer-${suffix}`,
    task: `Inspect live cell ${cell.id} as observer ${suffix.toUpperCase()}`,
    instructions: `Return exactly LIVE_CHILD_OK cell=${cell.id} observer=${suffix.toUpperCase()}`,
    expected_output: `LIVE_CHILD_OK cell=${cell.id} observer=${suffix.toUpperCase()}`,
    output_mode: "last_message",
  }));
  return {
    category: "subagent",
    tool: "spawn_worker_batch",
    arguments: {
      tasks,
      aggregate_mode: "ordered_list",
    },
  };
};

const buildLiveDelegateStep = (cell) => ({
  category: "subagent",
  tool: "delegate_to_subagent",
  arguments: {
    target: "live-observer-c",
    task: `Inspect live cell ${cell.id} as observer C`,
    instructions: `Return exactly LIVE_CHILD_OK cell=${cell.id} observer=C`,
    expected_output: `LIVE_CHILD_OK cell=${cell.id} observer=C`,
    output_mode: "last_message",
  },
});

const buildLiveWaitStep = (cell, waitIndex) => ({
  category: "wait",
  tool: "soak_wait",
  arguments: {
    lane: mcpLaneForCell(cell),
    milliseconds: LIVE_WAIT_MILLISECONDS,
    marker: LIVE_MARKER,
  },
  wait_index: waitIndex,
});

const buildLiveRootPlan = ({ cell, workspaceRoot }) => {
  if (!cell || !LIVE_MATRIX.some((candidate) => candidate.id === cell.id)) {
    throw new Error("a canonical live matrix cell is required");
  }
  const workloadSteps = buildLiveWorkloadSteps({ cell, workspaceRoot });
  const plan = [];
  const appendWorkloadStep = () => {
    const next = workloadSteps.shift();
    if (next) plan.push(next);
  };

  plan.push(buildLiveWaitStep(cell, 0));
  appendWorkloadStep();
  plan.push(buildLiveWaitStep(cell, 1));
  plan.push(buildLiveWorkerBatchStep(cell));
  plan.push(buildLiveWaitStep(cell, 2));
  appendWorkloadStep();
  plan.push(buildLiveWaitStep(cell, 3));
  plan.push(buildLiveDelegateStep(cell));
  plan.push(buildLiveWaitStep(cell, 4));

  for (let waitIndex = 5; waitIndex < LIVE_WAIT_COUNT; waitIndex += 1) {
    plan.push(buildLiveWaitStep(cell, waitIndex));
    appendWorkloadStep();
    if ([6, 11, 16].includes(waitIndex)) {
      plan.push({
        category: "checkpoint",
        tool: "soak_checkpoint",
        arguments: {
          lane: mcpLaneForCell(cell),
          checkpoint: `live-${cell.id}`,
          iteration: [6, 11, 16].indexOf(waitIndex),
          marker: LIVE_MARKER,
        },
      });
    }
    if (waitIndex === 12) {
      plan.push({
        category: "approval",
        tool: "soak_gate",
        arguments: {
          lane: mcpLaneForCell(cell),
          checkpoint: LIVE_GATE_CHECKPOINT,
          marker: LIVE_MARKER,
        },
      });
    }
  }
  while (workloadSteps.length) appendWorkloadStep();

  return plan.map((step, index) => ({
    step: index + 1,
    ...step,
  }));
};

const expectedLiveRootToolCounts = ({ cell, workspaceRoot }) =>
  buildLiveRootPlan({ cell, workspaceRoot }).reduce((counts, step) => {
    counts[step.tool] = (counts[step.tool] || 0) + 1;
    return counts;
  }, {});

const buildLiveRootPrompt = ({ cell, workspaceRoot }) => {
  const plan = buildLiveRootPlan({ cell, workspaceRoot });
  const completionMarker = liveCompletionMarker(cell, plan.length);
  return [
    `This is one authorized PuPu live long-running agent task for ${cell.modelId}.`,
    "The numbered execution plan below is already approved. Start executing it immediately; do not propose another plan or wait for plan approval.",
    "The isolated workspace is known to be empty at start, so do not inspect it before executing the listed coding steps.",
    "Stay inside this single root run until every numbered step succeeds.",
    "Execute the plan in exact numeric order. After each tool result, immediately continue with the next unfinished step.",
    "Make exactly one tool call per model response. The spawn_worker_batch call is one tool call containing its two listed workers.",
    "Do not combine parallel root tool calls, skip steps, repeat steps, start a queued follow-up, ask a question, inspect unrelated state, or produce a final answer early.",
    "If a tool fails, do not retry or substitute another tool; report the failure immediately so the release test fails closed.",
    "A /fyi message containing an initially unknown nonce will arrive while you work. Preserve the exact FYI marker you actually receive for the final response without restarting.",
    "Fixed ordered plan:",
    ...plan.map(
      (step) =>
        `${step.step}. ${
          step.category === "wait"
            ? `[WAIT ${step.wait_index + 1}/${LIVE_WAIT_COUNT}] `
            : ""
        }${step.tool} ${JSON.stringify(step.arguments)}`,
    ),
    "After every step has succeeded, return a final response containing the completion marker below and the exact unknown FYI marker delivered during this run:",
    completionMarker,
  ].join("\n");
};

const buildFyiCommand = (cell, nonce) =>
  `/fyi ${liveFyiMarker(cell, nonce)}; keep running the existing task and include this exact marker in its final response.`;

const computeLiveMcpTimeScale = (durationMs) => {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new Error("live duration must be greater than zero");
  }
  const targetScale =
    durationMs / (LIVE_WAIT_COUNT * LIVE_WAIT_MILLISECONDS);
  const minimumScale =
    durationMs >= LIVE_DURATION_MS ? 1 : LIVE_MIN_MCP_TIME_SCALE;
  return Math.max(minimumScale, targetScale);
};

const postJsonOnce = async (
  testApi,
  endpointPath,
  body,
  onRequest = () => {},
  fetchImpl = global.fetch,
) => {
  if (typeof fetchImpl !== "function") {
    throw new Error("single-attempt Test API fetch is unavailable");
  }
  onRequest();
  const response = await fetchImpl(`${testApi.baseUrl}${endpointPath}`, {
    method: "POST",
    redirect: "error",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : { error: { message: await response.text() } };
  if (!response.ok) {
    const error = new Error(
      payload?.error?.message ||
        `Test API request failed: ${response.status}`,
    );
    Object.assign(error, { status: response.status, body: payload });
    throw error;
  }
  return payload;
};

const normalizeFramePayload = (frame) =>
  frame?.payload && typeof frame.payload === "object" ? frame.payload : {};

const summarizeToolPayload = (payload) => {
  const serialized = JSON.stringify(payload || {});
  return {
    keys: Object.keys(payload || {}).sort(),
    preview:
      serialized.length > 6000
        ? `${serialized.slice(0, 6000)}...[truncated ${serialized.length - 6000} chars]`
        : serialized,
  };
};

const collectMessageFrames = (message) => {
  const frames = Array.isArray(message?.traceFrames)
    ? [...message.traceFrames]
    : [];
  const childFrames =
    message?.subagentFrames && typeof message.subagentFrames === "object"
      ? Object.values(message.subagentFrames).flatMap((value) =>
          Array.isArray(value) ? value : [],
        )
      : [];
  return [...frames, ...childFrames];
};

const collectToolEvidenceFromFrames = (frames = []) =>
  frames
    .filter((frame) => frame?.type === "tool_call" || frame?.type === "tool_result")
    .map((frame) => {
      const payload = normalizeFramePayload(frame);
      return {
        type: frame.type,
        tool_name: String(
          payload.tool_name || payload.name || frame.tool_name || "",
        ).trim(),
        toolkit_id: String(payload.toolkit_id || frame.toolkit_id || "").trim(),
        call_id: String(payload.call_id || frame.call_id || "").trim(),
        payload: summarizeToolPayload(payload),
      };
    });

const collectToolEvidence = (message) =>
  collectToolEvidenceFromFrames(collectMessageFrames(message));

const parseLiveToolArguments = (frame) => {
  const value = frame?.payload?.arguments;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  if (typeof value !== "string" || !value.trim()) return {};
  return JSON.parse(value);
};

const canonicalJson = (value) => {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalJson(value[key])]),
    );
  }
  return value;
};

const sameJson = (left, right) =>
  JSON.stringify(canonicalJson(left)) === JSON.stringify(canonicalJson(right));

const uniqueRootToolCallFrames = (frames = []) => {
  const unique = new Map();
  for (const frame of frames) {
    if (frame?.type !== "tool_call") continue;
    const callId = String(frame?.payload?.call_id || "").trim();
    if (!callId) continue;
    const existing = unique.get(callId);
    let hasArguments = false;
    try {
      hasArguments = Object.keys(parseLiveToolArguments(frame)).length > 0;
    } catch (_) {
      hasArguments = true;
    }
    if (!existing || hasArguments) unique.set(callId, frame);
  }
  return [...unique.values()].sort(
    (left, right) => Number(left?.seq || 0) - Number(right?.seq || 0),
  );
};

const validateObservedRootPlanPrefix = ({ frames = [], plan = [] }) => {
  const failures = [];
  const callFrames = uniqueRootToolCallFrames(frames);
  const toolCallFrames = frames.filter((frame) => frame?.type === "tool_call");
  const resultFrames = frames.filter((frame) => frame?.type === "tool_result");
  const callIds = new Set(
    callFrames.map((frame) => String(frame?.payload?.call_id || "").trim()),
  );

  if (toolCallFrames.some((frame) => !String(frame?.payload?.call_id || "").trim())) {
    failures.push("observed a root tool call without a call_id");
  }
  if (callFrames.length > plan.length) {
    failures.push(
      `observed ${callFrames.length} root calls for a ${plan.length}-step plan`,
    );
  }

  for (const [index, callFrame] of callFrames.entries()) {
    const plannedStep = plan[index];
    if (!plannedStep) continue;
    const callId = String(callFrame?.payload?.call_id || "").trim();
    const observedTool = String(callFrame?.payload?.tool_name || "").trim();
    if (observedTool !== plannedStep.tool) {
      failures.push(
        `step ${index + 1} expected ${plannedStep.tool} but observed ${observedTool || "<missing>"}`,
      );
    }
    const duplicateCallFrames = toolCallFrames.filter(
      (frame) => String(frame?.payload?.call_id || "").trim() === callId,
    );
    for (const duplicateFrame of duplicateCallFrames) {
      const duplicateTool = String(
        duplicateFrame?.payload?.tool_name || "",
      ).trim();
      if (duplicateTool !== plannedStep.tool) {
        failures.push(
          `step ${index + 1} duplicate call frame changed tool name`,
        );
      }
      try {
        const duplicateArguments =
          parseLiveToolArguments(duplicateFrame);
        if (Object.keys(duplicateArguments).length === 0) continue;
        if (
          !sameJson(duplicateArguments, plannedStep.arguments)
        ) {
          failures.push(
            `step ${index + 1} duplicate call frame changed arguments`,
          );
        }
      } catch (error) {
        failures.push(
          `step ${index + 1} duplicate call frame has invalid arguments: ${error.message}`,
        );
      }
    }

    let observedArguments = {};
    let argumentsValid = true;
    const rawArguments = callFrame?.payload?.arguments;
    const argumentsProvided =
      (rawArguments &&
        typeof rawArguments === "object" &&
        !Array.isArray(rawArguments)) ||
      (typeof rawArguments === "string" && rawArguments.trim().length > 0);
    try {
      observedArguments = parseLiveToolArguments(callFrame);
    } catch (error) {
      argumentsValid = false;
      failures.push(
        `step ${index + 1} has invalid tool arguments: ${error.message}`,
      );
    }
    const results = resultFrames.filter(
      (frame) => String(frame?.payload?.call_id || "").trim() === callId,
    );
    const nextCall = callFrames[index + 1];
    if (
      argumentsValid &&
      argumentsProvided &&
      !sameJson(observedArguments, plannedStep.arguments)
    ) {
      failures.push(`step ${index + 1} arguments differ from the fixed plan`);
    }
    if (
      argumentsValid &&
      !argumentsProvided &&
      (results.length > 0 || Boolean(nextCall))
    ) {
      failures.push(`step ${index + 1} completed without fixed arguments`);
    }
    if (results.length > 1) {
      failures.push(`step ${index + 1} produced ${results.length} results`);
    }
    if (
      results.some(
        (frame) =>
          String(frame?.payload?.tool_name || "").trim() !==
            plannedStep.tool ||
          frame?.payload?.status !== "success" ||
          Number(frame?.seq || 0) <= Number(callFrame?.seq || 0),
      )
    ) {
      failures.push(`step ${index + 1} produced an invalid tool result`);
    }
    if (
      nextCall &&
      (results.length !== 1 ||
        Number(results[0]?.seq || 0) >= Number(nextCall?.seq || 0))
    ) {
      failures.push(
        `step ${index + 1} did not succeed before step ${index + 2} started`,
      );
    }
  }

  for (const resultFrame of resultFrames) {
    const resultCallId = String(resultFrame?.payload?.call_id || "").trim();
    if (!resultCallId || !callIds.has(resultCallId)) {
      failures.push(
        `observed a root tool result for unknown call ${resultCallId || "<missing>"}`,
      );
    }
  }

  return {
    ok: failures.length === 0,
    failures,
    observed_call_count: callFrames.length,
    completed_call_count: callFrames.filter((callFrame) =>
      resultFrames.some(
        (resultFrame) =>
          resultFrame?.payload?.call_id === callFrame?.payload?.call_id &&
          resultFrame?.payload?.status === "success",
      ),
    ).length,
  };
};

const uniqueToolCallEvidence = (records = []) => {
  const unique = new Map();
  for (const [index, record] of records.entries()) {
    if (record?.type !== "tool_call") continue;
    const callId = String(record.call_id || "").trim();
    const key = callId || `missing-call-id-${index}`;
    if (!unique.has(key)) unique.set(key, record);
  }
  return [...unique.values()];
};

const findAssistantForAttempt = (detail, attempt) => {
  const messages = Array.isArray(detail?.messages) ? detail.messages : [];
  const candidateIds = new Set(
    [attempt?.attempt_id, attempt?.request_id]
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  );
  return (
    messages.find(
      (message) =>
        message?.role === "assistant" &&
        (candidateIds.has(String(message?.meta?.attemptId || "").trim()) ||
          candidateIds.has(String(message?.meta?.requestId || "").trim())),
    ) || null
  );
};

const collectAttemptEvidence = ({ detail, attempt, expectedChatId }) => {
  const message = findAssistantForAttempt(detail, attempt);
  const rootFrames = Array.isArray(message?.traceFrames)
    ? [...message.traceFrames]
    : [];
  const childFramesByRunId =
    message?.subagentFrames && typeof message.subagentFrames === "object"
      ? Object.fromEntries(
          Object.entries(message.subagentFrames).map(([runId, frames]) => [
            runId,
            Array.isArray(frames) ? [...frames] : [],
          ]),
        )
      : {};
  const bundle =
    message?.meta?.bundle && typeof message.meta.bundle === "object"
      ? { ...message.meta.bundle }
      : {};
  const subagentMeta =
    message?.subagentMetaByRunId &&
    typeof message.subagentMetaByRunId === "object"
      ? Object.values(message.subagentMetaByRunId).map((value) => ({ ...value }))
      : [];
  const subagentMetaByRunId =
    message?.subagentMetaByRunId &&
    typeof message.subagentMetaByRunId === "object"
      ? Object.fromEntries(
          Object.entries(message.subagentMetaByRunId).map(([runId, value]) => [
            runId,
            value && typeof value === "object" ? { ...value } : {},
          ]),
        )
      : {};
  return {
    found: Boolean(message),
    message_id: message?.id || attempt.message_id || null,
    status: message?.status || attempt.status || null,
    content: typeof message?.content === "string" ? message.content : "",
    identity: {
      chat_id: expectedChatId,
      attempt_id: message?.meta?.attemptId || attempt.attempt_id || null,
      request_id: message?.meta?.requestId || attempt.request_id || null,
      execution_session_id: message?.meta?.executionSessionId || null,
    },
    token_evidence: {
      model: bundle.model || null,
      consumed_tokens:
        typeof bundle.consumed_tokens === "number"
          ? bundle.consumed_tokens
          : null,
      input_tokens:
        typeof bundle.input_tokens === "number" ? bundle.input_tokens : null,
      output_tokens:
        typeof bundle.output_tokens === "number" ? bundle.output_tokens : null,
      cache_read_input_tokens:
        typeof bundle.cache_read_input_tokens === "number"
          ? bundle.cache_read_input_tokens
          : null,
      cache_creation_input_tokens:
        typeof bundle.cache_creation_input_tokens === "number"
          ? bundle.cache_creation_input_tokens
          : null,
    },
    tool_evidence: collectToolEvidence(message),
    root_tool_evidence: collectToolEvidenceFromFrames(rootFrames),
    root_frames: rootFrames,
    child_frames_by_run_id: childFramesByRunId,
    subagent_evidence: subagentMeta,
    subagent_meta_by_run_id: subagentMetaByRunId,
  };
};

const validateAttemptIdentity = ({ evidence, attempt, chatId }) => {
  const failures = [];
  if (!evidence?.found) failures.push("assistant message was not persisted");
  if (evidence?.identity?.attempt_id !== attempt.attempt_id) {
    failures.push("persisted attempt id does not match the started attempt");
  }
  if (evidence?.identity?.execution_session_id !== chatId) {
    failures.push("persisted execution session does not match the owning chat");
  }
  if (!evidence?.identity?.request_id) {
    failures.push("persisted request id is missing");
  }
  return failures;
};

const summarizeTokenEvidence = (attempts = []) => {
  const records = attempts
    .map((attempt) => attempt?.evidence?.token_evidence)
    .filter(Boolean);
  const numeric = (name) =>
    records.reduce(
      (total, record) =>
        total + (typeof record[name] === "number" ? record[name] : 0),
      0,
    );
  return {
    attempts: attempts.length,
    records_with_usage: records.filter(
      (record) => typeof record.consumed_tokens === "number",
    ).length,
    consumed_tokens: numeric("consumed_tokens"),
    input_tokens: numeric("input_tokens"),
    output_tokens: numeric("output_tokens"),
    cache_read_input_tokens: numeric("cache_read_input_tokens"),
    cache_creation_input_tokens: numeric("cache_creation_input_tokens"),
  };
};

const redactSecrets = (value, secrets = []) => {
  const secretValues = [...new Set(
    (Array.isArray(secrets) ? secrets : [])
      .map((secret) => String(secret || ""))
      .filter(Boolean),
  )].sort((a, b) => b.length - a.length);
  let serialized = JSON.stringify(value, null, 2);
  for (const secret of secretValues) {
    serialized = serialized.split(secret).join("[REDACTED]");
  }
  return JSON.parse(serialized);
};

module.exports = {
  LIVE_DURATION_MS,
  LIVE_GATE_CHECKPOINT,
  LIVE_MATRIX,
  LIVE_MARKER,
  LIVE_MIN_MCP_TIME_SCALE,
  LIVE_MODELS,
  LIVE_ROOT_MAX_ITERATIONS,
  LIVE_WAIT_COUNT,
  LIVE_WAIT_MILLISECONDS,
  LIVE_WORKLOAD_STEP_COUNT,
  LIVE_WORKLOADS,
  WEB_SOURCES,
  buildFyiCommand,
  buildLiveRootPlan,
  buildLiveRootPrompt,
  buildLiveWorkloadSteps,
  computeLiveMcpTimeScale,
  codingArtifact,
  collectAttemptEvidence,
  collectMessageFrames,
  collectToolEvidence,
  collectToolEvidenceFromFrames,
  expectedLiveRootToolCounts,
  getLiveCell,
  iterationMarker,
  liveCompletionMarker,
  liveFyiMarker,
  mcpLaneForCell,
  parseLiveToolArguments,
  postJsonOnce,
  redactSecrets,
  selectLiveCells,
  summarizeTokenEvidence,
  uniqueRootToolCallFrames,
  uniqueToolCallEvidence,
  validateAttemptIdentity,
  validateObservedRootPlanPrefix,
};

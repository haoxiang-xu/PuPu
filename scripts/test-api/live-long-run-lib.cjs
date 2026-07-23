const path = require("node:path");

const LIVE_DURATION_MS = 20 * 60 * 1000;
const LIVE_MIN_ITERATIONS = 3;
const LIVE_MAX_ITERATIONS = 12;

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

const buildCodingPrompt = ({ cell, iteration, workspaceRoot, control = false }) => {
  const artifact = codingArtifact({ cell, iteration, workspaceRoot });
  return [
    `This is an authorized PuPu live coding soak iteration for ${cell.modelId}.`,
    control
      ? "First use the core shell tool to run exactly `sleep 8` inside the attached workspace."
      : "Use the attached workspace tools; do not answer from memory alone.",
    `Use a core file-writing tool to create ${artifact.filename} in the workspace with exactly this single line:`,
    artifact.marker,
    `Read the file back with a core tool and verify that it contains ${artifact.marker}.`,
    `Finish with exactly ${artifact.marker}`,
    "Do not edit or delete any other file.",
  ].join("\n");
};

const mcpLaneForCell = (cell) => (cell.provider === "openai" ? "A" : "B");

const buildMcpPrompt = ({ cell, iteration, control = false }) => {
  const lane = mcpLaneForCell(cell);
  const marker = iterationMarker(cell, iteration);
  if (control) {
    return [
      `This is an authorized PuPu live MCP soak iteration for ${cell.modelId}.`,
      "Call the soak_wait tool exactly once with:",
      JSON.stringify({
        lane,
        milliseconds: 65000,
        marker: "PUPU-DETERMINISTIC-SOAK",
      }),
      `After the tool completes, finish with exactly ${marker}`,
    ].join("\n");
  }
  return [
    `This is an authorized PuPu live MCP soak iteration for ${cell.modelId}.`,
    "Call the soak_checkpoint tool exactly once with:",
    JSON.stringify({
      lane,
      checkpoint: `live-${cell.id}`,
      iteration,
      marker: "PUPU-DETERMINISTIC-SOAK",
    }),
    `After the tool completes, finish with exactly ${marker}`,
  ].join("\n");
};

const buildMcpGatePrompt = ({ cell }) => {
  const lane = mcpLaneForCell(cell);
  return [
    `This is an authorized PuPu durable approval test for ${cell.modelId}.`,
    "Call the soak_gate tool exactly once with:",
    JSON.stringify({
      lane,
      checkpoint: "durable-pause",
      marker: "PUPU-DETERMINISTIC-SOAK",
    }),
    `After approval and tool completion, finish with exactly LIVE_GATE_OK cell=${cell.id}`,
  ].join("\n");
};

const buildWebPrompt = ({ cell, iteration }) => {
  const source = WEB_SOURCES[iteration % WEB_SOURCES.length];
  const marker = iterationMarker(cell, iteration);
  return [
    `This is an authorized PuPu live web soak iteration for ${cell.modelId}.`,
    "Call the real core web_fetch tool exactly once with:",
    JSON.stringify({
      url: source.url,
      mode: "raw",
      offset: 0,
      max_chars: 8000,
    }),
    `Report one fact supported by the fetched page, include the source URL ${source.url}, and mention the evidence text ${source.evidence}.`,
    `Finish with exactly ${marker}`,
    "Do not answer without calling web_fetch.",
  ].join("\n");
};

const buildIterationPrompt = ({ cell, iteration, workspaceRoot, control }) => {
  if (cell.workload === "coding") {
    return buildCodingPrompt({ cell, iteration, workspaceRoot, control });
  }
  if (cell.workload === "mcp") {
    return buildMcpPrompt({ cell, iteration, control });
  }
  if (cell.workload === "web") {
    return buildWebPrompt({ cell, iteration });
  }
  throw new Error(`unsupported live workload: ${cell.workload}`);
};

const buildMultiagentPrompt = ({ cell }) => {
  const tasks = ["a", "b"].map((suffix) => ({
    target: `live-observer-${suffix}`,
    task: `Inspect live cell ${cell.id} as observer ${suffix.toUpperCase()}`,
    instructions: `Return exactly LIVE_CHILD_OK cell=${cell.id} observer=${suffix.toUpperCase()}`,
    expected_output: `LIVE_CHILD_OK cell=${cell.id} observer=${suffix.toUpperCase()}`,
    output_mode: "last_message",
  }));
  return [
    `This is an authorized PuPu multi-agent test for ${cell.modelId}.`,
    "Call spawn_worker_batch exactly once with the following tasks and aggregate their results:",
    JSON.stringify({ tasks }),
    `Finish with exactly LIVE_MULTIAGENT_OK cell=${cell.id}`,
  ].join("\n");
};

const buildQueueCommand = (cell) =>
  `/queue Reply exactly LIVE_QUEUE_OK cell=${cell.id} model=${cell.modelId} and do not call tools.`;

const buildFyiCommand = (cell) =>
  `/fyi LIVE_FYI cell=${cell.id}; include LIVE_FYI cell=${cell.id} in your final response after the current tool finishes.`;

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

const collectToolEvidence = (message) =>
  collectMessageFrames(message)
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
  const bundle =
    message?.meta?.bundle && typeof message.meta.bundle === "object"
      ? { ...message.meta.bundle }
      : {};
  const subagentMeta =
    message?.subagentMetaByRunId &&
    typeof message.subagentMetaByRunId === "object"
      ? Object.values(message.subagentMetaByRunId).map((value) => ({ ...value }))
      : [];
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
    subagent_evidence: subagentMeta,
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
  LIVE_MATRIX,
  LIVE_MAX_ITERATIONS,
  LIVE_MIN_ITERATIONS,
  LIVE_MODELS,
  LIVE_WORKLOADS,
  WEB_SOURCES,
  buildCodingPrompt,
  buildFyiCommand,
  buildIterationPrompt,
  buildMcpGatePrompt,
  buildMcpPrompt,
  buildMultiagentPrompt,
  buildQueueCommand,
  buildWebPrompt,
  codingArtifact,
  collectAttemptEvidence,
  collectMessageFrames,
  collectToolEvidence,
  getLiveCell,
  iterationMarker,
  mcpLaneForCell,
  redactSecrets,
  selectLiveCells,
  summarizeTokenEvidence,
  validateAttemptIdentity,
};

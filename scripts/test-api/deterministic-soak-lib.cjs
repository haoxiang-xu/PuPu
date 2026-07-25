"use strict";

const path = require("node:path");

const LANES = Object.freeze(["A", "B", "C"]);
const MARKER = "PUPU-DETERMINISTIC-SOAK";
const CUSTOM_PROVIDER_SLUG = "pupu-soak";
const CUSTOM_MODEL_NAME = "pupu-fake-responses-v1";
const CUSTOM_MODEL_ID = `custom.${CUSTOM_PROVIDER_SLUG}:${CUSTOM_MODEL_NAME}`;
const MCP_TOOLKIT_ID = "mcp.custom.pupu-deterministic-soak";
const SOAK_AGENT_MAX_ITERATIONS = 2;
const CHILD_TARGETS = Object.freeze([
  "soak-explore-a",
  "soak-explore-b",
  "soak-explore-c",
]);
const CHILD_MAX_PROBE_ITERATIONS = Object.freeze({
  "soak-explore-a": 999991,
  "soak-explore-b": 999992,
  "soak-explore-c": 999993,
});
const REQUIRED_ROOT_PHASES = Object.freeze([
  "probe",
  "wait",
  "gate",
  "fail-once",
  "checkpoint",
  "multiagent",
  "child-question",
  "child-approval",
  "child-max",
  "steady",
]);

const SOAK_PROFILES = Object.freeze({
  quick: Object.freeze({
    name: "quick",
    targetDurationMs: 2 * 60 * 1000,
    timeScale: 0.5,
    phaseTimeoutMs: 2 * 60 * 1000,
    bridgeTimeoutMs: 60 * 1000,
    steadyCadenceMs: 200,
    durationToleranceMs: 15 * 1000,
    periodicReloadIntervalMs: 0,
    testTimeoutMs: 8 * 60 * 1000,
  }),
  full: Object.freeze({
    name: "full",
    targetDurationMs: 20 * 60 * 1000,
    timeScale: 1,
    phaseTimeoutMs: 3 * 60 * 1000,
    bridgeTimeoutMs: 90 * 1000,
    steadyCadenceMs: 250,
    durationToleranceMs: 15 * 1000,
    periodicReloadIntervalMs: 5 * 60 * 1000,
    testTimeoutMs: 30 * 60 * 1000,
  }),
});

const resolveSoakProfile = (name = "quick") => {
  const normalized = String(name || "quick")
    .trim()
    .toLowerCase();
  const profile = SOAK_PROFILES[normalized];
  if (!profile) {
    throw new Error(
      `unknown deterministic soak profile ${JSON.stringify(name)}; expected quick or full`,
    );
  }
  return { ...profile };
};

const assertLane = (lane) => {
  if (!LANES.includes(lane)) {
    throw new Error(`invalid soak lane: ${lane}`);
  }
};

const assertIteration = (iteration) => {
  if (!Number.isSafeInteger(iteration) || iteration < 0) {
    throw new Error(`invalid soak iteration: ${iteration}`);
  }
};

const buildSoakPrompt = ({ lane, phase, iteration }) => {
  assertLane(lane);
  assertIteration(iteration);
  if (!REQUIRED_ROOT_PHASES.includes(phase)) {
    throw new Error(`invalid soak phase: ${phase}`);
  }
  return `SOAK|lane=${lane}|phase=${phase}|iteration=${iteration}`;
};

const buildCustomProviderDefinition = (baseUrl) => {
  const normalizedBaseUrl = String(baseUrl || "").replace(/\/+$/, "");
  if (!/^http:\/\/127\.0\.0\.1:[0-9]+\/v1$/.test(normalizedBaseUrl)) {
    throw new Error(`invalid fake Responses base URL: ${normalizedBaseUrl}`);
  }
  return {
    config_version: 1,
    id: CUSTOM_PROVIDER_SLUG,
    display_name: "PuPu deterministic soak",
    description: "Release-only deterministic OpenAI Responses fixture.",
    protocol: "openai-responses",
    base_url: normalizedBaseUrl,
    auth: { mode: "bearer", key_label: "Fixture key" },
    timeout_seconds: 180,
    default_model: CUSTOM_MODEL_NAME,
    models: [
      {
        id: CUSTOM_MODEL_NAME,
        display_name: "PuPu deterministic Responses",
        capabilities: {
          supports_tools: true,
          supports_vision: false,
          supports_reasoning: false,
          supports_previous_response_id: false,
          max_context_window_tokens: 128000,
        },
      },
    ],
    enabled: true,
    source: "test",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
};

const buildMcpInstallPayload = ({
  pythonPath,
  fixturePath,
  workspaceRoot,
  auditPath,
  timeScale,
} = {}) => {
  const command = path.resolve(String(pythonPath || ""));
  const script = path.resolve(String(fixturePath || ""));
  const workspace = path.resolve(String(workspaceRoot || ""));
  const audit = path.resolve(String(auditPath || ""));
  const scale = Number(timeScale);
  if (!pythonPath || !fixturePath || !workspaceRoot || !auditPath) {
    throw new Error(
      "pythonPath, fixturePath, workspaceRoot, and auditPath are required",
    );
  }
  if (!Number.isFinite(scale) || scale < 0) {
    throw new Error("timeScale must be a finite non-negative number");
  }
  return {
    entryId: "custom",
    workspaceRoot: workspace,
    secrets: {
      PUPU_SOAK_AUDIT_PATH: audit,
      PUPU_SOAK_TIME_SCALE: String(scale),
    },
    customRecipe: {
      toolkit_id: MCP_TOOLKIT_ID,
      toolkit_name: "PuPu deterministic soak",
      toolkit_description: "Closed-world MCP tools for release soak testing.",
      secrets: [
        {
          key: "PUPU_SOAK_AUDIT_PATH",
          label: "PuPu soak audit path",
        },
        {
          key: "PUPU_SOAK_TIME_SCALE",
          label: "PuPu soak time scale",
        },
      ],
      mcp: {
        transport: "stdio",
        command,
        args: [script],
      },
    },
  };
};

const buildSubagentTemplates = () =>
  CHILD_TARGETS.map((name) => {
    const suffix = name.at(-1);
    return {
      filename: `${name}.skeleton`,
      value: {
        name,
        description: `Deterministic leaf worker ${suffix.toUpperCase()} for release soak tests.`,
        instructions: [
          "You are a deterministic leaf worker used only by PuPu release tests.",
          `Only follow the SOAK_CHILD scenario marker addressed to target=${name}.`,
          "The closed-world fake model determines the exact response and tool arguments.",
          "Never delegate or invent an additional action.",
        ].join("\n"),
        allowed_modes: ["delegate", "worker"],
        output_mode: "last_message",
        memory_policy: "ephemeral",
        parallel_safe: true,
        // [] causes the runtime loader to reject the template because its
        // effective tool intersection is empty. null keeps the template
        // registered; the fake model remains closed-world and only emits the
        // exact ask/gate/probe calls exercised below.
        allowed_tools: null,
        model: null,
      },
    };
  });

const buildSoakRecipe = () => ({
  name: "Default",
  description: "Isolated deterministic soak recipe with fixed worker refs.",
  model: null,
  max_iterations: null,
  merge_with_user_selected: true,
  agent: {
    prompt_format: "skeleton",
    prompt: "{{USE_BUILTIN_DEVELOPER_PROMPT}}",
  },
  toolkits: [{ id: "core", enabled_tools: null }],
  subagent_pool: CHILD_TARGETS.map((templateName) => ({
    kind: "ref",
    template_name: templateName,
    disabled_tools: [],
  })),
});

const parseJsonLines = (text) =>
  String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`invalid JSONL record ${index + 1}: ${error.message}`);
      }
    });

const recordsForLane = (records, lane) =>
  records.filter((record) => record?.lane === lane);

const validateAuditEvidence = ({ fakeRecords = [], mcpRecords = [] } = {}) => {
  const failures = [];
  const fail = (message) => failures.push(message);

  for (const lane of LANES) {
    const fakeLane = recordsForLane(fakeRecords, lane);
    const rootToolPhases = new Set(
      fakeLane
        .filter((record) => record.label === "root-tool")
        .map((record) => record.phase),
    );
    for (const phase of REQUIRED_ROOT_PHASES) {
      if (!rootToolPhases.has(phase)) {
        fail(`lane ${lane} has no fake root tool request for phase ${phase}`);
      }
    }
    if (
      !fakeLane.some(
        (record) =>
          record.label === "root-final" &&
          record.phase === "wait" &&
          record.saw_fyi === true,
      )
    ) {
      fail(`lane ${lane} did not carry FYI into the wait continuation`);
    }
    if (!fakeLane.some((record) => record.label === "btw")) {
      fail(`lane ${lane} has no BTW side response`);
    }
    if (!fakeLane.some((record) => record.label === "queue")) {
      fail(`lane ${lane} has no queued follow-up response`);
    }

    const expectedChildOutcomes = {
      multiagent: "completed:3",
      "child-question": "needs_clarification:3",
      "child-approval": "subagent_tool_approval_unsupported:3",
      "child-max": "max_iterations:3",
    };
    for (const [phase, childOutcome] of Object.entries(expectedChildOutcomes)) {
      if (
        !fakeLane.some(
          (record) =>
            record.label === "root-final" &&
            record.phase === phase &&
            record.child_outcome === childOutcome,
        )
      ) {
        fail(
          `lane ${lane} has no verified ${phase} parent convergence (${childOutcome})`,
        );
      }
    }

    const mcpLane = recordsForLane(mcpRecords, lane);
    for (const tool of [
      "soak_probe",
      "soak_wait",
      "soak_gate",
      "soak_checkpoint",
    ]) {
      if (
        !mcpLane.some(
          (record) => record.tool === tool && record.status === "ok",
        )
      ) {
        fail(`lane ${lane} has no successful ${tool} audit record`);
      }
    }
    const failOnceStatuses = mcpLane
      .filter((record) => record.tool === "soak_fail_once")
      .map((record) => record.status);
    if (
      failOnceStatuses.length < 2 ||
      failOnceStatuses[0] !== "failed_once" ||
      failOnceStatuses[1] !== "ok"
    ) {
      fail(
        `lane ${lane} fail-once statuses were ${JSON.stringify(failOnceStatuses)}`,
      );
    }
    const checkpointIterations = mcpLane
      .filter(
        (record) => record.tool === "soak_checkpoint" && record.status === "ok",
      )
      .map((record) => Number(record.args?.iteration))
      .filter(Number.isSafeInteger);
    if (checkpointIterations.length < 2) {
      fail(`lane ${lane} has fewer than two progress checkpoints`);
    }
    for (let index = 1; index < checkpointIterations.length; index += 1) {
      if (checkpointIterations[index] < checkpointIterations[index - 1]) {
        fail(`lane ${lane} checkpoint progress moved backwards`);
        break;
      }
    }

    const successfulGateCalls = mcpLane.filter(
      (record) => record.tool === "soak_gate" && record.status === "ok",
    );
    if (successfulGateCalls.length !== 1) {
      fail(
        `lane ${lane} executed soak_gate ${successfulGateCalls.length} times; child approval must fail closed before MCP execution`,
      );
    }

    for (const [target, iteration] of Object.entries(
      CHILD_MAX_PROBE_ITERATIONS,
    )) {
      const count = mcpLane.filter(
        (record) =>
          record.tool === "soak_probe" &&
          record.status === "ok" &&
          Number(record.args?.iteration) === iteration,
      ).length;
      if (count < SOAK_AGENT_MAX_ITERATIONS) {
        fail(
          `lane ${lane} max-iteration child ${target} produced ${count} sentinel probes; expected at least ${SOAK_AGENT_MAX_ITERATIONS}`,
        );
      }
    }
  }

  const childLabels = {
    happy: "multiagent-child",
    question: "multiagent-child-question-tool",
    approval: "multiagent-child-approval-tool",
    max: "multiagent-child-max-tool",
  };
  for (const lane of LANES) {
    for (const target of CHILD_TARGETS) {
      for (const [scenario, label] of Object.entries(childLabels)) {
        const count = fakeRecords.filter(
          (record) =>
            record.label === label &&
            record.lane === lane &&
            record.direct_target === target,
        ).length;
        const minimum = scenario === "max" ? SOAK_AGENT_MAX_ITERATIONS : 1;
        if (count < minimum) {
          fail(
            `lane ${lane} ${scenario} child ${target} ran ${count} times; expected at least ${minimum}`,
          );
        }
      }
      if (
        !fakeRecords.some(
          (record) =>
            record.label === "multiagent-child-approval-final" &&
            record.lane === lane &&
            record.direct_target === target &&
            record.child_outcome === "subagent_tool_approval_unsupported",
        )
      ) {
        fail(
          `lane ${lane} approval child ${target} did not observe subagent_tool_approval_unsupported`,
        );
      }
    }
  }
  return failures;
};

const validateMultiAgentAuditEvidence = (
  { fakeRecords = [], mcpRecords = [] } = {},
  { expectedRootGateCalls = 1 } = {},
) => {
  const failures = [];
  const expectedChildOutcomes = {
    multiagent: "completed:3",
    "child-question": "needs_clarification:3",
    "child-approval": "subagent_tool_approval_unsupported:3",
    "child-max": "max_iterations:3",
  };
  const childLabels = {
    happy: "multiagent-child",
    question: "multiagent-child-question-tool",
    approval: "multiagent-child-approval-tool",
    max: "multiagent-child-max-tool",
  };

  for (const lane of LANES) {
    const fakeLane = recordsForLane(fakeRecords, lane);
    for (const [phase, childOutcome] of Object.entries(expectedChildOutcomes)) {
      if (
        !fakeLane.some(
          (record) => record.label === "root-tool" && record.phase === phase,
        )
      ) {
        failures.push(`lane ${lane} has no ${phase} root worker batch`);
      }
      if (
        !fakeLane.some(
          (record) =>
            record.label === "root-final" &&
            record.phase === phase &&
            record.child_outcome === childOutcome,
        )
      ) {
        failures.push(
          `lane ${lane} has no verified ${phase} parent convergence (${childOutcome})`,
        );
      }
    }

    const mcpLane = recordsForLane(mcpRecords, lane);
    const successfulGateCalls = mcpLane.filter(
      (record) => record.tool === "soak_gate" && record.status === "ok",
    );
    if (successfulGateCalls.length !== expectedRootGateCalls) {
      failures.push(
        `lane ${lane} executed soak_gate ${successfulGateCalls.length} times; expected ${expectedRootGateCalls} root calls and no child calls`,
      );
    }

    for (const [target, iteration] of Object.entries(
      CHILD_MAX_PROBE_ITERATIONS,
    )) {
      const count = mcpLane.filter(
        (record) =>
          record.tool === "soak_probe" &&
          record.status === "ok" &&
          Number(record.args?.iteration) === iteration,
      ).length;
      if (count < SOAK_AGENT_MAX_ITERATIONS) {
        failures.push(
          `lane ${lane} max-iteration child ${target} produced ${count} sentinel probes; expected at least ${SOAK_AGENT_MAX_ITERATIONS}`,
        );
      }
    }

    for (const target of CHILD_TARGETS) {
      for (const [scenario, label] of Object.entries(childLabels)) {
        const count = fakeRecords.filter(
          (record) =>
            record.label === label &&
            record.lane === lane &&
            record.direct_target === target,
        ).length;
        const minimum = scenario === "max" ? SOAK_AGENT_MAX_ITERATIONS : 1;
        if (count < minimum) {
          failures.push(
            `lane ${lane} ${scenario} child ${target} ran ${count} times; expected at least ${minimum}`,
          );
        }
      }
      if (
        !fakeRecords.some(
          (record) =>
            record.label === "multiagent-child-approval-final" &&
            record.lane === lane &&
            record.direct_target === target &&
            record.child_outcome === "subagent_tool_approval_unsupported",
        )
      ) {
        failures.push(
          `lane ${lane} approval child ${target} did not observe subagent_tool_approval_unsupported`,
        );
      }
    }
  }
  return failures;
};

const validateChatIsolation = (chatRecords = []) => {
  const failures = [];
  const ids = chatRecords.map((record) => record.chat_id).filter(Boolean);
  if (new Set(ids).size !== LANES.length) {
    failures.push("three unique chat ids were not retained");
  }
  const attemptIds = chatRecords.flatMap((record) =>
    (record.attempts || [])
      .map((attempt) => attempt.attempt_id)
      .filter(Boolean),
  );
  if (new Set(attemptIds).size !== attemptIds.length) {
    failures.push("attempt ids were reused across chats or phases");
  }

  const persistedAttemptOwners = new Map();
  const persistedRequestOwners = new Map();
  const recordPersistedOwner = ({ kind, id, chatId, owners }) => {
    if (!id) return;
    const previousOwner = owners.get(id);
    if (previousOwner && previousOwner !== chatId) {
      failures.push(
        `persisted ${kind} ${id} belongs to both ${previousOwner} and ${chatId}`,
      );
      return;
    }
    owners.set(id, chatId);
  };

  for (const record of chatRecords) {
    const lane = record.lane;
    const chatId = String(record.chat_id || "").trim();
    const serialized = JSON.stringify(record.detail || {});
    if (!serialized.includes(`lane=${lane}`)) {
      failures.push(`lane ${lane} chat is missing its own marker`);
    }
    if (!serialized.includes(`SOAK_QUEUE_OK lane=${lane}`)) {
      failures.push(`lane ${lane} chat is missing its queued result`);
    }
    for (const otherLane of LANES.filter((candidate) => candidate !== lane)) {
      if (serialized.includes(`lane=${otherLane}`)) {
        failures.push(`lane ${lane} chat contains lane ${otherLane} content`);
      }
    }
    const assistantMessages = Array.isArray(record.detail?.messages)
      ? record.detail.messages.filter(
          (message) => message?.role === "assistant",
        )
      : [];
    for (const message of assistantMessages) {
      const meta =
        message?.meta && typeof message.meta === "object" ? message.meta : {};
      const persistedAttemptId = String(meta.attemptId || "").trim();
      const persistedRequestId = String(meta.requestId || "").trim();
      const executionSessionId = String(meta.executionSessionId || "").trim();
      recordPersistedOwner({
        kind: "attempt id",
        id: persistedAttemptId,
        chatId,
        owners: persistedAttemptOwners,
      });
      recordPersistedOwner({
        kind: "request id",
        id: persistedRequestId,
        chatId,
        owners: persistedRequestOwners,
      });
      if (executionSessionId && executionSessionId !== chatId) {
        failures.push(
          `lane ${lane} persisted execution session ${executionSessionId} does not match ${chatId}`,
        );
      }
      if (
        JSON.stringify(message.content || "").includes(
          `SOAK_QUEUE_OK lane=${lane}`,
        ) &&
        (!persistedAttemptId || !persistedRequestId || !executionSessionId)
      ) {
        failures.push(
          `lane ${lane} queued assistant result is missing persisted stream identity`,
        );
      }
    }
    const terminalAttempts = (record.attempts || []).filter(
      (attempt) => attempt.status !== "completed",
    );
    if (terminalAttempts.length) {
      failures.push(
        `lane ${lane} has non-completed attempts: ${terminalAttempts
          .map((attempt) => `${attempt.phase}:${attempt.status}`)
          .join(", ")}`,
      );
    }
  }
  return failures;
};

const FORBIDDEN_RUNTIME_PATTERNS = Object.freeze([
  /ExecutionLeaseConflictError/i,
  /execution is already leased by another owner/i,
  /unchain resume_agent error/i,
  /lease[_ -]?conflict/i,
  /attempt_mismatch[^\n]*unexpected/i,
]);

const forbiddenRuntimeLogFindings = (text) => {
  const lines = String(text || "").split(/\r?\n/);
  const findings = [];
  for (const line of lines) {
    if (!line) continue;
    if (FORBIDDEN_RUNTIME_PATTERNS.some((pattern) => pattern.test(line))) {
      findings.push(line.slice(0, 1000));
    }
  }
  return [...new Set(findings)];
};

module.exports = {
  CHILD_MAX_PROBE_ITERATIONS,
  CHILD_TARGETS,
  CUSTOM_MODEL_ID,
  CUSTOM_MODEL_NAME,
  CUSTOM_PROVIDER_SLUG,
  LANES,
  MARKER,
  MCP_TOOLKIT_ID,
  REQUIRED_ROOT_PHASES,
  SOAK_AGENT_MAX_ITERATIONS,
  SOAK_PROFILES,
  buildCustomProviderDefinition,
  buildMcpInstallPayload,
  buildSoakPrompt,
  buildSoakRecipe,
  buildSubagentTemplates,
  forbiddenRuntimeLogFindings,
  parseJsonLines,
  resolveSoakProfile,
  validateAuditEvidence,
  validateChatIsolation,
  validateMultiAgentAuditEvidence,
};

"use strict";

const {
  CHILD_TARGETS,
  LANES,
  MARKER,
} = require("./deterministic-soak-lib.cjs");

const AGENT_LONG_RUN_PREFIX = "AGENT_LONG_RUN";
const AGENT_LONG_RUN_PHASE = "agent-long";
const AGENT_LONG_RUN_WAIT_MILLISECONDS = 65000;
const AGENT_LONG_RUN_GATE_CHECKPOINT = "durable-pause";

const AGENT_LONG_RUN_PROFILES = Object.freeze({
  quick: Object.freeze({
    name: "quick",
    rootToolCalls: 24,
    rootMaxIterations: 32,
    timeScale: 0.1,
    minimumRootDurationMs: 40 * 1000,
    phaseTimeoutMs: 4 * 60 * 1000,
    bridgeTimeoutMs: 60 * 1000,
    testTimeoutMs: 8 * 60 * 1000,
  }),
  full: Object.freeze({
    name: "full",
    rootToolCalls: 96,
    rootMaxIterations: 104,
    timeScale: 1,
    minimumRootDurationMs: 20 * 60 * 1000,
    phaseTimeoutMs: 28 * 60 * 1000,
    bridgeTimeoutMs: 90 * 1000,
    testTimeoutMs: 35 * 60 * 1000,
  }),
});

const resolveAgentLongRunProfile = (name = "quick") => {
  const normalized = String(name || "quick")
    .trim()
    .toLowerCase();
  const profile = AGENT_LONG_RUN_PROFILES[normalized];
  if (!profile) {
    throw new Error(
      `unknown single-agent long-run profile ${JSON.stringify(name)}; expected quick or full`,
    );
  }
  return { ...profile };
};

const assertLane = (lane) => {
  if (!LANES.includes(lane)) {
    throw new Error(`invalid single-agent lane: ${lane}`);
  }
};

const assertRootToolCalls = (rootToolCalls) => {
  if (
    !Number.isSafeInteger(rootToolCalls) ||
    rootToolCalls < 12 ||
    rootToolCalls > 256
  ) {
    throw new Error("rootToolCalls must be an integer from 12 to 256");
  }
};

const buildAgentLongRunPrompt = ({ lane, rootToolCalls }) => {
  assertLane(lane);
  assertRootToolCalls(rootToolCalls);
  return `${AGENT_LONG_RUN_PREFIX}|lane=${lane}|root_tool_calls=${rootToolCalls}`;
};

const parseAgentLongRunMarker = (text) => {
  const pattern =
    /AGENT_LONG_RUN\|lane=([ABC])\|root_tool_calls=([0-9]+)/g;
  let found = null;
  for (const match of String(text || "").matchAll(pattern)) {
    const rootToolCalls = Number(match[2]);
    if (
      !LANES.includes(match[1]) ||
      !Number.isSafeInteger(rootToolCalls) ||
      rootToolCalls < 12 ||
      rootToolCalls > 256
    ) {
      continue;
    }
    found = { lane: match[1], rootToolCalls };
  }
  return found;
};

const agentLongRunWaitSteps = (rootToolCalls) => {
  assertRootToolCalls(rootToolCalls);
  const steps = new Set([0, 5, 10]);
  for (let step = 12; step < rootToolCalls; step += 6) steps.add(step);
  steps.add(rootToolCalls - 3);
  steps.add(rootToolCalls - 1);
  return [...steps]
    .filter((step) => step >= 0 && step < rootToolCalls)
    .sort((left, right) => left - right);
};

const childMarker = ({ scenario, lane, target }) =>
  `SOAK_CHILD|scenario=${scenario}|lane=${lane}|target=${target}`;

const childExpectedOutput = ({ scenario, lane, target }) => {
  if (scenario === "happy") {
    return `SOAK_CHILD_OK lane=${lane} target=${target}`;
  }
  if (scenario === "question") {
    return `needs_clarification lane=${lane} target=${target}`;
  }
  if (scenario === "approval") {
    return `SOAK_CHILD_APPROVAL_OK lane=${lane} target=${target} reason=subagent_tool_approval_unsupported`;
  }
  return `max_iterations lane=${lane} target=${target}`;
};

const workerBatchTool = ({ lane, scenario, targetCount = 3 }) => ({
  name: "spawn_worker_batch",
  arguments: {
    tasks: CHILD_TARGETS.slice(0, targetCount).map((target) => ({
      target,
      task: childMarker({ scenario, lane, target }),
      instructions:
        "Follow only the addressed deterministic SOAK_CHILD scenario.",
      expected_output: childExpectedOutput({ scenario, lane, target }),
      output_mode: "last_message",
    })),
    aggregate_mode: "ordered_list",
  },
});

const delegateTool = ({ lane, step }) => {
  const target = CHILD_TARGETS[step % CHILD_TARGETS.length];
  return {
    name: "delegate_to_subagent",
    arguments: {
      target,
      task: childMarker({ scenario: "happy", lane, target }),
      instructions:
        "Return only the deterministic child marker requested by the task.",
      expected_output: childExpectedOutput({
        scenario: "happy",
        lane,
        target,
      }),
      output_mode: "last_message",
    },
  };
};

const buildAgentLongRunTool = ({ lane, step, rootToolCalls }) => {
  assertLane(lane);
  assertRootToolCalls(rootToolCalls);
  if (!Number.isSafeInteger(step) || step < 0 || step >= rootToolCalls) {
    throw new Error(`invalid single-agent root step: ${step}`);
  }

  if (agentLongRunWaitSteps(rootToolCalls).includes(step)) {
    return {
      name: "soak_wait",
      arguments: {
        lane,
        milliseconds: AGENT_LONG_RUN_WAIT_MILLISECONDS,
        marker: MARKER,
      },
    };
  }
  if (step === 2) {
    return workerBatchTool({ lane, scenario: "happy", targetCount: 3 });
  }
  if (step === 4) return delegateTool({ lane, step });
  if (step === 6) {
    return workerBatchTool({ lane, scenario: "question", targetCount: 2 });
  }
  if (step === 7) {
    return workerBatchTool({ lane, scenario: "approval", targetCount: 2 });
  }
  if (step === 8) {
    return {
      name: "soak_gate",
      arguments: {
        lane,
        checkpoint: AGENT_LONG_RUN_GATE_CHECKPOINT,
        marker: MARKER,
      },
    };
  }
  if (step === 9) {
    return workerBatchTool({ lane, scenario: "max", targetCount: 2 });
  }

  if (step % 2 === 0) {
    return {
      name: "soak_checkpoint",
      arguments: {
        lane,
        checkpoint: "agent-long-progress",
        iteration: step,
        marker: MARKER,
      },
    };
  }
  return {
    name: "soak_probe",
    arguments: { lane, iteration: step, marker: MARKER },
  };
};

const expectedAgentLongRunToolCounts = (rootToolCalls) => {
  assertRootToolCalls(rootToolCalls);
  const counts = {};
  for (const lane of [LANES[0]]) {
    for (let step = 0; step < rootToolCalls; step += 1) {
      const name = buildAgentLongRunTool({
        lane,
        step,
        rootToolCalls,
      }).name;
      counts[name] = (counts[name] || 0) + 1;
    }
  }
  return counts;
};

const expectedAgentLongRunChildRuns = (rootToolCalls) => {
  assertRootToolCalls(rootToolCalls);
  let count = 0;
  for (let step = 0; step < rootToolCalls; step += 1) {
    const tool = buildAgentLongRunTool({
      lane: LANES[0],
      step,
      rootToolCalls,
    });
    if (tool.name === "spawn_worker_batch") {
      count += tool.arguments.tasks.length;
    } else if (tool.name === "delegate_to_subagent") {
      count += 1;
    }
  }
  return count;
};

const validateAgentLongRunAuditEvidence = ({
  fakeRecords = [],
  mcpRecords = [],
  rootToolCalls,
} = {}) => {
  assertRootToolCalls(rootToolCalls);
  const failures = [];
  const expectedCounts = expectedAgentLongRunToolCounts(rootToolCalls);
  const expectedRootProbeIterations = new Set(
    Array.from({ length: rootToolCalls }, (_, step) => step).filter(
      (step) =>
        buildAgentLongRunTool({
          lane: LANES[0],
          step,
          rootToolCalls,
        }).name === "soak_probe",
    ),
  );

  for (const lane of LANES) {
    const rootTools = fakeRecords.filter(
      (record) =>
        record.label === "agent-long-root-tool" && record.lane === lane,
    );
    const rootFinals = fakeRecords.filter(
      (record) =>
        record.label === "agent-long-root-final" && record.lane === lane,
    );
    const observedSteps = rootTools
      .map((record) => Number(record.iteration))
      .sort((left, right) => left - right);
    const expectedSteps = Array.from(
      { length: rootToolCalls },
      (_, step) => step,
    );
    if (JSON.stringify(observedSteps) !== JSON.stringify(expectedSteps)) {
      failures.push(
        `lane ${lane} root steps were not exactly 0..${rootToolCalls - 1}`,
      );
    }
    if (rootFinals.length !== 1) {
      failures.push(
        `lane ${lane} produced ${rootFinals.length} root finals; expected 1`,
      );
    } else if (rootFinals[0].saw_fyi !== true) {
      failures.push(`lane ${lane} final model request did not contain FYI`);
    }

    for (const [toolName, expectedCount] of Object.entries(expectedCounts)) {
      const observedCount = rootTools.filter(
        (record) => record.tool_name === toolName,
      ).length;
      if (observedCount !== expectedCount) {
        failures.push(
          `lane ${lane} root ${toolName} count ${observedCount}; expected ${expectedCount}`,
        );
      }
    }

    const laneMcp = mcpRecords.filter((record) => record.lane === lane);
    for (const toolName of [
      "soak_wait",
      "soak_gate",
      "soak_probe",
      "soak_checkpoint",
    ]) {
      const expectedCount = expectedCounts[toolName] || 0;
      const observedCount = laneMcp.filter(
        (record) =>
          record.tool === toolName &&
          record.status === "ok" &&
          (toolName !== "soak_probe" ||
            expectedRootProbeIterations.has(Number(record.args?.iteration))) &&
          (toolName !== "soak_gate" ||
            record.args?.checkpoint === AGENT_LONG_RUN_GATE_CHECKPOINT),
      ).length;
      if (observedCount !== expectedCount) {
        failures.push(
          `lane ${lane} MCP ${toolName} count ${observedCount}; expected ${expectedCount}`,
        );
      }
    }
  }

  for (const scenario of ["happy", "question", "approval", "max"]) {
    for (const lane of LANES) {
      if (
        !fakeRecords.some(
          (record) =>
            record.lane === lane && record.child_scenario === scenario,
        )
      ) {
        failures.push(`lane ${lane} did not execute ${scenario} subagents`);
      }
    }
  }

  return failures;
};

module.exports = {
  AGENT_LONG_RUN_GATE_CHECKPOINT,
  AGENT_LONG_RUN_PHASE,
  AGENT_LONG_RUN_PREFIX,
  AGENT_LONG_RUN_PROFILES,
  AGENT_LONG_RUN_WAIT_MILLISECONDS,
  buildAgentLongRunPrompt,
  buildAgentLongRunTool,
  expectedAgentLongRunChildRuns,
  expectedAgentLongRunToolCounts,
  agentLongRunWaitSteps,
  parseAgentLongRunMarker,
  resolveAgentLongRunProfile,
  validateAgentLongRunAuditEvidence,
};

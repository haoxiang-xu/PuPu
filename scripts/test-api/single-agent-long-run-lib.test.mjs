import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  AGENT_LONG_RUN_GATE_CHECKPOINT,
  AGENT_LONG_RUN_WAIT_MILLISECONDS,
  agentLongRunWaitSteps,
  buildAgentLongRunPrompt,
  buildAgentLongRunTool,
  expectedAgentLongRunChildRuns,
  expectedAgentLongRunToolCounts,
  parseAgentLongRunMarker,
  resolveAgentLongRunProfile,
  validateAgentLongRunAuditEvidence,
} = require("./single-agent-long-run-lib.cjs");

test("defines a bounded quick smoke and a genuine 20-minute root run", () => {
  const quick = resolveAgentLongRunProfile();
  const full = resolveAgentLongRunProfile("full");

  assert.equal(quick.rootToolCalls, 24);
  assert.ok(quick.rootMaxIterations > quick.rootToolCalls);
  assert.equal(full.rootToolCalls, 96);
  assert.ok(full.rootMaxIterations > full.rootToolCalls);
  assert.equal(full.timeScale, 1);
  assert.equal(full.minimumRootDurationMs, 20 * 60 * 1000);
  assert.throws(
    () => resolveAgentLongRunProfile("conversation"),
    /expected quick or full/,
  );
});

test("builds and parses one canonical root-execution prompt", () => {
  const prompt = buildAgentLongRunPrompt({
    lane: "B",
    rootToolCalls: 96,
  });
  assert.equal(prompt, "AGENT_LONG_RUN|lane=B|root_tool_calls=96");
  assert.deepEqual(parseAgentLongRunMarker(prompt), {
    lane: "B",
    rootToolCalls: 96,
  });
  assert.equal(parseAgentLongRunMarker("AGENT_LONG_RUN|lane=Z|root_tool_calls=3"), null);
  assert.throws(
    () => buildAgentLongRunPrompt({ lane: "D", rootToolCalls: 96 }),
    /invalid single-agent lane/,
  );
});

test("uses fixed tool parameters and includes every required control boundary", () => {
  const rootToolCalls = 96;
  const waits = agentLongRunWaitSteps(rootToolCalls);
  const counts = expectedAgentLongRunToolCounts(rootToolCalls);

  assert.equal(waits.length, 19);
  assert.equal(counts.soak_wait, 19);
  assert.equal(counts.soak_gate, 1);
  assert.equal(counts.spawn_worker_batch, 4);
  assert.equal(counts.delegate_to_subagent, 1);
  assert.equal(expectedAgentLongRunChildRuns(rootToolCalls), 10);
  assert.equal(
    counts.soak_wait +
      counts.soak_gate +
      counts.soak_probe +
      counts.soak_checkpoint +
      counts.spawn_worker_batch +
      counts.delegate_to_subagent,
    rootToolCalls,
  );

  assert.deepEqual(
    buildAgentLongRunTool({ lane: "A", step: 0, rootToolCalls }),
    {
      name: "soak_wait",
      arguments: {
        lane: "A",
        milliseconds: AGENT_LONG_RUN_WAIT_MILLISECONDS,
        marker: "PUPU-DETERMINISTIC-SOAK",
      },
    },
  );
  assert.deepEqual(
    buildAgentLongRunTool({ lane: "C", step: 8, rootToolCalls }),
    {
      name: "soak_gate",
      arguments: {
        lane: "C",
        checkpoint: AGENT_LONG_RUN_GATE_CHECKPOINT,
        marker: "PUPU-DETERMINISTIC-SOAK",
      },
    },
  );

  const questionBatch = buildAgentLongRunTool({
    lane: "B",
    step: 6,
    rootToolCalls,
  });
  assert.equal(questionBatch.name, "spawn_worker_batch");
  assert.equal(questionBatch.arguments.tasks.length, 2);
  assert.ok(
    questionBatch.arguments.tasks.every((task) =>
      task.task.includes("scenario=question"),
    ),
  );

  const delegate = buildAgentLongRunTool({
    lane: "A",
    step: 4,
    rootToolCalls,
  });
  assert.equal(delegate.name, "delegate_to_subagent");
  assert.equal(delegate.arguments.target, "soak-explore-b");
  assert.match(delegate.arguments.task, /scenario=happy/);
});

test("fails closed when a root step is missing or FYI is absent", () => {
  const rootToolCalls = 12;
  const fakeRecords = [];
  for (const lane of ["A", "B", "C"]) {
    for (let step = 0; step < rootToolCalls; step += 1) {
      const tool = buildAgentLongRunTool({ lane, step, rootToolCalls });
      fakeRecords.push({
        label: "agent-long-root-tool",
        lane,
        iteration: step,
        tool_name: tool.name,
      });
    }
    fakeRecords.push({
      label: "agent-long-root-final",
      lane,
      saw_fyi: true,
    });
    for (const scenario of ["happy", "question", "approval", "max"]) {
      fakeRecords.push({ lane, child_scenario: scenario });
    }
  }

  const mcpRecords = [];
  for (const lane of ["A", "B", "C"]) {
    for (let step = 0; step < rootToolCalls; step += 1) {
      const tool = buildAgentLongRunTool({ lane, step, rootToolCalls });
      if (!tool.name.startsWith("soak_")) continue;
      mcpRecords.push({
        lane,
        tool: tool.name,
        status: "ok",
        args: tool.arguments,
      });
    }
  }

  assert.deepEqual(
    validateAgentLongRunAuditEvidence({
      fakeRecords,
      mcpRecords,
      rootToolCalls,
    }),
    [],
  );

  const brokenFake = fakeRecords.filter(
    (record) =>
      !(
        record.label === "agent-long-root-tool" &&
        record.lane === "B" &&
        record.iteration === 3
      ),
  );
  const bFinal = brokenFake.find(
    (record) =>
      record.label === "agent-long-root-final" && record.lane === "B",
  );
  bFinal.saw_fyi = false;
  const failures = validateAgentLongRunAuditEvidence({
    fakeRecords: brokenFake,
    mcpRecords,
    rootToolCalls,
  });
  assert.ok(failures.some((failure) => /lane B root steps/.test(failure)));
  assert.ok(failures.some((failure) => /lane B final.*FYI/.test(failure)));
});

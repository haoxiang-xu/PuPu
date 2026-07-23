import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

const require = createRequire(import.meta.url);
const {
  CHILD_MAX_PROBE_ITERATIONS,
  CHILD_TARGETS,
  CUSTOM_MODEL_ID,
  LANES,
  MARKER,
  MCP_TOOLKIT_ID,
  REQUIRED_ROOT_PHASES,
  SOAK_AGENT_MAX_ITERATIONS,
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
} = require("./deterministic-soak-lib.cjs");

describe("deterministic soak configuration", () => {
  it("keeps quick near two minutes and full strictly at twenty minutes", () => {
    const quick = resolveSoakProfile();
    const full = resolveSoakProfile("full");

    assert.equal(quick.name, "quick");
    assert.equal(quick.targetDurationMs, 120000);
    assert.equal(full.name, "full");
    assert.equal(full.targetDurationMs, 1200000);
    assert.equal(full.timeScale, 1);
    assert.ok(full.testTimeoutMs > full.targetDurationMs);
    assert.throws(() => resolveSoakProfile("overnight"), /quick or full/);
  });

  it("builds strict lane, phase, and iteration prompts", () => {
    assert.equal(
      buildSoakPrompt({ lane: "B", phase: "checkpoint", iteration: 42 }),
      "SOAK|lane=B|phase=checkpoint|iteration=42",
    );
    assert.throws(
      () => buildSoakPrompt({ lane: "D", phase: "probe", iteration: 0 }),
      /invalid soak lane/,
    );
    assert.throws(
      () => buildSoakPrompt({ lane: "A", phase: "unknown", iteration: 0 }),
      /invalid soak phase/,
    );
    assert.throws(
      () => buildSoakPrompt({ lane: "A", phase: "probe", iteration: -1 }),
      /invalid soak iteration/,
    );
  });

  it("builds the custom provider, MCP recipe, and three deterministic workers", () => {
    const provider = buildCustomProviderDefinition("http://127.0.0.1:4567/v1/");
    assert.equal(provider.id, "pupu-soak");
    assert.equal(provider.base_url, "http://127.0.0.1:4567/v1");
    assert.equal(provider.models[0].capabilities.supports_tools, true);
    assert.equal(
      provider.models[0].capabilities.supports_previous_response_id,
      false,
    );
    assert.equal(CUSTOM_MODEL_ID, "custom.pupu-soak:pupu-fake-responses-v1");

    const install = buildMcpInstallPayload({
      pythonPath: "/tmp/venv/bin/python",
      fixturePath: "/tmp/fixture.py",
      workspaceRoot: "/tmp/workspace",
      auditPath: "/tmp/mcp-audit.jsonl",
      timeScale: 0.5,
    });
    assert.equal(install.customRecipe.toolkit_id, MCP_TOOLKIT_ID);
    assert.equal(install.customRecipe.mcp.transport, "stdio");
    assert.deepEqual(install.customRecipe.mcp.args, ["/tmp/fixture.py"]);
    assert.deepEqual(
      install.customRecipe.secrets.map(({ key }) => key),
      ["PUPU_SOAK_AUDIT_PATH", "PUPU_SOAK_TIME_SCALE"],
    );
    assert.deepEqual(install.secrets, {
      PUPU_SOAK_AUDIT_PATH: "/tmp/mcp-audit.jsonl",
      PUPU_SOAK_TIME_SCALE: "0.5",
    });

    const templates = buildSubagentTemplates();
    assert.deepEqual(
      templates.map((template) => template.value.name),
      ["soak-explore-a", "soak-explore-b", "soak-explore-c"],
    );
    assert.ok(templates.every((template) => template.value.parallel_safe));
    assert.ok(
      templates.every((template) => template.value.allowed_tools === null),
    );
    assert.equal(SOAK_AGENT_MAX_ITERATIONS, 2);
    assert.deepEqual(
      Object.values(CHILD_MAX_PROBE_ITERATIONS),
      [999991, 999992, 999993],
    );

    const recipe = buildSoakRecipe();
    assert.equal(recipe.name, "Default");
    assert.equal(recipe.merge_with_user_selected, true);
    assert.deepEqual(
      recipe.subagent_pool.map((entry) => entry.template_name),
      CHILD_TARGETS,
    );
  });
});

const healthyAudits = () => {
  const fakeRecords = [];
  const mcpRecords = [];
  for (const lane of LANES) {
    for (const phase of REQUIRED_ROOT_PHASES) {
      fakeRecords.push({
        lane,
        label: "root-tool",
        phase,
        tool_name: phase === "multiagent" ? "spawn_worker_batch" : "soak_probe",
      });
    }
    fakeRecords.push({
      lane,
      label: "root-final",
      phase: "wait",
      saw_fyi: true,
    });
    fakeRecords.push({ lane, label: "btw" });
    fakeRecords.push({ lane, label: "queue" });
    fakeRecords.push(
      {
        lane,
        label: "root-final",
        phase: "multiagent",
        child_outcome: "completed:3",
      },
      {
        lane,
        label: "root-final",
        phase: "child-question",
        child_outcome: "needs_clarification:3",
      },
      {
        lane,
        label: "root-final",
        phase: "child-approval",
        child_outcome: "subagent_tool_approval_unsupported:3",
      },
      {
        lane,
        label: "root-final",
        phase: "child-max",
        child_outcome: "max_iterations:3",
      },
    );
    mcpRecords.push(
      { lane, tool: "soak_probe", status: "ok", args: { iteration: 0 } },
      { lane, tool: "soak_wait", status: "ok", args: {} },
      { lane, tool: "soak_gate", status: "ok", args: {} },
      {
        lane,
        tool: "soak_checkpoint",
        status: "ok",
        args: { iteration: 0 },
      },
      {
        lane,
        tool: "soak_checkpoint",
        status: "ok",
        args: { iteration: 20 },
      },
      { lane, tool: "soak_fail_once", status: "failed_once", args: {} },
      { lane, tool: "soak_fail_once", status: "ok", args: {} },
    );
    for (const iteration of Object.values(CHILD_MAX_PROBE_ITERATIONS)) {
      for (let index = 0; index < SOAK_AGENT_MAX_ITERATIONS; index += 1) {
        mcpRecords.push({
          lane,
          tool: "soak_probe",
          status: "ok",
          args: { iteration },
        });
      }
    }
  }
  for (const lane of LANES) {
    for (const target of CHILD_TARGETS) {
      fakeRecords.push(
        { lane, label: "multiagent-child", direct_target: target },
        {
          lane,
          label: "multiagent-child-question-tool",
          direct_target: target,
        },
        {
          lane,
          label: "multiagent-child-approval-tool",
          direct_target: target,
        },
        {
          lane,
          label: "multiagent-child-approval-final",
          direct_target: target,
          child_outcome: "subagent_tool_approval_unsupported",
        },
      );
      for (let index = 0; index < SOAK_AGENT_MAX_ITERATIONS; index += 1) {
        fakeRecords.push({
          lane,
          label: "multiagent-child-max-tool",
          direct_target: target,
        });
      }
    }
  }
  return { fakeRecords, mcpRecords };
};

describe("deterministic soak evidence validators", () => {
  it("accepts complete per-lane tool, interject, checkpoint, and worker evidence", () => {
    assert.deepEqual(validateAuditEvidence(healthyAudits()), []);
  });

  it("validates the focused multi-agent boundary evidence without root gates", () => {
    const audits = healthyAudits();
    audits.mcpRecords = audits.mcpRecords.filter(
      (record) => record.tool !== "soak_gate",
    );
    assert.deepEqual(
      validateMultiAgentAuditEvidence(audits, { expectedRootGateCalls: 0 }),
      [],
    );

    audits.fakeRecords = audits.fakeRecords.filter(
      (record) =>
        !(
          record.lane === "B" &&
          record.label === "multiagent-child-question-tool" &&
          record.direct_target === "soak-explore-c"
        ),
    );
    const failures = validateMultiAgentAuditEvidence(audits, {
      expectedRootGateCalls: 0,
    });
    assert.ok(
      failures.some(
        (failure) =>
          failure.includes("lane B question child soak-explore-c") &&
          failure.includes("ran 0 times"),
      ),
    );
  });

  it("reports missing and backwards audit evidence", () => {
    const audits = healthyAudits();
    audits.fakeRecords = audits.fakeRecords.filter(
      (record) => !(record.lane === "A" && record.phase === "gate"),
    );
    const laneBCheckpoints = audits.mcpRecords.filter(
      (record) => record.lane === "B" && record.tool === "soak_checkpoint",
    );
    laneBCheckpoints[1].args.iteration = -1;

    const failures = validateAuditEvidence(audits);
    assert.ok(
      failures.some(
        (failure) => failure.includes("lane A") && failure.includes("gate"),
      ),
    );
    assert.ok(
      failures.some((failure) =>
        failure.includes("lane B checkpoint progress moved backwards"),
      ),
    );
  });

  it("validates exact chat and attempt isolation", () => {
    const records = LANES.map((lane, laneIndex) => ({
      lane,
      chat_id: `chat-${lane}`,
      detail: {
        messages: [
          { content: `SOAK|lane=${lane}|phase=probe|iteration=0` },
          {
            role: "assistant",
            content: `SOAK probe complete lane=${lane}`,
            meta: {
              attemptId: `attempt-${laneIndex}`,
              requestId: `request-${laneIndex}`,
              executionSessionId: `chat-${lane}`,
            },
          },
          {
            role: "assistant",
            content: `SOAK_QUEUE_OK lane=${lane}`,
            meta: {
              attemptId: `queue-attempt-${laneIndex}`,
              requestId: `queue-request-${laneIndex}`,
              executionSessionId: `chat-${lane}`,
            },
          },
        ],
      },
      attempts: [
        {
          phase: "probe",
          attempt_id: `attempt-${laneIndex}`,
          status: "completed",
        },
      ],
    }));
    assert.deepEqual(validateChatIsolation(records), []);

    records[0].detail.messages.push({ content: "SOAK_QUEUE_OK lane=B" });
    records[1].attempts[0].attempt_id = records[0].attempts[0].attempt_id;
    records[1].detail.messages[1].meta.attemptId =
      records[0].detail.messages[1].meta.attemptId;
    records[2].detail.messages[2].meta.executionSessionId = "chat-A";
    const failures = validateChatIsolation(records);
    assert.ok(
      failures.includes("attempt ids were reused across chats or phases"),
    );
    assert.ok(failures.includes("lane A chat contains lane B content"));
    assert.ok(
      failures.some((failure) =>
        failure.includes("persisted attempt id attempt-0 belongs to both"),
      ),
    );
    assert.ok(
      failures.some((failure) =>
        failure.includes("lane C persisted execution session chat-A"),
      ),
    );
  });

  it("parses JSONL and finds only release-blocking runtime log signatures", () => {
    assert.deepEqual(parseJsonLines('{"a":1}\n\n{"b":2}\n'), [
      { a: 1 },
      { b: 2 },
    ]);
    assert.throws(() => parseJsonLines("{broken"), /invalid JSONL record 1/);

    const findings = forbiddenRuntimeLogFindings(
      [
        "normal terminated child cleanup",
        "ExecutionLeaseConflictError: execution is already leased by another owner",
        "normal line",
      ].join("\n"),
    );
    assert.equal(findings.length, 1);
    assert.match(findings[0], /ExecutionLeaseConflictError/);
    assert.equal(MARKER, "PUPU-DETERMINISTIC-SOAK");
  });
});

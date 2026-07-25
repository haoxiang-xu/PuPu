import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  LIVE_DURATION_MS,
  LIVE_GATE_CHECKPOINT,
  LIVE_MATRIX,
  LIVE_MIN_MCP_TIME_SCALE,
  LIVE_ROOT_MAX_ITERATIONS,
  LIVE_WAIT_COUNT,
  LIVE_WAIT_MILLISECONDS,
  LIVE_WORKLOADS,
  WEB_SOURCES,
  buildFyiCommand,
  buildLiveRootPlan,
  buildLiveRootPrompt,
  codingArtifact,
  collectAttemptEvidence,
  computeLiveMcpTimeScale,
  expectedLiveRootToolCounts,
  getLiveCell,
  liveCompletionMarker,
  liveFyiMarker,
  postJsonOnce,
  redactSecrets,
  selectLiveCells,
  summarizeTokenEvidence,
  uniqueToolCallEvidence,
  validateAttemptIdentity,
  validateObservedRootPlanPrefix,
} = require("./live-long-run-lib.cjs");

test("defines the exact six-cell workload/model matrix", () => {
  assert.equal(LIVE_DURATION_MS, 20 * 60 * 1000);
  assert.equal(LIVE_ROOT_MAX_ITERATIONS, 40);
  assert.equal(LIVE_WAIT_COUNT, 19);
  assert.equal(LIVE_WAIT_MILLISECONDS, 65000);
  assert.deepEqual(LIVE_WORKLOADS, ["coding", "mcp", "web"]);
  assert.equal(LIVE_MATRIX.length, 6);
  assert.deepEqual(
    LIVE_MATRIX.map(({ id, workload, modelId }) => ({
      id,
      workload,
      modelId,
    })),
    [
      {
        id: "coding-openai",
        workload: "coding",
        modelId: "openai:gpt-5.2-codex",
      },
      {
        id: "coding-anthropic",
        workload: "coding",
        modelId: "anthropic:claude-sonnet-4-6",
      },
      {
        id: "mcp-openai",
        workload: "mcp",
        modelId: "openai:gpt-5.2-codex",
      },
      {
        id: "mcp-anthropic",
        workload: "mcp",
        modelId: "anthropic:claude-sonnet-4-6",
      },
      {
        id: "web-openai",
        workload: "web",
        modelId: "openai:gpt-5.2-codex",
      },
      {
        id: "web-anthropic",
        workload: "web",
        modelId: "anthropic:claude-sonnet-4-6",
      },
    ],
  );
});

test("selects independent cells without accepting model aliases", () => {
  assert.deepEqual(
    selectLiveCells([
      "web-anthropic",
      "coding-openai",
      "web-anthropic",
    ]).map((cell) => cell.id),
    ["web-anthropic", "coding-openai"],
  );
  assert.equal(getLiveCell("mcp-openai").modelId, "openai:gpt-5.2-codex");
  assert.throws(
    () => selectLiveCells(["coding-gpt-5"]),
    /unknown live long-run cell/,
  );
});

test("builds one fixed ordered root plan per workload", () => {
  const workspaceRoot = "/tmp/pupu-live-workspace";
  const expectations = {
    "coding-openai": {
      soak_wait: 19,
      soak_checkpoint: 3,
      write: 3,
      read: 3,
      spawn_worker_batch: 1,
      delegate_to_subagent: 1,
      soak_gate: 1,
    },
    "mcp-anthropic": {
      soak_wait: 19,
      soak_checkpoint: 3,
      soak_probe: 3,
      spawn_worker_batch: 1,
      delegate_to_subagent: 1,
      soak_gate: 1,
    },
    "web-openai": {
      soak_wait: 19,
      soak_checkpoint: 3,
      web_fetch: 3,
      spawn_worker_batch: 1,
      delegate_to_subagent: 1,
      soak_gate: 1,
    },
  };

  for (const [cellId, expectedCounts] of Object.entries(expectations)) {
    const cell = getLiveCell(cellId);
    const plan = buildLiveRootPlan({ cell, workspaceRoot });
    assert.deepEqual(
      plan.map((step) => step.step),
      Array.from({ length: plan.length }, (_, index) => index + 1),
    );
    assert.deepEqual(
      expectedLiveRootToolCounts({ cell, workspaceRoot }),
      expectedCounts,
    );
    const waits = plan.filter((step) => step.tool === "soak_wait");
    assert.equal(waits.length, LIVE_WAIT_COUNT);
    assert.deepEqual(
      waits.map((step) => step.wait_index),
      Array.from({ length: LIVE_WAIT_COUNT }, (_, index) => index),
    );
    assert.ok(
      waits.every(
        (step) =>
          step.arguments.milliseconds === LIVE_WAIT_MILLISECONDS,
      ),
    );
    assert.ok(
      plan.findIndex((step) => step.tool === "soak_gate") >
        plan.findIndex((step) => step.tool === "delegate_to_subagent"),
    );
    assert.equal(
      plan.find((step) => step.tool === "soak_gate").arguments
        .checkpoint,
      LIVE_GATE_CHECKPOINT,
    );
  }
});

test("validates the observed root calls as an exact sequential plan prefix", () => {
  const plan = buildLiveRootPlan({
    cell: getLiveCell("mcp-openai"),
    workspaceRoot: "/tmp/pupu-live-prefix",
  });
  const call = (index, overrides = {}) => ({
    type: "tool_call",
    seq: index * 10 + 1,
    payload: {
      call_id: `call-${index}`,
      tool_name: plan[index].tool,
      arguments: plan[index].arguments,
      ...overrides,
    },
  });
  const result = (index, overrides = {}) => ({
    type: "tool_result",
    seq: index * 10 + 2,
    payload: {
      call_id: `call-${index}`,
      tool_name: plan[index].tool,
      status: "success",
      ...overrides,
    },
  });

  assert.deepEqual(
    validateObservedRootPlanPrefix({
      frames: [call(0), result(0), call(1)],
      plan,
    }),
    {
      ok: true,
      failures: [],
      observed_call_count: 2,
      completed_call_count: 1,
    },
  );
  assert.equal(
    validateObservedRootPlanPrefix({
      frames: [call(0, { tool_name: "soak_probe" })],
      plan,
    }).ok,
    false,
  );
  assert.equal(
    validateObservedRootPlanPrefix({
      frames: [call(0, { arguments: { lane: "wrong" } })],
      plan,
    }).ok,
    false,
  );
  const confirmationEnrichment = call(0);
  confirmationEnrichment.seq = 2;
  confirmationEnrichment.payload = {
    ...confirmationEnrichment.payload,
    arguments: {},
    requires_confirmation: true,
  };
  assert.equal(
    validateObservedRootPlanPrefix({
      frames: [call(0), confirmationEnrichment],
      plan,
    }).ok,
    true,
  );
  assert.equal(
    validateObservedRootPlanPrefix({
      frames: [
        call(0, { arguments: { lane: "wrong" } }),
        { ...call(0), seq: 2 },
      ],
      plan,
    }).ok,
    false,
  );
  assert.equal(
    validateObservedRootPlanPrefix({
      frames: [call(0), result(0, { tool_name: "wrong_tool" })],
      plan,
    }).ok,
    false,
  );
  assert.equal(
    validateObservedRootPlanPrefix({
      frames: [call(0), call(1)],
      plan,
    }).ok,
    false,
  );
  assert.equal(
    validateObservedRootPlanPrefix({
      frames: [
        call(0),
        result(0, { call_id: "unknown-call" }),
      ],
      plan,
    }).ok,
    false,
  );
});

test("prompt starts the pre-approved plan and cannot know the FYI nonce", () => {
  const cell = getLiveCell("coding-openai");
  const workspaceRoot = "/tmp/pupu-live-workspace";
  const plan = buildLiveRootPlan({ cell, workspaceRoot });
  const hiddenFyi = liveFyiMarker(cell, "attempt-secret-nonce");
  const prompt = buildLiveRootPrompt({ cell, workspaceRoot });
  assert.match(prompt, /already approved/);
  assert.match(prompt, /\[WAIT 1\/19\]/);
  assert.match(prompt, /exact numeric order/);
  assert.match(prompt, /initially unknown nonce/);
  assert.doesNotMatch(prompt, /attempt-secret-nonce/);
  assert.doesNotMatch(prompt, new RegExp(hiddenFyi));
  assert.match(
    prompt,
    new RegExp(liveCompletionMarker(cell, plan.length)),
  );
  assert.match(
    buildFyiCommand(cell, "attempt-secret-nonce"),
    /LIVE_FYI_ACK/,
  );
});

test("root start helper makes one HTTP mutation and never retries 503", async () => {
  let requestCount = 0;
  let callbackCount = 0;
  let requestInit = null;
  await assert.rejects(
    postJsonOnce(
      { baseUrl: "http://127.0.0.1:1/v1" },
      "/chats/chat-1/runs",
      { text: "fixed root" },
      () => {
        callbackCount += 1;
      },
      async (_url, init) => {
        requestCount += 1;
        requestInit = init;
        return {
          ok: false,
          status: 503,
          headers: { get: () => "application/json" },
          json: async () => ({
            error: { code: "not_ready", message: "not ready" },
          }),
        };
      },
    ),
    (error) =>
      error?.status === 503 &&
      error?.body?.error?.code === "not_ready",
  );
  assert.equal(requestCount, 1);
  assert.equal(callbackCount, 1);
  assert.equal(requestInit.redirect, "error");
});

test("derives a fail-closed wait scale from root duration", () => {
  assert.equal(computeLiveMcpTimeScale(1000), LIVE_MIN_MCP_TIME_SCALE);
  assert.equal(computeLiveMcpTimeScale(LIVE_DURATION_MS), 1);
  assert.ok(
    computeLiveMcpTimeScale(40 * 60 * 1000) >
      computeLiveMcpTimeScale(LIVE_DURATION_MS),
  );
  assert.throws(() => computeLiveMcpTimeScale(0), /greater than zero/);
});

test("creates only isolated coding artifacts and fixed web sources", () => {
  const cell = getLiveCell("coding-openai");
  const artifact = codingArtifact({
    cell,
    iteration: 2,
    workspaceRoot: "/tmp/pupu-live-workspace",
  });
  assert.equal(artifact.filename, "live-coding-openai-002.txt");
  assert.match(
    artifact.absolutePath,
    /pupu-live-workspace\/live-coding-openai-002\.txt$/,
  );
  assert.deepEqual(
    WEB_SOURCES.map((source) => source.url),
    [
      "https://www.iana.org/help/example-domains",
      "https://www.rfc-editor.org/rfc/rfc9110",
      "https://www.example.com/",
    ],
  );
});

test("extracts bounded root and child identity evidence without flattening", () => {
  const attempt = {
    attempt_id: "attempt-1",
    request_id: null,
    status: "completed",
    message_id: "assistant-1",
  };
  const detail = {
    messages: [
      {
        id: "assistant-1",
        role: "assistant",
        status: "done",
        content: "LIVE_AGENT_LONG_RUN_OK",
        meta: {
          attemptId: "attempt-1",
          requestId: "attempt-1",
          executionSessionId: "chat-1",
          bundle: {
            model: "openai:gpt-5.2-codex",
            consumed_tokens: 13,
            input_tokens: 8,
            output_tokens: 5,
          },
        },
        traceFrames: [
          {
            type: "tool_call",
            run_id: "attempt-1",
            payload: {
              tool_name: "web_fetch",
              call_id: "call-1",
              arguments: { url: "https://www.example.com/" },
            },
          },
          {
            type: "tool_call",
            run_id: "attempt-1",
            payload: {
              tool_name: "web_fetch",
              call_id: "call-1",
              arguments: {},
              requires_confirmation: true,
            },
          },
          {
            type: "tool_result",
            run_id: "attempt-1",
            payload: {
              tool_name: "web_fetch",
              call_id: "call-1",
              result: "x".repeat(8000),
            },
          },
        ],
        subagentFrames: {
          child: [
            {
              type: "final_message",
              run_id: "child",
              payload: { content: "LIVE_CHILD_OK" },
            },
          ],
        },
        subagentMetaByRunId: {
          child: {
            mode: "worker",
            template: "live-observer-a",
            status: "completed",
          },
        },
      },
    ],
  };
  const evidence = collectAttemptEvidence({
    detail,
    attempt,
    expectedChatId: "chat-1",
  });
  assert.equal(evidence.found, true);
  assert.equal(evidence.identity.attempt_id, "attempt-1");
  assert.equal(evidence.identity.execution_session_id, "chat-1");
  assert.equal(evidence.token_evidence.consumed_tokens, 13);
  assert.equal(evidence.root_frames.length, 3);
  assert.equal(evidence.child_frames_by_run_id.child.length, 1);
  assert.equal(evidence.subagent_meta_by_run_id.child.mode, "worker");
  assert.equal(uniqueToolCallEvidence(evidence.root_tool_evidence).length, 1);
  assert.ok(evidence.root_tool_evidence[2].payload.preview.length < 6200);
  assert.deepEqual(
    validateAttemptIdentity({ evidence, attempt, chatId: "chat-1" }),
    [],
  );
  assert.deepEqual(summarizeTokenEvidence([{ evidence }]), {
    attempts: 1,
    records_with_usage: 1,
    consumed_tokens: 13,
    input_tokens: 8,
    output_tokens: 5,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  });
});

test("fails closed on absent identity and redacts exact credentials", () => {
  const missing = collectAttemptEvidence({
    detail: { messages: [{ role: "assistant", content: "unrelated" }] },
    attempt: { attempt_id: "attempt-missing" },
    expectedChatId: "chat-1",
  });
  assert.equal(missing.found, false);
  assert.ok(
    validateAttemptIdentity({
      evidence: missing,
      attempt: { attempt_id: "attempt-missing" },
      chatId: "chat-1",
    }).length >= 3,
  );

  const secret = "fixture-secret-value-123";
  const redacted = redactSecrets(
    { message: `provider rejected ${secret}`, nested: [secret] },
    [secret],
  );
  assert.equal(JSON.stringify(redacted).includes(secret), false);
  assert.equal(redacted.nested[0], "[REDACTED]");
});

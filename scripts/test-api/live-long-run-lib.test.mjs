import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  LIVE_DURATION_MS,
  LIVE_MATRIX,
  LIVE_WORKLOADS,
  buildIterationPrompt,
  buildMcpGatePrompt,
  buildMultiagentPrompt,
  codingArtifact,
  collectAttemptEvidence,
  getLiveCell,
  redactSecrets,
  selectLiveCells,
  summarizeTokenEvidence,
  validateAttemptIdentity,
} = require("./live-long-run-lib.cjs");

test("defines the exact six-cell workload/model matrix", () => {
  assert.equal(LIVE_DURATION_MS, 20 * 60 * 1000);
  assert.deepEqual(LIVE_WORKLOADS, ["coding", "mcp", "web"]);
  assert.equal(LIVE_MATRIX.length, 6);
  assert.deepEqual(
    LIVE_MATRIX.map(({ id, workload, modelId }) => ({ id, workload, modelId })),
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
    selectLiveCells(["web-anthropic", "coding-openai", "web-anthropic"]).map(
      (cell) => cell.id,
    ),
    ["web-anthropic", "coding-openai"],
  );
  assert.equal(getLiveCell("mcp-openai").modelId, "openai:gpt-5.2-codex");
  assert.throws(
    () => selectLiveCells(["coding-gpt-5"]),
    /unknown live long-run cell/,
  );
});

test("builds closed workload prompts and isolated coding artifacts", () => {
  const codingCell = getLiveCell("coding-openai");
  const artifact = codingArtifact({
    cell: codingCell,
    iteration: 7,
    workspaceRoot: "/tmp/pupu-live-workspace",
  });
  assert.equal(artifact.filename, "live-coding-openai-007.txt");
  assert.match(artifact.absolutePath, /pupu-live-workspace\/live-coding-openai-007\.txt$/);
  assert.match(
    buildIterationPrompt({
      cell: codingCell,
      iteration: 7,
      workspaceRoot: "/tmp/pupu-live-workspace",
      control: true,
    }),
    /sleep 8/,
  );

  const mcpCell = getLiveCell("mcp-anthropic");
  const mcpPrompt = buildIterationPrompt({
    cell: mcpCell,
    iteration: 3,
    workspaceRoot: "/tmp/unused",
    control: false,
  });
  assert.match(mcpPrompt, /soak_checkpoint/);
  assert.match(mcpPrompt, /"lane":"B"/);
  assert.match(buildMcpGatePrompt({ cell: mcpCell }), /soak_gate/);

  const webCell = getLiveCell("web-openai");
  const webPrompt = buildIterationPrompt({
    cell: webCell,
    iteration: 0,
    workspaceRoot: "/tmp/unused",
    control: false,
  });
  assert.match(webPrompt, /web_fetch/);
  assert.match(webPrompt, /https:\/\//);

  const multiagent = buildMultiagentPrompt({ cell: webCell });
  assert.match(multiagent, /spawn_worker_batch/);
  assert.match(multiagent, /live-observer-a/);
  assert.match(multiagent, /live-observer-b/);
});

test("extracts bounded identity, token, tool, and multi-agent evidence", () => {
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
        content: "LIVE_LONG_RUN_OK",
        meta: {
          attemptId: "attempt-1",
          requestId: "request-1",
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
            payload: {
              tool_name: "web_fetch",
              call_id: "call-1",
              arguments: { url: "https://www.example.com/" },
            },
          },
          {
            type: "tool_result",
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
              type: "tool_result",
              payload: { tool_name: "read", call_id: "child-call" },
            },
          ],
        },
        subagentMetaByRunId: {
          child: { runId: "child", template: "live-observer-a" },
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
  assert.deepEqual(
    evidence.tool_evidence.map((item) => item.tool_name),
    ["web_fetch", "web_fetch", "read"],
  );
  assert.ok(evidence.tool_evidence[1].payload.preview.length < 6200);
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

test("fails closed on absent identity and redacts exact credentials recursively", () => {
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

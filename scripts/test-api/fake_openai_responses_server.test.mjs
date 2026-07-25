import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

const require = createRequire(import.meta.url);
const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "fake_openai_responses_server.js",
);
const {
  MARKER,
  buildResponseEnvelope,
  createFakeOpenAIResponsesServer,
  serializeSse,
} = require(fixturePath);
const {
  buildAgentLongRunPrompt,
} = require("./single-agent-long-run-lib.cjs");

const toolSchema = (name) => ({
  type: "function",
  name,
  description: `${name} test fixture`,
  parameters: { type: "object", properties: {}, additionalProperties: false },
});

const soakBody = ({ lane = "A", phase = "probe", iteration = 0 } = {}) => ({
  model: "pupu-fake-responses-v1",
  input: [
    {
      role: "user",
      content: `SOAK|lane=${lane}|phase=${phase}|iteration=${iteration}`,
    },
  ],
  tools: [
    "soak_probe",
    "soak_wait",
    "soak_gate",
    "soak_fail_once",
    "soak_checkpoint",
    "spawn_worker_batch",
    "delegate_to_subagent",
    "ask_user_question",
  ].map(toolSchema),
  stream: true,
});

const agentLongRunBody = ({ lane = "A", rootToolCalls = 12 } = {}) => ({
  ...soakBody({ lane }),
  input: [
    {
      role: "user",
      content: buildAgentLongRunPrompt({ lane, rootToolCalls }),
    },
  ],
});

const childBody = ({
  scenario,
  lane = "A",
  target = "soak-explore-a",
  trailingInput = [],
} = {}) => ({
  model: "pupu-fake-responses-v1",
  input: [
    {
      role: "user",
      content: `SOAK_CHILD|scenario=${scenario}|lane=${lane}|target=${target}`,
    },
    ...trailingInput,
  ],
  tools: ["ask_user_question", "soak_gate", "soak_probe"].map(toolSchema),
  stream: true,
});

const parseSseEvents = (raw) =>
  raw
    .split("\n\n")
    .map((block) => block.split("\n").find((line) => line.startsWith("data: ")))
    .filter((line) => line && line !== "data: [DONE]")
    .map((line) => JSON.parse(line.slice("data: ".length)));

const finalText = (envelope) =>
  envelope.response.output[0]?.content?.[0]?.text || "";

describe("deterministic fake OpenAI Responses fixture", () => {
  it("returns byte-identical SSE and IDs for repeated identical bodies", () => {
    const request = soakBody({ lane: "B", phase: "probe", iteration: 17 });
    const first = buildResponseEnvelope(request);
    const second = buildResponseEnvelope(JSON.parse(JSON.stringify(request)));
    const firstSse = serializeSse(first.events);
    const secondSse = serializeSse(second.events);

    assert.equal(first.response.id, second.response.id);
    assert.equal(firstSse, secondSse);
    assert.equal(first.events.at(-1).type, "response.completed");
    assert.ok(firstSse.endsWith("data: [DONE]\n\n"));

    const parsed = parseSseEvents(firstSse);
    assert.deepEqual(
      parsed.map((event) => event.sequence_number),
      [0, 1, 2, 3, 4, 5, 6],
    );
  });

  it("maps every root phase to its strict canonical tool arguments", () => {
    const cases = [
      ["probe", "soak_probe", { lane: "A", iteration: 4, marker: MARKER }],
      ["steady", "soak_probe", { lane: "A", iteration: 4, marker: MARKER }],
      ["wait", "soak_wait", { lane: "A", milliseconds: 65000, marker: MARKER }],
      [
        "gate",
        "soak_gate",
        { lane: "A", checkpoint: "durable-pause", marker: MARKER },
      ],
      [
        "fail-once",
        "soak_fail_once",
        { lane: "A", key: "fixed-fail-once", marker: MARKER },
      ],
      [
        "checkpoint",
        "soak_checkpoint",
        {
          lane: "A",
          checkpoint: "steady-progress",
          iteration: 4,
          marker: MARKER,
        },
      ],
    ];

    for (const [phase, expectedName, expectedArguments] of cases) {
      const envelope = buildResponseEnvelope(
        soakBody({ lane: "A", phase, iteration: 4 }),
      );
      assert.equal(envelope.plan.kind, "tool", phase);
      assert.equal(envelope.plan.tool.name, expectedName, phase);
      assert.deepEqual(envelope.plan.tool.arguments, expectedArguments, phase);
      assert.equal(envelope.response.output[0].type, "function_call", phase);
      assert.deepEqual(
        JSON.parse(envelope.response.output[0].arguments),
        expectedArguments,
        phase,
      );
    }
  });

  it("emits fixed three-worker batches for happy and boundary scenarios", () => {
    const cases = [
      ["multiagent", "happy"],
      ["child-question", "question"],
      ["child-approval", "approval"],
      ["child-max", "max"],
    ];
    for (const [phase, scenario] of cases) {
      const envelope = buildResponseEnvelope(
        soakBody({ lane: "C", phase, iteration: 2 }),
      );

      assert.equal(envelope.plan.tool.name, "spawn_worker_batch", phase);
      assert.equal(
        envelope.plan.tool.arguments.aggregate_mode,
        "ordered_list",
        phase,
      );
      assert.deepEqual(
        envelope.plan.tool.arguments.tasks.map((task) => task.target),
        ["soak-explore-a", "soak-explore-b", "soak-explore-c"],
        phase,
      );
      assert.deepEqual(
        envelope.plan.tool.arguments.tasks.map((task) => task.task),
        ["a", "b", "c"].map(
          (suffix) =>
            `SOAK_CHILD|scenario=${scenario}|lane=C|target=soak-explore-${suffix}`,
        ),
        phase,
      );
    }
  });

  it("makes child clarification a structured ask without a root answer", () => {
    const request = childBody({
      scenario: "question",
      lane: "B",
      target: "soak-explore-b",
    });
    const envelope = buildResponseEnvelope(request);

    assert.equal(envelope.plan.label, "multiagent-child-question-tool");
    assert.equal(envelope.plan.tool.name, "ask_user_question");
    assert.deepEqual(envelope.plan.tool.arguments, {
      title: "Deterministic child clarification",
      question: "SOAK_CHILD|scenario=question|lane=B|target=soak-explore-b",
      selection_mode: "single",
      options: [
        { label: "Continue", value: "continue" },
        { label: "Stop", value: "stop" },
      ],
    });
  });

  it("requires the exact child approval fail-closed reason before converging", () => {
    const initial = childBody({
      scenario: "approval",
      lane: "C",
      target: "soak-explore-c",
    });
    const first = buildResponseEnvelope(initial);
    const call = first.response.output[0];
    assert.equal(first.plan.label, "multiagent-child-approval-tool");
    assert.equal(call.name, "soak_gate");

    const completed = buildResponseEnvelope({
      ...initial,
      input: [
        ...initial.input,
        call,
        {
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify({
            denied: true,
            tool: "soak_gate",
            reason: "subagent_tool_approval_unsupported",
          }),
        },
      ],
    });
    assert.equal(completed.plan.label, "multiagent-child-approval-final");
    assert.equal(
      completed.plan.childOutcome,
      "subagent_tool_approval_unsupported",
    );
    assert.equal(
      finalText(completed),
      "SOAK_CHILD_APPROVAL_OK lane=C target=soak-explore-c reason=subagent_tool_approval_unsupported",
    );

    const unsafe = buildResponseEnvelope({
      ...initial,
      input: [
        ...initial.input,
        call,
        {
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify({ denied: false }),
        },
      ],
    });
    assert.equal(unsafe.plan.childOutcome, "approval_not_fail_closed");
    assert.match(finalText(unsafe), /SOAK_CHILD_APPROVAL_FAILED/);
  });

  it("repeats only the fixed sentinel probe until the child iteration budget", () => {
    const initial = childBody({
      scenario: "max",
      lane: "A",
      target: "soak-explore-a",
    });
    const first = buildResponseEnvelope(initial);
    const call = first.response.output[0];
    const second = buildResponseEnvelope({
      ...initial,
      input: [
        ...initial.input,
        call,
        {
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify({ ok: true }),
        },
      ],
    });

    assert.equal(first.plan.label, "multiagent-child-max-tool");
    assert.equal(second.plan.label, "multiagent-child-max-tool");
    assert.deepEqual(first.plan.tool, second.plan.tool);
    assert.deepEqual(first.plan.tool, {
      name: "soak_probe",
      arguments: {
        lane: "A",
        iteration: 999991,
        marker: MARKER,
      },
    });
  });

  it("only lets the parent converge after all three exact child outcomes", () => {
    const cases = [
      [
        "multiagent",
        "completed:3",
        (target) => ({
          template_name: target,
          status: "completed",
          output: `SOAK_CHILD_OK lane=A target=${target}`,
        }),
      ],
      [
        "child-question",
        "needs_clarification:3",
        (target) => ({
          template_name: target,
          status: "needs_clarification",
          clarification_request: {
            question: `SOAK_CHILD|scenario=question|lane=A|target=${target}`,
          },
        }),
      ],
      [
        "child-approval",
        "subagent_tool_approval_unsupported:3",
        (target) => ({
          template_name: target,
          status: "completed",
          output: `SOAK_CHILD_APPROVAL_OK lane=A target=${target} reason=subagent_tool_approval_unsupported`,
        }),
      ],
      [
        "child-max",
        "max_iterations:3",
        (target) => ({ template_name: target, status: "max_iterations" }),
      ],
    ];

    for (const [phase, expectedOutcome, resultFactory] of cases) {
      const initial = soakBody({ lane: "A", phase, iteration: 0 });
      const first = buildResponseEnvelope(initial);
      const call = first.response.output[0];
      const results = ["a", "b", "c"].map((suffix) =>
        resultFactory(`soak-explore-${suffix}`),
      );
      const completed = buildResponseEnvelope({
        ...initial,
        input: [
          ...initial.input,
          call,
          {
            type: "function_call_output",
            call_id: call.call_id,
            output: JSON.stringify({ mode: "worker_batch", results }),
          },
        ],
      });

      assert.equal(completed.plan.childOutcome, expectedOutcome, phase);
      assert.match(
        finalText(completed),
        new RegExp(`child_outcome=${expectedOutcome}`),
        phase,
      );
    }
  });

  it("finishes after the matching tool result and preserves new-turn addressing", () => {
    const initial = soakBody({ lane: "A", phase: "wait", iteration: 3 });
    const first = buildResponseEnvelope(initial);
    const call = first.response.output[0];
    const resumed = {
      ...initial,
      input: [
        ...initial.input,
        call,
        {
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify({ ok: true }),
        },
        {
          role: "user",
          content: "<fyi_message>SOAK_FYI lane=A</fyi_message>",
        },
      ],
    };

    const completed = buildResponseEnvelope(resumed);
    assert.equal(completed.plan.kind, "text");
    assert.equal(finalText(completed), "SOAK_OK lane=A phase=wait iteration=3");

    const nextTurn = buildResponseEnvelope({
      ...resumed,
      input: [
        ...resumed.input,
        { role: "user", content: "SOAK|lane=A|phase=steady|iteration=4" },
      ],
    });
    assert.equal(nextTurn.plan.kind, "tool");
    assert.equal(nextTurn.plan.tool.name, "soak_probe");
    assert.equal(nextTurn.plan.tool.arguments.iteration, 4);
  });

  it("keeps one root response chain alive for many fixed tool iterations", () => {
    const initial = agentLongRunBody({ lane: "B", rootToolCalls: 12 });
    const input = [...initial.input];
    const observedTools = [];

    for (let step = 0; step < 12; step += 1) {
      const envelope = buildResponseEnvelope({ ...initial, input });
      const call = envelope.response.output[0];
      assert.equal(envelope.plan.label, "agent-long-root-tool");
      assert.equal(envelope.plan.scenario.iteration, step);
      assert.equal(call.type, "function_call");
      observedTools.push(call.name);
      input.push(call, {
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify({ ok: true, step }),
      });
      if (step === 0) {
        input.push({
          role: "user",
          content: "<fyi_message>AGENT_LONG_RUN_FYI lane=B</fyi_message>",
        });
      }
    }

    const completed = buildResponseEnvelope({ ...initial, input });
    assert.equal(completed.plan.label, "agent-long-root-final");
    assert.equal(completed.plan.scenario.iteration, 12);
    assert.equal(
      finalText(completed),
      "AGENT_LONG_RUN_OK lane=B root_tool_calls=12 saw_fyi=true",
    );
    assert.equal(observedTools.length, 12);
    assert.equal(observedTools[0], "soak_wait");
    assert.ok(observedTools.includes("soak_gate"));
    assert.ok(observedTools.includes("spawn_worker_batch"));
    assert.ok(observedTools.includes("delegate_to_subagent"));
  });

  it("does not count quoted root markers inside child-agent requests", () => {
    const envelope = buildResponseEnvelope({
      ...childBody({
        scenario: "happy",
        lane: "C",
        target: "soak-explore-c",
      }),
      input: [
        {
          role: "system",
          content: buildAgentLongRunPrompt({
            lane: "C",
            rootToolCalls: 24,
          }),
        },
        {
          role: "user",
          content:
            "SOAK_CHILD|scenario=happy|lane=C|target=soak-explore-c",
        },
      ],
    });
    assert.equal(envelope.plan.label, "multiagent-child");
    assert.equal(
      finalText(envelope),
      "SOAK_CHILD_OK lane=C target=soak-explore-c",
    );
  });

  it("keeps an in-run BTW ahead of the tool result out of the root continuation route", () => {
    const initial = soakBody({ lane: "C", phase: "wait", iteration: 5 });
    const first = buildResponseEnvelope(initial);
    const call = first.response.output[0];
    const continued = {
      ...initial,
      input: [
        ...initial.input,
        call,
        { role: "user", content: "<question>SOAK_BTW lane=C</question>" },
        {
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify({ ok: true }),
        },
      ],
    };

    const completed = buildResponseEnvelope(continued);
    assert.equal(completed.plan.label, "root-final");
    assert.equal(finalText(completed), "SOAK_OK lane=C phase=wait iteration=5");

    const queuedSuccessor = buildResponseEnvelope({
      ...continued,
      input: [
        ...continued.input,
        { role: "user", content: "SOAK_QUEUE lane=C" },
      ],
    });
    assert.equal(queuedSuccessor.plan.label, "queue");
    assert.equal(finalText(queuedSuccessor), "SOAK_QUEUE_OK lane=C");
  });

  it("does not let a historical queued successor shadow the next root gate", () => {
    const envelope = buildResponseEnvelope({
      model: "pupu-fake-responses-v1",
      input: [
        { role: "user", content: "SOAK|lane=A|phase=wait|iteration=0" },
        {
          type: "function_call_output",
          call_id: "call_wait_A_0",
          output: '{"ok":true}',
        },
        { role: "user", content: "SOAK_QUEUE lane=A" },
        { role: "assistant", content: "SOAK_QUEUE_OK lane=A" },
        { role: "user", content: "SOAK|lane=A|phase=gate|iteration=0" },
      ],
      stream: true,
    });

    assert.equal(envelope.plan.label, "root-tool");
    assert.equal(envelope.plan.tool.name, "soak_gate");
    assert.equal(envelope.plan.tool.arguments.lane, "A");
  });

  it("routes a side-assistant BTW even when its system context quotes the root task", () => {
    const envelope = buildResponseEnvelope({
      model: "pupu-fake-responses-v1",
      input: [
        {
          role: "system",
          content:
            "You are a side assistant. A main agent is working on SOAK|lane=A|phase=wait|iteration=0",
        },
        { role: "user", content: "SOAK_BTW lane=A" },
      ],
      stream: true,
    });

    assert.equal(envelope.plan.label, "btw");
    assert.equal(finalText(envelope), "SOAK_BTW_OK lane=A");
  });

  it("finishes remote-continuation tool results from the encoded response ID", () => {
    const first = buildResponseEnvelope(
      soakBody({ lane: "B", phase: "checkpoint", iteration: 9 }),
    );
    const call = first.response.output[0];
    const completed = buildResponseEnvelope({
      model: "pupu-fake-responses-v1",
      previous_response_id: first.response.id,
      input: [
        {
          type: "function_call_output",
          call_id: call.call_id,
          output: '{"ok":true}',
        },
      ],
      stream: true,
    });

    assert.equal(
      finalText(completed),
      "SOAK_OK lane=B phase=checkpoint iteration=9",
    );
  });

  it("routes BTW, queue, and subagent prompts directly to fixed final text", () => {
    const cases = [
      ["<question>SOAK_BTW lane=C</question>", "SOAK_BTW_OK lane=C"],
      ["SOAK_QUEUE lane=B", "SOAK_QUEUE_OK lane=B"],
      [
        "SOAK_CHILD target=soak-explore-a",
        "SOAK_CHILD_OK lane=A target=soak-explore-a",
      ],
    ];
    for (const [prompt, expected] of cases) {
      const envelope = buildResponseEnvelope({
        model: "pupu-fake-responses-v1",
        input: [{ role: "user", content: prompt }],
        stream: true,
      });
      assert.equal(envelope.plan.kind, "text");
      assert.equal(finalText(envelope), expected);
    }
  });

  it("serves streaming and non-streaming Responses requests and writes redacted audit", async (t) => {
    const tempDirectory = await mkdtemp(join(tmpdir(), "pupu-fake-llm-test-"));
    const auditPath = join(tempDirectory, "audit.jsonl");
    const fixture = createFakeOpenAIResponsesServer({ auditPath });
    t.after(async () => {
      await fixture.stop();
      await rm(tempDirectory, { recursive: true, force: true });
    });
    const { baseUrl } = await fixture.start();
    const request = soakBody({ lane: "C", phase: "gate", iteration: 5 });

    const first = await fetch(`${baseUrl}/responses`, {
      method: "POST",
      headers: {
        authorization: "Bearer must-not-appear-in-audit",
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
    });
    const second = await fetch(`${baseUrl}/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    assert.equal(
      first.headers.get("content-type"),
      "text/event-stream; charset=utf-8",
    );
    assert.equal(await first.text(), await second.text());

    const nonStreaming = await fetch(`${baseUrl}/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "pupu-fake-responses-v1",
        input: "ping",
      }),
    });
    const nonStreamingBody = await nonStreaming.json();
    assert.equal(nonStreamingBody.object, "response");
    assert.equal(nonStreamingBody.output[0].content[0].text, "SOAK_FIXTURE_OK");

    const audit = await readFile(auditPath, "utf8");
    const records = audit.trim().split("\n").map(JSON.parse);
    assert.equal(records.length, 3);
    assert.deepEqual(
      records.map((record) => record.ordinal),
      [1, 2, 3],
    );
    assert.equal(audit.includes("must-not-appear-in-audit"), false);
    assert.equal(records[0].lane, "C");
    assert.equal(records[0].saw_fyi, false);
    assert.equal(fixture.requests.length, 3);
  });

  it("exposes the CLI ready line and --audit contract", async (t) => {
    const tempDirectory = await mkdtemp(join(tmpdir(), "pupu-fake-llm-cli-"));
    const auditPath = join(tempDirectory, "audit.jsonl");
    const child = spawn(
      process.execPath,
      [fixturePath, "--host", "127.0.0.1", "--port", "0", "--audit", auditPath],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    t.after(async () => {
      if (child.exitCode == null) child.kill("SIGTERM");
      await rm(tempDirectory, { recursive: true, force: true });
    });

    const readyLine = await new Promise((resolve, reject) => {
      let stdout = "";
      const timeout = setTimeout(
        () => reject(new Error(`fixture ready timeout: ${stderr}`)),
        5000,
      );
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
        const newline = stdout.indexOf("\n");
        if (newline < 0) return;
        clearTimeout(timeout);
        resolve(stdout.slice(0, newline));
      });
      child.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once("exit", (code) => {
        clearTimeout(timeout);
        reject(new Error(`fixture exited early (${code}): ${stderr}`));
      });
    });
    const ready = JSON.parse(readyLine);
    assert.equal(ready.ready, true);
    assert.match(ready.base_url, /^http:\/\/127\.0\.0\.1:[0-9]+\/v1$/);

    const response = await fetch(`${ready.base_url}/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(soakBody()),
    });
    assert.equal(response.status, 200);
    await response.text();
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));

    const records = (await readFile(auditPath, "utf8"))
      .trim()
      .split("\n")
      .map(JSON.parse);
    assert.equal(records.length, 1);
    assert.equal(records[0].tool_name, "soak_probe");
    assert.equal(stderr, "");
  });
});

import { createRuntimeEventStore } from "./event_store";
import { reduceActivityTree } from "./activity_tree";

const event = ({
  id,
  type,
  runId = "run-root",
  agentId = "developer",
  turnId = "run-root:turn-1",
  links = {},
  payload = {},
  timestamp = "2026-04-25T12:00:00.000Z",
}) => ({
  schema_version: "v3",
  event_id: id,
  type,
  timestamp,
  session_id: "thread-1",
  run_id: runId,
  agent_id: agentId,
  turn_id: turnId,
  links,
  visibility: "user",
  payload,
  metadata: {},
});

const reduceEvents = (events) => {
  const store = createRuntimeEventStore();
  store.appendMany(events);
  return reduceActivityTree(null, store.getSnapshot());
};

describe("activity tree reducer", () => {
  test("updates root run status and usage from run lifecycle events", () => {
    const state = reduceEvents([
      event({ id: "evt-run", type: "run.started" }),
      event({
        id: "evt-done",
        type: "run.completed",
        payload: {
          status: "completed",
          usage: { consumed_tokens: 12, model: "openai:gpt-5" },
        },
      }),
    ]);

    expect(state.status).toBe("completed");
    expect(state.rootRunId).toBe("run-root");
    expect(state.runsById["run-root"].status).toBe("completed");
    expect(state.completionBundle).toEqual({
      consumed_tokens: 12,
      model: "openai:gpt-5",
    });
    expect(state.frames.map((frame) => frame.type)).toEqual([
      "run_started",
      "done",
    ]);
    expect(state.frames[1].payload.bundle).toEqual({
      consumed_tokens: 12,
      model: "openai:gpt-5",
    });
  });

  test("updates root failure state without crashing", () => {
    const state = reduceEvents([
      event({ id: "evt-run", type: "run.started" }),
      event({
        id: "evt-failed",
        type: "run.failed",
        payload: {
          error: { code: "boom", message: "Exploded" },
          recoverable: true,
        },
      }),
    ]);

    expect(state.status).toBe("failed");
    expect(state.error).toEqual({ code: "boom", message: "Exploded" });
    expect(state.frames[state.frames.length - 1]).toMatchObject({
      type: "error",
      payload: { code: "boom", message: "Exploded", recoverable: true },
    });
    expect(state.effects[state.effects.length - 1]).toMatchObject({
      type: "error",
      error: { code: "boom", message: "Exploded" },
    });
  });

  test("keeps child runs under links.parent_run_id and routes frames there", () => {
    const state = reduceEvents([
      event({ id: "evt-root", type: "run.started" }),
      event({
        id: "evt-child",
        type: "run.started",
        runId: "run-child",
        agentId: "developer.worker.1",
        turnId: null,
        links: { parent_run_id: "run-root" },
        payload: {
          agent_id: "developer.worker.1",
          parent_id: "developer",
          mode: "worker",
          template: "worker",
          batch_id: "batch-1",
          lineage: ["developer", "developer.worker.1"],
        },
      }),
    ]);

    expect(state.runsById["run-child"]).toMatchObject({
      runId: "run-child",
      parentRunId: "run-root",
      agentId: "developer.worker.1",
      mode: "worker",
      template: "worker",
      batchId: "batch-1",
      parentId: "developer",
      status: "running",
    });
    expect(state.frames.map((frame) => frame.type)).toEqual(["run_started"]);
    expect(state.framesByRunId["run-child"].map((frame) => frame.type)).toEqual([
      "subagent_started",
    ]);
  });

  test("preserves model.delta whitespace in model text and token effects", () => {
    const state = reduceEvents([
      event({ id: "evt-run", type: "run.started" }),
      event({
        id: "evt-delta",
        type: "model.delta",
        payload: { kind: "text", delta: "  indented\n" },
      }),
    ]);

    expect(state.modelTextByRunId["run-root"]).toBe("  indented\n");
    expect(state.frames[state.frames.length - 1]).toMatchObject({
      type: "token_delta",
      payload: { kind: "text", delta: "  indented\n" },
    });
    expect(state.effects[state.effects.length - 1]).toMatchObject({
      type: "token",
      eventId: "evt-delta",
      delta: "  indented\n",
      runId: "run-root",
    });
  });

  test("maps tool and input events to TraceChain-compatible frames", () => {
    const state = reduceEvents([
      event({ id: "evt-run", type: "run.started" }),
      event({
        id: "evt-tool-start",
        type: "tool.started",
        links: { tool_call_id: "call-1" },
        payload: {
          call_id: "call-1",
          tool_name: "read_file",
          arguments: { path: "/tmp/a.py" },
        },
      }),
      event({
        id: "evt-tool-done",
        type: "tool.completed",
        links: { tool_call_id: "call-1" },
        payload: {
          call_id: "call-1",
          tool_name: "read_file",
          status: "success",
          result: { content: "ok" },
        },
      }),
      event({
        id: "evt-input",
        type: "input.requested",
        links: { tool_call_id: "call-2", input_request_id: "confirm-2" },
        payload: {
          kind: "selection",
          question: "Pick one",
          interact_type: "single",
          options: [{ label: "A", value: "a" }],
        },
      }),
      event({
        id: "evt-input-done",
        type: "input.resolved",
        links: { tool_call_id: "call-2", input_request_id: "confirm-2" },
        payload: { decision: "approved", response: { value: "a" } },
      }),
    ]);

    expect(state.frames.map((frame) => frame.type)).toEqual([
      "run_started",
      "tool_call",
      "tool_result",
      "tool_call",
      "tool_confirmed",
    ]);
    expect(state.toolCallsById["call-1"]).toMatchObject({
      callId: "call-1",
      status: "success",
    });
    expect(state.inputRequestsById["confirm-2"]).toMatchObject({
      requestId: "confirm-2",
      callId: "call-2",
      status: "submitted",
      resolved: true,
      decision: "approved",
      response: { value: "a" },
    });
    expect(state.frames[3].payload).toMatchObject({
      call_id: "call-2",
      confirmation_id: "confirm-2",
      requires_confirmation: true,
      tool_name: "ask_user_question",
      interact_type: "single",
      interact_config: {
        question: "Pick one",
        options: [{ label: "A", value: "a" }],
      },
    });
  });
});

import { createRuntimeEventStore } from "./event_store";
import { reduceActivityTree } from "./activity_tree";
import { adaptActivityTreeToTraceChain } from "./trace_chain_adapter";

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

const adaptEvents = (events) => {
  const store = createRuntimeEventStore();
  store.appendMany(events);
  return adaptActivityTreeToTraceChain(
    reduceActivityTree(null, store.getSnapshot()),
  );
};

describe("runtime event TraceChain adapter", () => {
  test("exposes root frames, streaming status, and raw model text", () => {
    const traceProps = adaptEvents([
      event({ id: "evt-run", type: "run.started" }),
      event({
        id: "evt-delta",
        type: "model.delta",
        payload: { kind: "text", delta: "Hello  \nworld" },
      }),
    ]);

    expect(traceProps.status).toBe("streaming");
    expect(traceProps.streamingContent).toBe("Hello  \nworld");
    expect(traceProps.frames.map((frame) => frame.type)).toEqual([
      "run_started",
      "token_delta",
    ]);
  });

  test("maps child run state into subagent props", () => {
    const traceProps = adaptEvents([
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
      event({
        id: "evt-child-done",
        type: "run.completed",
        runId: "run-child",
        agentId: "developer.worker.1",
        turnId: null,
        links: { parent_run_id: "run-root" },
        payload: { status: "completed" },
      }),
    ]);

    expect(traceProps.subagentFrames["run-child"].map((frame) => frame.type)).toEqual([
      "subagent_started",
      "subagent_completed",
    ]);
    expect(traceProps.subagentMetaByRunId["run-child"]).toEqual({
      subagentId: "developer.worker.1",
      mode: "worker",
      template: "worker",
      batchId: "batch-1",
      parentId: "developer",
      lineage: ["developer", "developer.worker.1"],
      status: "completed",
    });
  });

  test("routes child run tool calls and results to the subagent branch", () => {
    const traceProps = adaptEvents([
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
        },
      }),
      event({
        id: "evt-child-tool-start",
        type: "tool.started",
        runId: "run-child",
        agentId: "developer.worker.1",
        turnId: "run-child:turn-1",
        links: {
          parent_run_id: "run-root",
          tool_call_id: "call-child-1",
        },
        payload: {
          call_id: "call-child-1",
          tool_name: "read_file",
          arguments: { path: "src/agent.py" },
        },
      }),
      event({
        id: "evt-child-tool-done",
        type: "tool.completed",
        runId: "run-child",
        agentId: "developer.worker.1",
        turnId: "run-child:turn-1",
        links: {
          parent_run_id: "run-root",
          tool_call_id: "call-child-1",
        },
        payload: {
          call_id: "call-child-1",
          tool_name: "read_file",
          status: "success",
          result: { content: "class Agent: pass" },
        },
      }),
      event({
        id: "evt-child-done",
        type: "run.completed",
        runId: "run-child",
        agentId: "developer.worker.1",
        turnId: null,
        links: { parent_run_id: "run-root" },
        payload: { status: "completed" },
      }),
      event({
        id: "evt-root-done",
        type: "run.completed",
        payload: { status: "completed" },
      }),
    ]);

    expect(traceProps.frames.map((frame) => frame.type)).toEqual([
      "run_started",
      "done",
    ]);
    expect(traceProps.subagentFrames["run-child"].map((frame) => frame.type)).toEqual([
      "subagent_started",
      "tool_call",
      "tool_result",
      "subagent_completed",
    ]);
    expect(traceProps.subagentFrames["run-child"][1]).toMatchObject({
      type: "tool_call",
      run_id: "run-child",
      payload: {
        call_id: "call-child-1",
        tool_name: "read_file",
        arguments: { path: "src/agent.py" },
      },
    });
    expect(traceProps.subagentFrames["run-child"][2]).toMatchObject({
      type: "tool_result",
      run_id: "run-child",
      payload: {
        call_id: "call-child-1",
        tool_name: "read_file",
        status: "success",
        result: { content: "class Agent: pass" },
      },
    });
  });

  test("routes child human input requests emitted with the root run to the active subagent branch", () => {
    const traceProps = adaptEvents([
      event({ id: "evt-root", type: "run.started" }),
      event({
        id: "evt-child",
        type: "run.started",
        runId: "run-child",
        agentId: "developer.explore.1",
        turnId: null,
        links: { parent_run_id: "run-root" },
        payload: {
          agent_id: "developer.explore.1",
          parent_id: "developer",
          mode: "delegate",
          template: "Explore",
        },
      }),
      event({
        id: "evt-child-ask",
        type: "tool.started",
        runId: "run-root",
        agentId: "developer",
        links: { tool_call_id: "ask-child-1" },
        payload: {
          call_id: "ask-child-1",
          confirmation_id: "confirm-child-1",
          requires_confirmation: true,
          tool_name: "ask_user_question",
          interact_type: "single",
          interact_config: {
            question: "Inspect Frontend or Backend?",
            options: [{ label: "Frontend", value: "frontend" }],
          },
        },
      }),
      event({
        id: "evt-child-ask-result",
        type: "tool.completed",
        runId: "run-child",
        agentId: "developer.explore.1",
        links: {
          parent_run_id: "run-root",
          tool_call_id: "ask-child-1",
        },
        payload: {
          call_id: "ask-child-1",
          tool_name: "ask_user_question",
          status: "success",
          result: { selected_values: ["frontend"] },
        },
      }),
    ]);

    expect(
      traceProps.frames.find(
        (frame) => frame?.payload?.call_id === "ask-child-1",
      ),
    ).toBeUndefined();
    expect(traceProps.subagentFrames["run-child"]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "tool_call",
          run_id: "run-child",
          payload: expect.objectContaining({
            tool_name: "ask_user_question",
            confirmation_id: "confirm-child-1",
          }),
        }),
        expect.objectContaining({
          type: "tool_result",
          run_id: "run-child",
          payload: expect.objectContaining({
            tool_name: "ask_user_question",
            call_id: "ask-child-1",
          }),
        }),
      ]),
    );
  });

  test("maps input request state into confirmation UI props", () => {
    const traceProps = adaptEvents([
      event({ id: "evt-run", type: "run.started" }),
      event({
        id: "evt-input",
        type: "input.requested",
        links: { tool_call_id: "call-2", input_request_id: "confirm-2" },
        payload: {
          kind: "selection",
          question: "Pick one",
          interact_type: "single",
        },
      }),
      event({
        id: "evt-input-done",
        type: "input.resolved",
        links: { tool_call_id: "call-2", input_request_id: "confirm-2" },
        payload: { decision: "denied", response: { value: "no" } },
      }),
    ]);

    expect(traceProps.toolConfirmationUiStateById["confirm-2"]).toEqual({
      status: "submitted",
      error: "",
      resolved: true,
      decision: "denied",
      userResponse: { value: "no" },
    });
    expect(traceProps.frames.map((frame) => frame.type)).toContain("tool_denied");
  });

  test("carries run.completed usage as a done bundle", () => {
    const traceProps = adaptEvents([
      event({ id: "evt-run", type: "run.started" }),
      event({
        id: "evt-done",
        type: "run.completed",
        payload: {
          status: "completed",
          usage: { consumed_tokens: 9, model: "openai:gpt-5" },
        },
      }),
    ]);

    expect(traceProps.status).toBe("done");
    expect(traceProps.bundle).toEqual({
      consumed_tokens: 9,
      model: "openai:gpt-5",
    });
    expect(traceProps.frames[traceProps.frames.length - 1]).toMatchObject({
      type: "done",
      payload: {
        bundle: { consumed_tokens: 9, model: "openai:gpt-5" },
      },
    });
  });

  test("maps run.failed to error status", () => {
    const traceProps = adaptEvents([
      event({
        id: "evt-failed",
        type: "run.failed",
        payload: { error: { code: "failed", message: "Nope" } },
      }),
    ]);

    expect(traceProps.status).toBe("error");
    expect(traceProps.error).toEqual({ code: "failed", message: "Nope" });
  });
});

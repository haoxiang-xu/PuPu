import {
  createInitialRuntimeEventTraceState,
  createRuntimeEventTraceAdapter,
  reduceRuntimeEventTraceState,
} from "./runtime_event_trace_adapter";

const event = ({
  id = "evt-1",
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

describe("runtime event trace adapter", () => {
  test("maps session/model delta events to legacy stream effects", () => {
    const adapter = createRuntimeEventTraceAdapter();

    const sessionEffects = adapter.ingest(
      event({
        type: "session.started",
        runId: "",
        turnId: null,
        payload: {
          thread_id: "thread-1",
          model: "openai:gpt-5",
          trace_level: "minimal",
        },
      }),
    );
    const runEffects = adapter.ingest(
      event({
        id: "evt-2",
        type: "run.started",
        payload: { provider: "openai", model: "gpt-5" },
      }),
    );
    const deltaEffects = adapter.ingest(
      event({
        id: "evt-3",
        type: "model.delta",
        payload: { kind: "text", delta: "hello" },
      }),
    );

    expect(sessionEffects[0]).toEqual({
      type: "meta",
      meta: { thread_id: "thread-1", model: "openai:gpt-5" },
    });
    expect(sessionEffects[1].frame).toMatchObject({
      seq: 1,
      type: "stream_started",
      payload: {
        thread_id: "thread-1",
        model: "openai:gpt-5",
        trace_level: "minimal",
      },
    });
    expect(runEffects[0].frame).toMatchObject({
      seq: 2,
      type: "run_started",
      run_id: "run-root",
      payload: { provider: "openai", model: "gpt-5", run_id: "run-root" },
    });
    expect(deltaEffects).toEqual([
      {
        type: "frame",
        frame: expect.objectContaining({
          seq: 3,
          type: "token_delta",
          run_id: "run-root",
          iteration: 1,
          payload: expect.objectContaining({ kind: "text", delta: "hello" }),
        }),
      },
      { type: "token", delta: "hello", runId: "run-root" },
    ]);
  });

  test("preserves exact token delta whitespace", () => {
    const adapter = createRuntimeEventTraceAdapter();
    const effects = adapter.ingest(
      event({
        id: "evt-space",
        type: "model.delta",
        payload: { kind: "text", delta: "  indented\n" },
      }),
    );

    expect(effects[0].frame.payload.delta).toBe("  indented\n");
    expect(effects[1]).toEqual({
      type: "token",
      delta: "  indented\n",
      runId: "run-root",
    });
  });

  test("maps tool and input events to TraceChain-compatible frames", () => {
    let state = createInitialRuntimeEventTraceState();
    let result = reduceRuntimeEventTraceState(
      state,
      event({ type: "run.started" }),
    );
    state = result.state;

    result = reduceRuntimeEventTraceState(
      state,
      event({
        id: "evt-tool-1",
        type: "tool.started",
        links: { tool_call_id: "call-1" },
        payload: {
          call_id: "call-1",
          tool_name: "read_file",
          arguments: { path: "/tmp/a.py" },
        },
      }),
    );
    state = result.state;
    expect(result.effects[0].frame).toMatchObject({
      seq: 2,
      type: "tool_call",
      payload: {
        call_id: "call-1",
        tool_name: "read_file",
        arguments: { path: "/tmp/a.py" },
      },
    });

    result = reduceRuntimeEventTraceState(
      state,
      event({
        id: "evt-input-1",
        type: "input.requested",
        links: { tool_call_id: "call-2", input_request_id: "confirm-2" },
        payload: {
          kind: "selection",
          question: "Pick one",
          interact_type: "single",
          options: [{ label: "A", value: "a" }],
        },
      }),
    );
    state = result.state;
    expect(result.effects[0].frame).toMatchObject({
      seq: 3,
      type: "tool_call",
      payload: {
        call_id: "call-2",
        confirmation_id: "confirm-2",
        requires_confirmation: true,
        tool_name: "ask_user_question",
        interact_type: "single",
        interact_config: {
          question: "Pick one",
          options: [{ label: "A", value: "a" }],
        },
      },
    });

    result = reduceRuntimeEventTraceState(
      state,
      event({
        id: "evt-input-2",
        type: "input.resolved",
        links: { tool_call_id: "call-2", input_request_id: "confirm-2" },
        payload: { decision: "approved", response: { value: "a" } },
      }),
    );
    expect(result.effects[0].frame).toMatchObject({
      seq: 4,
      type: "tool_confirmed",
      payload: {
        call_id: "call-2",
        confirmation_id: "confirm-2",
        user_response: { value: "a" },
      },
    });
  });

  test("maps child run events to existing subagent lifecycle frames", () => {
    const adapter = createRuntimeEventTraceAdapter();
    adapter.ingest(event({ type: "run.started" }));

    const effects = adapter.ingest(
      event({
        id: "evt-child-1",
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
    );

    expect(effects[0].frame).toMatchObject({
      seq: 2,
      type: "subagent_started",
      run_id: "run-child",
      payload: {
        root_run_id: "run-root",
        child_run_id: "run-child",
        subagent_id: "developer.worker.1",
        parent_id: "developer",
        mode: "worker",
        template: "worker",
        status: "running",
      },
    });
  });

  test("carries root run completion usage into transport done payload", () => {
    const adapter = createRuntimeEventTraceAdapter();
    adapter.ingest(event({ type: "run.started" }));

    const effects = adapter.ingest(
      event({
        id: "evt-done",
        type: "run.completed",
        payload: {
          status: "completed",
          usage: { consumed_tokens: 12, model: "openai:gpt-5" },
        },
      }),
    );

    expect(effects[0].frame).toMatchObject({
      type: "done",
      payload: {
        status: "completed",
        usage: { consumed_tokens: 12, model: "openai:gpt-5" },
        bundle: { consumed_tokens: 12, model: "openai:gpt-5" },
      },
    });
    expect(adapter.complete({ finished_at: 123 })).toEqual({
      finished_at: 123,
      bundle: { consumed_tokens: 12, model: "openai:gpt-5" },
    });
  });
});

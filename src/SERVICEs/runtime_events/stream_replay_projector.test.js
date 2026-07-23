import { createRuntimeEventStreamReplayProjector } from "./stream_replay_projector";

const event = ({ id, type, runId, seq, payload = {}, links = {} }) => ({
  schema_version: "v4",
  event_id: id,
  type,
  run_id: runId,
  seq,
  payload,
  links,
  surface: { slot: "trace_inline", scope: "turn", group: "" },
});

describe("runtime event stream replay projector", () => {
  test("rebuilds root text and terminal state from a replayed stream", () => {
    const projector = createRuntimeEventStreamReplayProjector();

    projector.append(
      event({ id: "start", type: "run.started", runId: "run-a", seq: 1 }),
      4,
    );
    projector.append(
      event({
        id: "delta",
        type: "step.delta",
        runId: "run-a",
        seq: 2,
        payload: { delta: "recovered text", step_type: "model_response" },
      }),
      5,
    );
    const projection = projector.append(
      event({ id: "done", type: "run.completed", runId: "run-a", seq: 3 }),
      6,
    );

    expect(projection).toMatchObject({
      status: "done",
      content: "recovered text",
      replayedThroughSeq: 6,
    });
  });

  test("keeps parallel replay projectors isolated", () => {
    const first = createRuntimeEventStreamReplayProjector();
    const second = createRuntimeEventStreamReplayProjector();
    first.append(
      event({ id: "a-start", type: "run.started", runId: "run-a", seq: 1 }),
      1,
    );
    second.append(
      event({ id: "b-start", type: "run.started", runId: "run-b", seq: 1 }),
      1,
    );
    const firstProjection = first.append(
      event({
        id: "a-delta",
        type: "step.delta",
        runId: "run-a",
        seq: 2,
        payload: { delta: "only A", step_type: "model_response" },
      }),
      2,
    );
    const secondProjection = second.append(
      event({
        id: "b-delta",
        type: "step.delta",
        runId: "run-b",
        seq: 2,
        payload: { delta: "only B", step_type: "model_response" },
      }),
      2,
    );

    expect(firstProjection.content).toBe("only A");
    expect(secondProjection.content).toBe("only B");
  });

  test("uses the final model turn after a tool instead of concatenating drafts", () => {
    const projector = createRuntimeEventStreamReplayProjector();
    const append = (id, type, seq, payload = {}, links = {}) =>
      projector.append(
        event({ id, type, runId: "run-tools", seq, payload, links }),
        seq,
      );

    append("run-start", "run.started", 1);
    append("draft", "step.delta", 2, {
      step_type: "model_response",
      kind: "text",
      delta: "draft A",
    });
    append(
      "tool-start",
      "step.started",
      3,
      { step_type: "tool", tool_name: "lookup", call_id: "call-1" },
      { tool_call_id: "call-1" },
    );
    append(
      "tool-done",
      "step.completed",
      4,
      {
        step_type: "tool",
        tool_name: "lookup",
        call_id: "call-1",
        status: "completed",
      },
      { tool_call_id: "call-1" },
    );
    append("answer", "step.delta", 5, {
      step_type: "model_response",
      kind: "text",
      delta: "answer B",
    });
    const projection = append("model-done", "step.completed", 6, {
      step_type: "model_response",
      final_text: "answer B",
    });

    expect(projection.content).toBe("answer B");
  });

  test("preserves failed status and projected interaction ui state", () => {
    const projector = createRuntimeEventStreamReplayProjector();
    projector.append(
      event({ id: "run-start", type: "run.started", runId: "run-fail", seq: 1 }),
      1,
    );
    const pending = projector.append(
      event({
        id: "interaction",
        type: "interaction.requested",
        runId: "run-fail",
        seq: 2,
        links: { tool_call_id: "call-1", interaction_id: "confirm-1" },
        payload: {
          interaction_id: "confirm-1",
          kind: "confirmation",
          renderer: "confirmation",
          prompt: "Approve",
          target: { tool_call_id: "call-1", tool_name: "write" },
        },
      }),
      2,
    );

    expect(pending.toolConfirmationUiStateById).toEqual({
      "confirm-1": {
        status: "idle",
        error: "",
        resolved: false,
      },
    });

    const failed = projector.append(
      event({
        id: "run-failed",
        type: "run.failed",
        runId: "run-fail",
        seq: 3,
        payload: { error: { code: "boom", message: "failed safely" } },
      }),
      3,
    );
    expect(failed).toMatchObject({
      status: "error",
      error: { code: "boom", message: "failed safely" },
    });
  });
});

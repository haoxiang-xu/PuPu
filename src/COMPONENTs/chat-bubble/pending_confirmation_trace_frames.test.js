import {
  buildPendingConfirmationTraceFrames,
  mergePendingConfirmationTraceFrames,
  mergePendingConfirmationTraceState,
} from "./pending_confirmation_trace_frames";

describe("buildPendingConfirmationTraceFrames", () => {
  test("preserves toolkit identity on a synthetic confirmation frame", () => {
    const frames = buildPendingConfirmationTraceFrames({
      "confirm-computer": {
        confirmationId: "confirm-computer",
        callId: "call-computer",
        toolkitId: "builtin.computer",
        toolName: "computer",
        arguments: { action: "left_click" },
        requestedAt: 100,
      },
    });

    expect(frames).toHaveLength(1);
    expect(frames[0].payload).toEqual(
      expect.objectContaining({
        toolkit_id: "builtin.computer",
        tool_name: "computer",
      }),
    );
  });

  test("enriches an existing bare tool call instead of duplicating it", () => {
    const frames = mergePendingConfirmationTraceFrames(
      [
        {
          seq: 7,
          type: "tool_call",
          payload: {
            call_id: "call-gate",
            tool_name: "soak_gate",
            arguments: { lane: "C" },
          },
        },
      ],
      {
        "confirm-gate": {
          confirmationId: "confirm-gate",
          callId: "call-gate",
          toolName: "soak_gate",
          arguments: { lane: "C" },
          interactType: "confirmation",
          interactConfig: {},
          requestedAt: 100,
        },
      },
    );

    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({
      seq: 7,
      type: "tool_call",
      payload: {
        call_id: "call-gate",
        confirmation_id: "confirm-gate",
        requires_confirmation: true,
        tool_name: "soak_gate",
        arguments: { lane: "C" },
        interact_type: "confirmation",
      },
    });
  });

  test("enriches the earliest bare duplicate that shadows replayed confirmation frames", () => {
    const frames = mergePendingConfirmationTraceFrames(
      [
        {
          seq: 5,
          type: "tool_call",
          payload: {
            call_id: "call-gate",
            tool_name: "soak_gate",
            arguments: { lane: "A" },
          },
        },
        {
          seq: 7,
          type: "tool_call",
          payload: {
            call_id: "call-gate",
            confirmation_id: "confirm-gate",
            requires_confirmation: true,
            tool_name: "soak_gate",
          },
        },
        {
          seq: 8,
          type: "tool_call",
          payload: {
            call_id: "call-gate",
            confirmation_id: "confirm-gate",
            requires_confirmation: true,
            tool_name: "soak_gate",
          },
        },
      ],
      {
        "confirm-gate": {
          confirmationId: "confirm-gate",
          callId: "call-gate",
          toolName: "soak_gate",
          arguments: { lane: "A" },
          interactType: "confirmation",
          interactConfig: {},
          requestedAt: 100,
        },
      },
    );

    expect(frames).toHaveLength(3);
    expect(frames[0]).toMatchObject({
      seq: 5,
      type: "tool_call",
      payload: {
        call_id: "call-gate",
        confirmation_id: "confirm-gate",
        requires_confirmation: true,
        tool_name: "soak_gate",
        arguments: { lane: "A" },
        interact_type: "confirmation",
      },
    });
  });

  test("appends an unmatched pending confirmation with a unique sequence", () => {
    const frames = mergePendingConfirmationTraceFrames(
      [
        {
          seq: 4,
          type: "reasoning",
          payload: { text: "working" },
        },
      ],
      {
        "confirm-new": {
          confirmationId: "confirm-new",
          callId: "call-new",
          toolName: "write_file",
          requestedAt: 100,
        },
      },
    );

    expect(frames).toHaveLength(2);
    expect(frames[1]).toMatchObject({
      seq: 5,
      type: "tool_call",
      payload: { confirmation_id: "confirm-new" },
    });
  });

  test("enriches a matching bare child frame without appending a root duplicate", () => {
    const state = mergePendingConfirmationTraceState({
      frames: [{ seq: 1, type: "reasoning", payload: { text: "working" } }],
      subagentFrames: {
        "child-run": [
          {
            seq: 1,
            type: "tool_call",
            payload: {
              call_id: "call-child",
              tool_name: "delete_file",
              arguments: { stale: true },
            },
          },
        ],
      },
      requests: {
        "confirm-child": {
          confirmationId: "confirm-child",
          callId: "call-child",
          toolName: "delete_file",
          arguments: { path: "child.txt" },
          interactType: "confirmation",
          interactConfig: { warning: "Delete child.txt?" },
          requestedAt: 100,
        },
      },
    });

    expect(state.frames).toHaveLength(1);
    expect(state.subagentFrames["child-run"]).toHaveLength(1);
    expect(state.subagentFrames["child-run"][0].payload).toEqual(
      expect.objectContaining({
        call_id: "call-child",
        confirmation_id: "confirm-child",
        arguments: { path: "child.txt" },
        interact_config: { warning: "Delete child.txt?" },
      }),
    );
  });

  test("does not move a child confirmation into an earlier root bare frame", () => {
    const state = mergePendingConfirmationTraceState({
      frames: [
        {
          seq: 5,
          type: "tool_call",
          payload: {
            call_id: "call-child",
            tool_name: "delete_file",
          },
        },
      ],
      subagentFrames: {
        "child-run": [
          {
            seq: 7,
            type: "tool_call",
            payload: {
              call_id: "call-child",
              confirmation_id: "confirm-child",
              requires_confirmation: true,
              tool_name: "delete_file",
            },
          },
        ],
      },
      requests: {
        "confirm-child": {
          confirmationId: "confirm-child",
          callId: "call-child",
          toolName: "delete_file",
          arguments: { path: "child.txt" },
          requestedAt: 100,
        },
      },
    });

    expect(state.frames[0].payload.confirmation_id).toBeUndefined();
    expect(state.subagentFrames["child-run"][0].payload).toMatchObject({
      call_id: "call-child",
      confirmation_id: "confirm-child",
      arguments: { path: "child.txt" },
    });
  });

  test("keeps a different confirmation on the same call and appends the pending identity", () => {
    const state = mergePendingConfirmationTraceState({
      frames: [
        {
          seq: 8,
          type: "tool_call",
          payload: {
            call_id: "reused-call",
            confirmation_id: "confirm-old",
            requires_confirmation: true,
            tool_name: "delete_file",
          },
        },
      ],
      requests: {
        "confirm-new": {
          confirmationId: "confirm-new",
          callId: "reused-call",
          toolName: "delete_file",
          requestedAt: 100,
        },
      },
    });

    expect(state.frames).toHaveLength(2);
    expect(state.frames[0].payload.confirmation_id).toBe("confirm-old");
    expect(state.frames[1]).toMatchObject({
      seq: 9,
      payload: {
        call_id: "reused-call",
        confirmation_id: "confirm-new",
      },
    });
  });

  test("does not duplicate an already enriched child confirmation", () => {
    const childFrame = {
      seq: 2,
      type: "tool_call",
      payload: {
        call_id: "call-child",
        confirmation_id: "confirm-child",
        requires_confirmation: true,
        tool_name: "ask_user_question",
      },
    };
    const state = mergePendingConfirmationTraceState({
      frames: [],
      subagentFrames: { "child-run": [childFrame] },
      requests: {
        "confirm-child": {
          confirmationId: "confirm-child",
          callId: "call-child",
          toolName: "ask_user_question",
          interactType: "single",
          interactConfig: {
            question: "Choose one",
            options: [{ label: "One", value: "one" }],
          },
          requestedAt: 100,
        },
      },
    });

    expect(state.frames).toHaveLength(0);
    expect(state.subagentFrames["child-run"]).toHaveLength(1);
    expect(state.subagentFrames["child-run"][0].payload).toMatchObject({
      confirmation_id: "confirm-child",
      interact_type: "single",
      interact_config: { question: "Choose one" },
    });
  });
});

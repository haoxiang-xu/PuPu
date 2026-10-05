import { settleStreamingAssistantMessages } from "./chat_turn_utils";

describe("settleStreamingAssistantMessages", () => {
  test("keeps partial streaming chunks when cancelling an in-flight assistant message", () => {
    jest.spyOn(Date, "now").mockReturnValue(1234);

    const { changed, nextMessages } = settleStreamingAssistantMessages([
      {
        id: "assistant-1",
        role: "assistant",
        status: "streaming",
        content: "",
        streamingChunks: ["partial", " response"],
      },
    ]);

    expect(changed).toBe(true);
    expect(nextMessages).toEqual([
      {
        id: "assistant-1",
        role: "assistant",
        status: "cancelled",
        content: "partial response",
        updatedAt: 1234,
      },
    ]);

    Date.now.mockRestore();
  });

  test("#66: falls back to the latest trace final_message when no streaming chunks remain", () => {
    jest.spyOn(Date, "now").mockReturnValue(1234);

    const { changed, nextMessages } = settleStreamingAssistantMessages([
      {
        id: "assistant-1",
        role: "assistant",
        status: "streaming",
        content: "",
        streamingChunks: [],
        traceFrames: [
          { type: "final_message", payload: { content: "draft", finality: "draft" } },
          { type: "tool_call", payload: { tool_name: "search" } },
          {
            type: "final_message",
            payload: { content: "recovered answer", finality: "terminal" },
          },
        ],
      },
    ]);

    expect(changed).toBe(true);
    expect(nextMessages).toHaveLength(1);
    expect(nextMessages[0].content).toBe("recovered answer");
    expect(nextMessages[0].status).toBe("cancelled");

    Date.now.mockRestore();
  });

  test("#384: retains completed and in-flight tool history without fabricating a body", () => {
    jest.spyOn(Date, "now").mockReturnValue(1234);

    const { nextMessages } = settleStreamingAssistantMessages([
      {
        id: "assistant-1",
        role: "assistant",
        status: "streaming",
        content: "",
        streamingChunks: [],
        traceFrames: [
          { type: "tool_call", payload: { tool_name: "search" } },
          { type: "tool_result", payload: { result: { ok: true } } },
        ],
      },
    ]);

    expect(nextMessages).toHaveLength(1);
    expect(nextMessages[0]).toEqual({
      id: "assistant-1",
      role: "assistant",
      status: "cancelled",
      content: "",
      traceFrames: [
        { type: "tool_call", payload: { tool_name: "search" } },
        { type: "tool_result", payload: { result: { ok: true } } },
      ],
      updatedAt: 1234,
    });

    Date.now.mockRestore();
  });

  test("#384: keeps nested execution history when it is the only meaningful content", () => {
    jest.spyOn(Date, "now").mockReturnValue(1234);
    const subagentFrames = {
      "worker-run-1": [
        { type: "tool_call", payload: { call_id: "nested-call", tool_name: "search" } },
      ],
    };

    const { nextMessages } = settleStreamingAssistantMessages([{
      id: "assistant-1",
      role: "assistant",
      status: "streaming",
      content: "",
      subagentFrames,
    }]);

    expect(nextMessages).toHaveLength(1);
    expect(nextMessages[0].status).toBe("cancelled");
    expect(nextMessages[0].content).toBe("");
    expect(nextMessages[0].subagentFrames).toEqual(subagentFrames);
    Date.now.mockRestore();
  });

  test.each([
    ["metadata only", { subagentMetaByRunId: { "worker-run-1": { status: "running" } } }],
    ["empty frames", { traceFrames: [], subagentFrames: {} }],
    ["empty payload", { traceFrames: [{ type: "tool_call", payload: {} }] }],
    ["malformed frames", { traceFrames: [null, {}, { type: "tool_call", payload: { status: "running" } }] }],
    ["malformed nested frames", { subagentFrames: { "worker-run-1": [{ type: "tool_call", payload: [] }] } }],
    ["infrastructure frames", { traceFrames: [{ type: "stream_started", payload: { model_name: "model-x" } }] }],
    ["unknown frame types", { traceFrames: [{ type: "runtime_internal_state", payload: { message: "not rendered" } }] }],
    ["nested infrastructure frames", { subagentFrames: { "worker-run-1": [{ type: "stream_started", payload: { model_name: "model-x" } }] } }],
    ["nested unknown frame types", { subagentFrames: { "worker-run-1": [{ type: "runtime_internal_state", payload: { message: "not rendered" } }] } }],
  ])("#384: drops an empty streaming placeholder with %s", (_label, extra) => {
    const { nextMessages } = settleStreamingAssistantMessages([{
      id: "assistant-empty",
      role: "assistant",
      status: "streaming",
      content: "",
      ...extra,
    }]);
    expect(nextMessages).toHaveLength(0);
  });

  const capturedSequentialFrames = require("../../../../docs/implementation/ticket-383-evidence/observed-sequential.legacy-frames.json");
  const capturedUnownedResult = capturedSequentialFrames.find(
    (frame) => frame.type === "tool_result",
  );

  test.each(["root", "nested"])(
    "#384: retains the captured unowned tool result identically in %s history without inventing a body or call",
    (scope) => {
      const originalFrameBytes = JSON.stringify(capturedUnownedResult);
      const retainedFrames = [capturedUnownedResult];
      const history = scope === "root"
        ? { traceFrames: retainedFrames }
        : { subagentFrames: { "orphan-worker-run": retainedFrames } };
      const assistant = {
        id: `orphan-result-${scope}`,
        role: "assistant",
        status: "streaming",
        content: "",
        ...history,
      };

      const { changed, nextMessages } = settleStreamingAssistantMessages([assistant]);

      expect(changed).toBe(true);
      expect(nextMessages).toHaveLength(1);
      const retained = nextMessages[0];
      expect(retained.id).toBe(assistant.id);
      expect(retained.status).toBe("cancelled");
      expect(retained.content).toBe("");
      expect(Object.keys(retained).sort()).toEqual(
        [...Object.keys(assistant), "updatedAt"].sort(),
      );
      const actualFrames = scope === "root"
        ? retained.traceFrames
        : retained.subagentFrames["orphan-worker-run"];
      expect(actualFrames).toBe(retainedFrames);
      expect(actualFrames).toHaveLength(1);
      expect(actualFrames[0]).toBe(capturedUnownedResult);
      expect(actualFrames[0].type).toBe("tool_result");
      expect(JSON.stringify(actualFrames[0])).toBe(originalFrameBytes);
      expect(actualFrames.some((frame) => frame.type === "tool_call")).toBe(false);
    },
  );

  test.each([
    ["false scalar result", { result: false }],
    ["zero scalar result", { result: 0 }],
    ["fallback error content", { status: "error", error: "Observed unowned error" }],
  ])(
    "#384: retains meaningful unowned tool output with %s",
    (_label, payload) => {
      const observedFrame = {
        seq: 1,
        ts: 1234,
        type: "tool_result",
        payload,
      };
      const originalFrameBytes = JSON.stringify(observedFrame);
      const { nextMessages } = settleStreamingAssistantMessages([{
        id: "orphan-output-value",
        role: "assistant",
        status: "streaming",
        content: "",
        traceFrames: [observedFrame],
      }]);

      expect(nextMessages).toHaveLength(1);
      expect(nextMessages[0].content).toBe("");
      expect(nextMessages[0].status).toBe("cancelled");
      expect(nextMessages[0].traceFrames).toHaveLength(1);
      expect(nextMessages[0].traceFrames[0]).toBe(observedFrame);
      expect(JSON.stringify(nextMessages[0].traceFrames[0])).toBe(originalFrameBytes);
    },
  );

  test.each([
    ["empty result", { result: {} }],
    ["empty payload", {}],
    ["common metadata only", { status: "completed", run_id: "run", seq: 7, ts: 1234, timestamp: 1234 }],
    ["null result with identity", {
      result: null,
      call_id: "null-result-call",
      tool_name: "read_file",
    }],
    // These identity labels are observed alongside the captured result above;
    // without a result/output they must not turn an empty placeholder into history.
    ["tool identity metadata only", {
      call_id: "orphan-identity-only",
      tool_name: "read_file",
      toolkit_id: "fixture.in_memory",
      toolkit_name: "Fixture in-memory tools",
      tool_display_name: "Read file",
      call_ref: {
        schema: "pupu.tool_call_ref.v1",
        execution_id: "execution-one",
        original_attempt_id: "attempt-one",
        call_id: "orphan-identity-only",
        tool_name: "read_file",
      },
      call_ref_metadata: { schema: "pupu.tool_call_ref_metadata.v1" },
      timeline_merge_policy: "approved",
      status: "completed",
    }],
  ])(
    "#384: still drops an orphan tool-result placeholder with %s",
    (_label, payload) => {
      const { nextMessages } = settleStreamingAssistantMessages([{
        id: "orphan-result-placeholder",
        role: "assistant",
        status: "streaming",
        content: "",
        traceFrames: [{ type: "tool_result", payload }],
      }]);
      expect(nextMessages).toHaveLength(0);
    },
  );
});

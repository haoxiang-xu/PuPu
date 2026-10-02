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
});

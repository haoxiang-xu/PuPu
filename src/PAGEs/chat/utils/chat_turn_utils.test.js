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

  test("#66: never fabricates a body from tool frames and never promotes cancel to terminal", () => {
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

    // Only tool activity, no recoverable assistant text → message is not settled
    // with fabricated tool output as its body.
    expect(nextMessages).toHaveLength(0);

    Date.now.mockRestore();
  });
});

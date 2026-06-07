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
});

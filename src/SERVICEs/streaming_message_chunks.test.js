import {
  STREAMING_MESSAGE_CHUNK_SIZE,
  appendStreamingMessageDelta,
  clearStreamingMessageText,
  finalizeStreamingMessage,
  getStreamingMessageText,
  splitTextIntoStreamingChunks,
} from "./streaming_message_chunks";

describe("streaming message chunks", () => {
  test("splits text into modest chunks", () => {
    const chunks = splitTextIntoStreamingChunks(
      "a".repeat(STREAMING_MESSAGE_CHUNK_SIZE + 7),
    );

    expect(STREAMING_MESSAGE_CHUNK_SIZE).toBeLessThan(4096);
    expect(chunks).toEqual([
      "a".repeat(STREAMING_MESSAGE_CHUNK_SIZE),
      "a".repeat(7),
    ]);
  });

  test("appends deltas without growing message.content during streaming", () => {
    const message = {
      id: "assistant-1",
      role: "assistant",
      status: "streaming",
      content: "",
    };

    const first = appendStreamingMessageDelta(message, "a".repeat(1000), {
      updatedAt: 1,
    });
    const second = appendStreamingMessageDelta(first, "b".repeat(50), {
      updatedAt: 2,
    });

    expect(first.content).toBe("");
    expect(second.content).toBe("");
    expect(second.updatedAt).toBe(2);
    expect(second.streamingChunks).toEqual([
      `${"a".repeat(1000)}${"b".repeat(24)}`,
      "b".repeat(26),
    ]);
    expect(getStreamingMessageText(second)).toBe(
      `${"a".repeat(1000)}${"b".repeat(50)}`,
    );
  });

  test("finalizes chunks back to normal persisted message content", () => {
    const finalized = finalizeStreamingMessage(
      {
        id: "assistant-1",
        role: "assistant",
        status: "streaming",
        content: "",
        streamingChunks: ["Hello", ", world"],
      },
      { status: "done", updatedAt: 3 },
    );

    expect(finalized).toEqual({
      id: "assistant-1",
      role: "assistant",
      status: "done",
      content: "Hello, world",
      updatedAt: 3,
    });
  });

  test("clears transient chunks when streaming output is handed to a trace frame", () => {
    const cleared = clearStreamingMessageText({
      id: "assistant-1",
      role: "assistant",
      status: "streaming",
      content: "",
      streamingChunks: ["partial"],
    });

    expect(cleared).toEqual({
      id: "assistant-1",
      role: "assistant",
      status: "streaming",
      content: "",
    });
  });
});

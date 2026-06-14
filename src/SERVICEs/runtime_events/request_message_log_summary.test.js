import { summarizeRequestMessagesForLog } from "./request_message_log_summary";

describe("summarizeRequestMessagesForLog", () => {
  test("summarizes large request transcripts without retaining full content", () => {
    const rawMessages = [
      { role: "user", content: "first message" },
      ...Array.from({ length: 8 }, (_, index) => ({
        role: "assistant",
        type: "message",
        content: `middle ${index} ${"x".repeat(500)}`,
      })),
      {
        role: "assistant",
        type: "function_call",
        name: "read",
        call_id: "call-last",
        content: "final " + "y".repeat(500),
      },
    ];

    const summary = summarizeRequestMessagesForLog(
      rawMessages,
      "system prompt " + "z".repeat(300),
    );

    expect(summary.messageCount).toBe(10);
    expect(summary.omittedMessageCount).toBe(2);
    expect(summary.systemPromptChars).toBe(314);
    expect(summary.totalContentChars).toBeGreaterThan(4000);
    expect(summary.previewMessages).toHaveLength(8);
    expect(summary.previewMessages[0]).toMatchObject({
      index: 0,
      role: "user",
      contentPreview: "first message",
    });
    expect(summary.previewMessages[1].index).toBe(3);
    expect(summary.previewMessages[7]).toMatchObject({
      index: 9,
      name: "read",
      callId: "call-last",
    });
    expect(summary.previewMessages[7].contentPreview).toHaveLength(240);
    expect(JSON.stringify(summary)).not.toContain("y".repeat(300));
  });
});

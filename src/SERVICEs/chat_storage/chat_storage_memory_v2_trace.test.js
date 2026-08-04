import { sanitizeMessage } from "./chat_storage_sanitize";

describe("chat storage Memory V2 trace reload", () => {
  test("preserves the bounded audit bundle and drops hidden or unknown fields", () => {
    const cleaned = sanitizeMessage({
      id: "assistant-memory",
      role: "assistant",
      content: "done",
      status: "done",
      meta: {
        bundle: {
          consumed_tokens: 10,
          memory_v2: {
            mode: "active",
            available_input_tokens: 64000,
            checkpoint_ref: "pupu://context/checkpoint/checkpoint-1",
            memory_agent_run: {
              status: "completed",
              model: "memory-model",
              reasoning: "hidden",
              credential: "sensitive",
            },
            arbitrary_provider_payload: { unsafe: true },
          },
        },
      },
    });

    expect(cleaned.meta.bundle.memory_v2).toMatchObject({
      mode: "active",
      available_input_tokens: 64000,
      checkpoint_ref: "pupu://context/checkpoint/checkpoint-1",
      memory_agent_run: {
        status: "completed",
        model: "memory-model",
      },
    });
    const serialized = JSON.stringify(cleaned.meta.bundle.memory_v2);
    expect(serialized).not.toContain("hidden");
    expect(serialized).not.toContain("sensitive");
    expect(serialized).not.toContain("arbitrary_provider_payload");
  });
});

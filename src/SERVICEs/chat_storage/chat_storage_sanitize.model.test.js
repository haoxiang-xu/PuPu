import { sanitizeModel } from "./chat_storage_sanitize";

describe("sanitizeModel context window (#227)", () => {
  test("keeps a positive integer window alongside the other model fields", () => {
    const cleaned = sanitizeModel({
      id: "ollama:deepseek-r1:14b",
      reasoningEffort: "high",
      contextWindow: 65536,
    });
    expect(cleaned).toEqual({
      id: "ollama:deepseek-r1:14b",
      reasoningEffort: "high",
      contextWindow: 65536,
    });
  });

  test("drops windows that are not positive integers", () => {
    expect(sanitizeModel({ id: "m", contextWindow: 0 })).toEqual({ id: "m" });
    expect(sanitizeModel({ id: "m", contextWindow: -4096 })).toEqual({ id: "m" });
    expect(sanitizeModel({ id: "m", contextWindow: "65536" })).toEqual({ id: "m" });
    expect(sanitizeModel({ id: "m", contextWindow: 4096.5 })).toEqual({ id: "m" });
    expect(sanitizeModel({ id: "m", contextWindow: Number.NaN })).toEqual({ id: "m" });
    expect(sanitizeModel({ id: "m", contextWindow: true })).toEqual({ id: "m" });
  });

  test("a model record without a window stays byte-for-byte what it was", () => {
    expect(sanitizeModel({ id: "m", maxTokens: 256 })).toEqual({ id: "m", maxTokens: 256 });
  });
});

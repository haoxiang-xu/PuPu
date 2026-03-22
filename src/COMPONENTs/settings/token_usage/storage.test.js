import {
  appendTokenUsageRecord,
  clearTokenUsageRecords,
  readTokenUsageRecords,
} from "./storage";

describe("token usage storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("reads legacy consumed-only records with zeroed input/output breakdown", () => {
    window.localStorage.setItem(
      "token_usage",
      JSON.stringify({
        records: [
          {
            timestamp: 1,
            provider: "openai",
            model: "gpt-5",
            model_id: "openai:gpt-5",
            consumed_tokens: 123,
          },
        ],
      }),
    );

    expect(readTokenUsageRecords()).toEqual([
      {
        timestamp: 1,
        provider: "openai",
        model: "gpt-5",
        model_id: "openai:gpt-5",
        consumed_tokens: 123,
        input_tokens: 0,
        output_tokens: 0,
      },
    ]);
  });

  test("stores records with explicit consumed/input/output token usage", () => {
    appendTokenUsageRecord({
      timestamp: 2,
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      model_id: "anthropic:claude-sonnet-4-6",
      consumed_tokens: 42,
      input_tokens: 30,
      output_tokens: 12,
      chatId: "chat-1",
    });

    expect(readTokenUsageRecords()).toEqual([
      {
        timestamp: 2,
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        model_id: "anthropic:claude-sonnet-4-6",
        consumed_tokens: 42,
        input_tokens: 30,
        output_tokens: 12,
        chatId: "chat-1",
      },
    ]);
  });

  test("derives consumed tokens from input and output when consumed is absent", () => {
    appendTokenUsageRecord({
      timestamp: 3,
      provider: "openai",
      model: "gpt-5",
      model_id: "openai:gpt-5",
      input_tokens: 80,
      output_tokens: 43,
    });

    expect(readTokenUsageRecords()).toEqual([
      {
        timestamp: 3,
        provider: "openai",
        model: "gpt-5",
        model_id: "openai:gpt-5",
        consumed_tokens: 123,
        input_tokens: 80,
        output_tokens: 43,
      },
    ]);
  });

  test("ignores invalid records with no usable token values", () => {
    appendTokenUsageRecord({
      timestamp: 4,
      provider: "openai",
      model: "gpt-5",
      model_id: "openai:gpt-5",
      consumed_tokens: 0,
      input_tokens: 0,
      output_tokens: 0,
    });

    expect(readTokenUsageRecords()).toEqual([]);

    clearTokenUsageRecords();
    expect(readTokenUsageRecords()).toEqual([]);
  });
});

import { api } from "./api";

const writeSettings = (settings) => {
  window.localStorage.setItem("settings", JSON.stringify(settings || {}));
};

describe("api.miso.startStreamV2 memory/provider options", () => {
  const originalMisoApi = window.misoAPI;

  beforeEach(() => {
    window.localStorage.clear();
    window.misoAPI = {
      startStreamV2: jest.fn(() => ({ cancel: jest.fn() })),
    };
  });

  afterEach(() => {
    window.localStorage.clear();
    jest.clearAllMocks();
  });

  afterAll(() => {
    window.misoAPI = originalMisoApi;
  });

  test("injects anthropic provider key without generic apiKey fields", () => {
    writeSettings({
      model_providers: {
        anthropic_api_key: "anthropic-key-123",
      },
    });

    api.miso.startStreamV2({
      message: "hello",
      options: {
        modelId: "anthropic:claude-sonnet-4-6",
      },
    });

    const [payload] = window.misoAPI.startStreamV2.mock.calls[0];
    expect(payload.options.anthropicApiKey).toBe("anthropic-key-123");
    expect(payload.options.anthropic_api_key).toBe("anthropic-key-123");
    expect(payload.options.apiKey).toBeUndefined();
    expect(payload.options.api_key).toBeUndefined();
  });

  test("respects explicit memory_enabled=false even when memory setting is enabled", () => {
    writeSettings({
      memory: {
        enabled: true,
        embedding_provider: "openai",
        openai_embedding_model: "text-embedding-3-small",
        last_n_turns: 8,
        vector_top_k: 4,
      },
      model_providers: {
        openai_api_key: "openai-key-123",
      },
    });

    api.miso.startStreamV2({
      message: "hello",
      options: {
        modelId: "openai:gpt-5",
        memory_enabled: false,
      },
    });

    const [payload] = window.misoAPI.startStreamV2.mock.calls[0];
    expect(payload.options.memory_enabled).toBe(false);
    expect(payload.options.memory_embedding_provider).toBeUndefined();
    expect(payload.options.memory_embedding_model).toBeUndefined();
  });
});

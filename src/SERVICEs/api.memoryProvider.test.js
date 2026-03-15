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
      replaceSessionMemory: jest.fn(async () => ({ applied: true })),
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
        long_term_enabled: true,
        long_term_extract_every_n_turns: 6,
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

  test("injects openai embedding key for memory when chat model provider is anthropic", () => {
    writeSettings({
      memory: {
        enabled: true,
        long_term_enabled: true,
        long_term_extract_every_n_turns: 6,
        embedding_provider: "auto",
        openai_embedding_model: "text-embedding-3-small",
        last_n_turns: 8,
        vector_top_k: 4,
      },
      model_providers: {
        openai_api_key: "openai-key-123",
        anthropic_api_key: "anthropic-key-456",
      },
    });

    api.miso.startStreamV2({
      message: "hello",
      options: {
        modelId: "anthropic:claude-sonnet-4-6",
      },
    });

    const [payload] = window.misoAPI.startStreamV2.mock.calls[0];
    expect(payload.options.memory_enabled).toBe(true);
    expect(payload.options.memory_namespace).toBe("pupu:default");
    expect(payload.options.memory_long_term_enabled).toBe(true);
    expect(payload.options.memory_long_term_extract_every_n_turns).toBe(6);
    expect(payload.options.memory_embedding_provider).toBe("auto");
    expect(payload.options.openaiApiKey).toBe("openai-key-123");
    expect(payload.options.openai_api_key).toBe("openai-key-123");
    expect(payload.options.anthropicApiKey).toBe("anthropic-key-456");
    expect(payload.options.anthropic_api_key).toBe("anthropic-key-456");
  });

  test("does not inject openai embedding key when memory provider is ollama", () => {
    writeSettings({
      memory: {
        enabled: true,
        long_term_enabled: true,
        long_term_extract_every_n_turns: 9,
        embedding_provider: "ollama",
        ollama_embedding_model: "nomic-embed-text",
        last_n_turns: 8,
        vector_top_k: 4,
      },
      model_providers: {
        openai_api_key: "openai-key-123",
        anthropic_api_key: "anthropic-key-456",
      },
    });

    api.miso.startStreamV2({
      message: "hello",
      options: {
        modelId: "anthropic:claude-sonnet-4-6",
      },
    });

    const [payload] = window.misoAPI.startStreamV2.mock.calls[0];
    expect(payload.options.memory_namespace).toBe("pupu:default");
    expect(payload.options.memory_long_term_enabled).toBe(true);
    expect(payload.options.memory_long_term_extract_every_n_turns).toBe(9);
    expect(payload.options.memory_embedding_provider).toBe("ollama");
    expect(payload.options.openaiApiKey).toBeUndefined();
    expect(payload.options.openai_api_key).toBeUndefined();
    expect(payload.options.anthropicApiKey).toBe("anthropic-key-456");
  });

  test("injects long-term memory defaults when memory is explicitly enabled in options", () => {
    writeSettings({
      memory: {
        enabled: true,
        long_term_enabled: true,
        long_term_extract_every_n_turns: 7,
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
        memory_enabled: true,
      },
    });

    const [payload] = window.misoAPI.startStreamV2.mock.calls[0];
    expect(payload.options.memory_enabled).toBe(true);
    expect(payload.options.memory_namespace).toBe("pupu:default");
    expect(payload.options.memory_long_term_enabled).toBe(true);
    expect(payload.options.memory_long_term_extract_every_n_turns).toBe(7);
  });

  test("replaceSessionMemory reuses memory/provider injection path", async () => {
    writeSettings({
      memory: {
        enabled: true,
        long_term_enabled: true,
        long_term_extract_every_n_turns: 6,
        embedding_provider: "auto",
        openai_embedding_model: "text-embedding-3-small",
        last_n_turns: 8,
        vector_top_k: 4,
      },
      model_providers: {
        openai_api_key: "openai-key-123",
        anthropic_api_key: "anthropic-key-456",
      },
    });

    await api.miso.replaceSessionMemory({
      sessionId: "chat-1",
      messages: [{ role: "user", content: "hello" }],
      options: {
        modelId: "anthropic:claude-sonnet-4-6",
      },
    });

    const [payload] = window.misoAPI.replaceSessionMemory.mock.calls[0];
    expect(payload.session_id).toBe("chat-1");
    expect(payload.options.memory_enabled).toBe(true);
    expect(payload.options.memory_embedding_provider).toBe("auto");
    expect(payload.options.openaiApiKey).toBe("openai-key-123");
    expect(payload.options.openai_api_key).toBe("openai-key-123");
    expect(payload.options.anthropicApiKey).toBe("anthropic-key-456");
    expect(payload.options.anthropic_api_key).toBe("anthropic-key-456");
  });
});

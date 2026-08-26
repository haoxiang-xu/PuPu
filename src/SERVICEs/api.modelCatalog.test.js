import { EMPTY_MODEL_CATALOG, normalizeModelCatalog } from "./api";

describe("normalizeModelCatalog", () => {
  test("keeps legacy providers format and parses model capabilities", () => {
    const normalized = normalizeModelCatalog({
      active: {
        provider: "openai",
        model: "gpt-5",
      },
      providers: {
        openai: ["gpt-5", "  gpt-5-codex  ", "gpt-5"],
        anthropic: ["claude-sonnet-4-6"],
        ollama: ["deepseek-r1:14b"],
      },
      embedding_providers: {
        openai: ["text-embedding-3-small", " text-embedding-3-large ", "text-embedding-3-small"],
      },
      model_capabilities: {
        "openai:gpt-5": {
          input_modalities: ["pdf", "FILE", "IMAGE", "text", "video"],
          input_source_types: {
            image: ["URL", "base64", "ftp"],
            file: ["base64"],
            pdf: ["base64", "url"],
          },
        },
      },
    });

    expect(normalized.activeModel).toBe("openai:gpt-5");
    expect(normalized.providers).toEqual({
      openai: ["gpt-5", "gpt-5-codex"],
      anthropic: ["claude-sonnet-4-6"],
      ollama: ["deepseek-r1:14b"],
    });
    expect(normalized.embeddingProviders).toEqual({
      openai: ["text-embedding-3-large", "text-embedding-3-small"],
    });
    expect(normalized.modelCapabilities["openai:gpt-5"]).toEqual({
      input_modalities: ["text", "image", "pdf"],
      input_source_types: {
        image: ["url", "base64"],
        pdf: ["url", "base64"],
      },
    });
    expect(normalized.activeCapabilities).toEqual({
      input_modalities: ["text", "image", "pdf"],
      input_source_types: {
        image: ["url", "base64"],
        pdf: ["url", "base64"],
      },
    });
  });

  test("keeps declared reasoning effort levels and drops malformed entries", () => {
    const normalized = normalizeModelCatalog({
      providers: { openai: ["gpt-5"], anthropic: [], ollama: [] },
      model_capabilities: {
        "openai:gpt-5": {
          input_modalities: ["text"],
          reasoning_efforts: ["  MINIMAL ", "low", 42, "", "low", "high"],
        },
        "openai:gpt-5-codex": {
          input_modalities: ["text"],
          reasoning_efforts: [null, "", 7],
        },
      },
    });

    expect(normalized.modelCapabilities["openai:gpt-5"].reasoning_efforts).toEqual([
      "minimal",
      "low",
      "high",
    ]);
    // All entries malformed → the key stays absent, callers hide the selector.
    expect(
      normalized.modelCapabilities["openai:gpt-5-codex"].reasoning_efforts,
    ).toBeUndefined();
  });

  test("carries a declared default effort only when it is on the ladder", () => {
    const normalized = normalizeModelCatalog({
      providers: { openai: ["gpt-5"], anthropic: [], ollama: [] },
      model_capabilities: {
        "openai:on-ladder": {
          input_modalities: ["text"],
          reasoning_efforts: ["low", "medium", "high"],
          default_reasoning_effort: " MEDIUM ",
        },
        "openai:off-ladder": {
          input_modalities: ["text"],
          reasoning_efforts: ["low", "high"],
          // "medium" is not offered — marking it default would render a
          // selected pill the user can never reach.
          default_reasoning_effort: "medium",
        },
        "openai:no-efforts": {
          input_modalities: ["text"],
          default_reasoning_effort: "high",
        },
      },
    });

    expect(
      normalized.modelCapabilities["openai:on-ladder"]
        .default_reasoning_effort,
    ).toBe("medium");
    expect(
      normalized.modelCapabilities["openai:off-ladder"]
        .default_reasoning_effort,
    ).toBeUndefined();
    // No ladder at all → no default either.
    expect(
      normalized.modelCapabilities["openai:no-efforts"]
        .default_reasoning_effort,
    ).toBeUndefined();
  });

  test("falls back to text-only defaults for invalid capability payloads", () => {
    const normalized = normalizeModelCatalog({
      active: {
        provider: "openai",
        model: "unknown-model",
      },
      providers: EMPTY_MODEL_CATALOG.providers,
      model_capabilities: {
        "openai:gpt-5": {
          input_modalities: ["text", "image"],
          input_source_types: {
            image: ["url"],
          },
        },
      },
    });

    expect(normalized.activeModel).toBe("openai:unknown-model");
    expect(normalized.activeCapabilities).toEqual({
      input_modalities: ["text"],
      input_source_types: {},
    });
    expect(normalized.embeddingProviders).toEqual({
      openai: [],
    });
    expect(normalized.modelCapabilities["openai:gpt-5"]).toEqual({
      input_modalities: ["text", "image"],
      input_source_types: {
        image: ["url"],
      },
    });
  });

  test("normalizes embedding_providers from camelCase payload key", () => {
    const normalized = normalizeModelCatalog({
      embeddingProviders: {
        openai: ["text-embedding-ada-002", " text-embedding-3-small ", ""],
      },
    });

    expect(normalized.embeddingProviders).toEqual({
      openai: ["text-embedding-3-small", "text-embedding-ada-002"],
    });
  });

  test("prefers active.capabilities when provided", () => {
    const normalized = normalizeModelCatalog({
      active: {
        provider: "openai",
        model: "gpt-5",
        capabilities: {
          input_modalities: ["image", "text"],
          input_source_types: {
            image: ["base64"],
          },
        },
      },
      providers: EMPTY_MODEL_CATALOG.providers,
      model_capabilities: {
        "openai:gpt-5": {
          input_modalities: ["text"],
          input_source_types: {},
        },
      },
    });

    expect(normalized.activeCapabilities).toEqual({
      input_modalities: ["text", "image"],
      input_source_types: {
        image: ["base64"],
      },
    });
  });

  test("normalizes file modality alias to pdf", () => {
    const normalized = normalizeModelCatalog({
      active: {
        provider: "openai",
        model: "gpt-5",
      },
      providers: EMPTY_MODEL_CATALOG.providers,
      model_capabilities: {
        "openai:gpt-5": {
          input_modalities: ["text", "file"],
          input_source_types: {
            file: ["base64"],
          },
        },
      },
    });

    expect(normalized.modelCapabilities["openai:gpt-5"]).toEqual({
      input_modalities: ["text", "pdf"],
      input_source_types: {
        pdf: ["base64"],
      },
    });
  });

  test("preserves explicit no-tools model capability", () => {
    const normalized = normalizeModelCatalog({
      active: {
        provider: "ollama",
        model: "deepseek-r1:14b",
      },
      providers: EMPTY_MODEL_CATALOG.providers,
      model_capabilities: {
        "ollama:deepseek-r1:14b": {
          input_modalities: ["text"],
          input_source_types: {},
          supports_tools: false,
        },
      },
    });

    expect(normalized.modelCapabilities["ollama:deepseek-r1:14b"]).toEqual({
      input_modalities: ["text"],
      input_source_types: {},
      supports_tools: false,
    });
    expect(normalized.activeCapabilities).toEqual({
      input_modalities: ["text"],
      input_source_types: {},
      supports_tools: false,
    });
  });

  test("preserves normalized provider-specific computer-use capability", () => {
    const normalized = normalizeModelCatalog({
      active: { provider: "openai", model: "gpt-5.6" },
      providers: { openai: ["gpt-5.6"] },
      model_capabilities: {
        "openai:gpt-5.6": {
          input_modalities: ["text", "image"],
          computer_use: {
            supported: true,
            mode: "provider_native",
            protocol: "openai.responses.computer.v1",
            stability: "stable",
            reason: "",
          },
        },
      },
    });

    expect(normalized.activeCapabilities.computer_use).toEqual({
      supported: true,
      mode: "provider_native",
      protocol: "openai.responses.computer.v1",
      stability: "stable",
      reason: "",
    });
  });
});

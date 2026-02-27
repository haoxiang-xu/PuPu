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
    expect(normalized.modelCapabilities["openai:gpt-5"]).toEqual({
      input_modalities: ["text", "image"],
      input_source_types: {
        image: ["url"],
      },
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
});

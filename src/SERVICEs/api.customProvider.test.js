import { api } from "./api";
import {
  addCustomProvider,
  normalizeCustomProvider,
  setCustomProviderEnabled,
  setCustomProviderSecret,
} from "./custom_provider_store";
import { writeFeatureFlags } from "./feature_flags";

/**
 * S3 injection tests (design §6.2 / §9). Verifies:
 *  - options.custom_provider is injected (whitelist-sanitized, no secret)
 *  - the API key goes ONLY through the dedicated named channel
 *  - a double-colon model id roundtrips
 *  - missing key throws a structured error before send
 *  - built-in official keys are NEVER injected into a custom request
 */

const seedProvider = ({
  slug = "sap-hyperspace",
  protocol = "anthropic",
  authMode = "x-api-key",
  models,
  enabled = true,
} = {}) => {
  const norm = normalizeCustomProvider({
    format: "pupu-model-provider",
    format_version: 1,
    provider: {
      config_version: 1,
      id: slug,
      display_name: "Seed Provider",
      protocol,
      base_url:
        protocol === "ollama"
          ? "http://localhost:11434"
          : "http://localhost:6655/anthropic",
      auth: authMode === "none" ? { mode: "none" } : { mode: authMode },
      models: models || [
        { id: "anthropic--claude-4.5-haiku", capabilities: { supports_tools: true } },
      ],
    },
  });
  if (!norm.ok) {
    throw new Error(`seed provider invalid: ${JSON.stringify(norm.diagnostics)}`);
  }
  addCustomProvider(norm.provider);
  if (enabled) {
    setCustomProviderEnabled(slug, true);
  }
};

describe("custom provider payload injection", () => {
  const originalUnchainApi = window.unchainAPI;

  beforeEach(() => {
    window.localStorage.clear();
    writeFeatureFlags({ enable_custom_model_providers: true });
    window.unchainAPI = {
      startStream: jest.fn(() => ({ cancel: jest.fn() })),
      startStreamV2: jest.fn(() => ({ cancel: jest.fn() })),
      startStreamV4: jest.fn(() => ({ cancel: jest.fn() })),
    };
  });

  afterEach(() => {
    window.localStorage.clear();
    jest.clearAllMocks();
  });

  afterAll(() => {
    window.unchainAPI = originalUnchainApi;
  });

  test("injects sanitized custom_provider + dedicated key channel", () => {
    seedProvider();
    setCustomProviderSecret("sap-hyperspace", "hs-secret-value");

    api.unchain.startStreamV2({
      message: "hi",
      options: {
        modelId: "custom.sap-hyperspace:anthropic--claude-4.5-haiku",
      },
    });

    const [payload] = window.unchainAPI.startStreamV2.mock.calls[0];
    const opts = payload.options;

    // Definition injected, sanitized (no enabled/timestamps/secret).
    expect(opts.custom_provider).toBeDefined();
    expect(opts.custom_provider.slug).toBe("sap-hyperspace");
    expect(opts.custom_provider).not.toHaveProperty("enabled");
    expect(opts.custom_provider).not.toHaveProperty("created_at");
    const customProviderSerialized = JSON.stringify(opts.custom_provider);
    expect(customProviderSerialized).not.toContain("hs-secret-value");
    expect(customProviderSerialized).not.toContain("api_key");
    expect(customProviderSerialized).not.toContain("apiKey");

    // Key travels only via the dedicated named channel.
    expect(opts.custom_provider_api_key).toBe("hs-secret-value");
    expect(opts.customProviderApiKey).toBe("hs-secret-value");
    // Generic channels must NOT carry the custom key.
    expect(opts.api_key).toBeUndefined();
    expect(opts.apiKey).toBeUndefined();
    expect(opts.anthropic_api_key).toBeUndefined();
    expect(opts.anthropicApiKey).toBeUndefined();
  });

  test("double-colon model id roundtrips (custom.x:a:b:c)", () => {
    seedProvider({
      slug: "x",
      protocol: "ollama",
      authMode: "none",
      models: [{ id: "a:b:c" }],
    });

    api.unchain.startStreamV2({
      message: "hi",
      options: { modelId: "custom.x:a:b:c" },
    });

    const [payload] = window.unchainAPI.startStreamV2.mock.calls[0];
    expect(payload.options.custom_provider).toBeDefined();
    expect(payload.options.custom_provider.slug).toBe("x");
    expect(payload.options.custom_provider.models[0].id).toBe("a:b:c");
    // No key channel for a mode:none provider.
    expect(payload.options.custom_provider_api_key).toBeUndefined();
  });

  test("missing key throws custom_provider_missing_api_key before send", () => {
    seedProvider(); // requires x-api-key but no secret set

    expect(() =>
      api.unchain.startStreamV2({
        message: "hi",
        options: {
          modelId: "custom.sap-hyperspace:anthropic--claude-4.5-haiku",
        },
      }),
    ).toThrow(
      expect.objectContaining({ code: "custom_provider_missing_api_key" }),
    );
    expect(window.unchainAPI.startStreamV2).not.toHaveBeenCalled();
  });

  test("unknown custom provider throws custom_provider_not_found", () => {
    expect(() =>
      api.unchain.startStreamV2({
        message: "hi",
        options: { modelId: "custom.ghost:some-model" },
      }),
    ).toThrow(expect.objectContaining({ code: "custom_provider_not_found" }));
  });

  test("disabled custom provider throws custom_provider_disabled", () => {
    seedProvider({ enabled: false });
    setCustomProviderSecret("sap-hyperspace", "hs-secret-value");

    expect(() =>
      api.unchain.startStreamV2({
        message: "hi",
        options: {
          modelId: "custom.sap-hyperspace:anthropic--claude-4.5-haiku",
        },
      }),
    ).toThrow(expect.objectContaining({ code: "custom_provider_disabled" }));
  });

  test("feature flag blocks a custom provider before send", () => {
    seedProvider();
    setCustomProviderSecret("sap-hyperspace", "hs-secret-value");
    writeFeatureFlags({ enable_custom_model_providers: false });

    expect(() =>
      api.unchain.startStreamV2({
        message: "hi",
        options: {
          modelId: "custom.sap-hyperspace:anthropic--claude-4.5-haiku",
        },
      }),
    ).toThrow(expect.objectContaining({ code: "custom_provider_disabled" }));
    expect(window.unchainAPI.startStreamV2).not.toHaveBeenCalled();
  });

  test("feature flag blocks custom provider connection tests", async () => {
    window.unchainAPI.testCustomProvider = jest.fn();
    writeFeatureFlags({ enable_custom_model_providers: false });

    await expect(
      api.unchain.testCustomProvider({ id: "sap-hyperspace" }, "hs-key"),
    ).rejects.toEqual(
      expect.objectContaining({ code: "custom_provider_disabled" }),
    );
    expect(window.unchainAPI.testCustomProvider).not.toHaveBeenCalled();
  });

  test("built-in official key is NEVER injected into a custom request (§9.2)", () => {
    seedProvider();
    setCustomProviderSecret("sap-hyperspace", "hs-secret-value");
    // Store a real anthropic key that must not leak into the custom request.
    const settingsRoot = JSON.parse(
      window.localStorage.getItem("settings") || "{}",
    );
    window.localStorage.setItem(
      "settings",
      JSON.stringify({
        ...settingsRoot,
        model_providers: {
          ...settingsRoot.model_providers,
          anthropic_api_key: "sk-ant-official-should-not-leak",
        },
      }),
    );

    api.unchain.startStreamV2({
      message: "hi",
      options: {
        modelId: "custom.sap-hyperspace:anthropic--claude-4.5-haiku",
      },
    });

    const [payload] = window.unchainAPI.startStreamV2.mock.calls[0];
    const serialized = JSON.stringify(payload.options);
    // The custom (anthropic-protocol) request must not carry the official key.
    expect(serialized).not.toContain("sk-ant-official-should-not-leak");
    expect(payload.options.anthropic_api_key).toBeUndefined();
    expect(payload.options.anthropicApiKey).toBeUndefined();
  });

  test("built-in openai request is unaffected by the custom pipeline", () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({
        model_providers: { openai_api_key: "sk-openai-official" },
      }),
    );

    api.unchain.startStreamV2({
      message: "hi",
      options: { modelId: "openai:gpt-5" },
    });

    const [payload] = window.unchainAPI.startStreamV2.mock.calls[0];
    // Existing behavior preserved: official openai key injected, no custom_provider.
    expect(payload.options.openai_api_key).toBe("sk-openai-official");
    expect(payload.options.custom_provider).toBeUndefined();
    expect(payload.options.custom_provider_api_key).toBeUndefined();
  });
});

describe("getModelCatalog merges custom providers", () => {
  const originalUnchainApi = window.unchainAPI;

  beforeEach(() => {
    window.localStorage.clear();
    writeFeatureFlags({ enable_custom_model_providers: true });
    window.unchainAPI = {
      getModelCatalog: jest.fn(async () => ({
        providers: { openai: ["gpt-5"], anthropic: [], ollama: [] },
        model_capabilities: {},
      })),
    };
  });

  afterEach(() => {
    window.localStorage.clear();
    jest.clearAllMocks();
  });

  afterAll(() => {
    window.unchainAPI = originalUnchainApi;
  });

  test("enabled + keyed custom provider appears in the catalog with capabilities", async () => {
    seedProvider({
      models: [
        {
          id: "anthropic--claude-4.5-haiku",
          capabilities: { supports_tools: true, supports_vision: true },
        },
      ],
    });
    setCustomProviderSecret("sap-hyperspace", "hs-secret-value");

    const catalog = await api.unchain.getModelCatalog();
    expect(catalog.providers["custom.sap-hyperspace"]).toEqual([
      "anthropic--claude-4.5-haiku",
    ]);
    const capKey = "custom.sap-hyperspace:anthropic--claude-4.5-haiku";
    expect(catalog.modelCapabilities[capKey]).toBeDefined();
    expect(catalog.modelCapabilities[capKey].input_modalities).toContain(
      "image",
    );
  });

  test("enabled provider WITHOUT a required key is not merged", async () => {
    seedProvider(); // x-api-key required, no secret
    const catalog = await api.unchain.getModelCatalog();
    expect(catalog.providers["custom.sap-hyperspace"]).toBeUndefined();
  });

  test("disabled provider is not merged", async () => {
    seedProvider({ enabled: false });
    setCustomProviderSecret("sap-hyperspace", "hs-secret-value");
    const catalog = await api.unchain.getModelCatalog();
    expect(catalog.providers["custom.sap-hyperspace"]).toBeUndefined();
  });

  test("feature flag keeps custom providers out of the catalog", async () => {
    seedProvider();
    setCustomProviderSecret("sap-hyperspace", "hs-secret-value");
    writeFeatureFlags({ enable_custom_model_providers: false });

    const catalog = await api.unchain.getModelCatalog();
    expect(catalog.providers["custom.sap-hyperspace"]).toBeUndefined();
  });
});

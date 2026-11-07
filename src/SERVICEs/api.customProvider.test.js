import { api } from "./api";
import {
  addCustomProvider,
  normalizeCustomProvider,
  resolveShippedDefinition,
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

/* A request that runs a stored Skeleton Agent (#356, R-SEL-01).
 *
 * The injection above is about the model the COMPOSER would run. A chat that
 * carries a Skeleton selection runs the resource's saved Kernel instead, and
 * the composer's choice can outlive its provider — an ordinary persisted
 * state. The three send-time blocks must then not stop it, while every other
 * chat keeps them, and a `skeleton_selection` the server would refuse must buy
 * no exemption at all.
 */
describe("custom provider injection and a stored Skeleton Agent", () => {
  const SELECTION = Object.freeze({
    schema: "pupu.skeleton_chat_selection.v1",
    kind: "resource",
    resource_id: "diagnostics-row-14",
  });

  const send = (options) =>
    api.unchain.startStreamV2({ message: "hi", options });

  const sentOptions = () =>
    window.unchainAPI.startStreamV2.mock.calls[0][0].options;

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

  test("a model whose custom provider was deleted does not stop the Agent", () => {
    /* Nothing seeded: `custom.ghost` is a canonical model id whose provider is
       gone, which is exactly what a deleted provider leaves behind in a chat. */
    expect(() =>
      send({
        modelId: "custom.ghost:old-model",
        skeleton_selection: { ...SELECTION },
      }),
    ).not.toThrow();
    expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
    /* The selection travels untouched and no provider was invented for it. */
    expect(sentOptions().skeleton_selection).toEqual(SELECTION);
    expect(sentOptions().modelId).toBe("custom.ghost:old-model");
    expect("custom_provider" in sentOptions()).toBe(false);
    expect("custom_provider_api_key" in sentOptions()).toBe(false);
  });

  test("the same chat without an Agent is still blocked", () => {
    expect(() => send({ modelId: "custom.ghost:old-model" })).toThrow(
      expect.objectContaining({ code: "custom_provider_not_found" }),
    );
    expect(window.unchainAPI.startStreamV2).not.toHaveBeenCalled();
  });

  test("a disabled provider and a missing key are dropped the same way", () => {
    seedProvider({ enabled: false });
    setCustomProviderSecret("sap-hyperspace", "hs-secret-value");
    expect(() =>
      send({
        modelId: "custom.sap-hyperspace:anthropic--claude-4.5-haiku",
        skeleton_selection: { ...SELECTION },
      }),
    ).not.toThrow();

    window.localStorage.clear();
    writeFeatureFlags({ enable_custom_model_providers: true });
    seedProvider(); // enabled, requires a key, none set
    expect(() =>
      send({
        modelId: "custom.sap-hyperspace:anthropic--claude-4.5-haiku",
        skeleton_selection: { ...SELECTION },
      }),
    ).not.toThrow();
    expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(2);
  });

  test("a provider that does resolve is still injected for the same request", () => {
    /* Only the blocks are dropped, not the enrichment: an Agent whose Kernel
       names this provider keeps what the payload supplies. */
    seedProvider();
    setCustomProviderSecret("sap-hyperspace", "hs-secret-value");
    send({
      modelId: "custom.sap-hyperspace:anthropic--claude-4.5-haiku",
      skeleton_selection: { ...SELECTION },
    });
    expect(sentOptions().custom_provider).toEqual(
      expect.objectContaining({ id: "sap-hyperspace" }),
    );
    expect(sentOptions().skeleton_selection).toEqual(SELECTION);
  });

  test("a selection the server would refuse buys no exemption", () => {
    /* Each of these is refused by `prepare_skeleton_chat_selection`, so none of
       them may switch off a composer-side block here either. */
    const refused = [
      { ...SELECTION, name: "Research Agent" },
      { schema: SELECTION.schema, kind: "resource" },
      { ...SELECTION, schema: "pupu.skeleton_chat_selection.v2" },
      { ...SELECTION, kind: "legacy" },
      { ...SELECTION, resource_id: " diagnostics-row-14" },
      { ...SELECTION, resource_id: "a/b" },
      { ...SELECTION, resource_id: "" },
      { ...SELECTION, resource_id: 14 },
      "diagnostics-row-14",
      null,
    ];
    refused.forEach((selection) => {
      expect(() =>
        send({ modelId: "custom.ghost:old-model", skeleton_selection: selection }),
      ).toThrow(expect.objectContaining({ code: "custom_provider_not_found" }));
    });
    expect(window.unchainAPI.startStreamV2).not.toHaveBeenCalled();
  });

  test("an ordinary model with an Agent is enriched exactly as before", () => {
    /* The non-custom path is not touched by any of this. */
    send({ modelId: "openai:gpt-5", skeleton_selection: { ...SELECTION } });
    expect("custom_provider" in sentOptions()).toBe(false);
    expect(sentOptions().skeleton_selection).toEqual(SELECTION);
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

/**
 * Shipped providers (#202). DeepSeek and Kimi ride this same transport, but
 * they are a first-class product feature rather than an experimental one, so
 * enable_custom_model_providers must not reach them. Every test here runs with
 * the flag at its shipped default of FALSE — if one of them starts needing the
 * flag, the ticket has regressed.
 */
describe("shipped providers are not gated by the custom-provider flag", () => {
  const originalUnchainApi = window.unchainAPI;

  beforeEach(() => {
    window.localStorage.clear();
    writeFeatureFlags({ enable_custom_model_providers: false });
    window.unchainAPI = {
      startStream: jest.fn(() => ({ cancel: jest.fn() })),
      startStreamV2: jest.fn(() => ({ cancel: jest.fn() })),
      startStreamV4: jest.fn(() => ({ cancel: jest.fn() })),
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

  /* AC-02 */
  test("a shipped model is injected and sent with the flag off", () => {
    setCustomProviderSecret("deepseek", "sk-deepseek-key");

    api.unchain.startStreamV2({
      message: "hi",
      options: { modelId: "custom.deepseek:deepseek-v4-flash" },
    });

    expect(window.unchainAPI.startStreamV2).toHaveBeenCalled();
    const payload = window.unchainAPI.startStreamV2.mock.calls[0][0];
    expect(payload.options.custom_provider.id).toBe("deepseek");
    expect(payload.options.custom_provider.base_url).toBe(
      "https://api.deepseek.com/anthropic",
    );
    // Provenance never travels; the definition arrives as an ordinary custom
    // provider, which is what keeps the backend contract unchanged.
    expect(payload.options.custom_provider).not.toHaveProperty("origin");
  });

  /* AC-02, the other half: the flag still means something. */
  test("a user-authored model is still blocked with the flag off", () => {
    seedProvider();
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

  /* Fail-closed behaviour is unchanged for a shipped provider. */
  test("a shipped model with no key is still blocked before send", () => {
    expect(() =>
      api.unchain.startStreamV2({
        message: "hi",
        options: { modelId: "custom.kimi:kimi-k3" },
      }),
    ).toThrow(
      expect.objectContaining({ code: "custom_provider_missing_api_key" }),
    );
    expect(window.unchainAPI.startStreamV2).not.toHaveBeenCalled();
  });

  /* AC-01 at the catalog: the model reaches the selector without the flag. */
  test("a configured shipped provider is merged into the catalog", async () => {
    setCustomProviderSecret("kimi", "sk-kimi-key");

    const catalog = await api.unchain.getModelCatalog();

    expect(catalog.providers["custom.kimi"]).toEqual([
      "kimi-k3",
      "kimi-k2.7-code",
      "kimi-k2.6",
    ]);
    // The other site has no key of its own, so it stays out.
    expect(catalog.providers["custom.kimi-cn"]).toBeUndefined();
  });

  test("an unconfigured shipped provider stays out of the catalog", async () => {
    const catalog = await api.unchain.getModelCatalog();

    expect(catalog.providers["custom.deepseek"]).toBeUndefined();
    expect(catalog.providers["custom.kimi"]).toBeUndefined();
  });

  test("a shipped provider can be connection-tested with the flag off", async () => {
    window.unchainAPI.testCustomProvider = jest.fn(async () => ({ ok: true }));

    await expect(
      api.unchain.testCustomProvider(
        resolveShippedDefinition("deepseek"),
        "sk-deepseek-key",
      ),
    ).resolves.toEqual({ ok: true });
    expect(window.unchainAPI.testCustomProvider).toHaveBeenCalled();
  });
});

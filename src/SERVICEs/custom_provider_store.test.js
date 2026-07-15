import {
  CUSTOM_PROVIDER_CONFIG_VERSION,
  addCustomProvider,
  buildProviderExportPayload,
  buildProviderInjectionPayload,
  customProviderKey,
  findCustomProvider,
  getCustomProviderSecret,
  hasCustomProviderSecret,
  mapCustomModelCapabilities,
  normalizeCustomProvider,
  parseCustomProviderKey,
  readCustomProviders,
  removeCustomProvider,
  resolveCustomModelCapabilities,
  setCustomProviderEnabled,
  setCustomProviderSecret,
  updateCustomProvider,
} from "./custom_provider_store";

const diagCodes = (result) =>
  (result.diagnostics || []).map((d) => d.code);

const validRawProvider = (overrides = {}) => ({
  format: "pupu-model-provider",
  format_version: 1,
  provider: {
    config_version: 1,
    id: "sap-hyperspace",
    display_name: "SAP Hyperspace",
    protocol: "anthropic",
    base_url: "http://localhost:6655/anthropic",
    auth: { mode: "x-api-key", key_label: "Hyperspace key" },
    default_model: "anthropic--claude-4.5-haiku",
    models: [
      {
        id: "anthropic--claude-4.5-haiku",
        display_name: "Claude 4.5 Haiku",
        capabilities: { supports_tools: true, supports_vision: true },
      },
    ],
    ...overrides,
  },
});

beforeEach(() => {
  localStorage.clear();
  jest.restoreAllMocks();
});

describe("normalizeCustomProvider — 宽进严出", () => {
  test("accepts a valid full envelope and whitelist-copies the provider", () => {
    const result = normalizeCustomProvider(validRawProvider());
    expect(result.ok).toBe(true);
    expect(result.provider.id).toBe("sap-hyperspace");
    expect(result.provider.protocol).toBe("anthropic");
    expect(result.provider.config_version).toBe(CUSTOM_PROVIDER_CONFIG_VERSION);
    // Private / non-whitelisted fields never appear on the normalized output.
    expect(result.provider).not.toHaveProperty("enabled");
    expect(result.provider).not.toHaveProperty("source");
    expect(result.provider).not.toHaveProperty("created_at");
  });

  test("accepts a bare provider object (editor path)", () => {
    const raw = validRawProvider().provider;
    const result = normalizeCustomProvider(raw);
    expect(result.ok).toBe(true);
    expect(result.provider.id).toBe("sap-hyperspace");
  });

  test("unknown provider-level field -> warning + strip, still ok", () => {
    const raw = validRawProvider({ mystery_field: "surprise" });
    const result = normalizeCustomProvider(raw);
    expect(result.ok).toBe(true);
    expect(result.provider).not.toHaveProperty("mystery_field");
    expect(diagCodes(result)).toContain("unknown_field");
  });

  test("unknown field INSIDE auth is a HARD error", () => {
    const raw = validRawProvider();
    raw.provider.auth.smuggled = "x-secret-tunnel";
    const result = normalizeCustomProvider(raw);
    expect(result.ok).toBe(false);
    expect(diagCodes(result)).toContain("invalid_auth_config");
  });

  test("header mode requires header_name", () => {
    const raw = validRawProvider();
    raw.provider.auth = { mode: "header" };
    const result = normalizeCustomProvider(raw);
    expect(result.ok).toBe(false);
    expect(diagCodes(result)).toContain("invalid_auth_config");
  });
});

describe("normalizeCustomProvider — security", () => {
  test("rejects __proto__ anywhere in the graph", () => {
    const raw = validRawProvider();
    raw.provider.models[0].default_payload = JSON.parse(
      '{"__proto__": {"polluted": true}}',
    );
    const result = normalizeCustomProvider(raw);
    expect(result.ok).toBe(false);
    expect(diagCodes(result)).toContain("forbidden_key");
    // Global prototype must not be polluted.
    expect({}.polluted).toBeUndefined();
  });

  test("rejects reserved slug (visual impersonation)", () => {
    const raw = validRawProvider({ id: "openai" });
    const result = normalizeCustomProvider(raw);
    expect(result.ok).toBe(false);
    expect(diagCodes(result)).toContain("reserved_provider_id");
  });

  test("auth header smuggling via extra_headers is a HARD error", () => {
    const raw = validRawProvider({
      extra_headers: { authorization: "Bearer sk-leak", "X-Api-Key": "hs-leak" },
    });
    const result = normalizeCustomProvider(raw);
    expect(result.ok).toBe(false);
    expect(diagCodes(result)).toContain("auth_header_in_extra_headers");
  });

  test("strips secret-shaped fields from default_payload with a warning", () => {
    const raw = validRawProvider();
    raw.provider.models[0].default_payload = {
      temperature: 0.7,
      api_key: "sk-should-be-stripped",
      apiKey: "also-stripped",
      token: "nope",
    };
    const result = normalizeCustomProvider(raw);
    expect(result.ok).toBe(true);
    const payload = result.provider.models[0].default_payload;
    expect(payload).toEqual({ temperature: 0.7 });
    expect(diagCodes(result)).toContain("stripped_secret_field");
  });

  test("suspicious secret value in extra_headers -> warning (not fatal)", () => {
    const raw = validRawProvider({
      extra_headers: { "X-Trace": "sk-abcdef0123456789abcdef0123456789" },
    });
    const result = normalizeCustomProvider(raw);
    expect(result.ok).toBe(true);
    expect(diagCodes(result)).toContain("suspicious_secret_value");
  });

  test("default_model not in models -> cleared + warning", () => {
    const raw = validRawProvider({ default_model: "ghost-model" });
    const result = normalizeCustomProvider(raw);
    expect(result.ok).toBe(true);
    expect(result.provider).not.toHaveProperty("default_model");
    expect(diagCodes(result)).toContain("invalid_default_model");
  });

  test("duplicate model ids -> the duplicate is rejected", () => {
    const raw = validRawProvider();
    raw.provider.models.push({ id: "anthropic--claude-4.5-haiku" });
    const result = normalizeCustomProvider(raw);
    // First one kept; duplicate flagged.
    expect(diagCodes(result)).toContain("duplicate_model_id");
    expect(result.provider.models).toHaveLength(1);
  });

  test("model id with a colon is allowed (§4.2)", () => {
    const raw = validRawProvider();
    raw.provider.models = [{ id: "deepseek-r1:14b" }];
    raw.provider.default_model = "deepseek-r1:14b";
    raw.provider.protocol = "ollama";
    raw.provider.auth = { mode: "none" };
    const result = normalizeCustomProvider(raw);
    expect(result.ok).toBe(true);
    expect(result.provider.models[0].id).toBe("deepseek-r1:14b");
  });

  test("model id with whitespace is rejected", () => {
    const raw = validRawProvider();
    raw.provider.models = [{ id: "bad id" }];
    const result = normalizeCustomProvider(raw);
    expect(result.ok).toBe(false);
    expect(diagCodes(result)).toContain("invalid_model_id");
  });
});

describe("normalizeCustomProvider — version handling", () => {
  test("format_version > 1 hard-rejected", () => {
    const raw = validRawProvider();
    raw.format_version = 2;
    const result = normalizeCustomProvider(raw);
    expect(result.ok).toBe(false);
    expect(diagCodes(result)).toContain("unsupported_format_version");
  });

  test("payload over 256KB rejected", () => {
    const raw = validRawProvider();
    raw.provider.notes = "x".repeat(300 * 1024);
    const result = normalizeCustomProvider(raw);
    expect(result.ok).toBe(false);
    expect(diagCodes(result)).toContain("payload_too_large");
  });

  test("insecure non-localhost http -> warning (not fatal)", () => {
    const raw = validRawProvider({ base_url: "http://evil.example.com/api" });
    const result = normalizeCustomProvider(raw);
    expect(result.ok).toBe(true);
    expect(diagCodes(result)).toContain("insecure_base_url");
  });
});

describe("definition store CRUD", () => {
  const addValid = (overrides) => {
    const norm = normalizeCustomProvider(validRawProvider(overrides));
    expect(norm.ok).toBe(true);
    return addCustomProvider({ ...norm.provider, source: "import" });
  };

  test("cold start returns empty array", () => {
    expect(readCustomProviders()).toEqual([]);
  });

  test("add / find / list roundtrip", () => {
    addValid();
    const found = findCustomProvider("sap-hyperspace");
    expect(found).not.toBeNull();
    expect(found.enabled).toBe(false); // written disabled by default
    expect(found.source).toBe("import");
    expect(readCustomProviders()).toHaveLength(1);
  });

  test("duplicate slug on add throws provider_id_exists", () => {
    addValid();
    expect(() => addValid()).toThrow(
      expect.objectContaining({ code: "provider_id_exists" }),
    );
  });

  test("update cannot change id (immutable, FM12)", () => {
    addValid();
    const norm = normalizeCustomProvider(
      validRawProvider({ id: "sap-hyperspace", display_name: "Renamed" }),
    );
    // Attempt to sneak a different id through def — it must be ignored.
    const updated = updateCustomProvider("sap-hyperspace", {
      ...norm.provider,
      id: "attacker-slug",
    });
    expect(updated.id).toBe("sap-hyperspace");
    expect(updated.display_name).toBe("Renamed");
    expect(findCustomProvider("attacker-slug")).toBeNull();
  });

  test("removeCustomProvider deletes the linked secret", () => {
    addValid();
    setCustomProviderSecret("sap-hyperspace", "hs-key-123");
    expect(hasCustomProviderSecret("sap-hyperspace")).toBe(true);
    removeCustomProvider("sap-hyperspace");
    expect(findCustomProvider("sap-hyperspace")).toBeNull();
    expect(hasCustomProviderSecret("sap-hyperspace")).toBe(false);
    expect(getCustomProviderSecret("sap-hyperspace")).toBe("");
  });

  test("setCustomProviderEnabled toggles flag", () => {
    addValid();
    const updated = setCustomProviderEnabled("sap-hyperspace", true);
    expect(updated.enabled).toBe(true);
    expect(findCustomProvider("sap-hyperspace").enabled).toBe(true);
  });

  test("secret store is disjoint from the definition store", () => {
    addValid();
    setCustomProviderSecret("sap-hyperspace", "hs-secret-xyz");
    const def = findCustomProvider("sap-hyperspace");
    const serializedDef = JSON.stringify(def);
    expect(serializedDef).not.toContain("hs-secret-xyz");
    expect(getCustomProviderSecret("sap-hyperspace")).toBe("hs-secret-xyz");
  });
});

describe("normalize-on-read robustness", () => {
  test("corrupt settings blob -> empty read, no throw", () => {
    localStorage.setItem("settings", "{ not json");
    expect(readCustomProviders()).toEqual([]);
  });

  test("skips a structurally-unusable stored entry (warns, no field values)", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    localStorage.setItem(
      "settings",
      JSON.stringify({
        model_providers: {
          custom_providers: [
            { id: "openai" }, // reserved slug -> skipped
            {
              config_version: 1,
              id: "good-one",
              display_name: "Good",
              protocol: "ollama",
              base_url: "http://localhost:11434",
              auth: { mode: "none" },
              models: [{ id: "llama3" }],
              enabled: true,
            },
          ],
        },
      }),
    );
    const list = readCustomProviders();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("good-one");
    expect(warnSpy).toHaveBeenCalled();
    // The warn message must not leak field values.
    const warnArg = warnSpy.mock.calls[0][0];
    expect(warnArg).not.toContain("openai");
  });

  test("stored entry above supported config_version is skipped", () => {
    localStorage.setItem(
      "settings",
      JSON.stringify({
        model_providers: {
          custom_providers: [
            {
              config_version: 99,
              id: "future",
              display_name: "Future",
              protocol: "ollama",
              base_url: "http://localhost:11434",
              auth: { mode: "none" },
              models: [{ id: "m" }],
            },
          ],
        },
      }),
    );
    expect(readCustomProviders()).toEqual([]);
  });
});

describe("buildProviderExportPayload — 防泄密 (§8.2)", () => {
  const addValidEnabled = () => {
    const norm = normalizeCustomProvider(validRawProvider());
    addCustomProvider({ ...norm.provider, source: "preset" });
    setCustomProviderEnabled("sap-hyperspace", true);
  };

  test("export contains no secret value and no api_key/apiKey substring", () => {
    addValidEnabled();
    setCustomProviderSecret("sap-hyperspace", "hs-super-secret-key-value");
    const payload = buildProviderExportPayload("sap-hyperspace");
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("hs-super-secret-key-value");
    expect(serialized).not.toContain("api_key");
    expect(serialized).not.toContain("apiKey");
  });

  test("export whitelist excludes enabled/source/timestamps", () => {
    addValidEnabled();
    const payload = buildProviderExportPayload("sap-hyperspace");
    expect(payload.format).toBe("pupu-model-provider");
    expect(payload.format_version).toBe(1);
    expect(payload.provider).not.toHaveProperty("enabled");
    expect(payload.provider).not.toHaveProperty("source");
    expect(payload.provider).not.toHaveProperty("created_at");
    expect(payload.provider).not.toHaveProperty("updated_at");
  });

  test("export of unknown slug is null", () => {
    expect(buildProviderExportPayload("nope")).toBeNull();
  });

  test("export roundtrips cleanly back through normalize", () => {
    addValidEnabled();
    const payload = buildProviderExportPayload("sap-hyperspace");
    const renorm = normalizeCustomProvider(payload);
    expect(renorm.ok).toBe(true);
    expect(renorm.provider.id).toBe("sap-hyperspace");
  });
});

describe("addressing", () => {
  test("customProviderKey / parseCustomProviderKey roundtrip", () => {
    expect(customProviderKey("sap-hyperspace")).toBe("custom.sap-hyperspace");
    expect(parseCustomProviderKey("custom.sap-hyperspace")).toEqual({
      slug: "sap-hyperspace",
      modelId: "",
    });
  });

  test("parses a model id that itself contains colons", () => {
    expect(parseCustomProviderKey("custom.x:a:b:c")).toEqual({
      slug: "x",
      modelId: "a:b:c",
    });
  });

  test("non-custom key returns null", () => {
    expect(parseCustomProviderKey("openai:gpt-5")).toBeNull();
    expect(parseCustomProviderKey("")).toBeNull();
  });
});

describe("capability mapping helpers", () => {
  test("supports_vision -> image modality", () => {
    const caps = mapCustomModelCapabilities({ supports_vision: true });
    expect(caps.input_modalities).toContain("image");
  });

  test("supports_tools:false -> supports_tools:false", () => {
    const caps = mapCustomModelCapabilities({ supports_tools: false });
    expect(caps.supports_tools).toBe(false);
  });

  test("resolveCustomModelCapabilities reads from the store", () => {
    const norm = normalizeCustomProvider(validRawProvider());
    addCustomProvider(norm.provider);
    const caps = resolveCustomModelCapabilities(
      "custom.sap-hyperspace:anthropic--claude-4.5-haiku",
    );
    expect(caps).not.toBeNull();
    expect(caps.input_modalities).toContain("image");
  });

  test("resolveCustomModelCapabilities returns null for unknown", () => {
    expect(resolveCustomModelCapabilities("custom.nope:m")).toBeNull();
    expect(resolveCustomModelCapabilities("openai:gpt-5")).toBeNull();
  });
});

describe("buildProviderInjectionPayload — no secret fields", () => {
  test("injection payload carries no enabled/timestamps/source/secret keys", () => {
    const norm = normalizeCustomProvider(validRawProvider());
    const stored = addCustomProvider({ ...norm.provider, source: "manual" });
    setCustomProviderSecret("sap-hyperspace", "hs-key");
    const payload = buildProviderInjectionPayload(stored);
    const serialized = JSON.stringify(payload);
    expect(payload).not.toHaveProperty("enabled");
    expect(payload).not.toHaveProperty("created_at");
    expect(payload).not.toHaveProperty("source");
    expect(serialized).not.toContain("hs-key");
    expect(serialized).not.toContain("api_key");
    expect(serialized).not.toContain("apiKey");
  });
});

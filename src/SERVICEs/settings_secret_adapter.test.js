import {
  PROVIDER_SECRET_FIELDS,
  CUSTOM_PROVIDER_SECRETS_FIELD,
  SENSITIVE_MODEL_PROVIDER_FIELDS,
  readProviderSecret,
  writeProviderSecret,
  readCustomProviderSecrets,
  writeCustomProviderSecrets,
} from "./settings_secret_adapter";

const SETTINGS_KEY = "settings";

const seedRoot = (root) => {
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(root));
};

const parseRoot = () =>
  JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || "{}");

beforeEach(() => {
  window.localStorage.clear();
});

describe("field constants", () => {
  test("cover exactly the three Phase 4-deferred secret fields", () => {
    expect([...PROVIDER_SECRET_FIELDS]).toEqual([
      "openai_api_key",
      "anthropic_api_key",
    ]);
    expect(CUSTOM_PROVIDER_SECRETS_FIELD).toBe("custom_provider_secrets");
    expect([...SENSITIVE_MODEL_PROVIDER_FIELDS]).toEqual([
      "openai_api_key",
      "anthropic_api_key",
      "custom_provider_secrets",
    ]);
  });
});

describe("defaults", () => {
  test("empty storage reads as empty string / empty object", () => {
    expect(readProviderSecret("openai_api_key")).toBe("");
    expect(readProviderSecret("anthropic_api_key")).toBe("");
    expect(readCustomProviderSecrets()).toEqual({});
  });

  test("non-string stored secret normalizes to empty string", () => {
    seedRoot({ model_providers: { openai_api_key: 12345 } });
    expect(readProviderSecret("openai_api_key")).toBe("");
  });
});

describe("round trips", () => {
  test("provider api keys write and read back", () => {
    expect(writeProviderSecret("openai_api_key", "sk-openai")).toBe(true);
    expect(writeProviderSecret("anthropic_api_key", "sk-anthropic")).toBe(true);
    expect(readProviderSecret("openai_api_key")).toBe("sk-openai");
    expect(readProviderSecret("anthropic_api_key")).toBe("sk-anthropic");
  });

  test("custom provider secrets write and read back as a detached clone", () => {
    expect(
      writeCustomProviderSecrets({ "prov-1": { api_key: "sk-custom" } }),
    ).toBe(true);
    const first = readCustomProviderSecrets();
    expect(first).toEqual({ "prov-1": { api_key: "sk-custom" } });
    first["prov-1"].api_key = "mutated";
    expect(readCustomProviderSecrets()).toEqual({
      "prov-1": { api_key: "sk-custom" },
    });
  });

  test("non-string provider secret writes store the raw value verbatim (legacy parity, stays inert)", () => {
    // Legacy writeModelProviders spread the patch verbatim; readers
    // type-check non-strings away. String() coercion would turn junk into a
    // live-looking API key — verify it never happens.
    seedRoot({ model_providers: { openai_api_key: "sk-old" } });

    expect(writeProviderSecret("openai_api_key", null)).toBe(true);
    expect(parseRoot().model_providers.openai_api_key).toBeNull();
    expect(readProviderSecret("openai_api_key")).toBe("");

    expect(writeProviderSecret("openai_api_key", 12345)).toBe(true);
    expect(parseRoot().model_providers.openai_api_key).toBe(12345);
    expect(readProviderSecret("openai_api_key")).toBe(""); // inert, not "12345"

    expect(writeProviderSecret("openai_api_key", { nested: "junk" })).toBe(true);
    expect(parseRoot().model_providers.openai_api_key).toEqual({
      nested: "junk",
    });
    expect(readProviderSecret("openai_api_key")).toBe(""); // not "[object Object]"

    // undefined drops the field on serialization — same as the legacy spread
    expect(writeProviderSecret("openai_api_key", undefined)).toBe(true);
    expect(
      Object.prototype.hasOwnProperty.call(
        parseRoot().model_providers,
        "openai_api_key",
      ),
    ).toBe(false);
  });

  test("non-object custom secrets normalize to empty object", () => {
    seedRoot({ model_providers: { custom_provider_secrets: { a: 1 } } });
    expect(writeCustomProviderSecrets("nonsense")).toBe(true);
    expect(parseRoot().model_providers.custom_provider_secrets).toEqual({});
  });
});

describe("isolation — only the target field moves", () => {
  test("writing one secret preserves every other root and provider field", () => {
    seedRoot({
      appearance: { theme_mode: "dark_mode", locale: "en" },
      ui: { side_menu_open: true },
      unknown_future_namespace: { keep: ["me"] },
      model_providers: {
        openai_api_key: "sk-old-openai",
        custom_providers: [{ id: "prov-1", base_url: "http://x" }],
        custom_provider_secrets: { "prov-1": { api_key: "sk-c" } },
        some_future_field: 42,
      },
    });

    expect(writeProviderSecret("anthropic_api_key", "sk-new")).toBe(true);

    const root = parseRoot();
    expect(root.appearance).toEqual({ theme_mode: "dark_mode", locale: "en" });
    expect(root.ui).toEqual({ side_menu_open: true });
    expect(root.unknown_future_namespace).toEqual({ keep: ["me"] });
    expect(root.model_providers.openai_api_key).toBe("sk-old-openai");
    expect(root.model_providers.custom_providers).toEqual([
      { id: "prov-1", base_url: "http://x" },
    ]);
    expect(root.model_providers.custom_provider_secrets).toEqual({
      "prov-1": { api_key: "sk-c" },
    });
    expect(root.model_providers.some_future_field).toBe(42);
    expect(root.model_providers.anthropic_api_key).toBe("sk-new");
  });

  test("writing custom secrets preserves the api key fields", () => {
    seedRoot({
      model_providers: {
        openai_api_key: "sk-openai",
        anthropic_api_key: "sk-anthropic",
      },
    });
    expect(writeCustomProviderSecrets({ p: { api_key: "k" } })).toBe(true);
    const providers = parseRoot().model_providers;
    expect(providers.openai_api_key).toBe("sk-openai");
    expect(providers.anthropic_api_key).toBe("sk-anthropic");
    expect(providers.custom_provider_secrets).toEqual({ p: { api_key: "k" } });
  });
});

describe("corruption safety", () => {
  test("corrupt root JSON: reads return defaults, writes are refused", () => {
    window.localStorage.setItem(SETTINGS_KEY, "{not valid json");
    expect(readProviderSecret("openai_api_key")).toBe("");
    expect(readCustomProviderSecrets()).toEqual({});
    expect(writeProviderSecret("openai_api_key", "sk-x")).toBe(false);
    // the corrupt blob is left exactly as-is — never clobbered
    expect(window.localStorage.getItem(SETTINGS_KEY)).toBe("{not valid json");
  });

  test("non-object root JSON: writes are refused, blob untouched", () => {
    window.localStorage.setItem(SETTINGS_KEY, "[1,2,3]");
    expect(writeProviderSecret("anthropic_api_key", "sk-x")).toBe(false);
    expect(window.localStorage.getItem(SETTINGS_KEY)).toBe("[1,2,3]");
  });

  test("non-object model_providers is replaced only on write", () => {
    seedRoot({ model_providers: "corrupted" });
    expect(readProviderSecret("openai_api_key")).toBe("");
    expect(writeProviderSecret("openai_api_key", "sk-x")).toBe(true);
    expect(parseRoot().model_providers).toEqual({ openai_api_key: "sk-x" });
  });

  test("repairCorruptRoot opt-in: custom secrets write rebuilds a corrupt root (legacy custom-store parity)", () => {
    window.localStorage.setItem(SETTINGS_KEY, "{not valid json");
    // default stays refuse-don't-clobber
    expect(writeCustomProviderSecrets({ p: "k" })).toBe(false);
    expect(window.localStorage.getItem(SETTINGS_KEY)).toBe("{not valid json");
    // opt-in repairs from {} and persists — the legacy clobber semantics of
    // custom_provider_store's writers
    expect(
      writeCustomProviderSecrets({ p: "k" }, { repairCorruptRoot: true }),
    ).toBe(true);
    expect(parseRoot()).toEqual({
      model_providers: { custom_provider_secrets: { p: "k" } },
    });
    expect(readCustomProviderSecrets()).toEqual({ p: "k" });
  });

  test("repairCorruptRoot also covers a non-object root", () => {
    window.localStorage.setItem(SETTINGS_KEY, "[1,2,3]");
    expect(
      writeCustomProviderSecrets({ p: "k" }, { repairCorruptRoot: true }),
    ).toBe(true);
    expect(parseRoot()).toEqual({
      model_providers: { custom_provider_secrets: { p: "k" } },
    });
  });
});

describe("field validation", () => {
  test("unknown provider secret fields throw on read and write", () => {
    expect(() => readProviderSecret("custom_provider_secrets")).toThrow(
      /unknown provider secret field/,
    );
    expect(() => writeProviderSecret("theme_mode", "x")).toThrow(
      /unknown provider secret field/,
    );
  });
});

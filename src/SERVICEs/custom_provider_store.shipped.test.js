/**
 * Shipped-provider resolution (#202).
 *
 * The staleness defect this ticket fixes: before #202 the first API-key save
 * copied the bundled preset into custom_providers[] and the copy won from then
 * on, so a corrected or extended preset never reached a user who had already
 * configured that provider. These tests pin the fix at the store, which is the
 * single chokepoint every runtime consumer reads through.
 */
import {
  addCustomProvider,
  customProviderKey,
  findCustomProvider,
  migrateShippedProviderCopies,
  normalizeCustomProvider,
  readCustomProviders,
  readRuntimeProviderDefinitions,
  readShippedProviderDefinitions,
  resolveCustomModelCapabilities,
  resolveProviderDefinition,
  resolveShippedDefinition,
  setCustomProviderSecret,
} from "./custom_provider_store";
import {
  flushSettingsWrites,
  readNamespace,
  updateNamespace,
  resetSettingsRepositoryForTests,
} from "./settings_repository";
import {
  endProviderCredentialQuitDrain,
  resetProviderCredentialPersistenceForTests,
} from "./provider_credential_persistence";
import { readShippedPresetEnvelope } from "./shipped_provider_registry";

const userProvider = (overrides = {}) => ({
  config_version: 1,
  id: "my-proxy",
  display_name: "My Proxy",
  protocol: "anthropic",
  base_url: "https://proxy.example.com/anthropic",
  auth: { mode: "x-api-key" },
  models: [{ id: "some-model", display_name: "Some Model" }],
  ...overrides,
});

/** Write a raw custom_providers[] list, bypassing the store's own writers. */
const seedRawDefinitions = async (list) => {
  await updateNamespace("model_providers", (current) => ({
    ...(current && typeof current === "object" ? current : {}),
    custom_providers: list,
  }));
  await flushSettingsWrites();
};

const readRawDefinitions = () =>
  readNamespace("model_providers", {}).custom_providers || [];

/** The pre-#202 shape: the bundled preset copied into user storage. */
const legacyCopyOf = (slug, overrides = {}) => {
  const normalized = normalizeCustomProvider(readShippedPresetEnvelope(slug));
  return {
    ...normalized.provider,
    enabled: true,
    source: "preset",
    created_at: "2026-08-19T00:00:00.000Z",
    updated_at: "2026-08-19T00:00:00.000Z",
    ...overrides,
  };
};

beforeEach(() => {
  localStorage.clear();
  jest.restoreAllMocks();
  resetSettingsRepositoryForTests();
  resetProviderCredentialPersistenceForTests();
});

afterEach(() => {
  delete window.settingsStorageAPI;
  endProviderCredentialQuitDrain();
  resetSettingsRepositoryForTests();
  resetProviderCredentialPersistenceForTests();
});

describe("resolveShippedDefinition", () => {
  test("resolves a shipped provider from the app bundle", () => {
    const def = resolveShippedDefinition("deepseek");

    expect(def.id).toBe("deepseek");
    expect(def.origin).toBe("shipped");
    expect(def.protocol).toBe("anthropic");
    expect(def.base_url).toBe("https://api.deepseek.com/anthropic");
    expect(def.models.length).toBeGreaterThan(0);
  });

  /* A shipped provider has no stored definition to switch off, so it is always
     in force; whether it is USABLE is the credential gate downstream. */
  test("a shipped definition is always enabled", () => {
    expect(resolveShippedDefinition("kimi").enabled).toBe(true);
    expect(resolveShippedDefinition("kimi-cn").enabled).toBe(true);
  });

  test("returns null for a slug that is not shipped", () => {
    expect(resolveShippedDefinition("sap-hyperspace")).toBeNull();
    expect(resolveShippedDefinition("my-proxy")).toBeNull();
    expect(resolveShippedDefinition("")).toBeNull();
    expect(resolveShippedDefinition(undefined)).toBeNull();
  });

  test("resolves every shipped provider, registry order", () => {
    expect(readShippedProviderDefinitions().map((d) => d.id)).toEqual([
      "deepseek",
      "kimi",
      "kimi-cn",
    ]);
  });
});

describe("AC-03 — a shipped definition comes from the app, never from storage", () => {
  test("a stale stored copy cannot win over the bundled definition", async () => {
    await seedRawDefinitions([
      legacyCopyOf("deepseek", {
        base_url: "https://stale.example.com/anthropic",
        display_name: "Stale DeepSeek",
        models: [{ id: "deepseek-v1-ancient" }],
      }),
    ]);

    const resolved = resolveProviderDefinition("deepseek");

    expect(resolved.base_url).toBe("https://api.deepseek.com/anthropic");
    expect(resolved.display_name).toBe("DeepSeek");
    expect(resolved.models.map((m) => m.id)).not.toContain(
      "deepseek-v1-ancient",
    );
    expect(resolved.origin).toBe("shipped");
  });

  test("capability lookup resolves through the app definition too", async () => {
    await seedRawDefinitions([
      legacyCopyOf("deepseek", {
        models: [
          {
            id: "deepseek-v4-pro",
            capabilities: { supports_tools: false, supports_vision: true },
          },
        ],
      }),
    ]);

    const caps = resolveCustomModelCapabilities("custom.deepseek:deepseek-v4-pro");

    // The bundled definition declares tools-yes / vision-no; the stale copy
    // claimed the opposite and must not be consulted.
    expect(caps.supports_tools).not.toBe(false);
    expect(caps.input_modalities).not.toContain("image");
  });

  test("a shipped slug is skipped by the user-authored definition list", async () => {
    await seedRawDefinitions([legacyCopyOf("kimi"), userProvider()]);

    expect(readCustomProviders().map((p) => p.id)).toEqual(["my-proxy"]);
    expect(findCustomProvider("kimi")).toBeNull();
  });
});

describe("resolveProviderDefinition — provenance stays explicit", () => {
  test("marks a user-authored definition as user origin", async () => {
    await seedRawDefinitions([userProvider()]);

    expect(resolveProviderDefinition("my-proxy").origin).toBe("user");
    expect(resolveProviderDefinition("deepseek").origin).toBe("shipped");
    expect(resolveProviderDefinition("nope")).toBeNull();
  });
});

describe("readRuntimeProviderDefinitions — the flag is a per-slug decision", () => {
  test("shipped only by default", async () => {
    await seedRawDefinitions([userProvider()]);

    expect(readRuntimeProviderDefinitions().map((d) => d.id)).toEqual([
      "deepseek",
      "kimi",
      "kimi-cn",
    ]);
  });

  test("user-authored definitions join only when the caller admits them", async () => {
    await seedRawDefinitions([userProvider()]);

    const ids = readRuntimeProviderDefinitions({
      includeUserAuthored: true,
    }).map((d) => d.id);

    expect(ids).toEqual(["deepseek", "kimi", "kimi-cn", "my-proxy"]);
  });
});

describe("AC-07 — a user-authored provider cannot claim a shipped slug", () => {
  test("addCustomProvider refuses a shipped slug", () => {
    const normalized = normalizeCustomProvider(userProvider({ id: "deepseek" }));
    expect(normalized.ok).toBe(true);

    expect(() => addCustomProvider(normalized.provider)).toThrow(
      expect.objectContaining({ code: "provider_id_reserved" }),
    );
  });

  test("a non-shipped slug is still accepted", async () => {
    const normalized = normalizeCustomProvider(userProvider());
    const added = addCustomProvider(normalized.provider);
    await added.persistence;

    expect(readCustomProviders().map((p) => p.id)).toEqual(["my-proxy"]);
  });
});

describe("SEQ-002 — legacy copy migration", () => {
  test("removes the copy, leaves the key alone, and is idempotent", async () => {
    await seedRawDefinitions([legacyCopyOf("deepseek"), userProvider()]);
    await setCustomProviderSecret("deepseek", "sk-deepseek-key");
    await flushSettingsWrites();

    const first = migrateShippedProviderCopies();
    expect(first.migrated).toBe(true);
    expect(first.slugs).toEqual(["deepseek"]);
    await first.persistence;
    await flushSettingsWrites();

    // The copy is gone; the unrelated user provider is untouched.
    expect(readRawDefinitions().map((p) => p.id)).toEqual(["my-proxy"]);

    // The key is where a shipped provider's key belongs, and still works.
    expect(
      localStorage.getItem("settings") &&
        JSON.parse(localStorage.getItem("settings")).model_providers
          .custom_provider_secrets.deepseek,
    ).toBe("sk-deepseek-key");

    // Second launch: nothing left to do, nothing written.
    const second = migrateShippedProviderCopies();
    expect(second.migrated).toBe(false);
    expect(second.slugs).toEqual([]);
    expect(readRawDefinitions().map((p) => p.id)).toEqual(["my-proxy"]);
  });

  test("does nothing when no copy was ever written", async () => {
    await seedRawDefinitions([userProvider()]);

    expect(migrateShippedProviderCopies()).toEqual({
      migrated: false,
      slugs: [],
    });
  });

  /* C10: a config only a newer PuPu understands outranks tidying. */
  test("leaves a high-config_version entry under a shipped slug alone", async () => {
    await seedRawDefinitions([
      { ...legacyCopyOf("kimi"), config_version: 99 },
    ]);

    expect(migrateShippedProviderCopies().migrated).toBe(false);
    expect(readRawDefinitions()).toHaveLength(1);
  });
});

describe("BC-002 — the wire shape does not change", () => {
  test("a resolved shipped definition carries no provenance into the payload", () => {
    const def = resolveShippedDefinition("kimi");
    expect(def.origin).toBe("shipped");

    // buildProviderInjectionPayload is whitelist CONSTRUCTION, so origin /
    // source / enabled are structurally unreachable rather than deleted.
    const {
      buildProviderInjectionPayload,
    } = require("./custom_provider_store");
    const payload = buildProviderInjectionPayload(def);

    expect(payload).not.toHaveProperty("origin");
    expect(payload).not.toHaveProperty("source");
    expect(payload).not.toHaveProperty("enabled");
    expect(payload.id).toBe("kimi");
    expect(payload.slug).toBe("kimi");
    expect(customProviderKey("kimi")).toBe("custom.kimi");
  });
});

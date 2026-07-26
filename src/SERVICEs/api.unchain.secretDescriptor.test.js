/**
 * Phase 4 (S5) — renderer de-secreting + non-sensitive descriptor emission.
 *
 * These tests characterize the NEW steady-state behavior of the four
 * injection / gating points in api.unchain.js: when safeStorage is available
 * AND the credential is migrated to SQL (secretInjectionAuthoritative), the
 * renderer emits an `options.__pupu_secret_injection` descriptor list
 * ({ kind, id, channel }, NO value) instead of reading the secret value, and
 * the model-path short-circuit is re-expressed as a descriptor-list membership
 * check so the embedding-then-model collapse stays byte-equivalent to today
 * (descriptor contract §1-§4, CTO ADR §3).
 *
 * The transition/degraded three-state fallback (legacy value injection) is
 * covered in depth by api.customProvider.test.js / api.memoryProvider.test.js /
 * api.unchain.storage.test.js (all unchanged, all still passing); a few
 * representative fallback cases are re-asserted here alongside the mixed-
 * authority case to lock the boundary.
 *
 * Secret values seeded into legacy localStorage use OBVIOUS SENTINELS that must
 * NEVER appear in a steady-state payload — their absence proves the value path
 * was not taken. A jest.fn wrapper over the real settings_secret_adapter reads
 * additionally proves the reader itself is never invoked in steady state.
 */

// Wrap the two legacy secret readers with call-recording spies that still
// delegate to the real implementation (so fallback tests keep working). This
// lets steady-state tests assert the value reader was never invoked.
jest.mock("./settings_secret_adapter", () => {
  const actual = jest.requireActual("./settings_secret_adapter");
  return {
    ...actual,
    // Bare spies — react-scripts' jest preset runs resetMocks:true before each
    // test (which strips a jest.fn(impl) implementation), so the delegating
    // implementation is (re)installed in beforeEach instead.
    readProviderSecret: jest.fn(),
    readCustomProviderSecrets: jest.fn(),
  };
});

import { api } from "./api";
import {
  readProviderSecret,
  readCustomProviderSecrets,
} from "./settings_secret_adapter";
import { resetSessionBootstrapSnapshotForTests } from "./bridges/settings_storage_bridge";
import { resetSettingsRepositoryForTests } from "./settings_repository";
import {
  addCustomProvider,
  normalizeCustomProvider,
  setCustomProviderEnabled,
  setCustomProviderSecret,
} from "./custom_provider_store";
import { writeFeatureFlags } from "./feature_flags";

// The REAL adapter implementations, delegated to by the spies above. Kept out
// of the jest.mock factory so beforeEach can re-arm them after resetMocks.
const realAdapter = jest.requireActual("./settings_secret_adapter");

const SETTINGS_KEY = "settings";

const SENTINEL = {
  openai: "sk-openai-SENTINEL-must-never-leak",
  anthropic: "sk-ant-SENTINEL-must-never-leak",
  custom: "custom-SENTINEL-must-never-leak",
};

// Bootstrap snapshot exposing the S3 fields; all REQUIRED_METHODS present so
// the bridge reads as available. `namespaces` left empty so the repository
// yields defaults and memory is driven purely by explicit options.
const installStorageBridge = ({
  secretStorageStatus,
  configuredCredentials,
} = {}) => {
  window.settingsStorageAPI = {
    bootstrap: () => ({
      available: true,
      degraded: false,
      schemaVersion: 1,
      migration: { state: "complete", version: 1, digest: "d", migratedAt: 1 },
      namespaces: {},
      revisions: {},
      ...(secretStorageStatus !== undefined ? { secretStorageStatus } : {}),
      ...(configuredCredentials !== undefined ? { configuredCredentials } : {}),
    }),
    migrateLegacy: () => Promise.resolve({ status: "already-complete" }),
    setNamespace: (ns) =>
      Promise.resolve({ ok: true, namespace: ns, revision: 0, updatedAt: 1 }),
    deleteNamespace: (ns) =>
      Promise.resolve({ ok: true, namespace: ns, deleted: true }),
  };
};

const seedLegacy = (modelProviders) => {
  window.localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({ model_providers: modelProviders }),
  );
};

const seedCustomProvider = ({
  slug = "sap-hyperspace",
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
      protocol: "anthropic",
      base_url: "http://localhost:6655/anthropic",
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

const driveV2 = (options) => {
  api.unchain.startStreamV2({ message: "hi", options });
  expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
  return window.unchainAPI.startStreamV2.mock.calls[0][0];
};

const descriptorList = (payload) => payload.options.__pupu_secret_injection;

let originalUnchainApi;

beforeEach(() => {
  originalUnchainApi = window.unchainAPI;
  window.localStorage.clear();
  resetSessionBootstrapSnapshotForTests();
  resetSettingsRepositoryForTests();
  writeFeatureFlags({ enable_custom_model_providers: true });
  window.unchainAPI = {
    startStream: jest.fn(() => ({ cancel: jest.fn() })),
    startStreamV2: jest.fn(() => ({ cancel: jest.fn() })),
    startStreamV4: jest.fn(() => ({ cancel: jest.fn() })),
    replaceSessionMemory: jest.fn(async () => ({ applied: true })),
  };
  // Re-arm the delegating implementations wiped by resetMocks:true.
  readProviderSecret.mockImplementation(realAdapter.readProviderSecret);
  readCustomProviderSecrets.mockImplementation(
    realAdapter.readCustomProviderSecrets,
  );
});

afterEach(() => {
  delete window.settingsStorageAPI;
  window.localStorage.clear();
  resetSessionBootstrapSnapshotForTests();
  resetSettingsRepositoryForTests();
  window.unchainAPI = originalUnchainApi;
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Official provider descriptor emission (steady state)
// ---------------------------------------------------------------------------

describe("official provider descriptor emission (steady state)", () => {
  test("openai model, memory off → single {provider, openai, model} descriptor, no value", () => {
    installStorageBridge({
      secretStorageStatus: "available",
      configuredCredentials: ["openai"],
    });
    seedLegacy({ openai_api_key: SENTINEL.openai });

    const payload = driveV2({ modelId: "openai:gpt-5", memory_enabled: false });

    expect(descriptorList(payload)).toEqual([
      { kind: "provider", id: "openai", channel: "model" },
    ]);
    // No secret VALUE anywhere in the payload.
    expect(payload.options.openaiApiKey).toBeUndefined();
    expect(payload.options.openai_api_key).toBeUndefined();
    expect(payload.options.apiKey).toBeUndefined();
    expect(payload.options.api_key).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain(SENTINEL.openai);
  });

  test("anthropic model, memory off → single {provider, anthropic, model} descriptor", () => {
    installStorageBridge({
      secretStorageStatus: "available",
      configuredCredentials: ["anthropic"],
    });
    seedLegacy({ anthropic_api_key: SENTINEL.anthropic });

    const payload = driveV2({
      modelId: "anthropic:claude-sonnet-4-6",
      memory_enabled: false,
    });

    expect(descriptorList(payload)).toEqual([
      { kind: "provider", id: "anthropic", channel: "model" },
    ]);
    expect(payload.options.anthropicApiKey).toBeUndefined();
    expect(payload.options.anthropic_api_key).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain(SENTINEL.anthropic);
  });

  test("openai model + openai embedding collapses to a single embedding descriptor (short-circuit)", () => {
    installStorageBridge({
      secretStorageStatus: "available",
      configuredCredentials: ["openai"],
    });
    seedLegacy({ openai_api_key: SENTINEL.openai });

    const payload = driveV2({
      modelId: "openai:gpt-5",
      memory_enabled: true,
      memory_embedding_provider: "openai",
    });

    // Embedding entry is written first; the openai model path then short-
    // circuits on the existing openai list entry -> a SINGLE descriptor whose
    // channel is "embedding" (byte-equivalent to today's 2-field collapse).
    expect(descriptorList(payload)).toEqual([
      { kind: "provider", id: "openai", channel: "embedding" },
    ]);
    expect(payload.options.openaiApiKey).toBeUndefined();
    expect(payload.options.openai_api_key).toBeUndefined();
    expect(payload.options.apiKey).toBeUndefined();
    expect(payload.options.api_key).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain(SENTINEL.openai);
  });

  test("anthropic model + openai embedding → two descriptors (openai embedding + anthropic model)", () => {
    installStorageBridge({
      secretStorageStatus: "available",
      configuredCredentials: ["openai", "anthropic"],
    });
    seedLegacy({
      openai_api_key: SENTINEL.openai,
      anthropic_api_key: SENTINEL.anthropic,
    });

    const payload = driveV2({
      modelId: "anthropic:claude-sonnet-4-6",
      memory_enabled: true,
      memory_embedding_provider: "openai",
    });

    expect(descriptorList(payload)).toEqual([
      { kind: "provider", id: "openai", channel: "embedding" },
      { kind: "provider", id: "anthropic", channel: "model" },
    ]);
    // Neither official secret value leaks.
    expect(payload.options.openaiApiKey).toBeUndefined();
    expect(payload.options.openai_api_key).toBeUndefined();
    expect(payload.options.anthropicApiKey).toBeUndefined();
    expect(payload.options.anthropic_api_key).toBeUndefined();
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain(SENTINEL.openai);
    expect(serialized).not.toContain(SENTINEL.anthropic);
  });

  test("steady state never READS the secret value (reader spy uninvoked)", () => {
    installStorageBridge({
      secretStorageStatus: "available",
      configuredCredentials: ["openai"],
    });
    seedLegacy({ openai_api_key: SENTINEL.openai });
    readProviderSecret.mockClear();

    driveV2({ modelId: "openai:gpt-5", memory_enabled: false });

    expect(readProviderSecret).not.toHaveBeenCalled();
  });

  test("descriptor is also emitted on the V4 stream path", () => {
    installStorageBridge({
      secretStorageStatus: "available",
      configuredCredentials: ["openai"],
    });
    seedLegacy({ openai_api_key: SENTINEL.openai });

    api.unchain.startStreamV4({
      message: "hi",
      options: { modelId: "openai:gpt-5", memory_enabled: false },
    });

    const [payload] = window.unchainAPI.startStreamV4.mock.calls[0];
    expect(descriptorList(payload)).toEqual([
      { kind: "provider", id: "openai", channel: "model" },
    ]);
    expect(JSON.stringify(payload)).not.toContain(SENTINEL.openai);
  });

  test("descriptor is forwarded through replaceSessionMemory options", async () => {
    installStorageBridge({
      secretStorageStatus: "available",
      configuredCredentials: ["openai"],
    });
    seedLegacy({ openai_api_key: SENTINEL.openai });

    await api.unchain.replaceSessionMemory({
      sessionId: "chat-1",
      messages: [{ role: "user", content: "hi" }],
      options: { modelId: "openai:gpt-5", memory_enabled: false },
    });

    const [payload] = window.unchainAPI.replaceSessionMemory.mock.calls[0];
    // The renderer emits the descriptor; the main process strips it before
    // POST (S4). Here we only assert the renderer forwarded it.
    expect(payload.options.__pupu_secret_injection).toEqual([
      { kind: "provider", id: "openai", channel: "model" },
    ]);
    expect(JSON.stringify(payload)).not.toContain(SENTINEL.openai);
  });
});

// ---------------------------------------------------------------------------
// Custom provider descriptor emission (steady state)
// ---------------------------------------------------------------------------

describe("custom provider descriptor emission (steady state)", () => {
  test("authoritative custom provider → sanitized def + custom descriptor, no value channel", () => {
    seedCustomProvider();
    // Legacy secret present as a SENTINEL that must NOT be injected in steady
    // state (main will decrypt from SQL instead).
    setCustomProviderSecret("sap-hyperspace", SENTINEL.custom);
    installStorageBridge({
      secretStorageStatus: "available",
      configuredCredentials: ["custom.sap-hyperspace"],
    });
    readCustomProviderSecrets.mockClear();

    const payload = driveV2({
      modelId: "custom.sap-hyperspace:anthropic--claude-4.5-haiku",
    });

    // Sanitized definition still injected (no secret in it).
    expect(payload.options.custom_provider).toBeDefined();
    expect(payload.options.custom_provider.slug).toBe("sap-hyperspace");
    // Descriptor carries the identity only.
    expect(descriptorList(payload)).toEqual([
      { kind: "custom_provider", id: "custom.sap-hyperspace", channel: "model" },
    ]);
    // Dedicated value channels are NOT populated in steady state.
    expect(payload.options.custom_provider_api_key).toBeUndefined();
    expect(payload.options.customProviderApiKey).toBeUndefined();
    // The generic channel is never used for custom.
    expect(payload.options.api_key).toBeUndefined();
    expect(payload.options.apiKey).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain(SENTINEL.custom);
    // Steady-state authority comes from the SQL identity list, so the legacy
    // custom-secret reader is never consulted during injection.
    expect(readCustomProviderSecrets).not.toHaveBeenCalled();
  });

  test("mode:none custom provider needs no descriptor and no key channel", () => {
    seedCustomProvider({
      slug: "localx",
      authMode: "none",
      models: [{ id: "m1" }],
    });
    installStorageBridge({
      secretStorageStatus: "available",
      configuredCredentials: [],
    });

    const payload = driveV2({ modelId: "custom.localx:m1" });

    expect(payload.options.custom_provider).toBeDefined();
    expect(payload.options.__pupu_secret_injection).toBeUndefined();
    expect(payload.options.custom_provider_api_key).toBeUndefined();
  });

  test("required-key custom provider with NO configured secret still blocks at send-time", () => {
    seedCustomProvider(); // x-api-key, no secret set, not in SQL list
    installStorageBridge({
      secretStorageStatus: "available",
      configuredCredentials: [],
    });

    expect(() =>
      driveV2({
        modelId: "custom.sap-hyperspace:anthropic--claude-4.5-haiku",
      }),
    ).toThrow(
      expect.objectContaining({ code: "custom_provider_missing_api_key" }),
    );
    expect(window.unchainAPI.startStreamV2).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Legacy fallback + mixed authority (three-state boundary)
// ---------------------------------------------------------------------------

describe("legacy fallback + mixed authority", () => {
  test("degraded storage (unavailable) falls back to legacy value injection, no descriptor", () => {
    installStorageBridge({
      secretStorageStatus: "unavailable",
      configuredCredentials: ["openai"],
    });
    seedLegacy({ openai_api_key: SENTINEL.openai });

    const payload = driveV2({ modelId: "openai:gpt-5", memory_enabled: false });

    // Not authoritative (storage unavailable) -> today's 4-field legacy write.
    expect(payload.options.__pupu_secret_injection).toBeUndefined();
    expect(payload.options.openaiApiKey).toBe(SENTINEL.openai);
    expect(payload.options.openai_api_key).toBe(SENTINEL.openai);
    expect(payload.options.apiKey).toBe(SENTINEL.openai);
    expect(payload.options.api_key).toBe(SENTINEL.openai);
  });

  test("first-boot transition (available but SQL not yet migrated) uses legacy value, no descriptor", () => {
    installStorageBridge({
      secretStorageStatus: "available",
      configuredCredentials: [], // SQL ciphertext not landed yet
    });
    seedLegacy({ openai_api_key: SENTINEL.openai });

    const payload = driveV2({ modelId: "openai:gpt-5", memory_enabled: false });

    expect(payload.options.__pupu_secret_injection).toBeUndefined();
    expect(payload.options.openai_api_key).toBe(SENTINEL.openai);
    expect(payload.options.apiKey).toBe(SENTINEL.openai);
  });

  test("mixed authority: openai migrated (descriptor) + anthropic legacy-only (value)", () => {
    // openai is in the SQL list (authoritative), anthropic only in legacy.
    installStorageBridge({
      secretStorageStatus: "available",
      configuredCredentials: ["openai"],
    });
    seedLegacy({
      openai_api_key: SENTINEL.openai,
      anthropic_api_key: SENTINEL.anthropic,
    });

    // anthropic chat model + openai embedding.
    const payload = driveV2({
      modelId: "anthropic:claude-sonnet-4-6",
      memory_enabled: true,
      memory_embedding_provider: "openai",
    });

    // openai embedding rides a descriptor; its value must NOT leak.
    expect(descriptorList(payload)).toEqual([
      { kind: "provider", id: "openai", channel: "embedding" },
    ]);
    expect(payload.options.openaiApiKey).toBeUndefined();
    expect(payload.options.openai_api_key).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain(SENTINEL.openai);

    // anthropic is legacy-only -> today's 2-field value write, no generic key.
    expect(payload.options.anthropicApiKey).toBe(SENTINEL.anthropic);
    expect(payload.options.anthropic_api_key).toBe(SENTINEL.anthropic);
    expect(payload.options.apiKey).toBeUndefined();
    expect(payload.options.api_key).toBeUndefined();
  });

  test("catalog gating uses the existence signal (SQL identity) without reading the value", async () => {
    seedCustomProvider();
    installStorageBridge({
      secretStorageStatus: "available",
      configuredCredentials: ["custom.sap-hyperspace"],
    });
    window.unchainAPI.getModelCatalog = jest.fn(async () => ({
      providers: { openai: ["gpt-5"], anthropic: [], ollama: [] },
      model_capabilities: {},
    }));
    readCustomProviderSecrets.mockClear();

    const catalog = await api.unchain.getModelCatalog();

    // Present in the catalog purely on the SQL identity signal (no legacy
    // secret set for this slug).
    expect(catalog.providers["custom.sap-hyperspace"]).toEqual([
      "anthropic--claude-4.5-haiku",
    ]);
    expect(readCustomProviderSecrets).not.toHaveBeenCalled();
  });
});

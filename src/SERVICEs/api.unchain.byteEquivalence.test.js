/**
 * Phase 4 (S6) — renderer half of the provider-secret byte-equivalence
 * characterization (Phase 4 release gate).
 *
 * The MAIN half lives in
 * electron/tests/main/unchain_provider_secret_byte_equivalence.test.cjs — it
 * proves main(descriptor) === main(legacy inline) === the same Flask body.
 * This suite pins the two renderer OUTPUTS that feed that proof, for each of
 * the four mandated combos (S6 brief §1):
 *
 *   - renderer(legacy / not authoritative) writes EXACTLY the inline field set
 *     (the `legacyInline` object used verbatim by the main suite), and
 *   - renderer(steady / authoritative) writes EXACTLY the descriptor list (the
 *     `descriptor` array used verbatim by the main suite), with NO value.
 *
 * Because the two suites share the identical field sets and descriptor shapes,
 * "renderer(steady) -> main -> Flask body === renderer(legacy) -> main -> Flask
 * body" is established end to end without needing to run both module systems in
 * one process (S4 report concern #1: the equivalence is field-set + value, not
 * literal bytes).
 *
 * It also locks:
 *   - the hasAnyApiKey caller-explicit short-circuit (today's semantics kept),
 *   - custom never uses the generic api_key channel on the renderer side, and
 *   - gate 7 red line #8 (renderer side): the only secret-adjacent renderer
 *     signal is a boolean — providerSecretConfigured / secretInjectionAuthoritative
 *     return true/false, never the secret value.
 *
 * All seeded secrets are OBVIOUS SENTINELS whose appearance in a steady-state
 * payload would be a failure.
 */

jest.mock("./settings_secret_adapter", () => {
  const actual = jest.requireActual("./settings_secret_adapter");
  return {
    ...actual,
    readProviderSecret: jest.fn(),
    readCustomProviderSecrets: jest.fn(),
  };
});

import { api } from "./api";
import {
  readProviderSecret,
  readCustomProviderSecrets,
} from "./settings_secret_adapter";
import {
  providerSecretConfigured,
  secretInjectionAuthoritative,
} from "./provider_secret_status";
import { resetSessionBootstrapSnapshotForTests } from "./bridges/settings_storage_bridge";
import { resetSettingsRepositoryForTests } from "./settings_repository";
import {
  addCustomProvider,
  normalizeCustomProvider,
  setCustomProviderEnabled,
  setCustomProviderSecret,
} from "./custom_provider_store";
import { writeFeatureFlags } from "./feature_flags";

const realAdapter = jest.requireActual("./settings_secret_adapter");

const SETTINGS_KEY = "settings";

const SENTINEL = {
  openai: "sk-openai-SENTINEL-must-never-leak-6",
  anthropic: "sk-ant-SENTINEL-must-never-leak-66",
  custom: "sk-custom-SENTINEL-must-never-leak-6",
};

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
    setProviderCredential: () =>
      Promise.resolve({
        ok: true,
        status:
          secretStorageStatus === "available" ? "stored" : "legacy-only",
      }),
    deleteProviderCredential: () =>
      Promise.resolve({ ok: true, deleted: true }),
  };
};

const seedLegacy = (modelProviders) => {
  window.localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({ model_providers: modelProviders }),
  );
};

const seedCustomProvider = ({ slug = "myslug", authMode = "x-api-key" } = {}) => {
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
      models: [
        { id: "anthropic--claude-4.5-haiku", capabilities: { supports_tools: true } },
      ],
    },
  });
  if (!norm.ok) {
    throw new Error(`seed provider invalid: ${JSON.stringify(norm.diagnostics)}`);
  }
  addCustomProvider(norm.provider);
  setCustomProviderEnabled(slug, true);
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

// The exact field sets / descriptors the MAIN suite consumes verbatim. Keeping
// them here as named constants makes the cross-suite join auditable.
const COMBOS = {
  openaiModel: {
    options: { modelId: "openai:gpt-5", memory_enabled: false },
    legacyFields: {
      openaiApiKey: SENTINEL.openai,
      openai_api_key: SENTINEL.openai,
      apiKey: SENTINEL.openai,
      api_key: SENTINEL.openai,
    },
    descriptor: [{ kind: "provider", id: "openai", channel: "model" }],
  },
  openaiEmbeddingCollapse: {
    options: {
      modelId: "openai:gpt-5",
      memory_enabled: true,
      memory_embedding_provider: "openai",
    },
    legacyFields: {
      openaiApiKey: SENTINEL.openai,
      openai_api_key: SENTINEL.openai,
    },
    descriptor: [{ kind: "provider", id: "openai", channel: "embedding" }],
  },
  anthropicPlusOpenaiEmbedding: {
    options: {
      modelId: "anthropic:claude-sonnet-4-6",
      memory_enabled: true,
      memory_embedding_provider: "openai",
    },
    legacyFields: {
      openaiApiKey: SENTINEL.openai,
      openai_api_key: SENTINEL.openai,
      anthropicApiKey: SENTINEL.anthropic,
      anthropic_api_key: SENTINEL.anthropic,
    },
    descriptor: [
      { kind: "provider", id: "openai", channel: "embedding" },
      { kind: "provider", id: "anthropic", channel: "model" },
    ],
  },
};

// ---------------------------------------------------------------------------
// renderer(legacy) writes EXACTLY the inline field set fed to the main suite
// ---------------------------------------------------------------------------

describe("renderer legacy assembly matches the main suite's inline field set", () => {
  test("openai model, memory off → the 4-field set (values), no descriptor", () => {
    installStorageBridge({ secretStorageStatus: "unavailable" });
    seedLegacy({ openai_api_key: SENTINEL.openai });

    const payload = driveV2(COMBOS.openaiModel.options);

    for (const [field, value] of Object.entries(
      COMBOS.openaiModel.legacyFields,
    )) {
      expect(payload.options[field]).toBe(value);
    }
    expect(payload.options).not.toHaveProperty("__pupu_secret_injection");
  });

  test("openai model + openai embedding → the 2-field collapse (values), no descriptor", () => {
    installStorageBridge({ secretStorageStatus: "unavailable" });
    seedLegacy({ openai_api_key: SENTINEL.openai });

    const payload = driveV2(COMBOS.openaiEmbeddingCollapse.options);

    expect(payload.options.openaiApiKey).toBe(SENTINEL.openai);
    expect(payload.options.openai_api_key).toBe(SENTINEL.openai);
    // Short-circuit collapse: the generic key fields are NOT added.
    expect(payload.options).not.toHaveProperty("apiKey");
    expect(payload.options).not.toHaveProperty("api_key");
    expect(payload.options).not.toHaveProperty("__pupu_secret_injection");
  });

  test("anthropic model + openai embedding → both 2-field sets (values), no descriptor", () => {
    installStorageBridge({ secretStorageStatus: "unavailable" });
    seedLegacy({
      openai_api_key: SENTINEL.openai,
      anthropic_api_key: SENTINEL.anthropic,
    });

    const payload = driveV2(COMBOS.anthropicPlusOpenaiEmbedding.options);

    for (const [field, value] of Object.entries(
      COMBOS.anthropicPlusOpenaiEmbedding.legacyFields,
    )) {
      expect(payload.options[field]).toBe(value);
    }
    // No generic key on either provider.
    expect(payload.options).not.toHaveProperty("apiKey");
    expect(payload.options).not.toHaveProperty("api_key");
    expect(payload.options).not.toHaveProperty("__pupu_secret_injection");
  });

  test("custom provider → dedicated channel only (values), never api_key", async () => {
    seedCustomProvider();
    installStorageBridge({ secretStorageStatus: "unavailable" });
    await setCustomProviderSecret("myslug", SENTINEL.custom);

    const payload = driveV2({
      modelId: "custom.myslug:anthropic--claude-4.5-haiku",
    });

    expect(payload.options.custom_provider_api_key).toBe(SENTINEL.custom);
    expect(payload.options.customProviderApiKey).toBe(SENTINEL.custom);
    expect(payload.options.custom_provider).toBeDefined();
    // Gate 7 red line #9 on the renderer side too.
    expect(payload.options).not.toHaveProperty("api_key");
    expect(payload.options).not.toHaveProperty("apiKey");
    expect(payload.options).not.toHaveProperty("__pupu_secret_injection");
  });
});

// ---------------------------------------------------------------------------
// renderer(steady) writes EXACTLY the descriptor list fed to the main suite
// ---------------------------------------------------------------------------

describe("renderer steady-state emits exactly the main suite's descriptor list", () => {
  test("openai model, memory off → [{provider, openai, model}], no value", () => {
    installStorageBridge({
      secretStorageStatus: "available",
      configuredCredentials: ["openai"],
    });
    seedLegacy({ openai_api_key: SENTINEL.openai });

    const payload = driveV2(COMBOS.openaiModel.options);

    expect(descriptorList(payload)).toEqual(COMBOS.openaiModel.descriptor);
    expect(JSON.stringify(payload)).not.toContain(SENTINEL.openai);
  });

  test("openai model + openai embedding → [{provider, openai, embedding}] collapse", () => {
    installStorageBridge({
      secretStorageStatus: "available",
      configuredCredentials: ["openai"],
    });
    seedLegacy({ openai_api_key: SENTINEL.openai });

    const payload = driveV2(COMBOS.openaiEmbeddingCollapse.options);

    expect(descriptorList(payload)).toEqual(
      COMBOS.openaiEmbeddingCollapse.descriptor,
    );
    expect(JSON.stringify(payload)).not.toContain(SENTINEL.openai);
  });

  test("anthropic model + openai embedding → both descriptors in order", () => {
    installStorageBridge({
      secretStorageStatus: "available",
      configuredCredentials: ["openai", "anthropic"],
    });
    seedLegacy({
      openai_api_key: SENTINEL.openai,
      anthropic_api_key: SENTINEL.anthropic,
    });

    const payload = driveV2(COMBOS.anthropicPlusOpenaiEmbedding.options);

    expect(descriptorList(payload)).toEqual(
      COMBOS.anthropicPlusOpenaiEmbedding.descriptor,
    );
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain(SENTINEL.openai);
    expect(serialized).not.toContain(SENTINEL.anthropic);
  });

  test("custom provider → [{custom_provider, custom.myslug, model}], no value channel", async () => {
    seedCustomProvider();
    installStorageBridge({
      secretStorageStatus: "available",
      configuredCredentials: ["custom.myslug"],
    });
    // A runtime mutation becomes descriptor-authoritative only after main's
    // write-only credential channel explicitly acknowledges SQL durability.
    await setCustomProviderSecret("myslug", SENTINEL.custom);

    const payload = driveV2({
      modelId: "custom.myslug:anthropic--claude-4.5-haiku",
    });

    expect(descriptorList(payload)).toEqual([
      { kind: "custom_provider", id: "custom.myslug", channel: "model" },
    ]);
    expect(payload.options.custom_provider_api_key).toBeUndefined();
    expect(payload.options.customProviderApiKey).toBeUndefined();
    expect(payload.options).not.toHaveProperty("api_key");
    expect(JSON.stringify(payload)).not.toContain(SENTINEL.custom);
  });
});

// ---------------------------------------------------------------------------
// hasAnyApiKey caller-explicit short-circuit (today's semantics preserved)
// ---------------------------------------------------------------------------

describe("hasAnyApiKey caller-explicit short-circuit", () => {
  test("an explicit key already in options is never overwritten and emits no descriptor", () => {
    // Authoritative for openai, yet the caller pre-supplied a key: today's
    // value-based short-circuit wins, so NO descriptor is emitted and the
    // caller's key is preserved verbatim (byte-equivalent to legacy behavior).
    installStorageBridge({
      secretStorageStatus: "available",
      configuredCredentials: ["openai"],
    });
    seedLegacy({ openai_api_key: SENTINEL.openai });

    const payload = driveV2({
      modelId: "openai:gpt-5",
      memory_enabled: false,
      openaiApiKey: "caller-explicit-key",
    });

    expect(payload.options).not.toHaveProperty("__pupu_secret_injection");
    expect(payload.options.openaiApiKey).toBe("caller-explicit-key");
    // The steady-state SQL key (via main) never clobbers the caller's value,
    // and the SENTINEL legacy value is never read.
    expect(JSON.stringify(payload)).not.toContain(SENTINEL.openai);
  });
});

// ---------------------------------------------------------------------------
// Gate 7 red line #8 (renderer side): only secret-adjacent signal is a boolean
// ---------------------------------------------------------------------------

describe("renderer secret-adjacent signals are booleans only (#8)", () => {
  test("providerSecretConfigured returns a boolean, never the secret value", () => {
    seedLegacy({ openai_api_key: SENTINEL.openai });
    installStorageBridge({ secretStorageStatus: "unavailable" });

    const result = providerSecretConfigured("openai");
    expect(typeof result).toBe("boolean");
    expect(result).toBe(true);
    // The function is the ONLY secret-adjacent renderer read; it must not be a
    // covert value channel.
    expect(result).not.toBe(SENTINEL.openai);
  });

  test("secretInjectionAuthoritative returns a boolean, never the secret value", () => {
    seedLegacy({ openai_api_key: SENTINEL.openai });
    installStorageBridge({
      secretStorageStatus: "available",
      configuredCredentials: ["openai"],
    });

    const result = secretInjectionAuthoritative("openai");
    expect(typeof result).toBe("boolean");
    expect(result).toBe(true);
    expect(result).not.toBe(SENTINEL.openai);
  });

  test("an unconfigured provider reads as false, not as a thrown value", () => {
    installStorageBridge({
      secretStorageStatus: "available",
      configuredCredentials: [],
    });
    expect(providerSecretConfigured("anthropic")).toBe(false);
    expect(secretInjectionAuthoritative("anthropic")).toBe(false);
  });
});

/**
 * Characterization tests for model_providers/storage.js (Phase 1B T5).
 *
 * The first describe block locks the consumer-visible read/write behavior in
 * fallback (localStorage) mode. It was written against the legacy
 * implementation and passed unchanged — assertions use exactly the access
 * patterns of the real consumers (api_key_input.js, use_chat_input_models.js,
 * chat.js, configure_providers.js): `readModelProviders()[key] || ""` and
 * `!!readModelProviders()[key]`.
 *
 * The SQL-mode describe block (added with the conversion) locks the T5 secret
 * split: the three sensitive fields never reach the repository/IPC, while the
 * merged read shape stays the same.
 */

import { readModelProviders, writeModelProviders } from "./storage";
import {
  flushSettingsWrites,
  resetSettingsRepositoryForTests,
} from "../../../SERVICEs/settings_repository";
import {
  beginProviderCredentialQuitDrain,
  endProviderCredentialQuitDrain,
  resetProviderCredentialPersistenceForTests,
} from "../../../SERVICEs/provider_credential_persistence";

const SETTINGS_KEY = "settings";

const seedRoot = (root) => {
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(root));
};

const parseRoot = () =>
  JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || "{}");

beforeEach(() => {
  window.localStorage.clear();
  resetSettingsRepositoryForTests();
  resetProviderCredentialPersistenceForTests();
});

afterEach(() => {
  delete window.settingsStorageAPI;
  endProviderCredentialQuitDrain();
  resetSettingsRepositoryForTests();
  resetProviderCredentialPersistenceForTests();
});

describe("readModelProviders / writeModelProviders — fallback characterization", () => {
  test("cold start returns an empty object", () => {
    expect(readModelProviders()).toEqual({});
  });

  test("corrupt settings blob returns an empty object", () => {
    window.localStorage.setItem(SETTINGS_KEY, "{ not json");
    expect(readModelProviders()).toEqual({});
  });

  test("non-object settings root returns an empty object", () => {
    window.localStorage.setItem(SETTINGS_KEY, "42");
    expect(readModelProviders()).toEqual({});
  });

  test("write openai key then read it back (consumer access patterns)", () => {
    writeModelProviders({ openai_api_key: "sk-openai-test" });

    expect(readModelProviders().openai_api_key).toBe("sk-openai-test");
    expect(!!readModelProviders().openai_api_key).toBe(true);
    // physical layout unchanged: key lives under settings.model_providers
    expect(parseRoot().model_providers.openai_api_key).toBe("sk-openai-test");
  });

  test("successive writes merge — other key fields and siblings survive", () => {
    seedRoot({
      appearance: { theme_mode: "dark_mode" },
      model_providers: { openai_api_key: "sk-openai-keep" },
    });

    writeModelProviders({ anthropic_api_key: "sk-ant-new" });

    const stored = readModelProviders();
    expect(stored.openai_api_key).toBe("sk-openai-keep");
    expect(stored.anthropic_api_key).toBe("sk-ant-new");
    // sibling namespace untouched
    expect(parseRoot().appearance).toEqual({ theme_mode: "dark_mode" });
  });

  test("clearing a key writes an empty value — falsy through every consumer", () => {
    writeModelProviders({ openai_api_key: "sk-openai-test" });
    writeModelProviders({ openai_api_key: "" });

    expect(readModelProviders().openai_api_key || "").toBe("");
    expect(!!readModelProviders().openai_api_key).toBe(false);
    expect(parseRoot().model_providers.openai_api_key || "").toBe("");
  });

  test("non-sensitive fields roundtrip alongside secrets", () => {
    writeModelProviders({ openai_api_key: "sk-mixed", pull_hint_dismissed: true });

    const stored = readModelProviders();
    expect(stored.openai_api_key).toBe("sk-mixed");
    expect(stored.pull_hint_dismissed).toBe(true);
    const branch = parseRoot().model_providers;
    expect(branch.openai_api_key).toBe("sk-mixed");
    expect(branch.pull_hint_dismissed).toBe(true);
  });

  test("non-sensitive write preserves existing custom_providers and secrets", () => {
    seedRoot({
      model_providers: {
        openai_api_key: "sk-keep",
        custom_provider_secrets: { "my-prov": "cp-secret" },
        custom_providers: [{ id: "my-prov" }],
      },
    });

    writeModelProviders({ pull_hint_dismissed: true });

    const branch = parseRoot().model_providers;
    expect(branch.openai_api_key).toBe("sk-keep");
    expect(branch.custom_provider_secrets).toEqual({ "my-prov": "cp-secret" });
    expect(branch.custom_providers).toEqual([{ id: "my-prov" }]);
    expect(branch.pull_hint_dismissed).toBe(true);

    const stored = readModelProviders();
    expect(stored.openai_api_key).toBe("sk-keep");
    expect(stored.custom_provider_secrets).toEqual({ "my-prov": "cp-secret" });
  });

  test("secret-only write onto a corrupt root is refused (never clobbers)", () => {
    window.localStorage.setItem(SETTINGS_KEY, "{ not json");
    writeModelProviders({ openai_api_key: "sk-after-corrupt" });
    expect(window.localStorage.getItem(SETTINGS_KEY)).toBe("{ not json");
  });

  test("quit barrier blocks official and custom secrets before lazy legacy writes", async () => {
    seedRoot({
      model_providers: {
        openai_api_key: "sk-before-quit",
        custom_provider_secrets: { slug: "custom-before-quit" },
      },
    });
    await beginProviderCredentialQuitDrain();

    const results = await writeModelProviders({
      openai_api_key: "sk-must-not-land",
      custom_provider_secrets: { slug: "custom-must-not-land" },
    });

    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "openai",
          ok: false,
          status: "not-synced",
          errorCode: "settings_quit_in_progress",
        }),
        expect.objectContaining({
          id: "custom.slug",
          ok: false,
          status: "not-synced",
          errorCode: "settings_quit_in_progress",
        }),
      ]),
    );
    expect(readModelProviders().openai_api_key).toBe("sk-before-quit");
    expect(readModelProviders().custom_provider_secrets).toEqual({
      slug: "custom-before-quit",
    });
    expect(parseRoot().model_providers.openai_api_key).toBe(
      "sk-before-quit",
    );
    expect(parseRoot().model_providers.custom_provider_secrets).toEqual({
      slug: "custom-before-quit",
    });
  });
});

describe("SQL mode — secret split (T5 invariant)", () => {
  const sqlBootstrap = (overrides = {}) => ({
    available: true,
    degraded: false,
    schemaVersion: 1,
    migration: { state: "complete", version: 1, digest: "d", migratedAt: 1 },
    namespaces: {},
    revisions: {},
    ...overrides,
  });

  const installBridge = (overrides = {}) => {
    const bridgeApi = {
      bootstrap: jest.fn(() => sqlBootstrap()),
      migrateLegacy: jest.fn(() =>
        Promise.resolve({ status: "already-complete" }),
      ),
      setNamespace: jest.fn((namespace) =>
        Promise.resolve({ ok: true, namespace, revision: 0, updatedAt: 1 }),
      ),
      deleteNamespace: jest.fn((namespace) =>
        Promise.resolve({ ok: true, namespace, deleted: true }),
      ),
      setProviderCredential: jest.fn((kind, ownerId) =>
        Promise.resolve({ ok: true, status: "stored", kind, ownerId }),
      ),
      deleteProviderCredential: jest.fn((kind, ownerId) =>
        Promise.resolve({ ok: true, deleted: true, kind, ownerId }),
      ),
      ...overrides,
    };
    window.settingsStorageAPI = bridgeApi;
    return bridgeApi;
  };

  test("secrets never reach setNamespace; non-sensitive fields never miss it", async () => {
    const bridgeApi = installBridge();

    writeModelProviders({
      openai_api_key: "sk-secret-openai",
      anthropic_api_key: "sk-secret-ant",
      custom_provider_secrets: { slug: "cp-secret" },
      pull_hint_dismissed: true,
    });
    await flushSettingsWrites();

    expect(bridgeApi.setNamespace).toHaveBeenCalledTimes(1);
    const [namespace, value] = bridgeApi.setNamespace.mock.calls[0];
    expect(namespace).toBe("model_providers");
    expect(value).toEqual({ pull_hint_dismissed: true });
    const serializedCalls = JSON.stringify(bridgeApi.setNamespace.mock.calls);
    expect(serializedCalls).not.toContain("sk-secret-openai");
    expect(serializedCalls).not.toContain("sk-secret-ant");
    expect(serializedCalls).not.toContain("cp-secret");
    expect(serializedCalls).not.toContain("custom_provider_secrets");

    // secrets landed in localStorage via the adapter (Phase 4 boundary)
    const branch = parseRoot().model_providers;
    expect(branch.openai_api_key).toBe("sk-secret-openai");
    expect(branch.anthropic_api_key).toBe("sk-secret-ant");
    expect(branch.custom_provider_secrets).toEqual({ slug: "cp-secret" });
    // non-sensitive field did NOT get dual-written to localStorage (§5.5)
    expect(branch.pull_hint_dismissed).toBeUndefined();
  });

  test("read merges repository namespace with adapter secrets (shape unchanged)", () => {
    seedRoot({ model_providers: { openai_api_key: "sk-local-secret" } });
    installBridge({
      bootstrap: jest.fn(() =>
        sqlBootstrap({
          namespaces: { model_providers: { pull_hint_dismissed: true } },
        }),
      ),
    });

    const stored = readModelProviders();
    expect(stored.pull_hint_dismissed).toBe(true);
    expect(stored.openai_api_key).toBe("sk-local-secret");
    expect(!!stored.anthropic_api_key).toBe(false);
  });

  test("secret-only write performs no repository write at all", async () => {
    const bridgeApi = installBridge();

    writeModelProviders({ openai_api_key: "sk-only-secret" });
    await flushSettingsWrites();

    expect(bridgeApi.setNamespace).not.toHaveBeenCalled();
    expect(parseRoot().model_providers.openai_api_key).toBe("sk-only-secret");
    expect(readModelProviders().openai_api_key).toBe("sk-only-secret");
  });

  test("steady-state rotation updates SQL and survives as the new dual-keep value", async () => {
    seedRoot({ model_providers: { openai_api_key: "sk-A" } });
    const bridgeApi = installBridge({
      bootstrap: jest.fn(() =>
        sqlBootstrap({
          secretStorageStatus: "available",
          configuredCredentials: ["openai"],
        }),
      ),
    });

    const results = await writeModelProviders({ openai_api_key: "sk-B" });
    expect(results).toEqual([
      expect.objectContaining({ ok: true, status: "stored", id: "openai" }),
    ]);
    expect(bridgeApi.setProviderCredential).toHaveBeenCalledWith(
      "provider",
      "openai",
      "sk-B",
    );
    expect(readModelProviders().openai_api_key).toBe("sk-B");
  });

  test("failed SQL rotation rolls legacy back instead of resurrecting a stale key on restart", async () => {
    seedRoot({ model_providers: { openai_api_key: "sk-A" } });
    installBridge({
      bootstrap: jest.fn(() =>
        sqlBootstrap({
          secretStorageStatus: "available",
          configuredCredentials: ["openai"],
        }),
      ),
      setProviderCredential: jest.fn(() =>
        Promise.reject(
          new Error(
            "Error invoking remote method: [storage_io_error] disk full",
          ),
        ),
      ),
    });

    const results = await writeModelProviders({ openai_api_key: "sk-B" });
    expect(results[0]).toMatchObject({
      ok: false,
      status: "not-synced",
      errorCode: "storage_io_error",
    });
    expect(readModelProviders().openai_api_key).toBe("sk-A");
  });

  test("clear deletes SQL authority; failed delete restores the legacy key", async () => {
    seedRoot({ model_providers: { openai_api_key: "sk-A" } });
    const bridgeApi = installBridge({
      bootstrap: jest.fn(() =>
        sqlBootstrap({
          secretStorageStatus: "available",
          configuredCredentials: ["openai"],
        }),
      ),
    });
    await writeModelProviders({ openai_api_key: "" });
    expect(bridgeApi.deleteProviderCredential).toHaveBeenCalledWith(
      "provider",
      "openai",
    );
    expect(readModelProviders().openai_api_key || "").toBe("");

    seedRoot({ model_providers: { openai_api_key: "sk-restored" } });
    resetSettingsRepositoryForTests();
    installBridge({
      bootstrap: jest.fn(() =>
        sqlBootstrap({
          secretStorageStatus: "available",
          configuredCredentials: ["openai"],
        }),
      ),
      deleteProviderCredential: jest.fn(() =>
        Promise.reject(
          new Error(
            "Error invoking remote method: [storage_io_error] disk full",
          ),
        ),
      ),
    });
    const results = await writeModelProviders({ openai_api_key: "" });
    expect(results[0].ok).toBe(false);
    expect(readModelProviders().openai_api_key).toBe("sk-restored");
  });

  test("rapid same-identity writes: first failure then success keeps the newest legacy value", async () => {
    seedRoot({ model_providers: { openai_api_key: "sk-A" } });
    const setProviderCredential = jest
      .fn()
      .mockRejectedValueOnce(
        new Error("Error invoking remote method: [storage_io_error] first"),
      )
      .mockResolvedValueOnce({ ok: true, status: "stored" });
    installBridge({
      bootstrap: jest.fn(() =>
        sqlBootstrap({
          secretStorageStatus: "available",
          configuredCredentials: ["openai"],
        }),
      ),
      setProviderCredential,
    });

    const first = writeModelProviders({ openai_api_key: "sk-B" });
    const second = writeModelProviders({ openai_api_key: "sk-C" });
    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult[0].ok).toBe(false);
    expect(secondResult[0].ok).toBe(true);
    expect(readModelProviders().openai_api_key).toBe("sk-C");
    expect(setProviderCredential.mock.calls.map((call) => call[2])).toEqual([
      "sk-B",
      "sk-C",
    ]);
  });

  test("rapid same-identity double failure restores the confirmed legacy baseline", async () => {
    seedRoot({ model_providers: { openai_api_key: "sk-A" } });
    installBridge({
      bootstrap: jest.fn(() =>
        sqlBootstrap({
          secretStorageStatus: "available",
          configuredCredentials: ["openai"],
        }),
      ),
      setProviderCredential: jest.fn(() =>
        Promise.reject(
          new Error("Error invoking remote method: [storage_io_error] failed"),
        ),
      ),
    });

    const first = writeModelProviders({ openai_api_key: "sk-B" });
    const second = writeModelProviders({ openai_api_key: "sk-C" });
    const results = await Promise.all([first, second]);
    expect(results[0][0].ok).toBe(false);
    expect(results[1][0].ok).toBe(false);
    expect(readModelProviders().openai_api_key).toBe("sk-A");
  });
});

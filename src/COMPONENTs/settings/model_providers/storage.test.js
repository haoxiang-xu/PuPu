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

const SETTINGS_KEY = "settings";

const seedRoot = (root) => {
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(root));
};

const parseRoot = () =>
  JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || "{}");

beforeEach(() => {
  window.localStorage.clear();
  resetSettingsRepositoryForTests();
});

afterEach(() => {
  delete window.settingsStorageAPI;
  resetSettingsRepositoryForTests();
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
});

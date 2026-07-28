/**
 * Phase 1B T5 — api.unchain request-assembly storage parity.
 *
 * The provider-key / workspace / memory reads feeding a chat request payload
 * moved from inline localStorage["settings"] parsing to the settings
 * repository (runtime namespace) + settings_secret_adapter (API keys).
 * These tests lock the T5 invariant: for the same logical settings state,
 * fallback (localStorage) mode and SQL mode assemble byte-identical payload
 * options, and the request path stays fully synchronous.
 *
 * Fallback-mode behavior itself is characterized in depth by
 * api.customProvider.test.js / api.memoryProvider.test.js /
 * api.workspaceRoot.test.js (all pre-existing, all passing unchanged).
 */

import { api } from "./api";
import { resetSettingsRepositoryForTests } from "./settings_repository";

const SETTINGS_KEY = "settings";

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
    migrateLegacy: jest.fn(() => Promise.resolve({ status: "already-complete" })),
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

describe("api.unchain.startStreamV2 storage-mode payload parity (T5)", () => {
  const originalUnchainApi = window.unchainAPI;

  const RUNTIME = { workspace_root: "/tmp/pupu-ws" };
  const MEMORY = { enabled: true, embedding_provider: "ollama" };
  const OPENAI_KEY = "sk-openai-parity-test";

  const capturePayload = () => {
    window.unchainAPI = {
      startStream: jest.fn(() => ({ cancel: jest.fn() })),
      startStreamV2: jest.fn(() => ({ cancel: jest.fn() })),
    };
    api.unchain.startStreamV2({
      message: "hi",
      options: { modelId: "openai:gpt-5" },
    });
    expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
    return window.unchainAPI.startStreamV2.mock.calls[0][0];
  };

  beforeEach(() => {
    window.localStorage.clear();
    resetSettingsRepositoryForTests();
  });

  afterEach(() => {
    delete window.settingsStorageAPI;
    resetSettingsRepositoryForTests();
    window.localStorage.clear();
    jest.clearAllMocks();
  });

  afterAll(() => {
    window.unchainAPI = originalUnchainApi;
  });

  test("SQL mode and fallback mode assemble an identical payload", () => {
    // --- fallback: everything in the legacy localStorage root ---
    window.localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        runtime: RUNTIME,
        memory: MEMORY,
        model_providers: { openai_api_key: OPENAI_KEY },
      }),
    );
    const fallbackPayload = capturePayload();

    // sanity: the characterized injections actually happened
    expect(fallbackPayload.options.openai_api_key).toBe(OPENAI_KEY);
    expect(fallbackPayload.options.workspace_root).toBe("/tmp/pupu-ws");
    expect(fallbackPayload.options.memory_enabled).toBe(true);
    expect(fallbackPayload.options.memory_embedding_provider).toBe("ollama");

    // --- SQL: non-sensitive namespaces in the snapshot, secret stays local ---
    window.localStorage.clear();
    resetSettingsRepositoryForTests();
    window.localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ model_providers: { openai_api_key: OPENAI_KEY } }),
    );
    installBridge({
      bootstrap: jest.fn(() =>
        sqlBootstrap({ namespaces: { runtime: RUNTIME, memory: MEMORY } }),
      ),
    });
    const sqlPayload = capturePayload();

    expect(sqlPayload).toEqual(fallbackPayload);
  });

  test("request assembly stays synchronous in SQL mode", () => {
    installBridge({
      bootstrap: jest.fn(() =>
        sqlBootstrap({ namespaces: { runtime: RUNTIME } }),
      ),
    });
    window.localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ model_providers: { openai_api_key: OPENAI_KEY } }),
    );

    // capturePayload asserts startStreamV2 was invoked before this call
    // returns — the payload (key + workspace root included) was assembled
    // without awaiting anything.
    const payload = capturePayload();
    expect(payload.options.openai_api_key).toBe(OPENAI_KEY);
    expect(payload.options.workspaceRoot).toBe("/tmp/pupu-ws");
  });
});

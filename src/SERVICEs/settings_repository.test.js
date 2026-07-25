import {
  readSettingsRoot,
  readNamespace,
  replaceNamespace,
  updateNamespace,
  deleteNamespace,
  subscribeSettings,
  flushSettingsWrites,
  getSettingsPersistenceStatus,
  resetSettingsRepositoryForTests,
  computeSettingsMigrationDigest,
  SETTINGS_MIGRATION_MARKER_KEY,
} from "./settings_repository";

const SETTINGS_KEY = "settings";

// jest-environment-jsdom has no WebCrypto — borrow Node's, which is what the
// real renderer (Chromium) provides.
beforeAll(() => {
  const { webcrypto } = require("crypto");
  if (!globalThis.crypto || !globalThis.crypto.subtle) {
    try {
      Object.defineProperty(globalThis, "crypto", {
        value: webcrypto,
        configurable: true,
      });
    } catch (_error) {
      Object.defineProperty(globalThis.crypto, "subtle", {
        value: webcrypto.subtle,
        configurable: true,
      });
    }
  }
});

const tick = async (count = 3) => {
  for (let i = 0; i < count; i += 1) {
    await Promise.resolve();
  }
};

// Real-timer polling: the migration op awaits crypto.subtle.digest, which
// resolves on its own schedule — fixed microtask counts are not enough.
const waitFor = async (predicate, timeoutMs = 2000) => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("waitFor: condition not met in time");
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const sqlBootstrap = (overrides = {}) => ({
  available: true,
  degraded: false,
  schemaVersion: 1,
  migration: {
    state: "not_started",
    version: null,
    digest: null,
    migratedAt: null,
  },
  namespaces: {},
  revisions: {},
  ...overrides,
});

const installBridge = (overrides = {}) => {
  const api = {
    bootstrap: jest.fn(() => sqlBootstrap()),
    migrateLegacy: jest.fn(() =>
      Promise.resolve({ status: "complete", digest: "digest-abc", migratedAt: 123 }),
    ),
    setNamespace: jest.fn((namespace) =>
      Promise.resolve({ ok: true, namespace, revision: 0, updatedAt: 1 }),
    ),
    deleteNamespace: jest.fn((namespace) =>
      Promise.resolve({ ok: true, namespace, deleted: true }),
    ),
    ...overrides,
  };
  window.settingsStorageAPI = api;
  return api;
};

const seedRoot = (root) => {
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(root));
};

const parseRoot = () =>
  JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || "{}");

let warnSpy;

beforeEach(() => {
  window.localStorage.clear();
  resetSettingsRepositoryForTests();
  warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  delete window.settingsStorageAPI;
  resetSettingsRepositoryForTests();
  warnSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// fallback mode (no bridge = browser dev / Jest)
// ---------------------------------------------------------------------------

describe("fallback mode (bridge missing)", () => {
  test("reads localStorage synchronously — direct edits stay visible", () => {
    seedRoot({ ui: { side_menu_open: true } });
    expect(readNamespace("ui", null)).toEqual({ side_menu_open: true });
    // no snapshot: later out-of-band writes are picked up immediately
    seedRoot({ ui: { side_menu_open: false } });
    expect(readNamespace("ui", null)).toEqual({ side_menu_open: false });
  });

  test("readNamespace falls back for missing keys; corrupt root reads as empty", () => {
    expect(readNamespace("memory", { enabled: true })).toEqual({
      enabled: true,
    });
    window.localStorage.setItem(SETTINGS_KEY, "{corrupt");
    expect(readSettingsRoot()).toEqual({});
    expect(readNamespace("ui", "fallback")).toBe("fallback");
  });

  test("replaceNamespace persists synchronously and preserves other namespaces", async () => {
    seedRoot({ ui: { side_menu_open: true } });
    const result = await replaceNamespace("appearance", {
      theme_mode: "dark_mode",
    });
    expect(result.ok).toBe(true);
    const root = parseRoot();
    expect(root.appearance).toEqual({ theme_mode: "dark_mode" });
    expect(root.ui).toEqual({ side_menu_open: true });
    // synchronous visibility without awaiting anything else
    expect(readNamespace("appearance", null)).toEqual({
      theme_mode: "dark_mode",
    });
  });

  test("updateNamespace does a local read-modify-write with a detached base", async () => {
    seedRoot({ memory: { enabled: true, last_n_turns: 8 } });
    await updateNamespace("memory", (current) => ({
      ...current,
      last_n_turns: 12,
    }));
    expect(parseRoot().memory).toEqual({ enabled: true, last_n_turns: 12 });
    // missing namespace: updater receives undefined
    await updateNamespace("dev", (current) => {
      expect(current).toBeUndefined();
      return { chrome_terminal_enabled: false };
    });
    expect(parseRoot().dev).toEqual({ chrome_terminal_enabled: false });
  });

  test("deleteNamespace removes the key", async () => {
    seedRoot({ ui: { side_menu_open: true }, dev: {} });
    const result = await deleteNamespace("dev");
    expect(result.deleted).toBe(true);
    expect(parseRoot()).toEqual({ ui: { side_menu_open: true } });
  });

  test("subscribers are notified with { namespace }; unsubscribe works", async () => {
    const listener = jest.fn();
    const unsubscribe = subscribeSettings(listener);
    await replaceNamespace("ui", { side_menu_open: false });
    expect(listener).toHaveBeenCalledWith({ namespace: "ui" });
    unsubscribe();
    await replaceNamespace("ui", { side_menu_open: true });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("status reports localStorage mode, not degraded", async () => {
    expect(getSettingsPersistenceStatus()).toEqual({
      mode: "localStorage",
      degraded: false,
      pendingWrites: 0,
      lastErrorCode: null,
      warnings: [],
    });
    await flushSettingsWrites(); // trivially resolves
  });

  test("undefined values are rejected with invalid_value", async () => {
    await expect(replaceNamespace("ui", undefined)).rejects.toThrow(
      /^\[invalid_value\]/,
    );
  });

  test('"__proto__" namespace is rejected', async () => {
    await expect(replaceNamespace("__proto__", {})).rejects.toThrow(
      /^\[invalid_namespace\]/,
    );
    await expect(deleteNamespace("__proto__")).rejects.toThrow(
      /^\[invalid_namespace\]/,
    );
  });

  test("throwSyncWriteErrors: a fallback write failure throws synchronously (legacy setItem contract)", () => {
    const spy = jest
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });
    try {
      expect(() =>
        replaceNamespace(
          "ui",
          { side_menu_open: true },
          { throwSyncWriteErrors: true },
        ),
      ).toThrow(/localstorage_write_failed/);
      expect(getSettingsPersistenceStatus().lastErrorCode).toBe(
        "localstorage_write_failed",
      );
    } finally {
      spy.mockRestore();
    }
  });

  test("without throwSyncWriteErrors the same failure stays an async rejection", async () => {
    const spy = jest
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });
    let promise;
    try {
      promise = replaceNamespace("ui", { side_menu_open: true });
    } finally {
      spy.mockRestore();
    }
    await expect(promise).rejects.toThrow(/localstorage_write_failed/);
  });
});

describe("fallback mode — secret boundary", () => {
  const secretRoot = () => ({
    appearance: { theme_mode: "dark_mode" },
    model_providers: {
      openai_api_key: "sk-openai",
      anthropic_api_key: "sk-anthropic",
      custom_provider_secrets: { p: { api_key: "sk-c" } },
      custom_providers: [{ id: "p" }],
    },
  });

  test("reads never expose the three secret fields", () => {
    seedRoot(secretRoot());
    expect(readNamespace("model_providers", null)).toEqual({
      custom_providers: [{ id: "p" }],
    });
    expect(readSettingsRoot().model_providers).toEqual({
      custom_providers: [{ id: "p" }],
    });
  });

  test("writes preserve stored secrets and ignore injected ones", async () => {
    seedRoot(secretRoot());
    await replaceNamespace("model_providers", {
      custom_providers: [{ id: "q" }],
      openai_api_key: "sk-injected",
    });
    const providers = parseRoot().model_providers;
    expect(providers.custom_providers).toEqual([{ id: "q" }]);
    expect(providers.openai_api_key).toBe("sk-openai");
    expect(providers.anthropic_api_key).toBe("sk-anthropic");
    expect(providers.custom_provider_secrets).toEqual({
      p: { api_key: "sk-c" },
    });
  });

  test("deleteNamespace keeps a residual object holding only the secrets", async () => {
    seedRoot(secretRoot());
    await deleteNamespace("model_providers");
    const providers = parseRoot().model_providers;
    expect(providers).toEqual({
      openai_api_key: "sk-openai",
      anthropic_api_key: "sk-anthropic",
      custom_provider_secrets: { p: { api_key: "sk-c" } },
    });
    // repository-visible view is empty (stripped residual)
    expect(readNamespace("model_providers", "absent")).toEqual({});
  });

  test("replaceNamespace with a non-object model_providers value is rejected — secrets survive", async () => {
    seedRoot(secretRoot());
    await expect(replaceNamespace("model_providers", null)).rejects.toThrow(
      /^\[invalid_value\]/,
    );
    await expect(
      replaceNamespace("model_providers", [{ id: "q" }]),
    ).rejects.toThrow(/^\[invalid_value\]/);
    await expect(replaceNamespace("model_providers", "junk")).rejects.toThrow(
      /^\[invalid_value\]/,
    );
    // nothing was written: adapter-owned secrets and siblings are untouched
    const providers = parseRoot().model_providers;
    expect(providers.openai_api_key).toBe("sk-openai");
    expect(providers.anthropic_api_key).toBe("sk-anthropic");
    expect(providers.custom_provider_secrets).toEqual({
      p: { api_key: "sk-c" },
    });
    expect(providers.custom_providers).toEqual([{ id: "p" }]);
  });
});

// ---------------------------------------------------------------------------
// SQL authority mode (bootstrap has data / migration complete)
// ---------------------------------------------------------------------------

describe("SQL authority mode", () => {
  test("non-empty bootstrap: SQL wins, legacy localStorage is ignored", async () => {
    seedRoot({ appearance: { theme_mode: "light_mode" } });
    const api = installBridge({
      bootstrap: jest.fn(() =>
        sqlBootstrap({
          migration: { state: "complete", version: 1, digest: "d", migratedAt: 1 },
          namespaces: { appearance: { theme_mode: "dark_mode" } },
          revisions: { appearance: 3 },
        }),
      ),
    });
    expect(readNamespace("appearance", null)).toEqual({
      theme_mode: "dark_mode",
    });
    await flushSettingsWrites();
    expect(api.migrateLegacy).not.toHaveBeenCalled();
    expect(getSettingsPersistenceStatus().mode).toBe("sql");
  });

  test("migration complete with empty namespaces is still SQL authority", async () => {
    seedRoot({ ui: { side_menu_open: true } });
    const api = installBridge({
      bootstrap: jest.fn(() =>
        sqlBootstrap({
          migration: { state: "complete", version: 1, digest: "d", migratedAt: 1 },
        }),
      ),
    });
    expect(readNamespace("ui", "fallback")).toBe("fallback");
    await flushSettingsWrites();
    expect(api.migrateLegacy).not.toHaveBeenCalled();
  });

  test("optimistic write: visible immediately, persisted via IPC, localStorage untouched", async () => {
    const legacyRaw = JSON.stringify({ ui: { side_menu_open: true } });
    window.localStorage.setItem(SETTINGS_KEY, legacyRaw);
    const api = installBridge({
      bootstrap: jest.fn(() =>
        sqlBootstrap({
          migration: { state: "complete", version: 1, digest: "d", migratedAt: 1 },
          namespaces: { ui: { side_menu_open: true } },
          revisions: { ui: 0 },
        }),
      ),
    });
    const promise = replaceNamespace("ui", { side_menu_open: false });
    expect(readNamespace("ui", null)).toEqual({ side_menu_open: false });
    const ack = await promise;
    expect(ack.ok).toBe(true);
    expect(api.setNamespace).toHaveBeenCalledTimes(1);
    expect(api.setNamespace.mock.calls[0][0]).toBe("ui");
    expect(api.setNamespace.mock.calls[0][1]).toEqual({
      side_menu_open: false,
    });
    // §5.5: no dual writes — legacy blob byte-identical
    expect(window.localStorage.getItem(SETTINGS_KEY)).toBe(legacyRaw);
  });

  test("persistence failure rolls back the namespace and notifies", async () => {
    installBridge({
      bootstrap: jest.fn(() =>
        sqlBootstrap({
          migration: { state: "complete", version: 1, digest: "d", migratedAt: 1 },
          namespaces: { ui: { side_menu_open: true } },
          revisions: { ui: 0 },
        }),
      ),
      setNamespace: jest.fn(() =>
        Promise.reject(new Error("[value_too_large] too big")),
      ),
    });
    const listener = jest.fn();
    readNamespace("ui", null); // init
    subscribeSettings(listener);

    const promise = replaceNamespace("ui", { side_menu_open: false });
    expect(readNamespace("ui", null)).toEqual({ side_menu_open: false });
    await expect(promise).rejects.toThrow(/^\[value_too_large\]/);
    // rolled back to the pre-mutation value
    expect(readNamespace("ui", null)).toEqual({ side_menu_open: true });
    // optimistic notification + rollback notification
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenNthCalledWith(1, { namespace: "ui" });
    expect(listener).toHaveBeenNthCalledWith(2, { namespace: "ui" });
    const status = getSettingsPersistenceStatus();
    expect(status.lastErrorCode).toBe("value_too_large");
    expect(status.mode).toBe("sql"); // post-migration write failures do not degrade
    expect(status.pendingWrites).toBe(0);
  });

  test("failed write does not clobber a newer optimistic value", async () => {
    const first = deferred();
    const api = installBridge({
      bootstrap: jest.fn(() =>
        sqlBootstrap({
          migration: { state: "complete", version: 1, digest: "d", migratedAt: 1 },
          namespaces: { ui: { v: 0 } },
          revisions: { ui: 0 },
        }),
      ),
      setNamespace: jest
        .fn()
        .mockImplementationOnce(() => first.promise)
        .mockImplementation((namespace) =>
          Promise.resolve({ ok: true, namespace, revision: 2, updatedAt: 2 }),
        ),
    });
    readNamespace("ui", null); // init
    const p1 = replaceNamespace("ui", { v: 1 });
    const p2 = replaceNamespace("ui", { v: 2 });
    await tick();
    // first IPC in flight; second queued behind it
    expect(api.setNamespace).toHaveBeenCalledTimes(1);
    first.reject(new Error("[revision_conflict] conflict"));
    await expect(p1).rejects.toThrow(/^\[revision_conflict\]/);
    // the newer optimistic value survives the older mutation's rollback
    expect(readNamespace("ui", null)).toEqual({ v: 2 });
    await p2;
    expect(api.setNamespace).toHaveBeenCalledTimes(2);
    expect(api.setNamespace.mock.calls[1][1]).toEqual({ v: 2 });
    expect(readNamespace("ui", null)).toEqual({ v: 2 });
  });

  test("same-namespace writes stay FIFO through the queue", async () => {
    const gates = [deferred(), deferred()];
    let call = 0;
    const api = installBridge({
      bootstrap: jest.fn(() =>
        sqlBootstrap({
          migration: { state: "complete", version: 1, digest: "d", migratedAt: 1 },
          namespaces: {},
          revisions: {},
        }),
      ),
      setNamespace: jest.fn(() => {
        const gate = gates[call];
        call += 1;
        return gate.promise;
      }),
    });
    readNamespace("ui", null); // init
    const p1 = replaceNamespace("ui", { v: 1 });
    const p2 = replaceNamespace("ui", { v: 2 });
    await tick();
    expect(api.setNamespace).toHaveBeenCalledTimes(1);
    expect(api.setNamespace.mock.calls[0][1]).toEqual({ v: 1 });
    gates[0].resolve({ ok: true, namespace: "ui", revision: 0, updatedAt: 1 });
    await tick();
    expect(api.setNamespace).toHaveBeenCalledTimes(2);
    expect(api.setNamespace.mock.calls[1][1]).toEqual({ v: 2 });
    gates[1].resolve({ ok: true, namespace: "ui", revision: 1, updatedAt: 2 });
    await Promise.all([p1, p2]);
    expect(readNamespace("ui", null)).toEqual({ v: 2 });
    expect(getSettingsPersistenceStatus().pendingWrites).toBe(0);
  });

  test("delete is optimistic and restores on failure", async () => {
    installBridge({
      bootstrap: jest.fn(() =>
        sqlBootstrap({
          migration: { state: "complete", version: 1, digest: "d", migratedAt: 1 },
          namespaces: { dev: { chrome_terminal_enabled: true } },
          revisions: { dev: 0 },
        }),
      ),
      deleteNamespace: jest.fn(() =>
        Promise.reject(new Error("[settings_storage_unavailable] gone")),
      ),
    });
    readNamespace("dev", null); // init
    const promise = deleteNamespace("dev");
    expect(readNamespace("dev", "absent")).toBe("absent");
    await expect(promise).rejects.toThrow(/^\[settings_storage_unavailable\]/);
    expect(readNamespace("dev", null)).toEqual({
      chrome_terminal_enabled: true,
    });
  });

  test("model_providers writes are secret-stripped before IPC", async () => {
    const api = installBridge({
      bootstrap: jest.fn(() =>
        sqlBootstrap({
          migration: { state: "complete", version: 1, digest: "d", migratedAt: 1 },
          namespaces: { model_providers: { custom_providers: [] } },
          revisions: { model_providers: 0 },
        }),
      ),
    });
    await replaceNamespace("model_providers", {
      custom_providers: [{ id: "p" }],
      openai_api_key: "sk-should-never-cross",
    });
    expect(api.setNamespace.mock.calls[0][1]).toEqual({
      custom_providers: [{ id: "p" }],
    });
    expect(readNamespace("model_providers", null)).toEqual({
      custom_providers: [{ id: "p" }],
    });
  });

  test("non-object model_providers write is rejected before touching snapshot or IPC", async () => {
    const api = installBridge({
      bootstrap: jest.fn(() =>
        sqlBootstrap({
          migration: { state: "complete", version: 1, digest: "d", migratedAt: 1 },
          namespaces: { model_providers: { custom_providers: [] } },
          revisions: { model_providers: 0 },
        }),
      ),
    });
    await expect(
      replaceNamespace("model_providers", [
        { openai_api_key: "sk-smuggled-in-array" },
      ]),
    ).rejects.toThrow(/^\[invalid_value\]/);
    expect(readNamespace("model_providers", null)).toEqual({
      custom_providers: [],
    });
    expect(api.setNamespace).not.toHaveBeenCalled();
  });

  test("readSettingsRoot returns a copy — callers cannot graft namespaces onto the snapshot", () => {
    installBridge({
      bootstrap: jest.fn(() =>
        sqlBootstrap({
          migration: { state: "complete", version: 1, digest: "d", migratedAt: 1 },
          namespaces: { ui: { side_menu_open: true } },
          revisions: { ui: 0 },
        }),
      ),
    });
    const root = readSettingsRoot();
    expect(root).toEqual({ ui: { side_menu_open: true } });
    root.injected = { evil: true };
    expect(readNamespace("injected", "absent")).toBe("absent");
  });

  test("updateNamespace hands the updater a detached clone of the snapshot value", async () => {
    installBridge({
      bootstrap: jest.fn(() =>
        sqlBootstrap({
          migration: { state: "complete", version: 1, digest: "d", migratedAt: 1 },
          namespaces: { memory: { enabled: true, last_n_turns: 8 } },
          revisions: { memory: 0 },
        }),
      ),
    });
    await updateNamespace("memory", (current) => {
      current.last_n_turns = 12; // safe: detached clone
      return current;
    });
    expect(readNamespace("memory", null)).toEqual({
      enabled: true,
      last_n_turns: 12,
    });
  });
});

// ---------------------------------------------------------------------------
// empty database: legacy seed + queued migration
// ---------------------------------------------------------------------------

describe("empty DB first boot — legacy seed and migration", () => {
  const seedLegacyWithHazards = () => {
    // raw string so "__proto__" lands as an own key (JSON.parse semantics)
    window.localStorage.setItem(
      SETTINGS_KEY,
      '{"ui":{"side_menu_open":true},' +
        '"model_providers":{"openai_api_key":"sk-secret","custom_providers":["x"]},' +
        '"Bad Key!":{"junk":1},' +
        '"__proto__":{"polluted":true}}',
    );
  };

  test("snapshot seeds from legacy, quarantines illegal keys, strips secrets", async () => {
    seedLegacyWithHazards();
    const api = installBridge();
    expect(readNamespace("ui", null)).toEqual({ side_menu_open: true });
    expect(readNamespace("model_providers", null)).toEqual({
      custom_providers: ["x"],
    });
    expect(readNamespace("Bad Key!", "absent")).toBe("absent");

    await flushSettingsWrites();
    expect(api.migrateLegacy).toHaveBeenCalledTimes(1);
    const payload = api.migrateLegacy.mock.calls[0][0];
    expect(payload.migrationVersion).toBe(1);
    expect(payload.standalone).toEqual({});
    expect(Object.keys(payload.settingsRoot).sort()).toEqual([
      "model_providers",
      "ui",
    ]);
    expect(payload.settingsRoot.model_providers).toEqual({
      custom_providers: ["x"],
    });
    expect(payload.digest).toMatch(/^[0-9a-f]{64}$/);
    // self-consistent: the digest field is excluded from its own hash
    expect(await computeSettingsMigrationDigest(payload)).toBe(payload.digest);

    const warnings = getSettingsPersistenceStatus().warnings;
    const quarantined = warnings
      .filter((warning) => warning.code === "legacy_key_quarantined")
      .map((warning) => warning.key)
      .sort();
    expect(quarantined).toEqual(["Bad Key!", "__proto__"]);
  });

  test('"complete" writes the migration marker from the ack', async () => {
    seedRoot({ ui: { side_menu_open: true } });
    installBridge();
    readNamespace("ui", null); // init
    await flushSettingsWrites();
    const marker = JSON.parse(
      window.localStorage.getItem(SETTINGS_MIGRATION_MARKER_KEY),
    );
    expect(marker).toEqual({ digest: "digest-abc", completedAt: 123 });
  });

  test('"already-complete" also writes the marker (idempotent replay)', async () => {
    seedRoot({ ui: { side_menu_open: true } });
    installBridge({
      migrateLegacy: jest.fn(() =>
        Promise.resolve({
          status: "already-complete",
          alreadyComplete: true,
          digestMatched: true,
          digest: "digest-prev",
        }),
      ),
    });
    readNamespace("ui", null); // init
    await flushSettingsWrites();
    const marker = JSON.parse(
      window.localStorage.getItem(SETTINGS_MIGRATION_MARKER_KEY),
    );
    expect(marker.digest).toBe("digest-prev");
    expect(typeof marker.completedAt).toBe("number");
  });

  test('"refused-stale-digest" rebuilds from SQL and never writes the marker', async () => {
    seedRoot({ appearance: { theme_mode: "light_mode" } });
    const api = installBridge({
      bootstrap: jest
        .fn()
        .mockReturnValueOnce(sqlBootstrap()) // first boot: empty, not started
        .mockReturnValue(
          sqlBootstrap({
            migration: {
              state: "complete",
              version: 1,
              digest: "newer",
              migratedAt: 9,
            },
            namespaces: { appearance: { theme_mode: "dark_mode" } },
            revisions: { appearance: 5 },
          }),
        ),
      migrateLegacy: jest.fn(() =>
        Promise.resolve({
          status: "refused-stale-digest",
          alreadyComplete: true,
          digestMatched: false,
          digest: "stale",
        }),
      ),
    });
    const listener = jest.fn();
    expect(readNamespace("appearance", null)).toEqual({
      theme_mode: "light_mode",
    }); // legacy-seeded snapshot
    subscribeSettings(listener);

    await flushSettingsWrites();
    expect(api.bootstrap).toHaveBeenCalledTimes(2);
    // snapshot rebuilt from authoritative SQL
    expect(readNamespace("appearance", null)).toEqual({
      theme_mode: "dark_mode",
    });
    expect(
      window.localStorage.getItem(SETTINGS_MIGRATION_MARKER_KEY),
    ).toBeNull();
    expect(listener).toHaveBeenCalledWith({ namespace: "appearance" });
    expect(
      getSettingsPersistenceStatus().warnings.some(
        (warning) => warning.code === "migration_refused_stale_digest",
      ),
    ).toBe(true);
    expect(getSettingsPersistenceStatus().mode).toBe("sql");
  });

  test("tampered non-object model_providers is quarantined to {} — secrets reach neither payload nor snapshot", async () => {
    window.localStorage.setItem(
      SETTINGS_KEY,
      '{"ui":{"side_menu_open":true},' +
        '"model_providers":[{"openai_api_key":"sk-leak-array"}]}',
    );
    const api = installBridge();
    // snapshot side: the unusable branch is replaced with an empty object
    expect(readNamespace("model_providers", null)).toEqual({});
    expect(readSettingsRoot().model_providers).toEqual({});

    await flushSettingsWrites();
    // payload side: nothing of the tampered branch crosses the IPC boundary
    const payload = api.migrateLegacy.mock.calls[0][0];
    expect(payload.settingsRoot.model_providers).toEqual({});
    expect(JSON.stringify(payload)).not.toContain("sk-leak-array");
    expect(JSON.stringify(payload)).not.toContain("openai_api_key");
    expect(
      getSettingsPersistenceStatus().warnings.some(
        (warning) => warning.code === "legacy_model_providers_invalid",
      ),
    ).toBe(true);
    // the original localStorage blob itself is left untouched
    expect(parseRoot().model_providers).toEqual([
      { openai_api_key: "sk-leak-array" },
    ]);
  });

  test("migration resolving with an unknown status degrades exactly like a rejection", async () => {
    seedRoot({ ui: { side_menu_open: true }, memory: { enabled: true } });
    const api = installBridge({
      migrateLegacy: jest.fn(() => Promise.resolve({ status: "partial" })),
    });
    readNamespace("ui", null); // init
    await flushSettingsWrites();

    const status = getSettingsPersistenceStatus();
    expect(status.mode).toBe("localStorage");
    expect(status.degraded).toBe(true);
    expect(status.lastErrorCode).toBe("migration_unknown_status");
    expect(
      status.warnings.some(
        (warning) => warning.code === "migration_unknown_status",
      ),
    ).toBe(true);
    expect(
      window.localStorage.getItem(SETTINGS_MIGRATION_MARKER_KEY),
    ).toBeNull();
    // localStorage stays authoritative: later writes land there, never in SQL
    await replaceNamespace("ui", { side_menu_open: false });
    expect(parseRoot().ui).toEqual({ side_menu_open: false });
    expect(parseRoot().memory).toEqual({ enabled: true });
    expect(api.setNamespace).not.toHaveBeenCalled();
  });

  test("migration rejection degrades to localStorage authority for the session", async () => {
    seedLegacyWithHazards();
    installBridge({
      migrateLegacy: jest.fn(() =>
        Promise.reject(new Error("[digest_mismatch] nope")),
      ),
    });
    readNamespace("ui", null); // init
    await flushSettingsWrites();

    const status = getSettingsPersistenceStatus();
    expect(status.mode).toBe("localStorage");
    expect(status.degraded).toBe(true);
    expect(status.lastErrorCode).toBe("digest_mismatch");
    expect(
      status.warnings.some((warning) => warning.code === "migration_failed"),
    ).toBe(true);
    // localStorage is authoritative again — even quarantined keys are visible
    expect(readNamespace("Bad Key!", null)).toEqual({ junk: 1 });
    expect(
      window.localStorage.getItem(SETTINGS_MIGRATION_MARKER_KEY),
    ).toBeNull();
  });

  test("settings_storage_unavailable rejection degrades the same way", async () => {
    seedRoot({ ui: { side_menu_open: true } });
    installBridge({
      migrateLegacy: jest.fn(() =>
        Promise.reject(new Error("[settings_storage_unavailable] gone")),
      ),
    });
    readNamespace("ui", null); // init
    await flushSettingsWrites();
    const status = getSettingsPersistenceStatus();
    expect(status.mode).toBe("localStorage");
    expect(status.degraded).toBe(true);
    expect(status.lastErrorCode).toBe("settings_storage_unavailable");
  });

  test("mutations queue strictly behind the in-flight migration", async () => {
    seedRoot({ ui: { side_menu_open: true } });
    const gate = deferred();
    const api = installBridge({
      migrateLegacy: jest.fn(() => gate.promise),
    });
    readNamespace("ui", null); // init queues the migration
    const writePromise = replaceNamespace("ui", { side_menu_open: false });
    // optimistic value visible while everything is still queued
    expect(readNamespace("ui", null)).toEqual({ side_menu_open: false });
    await waitFor(() => api.migrateLegacy.mock.calls.length === 1);
    expect(api.setNamespace).not.toHaveBeenCalled();
    gate.resolve({ status: "complete", digest: "d", migratedAt: 5 });
    await writePromise;
    expect(api.setNamespace).toHaveBeenCalledTimes(1);
    expect(api.setNamespace.mock.calls[0][0]).toBe("ui");
    expect(api.setNamespace.mock.calls[0][1]).toEqual({
      side_menu_open: false,
    });
  });

  test("mutation queued behind a failing migration lands in localStorage instead", async () => {
    seedRoot({ ui: { side_menu_open: true } });
    const gate = deferred();
    const api = installBridge({
      migrateLegacy: jest.fn(() => gate.promise),
    });
    readNamespace("ui", null); // init
    const writePromise = replaceNamespace("ui", { side_menu_open: false });
    // reject only after the repository has taken hold of the promise —
    // otherwise the pre-rejection is flagged as an unhandled rejection
    await waitFor(() => api.migrateLegacy.mock.calls.length === 1);
    gate.reject(new Error("[payload_too_large] no"));
    const result = await writePromise;
    expect(result.ok).toBe(true);
    expect(api.setNamespace).not.toHaveBeenCalled();
    // honored against the now-authoritative localStorage backend
    expect(parseRoot().ui).toEqual({ side_menu_open: false });
    expect(getSettingsPersistenceStatus().mode).toBe("localStorage");
  });
});

// ---------------------------------------------------------------------------
// degraded bootstrap
// ---------------------------------------------------------------------------

describe("degraded bootstrap", () => {
  test("available:false snapshot → localStorage fallback flagged degraded", async () => {
    seedRoot({ ui: { side_menu_open: true } });
    const api = installBridge({
      bootstrap: jest.fn(() => ({
        available: false,
        degraded: true,
        reason: "open-failed",
      })),
    });
    expect(readNamespace("ui", null)).toEqual({ side_menu_open: true });
    const status = getSettingsPersistenceStatus();
    expect(status.mode).toBe("localStorage");
    expect(status.degraded).toBe(true);
    expect(status.lastErrorCode).toBe("settings_storage_unavailable");
    await replaceNamespace("ui", { side_menu_open: false });
    expect(parseRoot().ui).toEqual({ side_menu_open: false });
    expect(api.migrateLegacy).not.toHaveBeenCalled();
    expect(api.setNamespace).not.toHaveBeenCalled();
  });

  test("throwing bootstrap degrades identically", () => {
    installBridge({
      bootstrap: jest.fn(() => {
        throw new Error("sendSync exploded");
      }),
    });
    const status = getSettingsPersistenceStatus();
    expect(status.mode).toBe("localStorage");
    expect(status.degraded).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// digest: cross-implementation lockstep with the main process
// ---------------------------------------------------------------------------

describe("migration digest — renderer vs main process", () => {
  const {
    computeLegacyMigrationDigest,
  } = require("../../electron/main/services/settings_storage/service");

  const payload = {
    migrationVersion: 1,
    settingsRoot: {
      appearance: {
        theme_mode: "dark_mode",
        nested: { b: 2, a: [1, { y: 2, x: 1 }, null, true] },
      },
      "ns.with-mixed_chars": { text: '中文 🙂 quotes"\\backslash', n: 1.5 },
      empty: {},
    },
    standalone: {},
  };

  test("both implementations produce the same sha256 hex", async () => {
    expect(await computeSettingsMigrationDigest(payload)).toBe(
      computeLegacyMigrationDigest(payload),
    );
  });

  test("a claimed digest field never feeds its own hash — on either side", async () => {
    const withDigest = { ...payload, digest: "junk-claim" };
    expect(await computeSettingsMigrationDigest(withDigest)).toBe(
      computeLegacyMigrationDigest(withDigest),
    );
    expect(await computeSettingsMigrationDigest(withDigest)).toBe(
      await computeSettingsMigrationDigest(payload),
    );
  });

  test("digest is key-order independent (canonical recursive sort)", async () => {
    const reordered = {
      standalone: {},
      settingsRoot: {
        empty: {},
        "ns.with-mixed_chars": { n: 1.5, text: '中文 🙂 quotes"\\backslash' },
        appearance: {
          nested: { a: [1, { x: 1, y: 2 }, null, true], b: 2 },
          theme_mode: "dark_mode",
        },
      },
      migrationVersion: 1,
    };
    expect(await computeSettingsMigrationDigest(reordered)).toBe(
      await computeSettingsMigrationDigest(payload),
    );
    expect(computeLegacyMigrationDigest(reordered)).toBe(
      computeLegacyMigrationDigest(payload),
    );
  });
});

// ---------------------------------------------------------------------------
// quit-time best-effort flush wiring (plan §7.1)
// ---------------------------------------------------------------------------

describe("quit-time flush wiring (beforeunload/pagehide)", () => {
  test("module eval registers beforeunload and pagehide listeners", () => {
    const spy = jest.spyOn(window, "addEventListener");
    try {
      jest.isolateModules(() => {
        require("./settings_repository");
      });
      const events = spy.mock.calls.map((call) => call[0]);
      expect(events).toEqual(
        expect.arrayContaining(["beforeunload", "pagehide"]),
      );
    } finally {
      spy.mockRestore();
    }
  });

  test("beforeunload before any repository use never initializes (no sendSync bootstrap at quit)", () => {
    const api = installBridge();
    window.dispatchEvent(new Event("beforeunload"));
    window.dispatchEvent(new Event("pagehide"));
    expect(api.bootstrap).not.toHaveBeenCalled();
  });

  test("beforeunload with a pending SQL write kicks the queue and drains without re-init", async () => {
    const gate = deferred();
    const api = installBridge({
      bootstrap: jest.fn(() =>
        sqlBootstrap({
          migration: { state: "complete", version: 1, digest: "d", migratedAt: 1 },
          namespaces: { ui: { side_menu_open: true } },
          revisions: { ui: 0 },
        }),
      ),
      setNamespace: jest.fn((namespace) =>
        gate.promise.then(() => ({
          ok: true,
          namespace,
          revision: 1,
          updatedAt: 2,
        })),
      ),
    });
    // Fire-and-forget mutation, exactly how converted stores commit.
    replaceNamespace("ui", { side_menu_open: false }).catch(() => {});
    expect(getSettingsPersistenceStatus().pendingWrites).toBe(1);
    expect(() => {
      window.dispatchEvent(new Event("beforeunload"));
    }).not.toThrow();
    gate.resolve();
    await waitFor(() => getSettingsPersistenceStatus().pendingWrites === 0);
    expect(api.bootstrap).toHaveBeenCalledTimes(1);
    expect(api.setNamespace).toHaveBeenCalledTimes(1);
  });
});

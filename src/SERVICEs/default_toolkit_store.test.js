import {
  getDefaultToolkitSelection,
  removeInvalidToolkitIds,
  setDefaultToolkitEnabled,
  isDefaultToolkitsSqlBacked,
  flushDefaultToolkitWrites,
  resetDefaultToolkitStoreForTests,
  DEFAULT_TOOLKITS_MIGRATION_MARKER_KEY,
} from "./default_toolkit_store";

const installToolkitPrefsApi = ({
  scopes = {},
  autoApprove = { toolkits: [], tools: [] },
  storeMigrations,
  overrides = {},
} = {}) => {
  const api = {
    bootstrap: jest.fn(() => ({
      available: true,
      degraded: false,
      schemaVersion: 2,
      migration: { state: "complete" },
      namespaces: {},
      revisions: {},
      toolkitPrefs: {
        defaultToolkits: { scopes },
        toolkitAutoApprove: autoApprove,
      },
      ...(storeMigrations ? { storeMigrations } : {}),
    })),
    migrateLegacy: jest.fn(() => Promise.resolve({ status: "complete" })),
    setNamespace: jest.fn(() => Promise.resolve({ ok: true })),
    deleteNamespace: jest.fn(() => Promise.resolve({ ok: true })),
    readDefaultToolkits: jest.fn(() =>
      Promise.resolve({ ok: true, scopes: {} }),
    ),
    replaceDefaultToolkitsScope: jest.fn((scopeKey, toolkitIds) =>
      Promise.resolve({ ok: true, scopeKey, toolkitIds }),
    ),
    migrateLegacyDefaultToolkits: jest.fn(() =>
      Promise.resolve({ status: "complete", digest: "d1", migratedAt: 1 }),
    ),
    readToolkitAutoApprove: jest.fn(() =>
      Promise.resolve({ ok: true, toolkits: [], tools: [] }),
    ),
    replaceToolkitAutoApprove: jest.fn(() =>
      Promise.resolve({ ok: true, toolkits: [], tools: [] }),
    ),
    migrateLegacyToolkitAutoApprove: jest.fn(() =>
      Promise.resolve({ status: "complete", digest: "d1", migratedAt: 1 }),
    ),
    ...overrides,
  };
  window.settingsStorageAPI = api;
  return api;
};

describe("default_toolkit_store", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetDefaultToolkitStoreForTests();
  });

  test("seeds core for users without an explicit global selection", () => {
    expect(getDefaultToolkitSelection("global")).toEqual(["core"]);

    const stored = JSON.parse(
      window.localStorage.getItem("default_toolkits") || "null",
    );
    expect(stored).toEqual({
      version: 2,
      scopes: {
        global: ["core"],
      },
    });
  });

  test("preserves an explicit empty global selection", () => {
    window.localStorage.setItem(
      "default_toolkits",
      JSON.stringify({
        version: 1,
        scopes: {
          global: [],
        },
      }),
    );

    expect(getDefaultToolkitSelection("global")).toEqual([]);
  });

  test("normalizes legacy builtin toolkit ids to core", () => {
    window.localStorage.setItem(
      "default_toolkits",
      JSON.stringify({
        version: 1,
        scopes: {
          global: [
            "WorkspaceToolkit",
            "CodeToolkit",
            "ask_user_toolkit",
            "GitToolkit",
            "git_toolkit",
          ],
        },
      }),
    );

    expect(getDefaultToolkitSelection("global")).toEqual(["core"]);
  });

  test("updates and prunes canonical toolkit ids", () => {
    setDefaultToolkitEnabled("global", "WorkspaceToolkit", true);
    setDefaultToolkitEnabled("global", "code", true);

    expect(getDefaultToolkitSelection("global")).toEqual(["core"]);

    expect(removeInvalidToolkitIds("global", ["workspace_toolkit"])).toEqual([
      "core",
    ]);
  });
});

describe("default_toolkit_store (SQL mode)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetDefaultToolkitStoreForTests();
  });

  afterEach(() => {
    delete window.settingsStorageAPI;
    resetDefaultToolkitStoreForTests();
  });

  test("stays in legacy mode (not SQL) without the toolkit-prefs bridge", () => {
    expect(isDefaultToolkitsSqlBacked()).toBe(false);
    expect(getDefaultToolkitSelection("global")).toEqual(["core"]);
  });

  test("degrades to localStorage when the bootstrap snapshot lacks toolkitPrefs", () => {
    installToolkitPrefsApi({
      overrides: {
        bootstrap: jest.fn(() => ({
          available: true,
          namespaces: {},
          revisions: {},
        })),
      },
    });
    expect(isDefaultToolkitsSqlBacked()).toBe(false);
    // legacy behavior intact
    expect(getDefaultToolkitSelection("global")).toEqual(["core"]);
  });

  test("reads answer from the bootstrap mirror; absent global gets the core default", () => {
    installToolkitPrefsApi({ scopes: {} });
    expect(isDefaultToolkitsSqlBacked()).toBe(true);
    expect(getDefaultToolkitSelection("global")).toEqual(["core"]);
    expect(getDefaultToolkitSelection("other")).toEqual([]);
    // SQL mode never seeds the legacy key
    expect(window.localStorage.getItem("default_toolkits")).toBeNull();
  });

  test("an explicitly empty global scope from SQL does NOT resurrect the default", () => {
    installToolkitPrefsApi({ scopes: { global: [] } });
    expect(getDefaultToolkitSelection("global")).toEqual([]);
  });

  test("mirror scopes normalize aliases on read", () => {
    installToolkitPrefsApi({ scopes: { global: ["WorkspaceToolkit"] } });
    expect(getDefaultToolkitSelection("global")).toEqual(["core"]);
  });

  test("writes update the mirror synchronously and persist through replace-scope IPC", async () => {
    const api = installToolkitPrefsApi({ scopes: { global: ["core"] } });

    expect(setDefaultToolkitEnabled("global", "mcp.memory.memory", true)).toEqual(
      ["core", "mcp.memory.memory"],
    );
    // read-your-writes before the IPC settles
    expect(getDefaultToolkitSelection("global")).toEqual([
      "core",
      "mcp.memory.memory",
    ]);

    expect(removeInvalidToolkitIds("global", ["core"])).toEqual(["core"]);

    await flushDefaultToolkitWrites();
    expect(api.replaceDefaultToolkitsScope).toHaveBeenCalledTimes(2);
    expect(api.replaceDefaultToolkitsScope.mock.calls[0]).toEqual([
      "global",
      ["core", "mcp.memory.memory"],
    ]);
    expect(api.replaceDefaultToolkitsScope.mock.calls[1]).toEqual([
      "global",
      ["core"],
    ]);
    // legacy key untouched in SQL mode (no legacy data existed)
    expect(window.localStorage.getItem("default_toolkits")).toBeNull();
  });

  test("first use with legacy data runs the per-store migration and writes the marker", async () => {
    window.localStorage.setItem(
      "default_toolkits",
      JSON.stringify({ version: 2, scopes: { global: ["core", "zeta"] } }),
    );
    const api = installToolkitPrefsApi({ scopes: {} });

    // pre-migration reads serve the legacy data
    expect(getDefaultToolkitSelection("global")).toEqual(["core", "zeta"]);
    await flushDefaultToolkitWrites();

    expect(api.migrateLegacyDefaultToolkits).toHaveBeenCalledTimes(1);
    const payload = api.migrateLegacyDefaultToolkits.mock.calls[0][0];
    expect(payload.migrationVersion).toBe(1);
    expect(payload.scopes).toEqual({ global: ["core", "zeta"] });

    const marker = JSON.parse(
      window.localStorage.getItem(DEFAULT_TOOLKITS_MIGRATION_MARKER_KEY),
    );
    expect(marker.digest).toBe("d1");

    // a later boot with the marker present does not re-migrate
    resetDefaultToolkitStoreForTests();
    installToolkitPrefsApi({ scopes: { global: ["core", "zeta"] } });
    window.localStorage.setItem(
      DEFAULT_TOOLKITS_MIGRATION_MARKER_KEY,
      JSON.stringify(marker),
    );
    expect(getDefaultToolkitSelection("global")).toEqual(["core", "zeta"]);
    await flushDefaultToolkitWrites();
    expect(
      window.settingsStorageAPI.migrateLegacyDefaultToolkits,
    ).not.toHaveBeenCalled();
  });

  test("writes before migration completion also write through to localStorage", async () => {
    window.localStorage.setItem(
      "default_toolkits",
      JSON.stringify({ version: 2, scopes: { global: ["core"] } }),
    );
    let resolveMigration;
    const api = installToolkitPrefsApi({
      scopes: {},
      overrides: {
        migrateLegacyDefaultToolkits: jest.fn(
          () =>
            new Promise((resolve) => {
              resolveMigration = resolve;
            }),
        ),
      },
    });

    setDefaultToolkitEnabled("global", "mcp.memory.memory", true);
    // migration has not resolved: localStorage is still the authority
    expect(
      JSON.parse(window.localStorage.getItem("default_toolkits")).scopes.global,
    ).toEqual(["core", "mcp.memory.memory"]);

    // drain microtasks until the queued migration op reaches the bridge
    while (!resolveMigration) {
      await Promise.resolve();
    }
    resolveMigration({ status: "complete", digest: "d1", migratedAt: 1 });
    await flushDefaultToolkitWrites();
    expect(api.replaceDefaultToolkitsScope).toHaveBeenCalledWith("global", [
      "core",
      "mcp.memory.memory",
    ]);
  });

  test("a failed migration degrades this store to localStorage for the session", async () => {
    window.localStorage.setItem(
      "default_toolkits",
      JSON.stringify({ version: 2, scopes: { global: ["core"] } }),
    );
    const api = installToolkitPrefsApi({
      scopes: {},
      overrides: {
        migrateLegacyDefaultToolkits: jest.fn(() =>
          Promise.reject(
            new Error("[invalid_migration_payload] migrate failed"),
          ),
        ),
      },
    });
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(isDefaultToolkitsSqlBacked()).toBe(true);
      await flushDefaultToolkitWrites();
      expect(isDefaultToolkitsSqlBacked()).toBe(false);

      // writes now land in localStorage, not IPC
      setDefaultToolkitEnabled("global", "mcp.memory.memory", true);
      expect(
        JSON.parse(window.localStorage.getItem("default_toolkits")).scopes
          .global,
      ).toEqual(["core", "mcp.memory.memory"]);
      await flushDefaultToolkitWrites();
      expect(api.replaceDefaultToolkitsScope).not.toHaveBeenCalled();
      // no marker: retried next session
      expect(
        window.localStorage.getItem(DEFAULT_TOOLKITS_MIGRATION_MARKER_KEY),
      ).toBeNull();
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("SQL mode addresses scopes by trimmed identity (main-process parity)", async () => {
    // SQL data (post-migration) holds the trimmed key; padded reads/writes
    // must hit the same scope instead of silently missing it.
    const api = installToolkitPrefsApi({ scopes: { ws1: ["core"] } });
    expect(getDefaultToolkitSelection(" ws1 ")).toEqual(["core"]);

    expect(
      setDefaultToolkitEnabled(" ws1 ", "mcp.memory.memory", true),
    ).toEqual(["core", "mcp.memory.memory"]);
    expect(getDefaultToolkitSelection("ws1")).toEqual([
      "core",
      "mcp.memory.memory",
    ]);

    await flushDefaultToolkitWrites();
    expect(api.replaceDefaultToolkitsScope).toHaveBeenCalledWith("ws1", [
      "core",
      "mcp.memory.memory",
    ]);
  });

  test("legacy scopes with padded keys seed the mirror under the trimmed key (migration import parity)", async () => {
    window.localStorage.setItem(
      "default_toolkits",
      JSON.stringify({
        version: 2,
        scopes: { global: ["core"], " ws1 ": ["mcp.memory.memory"] },
      }),
    );
    const api = installToolkitPrefsApi({ scopes: {} });
    // pre-migration reads already resolve the trimmed identity — matching
    // what the main-process import (cleanToolkitPrefId trims) will store.
    expect(getDefaultToolkitSelection("ws1")).toEqual(["mcp.memory.memory"]);
    expect(getDefaultToolkitSelection(" ws1 ")).toEqual([
      "mcp.memory.memory",
    ]);
    await flushDefaultToolkitWrites();
    expect(api.migrateLegacyDefaultToolkits).toHaveBeenCalledTimes(1);
  });

  test("already-complete (marker lost) resyncs the mirror from SQL — post-migration changes do not resurrect", async () => {
    // Legacy still holds the pre-revocation selection; SQL (authoritative
    // since a previous session) holds the narrowed truth: global explicitly
    // emptied. The legacy seed must not survive, and must not be what the
    // next commitScope re-persists.
    window.localStorage.setItem(
      "default_toolkits",
      JSON.stringify({ version: 2, scopes: { global: ["core", "zeta"] } }),
    );
    installToolkitPrefsApi({
      scopes: {},
      overrides: {
        migrateLegacyDefaultToolkits: jest.fn(() =>
          Promise.resolve({
            status: "already-complete",
            digest: "d1",
            migratedAt: 1,
          }),
        ),
        readDefaultToolkits: jest.fn(() =>
          Promise.resolve({ ok: true, scopes: { global: [] } }),
        ),
      },
    });
    // pre-resolution reads still serve the legacy seed (known residual window)
    expect(getDefaultToolkitSelection("global")).toEqual(["core", "zeta"]);
    await flushDefaultToolkitWrites();
    expect(isDefaultToolkitsSqlBacked()).toBe(true);
    // "restart does not resurrect": SQL's explicit-empty wins over legacy
    expect(getDefaultToolkitSelection("global")).toEqual([]);
    // marker restored so the next boot seeds straight from SQL
    expect(
      JSON.parse(
        window.localStorage.getItem(DEFAULT_TOOLKITS_MIGRATION_MARKER_KEY),
      ).digest,
    ).toBe("d1");
  });

  test("a stale marker over an unmigrated SQL side re-runs the migration (SQL state wins)", async () => {
    // settings.db was reset/replaced while the renderer marker survived:
    // marker-only logic would skip the import forever.
    window.localStorage.setItem(
      DEFAULT_TOOLKITS_MIGRATION_MARKER_KEY,
      JSON.stringify({ digest: "old", completedAt: 1 }),
    );
    window.localStorage.setItem(
      "default_toolkits",
      JSON.stringify({ version: 2, scopes: { global: ["core", "zeta"] } }),
    );
    const api = installToolkitPrefsApi({
      scopes: {},
      storeMigrations: {
        defaultToolkits: {
          state: "not_started",
          version: null,
          digest: null,
          migratedAt: null,
        },
      },
    });
    expect(getDefaultToolkitSelection("global")).toEqual(["core", "zeta"]);
    await flushDefaultToolkitWrites();
    expect(api.migrateLegacyDefaultToolkits).toHaveBeenCalledTimes(1);
  });

  test("SQL-complete meta with a lost marker backfills the marker without a migration IPC", async () => {
    window.localStorage.setItem(
      "default_toolkits",
      JSON.stringify({ version: 2, scopes: { global: ["core", "zeta"] } }),
    );
    const api = installToolkitPrefsApi({
      scopes: { global: ["core"] },
      storeMigrations: {
        defaultToolkits: {
          state: "complete",
          version: 1,
          digest: "sql-d",
          migratedAt: 9,
        },
      },
    });
    // SQL is the authority immediately — no already-complete round-trip
    expect(getDefaultToolkitSelection("global")).toEqual(["core"]);
    await flushDefaultToolkitWrites();
    expect(api.migrateLegacyDefaultToolkits).not.toHaveBeenCalled();
    expect(
      JSON.parse(
        window.localStorage.getItem(DEFAULT_TOOLKITS_MIGRATION_MARKER_KEY),
      ).digest,
    ).toBe("sql-d");
  });

  test("refused-stale-digest resyncs the mirror from SQL (SQL stays authoritative)", async () => {
    window.localStorage.setItem(
      "default_toolkits",
      JSON.stringify({ version: 2, scopes: { global: ["legacy.toolkit"] } }),
    );
    installToolkitPrefsApi({
      scopes: {},
      overrides: {
        migrateLegacyDefaultToolkits: jest.fn(() =>
          Promise.resolve({ status: "refused-stale-digest" }),
        ),
        readDefaultToolkits: jest.fn(() =>
          Promise.resolve({ ok: true, scopes: { global: ["sql.toolkit"] } }),
        ),
      },
    });
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      // pre-migration read: legacy
      expect(getDefaultToolkitSelection("global")).toEqual(["legacy.toolkit"]);
      await flushDefaultToolkitWrites();
      // post-refusal read: SQL truth, still SQL-backed, no marker written
      expect(isDefaultToolkitsSqlBacked()).toBe(true);
      expect(getDefaultToolkitSelection("global")).toEqual(["sql.toolkit"]);
      expect(
        window.localStorage.getItem(DEFAULT_TOOLKITS_MIGRATION_MARKER_KEY),
      ).toBeNull();
    } finally {
      warnSpy.mockRestore();
    }
  });
});

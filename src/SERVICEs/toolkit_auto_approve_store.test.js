import {
  getAutoApproveToolkits,
  isToolAutoApproved,
  isToolkitAutoApprove,
  setToolkitAutoApprove,
  isToolkitAutoApproveSqlBacked,
  flushToolkitAutoApproveWrites,
  resetToolkitAutoApproveStoreForTests,
  TOOLKIT_AUTO_APPROVE_MIGRATION_MARKER_KEY,
} from "./toolkit_auto_approve_store";

const installToolkitPrefsApi = ({
  toolkits = [],
  tools = [],
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
        defaultToolkits: { scopes: {} },
        toolkitAutoApprove: { toolkits, tools },
      },
      ...(storeMigrations ? { storeMigrations } : {}),
    })),
    migrateLegacy: jest.fn(() => Promise.resolve({ status: "complete" })),
    setNamespace: jest.fn(() => Promise.resolve({ ok: true })),
    deleteNamespace: jest.fn(() => Promise.resolve({ ok: true })),
    readDefaultToolkits: jest.fn(() =>
      Promise.resolve({ ok: true, scopes: {} }),
    ),
    replaceDefaultToolkitsScope: jest.fn(() =>
      Promise.resolve({ ok: true, scopeKey: "global", toolkitIds: [] }),
    ),
    migrateLegacyDefaultToolkits: jest.fn(() =>
      Promise.resolve({ status: "complete", digest: "d1", migratedAt: 1 }),
    ),
    readToolkitAutoApprove: jest.fn(() =>
      Promise.resolve({ ok: true, toolkits: [], tools: [] }),
    ),
    replaceToolkitAutoApprove: jest.fn((payload) =>
      Promise.resolve({ ok: true, ...payload }),
    ),
    migrateLegacyToolkitAutoApprove: jest.fn(() =>
      Promise.resolve({ status: "complete", digest: "d1", migratedAt: 1 }),
    ),
    ...overrides,
  };
  window.settingsStorageAPI = api;
  return api;
};

describe("toolkit_auto_approve_store", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetToolkitAutoApproveStoreForTests();
  });

  test("migrates legacy v1 tool names into toolkit-scoped tool keys", () => {
    window.localStorage.setItem(
      "toolkit_auto_approve",
      JSON.stringify({
        version: 1,
        toolkits: ["WorkspaceToolkit", "TerminalToolkit", "GitToolkit"],
        tools: ["write_file", "terminal_exec", "unknown_tool"],
      }),
    );

    expect(getAutoApproveToolkits()).toEqual(["core"]);
    expect(isToolkitAutoApprove("WorkspaceToolkit")).toBe(true);
    expect(isToolkitAutoApprove("git_toolkit")).toBe(true);
    expect(isToolAutoApproved("workspace_toolkit", "write_file")).toBe(true);
    expect(isToolAutoApproved("terminal_toolkit", "terminal_exec")).toBe(true);
    expect(isToolAutoApproved("core", "write_file")).toBe(true);
    expect(isToolAutoApproved("core", "terminal_exec")).toBe(true);
  });

  test("stores and removes toolkitId:toolName keys", () => {
    expect(
      setToolkitAutoApprove("CodeToolkit", true, ["write", "edit"]),
    ).toEqual({
      toolkits: ["core"],
      tools: ["core:write", "core:edit"],
    });

    expect(isToolkitAutoApprove("code")).toBe(true);
    expect(isToolAutoApproved("core", "write")).toBe(true);
    expect(isToolAutoApproved("workspace_toolkit", "write")).toBe(true);

    expect(setToolkitAutoApprove("core", false)).toEqual({
      toolkits: [],
      tools: [],
    });
    expect(isToolkitAutoApprove("core")).toBe(false);
    expect(isToolAutoApproved("core", "write")).toBe(false);
  });

  test("ignores a persisted computer auto-approval without changing ordinary tools", () => {
    window.localStorage.setItem(
      "toolkit_auto_approve",
      JSON.stringify({
        version: 2,
        toolkits: ["builtin.computer", "core"],
        tools: ["builtin.computer:computer", "core:write"],
      }),
    );

    expect(isToolAutoApproved("builtin.computer", "computer")).toBe(false);
    expect(isToolkitAutoApprove("builtin.computer")).toBe(false);
    expect(getAutoApproveToolkits()).toEqual(["core"]);
    expect(isToolAutoApproved("core", "write")).toBe(true);

    expect(
      setToolkitAutoApprove("builtin.computer", true, ["computer"]),
    ).toEqual({ toolkits: ["core"], tools: ["core:write"] });
  });
});

describe("toolkit_auto_approve_store (SQL mode)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetToolkitAutoApproveStoreForTests();
  });

  afterEach(() => {
    delete window.settingsStorageAPI;
    resetToolkitAutoApproveStoreForTests();
  });

  test("stays in legacy mode (not SQL) without the toolkit-prefs bridge", () => {
    expect(isToolkitAutoApproveSqlBacked()).toBe(false);
    expect(getAutoApproveToolkits()).toEqual([]);
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
    expect(isToolkitAutoApproveSqlBacked()).toBe(false);
    expect(setToolkitAutoApprove("core", true).toolkits).toEqual(["core"]);
    // the legacy write landed in localStorage
    expect(
      JSON.parse(window.localStorage.getItem("toolkit_auto_approve")).toolkits,
    ).toEqual(["core"]);
  });

  test("reads answer from the bootstrap mirror with alias normalization", () => {
    installToolkitPrefsApi({
      toolkits: ["core"],
      tools: [{ toolkitId: "core", toolName: "write_file" }],
    });
    expect(isToolkitAutoApproveSqlBacked()).toBe(true);
    expect(isToolkitAutoApprove("WorkspaceToolkit")).toBe(true);
    expect(isToolAutoApproved("workspace_toolkit", "write_file")).toBe(true);
    expect(isToolAutoApproved("core", "unknown_tool")).toBe(false);
    expect(getAutoApproveToolkits()).toEqual(["core"]);
    // SQL mode never seeds the legacy key
    expect(window.localStorage.getItem("toolkit_auto_approve")).toBeNull();
  });

  test("SECURITY: computer-toolkit rows smuggled into the snapshot are never approvals", () => {
    installToolkitPrefsApi({
      toolkits: ["builtin.computer", "core"],
      tools: [
        { toolkitId: "builtin.computer", toolName: "computer" },
        { toolkitId: "core", toolName: "write_file" },
      ],
    });
    expect(isToolkitAutoApprove("builtin.computer")).toBe(false);
    expect(isToolAutoApproved("builtin.computer", "computer")).toBe(false);
    expect(getAutoApproveToolkits()).toEqual(["core"]);
    expect(isToolAutoApproved("core", "write_file")).toBe(true);
  });

  test("SECURITY: setToolkitAutoApprove never lets the computer toolkit into the mirror or the IPC payload", async () => {
    const api = installToolkitPrefsApi({
      toolkits: ["core"],
      tools: [{ toolkitId: "core", toolName: "write_file" }],
    });
    expect(
      setToolkitAutoApprove("builtin.computer", true, ["computer"]),
    ).toEqual({ toolkits: ["core"], tools: ["core:write_file"] });
    expect(isToolkitAutoApprove("builtin.computer")).toBe(false);

    await flushToolkitAutoApproveWrites();
    for (const call of api.replaceToolkitAutoApprove.mock.calls) {
      expect(JSON.stringify(call[0])).not.toContain("builtin.computer");
    }
  });

  test("writes update the mirror synchronously and persist through replace-all IPC", async () => {
    const api = installToolkitPrefsApi();

    expect(setToolkitAutoApprove("CodeToolkit", true, ["write", "edit"])).toEqual(
      {
        toolkits: ["core"],
        tools: ["core:write", "core:edit"],
      },
    );
    // read-your-writes before the IPC settles
    expect(isToolkitAutoApprove("core")).toBe(true);
    expect(isToolAutoApproved("core", "write")).toBe(true);

    expect(setToolkitAutoApprove("core", false)).toEqual({
      toolkits: [],
      tools: [],
    });
    expect(isToolkitAutoApprove("core")).toBe(false);

    await flushToolkitAutoApproveWrites();
    expect(api.replaceToolkitAutoApprove).toHaveBeenCalledTimes(2);
    expect(api.replaceToolkitAutoApprove.mock.calls[0][0]).toEqual({
      toolkits: ["core"],
      tools: [
        { toolkitId: "core", toolName: "write" },
        { toolkitId: "core", toolName: "edit" },
      ],
    });
    expect(api.replaceToolkitAutoApprove.mock.calls[1][0]).toEqual({
      toolkits: [],
      tools: [],
    });
    expect(window.localStorage.getItem("toolkit_auto_approve")).toBeNull();
  });

  test("first use with legacy data runs the per-store migration (computer entries pre-dropped)", async () => {
    window.localStorage.setItem(
      "toolkit_auto_approve",
      JSON.stringify({
        version: 2,
        toolkits: ["core", "builtin.computer"],
        tools: ["core:write_file", "builtin.computer:computer"],
      }),
    );
    const api = installToolkitPrefsApi();

    // pre-migration reads serve the (sanitized) legacy data
    expect(getAutoApproveToolkits()).toEqual(["core"]);
    expect(isToolAutoApproved("builtin.computer", "computer")).toBe(false);
    await flushToolkitAutoApproveWrites();

    expect(api.migrateLegacyToolkitAutoApprove).toHaveBeenCalledTimes(1);
    const payload = api.migrateLegacyToolkitAutoApprove.mock.calls[0][0];
    expect(payload.migrationVersion).toBe(1);
    expect(payload.toolkits).toEqual(["core"]);
    expect(payload.tools).toEqual([
      { toolkitId: "core", toolName: "write_file" },
    ]);
    expect(JSON.stringify(payload)).not.toContain("builtin.computer");

    const marker = JSON.parse(
      window.localStorage.getItem(TOOLKIT_AUTO_APPROVE_MIGRATION_MARKER_KEY),
    );
    expect(marker.digest).toBe("d1");

    // a later boot with the marker present does not re-migrate
    resetToolkitAutoApproveStoreForTests();
    installToolkitPrefsApi({
      toolkits: ["core"],
      tools: [{ toolkitId: "core", toolName: "write_file" }],
    });
    window.localStorage.setItem(
      TOOLKIT_AUTO_APPROVE_MIGRATION_MARKER_KEY,
      JSON.stringify(marker),
    );
    expect(getAutoApproveToolkits()).toEqual(["core"]);
    await flushToolkitAutoApproveWrites();
    expect(
      window.settingsStorageAPI.migrateLegacyToolkitAutoApprove,
    ).not.toHaveBeenCalled();
  });

  test("writes before migration completion also write through to localStorage", async () => {
    window.localStorage.setItem(
      "toolkit_auto_approve",
      JSON.stringify({ version: 2, toolkits: ["core"], tools: [] }),
    );
    let resolveMigration;
    const api = installToolkitPrefsApi({
      overrides: {
        migrateLegacyToolkitAutoApprove: jest.fn(
          () =>
            new Promise((resolve) => {
              resolveMigration = resolve;
            }),
        ),
      },
    });

    setToolkitAutoApprove("mcp.memory.memory", true);
    // migration has not resolved: localStorage is still the authority
    expect(
      JSON.parse(window.localStorage.getItem("toolkit_auto_approve")).toolkits,
    ).toEqual(["core", "mcp.memory.memory"]);

    while (!resolveMigration) {
      await Promise.resolve();
    }
    resolveMigration({ status: "complete", digest: "d1", migratedAt: 1 });
    await flushToolkitAutoApproveWrites();
    expect(api.replaceToolkitAutoApprove).toHaveBeenCalledWith({
      toolkits: ["core", "mcp.memory.memory"],
      tools: [],
    });
  });

  test("a failed migration degrades this store to localStorage for the session", async () => {
    window.localStorage.setItem(
      "toolkit_auto_approve",
      JSON.stringify({ version: 2, toolkits: ["core"], tools: [] }),
    );
    const api = installToolkitPrefsApi({
      overrides: {
        migrateLegacyToolkitAutoApprove: jest.fn(() =>
          Promise.reject(
            new Error("[invalid_migration_payload] migrate failed"),
          ),
        ),
      },
    });
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(isToolkitAutoApproveSqlBacked()).toBe(true);
      await flushToolkitAutoApproveWrites();
      expect(isToolkitAutoApproveSqlBacked()).toBe(false);

      setToolkitAutoApprove("mcp.memory.memory", true);
      expect(
        JSON.parse(window.localStorage.getItem("toolkit_auto_approve"))
          .toolkits,
      ).toEqual(["core", "mcp.memory.memory"]);
      await flushToolkitAutoApproveWrites();
      expect(api.replaceToolkitAutoApprove).not.toHaveBeenCalled();
      expect(
        window.localStorage.getItem(
          TOOLKIT_AUTO_APPROVE_MIGRATION_MARKER_KEY,
        ),
      ).toBeNull();
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("SECURITY: parts the main process would reject (over-long / __proto__) never enter the mirror or the IPC payload", async () => {
    const api = installToolkitPrefsApi();
    const longName = "x".repeat(201);
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      setToolkitAutoApprove("mcp.memory.memory", true, [longName, "ok_tool"]);
      setToolkitAutoApprove("__proto__", true, ["read"]);
      expect(isToolAutoApproved("mcp.memory.memory", longName)).toBe(false);
      expect(isToolAutoApproved("mcp.memory.memory", "ok_tool")).toBe(true);
      expect(isToolkitAutoApprove("__proto__")).toBe(false);
      // dropped entries are reported with a CODED, count-only warning — the
      // whole replace payload is never rejected over one bad part
      const logged = JSON.stringify(warnSpy.mock.calls);
      expect(logged).toContain("dropped 1 tool");
      expect(logged).toContain("invalid_toolkit_auto_approve_payload");
      expect(logged).not.toContain(longName);
      await flushToolkitAutoApproveWrites();
      expect(api.replaceToolkitAutoApprove.mock.calls.length).toBeGreaterThan(
        0,
      );
      for (const call of api.replaceToolkitAutoApprove.mock.calls) {
        const payload = call[0];
        for (const id of payload.toolkits) {
          expect(id.length).toBeLessThanOrEqual(200);
          expect(id).not.toBe("__proto__");
        }
        for (const entry of payload.tools) {
          expect(entry.toolkitId.length).toBeLessThanOrEqual(200);
          expect(entry.toolName.length).toBeLessThanOrEqual(200);
          expect(entry.toolName).not.toBe("__proto__");
        }
      }
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("a stale marker over an unmigrated SQL side re-runs the migration (SQL state wins)", async () => {
    // settings.db was reset/replaced while the renderer marker survived:
    // marker-only logic would skip the import forever.
    window.localStorage.setItem(
      TOOLKIT_AUTO_APPROVE_MIGRATION_MARKER_KEY,
      JSON.stringify({ digest: "old", completedAt: 1 }),
    );
    window.localStorage.setItem(
      "toolkit_auto_approve",
      JSON.stringify({
        version: 2,
        toolkits: ["core"],
        tools: ["core:write_file"],
      }),
    );
    const api = installToolkitPrefsApi({
      storeMigrations: {
        toolkitAutoApprove: {
          state: "not_started",
          version: null,
          digest: null,
          migratedAt: null,
        },
      },
    });
    expect(getAutoApproveToolkits()).toEqual(["core"]);
    await flushToolkitAutoApproveWrites();
    expect(api.migrateLegacyToolkitAutoApprove).toHaveBeenCalledTimes(1);
  });

  test("SQL-complete meta with a lost marker backfills the marker; revoked approvals never resurrect (no migration IPC)", async () => {
    // legacy still holds a wider set; SQL (complete meta) holds the
    // narrowed truth in the snapshot — SQL wins without any round-trip.
    window.localStorage.setItem(
      "toolkit_auto_approve",
      JSON.stringify({
        version: 2,
        toolkits: ["core", "mcp.legacy.wide"],
        tools: [],
      }),
    );
    const api = installToolkitPrefsApi({
      toolkits: ["core"],
      tools: [],
      storeMigrations: {
        toolkitAutoApprove: {
          state: "complete",
          version: 1,
          digest: "sql-d",
          migratedAt: 9,
        },
      },
    });
    expect(isToolkitAutoApprove("mcp.legacy.wide")).toBe(false);
    expect(getAutoApproveToolkits()).toEqual(["core"]);
    await flushToolkitAutoApproveWrites();
    expect(api.migrateLegacyToolkitAutoApprove).not.toHaveBeenCalled();
    expect(
      JSON.parse(
        window.localStorage.getItem(TOOLKIT_AUTO_APPROVE_MIGRATION_MARKER_KEY),
      ).digest,
    ).toBe("sql-d");
  });

  test("already-complete (marker lost) resyncs the mirror from SQL — revoked approvals do not resurrect", async () => {
    window.localStorage.setItem(
      "toolkit_auto_approve",
      JSON.stringify({
        version: 2,
        toolkits: ["core", "mcp.legacy.wide"],
        tools: ["core:write_file"],
      }),
    );
    installToolkitPrefsApi({
      overrides: {
        migrateLegacyToolkitAutoApprove: jest.fn(() =>
          Promise.resolve({
            status: "already-complete",
            digest: "d1",
            migratedAt: 1,
          }),
        ),
        readToolkitAutoApprove: jest.fn(() =>
          Promise.resolve({ ok: true, toolkits: ["core"], tools: [] }),
        ),
      },
    });
    // pre-resolution reads still serve the legacy seed (known residual window)
    expect(isToolkitAutoApprove("mcp.legacy.wide")).toBe(true);
    await flushToolkitAutoApproveWrites();
    expect(isToolkitAutoApproveSqlBacked()).toBe(true);
    expect(isToolkitAutoApprove("mcp.legacy.wide")).toBe(false);
    expect(isToolAutoApproved("core", "write_file")).toBe(false);
    expect(getAutoApproveToolkits()).toEqual(["core"]);
    // marker restored so the next boot seeds straight from SQL
    expect(
      JSON.parse(
        window.localStorage.getItem(TOOLKIT_AUTO_APPROVE_MIGRATION_MARKER_KEY),
      ).digest,
    ).toBe("d1");
  });

  test("SECURITY: refusal empties the mirror before the SQL re-read; a failed re-read stays fail closed (no legacy fallback)", async () => {
    window.localStorage.setItem(
      "toolkit_auto_approve",
      JSON.stringify({
        version: 2,
        toolkits: ["core", "mcp.legacy.wide"],
        tools: [],
      }),
    );
    let rejectRead;
    const api = installToolkitPrefsApi({
      overrides: {
        migrateLegacyToolkitAutoApprove: jest.fn(() =>
          Promise.resolve({ status: "refused-stale-digest" }),
        ),
        readToolkitAutoApprove: jest.fn(
          () =>
            new Promise((_resolve, reject) => {
              rejectRead = reject;
            }),
        ),
      },
    });
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(isToolkitAutoApprove("mcp.legacy.wide")).toBe(true); // legacy seed
      // let the refusal land while the SQL re-read is still in flight
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(api.migrateLegacyToolkitAutoApprove).toHaveBeenCalledTimes(1);
      expect(typeof rejectRead).toBe("function"); // re-read is in flight
      // fail-closed window: no approvals while the re-read is pending
      expect(isToolkitAutoApprove("mcp.legacy.wide")).toBe(false);
      expect(getAutoApproveToolkits()).toEqual([]);
      rejectRead(new Error("[settings_storage_unavailable] gone"));
      await flushToolkitAutoApproveWrites();
      // still SQL mode (never degrades to the wider legacy), still no approvals
      expect(isToolkitAutoApproveSqlBacked()).toBe(true);
      expect(isToolkitAutoApprove("mcp.legacy.wide")).toBe(false);
      expect(getAutoApproveToolkits()).toEqual([]);
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("post-migration revocations narrow the frozen legacy copy (never widen or create it)", async () => {
    window.localStorage.setItem(
      TOOLKIT_AUTO_APPROVE_MIGRATION_MARKER_KEY,
      JSON.stringify({ digest: "d1", completedAt: 1 }),
    );
    window.localStorage.setItem(
      "toolkit_auto_approve",
      JSON.stringify({
        version: 2,
        toolkits: ["core", "mcp.memory.memory"],
        tools: ["core:write_file"],
      }),
    );
    installToolkitPrefsApi({
      toolkits: ["core", "mcp.memory.memory"],
      tools: [{ toolkitId: "core", toolName: "write_file" }],
    });
    // revoke → the legacy copy narrows with it
    setToolkitAutoApprove("mcp.memory.memory", false);
    expect(
      JSON.parse(window.localStorage.getItem("toolkit_auto_approve")),
    ).toEqual({ version: 2, toolkits: ["core"], tools: ["core:write_file"] });
    // grant → the legacy copy is NOT widened
    setToolkitAutoApprove("mcp.other.new", true);
    expect(
      JSON.parse(window.localStorage.getItem("toolkit_auto_approve")).toolkits,
    ).toEqual(["core"]);
    await flushToolkitAutoApproveWrites();
  });

  test("refused-stale-digest resyncs the mirror from SQL (never keeps wider legacy approvals)", async () => {
    window.localStorage.setItem(
      "toolkit_auto_approve",
      JSON.stringify({
        version: 2,
        toolkits: ["core", "mcp.legacy.wide"],
        tools: ["core:write_file"],
      }),
    );
    installToolkitPrefsApi({
      overrides: {
        migrateLegacyToolkitAutoApprove: jest.fn(() =>
          Promise.resolve({ status: "refused-stale-digest" }),
        ),
        readToolkitAutoApprove: jest.fn(() =>
          Promise.resolve({ ok: true, toolkits: ["core"], tools: [] }),
        ),
      },
    });
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      // pre-migration read: legacy (wider)
      expect(isToolkitAutoApprove("mcp.legacy.wide")).toBe(true);
      await flushToolkitAutoApproveWrites();
      // post-refusal: the narrower SQL truth wins
      expect(isToolkitAutoApproveSqlBacked()).toBe(true);
      expect(isToolkitAutoApprove("mcp.legacy.wide")).toBe(false);
      expect(isToolAutoApproved("core", "write_file")).toBe(false);
      expect(getAutoApproveToolkits()).toEqual(["core"]);
    } finally {
      warnSpy.mockRestore();
    }
  });
});

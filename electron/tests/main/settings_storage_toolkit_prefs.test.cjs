const path = require("path");
const os = require("os");
const fs = require("fs");

// node:sqlite handling mirrors settings_storage_token_usage.test.cjs.
let sqlite = null;
try {
  sqlite = require("node:sqlite");
} catch (_error) {
  sqlite = null;
}
if (!sqlite && typeof process.getBuiltinModule === "function") {
  try {
    sqlite = process.getBuiltinModule("node:sqlite");
  } catch (_error) {
    sqlite = null;
  }
}

const describeIfSqlite = sqlite ? describe : describe.skip;

const {
  createSettingsStorageService,
  TOOLKIT_PREFS_LIMITS,
} = require("../../main/services/settings_storage/service");

const makeTempDir = () =>
  fs.mkdtempSync(path.join(os.tmpdir(), "pupu-settings-toolkit-prefs-"));

const fakeApp = (userDataDir) => ({
  getPath: (key) => {
    if (key === "userData") return userDataDir;
    throw new Error(`unexpected app.getPath(${key})`);
  },
});

const expectThrowCode = (fn, code) => {
  let caught = null;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught).not.toBeNull();
  expect(caught.code).toBe(code);
  return caught;
};

const defaultToolkitsPayload = (scopes, overrides = {}) => ({
  migrationVersion: 1,
  scopes,
  ...overrides,
});

const autoApprovePayload = (toolkits, tools, overrides = {}) => ({
  migrationVersion: 1,
  toolkits,
  tools,
  ...overrides,
});

describe("toolkit prefs limits (constants)", () => {
  test("centralized limit constants keep the plan §3.3 / §7.2 values", () => {
    expect(TOOLKIT_PREFS_LIMITS.ID_MAX_LENGTH).toBe(200);
    expect(TOOLKIT_PREFS_LIMITS.MAX_IDS_PER_SCOPE).toBe(100);
    expect(TOOLKIT_PREFS_LIMITS.MAX_SCOPES).toBe(200);
    expect(TOOLKIT_PREFS_LIMITS.MAX_AUTO_APPROVE_TOOLKITS).toBe(100);
    expect(TOOLKIT_PREFS_LIMITS.MAX_AUTO_APPROVE_TOOLS).toBe(100);
  });
});

describeIfSqlite("settings storage toolkit prefs (sqlite)", () => {
  let dir;
  let services;

  const makeService = () => {
    const service = createSettingsStorageService({
      app: fakeApp(dir),
      fs,
      path,
      sqlite,
    });
    services.push(service);
    return service;
  };

  const openRawDb = () =>
    new sqlite.DatabaseSync(path.join(dir, "settings.db"));

  beforeEach(() => {
    dir = makeTempDir();
    services = [];
  });

  afterEach(() => {
    for (const service of services) {
      try {
        service.close();
      } catch (_error) {
        // already closed
      }
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe("schema (plan §3.3)", () => {
    test("fresh init creates all three toolkit preference tables", () => {
      const service = makeService();
      service.init();
      service.close();

      const raw = openRawDb();
      try {
        const tables = raw
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN " +
              "('default_toolkits', 'toolkit_auto_approve', 'tool_auto_approve')",
          )
          .all()
          .map((row) => row.name)
          .sort();
        expect(tables).toEqual([
          "default_toolkits",
          "tool_auto_approve",
          "toolkit_auto_approve",
        ]);
      } finally {
        raw.close();
      }
    });
  });

  describe("default_toolkits CRUD", () => {
    test("replace-scope inserts in ord order and read-all returns it", () => {
      const service = makeService();
      service.init();

      const ack = service.replaceDefaultToolkitsScope("global", [
        "core",
        "mcp.memory.memory",
      ]);
      expect(ack).toEqual({
        ok: true,
        scopeKey: "global",
        toolkitIds: ["core", "mcp.memory.memory"],
      });
      expect(service.readDefaultToolkits()).toEqual({
        ok: true,
        scopes: { global: ["core", "mcp.memory.memory"] },
      });

      // full replacement, order preserved (reversed on purpose)
      service.replaceDefaultToolkitsScope("global", [
        "mcp.memory.memory",
        "core",
      ]);
      expect(service.readDefaultToolkits().scopes.global).toEqual([
        "mcp.memory.memory",
        "core",
      ]);
    });

    test("scopes are independent and survive a service reopen", () => {
      const service = makeService();
      service.init();
      service.replaceDefaultToolkitsScope("global", ["core"]);
      service.replaceDefaultToolkitsScope("workspace:a", ["mcp.dev.github"]);
      service.close();

      const reopened = makeService();
      reopened.init();
      expect(reopened.readDefaultToolkits().scopes).toEqual({
        global: ["core"],
        "workspace:a": ["mcp.dev.github"],
      });
    });

    test("an explicitly emptied scope reads back as [] (never resurrects a default)", () => {
      const service = makeService();
      service.init();
      service.replaceDefaultToolkitsScope("global", ["core"]);
      service.replaceDefaultToolkitsScope("global", []);
      expect(service.readDefaultToolkits().scopes.global).toEqual([]);
      service.close();

      // ...and across reopen (this is what keeps a user-disabled "core" off)
      const reopened = makeService();
      reopened.init();
      expect(reopened.readDefaultToolkits().scopes.global).toEqual([]);

      // re-enabling clears the explicit-empty marker
      reopened.replaceDefaultToolkitsScope("global", ["core"]);
      reopened.close();
      const again = makeService();
      again.init();
      expect(again.readDefaultToolkits().scopes.global).toEqual(["core"]);
    });

    test("trims ids, dedupes silently and rejects invalid input with coded errors", () => {
      const service = makeService();
      service.init();

      expect(
        service.replaceDefaultToolkitsScope("global", [
          " core ",
          "core",
        ]).toolkitIds,
      ).toEqual(["core"]);

      for (const [scopeKey, ids] of [
        ["", ["core"]],
        ["   ", ["core"]],
        [42, ["core"]],
        ["__proto__", ["core"]],
        ["x".repeat(TOOLKIT_PREFS_LIMITS.ID_MAX_LENGTH + 1), ["core"]],
        ["global", "not-an-array"],
        ["global", [""]],
        ["global", [42]],
        ["global", ["x".repeat(TOOLKIT_PREFS_LIMITS.ID_MAX_LENGTH + 1)]],
        ["global", Array(TOOLKIT_PREFS_LIMITS.MAX_IDS_PER_SCOPE + 1).fill("a")],
      ]) {
        const error = expectThrowCode(
          () => service.replaceDefaultToolkitsScope(scopeKey, ids),
          "invalid_default_toolkits_payload",
        );
        expect(
          error.message.startsWith("[invalid_default_toolkits_payload] "),
        ).toBe(true);
      }
      // none of the rejected writes changed the stored state
      expect(service.readDefaultToolkits().scopes.global).toEqual(["core"]);
    });

    test("a __proto__ row read path stays an own key (null-prototype map)", () => {
      const service = makeService();
      service.init();
      const scopes = service.readDefaultToolkits().scopes;
      expect(Object.getPrototypeOf(scopes)).toBeNull();
    });

    test("MAX_SCOPES gates clearing writes too — the explicit-empty meta set cannot grow unbounded", () => {
      const service = makeService();
      service.init();

      // Reach the cap with a mix of row-backed and explicitly-empty scopes:
      // BOTH count as tracked scopes.
      for (let i = 0; i < TOOLKIT_PREFS_LIMITS.MAX_SCOPES; i += 1) {
        service.replaceDefaultToolkitsScope(
          `scope-${i}`,
          i % 2 === 0 ? ["core"] : [],
        );
      }

      // At the cap, a write for a NEW scope is rejected — empty or not.
      expectThrowCode(
        () => service.replaceDefaultToolkitsScope("scope-new-empty", []),
        "invalid_default_toolkits_payload",
      );
      expectThrowCode(
        () => service.replaceDefaultToolkitsScope("scope-new-full", ["core"]),
        "invalid_default_toolkits_payload",
      );

      // Rewriting / clearing an already-tracked scope always passes (the
      // target is excluded from the count and cannot grow the set).
      expect(
        service.replaceDefaultToolkitsScope("scope-0", ["core", "beta"]).ok,
      ).toBe(true);
      expect(service.replaceDefaultToolkitsScope("scope-0", []).ok).toBe(true);
      expect(service.replaceDefaultToolkitsScope("scope-1", ["core"]).ok).toBe(
        true,
      );

      // Tracked scope count (rows + explicit-empty) stays at the cap.
      const scopes = service.readDefaultToolkits().scopes;
      expect(Object.keys(scopes)).toHaveLength(
        TOOLKIT_PREFS_LIMITS.MAX_SCOPES,
      );
      expect(scopes["scope-new-empty"]).toBeUndefined();
      expect(scopes["scope-new-full"]).toBeUndefined();
    });
  });

  describe("toolkit_auto_approve / tool_auto_approve CRUD", () => {
    test("replace-all swaps both tables atomically and read-all returns them", () => {
      const service = makeService();
      service.init();

      const ack = service.replaceToolkitAutoApprove({
        toolkits: ["core", "mcp.memory.memory"],
        tools: [
          { toolkitId: "core", toolName: "write_file" },
          { toolkitId: "core", toolName: "terminal_exec" },
        ],
      });
      expect(ack.ok).toBe(true);
      expect(service.readToolkitAutoApprove()).toEqual({
        ok: true,
        toolkits: ["core", "mcp.memory.memory"],
        tools: [
          { toolkitId: "core", toolName: "write_file" },
          { toolkitId: "core", toolName: "terminal_exec" },
        ],
      });

      service.replaceToolkitAutoApprove({ toolkits: [], tools: [] });
      expect(service.readToolkitAutoApprove()).toEqual({
        ok: true,
        toolkits: [],
        tools: [],
      });
    });

    test("SECURITY: any computer-toolkit reference rejects the whole write", () => {
      const service = makeService();
      service.init();
      service.replaceToolkitAutoApprove({ toolkits: ["core"], tools: [] });

      expectThrowCode(
        () =>
          service.replaceToolkitAutoApprove({
            toolkits: ["builtin.computer"],
            tools: [],
          }),
        "invalid_toolkit_auto_approve_payload",
      );
      expectThrowCode(
        () =>
          service.replaceToolkitAutoApprove({
            toolkits: [],
            tools: [{ toolkitId: "builtin.computer", toolName: "computer" }],
          }),
        "invalid_toolkit_auto_approve_payload",
      );
      expectThrowCode(
        () =>
          service.replaceToolkitAutoApprove({
            toolkits: [" builtin.computer "],
            tools: [],
          }),
        "invalid_toolkit_auto_approve_payload",
      );
      // the previous state is untouched (rejected before any delete)
      expect(service.readToolkitAutoApprove().toolkits).toEqual(["core"]);
    });

    test("invalid payload shapes reject with coded, prefix-carrying errors", () => {
      const service = makeService();
      service.init();

      for (const payload of [
        "not-an-object",
        { toolkits: "nope", tools: [] },
        { toolkits: [], tools: "nope" },
        { toolkits: [""], tools: [] },
        { toolkits: [], tools: ["core:write_file"] }, // must be objects
        { toolkits: [], tools: [{ toolkitId: "core", toolName: "" }] },
        { toolkits: [], tools: [{ toolkitId: "", toolName: "write_file" }] },
        {
          toolkits: Array(
            TOOLKIT_PREFS_LIMITS.MAX_AUTO_APPROVE_TOOLKITS + 1,
          ).fill("a"),
          tools: [],
        },
      ]) {
        const error = expectThrowCode(
          () => service.replaceToolkitAutoApprove(payload),
          "invalid_toolkit_auto_approve_payload",
        );
        expect(
          error.message.startsWith("[invalid_toolkit_auto_approve_payload] "),
        ).toBe(true);
      }
    });
  });

  describe("bootstrap snapshot (plan §3.3: mirror seed before first read)", () => {
    test("snapshot carries toolkitPrefs with both stores", () => {
      const service = makeService();
      service.init();
      service.replaceDefaultToolkitsScope("global", ["core"]);
      service.replaceDefaultToolkitsScope("emptied", []);
      service.replaceToolkitAutoApprove({
        toolkits: ["core"],
        tools: [{ toolkitId: "core", toolName: "write_file" }],
      });

      const snapshot = service.getBootstrapSnapshot();
      expect(snapshot.available).toBe(true);
      expect(snapshot.toolkitPrefs).toEqual({
        defaultToolkits: { scopes: { global: ["core"], emptied: [] } },
        toolkitAutoApprove: {
          toolkits: ["core"],
          tools: [{ toolkitId: "core", toolName: "write_file" }],
        },
      });
    });

    test("a fresh database still exposes empty toolkitPrefs (mirror can load)", () => {
      const service = makeService();
      service.init();
      const snapshot = service.getBootstrapSnapshot();
      expect(snapshot.toolkitPrefs).toEqual({
        defaultToolkits: { scopes: {} },
        toolkitAutoApprove: { toolkits: [], tools: [] },
      });
    });
  });

  describe("default_toolkits legacy migration", () => {
    test("imports scopes with order, records per-store meta, marker semantics", () => {
      const service = makeService();
      service.init();

      const result = service.migrateLegacyDefaultToolkits(
        defaultToolkitsPayload({
          global: ["core", "mcp.memory.memory"],
          emptied: [],
        }),
      );
      expect(result.status).toBe("complete");
      expect(result.ok).toBe(true);
      expect(result.importedScopes).toBe(2);
      expect(result.importedIds).toBe(2);
      expect(result.droppedEntries).toBe(0);
      expect(typeof result.digest).toBe("string");

      expect(service.readDefaultToolkits().scopes).toEqual({
        global: ["core", "mcp.memory.memory"],
        emptied: [],
      });

      const raw = openRawDb();
      try {
        const meta = Object.fromEntries(
          raw
            .prepare(
              "SELECT key, value FROM meta WHERE key LIKE 'default_toolkits_%'",
            )
            .all()
            .map((row) => [row.key, JSON.parse(row.value)]),
        );
        expect(meta.default_toolkits_migration_state).toBe("complete");
        expect(meta.default_toolkits_migration_version).toBe(1);
        expect(meta.default_toolkits_migration_digest).toBe(result.digest);
        expect(typeof meta.default_toolkits_migrated_at).toBe("number");
      } finally {
        raw.close();
      }
    });

    test("same-digest replay is idempotent; different digest is refused", () => {
      const service = makeService();
      service.init();
      const scopes = { global: ["core"] };
      const first = service.migrateLegacyDefaultToolkits(
        defaultToolkitsPayload(scopes),
      );
      expect(first.status).toBe("complete");

      const replay = service.migrateLegacyDefaultToolkits(
        defaultToolkitsPayload(scopes),
      );
      expect(replay.status).toBe("already-complete");
      expect(replay.digestMatched).toBe(true);
      // zero duplicate rows
      expect(service.readDefaultToolkits().scopes.global).toEqual(["core"]);

      const stale = service.migrateLegacyDefaultToolkits(
        defaultToolkitsPayload({ global: ["core", "other.toolkit"] }),
      );
      expect(stale.status).toBe("refused-stale-digest");
      expect(stale.digestMatched).toBe(false);
      expect(service.readDefaultToolkits().scopes.global).toEqual(["core"]);
    });

    test("drops invalid entries with a count-only diagnostic (plan §3.3: 宁缺勿滥)", () => {
      const service = makeService();
      service.init();
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
      try {
        const result = service.migrateLegacyDefaultToolkits(
          defaultToolkitsPayload({
            global: ["core", "", 42, "x".repeat(300)],
            "": ["orphan"],
            garbage: "not-an-array",
          }),
        );
        expect(result.status).toBe("complete");
        expect(result.importedScopes).toBe(1);
        expect(result.importedIds).toBe(1);
        expect(result.droppedEntries).toBe(5);
        expect(service.readDefaultToolkits().scopes).toEqual({
          global: ["core"],
        });
        const logged = JSON.stringify(warnSpy.mock.calls);
        expect(logged).toContain("dropped 5");
        expect(logged).not.toContain("orphan"); // never entry contents
      } finally {
        warnSpy.mockRestore();
      }
    });

    test("a legacy scope whose ids all drop imports as explicitly empty", () => {
      const service = makeService();
      service.init();
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
      try {
        service.migrateLegacyDefaultToolkits(
          defaultToolkitsPayload({ global: [42] }),
        );
      } finally {
        warnSpy.mockRestore();
      }
      // legacy sanitize semantics: global existed, so [] — not the default
      expect(service.readDefaultToolkits().scopes.global).toEqual([]);
    });

    test("envelope violations throw coded errors and leave meta untouched", () => {
      const service = makeService();
      service.init();
      expectThrowCode(
        () => service.migrateLegacyDefaultToolkits(null),
        "invalid_migration_payload",
      );
      expectThrowCode(
        () =>
          service.migrateLegacyDefaultToolkits(
            defaultToolkitsPayload({}, { migrationVersion: 99 }),
          ),
        "unsupported_migration_version",
      );
      expectThrowCode(
        () =>
          service.migrateLegacyDefaultToolkits(
            defaultToolkitsPayload("not-an-object"),
          ),
        "invalid_migration_payload",
      );
      expectThrowCode(
        () =>
          service.migrateLegacyDefaultToolkits(
            defaultToolkitsPayload({ global: ["core"] }, { digest: "beef" }),
          ),
        "digest_mismatch",
      );
      // still runnable after all the failures
      expect(
        service.migrateLegacyDefaultToolkits(
          defaultToolkitsPayload({ global: ["core"] }),
        ).status,
      ).toBe("complete");
    });

    test("per-store meta is isolated from the settings-root migration meta", () => {
      const service = makeService();
      service.init();
      service.migrateLegacyDefaultToolkits(
        defaultToolkitsPayload({ global: ["core"] }),
      );
      // the settings-root migration is still not_started
      expect(service.getBootstrapSnapshot().migration.state).toBe(
        "not_started",
      );
    });
  });

  describe("toolkit_auto_approve legacy migration", () => {
    test("imports both lists, meta recorded, replay idempotent", () => {
      const service = makeService();
      service.init();

      const result = service.migrateLegacyToolkitAutoApprove(
        autoApprovePayload(
          ["core"],
          [{ toolkitId: "core", toolName: "write_file" }],
        ),
      );
      expect(result.status).toBe("complete");
      expect(result.importedToolkits).toBe(1);
      expect(result.importedTools).toBe(1);
      expect(result.droppedEntries).toBe(0);

      expect(service.readToolkitAutoApprove()).toEqual({
        ok: true,
        toolkits: ["core"],
        tools: [{ toolkitId: "core", toolName: "write_file" }],
      });

      const replay = service.migrateLegacyToolkitAutoApprove(
        autoApprovePayload(
          ["core"],
          [{ toolkitId: "core", toolName: "write_file" }],
        ),
      );
      expect(replay.status).toBe("already-complete");
      expect(service.readToolkitAutoApprove().toolkits).toEqual(["core"]);

      const raw = openRawDb();
      try {
        const meta = Object.fromEntries(
          raw
            .prepare(
              "SELECT key, value FROM meta WHERE key LIKE 'toolkit_auto_approve_%'",
            )
            .all()
            .map((row) => [row.key, JSON.parse(row.value)]),
        );
        expect(meta.toolkit_auto_approve_migration_state).toBe("complete");
        expect(meta.toolkit_auto_approve_migration_digest).toBe(result.digest);
      } finally {
        raw.close();
      }
    });

    test("SECURITY: computer-toolkit entries and invalid entries are dropped, never imported", () => {
      const service = makeService();
      service.init();
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
      try {
        const result = service.migrateLegacyToolkitAutoApprove(
          autoApprovePayload(
            ["core", "builtin.computer", "", 42],
            [
              { toolkitId: "core", toolName: "write_file" },
              { toolkitId: "builtin.computer", toolName: "computer" },
              { toolkitId: "core", toolName: "" },
              "core:write_file",
            ],
          ),
        );
        expect(result.status).toBe("complete");
        expect(result.importedToolkits).toBe(1);
        expect(result.importedTools).toBe(1);
        expect(result.droppedEntries).toBe(6);
        const stored = service.readToolkitAutoApprove();
        expect(stored.toolkits).toEqual(["core"]);
        expect(stored.tools).toEqual([
          { toolkitId: "core", toolName: "write_file" },
        ]);
        const logged = JSON.stringify(warnSpy.mock.calls);
        expect(logged).toContain("dropped 6");
        expect(logged).not.toContain("builtin.computer");
      } finally {
        warnSpy.mockRestore();
      }
    });

    test("envelope violations throw coded errors", () => {
      const service = makeService();
      service.init();
      expectThrowCode(
        () => service.migrateLegacyToolkitAutoApprove(null),
        "invalid_migration_payload",
      );
      expectThrowCode(
        () =>
          service.migrateLegacyToolkitAutoApprove(
            autoApprovePayload("nope", []),
          ),
        "invalid_migration_payload",
      );
      expectThrowCode(
        () =>
          service.migrateLegacyToolkitAutoApprove(
            autoApprovePayload([], [], { migrationVersion: 2 }),
          ),
        "unsupported_migration_version",
      );
      expectThrowCode(
        () =>
          service.migrateLegacyToolkitAutoApprove(
            autoApprovePayload([], [], { digest: "beef" }),
          ),
        "digest_mismatch",
      );
    });

    test("the two toolkit-pref stores migrate independently", () => {
      const service = makeService();
      service.init();
      service.migrateLegacyToolkitAutoApprove(autoApprovePayload([], []));
      // default_toolkits migration still runs fresh
      expect(
        service.migrateLegacyDefaultToolkits(
          defaultToolkitsPayload({ global: ["core"] }),
        ).status,
      ).toBe("complete");
    });
  });

  describe("error-code message prefix (IPC transport contract)", () => {
    test("new codes carry the stable [<code>] prefix", () => {
      const service = makeService();
      service.init();
      const cases = [
        [
          "invalid_default_toolkits_payload",
          () => service.replaceDefaultToolkitsScope("", []),
        ],
        [
          "invalid_toolkit_auto_approve_payload",
          () => service.replaceToolkitAutoApprove("nope"),
        ],
      ];
      for (const [code, trigger] of cases) {
        const error = expectThrowCode(trigger, code);
        expect(error.message.startsWith(`[${code}] `)).toBe(true);
      }
    });

    test("degraded service rejects toolkit-pref calls with settings_storage_unavailable", () => {
      const service = makeService(); // never init()ed
      for (const trigger of [
        () => service.readDefaultToolkits(),
        () => service.replaceDefaultToolkitsScope("global", []),
        () => service.migrateLegacyDefaultToolkits({ migrationVersion: 1, scopes: {} }),
        () => service.readToolkitAutoApprove(),
        () => service.replaceToolkitAutoApprove({ toolkits: [], tools: [] }),
        () =>
          service.migrateLegacyToolkitAutoApprove({
            migrationVersion: 1,
            toolkits: [],
            tools: [],
          }),
      ]) {
        expectThrowCode(trigger, "settings_storage_unavailable");
      }
    });
  });
});

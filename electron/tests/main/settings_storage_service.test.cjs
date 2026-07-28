const path = require("path");
const os = require("os");
const fs = require("fs");
const crypto = require("crypto");

// node:sqlite is unavailable under some runtimes, and jest 27's resolver
// mangles `require("node:sqlite")` (it strips the prefix and looks for an npm
// package named `sqlite`). process.getBuiltinModule bypasses jest's resolver.
// Skip the whole suite cleanly when the engine is genuinely missing.
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

const { createSettingsDb } = require(
  "../../main/services/settings_storage/db",
);
const {
  createSettingsStorageService,
  computeLegacyMigrationDigest,
  SETTINGS_STORAGE_LIMITS,
  SENSITIVE_MODEL_PROVIDER_KEYS,
  MCP_ICON_LIMITS,
} = require("../../main/services/settings_storage/service");

const makeTempDir = () =>
  fs.mkdtempSync(path.join(os.tmpdir(), "pupu-settings-storage-"));

const fakeApp = (userDataDir) => ({
  getPath: (key) => {
    if (key === "userData") return userDataDir;
    throw new Error(`unexpected app.getPath(${key})`);
  },
});

// Asserts fn throws an error carrying the given .code (jest 27-safe — no
// asymmetric matcher support in toThrow there).
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

const legacySettingsRoot = () => ({
  app: { setup_completed: true },
  appearance: { theme_mode: "dark_mode", locale: "en" },
  ui: { side_menu_open: true },
  runtime: { workspace_root: "", workspaces: [] },
  memory: { enabled: true, last_n_turns: 8 },
  model_providers: {
    openai_api_key: "sk-legacy-secret",
    anthropic_api_key: "sk-ant-legacy-secret",
    custom_providers: [{ id: "hyperspace" }],
    custom_provider_secrets: { hyperspace: "hs-secret" },
  },
  feature_flags: {},
  dev: { chrome_terminal_enabled: false },
  // unknown top-level namespace: must be imported as-is, never dropped
  future_experiment: { anything: [1, 2, 3] },
});

const legacyPayload = (overrides = {}) => ({
  migrationVersion: 1,
  settingsRoot: legacySettingsRoot(),
  ...overrides,
});

describe("settings storage limits (constants)", () => {
  test("centralized limit constants keep the plan §7.2 values", () => {
    expect(SETTINGS_STORAGE_LIMITS.NAMESPACE_MAX_LENGTH).toBe(100);
    expect(SETTINGS_STORAGE_LIMITS.NAMESPACE_VALUE_MAX_BYTES).toBe(1024 * 1024);
    expect(SETTINGS_STORAGE_LIMITS.MIGRATION_PAYLOAD_MAX_BYTES).toBe(
      10 * 1024 * 1024,
    );
    expect(SETTINGS_STORAGE_LIMITS.NAMESPACE_PATTERN.test("app")).toBe(true);
    expect(
      SETTINGS_STORAGE_LIMITS.NAMESPACE_PATTERN.test("a-z0.9_ok"),
    ).toBe(true);
    expect(SETTINGS_STORAGE_LIMITS.NAMESPACE_PATTERN.test("Nope")).toBe(false);
    expect(SETTINGS_STORAGE_LIMITS.NAMESPACE_PATTERN.test("has space")).toBe(
      false,
    );
  });

  test("sensitive model provider keys are pinned", () => {
    expect([...SENSITIVE_MODEL_PROVIDER_KEYS].sort()).toEqual([
      "anthropic_api_key",
      "custom_provider_secrets",
      "openai_api_key",
    ]);
  });
});

describeIfSqlite("settings db adapter (sqlite)", () => {
  let dir;
  let dbs;

  const makeDb = () => {
    const db = createSettingsDb({
      dbPath: path.join(dir, "settings.db"),
      sqlite,
    });
    dbs.push(db);
    return db;
  };

  beforeEach(() => {
    dir = makeTempDir();
    dbs = [];
  });

  afterEach(() => {
    for (const db of dbs) {
      try {
        db.close();
      } catch (_error) {
        // already closed
      }
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("applies WAL + foreign_keys + busy_timeout pragmas (plan §2.3)", () => {
    const db = makeDb();
    expect(
      db.prepare("SELECT * FROM pragma_journal_mode").get().journal_mode,
    ).toBe("wal");
    expect(
      db.prepare("SELECT * FROM pragma_foreign_keys").get().foreign_keys,
    ).toBe(1);
    expect(db.prepare("SELECT * FROM pragma_busy_timeout").get().timeout).toBe(
      5000,
    );
  });

  test("tx rolls back on error and the connection stays usable", () => {
    const db = makeDb();
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)");
    expect(() =>
      db.tx(() => {
        db.prepare("INSERT INTO t (v) VALUES (?)").run("doomed");
        throw new Error("boom");
      }),
    ).toThrow(/boom/);
    expect(db.prepare("SELECT COUNT(*) AS n FROM t").get().n).toBe(0);

    db.tx(() => {
      db.prepare("INSERT INTO t (v) VALUES (?)").run("landed");
    });
    expect(db.prepare("SELECT COUNT(*) AS n FROM t").get().n).toBe(1);
  });

  test("createSettingsDb throws on missing dependencies", () => {
    expect(() => createSettingsDb({})).toThrow(/missing dependencies/);
  });
});

describeIfSqlite("settings storage service (sqlite)", () => {
  let dir;
  let services;

  const makeService = (appOverride) => {
    const service = createSettingsStorageService({
      app: appOverride || fakeApp(dir),
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

  test("throws on missing dependencies", () => {
    expect(() => createSettingsStorageService({})).toThrow(
      /missing dependencies/,
    );
  });

  test("init creates settings.db; empty-db bootstrap is available with no namespaces", () => {
    const service = makeService();
    service.init();
    expect(fs.existsSync(path.join(dir, "settings.db"))).toBe(true);

    const snapshot = service.getBootstrapSnapshot();
    expect(snapshot.available).toBe(true);
    expect(snapshot.degraded).toBe(false);
    expect(snapshot.schemaVersion).toBe(2);
    expect(snapshot.namespaces).toEqual({});
    expect(snapshot.revisions).toEqual({});
    expect(snapshot.migration).toEqual({
      state: "not_started",
      version: null,
      digest: null,
      migratedAt: null,
    });
  });

  test("mutations before init fail with settings_storage_unavailable", () => {
    const service = makeService();
    expect(service.getBootstrapSnapshot().available).toBe(false);
    expectThrowCode(
      () => service.setNamespace("app", {}),
      "settings_storage_unavailable",
    );
    expectThrowCode(
      () => service.deleteNamespace("app"),
      "settings_storage_unavailable",
    );
    expectThrowCode(
      () => service.migrateLegacy(legacyPayload()),
      "settings_storage_unavailable",
    );
  });

  test("namespace upsert: insert at revision 0, update bumps revision + updatedAt in Unix ms", () => {
    const service = makeService();
    service.init();

    const before = Date.now();
    const first = service.setNamespace("appearance", {
      theme_mode: "dark_mode",
    });
    expect(first).toMatchObject({
      ok: true,
      namespace: "appearance",
      revision: 0,
    });
    expect(first.updatedAt).toBeGreaterThanOrEqual(before);
    expect(first.updatedAt).toBeLessThanOrEqual(Date.now());

    const second = service.setNamespace("appearance", {
      theme_mode: "light_mode",
    });
    expect(second.revision).toBe(1);

    const snapshot = service.getBootstrapSnapshot();
    expect(snapshot.namespaces.appearance).toEqual({
      theme_mode: "light_mode",
    });
    expect(snapshot.revisions.appearance).toBe(1);
  });

  test("setNamespace reserves options.expectedRevision (compare-and-swap)", () => {
    const service = makeService();
    service.init();
    service.setNamespace("ui", { side_menu_open: true }); // revision 0

    const ok = service.setNamespace(
      "ui",
      { side_menu_open: false },
      { expectedRevision: 0 },
    );
    expect(ok.revision).toBe(1);

    // stale expectation → conflict, value untouched
    expectThrowCode(
      () =>
        service.setNamespace(
          "ui",
          { side_menu_open: true },
          { expectedRevision: 0 },
        ),
      "revision_conflict",
    );
    expect(service.getBootstrapSnapshot().namespaces.ui).toEqual({
      side_menu_open: false,
    });

    // expectedRevision on a missing row conflicts too
    expectThrowCode(
      () => service.setNamespace("brand_new", {}, { expectedRevision: 0 }),
      "revision_conflict",
    );

    // malformed expectedRevision is rejected
    expectThrowCode(
      () => service.setNamespace("ui", {}, { expectedRevision: "0" }),
      "invalid_expected_revision",
    );
  });

  test("invalid namespace names are rejected", () => {
    const service = makeService();
    service.init();
    const badNames = [
      "",
      "Uppercase",
      "has space",
      "emoji✨",
      "slash/inside",
      "a".repeat(101),
      42,
      null,
      undefined,
      // matches the charset pattern but is rejected explicitly: on plain
      // object maps it assigns through the Object.prototype accessor
      // (prototype pollution) and the acked write could never be read back
      "__proto__",
    ];
    for (const name of badNames) {
      expectThrowCode(() => service.setNamespace(name, {}), "invalid_namespace");
      expectThrowCode(() => service.deleteNamespace(name), "invalid_namespace");
    }
    // longest legal name is fine
    expect(service.setNamespace("a".repeat(100), { ok: true }).ok).toBe(true);
  });

  test('a smuggled "__proto__" row cannot pollute the bootstrap snapshot maps', () => {
    const service = makeService();
    service.init();
    service.setNamespace("app", { setup_completed: true });
    service.close();

    // Simulate a row written outside the service (validateNamespace rejects
    // this name at the API surface, so raw SQL is the only way in).
    const raw = openRawDb();
    try {
      raw
        .prepare(
          "INSERT INTO settings(namespace, value_json, schema_version, updated_at, revision) " +
            "VALUES (?, ?, 1, ?, 7)",
        )
        .run("__proto__", JSON.stringify({ polluted: true }), Date.now());
    } finally {
      raw.close();
    }

    const reopened = makeService();
    reopened.init();
    const snapshot = reopened.getBootstrapSnapshot();

    // Maps are null-prototype: the row is an own key, not the maps' prototype.
    expect(Object.getPrototypeOf(snapshot.namespaces)).toBeNull();
    expect(Object.getPrototypeOf(snapshot.revisions)).toBeNull();
    expect(
      Object.prototype.hasOwnProperty.call(snapshot.namespaces, "__proto__"),
    ).toBe(true);
    expect(snapshot.namespaces["__proto__"]).toEqual({ polluted: true });
    expect(snapshot.revisions["__proto__"]).toBe(7);

    // No phantom inherited properties, and legit namespaces are untouched.
    expect(snapshot.namespaces.polluted).toBeUndefined();
    expect(snapshot.namespaces.app).toEqual({ setup_completed: true });
    expect(Object.keys(snapshot.namespaces).sort()).toEqual([
      "__proto__",
      "app",
    ]);
  });

  test("undefined / non-JSON / oversize values are rejected", () => {
    const service = makeService();
    service.init();

    expectThrowCode(() => service.setNamespace("app", undefined), "invalid_value");

    const circular = {};
    circular.self = circular;
    expectThrowCode(() => service.setNamespace("app", circular), "invalid_value");

    const oversize = {
      blob: "x".repeat(SETTINGS_STORAGE_LIMITS.NAMESPACE_VALUE_MAX_BYTES + 1),
    };
    const error = expectThrowCode(
      () => service.setNamespace("app", oversize),
      "value_too_large",
    );
    // error messages never contain the value
    expect(error.message).not.toContain("xxx");

    expect(service.getBootstrapSnapshot().namespaces.app).toBeUndefined();
  });

  test("every error message carries a stable [<code>] prefix (survives the IPC boundary)", () => {
    // ipcMain.handle rejections only propagate error.message to the renderer
    // (error.code is stripped), so the code must be parseable from the
    // message itself. Exercise every code in the service's code table.
    const uninitialized = makeService();
    const service = makeService();
    service.init();

    const cases = [
      [
        "settings_storage_unavailable",
        () => uninitialized.setNamespace("app", {}),
      ],
      ["invalid_namespace", () => service.setNamespace("Bad Name", {})],
      ["invalid_value", () => service.setNamespace("app", undefined)],
      [
        "value_too_large",
        () =>
          service.setNamespace("app", {
            blob: "x".repeat(
              SETTINGS_STORAGE_LIMITS.NAMESPACE_VALUE_MAX_BYTES + 1,
            ),
          }),
      ],
      [
        "invalid_expected_revision",
        () => service.setNamespace("app", {}, { expectedRevision: "0" }),
      ],
      [
        "revision_conflict",
        () => service.setNamespace("app", {}, { expectedRevision: 5 }),
      ],
      ["invalid_migration_payload", () => service.migrateLegacy(null)],
      [
        "unsupported_migration_version",
        () => service.migrateLegacy(legacyPayload({ migrationVersion: 99 })),
      ],
      [
        "digest_mismatch",
        () => service.migrateLegacy(legacyPayload({ digest: "deadbeef" })),
      ],
      [
        "payload_too_large",
        () =>
          service.migrateLegacy(
            legacyPayload({
              settingsRoot: {
                huge: {
                  blob: "x".repeat(
                    SETTINGS_STORAGE_LIMITS.MIGRATION_PAYLOAD_MAX_BYTES + 1024,
                  ),
                },
              },
            }),
          ),
      ],
      // Phase 2 store codes (each also locked in its own per-store suite:
      // settings_storage_token_usage / _toolkit_prefs / _computer_use).
      // Listed here too so this test keeps its "every code in the table"
      // exhaustiveness claim.
      [
        "invalid_token_usage_record",
        () => service.appendTokenUsage({ consumed_tokens: 0 }),
      ],
      [
        "invalid_token_usage_query",
        () => service.queryTokenUsage({ limit: 0 }),
      ],
      [
        "invalid_default_toolkits_payload",
        () => service.replaceDefaultToolkitsScope("  ", []),
      ],
      [
        "invalid_toolkit_auto_approve_payload",
        () => service.replaceToolkitAutoApprove({ toolkits: "not-an-array" }),
      ],
      [
        "invalid_computer_use_preference",
        () => service.setComputerUsePreference("unknown_key", {}),
      ],
      // Phase 3 MCP-icon store codes (also locked in the dedicated
      // settings_storage_mcp_icons suite). Listed here so this test keeps its
      // "every code in the table" exhaustiveness claim.
      [
        "invalid_mcp_icon",
        () =>
          service.setMcpIconAsset("mcp.custom.bad-mime", {
            mime: "image/gif",
            content: "AAAA",
          }),
      ],
      [
        "mcp_icon_too_large",
        () =>
          // svg content is stored as raw UTF-8, so its byte length is its
          // string length: overshoot the decoded-byte ceiling directly.
          service.setMcpIconAsset("mcp.custom.too-large", {
            mime: "image/svg+xml",
            content: "x".repeat(MCP_ICON_LIMITS.MAX_DECODED_BYTES + 1),
          }),
      ],
      [
        "mcp_icon_cap_reached",
        () => {
          const smallSvg = { mime: "image/svg+xml", content: "<svg/>" };
          for (let i = 0; i < MCP_ICON_LIMITS.MAX_ENTRIES; i += 1) {
            service.setMcpIconAsset(`mcp.custom.cap-${i}`, smallSvg);
          }
          // The (cap + 1)th distinct owner is refused.
          service.setMcpIconAsset("mcp.custom.cap-overflow", smallSvg);
        },
      ],
      // NOTE: invalid_mcp_icon_path is deliberately NOT triggered here. It is
      // internal-only — resolveMcpIconPath throws it, but every caller either
      // feeds it a generated (safe) filename or catches it to self-heal
      // (getMcpIconAsset drops the hostile row and returns null), so it never
      // crosses the ipcMain boundary and has no renderer-facing surface. Its
      // "[<code>] " prefix comes from the same errorWithCode helper the codes
      // above prove, and its reachability is locked by the
      // settings_storage_mcp_icons "hostile stored relative_path" self-heal test.
      //
      // Phase 4 (S1) provider-credential store codes (also locked in the
      // dedicated settings_storage_provider_credentials suite). Listed here so
      // this test keeps its "every code in the table" exhaustiveness claim.
      // The base `service` above is built WITHOUT safeStorage, so its secret
      // storage status is "unavailable" — a valid write therefore fails closed.
      [
        "invalid_credential",
        () => service.setProviderCredential("not_a_kind", "openai", "sk"),
      ],
      [
        "secret_storage_unavailable",
        () => service.setProviderCredential("provider", "openai", "sk-valid"),
      ],
    ];

    for (const [code, trigger] of cases) {
      const error = expectThrowCode(trigger, code);
      expect(error.message.startsWith(`[${code}] `)).toBe(true);
    }
  });

  test("service.js source stays plain text (no raw control bytes — file(1)/grep must keep working)", () => {
    // A raw NUL once slipped in as a template-literal separator and flipped
    // the whole file to "data" for file(1)/BSD grep, breaking grep-based
    // inspection workflows. Separators must be written as escape sequences.
    const source = fs.readFileSync(
      require.resolve("../../main/services/settings_storage/service.js"),
      "utf8",
    );
    // eslint-disable-next-line no-control-regex
    expect(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(source)).toBe(false);
  });

  test("deleteNamespace removes the row and reports whether it existed", () => {
    const service = makeService();
    service.init();
    service.setNamespace("dev", { chrome_terminal_enabled: true });

    expect(service.deleteNamespace("dev")).toEqual({
      ok: true,
      namespace: "dev",
      deleted: true,
    });
    expect(service.getBootstrapSnapshot().namespaces.dev).toBeUndefined();
    expect(service.deleteNamespace("dev").deleted).toBe(false);
  });

  test("data persists across close + reopen; close is idempotent", () => {
    const first = makeService();
    first.init();
    first.setNamespace("memory", { enabled: true });
    first.close();
    first.close(); // idempotent
    expectThrowCode(
      () => first.setNamespace("memory", {}),
      "settings_storage_unavailable",
    );

    const second = makeService();
    second.init();
    expect(second.getBootstrapSnapshot().namespaces.memory).toEqual({
      enabled: true,
    });
  });

  test("init is a no-op when already initialized", () => {
    const service = makeService();
    service.init();
    service.setNamespace("app", { setup_completed: true });
    service.init();
    expect(service.getBootstrapSnapshot().namespaces.app).toEqual({
      setup_completed: true,
    });
  });

  describe("secret stripping (plan §3.7)", () => {
    test("setNamespace never writes model provider secrets to disk", () => {
      const service = makeService();
      service.init();
      service.setNamespace("model_providers", {
        openai_api_key: "sk-live-secret",
        anthropic_api_key: "sk-ant-live-secret",
        custom_providers: [{ id: "hyperspace" }],
        custom_provider_secrets: { hyperspace: "hs-live-secret" },
      });

      expect(service.getBootstrapSnapshot().namespaces.model_providers).toEqual(
        { custom_providers: [{ id: "hyperspace" }] },
      );

      service.close();
      const raw = openRawDb();
      try {
        const row = raw
          .prepare("SELECT value_json FROM settings WHERE namespace = ?")
          .get("model_providers");
        expect(row.value_json).not.toContain("sk-live-secret");
        expect(row.value_json).not.toContain("sk-ant-live-secret");
        expect(row.value_json).not.toContain("hs-live-secret");
        expect(row.value_json).not.toContain("openai_api_key");
        expect(row.value_json).toContain("custom_providers");
      } finally {
        raw.close();
      }
    });

    test("bootstrap defensively re-strips secrets smuggled into the table", () => {
      const service = makeService();
      service.init();
      service.close();

      // Simulate a row written outside the service (older build / manual edit)
      const raw = openRawDb();
      try {
        raw
          .prepare(
            "INSERT INTO settings(namespace, value_json, schema_version, updated_at, revision) " +
              "VALUES (?, ?, 1, ?, 0)",
          )
          .run(
            "model_providers",
            JSON.stringify({
              openai_api_key: "sk-smuggled",
              custom_providers: [],
            }),
            Date.now(),
          );
      } finally {
        raw.close();
      }

      const reopened = makeService();
      reopened.init();
      const snapshot = reopened.getBootstrapSnapshot();
      expect(snapshot.namespaces.model_providers).toEqual({
        custom_providers: [],
      });
      expect(JSON.stringify(snapshot)).not.toContain("sk-smuggled");
    });
  });

  describe("legacy migration (plan §5)", () => {
    test("imports every namespace (unknown ones included), strips secrets, records meta", () => {
      const service = makeService();
      service.init();

      const result = service.migrateLegacy(legacyPayload());
      expect(result.status).toBe("complete");
      expect(result.ok).toBe(true);
      expect(typeof result.digest).toBe("string");
      expect(result.importedNamespaces.sort()).toEqual(
        Object.keys(legacySettingsRoot()).sort(),
      );

      const snapshot = service.getBootstrapSnapshot();
      expect(snapshot.migration.state).toBe("complete");
      expect(snapshot.migration.version).toBe(1);
      expect(snapshot.migration.digest).toBe(result.digest);
      expect(typeof snapshot.migration.migratedAt).toBe("number");

      // unknown top-level namespace imported as-is
      expect(snapshot.namespaces.future_experiment).toEqual({
        anything: [1, 2, 3],
      });
      expect(snapshot.namespaces.appearance).toEqual({
        theme_mode: "dark_mode",
        locale: "en",
      });
      // secrets stripped on import; other model_providers fields kept
      expect(snapshot.namespaces.model_providers).toEqual({
        custom_providers: [{ id: "hyperspace" }],
      });
      expect(JSON.stringify(snapshot)).not.toContain("sk-legacy-secret");
    });

    test("main recomputes the digest; matching claimed digest accepted, wrong one rejected", () => {
      const service = makeService();
      service.init();

      const goodDigest = computeLegacyMigrationDigest(legacyPayload());
      expectThrowCode(
        () => service.migrateLegacy(legacyPayload({ digest: "deadbeef" })),
        "digest_mismatch",
      );
      expect(service.getBootstrapSnapshot().migration.state).toBe(
        "not_started",
      );

      const result = service.migrateLegacy(
        legacyPayload({ digest: goodDigest }),
      );
      expect(result.status).toBe("complete");
      expect(result.digest).toBe(goodDigest);
    });

    test("digest is stable under key ordering (canonicalized recursively)", () => {
      const a = computeLegacyMigrationDigest({
        migrationVersion: 1,
        settingsRoot: { app: { a: 1, b: { c: 2, d: 3 } } },
      });
      const b = computeLegacyMigrationDigest({
        settingsRoot: { app: { b: { d: 3, c: 2 }, a: 1 } },
        migrationVersion: 1,
      });
      expect(a).toBe(b);
      const c = computeLegacyMigrationDigest({
        migrationVersion: 1,
        settingsRoot: { app: { a: 1, b: { c: 2, d: 999 } } },
      });
      expect(c).not.toBe(a);
      expect(a).toMatch(/^[0-9a-f]{64}$/);
      // the claimed digest field itself is excluded from the digest input
      const withClaim = computeLegacyMigrationDigest({
        migrationVersion: 1,
        settingsRoot: { app: { a: 1, b: { c: 2, d: 3 } } },
        digest: crypto.createHash("sha256").update("noise").digest("hex"),
      });
      expect(withClaim).toBe(a);
    });

    test("payloads with toJSON values (Date): digest matches the stored bytes", () => {
      const service = makeService();
      service.init();
      // canonicalize() alone never calls toJSON, but storage goes through
      // JSON.stringify (which does) — the entry round-trip keeps the digest
      // and the stored bytes in agreement.
      const payload = {
        migrationVersion: 1,
        settingsRoot: {
          app: {
            setup_completed: true,
            last_opened: new Date("2026-07-23T12:00:00.000Z"),
          },
        },
      };

      const result = service.migrateLegacy(payload);
      expect(result.status).toBe("complete");
      expect(result.digest).toBe(
        computeLegacyMigrationDigest(JSON.parse(JSON.stringify(payload))),
      );

      // stored value is the ISO string, exactly what JSON.stringify persists
      const snapshot = service.getBootstrapSnapshot();
      expect(snapshot.namespaces.app).toEqual({
        setup_completed: true,
        last_opened: "2026-07-23T12:00:00.000Z",
      });
      expect(snapshot.migration.digest).toBe(result.digest);

      // and the recorded digest recognizes the same payload again — the
      // idempotent branch, not a spurious refusal
      const again = service.migrateLegacy(payload);
      expect(again.status).toBe("already-complete");
      expect(again.digestMatched).toBe(true);
    });

    test("BigInt in the payload → [invalid_value] error, database untouched", () => {
      const service = makeService();
      service.init();
      const error = expectThrowCode(
        () =>
          service.migrateLegacy({
            migrationVersion: 1,
            settingsRoot: {
              app: { setup_completed: true },
              counters: { total: BigInt(42) },
            },
          }),
        "invalid_value",
      );
      // a coded error with the IPC-safe prefix — not a bare TypeError
      expect(error.message.startsWith("[invalid_value] ")).toBe(true);

      const snapshot = service.getBootstrapSnapshot();
      expect(snapshot.namespaces).toEqual({});
      expect(snapshot.migration.state).toBe("not_started");
    });

    test("same version + digest re-sent after completion → idempotent success", () => {
      const service = makeService();
      service.init();
      const first = service.migrateLegacy(legacyPayload());

      const again = service.migrateLegacy(legacyPayload());
      // the idempotent branch carries its own status, distinct from the
      // refuse-to-overwrite branch ("refused-stale-digest")
      expect(again.status).toBe("already-complete");
      expect(again.alreadyComplete).toBe(true);
      expect(again.digestMatched).toBe(true);
      expect(again.digest).toBe(first.digest);
    });

    test("completed SQL authority refuses to be overwritten by different legacy data", () => {
      const service = makeService();
      service.init();
      service.migrateLegacy(legacyPayload());
      // SQL moves on
      service.setNamespace("appearance", { theme_mode: "light_mode" });

      const staleRoot = legacySettingsRoot();
      staleRoot.appearance = { theme_mode: "dark_mode", locale: "fr" };
      const result = service.migrateLegacy(
        legacyPayload({ settingsRoot: staleRoot }),
      );
      // the refusal branch is explicit — callers never have to infer it from
      // the digestMatched boolean (still present for compatibility)
      expect(result.status).toBe("refused-stale-digest");
      expect(result.alreadyComplete).toBe(true);
      expect(result.digestMatched).toBe(false);
      // authoritative data untouched
      expect(service.getBootstrapSnapshot().namespaces.appearance).toEqual({
        theme_mode: "light_mode",
      });
    });

    test("in_progress residue is treated as incomplete: migration reruns", () => {
      const service = makeService();
      service.init();
      service.close();

      const raw = openRawDb();
      try {
        raw
          .prepare(
            "INSERT INTO meta(key, value) VALUES (?, ?) " +
              "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
          )
          .run("legacy_migration_state", JSON.stringify("in_progress"));
      } finally {
        raw.close();
      }

      const reopened = makeService();
      reopened.init();
      expect(reopened.getBootstrapSnapshot().migration.state).toBe(
        "in_progress",
      );
      const result = reopened.migrateLegacy(legacyPayload());
      expect(result.status).toBe("complete");
      expect(reopened.getBootstrapSnapshot().migration.state).toBe("complete");
    });

    test("a failing entry rolls back the whole migration transaction", () => {
      const service = makeService();
      service.init();
      const root = legacySettingsRoot();
      root["INVALID NAME"] = { boom: true };

      expectThrowCode(
        () => service.migrateLegacy(legacyPayload({ settingsRoot: root })),
        "invalid_namespace",
      );

      const snapshot = service.getBootstrapSnapshot();
      // nothing landed: no namespaces, no in_progress residue
      expect(snapshot.namespaces).toEqual({});
      expect(snapshot.migration.state).toBe("not_started");

      // and a valid retry succeeds on the same connection
      expect(service.migrateLegacy(legacyPayload()).status).toBe("complete");
    });

    test('an own "__proto__" key in settingsRoot fails the migration explicitly (no silent drop, no pollution)', () => {
      const service = makeService();
      service.init();
      // JSON.parse creates a real own "__proto__" property — exactly what a
      // renderer payload looks like after structured clone over IPC.
      const root = JSON.parse(
        '{"app":{"setup_completed":true},"__proto__":{"polluted":true}}',
      );
      expect(Object.prototype.hasOwnProperty.call(root, "__proto__")).toBe(
        true,
      );

      expectThrowCode(
        () => service.migrateLegacy(legacyPayload({ settingsRoot: root })),
        "invalid_namespace",
      );

      // Explicit whole-migration failure, never an acked write that bootstrap
      // silently hides: nothing landed and localStorage stays authoritative.
      const snapshot = service.getBootstrapSnapshot();
      expect(Object.keys(snapshot.namespaces)).toEqual([]);
      expect(snapshot.namespaces.polluted).toBeUndefined();
      expect(snapshot.migration.state).toBe("not_started");
    });

    test("per-namespace 1 MiB limit applies during import (rollback)", () => {
      const service = makeService();
      service.init();
      const root = legacySettingsRoot();
      root.bloated = {
        blob: "x".repeat(
          SETTINGS_STORAGE_LIMITS.NAMESPACE_VALUE_MAX_BYTES + 1,
        ),
      };

      expectThrowCode(
        () => service.migrateLegacy(legacyPayload({ settingsRoot: root })),
        "value_too_large",
      );
      expect(service.getBootstrapSnapshot().namespaces).toEqual({});
      expect(service.getBootstrapSnapshot().migration.state).toBe(
        "not_started",
      );
    });

    test("total payload over 10 MiB is rejected up front", () => {
      const service = makeService();
      service.init();
      const root = {
        huge: {
          blob: "x".repeat(
            SETTINGS_STORAGE_LIMITS.MIGRATION_PAYLOAD_MAX_BYTES + 1024,
          ),
        },
      };
      expectThrowCode(
        () => service.migrateLegacy(legacyPayload({ settingsRoot: root })),
        "payload_too_large",
      );
    });

    test("invalid payload shapes and versions are rejected", () => {
      const service = makeService();
      service.init();
      expectThrowCode(
        () => service.migrateLegacy(null),
        "invalid_migration_payload",
      );
      expectThrowCode(
        () => service.migrateLegacy(legacyPayload({ migrationVersion: 2 })),
        "unsupported_migration_version",
      );
      expectThrowCode(
        () =>
          service.migrateLegacy({ migrationVersion: 1, settingsRoot: "nope" }),
        "invalid_migration_payload",
      );
      expectThrowCode(
        () => service.migrateLegacy(legacyPayload({ standalone: "nope" })),
        "invalid_migration_payload",
      );
    });

    test("standalone region is accepted in the payload but not imported in Phase 1A", () => {
      const service = makeService();
      service.init();
      const result = service.migrateLegacy(
        legacyPayload({ standalone: { token_usage: { records: [] } } }),
      );
      expect(result.status).toBe("complete");
      const snapshot = service.getBootstrapSnapshot();
      expect(snapshot.namespaces.token_usage).toBeUndefined();
      expect(snapshot.namespaces.standalone).toBeUndefined();
    });
  });

  describe("corruption / degraded mode (plan §7.3)", () => {
    test("unopenable settings.db → degraded init, file preserved, mutations error", () => {
      const garbage = "definitely not a sqlite database ✂✂✂";
      fs.writeFileSync(path.join(dir, "settings.db"), garbage, "utf8");
      const errorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      try {
        const service = makeService();
        expect(() => service.init()).not.toThrow();

        const snapshot = service.getBootstrapSnapshot();
        expect(snapshot.available).toBe(false);
        expect(snapshot.degraded).toBe(true);
        expect(typeof snapshot.reason).toBe("string");

        expectThrowCode(
          () => service.setNamespace("app", {}),
          "settings_storage_unavailable",
        );
        expectThrowCode(
          () => service.migrateLegacy(legacyPayload()),
          "settings_storage_unavailable",
        );

        // never deleted, never overwritten
        expect(fs.readFileSync(path.join(dir, "settings.db"), "utf8")).toBe(
          garbage,
        );
        expect(errorSpy).toHaveBeenCalled();
      } finally {
        errorSpy.mockRestore();
      }
    });

    test("a single corrupt namespace row is skipped; others survive bootstrap", () => {
      const service = makeService();
      service.init();
      service.setNamespace("app", { setup_completed: true });
      service.close();

      const raw = openRawDb();
      try {
        raw
          .prepare(
            "INSERT INTO settings(namespace, value_json, schema_version, updated_at, revision) " +
              "VALUES (?, ?, 1, ?, 0)",
          )
          .run("broken", "{ not json", Date.now());
      } finally {
        raw.close();
      }

      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
      try {
        const reopened = makeService();
        reopened.init();
        const snapshot = reopened.getBootstrapSnapshot();
        expect(snapshot.available).toBe(true);
        expect(snapshot.namespaces.app).toEqual({ setup_completed: true });
        expect(snapshot.namespaces.broken).toBeUndefined();
        expect(warnSpy).toHaveBeenCalled();
      } finally {
        warnSpy.mockRestore();
      }
    });
  });

  test("settings.db never touches chats.db", () => {
    const service = makeService();
    service.init();
    service.setNamespace("app", { setup_completed: true });
    expect(fs.existsSync(path.join(dir, "settings.db"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "chats.db"))).toBe(false);
  });
});

// ---- Phase 5: reset settings + read-only db stats (plan §6-Phase5) ---------

describeIfSqlite("settings storage reset + db stats (sqlite)", () => {
  let dir;
  let services;

  // Deterministic fake safeStorage so a reset test can seed a real
  // provider_credentials row and assert the reset PRESERVES it.
  const makeFakeSafeStorage = () => ({
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => "gnome_libsecret",
    encryptString: (str) => Buffer.from(`enc::${str}`, "utf8"),
    decryptString: (buf) => Buffer.from(buf).toString("utf8").replace(/^enc::/, ""),
  });

  const makeService = () => {
    const service = createSettingsStorageService({
      app: fakeApp(dir),
      fs,
      path,
      sqlite,
      safeStorage: makeFakeSafeStorage(),
      // darwin: gate-3 keyring check skipped, so setProviderCredential works.
      platform: "darwin",
    });
    services.push(service);
    return service;
  };

  const openRawDb = () => new sqlite.DatabaseSync(path.join(dir, "settings.db"));

  const countRows = (table) => {
    const raw = openRawDb();
    try {
      return Number(raw.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c);
    } finally {
      raw.close();
    }
  };

  // Seed one row into every reset-relevant + reset-preserved table.
  const seedEverything = (service) => {
    service.setNamespace("app", { setup_completed: true });
    service.setNamespace("appearance", { theme_mode: "dark_mode" });
    service.replaceDefaultToolkitsScope("global", ["core", "web"]);
    service.replaceToolkitAutoApprove({ toolkits: ["core"], tools: [] });
    service.setComputerUsePreference("enabled", {
      version: 1,
      enabled: true,
      updatedAt: new Date().toISOString(),
    });
    service.appendTokenUsage({
      timestamp: Date.now(),
      provider: "openai",
      model: "gpt-4.1",
      model_id: "openai:gpt-4.1",
      consumed_tokens: 100,
      input_tokens: 60,
      output_tokens: 40,
    });
    service.setProviderCredential("provider", "openai", "sk-preserve-me");
  };

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

  test("resetSettings before init fails with settings_storage_unavailable", () => {
    const service = makeService();
    expectThrowCode(() => service.resetSettings(), "settings_storage_unavailable");
  });

  test("resetSettings clears settings + preference tables, preserves secrets/token/icons (meta only partially)", () => {
    const service = makeService();
    service.init();
    seedEverything(service);

    // Sanity: everything is present before the reset.
    expect(countRows("settings")).toBeGreaterThan(0);
    expect(countRows("default_toolkits")).toBeGreaterThan(0);
    expect(countRows("toolkit_auto_approve")).toBeGreaterThan(0);
    expect(countRows("computer_use_preferences")).toBeGreaterThan(0);
    expect(countRows("token_usage_records")).toBe(1);
    expect(countRows("provider_credentials")).toBe(1);

    const result = service.resetSettings();
    expect(result.ok).toBe(true);
    expect(result.cleared.settings).toBeGreaterThan(0);
    expect(result.cleared.default_toolkits).toBeGreaterThan(0);
    expect(result.cleared.toolkit_auto_approve).toBeGreaterThan(0);
    expect(result.cleared.computer_use_preferences).toBeGreaterThan(0);
    // `meta` is deliberately absent: its migration-state keys survive, but the
    // reset clears the default_toolkits empty-scopes key, so the table is only
    // partially preserved and is not listed as a wholly-preserved table.
    expect([...result.preserved].sort()).toEqual([
      "asset_metadata",
      "provider_credentials",
      "token_usage_records",
    ]);
    expect(result.preserved).not.toContain("meta");

    // Cleared tables are empty.
    expect(countRows("settings")).toBe(0);
    expect(countRows("default_toolkits")).toBe(0);
    expect(countRows("toolkit_auto_approve")).toBe(0);
    expect(countRows("tool_auto_approve")).toBe(0);
    expect(countRows("computer_use_preferences")).toBe(0);

    // Preserved tables are UNTOUCHED.
    expect(countRows("token_usage_records")).toBe(1);
    expect(countRows("provider_credentials")).toBe(1);
    // meta still holds the migration schema_version row.
    expect(countRows("meta")).toBeGreaterThan(0);

    // The preserved secret is still decryptable after the reset.
    expect(service.readDecryptedProviderSecret("provider", "openai")).toBe(
      "sk-preserve-me",
    );

    // Bootstrap now reads back an empty settings surface (stores → defaults).
    const snapshot = service.getBootstrapSnapshot();
    expect(snapshot.namespaces).toEqual({});
  });

  test("resetSettings clears the default_toolkits explicit-empty-scopes meta", () => {
    const service = makeService();
    service.init();
    // Explicitly empty a scope: it persists as [] via the empty-scopes meta.
    service.replaceDefaultToolkitsScope("global", []);
    service.resetSettings();
    // After reset the scope reads back the ["core"] default, not [].
    const scopes = service.readDefaultToolkits().scopes;
    expect(scopes.global === undefined || scopes.global).toBeTruthy();
    const globalScope = scopes.global;
    if (globalScope !== undefined) {
      expect(globalScope).not.toEqual([]);
    }
  });

  test("getDbStats returns metadata only (size + per-table row counts)", () => {
    const service = makeService();
    service.init();
    seedEverything(service);

    const stats = service.getDbStats();
    expect(stats.ok).toBe(true);
    expect(typeof stats.sizeBytes).toBe("number");
    expect(stats.sizeBytes).toBeGreaterThan(0);
    expect(Array.isArray(stats.tables)).toBe(true);

    const byName = Object.fromEntries(
      stats.tables.map((entry) => [entry.name, entry.rows]),
    );
    expect(byName.settings).toBeGreaterThan(0);
    expect(byName.token_usage_records).toBe(1);
    expect(byName.provider_credentials).toBe(1);

    // Metadata only: every table entry is exactly { name, rows } — no values.
    for (const entry of stats.tables) {
      expect(Object.keys(entry).sort()).toEqual(["name", "rows"]);
      expect(typeof entry.rows).toBe("number");
    }
    // The stats JSON must never carry a stored secret.
    expect(JSON.stringify(stats)).not.toContain("sk-preserve-me");
  });

  test("getDbStats before init fails with settings_storage_unavailable", () => {
    const service = makeService();
    expectThrowCode(() => service.getDbStats(), "settings_storage_unavailable");
  });
});

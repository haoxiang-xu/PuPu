const path = require("path");
const os = require("os");
const fs = require("fs");

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

const {
  createSettingsStorageService,
  computeLegacyMigrationDigest,
  TOKEN_USAGE_LIMITS,
} = require("../../main/services/settings_storage/service");

const makeTempDir = () =>
  fs.mkdtempSync(path.join(os.tmpdir(), "pupu-settings-token-usage-"));

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

const record = (overrides = {}) => ({
  timestamp: 1000,
  provider: "openai",
  model: "gpt-5",
  model_id: "openai:gpt-5",
  consumed_tokens: 42,
  input_tokens: 30,
  output_tokens: 12,
  ...overrides,
});

const migrationPayload = (records, overrides = {}) => ({
  migrationVersion: 1,
  records,
  ...overrides,
});

describe("token usage limits (constants)", () => {
  test("centralized limit constants keep the plan §7.2 / §3.2 values", () => {
    expect(TOKEN_USAGE_LIMITS.STRING_MAX_LENGTH).toBe(256);
    expect(TOKEN_USAGE_LIMITS.MAX_TOKEN_VALUE).toBe(Number.MAX_SAFE_INTEGER);
    expect(TOKEN_USAGE_LIMITS.QUERY_MAX_LIMIT).toBe(50000);
    expect(TOKEN_USAGE_LIMITS.QUERY_DEFAULT_LIMIT).toBe(50000);
  });
});

describeIfSqlite("settings storage token usage (sqlite)", () => {
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

  const countRows = (service) =>
    service.queryTokenUsage({}).records.length;

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

  describe("schema v2 (plan §3.2)", () => {
    test("fresh init creates token_usage_records + indexes and records schema_version 2", () => {
      const service = makeService();
      service.init();
      expect(service.getBootstrapSnapshot().schemaVersion).toBe(2);
      service.close();

      const raw = openRawDb();
      try {
        const table = raw
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'token_usage_records'",
          )
          .get();
        expect(table).toBeDefined();
        const indexes = raw
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'token_usage_records' AND name LIKE 'idx_%'",
          )
          .all()
          .map((row) => row.name)
          .sort();
        expect(indexes).toEqual([
          "idx_token_usage_chat",
          "idx_token_usage_provider_model",
          "idx_token_usage_timestamp",
        ]);
      } finally {
        raw.close();
      }
    });

    test("a v1 database reopened by this build upgrades in place, data preserved", () => {
      // Simulate a Phase 1 database: meta + settings only, schema_version 1.
      const raw = new sqlite.DatabaseSync(path.join(dir, "settings.db"));
      try {
        raw.exec(
          "CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);" +
            "CREATE TABLE settings (namespace TEXT PRIMARY KEY, value_json TEXT NOT NULL, " +
            "schema_version INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL, " +
            "revision INTEGER NOT NULL DEFAULT 0);",
        );
        raw
          .prepare("INSERT INTO meta(key, value) VALUES (?, ?)")
          .run("schema_version", JSON.stringify(1));
        raw
          .prepare(
            "INSERT INTO settings(namespace, value_json, schema_version, updated_at, revision) " +
              "VALUES (?, ?, 1, ?, 3)",
          )
          .run("app", JSON.stringify({ setup_completed: true }), Date.now());
      } finally {
        raw.close();
      }

      const service = makeService();
      service.init();
      const snapshot = service.getBootstrapSnapshot();
      expect(snapshot.schemaVersion).toBe(2);
      expect(snapshot.namespaces.app).toEqual({ setup_completed: true });
      expect(snapshot.revisions.app).toBe(3);
      // token usage store is usable immediately after the upgrade
      expect(service.appendTokenUsage(record()).ok).toBe(true);
      expect(countRows(service)).toBe(1);
    });

    test("namespace rows keep per-row schema_version 1 after the db-level bump", () => {
      const service = makeService();
      service.init();
      service.setNamespace("ui", { side_menu_open: true });
      service.close();

      const raw = openRawDb();
      try {
        const row = raw
          .prepare("SELECT schema_version FROM settings WHERE namespace = ?")
          .get("ui");
        expect(Number(row.schema_version)).toBe(1);
      } finally {
        raw.close();
      }
    });

    test("a newer stored schema_version is never downgraded", () => {
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
          .run("schema_version", JSON.stringify(3));
      } finally {
        raw.close();
      }

      const reopened = makeService();
      reopened.init();
      expect(reopened.getBootstrapSnapshot().schemaVersion).toBe(3);
    });
  });

  describe("appendTokenUsage", () => {
    test("stores a full record and returns its rowid", () => {
      const service = makeService();
      service.init();
      const first = service.appendTokenUsage(
        record({
          cache_read_input_tokens: 7,
          cache_creation_input_tokens: 3,
          max_context_window_tokens: 128000,
          chatId: "chat-1",
        }),
      );
      expect(first).toEqual({ ok: true, id: 1 });
      expect(service.appendTokenUsage(record()).id).toBe(2);

      const { records } = service.queryTokenUsage({});
      expect(records[0]).toEqual({
        timestamp: 1000,
        provider: "openai",
        model: "gpt-5",
        model_id: "openai:gpt-5",
        consumed_tokens: 42,
        input_tokens: 30,
        output_tokens: 12,
        cache_read_input_tokens: 7,
        cache_creation_input_tokens: 3,
        max_context_window_tokens: 128000,
        chatId: "chat-1",
      });
      // omitted optional fields stay absent — legacy read shape, not nulls
      expect(records[1]).toEqual({
        timestamp: 1000,
        provider: "openai",
        model: "gpt-5",
        model_id: "openai:gpt-5",
        consumed_tokens: 42,
        input_tokens: 30,
        output_tokens: 12,
      });
    });

    test("keeps the legacy normalize semantics (derive consumed, default strings, drop bad cache values)", () => {
      const service = makeService();
      service.init();
      service.appendTokenUsage({
        timestamp: 5,
        input_tokens: 80,
        output_tokens: 43,
        provider: 42, // non-string → "unknown"
        cache_read_input_tokens: -3, // non-positive → dropped, not an error
      });
      const { records } = service.queryTokenUsage({});
      expect(records).toEqual([
        {
          timestamp: 5,
          provider: "unknown",
          model: "unknown",
          model_id: "unknown",
          consumed_tokens: 123,
          input_tokens: 80,
          output_tokens: 43,
        },
      ]);
    });

    test("rejects records that violate the §7.2 gates", () => {
      const service = makeService();
      service.init();
      const badRecords = [
        null,
        "nope",
        [],
        record({ consumed_tokens: 0, input_tokens: 0, output_tokens: 0 }),
        record({ consumed_tokens: NaN, input_tokens: 0, output_tokens: 0 }),
        record({ consumed_tokens: Infinity, input_tokens: 0, output_tokens: 0 }),
        record({ consumed_tokens: -5, input_tokens: 0, output_tokens: 0 }),
        record({ timestamp: 1.5 }),
        record({ timestamp: -1 }),
        record({ timestamp: NaN }),
        record({ timestamp: Number.MAX_SAFE_INTEGER + 2 }),
        record({ consumed_tokens: 2 ** 53 }),
        record({ provider: "p".repeat(257) }),
        record({ model_id: "m".repeat(257) }),
        record({ chatId: "c".repeat(257) }),
      ];
      for (const bad of badRecords) {
        expectThrowCode(
          () => service.appendTokenUsage(bad),
          "invalid_token_usage_record",
        );
      }
      expect(countRows(service)).toBe(0);
    });

    test("error messages carry the stable [<code>] prefix and no record contents", () => {
      const service = makeService();
      service.init();
      const error = expectThrowCode(
        () => service.appendTokenUsage(record({ provider: "sekret".repeat(64) })),
        "invalid_token_usage_record",
      );
      expect(error.message.startsWith("[invalid_token_usage_record] ")).toBe(
        true,
      );
      expect(error.message).not.toContain("sekret");
    });

    test("fails with settings_storage_unavailable before init", () => {
      const service = makeService();
      expectThrowCode(
        () => service.appendTokenUsage(record()),
        "settings_storage_unavailable",
      );
      expectThrowCode(
        () => service.queryTokenUsage({}),
        "settings_storage_unavailable",
      );
      expectThrowCode(
        () => service.clearTokenUsage(),
        "settings_storage_unavailable",
      );
      expectThrowCode(
        () => service.migrateLegacyTokenUsage(migrationPayload([])),
        "settings_storage_unavailable",
      );
    });
  });

  describe("queryTokenUsage", () => {
    const seed = (service) => {
      // inserted out of chronological order on purpose
      service.appendTokenUsage(record({ timestamp: 3000, model_id: "c" }));
      service.appendTokenUsage(record({ timestamp: 1000, model_id: "a" }));
      service.appendTokenUsage(record({ timestamp: 2000, model_id: "b" }));
    };

    test("returns rows ordered by timestamp ASC regardless of insert order", () => {
      const service = makeService();
      service.init();
      seed(service);
      const { records } = service.queryTokenUsage({});
      expect(records.map((r) => r.model_id)).toEqual(["a", "b", "c"]);
    });

    test("range bounds are inclusive; either bound is optional", () => {
      const service = makeService();
      service.init();
      seed(service);
      expect(
        service
          .queryTokenUsage({ startMs: 1000, endMs: 2000 })
          .records.map((r) => r.timestamp),
      ).toEqual([1000, 2000]);
      expect(
        service.queryTokenUsage({ startMs: 2000 }).records.map((r) => r.timestamp),
      ).toEqual([2000, 3000]);
      expect(
        service.queryTokenUsage({ endMs: 1999 }).records.map((r) => r.timestamp),
      ).toEqual([1000]);
      expect(
        service.queryTokenUsage({ startMs: 4000 }).records,
      ).toEqual([]);
    });

    test("truncation keeps the NEWEST rows (offset pages backwards); output stays oldest-first", () => {
      // A limited query must never drop recent usage in favor of ancient
      // usage (the 'All' range on a >50k-row table). The scan is newest-first
      // and the page is reversed back to oldest-first for the caller.
      const service = makeService();
      service.init();
      seed(service);
      expect(
        service.queryTokenUsage({ limit: 2 }).records.map((r) => r.timestamp),
      ).toEqual([2000, 3000]);
      expect(
        service
          .queryTokenUsage({ limit: 2, offset: 2 })
          .records.map((r) => r.timestamp),
      ).toEqual([1000]);
      expect(
        service
          .queryTokenUsage({ limit: 1, offset: 1 })
          .records.map((r) => r.timestamp),
      ).toEqual([2000]);
    });

    test("ties on timestamp keep insertion (id) order — the migration order guarantee", () => {
      const service = makeService();
      service.init();
      service.appendTokenUsage(record({ timestamp: 500, model_id: "first" }));
      service.appendTokenUsage(record({ timestamp: 500, model_id: "second" }));
      expect(
        service.queryTokenUsage({}).records.map((r) => r.model_id),
      ).toEqual(["first", "second"]);
      // and under truncation the tie drops the OLDEST insertion first
      expect(
        service.queryTokenUsage({ limit: 1 }).records.map((r) => r.model_id),
      ).toEqual(["second"]);
    });

    test("undefined / null queries are accepted; malformed ones are rejected with the coded prefix", () => {
      const service = makeService();
      service.init();
      seed(service);
      expect(service.queryTokenUsage().records.length).toBe(3);
      expect(service.queryTokenUsage(null).records.length).toBe(3);

      const badQueries = [
        42,
        "range",
        [],
        { startMs: "yesterday" },
        { startMs: 1.5 },
        { endMs: NaN },
        { limit: 0 },
        { limit: -1 },
        { limit: 1.5 },
        { offset: -1 },
        { offset: 0.5 },
      ];
      for (const bad of badQueries) {
        const error = expectThrowCode(
          () => service.queryTokenUsage(bad),
          "invalid_token_usage_query",
        );
        expect(
          error.message.startsWith("[invalid_token_usage_query] "),
        ).toBe(true);
      }
    });
  });

  describe("clearTokenUsage", () => {
    test("deletes every row, reports the count, and resets AUTOINCREMENT", () => {
      const service = makeService();
      service.init();
      service.appendTokenUsage(record());
      service.appendTokenUsage(record());
      expect(service.clearTokenUsage()).toEqual({ ok: true, cleared: 2 });
      expect(countRows(service)).toBe(0);
      // AUTOINCREMENT reset: the next insert starts over at rowid 1
      expect(service.appendTokenUsage(record()).id).toBe(1);
    });

    test("clearing an empty table is a no-op ack", () => {
      const service = makeService();
      service.init();
      expect(service.clearTokenUsage()).toEqual({ ok: true, cleared: 0 });
    });
  });

  describe("migrateLegacyTokenUsage (per-store migration)", () => {
    const legacyRecords = () => [
      record({ timestamp: 100, model_id: "old-a" }),
      record({ timestamp: 100, model_id: "old-b" }), // same ms — order must hold
      record({ timestamp: 300, model_id: "old-c" }),
    ];

    test("bootstrap snapshot exposes per-store migration meta (storeMigrations)", () => {
      // The renderer stores arbitrate marker-vs-SQL migration state from the
      // snapshot: a localStorage marker can outlive a reset settings.db, and
      // SQL is the authority when they disagree.
      const service = makeService();
      service.init();

      const fresh = service.getBootstrapSnapshot().storeMigrations;
      expect(fresh.tokenUsage.state).toBe("not_started");
      expect(fresh.defaultToolkits.state).toBe("not_started");
      expect(fresh.toolkitAutoApprove.state).toBe("not_started");
      expect(fresh.computerUse.state).toBe("not_started");

      const result = service.migrateLegacyTokenUsage(
        migrationPayload(legacyRecords()),
      );
      const after = service.getBootstrapSnapshot().storeMigrations;
      expect(after.tokenUsage).toEqual({
        state: "complete",
        version: 1,
        digest: result.digest,
        migratedAt: result.migratedAt,
      });
      // other stores' meta untouched
      expect(after.defaultToolkits.state).toBe("not_started");
    });

    test("imports oldest-first in payload order and records the meta marker", () => {
      const service = makeService();
      service.init();
      const result = service.migrateLegacyTokenUsage(
        migrationPayload(legacyRecords()),
      );
      expect(result.status).toBe("complete");
      expect(result.ok).toBe(true);
      expect(result.importedCount).toBe(3);
      expect(typeof result.digest).toBe("string");
      expect(typeof result.migratedAt).toBe("number");

      expect(
        service.queryTokenUsage({}).records.map((r) => r.model_id),
      ).toEqual(["old-a", "old-b", "old-c"]);

      service.close();
      const raw = openRawDb();
      try {
        const readMeta = (key) =>
          JSON.parse(
            raw.prepare("SELECT value FROM meta WHERE key = ?").get(key).value,
          );
        expect(readMeta("token_usage_migration_state")).toBe("complete");
        expect(readMeta("token_usage_migration_version")).toBe(1);
        expect(readMeta("token_usage_migration_digest")).toBe(result.digest);
        expect(typeof readMeta("token_usage_migrated_at")).toBe("number");
      } finally {
        raw.close();
      }
    });

    test("same version + digest replay is idempotent: zero duplicate inserts", () => {
      const service = makeService();
      service.init();
      const first = service.migrateLegacyTokenUsage(
        migrationPayload(legacyRecords()),
      );
      expect(countRows(service)).toBe(3);

      const again = service.migrateLegacyTokenUsage(
        migrationPayload(legacyRecords()),
      );
      expect(again.status).toBe("already-complete");
      expect(again.alreadyComplete).toBe(true);
      expect(again.digestMatched).toBe(true);
      expect(again.digest).toBe(first.digest);
      expect(countRows(service)).toBe(3);
    });

    test("completed store refuses different legacy data (stale digest), rows untouched", () => {
      const service = makeService();
      service.init();
      service.migrateLegacyTokenUsage(migrationPayload(legacyRecords()));
      service.appendTokenUsage(record({ timestamp: 9000, model_id: "new" }));

      const result = service.migrateLegacyTokenUsage(
        migrationPayload([record({ timestamp: 1, model_id: "stale" })]),
      );
      expect(result.status).toBe("refused-stale-digest");
      expect(result.digestMatched).toBe(false);
      expect(countRows(service)).toBe(4);
      expect(
        service.queryTokenUsage({}).records.some((r) => r.model_id === "stale"),
      ).toBe(false);
    });

    test("a single invalid record rolls back the whole import (all-or-nothing)", () => {
      const service = makeService();
      service.init();
      // pre-existing appended row must survive the rollback
      service.appendTokenUsage(record({ timestamp: 50, model_id: "kept" }));

      const records = legacyRecords();
      records.push(record({ timestamp: -1, model_id: "poison" }));
      expectThrowCode(
        () => service.migrateLegacyTokenUsage(migrationPayload(records)),
        "invalid_token_usage_record",
      );

      const remaining = service.queryTokenUsage({}).records;
      expect(remaining.map((r) => r.model_id)).toEqual(["kept"]);
      service.close();
      const raw = openRawDb();
      try {
        const stateRow = raw
          .prepare("SELECT value FROM meta WHERE key = ?")
          .get("token_usage_migration_state");
        // no in_progress residue either — the meta write rolled back too
        expect(stateRow).toBeUndefined();
      } finally {
        raw.close();
      }
    });

    test("in_progress residue from an interrupted run reruns cleanly", () => {
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
          .run("token_usage_migration_state", JSON.stringify("in_progress"));
      } finally {
        raw.close();
      }

      const reopened = makeService();
      reopened.init();
      const result = reopened.migrateLegacyTokenUsage(
        migrationPayload(legacyRecords()),
      );
      expect(result.status).toBe("complete");
      expect(countRows(reopened)).toBe(3);
    });

    test("the main process recomputes the digest; a wrong claimed digest is rejected", () => {
      const service = makeService();
      service.init();
      expectThrowCode(
        () =>
          service.migrateLegacyTokenUsage(
            migrationPayload(legacyRecords(), { digest: "deadbeef" }),
          ),
        "digest_mismatch",
      );
      expect(countRows(service)).toBe(0);

      const goodDigest = computeLegacyMigrationDigest(
        migrationPayload(legacyRecords()),
      );
      const result = service.migrateLegacyTokenUsage(
        migrationPayload(legacyRecords(), { digest: goodDigest }),
      );
      expect(result.status).toBe("complete");
      expect(result.digest).toBe(goodDigest);
    });

    test("invalid payload shapes, versions and sizes are rejected", () => {
      const service = makeService();
      service.init();
      expectThrowCode(
        () => service.migrateLegacyTokenUsage(null),
        "invalid_migration_payload",
      );
      expectThrowCode(
        () => service.migrateLegacyTokenUsage(migrationPayload([], { migrationVersion: 99 })),
        "unsupported_migration_version",
      );
      expectThrowCode(
        () =>
          service.migrateLegacyTokenUsage({ migrationVersion: 1, records: "nope" }),
        "invalid_migration_payload",
      );
      expectThrowCode(
        () =>
          service.migrateLegacyTokenUsage(
            migrationPayload([record({ counter: BigInt(1) })]),
          ),
        "invalid_value",
      );
      expectThrowCode(
        () =>
          service.migrateLegacyTokenUsage(
            migrationPayload([
              record({ provider: "x".repeat(11 * 1024 * 1024) }),
            ]),
          ),
        "payload_too_large",
      );
      expect(countRows(service)).toBe(0);
    });

    test("token usage migration is isolated from the settings-root migration meta", () => {
      const service = makeService();
      service.init();
      service.migrateLegacyTokenUsage(migrationPayload(legacyRecords()));

      const snapshot = service.getBootstrapSnapshot();
      // settings-root migration untouched, no namespaces created
      expect(snapshot.migration.state).toBe("not_started");
      expect(snapshot.namespaces).toEqual({});

      // and the root migration leaves token usage rows alone
      service.migrateLegacy({
        migrationVersion: 1,
        settingsRoot: { app: { setup_completed: true } },
      });
      expect(countRows(service)).toBe(3);
    });
  });
});

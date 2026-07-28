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
  COMPUTER_USE_LIMITS,
  COMPUTER_USE_PREF_KEYS,
} = require("../../main/services/settings_storage/service");

const makeTempDir = () =>
  fs.mkdtempSync(path.join(os.tmpdir(), "pupu-settings-computer-use-"));

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

const ISO = "2026-07-24T10:00:00.000Z";
const consentRecord = (overrides = {}) => ({
  version: 1,
  acceptedAt: ISO,
  ...overrides,
});
const enabledRecord = (overrides = {}) => ({
  version: 1,
  enabled: true,
  updatedAt: ISO,
  ...overrides,
});

const migrationPayload = (records, overrides = {}) => ({
  migrationVersion: 1,
  records,
  ...overrides,
});

describe("computer use limits (constants)", () => {
  test("centralized constants keep the plan §3.4 key set and caps", () => {
    expect([...COMPUTER_USE_PREF_KEYS].sort()).toEqual([
      "consent",
      "enabled",
      "local_beta_enabled",
    ]);
    expect(COMPUTER_USE_LIMITS.ISO_TIMESTAMP_MAX_LENGTH).toBe(64);
    expect(COMPUTER_USE_LIMITS.VALUE_MAX_BYTES).toBe(4096);
  });
});

describeIfSqlite("settings storage computer use prefs (sqlite)", () => {
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

  describe("schema (plan §3.4)", () => {
    test("fresh init creates the computer_use_preferences table with the plan columns", () => {
      const service = makeService();
      service.init();
      service.close();

      const raw = openRawDb();
      try {
        const columns = raw
          .prepare("PRAGMA table_info(computer_use_preferences)")
          .all()
          .map((row) => row.name)
          .sort();
        expect(columns).toEqual([
          "key",
          "schema_version",
          "updated_at",
          "value_json",
        ]);
      } finally {
        raw.close();
      }
    });
  });

  describe("KV CRUD", () => {
    test("set + read-all round-trips all three keys with fields preserved verbatim", () => {
      const service = makeService();
      service.init();

      expect(service.setComputerUsePreference("consent", consentRecord())).toEqual(
        { ok: true, key: "consent" },
      );
      service.setComputerUsePreference("enabled", enabledRecord());
      service.setComputerUsePreference(
        "local_beta_enabled",
        enabledRecord({ enabled: false }),
      );

      const { ok, entries } = service.readComputerUsePreferences();
      expect(ok).toBe(true);
      expect(entries.consent).toEqual(consentRecord());
      expect(entries.enabled).toEqual(enabledRecord());
      expect(entries.local_beta_enabled).toEqual(
        enabledRecord({ enabled: false }),
      );
      // null-prototype map (own keys only, never a prototype write)
      expect(Object.getPrototypeOf(entries)).toBeNull();
    });

    test("rows survive a service reopen and schema_version mirrors the record version", () => {
      const service = makeService();
      service.init();
      service.setComputerUsePreference("consent", consentRecord({ version: 3 }));
      service.close();

      const reopened = makeService();
      reopened.init();
      expect(reopened.readComputerUsePreferences().entries.consent).toEqual(
        consentRecord({ version: 3 }),
      );

      const raw = openRawDb();
      try {
        const row = raw
          .prepare(
            "SELECT schema_version FROM computer_use_preferences WHERE key = 'consent'",
          )
          .get();
        expect(Number(row.schema_version)).toBe(3);
      } finally {
        raw.close();
      }
    });

    test("set is an upsert (last write wins) and clear removes the row", () => {
      const service = makeService();
      service.init();
      service.setComputerUsePreference("enabled", enabledRecord());
      service.setComputerUsePreference(
        "enabled",
        enabledRecord({ enabled: false }),
      );
      expect(
        service.readComputerUsePreferences().entries.enabled.enabled,
      ).toBe(false);

      expect(service.clearComputerUsePreference("enabled")).toEqual({
        ok: true,
        key: "enabled",
        cleared: true,
      });
      expect(
        service.readComputerUsePreferences().entries.enabled,
      ).toBeUndefined();
      // clearing an absent key is an explicit no-op ack
      expect(service.clearComputerUsePreference("enabled").cleared).toBe(false);
    });

    test("unknown keys are rejected on set and clear with the coded prefix", () => {
      const service = makeService();
      service.init();
      for (const key of ["", "Consent", "__proto__", 42, null, "other"]) {
        const error = expectThrowCode(
          () => service.setComputerUsePreference(key, consentRecord()),
          "invalid_computer_use_preference",
        );
        expect(
          error.message.startsWith("[invalid_computer_use_preference] "),
        ).toBe(true);
        expectThrowCode(
          () => service.clearComputerUsePreference(key),
          "invalid_computer_use_preference",
        );
      }
    });

    test("invalid record shapes are rejected (renderer sanitizes; a violation is a bug)", () => {
      const service = makeService();
      service.init();
      const badCases = [
        ["consent", null],
        ["consent", "yes"],
        ["consent", { version: 1 }], // missing acceptedAt
        ["consent", { version: 1.5, acceptedAt: ISO }],
        ["consent", { version: 1, acceptedAt: "not-a-date" }],
        ["consent", { version: 1, acceptedAt: ISO, extra: true }],
        [
          "consent",
          { version: 1, acceptedAt: `${ISO}${"x".repeat(80)}` }, // over ISO cap
        ],
        ["enabled", { version: 1, enabled: "yes", updatedAt: ISO }],
        ["enabled", { version: 1, enabled: true }], // updatedAt required
        ["enabled", { version: 1, enabled: true, updatedAt: 123 }],
        ["local_beta_enabled", { version: 1, enabled: 1, updatedAt: ISO }],
        ["local_beta_enabled", { version: "1", enabled: true }],
      ];
      for (const [key, value] of badCases) {
        expectThrowCode(
          () => service.setComputerUsePreference(key, value),
          "invalid_computer_use_preference",
        );
      }
      // none of the rejected writes stored anything
      expect(service.readComputerUsePreferences().entries).toEqual({});
    });

    test("local_beta_enabled accepts the legacy minimal shape (updatedAt optional)", () => {
      const service = makeService();
      service.init();
      service.setComputerUsePreference("local_beta_enabled", {
        version: 1,
        enabled: true,
      });
      expect(
        service.readComputerUsePreferences().entries.local_beta_enabled,
      ).toEqual({ version: 1, enabled: true });
    });

    test("a corrupt row is skipped on read (fail closed) without taking the rest down", () => {
      const service = makeService();
      service.init();
      service.setComputerUsePreference("consent", consentRecord());
      service.close();

      const raw = openRawDb();
      try {
        raw
          .prepare(
            "INSERT INTO computer_use_preferences(key, value_json, schema_version, updated_at) " +
              "VALUES ('enabled', '{corrupt', 1, 0)",
          )
          .run();
      } finally {
        raw.close();
      }

      const reopened = makeService();
      reopened.init();
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
      try {
        const { entries } = reopened.readComputerUsePreferences();
        expect(entries.enabled).toBeUndefined();
        expect(entries.consent).toEqual(consentRecord());
        const logged = JSON.stringify(warnSpy.mock.calls);
        expect(logged).toContain("enabled");
        expect(logged).not.toContain("{corrupt");
      } finally {
        warnSpy.mockRestore();
      }
    });
  });

  describe("bootstrap snapshot (plan §3.4: mirror seed before first read)", () => {
    test("snapshot carries the computerUse entries", () => {
      const service = makeService();
      service.init();
      service.setComputerUsePreference("consent", consentRecord());
      const snapshot = service.getBootstrapSnapshot();
      expect(snapshot.available).toBe(true);
      expect(snapshot.computerUse).toEqual({
        entries: { consent: consentRecord() },
      });
    });

    test("a fresh database still exposes an empty computerUse section", () => {
      const service = makeService();
      service.init();
      expect(service.getBootstrapSnapshot().computerUse).toEqual({
        entries: {},
      });
    });
  });

  describe("legacy migration (one envelope covers all three keys)", () => {
    test("imports valid records, records per-store meta, replay is idempotent", () => {
      const service = makeService();
      service.init();

      const records = {
        consent: consentRecord(),
        enabled: enabledRecord({ enabled: false }),
      };
      const result = service.migrateLegacyComputerUse(migrationPayload(records));
      expect(result.status).toBe("complete");
      expect(result.ok).toBe(true);
      expect(result.importedKeys.sort()).toEqual(["consent", "enabled"]);
      expect(result.droppedEntries).toBe(0);
      expect(typeof result.digest).toBe("string");

      expect(service.readComputerUsePreferences().entries).toEqual(records);

      const raw = openRawDb();
      try {
        const meta = Object.fromEntries(
          raw
            .prepare(
              "SELECT key, value FROM meta WHERE key LIKE 'computer_use_%'",
            )
            .all()
            .map((row) => [row.key, JSON.parse(row.value)]),
        );
        expect(meta.computer_use_migration_state).toBe("complete");
        expect(meta.computer_use_migration_version).toBe(1);
        expect(meta.computer_use_migration_digest).toBe(result.digest);
        expect(typeof meta.computer_use_migrated_at).toBe("number");
      } finally {
        raw.close();
      }

      const replay = service.migrateLegacyComputerUse(migrationPayload(records));
      expect(replay.status).toBe("already-complete");
      expect(replay.digestMatched).toBe(true);
      expect(service.readComputerUsePreferences().entries).toEqual(records);
    });

    test("a different digest after completion is refused (SQL stays authoritative)", () => {
      const service = makeService();
      service.init();
      service.migrateLegacyComputerUse(
        migrationPayload({ consent: consentRecord() }),
      );
      const stale = service.migrateLegacyComputerUse(
        migrationPayload({ enabled: enabledRecord() }),
      );
      expect(stale.status).toBe("refused-stale-digest");
      expect(stale.digestMatched).toBe(false);
      // the authoritative rows are untouched
      expect(service.readComputerUsePreferences().entries).toEqual({
        consent: consentRecord(),
      });
    });

    test("SECURITY: invalid or unknown records are dropped (count-only), never imported", () => {
      const service = makeService();
      service.init();
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
      try {
        const result = service.migrateLegacyComputerUse(
          migrationPayload({
            consent: consentRecord(),
            enabled: { version: 1, enabled: "yes", updatedAt: ISO },
            local_beta_enabled: "corrupt-string",
            not_a_known_key: enabledRecord(),
          }),
        );
        expect(result.status).toBe("complete");
        expect(result.importedKeys).toEqual(["consent"]);
        expect(result.droppedEntries).toBe(3);
        expect(service.readComputerUsePreferences().entries).toEqual({
          consent: consentRecord(),
        });
        const logged = JSON.stringify(warnSpy.mock.calls);
        expect(logged).toContain("dropped 3");
        expect(logged).not.toContain("corrupt-string"); // never contents
      } finally {
        warnSpy.mockRestore();
      }
    });

    test("envelope violations throw coded errors and leave meta untouched", () => {
      const service = makeService();
      service.init();
      expectThrowCode(
        () => service.migrateLegacyComputerUse(null),
        "invalid_migration_payload",
      );
      expectThrowCode(
        () =>
          service.migrateLegacyComputerUse(
            migrationPayload({}, { migrationVersion: 99 }),
          ),
        "unsupported_migration_version",
      );
      expectThrowCode(
        () => service.migrateLegacyComputerUse(migrationPayload("nope")),
        "invalid_migration_payload",
      );
      expectThrowCode(
        () =>
          service.migrateLegacyComputerUse(
            migrationPayload({ consent: consentRecord() }, { digest: "beef" }),
          ),
        "digest_mismatch",
      );
      // still runnable after all the failures
      expect(
        service.migrateLegacyComputerUse(
          migrationPayload({ consent: consentRecord() }),
        ).status,
      ).toBe("complete");
    });

    test("per-store meta is isolated from the other Phase 2 store migrations", () => {
      const service = makeService();
      service.init();
      service.migrateLegacyComputerUse(
        migrationPayload({ consent: consentRecord() }),
      );
      // settings root + sibling stores are still not_started / runnable
      expect(service.getBootstrapSnapshot().migration.state).toBe(
        "not_started",
      );
      expect(
        service.migrateLegacyDefaultToolkits({
          migrationVersion: 1,
          scopes: { global: ["core"] },
        }).status,
      ).toBe("complete");
    });
  });

  describe("error-code message prefix (IPC transport contract)", () => {
    test("the new code carries the stable [<code>] prefix", () => {
      const service = makeService();
      service.init();
      const error = expectThrowCode(
        () => service.setComputerUsePreference("consent", null),
        "invalid_computer_use_preference",
      );
      expect(
        error.message.startsWith("[invalid_computer_use_preference] "),
      ).toBe(true);
    });

    test("degraded service rejects computer-use calls with settings_storage_unavailable", () => {
      const service = makeService(); // never init()ed
      for (const trigger of [
        () => service.readComputerUsePreferences(),
        () => service.setComputerUsePreference("consent", consentRecord()),
        () => service.clearComputerUsePreference("consent"),
        () =>
          service.migrateLegacyComputerUse(migrationPayload({})),
      ]) {
        expectThrowCode(trigger, "settings_storage_unavailable");
      }
    });
  });
});

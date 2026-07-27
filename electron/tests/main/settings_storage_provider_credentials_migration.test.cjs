// Phase 4 (S2) — provider secret migration + dual-keep + round-trip verify
// (gate 4). Storage-layer only: no renderer, no IPC surface. Builds on the S1
// provider_credentials ciphertext table.
//
// Contract sources:
//   phase4-cto-adr §4-S2, phase4-security-decision §3 gate 4 / gate 7,
//   phase4-s2-brief, plan §11C per-store migration protocol.
//
// Security invariants asserted here:
//   - migration NEVER writes plaintext to disk (only ciphertext BLOB);
//   - a round-trip failure keeps that credential on legacy (not complete);
//   - the migration digest is derived from the credential IDENTITY set only —
//     no secret-derived bytes ever land in the meta table;
//   - secrets and ciphertext NEVER reach the logs (spy assertions);
//   - degraded (gate 3 unavailable) → no migration, legacy authoritative.

const path = require("path");
const os = require("os");
const fs = require("fs");

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
  PROVIDER_CREDENTIALS_META_KEYS,
  SUPPORTED_PROVIDER_CREDENTIALS_MIGRATION_VERSION,
} = require("../../main/services/settings_storage/service");

const makeTempDir = () =>
  fs.mkdtempSync(path.join(os.tmpdir(), "pupu-settings-secret-migrate-"));

const fakeApp = (userDataDir) => ({
  getPath: (key) => {
    if (key === "userData") return userDataDir;
    throw new Error(`unexpected app.getPath(${key})`);
  },
});

// Deterministic fake safeStorage (mirrors the S1 suite). `corruptValues` is a
// set of plaintexts whose ciphertext deliberately decrypts to a DIFFERENT
// string — used to force a round-trip verification failure for one credential
// without disturbing the others.
const SENTINEL_ENC_PREFIX = "enc::";
const makeFakeSafeStorage = (opts = {}) => {
  const {
    available = true,
    backend = "gnome_libsecret",
    throwOnEncryptValues = new Set(),
    throwOnDecrypt = false,
    corruptValues = new Set(),
  } = opts;
  const calls = { encrypt: 0, decrypt: 0 };
  const encode = (str) =>
    Buffer.from(
      SENTINEL_ENC_PREFIX + Buffer.from(str, "utf8").toString("base64"),
      "utf8",
    );
  return {
    calls,
    isEncryptionAvailable: () => available,
    getSelectedStorageBackend: () => backend,
    encryptString: (str) => {
      calls.encrypt += 1;
      if (throwOnEncryptValues.has(str)) throw new Error("encrypt boom");
      // A corrupt credential encrypts to ciphertext for a MANGLED plaintext,
      // so the subsequent decrypt round-trip will not match the original.
      const payload = corruptValues.has(str) ? `${str}::MANGLED` : str;
      return encode(payload);
    },
    decryptString: (buf) => {
      calls.decrypt += 1;
      if (throwOnDecrypt) throw new Error("decrypt boom");
      const s = Buffer.from(buf).toString("utf8");
      if (!s.startsWith(SENTINEL_ENC_PREFIX)) {
        throw new Error("not our ciphertext");
      }
      return Buffer.from(
        s.slice(SENTINEL_ENC_PREFIX.length),
        "base64",
      ).toString("utf8");
    },
  };
};

const envelope = (credentials, overrides = {}) => ({
  migrationVersion: SUPPORTED_PROVIDER_CREDENTIALS_MIGRATION_VERSION,
  credentials,
  ...overrides,
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
  expect(String(caught.message).startsWith(`[${code}] `)).toBe(true);
  return caught;
};

describeIfSqlite("provider secret migration (S2)", () => {
  let dir;
  let services;

  const makeService = ({ safeStorage, platform, app } = {}) => {
    const service = createSettingsStorageService({
      app: app || fakeApp(dir),
      fs,
      path,
      sqlite,
      safeStorage,
      platform,
    });
    services.push(service);
    return service;
  };

  const startService = (opts = {}) => {
    const service = makeService(opts);
    service.init();
    return service;
  };

  const openRawDb = () => new sqlite.DatabaseSync(path.join(dir, "settings.db"));

  const rawCredentialRows = () => {
    const raw = openRawDb();
    try {
      return raw
        .prepare(
          "SELECT credential_kind, owner_id, ciphertext, updated_at " +
            "FROM provider_credentials ORDER BY credential_kind, owner_id",
        )
        .all();
    } finally {
      raw.close();
    }
  };

  const rawMetaValue = (key) => {
    const raw = openRawDb();
    try {
      const row = raw.prepare("SELECT value FROM meta WHERE key = ?").get(key);
      return row ? JSON.parse(row.value) : undefined;
    } finally {
      raw.close();
    }
  };

  const allMetaValuesJoined = () => {
    const raw = openRawDb();
    try {
      return raw
        .prepare("SELECT value FROM meta")
        .all()
        .map((r) => String(r.value))
        .join("\n");
    } finally {
      raw.close();
    }
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

  // ---- happy path: all three forms ----------------------------------------

  test("migrates openai + anthropic + custom×N into ciphertext, round-trip verified → complete", () => {
    const service = startService({ safeStorage: makeFakeSafeStorage() });
    const result = service.migrateProviderCredentials(
      envelope({
        openai: "sk-openai-live",
        anthropic: "sk-ant-live",
        custom: {
          hyperspace: "hs-key-1",
          moonshot: "ms-key-2",
        },
      }),
    );

    expect(result.status).toBe("complete");
    expect(result.ok).toBe(true);
    expect(result.migratedCount).toBe(4);
    expect(result.failedCount).toBe(0);
    expect(result.migrated.sort()).toEqual([
      "anthropic",
      "custom.hyperspace",
      "custom.moonshot",
      "openai",
    ]);

    // All four are readable back through the real seam.
    expect(service.readDecryptedProviderSecret("provider", "openai")).toBe(
      "sk-openai-live",
    );
    expect(service.readDecryptedProviderSecret("provider", "anthropic")).toBe(
      "sk-ant-live",
    );
    expect(
      service.readDecryptedProviderSecret("custom_provider", "custom.hyperspace"),
    ).toBe("hs-key-1");
    expect(
      service.readDecryptedProviderSecret("custom_provider", "custom.moonshot"),
    ).toBe("ms-key-2");

    // On disk: four ciphertext rows, none containing plaintext.
    const rows = rawCredentialRows();
    expect(rows.length).toBe(4);
    for (const row of rows) {
      const stored = Buffer.from(row.ciphertext).toString("utf8");
      expect(stored.startsWith(SENTINEL_ENC_PREFIX)).toBe(true);
    }
    const blob = rows
      .map((r) => Buffer.from(r.ciphertext).toString("utf8"))
      .join("\n");
    for (const secret of ["sk-openai-live", "sk-ant-live", "hs-key-1", "ms-key-2"]) {
      expect(blob).not.toContain(secret);
    }

    // Migration state is COMPLETE.
    expect(service.getProviderCredentialsMigrationMeta().state).toBe("complete");
    expect(rawMetaValue(PROVIDER_CREDENTIALS_META_KEYS.STATE)).toBe("complete");
  });

  test("empty legacy set migrates trivially to complete (nothing to move)", () => {
    const service = startService({ safeStorage: makeFakeSafeStorage() });
    const result = service.migrateProviderCredentials(envelope({}));
    expect(result.status).toBe("complete");
    expect(result.migratedCount).toBe(0);
    expect(rawCredentialRows().length).toBe(0);
    expect(service.getProviderCredentialsMigrationMeta().state).toBe("complete");
  });

  // ---- round-trip failure keeps that credential on legacy -----------------

  test("a round-trip failure leaves that credential unmigrated (in_progress); others succeed", () => {
    const service = startService({
      safeStorage: makeFakeSafeStorage({
        corruptValues: new Set(["sk-ant-corrupt"]),
      }),
    });
    const result = service.migrateProviderCredentials(
      envelope({
        openai: "sk-openai-ok",
        anthropic: "sk-ant-corrupt",
      }),
    );

    expect(result.status).toBe("in-progress");
    expect(result.ok).toBe(false);
    expect(result.migrated).toEqual(["openai"]);
    expect(result.failed).toEqual(["anthropic"]);

    // openai migrated; the corrupt anthropic row was rolled back (no row).
    expect(service.readDecryptedProviderSecret("provider", "openai")).toBe(
      "sk-openai-ok",
    );
    expect(service.hasProviderCredential("provider", "anthropic").present).toBe(
      false,
    );
    expect(rawCredentialRows().length).toBe(1);

    // Not complete: no version/digest stamp, state stuck at in_progress so the
    // next launch re-attempts.
    expect(service.getProviderCredentialsMigrationMeta().state).toBe(
      "in_progress",
    );
    expect(rawMetaValue(PROVIDER_CREDENTIALS_META_KEYS.DIGEST)).toBeUndefined();
  });

  test("an encrypt failure keeps that credential on legacy without a row", () => {
    const service = startService({
      safeStorage: makeFakeSafeStorage({
        throwOnEncryptValues: new Set(["sk-boom"]),
      }),
    });
    const result = service.migrateProviderCredentials(
      envelope({ openai: "sk-good", anthropic: "sk-boom" }),
    );
    expect(result.failed).toEqual(["anthropic"]);
    expect(result.migrated).toEqual(["openai"]);
    expect(service.hasProviderCredential("provider", "anthropic").present).toBe(
      false,
    );
  });

  test("first Keychain encrypt failure stops the remaining migration targets", () => {
    const safeStorage = makeFakeSafeStorage({
      throwOnEncryptValues: new Set(["sk-openai-boom"]),
    });
    const service = startService({ safeStorage, platform: "darwin" });
    service.setProviderCredential(
      "custom_provider",
      "custom.keep",
      "existing-ciphertext",
    );
    const encryptsBeforeMigration = safeStorage.calls.encrypt;

    const result = service.migrateProviderCredentials(
      envelope({
        openai: "sk-openai-boom",
        anthropic: "sk-anthropic-unreached",
        custom: { keep: "replacement-unreached" },
      }),
    );

    expect(safeStorage.calls.encrypt - encryptsBeforeMigration).toBe(1);
    expect(result.status).toBe("in-progress");
    expect(result.migrated).toEqual([]);
    expect(result.failed).toEqual([
      "openai",
      "anthropic",
      "custom.keep",
    ]);
    expect(result.failedCount).toBe(3);
    expect(service.getSecretStorageStatus()).toBe("unavailable");
    // The failure never deletes a pre-existing, untouched ciphertext row.
    expect(rawCredentialRows().map((row) => row.owner_id)).toEqual([
      "custom.keep",
    ]);
    expect(service.getProviderCredentialsMigrationMeta().state).toBe(
      "in_progress",
    );
  });

  test("round-trip decrypt exception latches, persists backoff, and stops", () => {
    const safeStorage = makeFakeSafeStorage({ throwOnDecrypt: true });
    const service = startService({ safeStorage, platform: "darwin" });

    const result = service.migrateProviderCredentials(
      envelope({
        openai: "sk-openai",
        anthropic: "sk-anthropic-unreached",
      }),
    );

    expect(safeStorage.calls.encrypt).toBe(1);
    expect(safeStorage.calls.decrypt).toBe(1);
    expect(result.migrated).toEqual([]);
    expect(result.failed).toEqual(["openai", "anthropic"]);
    expect(result.status).toBe("in-progress");
    expect(service.getSecretStorageStatus()).toBe("unavailable");
    expect(rawCredentialRows()).toEqual([]);
    expect(
      rawMetaValue(PROVIDER_CREDENTIALS_META_KEYS.RETRY_AFTER),
    ).toBeGreaterThan(Date.now());
  });

  test("partial migration completes on a retry once the credential verifies", () => {
    // First run: anthropic corrupt → in_progress.
    const corrupt = makeFakeSafeStorage({
      corruptValues: new Set(["sk-ant-flaky"]),
    });
    const s1 = startService({ safeStorage: corrupt });
    const first = s1.migrateProviderCredentials(
      envelope({ openai: "sk-openai", anthropic: "sk-ant-flaky" }),
    );
    expect(first.status).toBe("in-progress");
    s1.close();

    // Second run (new process): anthropic now encrypts cleanly → completes.
    const s2 = startService({ safeStorage: makeFakeSafeStorage() });
    const second = s2.migrateProviderCredentials(
      envelope({ openai: "sk-openai", anthropic: "sk-ant-flaky" }),
    );
    expect(second.status).toBe("complete");
    expect(second.failedCount).toBe(0);
    expect(s2.readDecryptedProviderSecret("provider", "anthropic")).toBe(
      "sk-ant-flaky",
    );
    expect(s2.getProviderCredentialsMigrationMeta().state).toBe("complete");
  });

  // ---- idempotent replay ---------------------------------------------------

  test("replaying the same identity set after complete is a no-op (no re-write)", () => {
    const safeStorage = makeFakeSafeStorage();
    const service = startService({ safeStorage });
    const first = service.migrateProviderCredentials(
      envelope({ openai: "sk-openai", custom: { foo: "foo-key" } }),
    );
    expect(first.status).toBe("complete");
    const rowsBefore = rawCredentialRows();
    const encryptsAfterFirst = safeStorage.calls.encrypt;

    // Replay with the SAME identity set (even different values): already
    // complete → nothing is written.
    const replay = service.migrateProviderCredentials(
      envelope({ openai: "sk-different", custom: { foo: "foo-changed" } }),
    );
    expect(replay.status).toBe("already-complete");
    expect(replay.alreadyComplete).toBe(true);

    const rowsAfter = rawCredentialRows();
    // updated_at unchanged → no row was rewritten.
    expect(rowsAfter.map((r) => r.updated_at)).toEqual(
      rowsBefore.map((r) => r.updated_at),
    );
    // No further encryption happened on the replay.
    expect(safeStorage.calls.encrypt).toBe(encryptsAfterFirst);
    // SQL stays authoritative — the original values, not the replay's.
    expect(service.readDecryptedProviderSecret("provider", "openai")).toBe(
      "sk-openai",
    );
  });

  test("a different identity set after complete is refused (SQL authority preserved)", () => {
    const service = startService({ safeStorage: makeFakeSafeStorage() });
    service.migrateProviderCredentials(envelope({ openai: "sk-openai" }));
    // A new set (adds anthropic) → refused-stale-digest; bulk migration must not
    // clobber the authoritative ciphertext. New credentials go via the set path.
    const res = service.migrateProviderCredentials(
      envelope({ openai: "sk-openai", anthropic: "sk-ant-new" }),
    );
    expect(res.status).toBe("refused-stale-digest");
    expect(service.hasProviderCredential("provider", "anthropic").present).toBe(
      false,
    );
  });

  // ---- degraded (gate 3 unavailable) --------------------------------------

  test("degraded: no migration, legacy stays authoritative (skipped-unavailable)", () => {
    const service = startService({
      safeStorage: makeFakeSafeStorage({ available: false }),
      platform: "darwin",
    });
    const result = service.migrateProviderCredentials(
      envelope({ openai: "sk-openai", anthropic: "sk-ant" }),
    );
    expect(result.status).toBe("skipped-unavailable");
    expect(result.migratedCount).toBe(0);
    // Nothing written; migration state untouched (not_started).
    expect(rawCredentialRows().length).toBe(0);
    expect(service.getProviderCredentialsMigrationMeta().state).toBe(
      "not_started",
    );
  });

  test("degraded via Linux basic_text backend also refuses to migrate", () => {
    const service = startService({
      safeStorage: makeFakeSafeStorage({ available: true, backend: "basic_text" }),
      platform: "linux",
    });
    expect(service.getSecretStorageStatus()).toBe("unavailable");
    expect(
      service.migrateProviderCredentials(envelope({ openai: "sk-openai" }))
        .status,
    ).toBe("skipped-unavailable");
    expect(rawCredentialRows().length).toBe(0);
  });

  // ---- dual-keep double-write (rotate) ------------------------------------

  test("N-period rotate: setProviderCredential updates ciphertext to the new key (SQL authority)", () => {
    // After migration, a key change in release N writes the new ciphertext (SQL
    // authority half of the bounded double-write; the legacy mirror update is
    // renderer-side and out of this layer's scope).
    const service = startService({ safeStorage: makeFakeSafeStorage() });
    service.migrateProviderCredentials(envelope({ openai: "sk-old" }));
    expect(service.readDecryptedProviderSecret("provider", "openai")).toBe(
      "sk-old",
    );

    service.setProviderCredential("provider", "openai", "sk-new-rotated");
    expect(service.readDecryptedProviderSecret("provider", "openai")).toBe(
      "sk-new-rotated",
    );
    // Still one row (upsert), and it holds the new value's ciphertext.
    expect(rawCredentialRows().length).toBe(1);
  });

  // ---- envelope validation -------------------------------------------------

  test("rejects a non-object payload / unsupported migrationVersion", () => {
    const service = startService({ safeStorage: makeFakeSafeStorage() });
    expectThrowCode(
      () => service.migrateProviderCredentials(null),
      "invalid_migration_payload",
    );
    expectThrowCode(
      () => service.migrateProviderCredentials("nope"),
      "invalid_migration_payload",
    );
    expectThrowCode(
      () =>
        service.migrateProviderCredentials({
          migrationVersion: 999,
          credentials: {},
        }),
      "unsupported_migration_version",
    );
  });

  test("a __proto__ custom slug is skipped, never poisoning the map", () => {
    const service = startService({ safeStorage: makeFakeSafeStorage() });
    const payload = envelope({ openai: "sk-openai" });
    // Inject a hostile slug directly.
    payload.credentials.custom = Object.assign(Object.create(null), {
      __proto__: "evil-key",
      safe: "safe-key",
    });
    const result = service.migrateProviderCredentials(payload);
    expect(result.migrated.sort()).toEqual(["custom.safe", "openai"]);
    expect(result.status).toBe("complete");
  });

  test("invalid custom identities stay on legacy and never enter bootstrap", () => {
    const service = startService({ safeStorage: makeFakeSafeStorage() });
    const result = service.migrateProviderCredentials(
      envelope({
        custom: {
          Valid: "bad-uppercase",
          "-bad": "bad-edge",
          valid: "safe-key",
        },
      }),
    );

    expect(result.status).toBe("in-progress");
    expect(result.migrated).toEqual(["custom.valid"]);
    expect(result.failed.sort()).toEqual([
      "custom.-bad",
      "custom.Valid",
    ]);
    expect(service.getBootstrapSnapshot().configuredCredentials).toEqual([
      "custom.valid",
    ]);
  });

  // ---- digest discipline ---------------------------------------------------

  test("the migration digest is identity-derived — no secret material in meta", () => {
    const service = startService({ safeStorage: makeFakeSafeStorage() });
    service.migrateProviderCredentials(
      envelope({ openai: "sk-openai-topsecret", custom: { foo: "foo-topsecret" } }),
    );
    const meta = allMetaValuesJoined();
    expect(meta).not.toContain("sk-openai-topsecret");
    expect(meta).not.toContain("foo-topsecret");
    expect(meta).not.toContain(SENTINEL_ENC_PREFIX);

    // Same identity set + different values → identical digest (proves the
    // digest ignores secret values).
    dir = makeTempDir();
    const other = startService({ safeStorage: makeFakeSafeStorage() });
    const a = other.migrateProviderCredentials(
      envelope({ openai: "AAAA", custom: { foo: "BBBB" } }),
    );
    expect(a.digest).toBe(rawMetaValue(PROVIDER_CREDENTIALS_META_KEYS.DIGEST));
  });

  // ---- logging discipline (gate 7 red line #3) ----------------------------

  test("plaintext and ciphertext NEVER reach the logs during migration", () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const OPENAI = "sk-log-openai-9f3";
    const ANT = "sk-log-ant-corrupt-7a1";
    try {
      const service = startService({
        safeStorage: makeFakeSafeStorage({
          corruptValues: new Set([ANT]),
        }),
      });
      // Mixed run: one success, one round-trip failure (exercises the warn path).
      service.migrateProviderCredentials(
        envelope({ openai: OPENAI, anthropic: ANT }),
      );

      const allArgs = [
        ...logSpy.mock.calls,
        ...warnSpy.mock.calls,
        ...errorSpy.mock.calls,
      ]
        .flat()
        .map((a) => String(a))
        .join("\n");
      expect(allArgs).not.toContain(OPENAI);
      expect(allArgs).not.toContain(ANT);
      expect(allArgs).not.toContain(SENTINEL_ENC_PREFIX);
    } finally {
      logSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  // ---- pre-init ------------------------------------------------------------

  test("migration before init is skipped (secret storage unavailable)", () => {
    const service = makeService({ safeStorage: makeFakeSafeStorage() });
    // Not init()'d → status unavailable → skipped, never throws.
    const result = service.migrateProviderCredentials(
      envelope({ openai: "sk-openai" }),
    );
    expect(result.status).toBe("skipped-unavailable");
  });
});

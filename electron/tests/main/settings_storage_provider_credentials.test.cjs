// Phase 4 (S1) — provider_credentials ciphertext store + safeStorage probe
// (gate 3) tests. Storage-layer only: no renderer consumer, no IPC surface.
//
// Contract sources:
//   phase4-cto-adr §3.4 / §4-S1, phase4-security-decision §3 gate 3/gate 7,
//   phase4-s1-brief.
//
// Security invariants asserted here:
//   - secrets never land in the `settings` table (only ciphertext BLOB in the
//     dedicated provider_credentials table);
//   - the plaintext and the ciphertext NEVER reach the logs;
//   - gate 3 refuses basic_text/unknown on Linux and never calls
//     setUsePlainTextEncryption;
//   - reads fail closed (decrypt failure / degraded → null, never throw).

const path = require("path");
const os = require("os");
const fs = require("fs");

// node:sqlite is unavailable under some runtimes, and jest 27's resolver
// mangles `require("node:sqlite")`. process.getBuiltinModule bypasses it.
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
  PROVIDER_CREDENTIAL_KINDS,
  PROVIDER_CREDENTIAL_LIMITS,
  SECRET_STORAGE_STATUS,
  SAFE_SECRET_STORAGE_LINUX_BACKENDS,
} = require("../../main/services/settings_storage/service");

const makeTempDir = () =>
  fs.mkdtempSync(path.join(os.tmpdir(), "pupu-settings-provider-creds-"));

const fakeApp = (userDataDir) => ({
  getPath: (key) => {
    if (key === "userData") return userDataDir;
    throw new Error(`unexpected app.getPath(${key})`);
  },
});

// Asserts fn throws an error carrying the given .code (jest 27-safe). Also
// checks the stable "[<code>] " message prefix (survives the IPC boundary).
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

// Deterministic fake safeStorage. encryptString prefixes "enc::" so tests can
// assert the on-disk BLOB is the ENCRYPTED form (never the plaintext), and
// decryptString reverses it. Counts setUsePlainTextEncryption calls (must
// stay 0 — gate 3 forbids it).
const SENTINEL_ENC_PREFIX = "enc::";
const makeFakeSafeStorage = (opts = {}) => {
  const {
    available = true,
    backend = "gnome_libsecret",
    throwOnAvailable = false,
    throwOnBackend = false,
    throwOnEncrypt = false,
    throwOnDecrypt = false,
  } = opts;
  const calls = { setUsePlainTextEncryption: 0, encrypt: 0, decrypt: 0 };
  return {
    calls,
    isEncryptionAvailable: () => {
      if (throwOnAvailable) throw new Error("isEncryptionAvailable boom");
      return available;
    },
    getSelectedStorageBackend: () => {
      if (throwOnBackend) throw new Error("getSelectedStorageBackend boom");
      return backend;
    },
    // The payload is base64-encoded (not echoed verbatim) so the on-disk BLOB
    // is a faithful stand-in for real ciphertext — it must NOT contain the raw
    // plaintext as a substring.
    encryptString: (str) => {
      calls.encrypt += 1;
      if (throwOnEncrypt) throw new Error("encrypt boom");
      return Buffer.from(
        SENTINEL_ENC_PREFIX + Buffer.from(str, "utf8").toString("base64"),
        "utf8",
      );
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

describe("provider credential constants", () => {
  test("credential kinds are pinned", () => {
    expect([...PROVIDER_CREDENTIAL_KINDS]).toEqual([
      "provider",
      "custom_provider",
    ]);
  });

  test("secret storage status enum is pinned", () => {
    expect(SECRET_STORAGE_STATUS.AVAILABLE).toBe("available");
    expect(SECRET_STORAGE_STATUS.UNAVAILABLE).toBe("unavailable");
  });

  test("safe Linux keyring backends match gate 3 exactly", () => {
    expect([...SAFE_SECRET_STORAGE_LINUX_BACKENDS].sort()).toEqual([
      "gnome_libsecret",
      "kwallet",
      "kwallet5",
      "kwallet6",
    ]);
    // basic_text and unknown are explicitly NOT trusted.
    expect(SAFE_SECRET_STORAGE_LINUX_BACKENDS.has("basic_text")).toBe(false);
    expect(SAFE_SECRET_STORAGE_LINUX_BACKENDS.has("unknown")).toBe(false);
  });

  test("owner id length cap is present", () => {
    expect(PROVIDER_CREDENTIAL_LIMITS.OWNER_ID_MAX_LENGTH).toBe(200);
  });
});

describeIfSqlite("provider credential store (sqlite)", () => {
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

  const openRawDb = () =>
    new sqlite.DatabaseSync(path.join(dir, "settings.db"));

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

  // ---- schema -------------------------------------------------------------

  test("init creates provider_credentials; schema_version stays 2", () => {
    const service = startService({ safeStorage: makeFakeSafeStorage() });
    const raw = openRawDb();
    try {
      const table = raw
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='provider_credentials'",
        )
        .get();
      expect(table).toBeTruthy();
      // Composite primary key on (credential_kind, owner_id).
      const pkCols = raw
        .prepare("PRAGMA table_info(provider_credentials)")
        .all()
        .filter((c) => c.pk > 0)
        .sort((a, b) => a.pk - b.pk)
        .map((c) => c.name);
      expect(pkCols).toEqual(["credential_kind", "owner_id"]);
    } finally {
      raw.close();
    }
    // A new table is an additive increment — schema_version is NOT bumped.
    expect(service.getBootstrapSnapshot().schemaVersion).toBe(2);
  });

  test("a pre-existing db missing the table gains it on init (IF NOT EXISTS upgrade)", () => {
    // Simulate an older build: settings.db exists with meta+settings but no
    // provider_credentials table.
    const raw = new sqlite.DatabaseSync(path.join(dir, "settings.db"));
    raw.exec(
      "CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);" +
        "CREATE TABLE settings (namespace TEXT PRIMARY KEY, value_json TEXT NOT NULL, " +
        "schema_version INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL, " +
        "revision INTEGER NOT NULL DEFAULT 0);",
    );
    raw.prepare("INSERT INTO meta(key, value) VALUES ('schema_version', '2')").run();
    raw.close();

    const service = startService({ safeStorage: makeFakeSafeStorage() });
    // The store works: a write succeeds, so the table now exists.
    service.setProviderCredential("provider", "openai", "sk-test-1");
    expect(rawCredentialRows().length).toBe(1);
  });

  // ---- gate 3 availability probe ------------------------------------------

  test("probe: non-Linux + encryption available → available", () => {
    const service = startService({
      safeStorage: makeFakeSafeStorage({ available: true }),
      platform: "darwin",
    });
    expect(service.getSecretStorageStatus()).toBe("available");
  });

  test("probe: encryption not available → unavailable", () => {
    const service = startService({
      safeStorage: makeFakeSafeStorage({ available: false }),
      platform: "darwin",
    });
    expect(service.getSecretStorageStatus()).toBe("unavailable");
  });

  test("probe: no safeStorage injected → unavailable", () => {
    const service = startService({ platform: "darwin" });
    expect(service.getSecretStorageStatus()).toBe("unavailable");
  });

  test("probe: Linux keyring backends are all accepted", () => {
    for (const backend of [
      "gnome_libsecret",
      "kwallet",
      "kwallet5",
      "kwallet6",
    ]) {
      dir = makeTempDir();
      const service = startService({
        safeStorage: makeFakeSafeStorage({ available: true, backend }),
        platform: "linux",
      });
      expect(service.getSecretStorageStatus()).toBe("available");
    }
  });

  test("probe: Linux basic_text / unknown → unavailable (gate 3 refusal)", () => {
    for (const backend of ["basic_text", "unknown", "something_else"]) {
      dir = makeTempDir();
      const service = startService({
        safeStorage: makeFakeSafeStorage({ available: true, backend }),
        platform: "linux",
      });
      expect(service.getSecretStorageStatus()).toBe("unavailable");
    }
  });

  test("probe: thrown isEncryptionAvailable / getSelectedStorageBackend → unavailable", () => {
    const s1 = startService({
      safeStorage: makeFakeSafeStorage({ throwOnAvailable: true }),
      platform: "darwin",
    });
    expect(s1.getSecretStorageStatus()).toBe("unavailable");

    dir = makeTempDir();
    const s2 = startService({
      safeStorage: makeFakeSafeStorage({ available: true, throwOnBackend: true }),
      platform: "linux",
    });
    expect(s2.getSecretStorageStatus()).toBe("unavailable");
  });

  test("setUsePlainTextEncryption is NEVER called across init + writes + reads", () => {
    const safeStorage = makeFakeSafeStorage({ available: true });
    // A method that, if ever referenced, would flip the flag and be counted.
    safeStorage.setUsePlainTextEncryption = () => {
      safeStorage.calls.setUsePlainTextEncryption += 1;
    };
    const service = startService({ safeStorage, platform: "darwin" });
    service.setProviderCredential("provider", "openai", "sk-plain-guard");
    service.readDecryptedProviderSecret("provider", "openai");
    service.hasProviderCredential("provider", "openai");
    service.deleteProviderCredential("provider", "openai");
    expect(safeStorage.calls.setUsePlainTextEncryption).toBe(0);
  });

  // ---- set / read round trip ----------------------------------------------

  test("set → read round trip returns the exact plaintext", () => {
    const service = startService({ safeStorage: makeFakeSafeStorage() });
    const res = service.setProviderCredential(
      "provider",
      "openai",
      "sk-secret-openai",
    );
    expect(res).toMatchObject({ ok: true, kind: "provider", ownerId: "openai" });
    expect(typeof res.updatedAt).toBe("number");

    expect(service.readDecryptedProviderSecret("provider", "openai")).toBe(
      "sk-secret-openai",
    );

    // custom_provider owner works through the same path.
    service.setProviderCredential(
      "custom_provider",
      "custom.hyperspace",
      "hs-secret-value",
    );
    expect(
      service.readDecryptedProviderSecret("custom_provider", "custom.hyperspace"),
    ).toBe("hs-secret-value");
  });

  test("on-disk BLOB is ciphertext — never the plaintext, never in `settings`", () => {
    const service = startService({ safeStorage: makeFakeSafeStorage() });
    service.setProviderCredential("provider", "anthropic", "sk-ant-topsecret");

    const rows = rawCredentialRows();
    expect(rows.length).toBe(1);
    const stored = Buffer.from(rows[0].ciphertext).toString("utf8");
    // It is the ENCRYPTED form (sentinel prefix), not the raw key.
    expect(stored.startsWith(SENTINEL_ENC_PREFIX)).toBe(true);
    expect(stored).not.toContain("sk-ant-topsecret");

    // Nothing landed in the settings table (gate 7 red line #1).
    const raw = openRawDb();
    try {
      const settingsRows = raw.prepare("SELECT value_json FROM settings").all();
      for (const r of settingsRows) {
        expect(r.value_json).not.toContain("sk-ant-topsecret");
      }
    } finally {
      raw.close();
    }
    // And it is absent from the bootstrap snapshot entirely.
    expect(JSON.stringify(service.getBootstrapSnapshot())).not.toContain(
      "sk-ant-topsecret",
    );
  });

  test("set overwrites an existing credential (upsert on the composite PK)", () => {
    const service = startService({ safeStorage: makeFakeSafeStorage() });
    service.setProviderCredential("provider", "openai", "sk-first");
    service.setProviderCredential("provider", "openai", "sk-second");
    expect(rawCredentialRows().length).toBe(1);
    expect(service.readDecryptedProviderSecret("provider", "openai")).toBe(
      "sk-second",
    );
  });

  // ---- degraded write refusal ---------------------------------------------

  test("write is refused (fail closed) when secret storage is unavailable", () => {
    const service = startService({
      safeStorage: makeFakeSafeStorage({ available: false }),
      platform: "darwin",
    });
    expectThrowCode(
      () => service.setProviderCredential("provider", "openai", "sk-nope"),
      "secret_storage_unavailable",
    );
    // No plaintext, no ciphertext row was written.
    expect(rawCredentialRows().length).toBe(0);
  });

  test("write is refused when encryptString throws — no row persisted", () => {
    const service = startService({
      safeStorage: makeFakeSafeStorage({ throwOnEncrypt: true }),
      platform: "darwin",
    });
    const error = expectThrowCode(
      () => service.setProviderCredential("provider", "openai", "sk-boom"),
      "secret_storage_unavailable",
    );
    // The failure message never leaks the plaintext or the crypto error text.
    expect(error.message).not.toContain("sk-boom");
    expect(error.message).not.toContain("encrypt boom");
    expect(rawCredentialRows().length).toBe(0);
  });

  // ---- fail-closed reads ---------------------------------------------------

  test("read returns null (never throws) when decryption fails", () => {
    const safeStorage = makeFakeSafeStorage();
    const service = startService({ safeStorage });
    service.setProviderCredential("provider", "openai", "sk-will-corrupt");
    // Flip decrypt to throw AFTER a successful write.
    safeStorage.decryptString = () => {
      throw new Error("decrypt boom");
    };
    expect(service.readDecryptedProviderSecret("provider", "openai")).toBeNull();
  });

  test("read returns null for a missing row / unknown kind / empty owner (no throw)", () => {
    const service = startService({ safeStorage: makeFakeSafeStorage() });
    expect(service.readDecryptedProviderSecret("provider", "openai")).toBeNull();
    expect(
      service.readDecryptedProviderSecret("not_a_kind", "openai"),
    ).toBeNull();
    expect(service.readDecryptedProviderSecret("provider", "")).toBeNull();
    expect(service.readDecryptedProviderSecret("provider", 42)).toBeNull();
  });

  test("read returns null when secret storage is unavailable even if a row exists", () => {
    // Write a row on an available machine.
    const writer = startService({ safeStorage: makeFakeSafeStorage() });
    writer.setProviderCredential("provider", "openai", "sk-orphan");
    writer.close();
    // Reopen with an UNAVAILABLE probe: identity survives, decryptable does not.
    const reader = startService({
      safeStorage: makeFakeSafeStorage({ available: false }),
      platform: "darwin",
    });
    expect(reader.getSecretStorageStatus()).toBe("unavailable");
    expect(reader.readDecryptedProviderSecret("provider", "openai")).toBeNull();
    // Existence is decoupled from decryptability.
    expect(reader.hasProviderCredential("provider", "openai").present).toBe(
      true,
    );
  });

  // ---- delete / has / listOwners ------------------------------------------

  test("has / delete lifecycle", () => {
    const service = startService({ safeStorage: makeFakeSafeStorage() });
    expect(service.hasProviderCredential("provider", "openai").present).toBe(
      false,
    );
    service.setProviderCredential("provider", "openai", "sk-live");
    expect(service.hasProviderCredential("provider", "openai").present).toBe(
      true,
    );

    const del = service.deleteProviderCredential("provider", "openai");
    expect(del).toMatchObject({ ok: true, deleted: true });
    expect(service.hasProviderCredential("provider", "openai").present).toBe(
      false,
    );
    expect(service.readDecryptedProviderSecret("provider", "openai")).toBeNull();

    // Deleting a non-existent row reports deleted:false.
    expect(
      service.deleteProviderCredential("provider", "openai").deleted,
    ).toBe(false);
  });

  test("delete works even when secret storage is unavailable (cleanup path)", () => {
    const writer = startService({ safeStorage: makeFakeSafeStorage() });
    writer.setProviderCredential("provider", "openai", "sk-cleanup");
    writer.close();
    const degraded = startService({
      safeStorage: makeFakeSafeStorage({ available: false }),
      platform: "darwin",
    });
    expect(
      degraded.deleteProviderCredential("provider", "openai").deleted,
    ).toBe(true);
    expect(rawCredentialRows().length).toBe(0);
  });

  test("listProviderCredentialOwners returns identity only — no ciphertext", () => {
    const service = startService({ safeStorage: makeFakeSafeStorage() });
    service.setProviderCredential("provider", "openai", "sk-a");
    service.setProviderCredential("provider", "anthropic", "sk-b");
    service.setProviderCredential("custom_provider", "custom.foo", "sk-c");

    const { ok, owners } = service.listProviderCredentialOwners();
    expect(ok).toBe(true);
    // Sorted by (kind, owner_id).
    expect(owners.map((o) => `${o.kind}:${o.ownerId}`)).toEqual([
      "custom_provider:custom.foo",
      "provider:anthropic",
      "provider:openai",
    ]);
    for (const o of owners) {
      expect(typeof o.updatedAt).toBe("number");
      expect(Object.keys(o).sort()).toEqual(["kind", "ownerId", "updatedAt"]);
      // No secret / ciphertext leaks through the listing.
      expect(JSON.stringify(o)).not.toContain(SENTINEL_ENC_PREFIX);
    }
    expect(JSON.stringify(owners)).not.toContain("sk-a");
  });

  // ---- validation / error codes -------------------------------------------

  test("invalid kind / ownerId / empty value are rejected with invalid_credential", () => {
    const service = startService({ safeStorage: makeFakeSafeStorage() });
    // bad kind
    expectThrowCode(
      () => service.setProviderCredential("nope", "openai", "sk"),
      "invalid_credential",
    );
    expectThrowCode(
      () => service.deleteProviderCredential("nope", "openai"),
      "invalid_credential",
    );
    expectThrowCode(
      () => service.hasProviderCredential("nope", "openai"),
      "invalid_credential",
    );
    // bad ownerId
    for (const badOwner of ["", 42, null, undefined, "__proto__", "x".repeat(201)]) {
      expectThrowCode(
        () => service.setProviderCredential("provider", badOwner, "sk"),
        "invalid_credential",
      );
    }
    // empty / non-string plaintext
    for (const badValue of ["", 42, null, undefined, {}]) {
      expectThrowCode(
        () => service.setProviderCredential("provider", "openai", badValue),
        "invalid_credential",
      );
    }
    // longest legal owner id is accepted
    expect(
      service.setProviderCredential("provider", "o".repeat(200), "sk-ok").ok,
    ).toBe(true);
  });

  test("readDecryptedProviderSecret never throws on invalid input (returns null)", () => {
    const service = startService({ safeStorage: makeFakeSafeStorage() });
    expect(() =>
      service.readDecryptedProviderSecret("__bad__", "__proto__"),
    ).not.toThrow();
    expect(
      service.readDecryptedProviderSecret("__bad__", "__proto__"),
    ).toBeNull();
  });

  // ---- pre-init behavior ---------------------------------------------------

  test("mutations before init fail with settings_storage_unavailable", () => {
    const service = makeService({ safeStorage: makeFakeSafeStorage() });
    expect(service.getSecretStorageStatus()).toBe("unavailable");
    // Read seam is fail-closed even before init (returns null, never throws).
    expect(service.readDecryptedProviderSecret("provider", "openai")).toBeNull();
    expectThrowCode(
      () => service.setProviderCredential("provider", "openai", "sk"),
      "settings_storage_unavailable",
    );
    expectThrowCode(
      () => service.deleteProviderCredential("provider", "openai"),
      "settings_storage_unavailable",
    );
    expectThrowCode(
      () => service.hasProviderCredential("provider", "openai"),
      "settings_storage_unavailable",
    );
    expectThrowCode(
      () => service.listProviderCredentialOwners(),
      "settings_storage_unavailable",
    );
  });

  // ---- S3: configuredCredentials bootstrap signal -------------------------

  test("bootstrap exposes configuredCredentials (identity list) + secretStorageStatus", () => {
    const service = startService({ safeStorage: makeFakeSafeStorage() });
    service.setProviderCredential("provider", "openai", "sk-openai-x");
    service.setProviderCredential("provider", "anthropic", "sk-anthropic-y");
    service.setProviderCredential("custom_provider", "custom.foo", "sk-custom-z");

    const snapshot = service.getBootstrapSnapshot();
    expect(snapshot.secretStorageStatus).toBe("available");
    // Identity list = owner ids, sorted by (kind, owner_id): custom_provider
    // rows sort before provider rows ('c' < 'p'), anthropic before openai.
    expect(snapshot.configuredCredentials).toEqual([
      "custom.foo",
      "anthropic",
      "openai",
    ]);
  });

  test("bootstrap configuredCredentials is [] with no credentials", () => {
    const service = startService({ safeStorage: makeFakeSafeStorage() });
    const snapshot = service.getBootstrapSnapshot();
    expect(snapshot.configuredCredentials).toEqual([]);
    expect(snapshot.secretStorageStatus).toBe("available");
  });

  test("gate 7 red line #2: bootstrap holds NO secret value and NO ciphertext", () => {
    const service = startService({ safeStorage: makeFakeSafeStorage() });
    service.setProviderCredential("provider", "openai", "sk-topsecret-boot");
    service.setProviderCredential(
      "custom_provider",
      "custom.bar",
      "cs-topsecret-boot",
    );
    const json = JSON.stringify(service.getBootstrapSnapshot());
    // The identity list is present...
    expect(json).toContain("openai");
    expect(json).toContain("custom.bar");
    // ...but never a secret value or the ciphertext sentinel.
    expect(json).not.toContain("sk-topsecret-boot");
    expect(json).not.toContain("cs-topsecret-boot");
    expect(json).not.toContain(SENTINEL_ENC_PREFIX);
  });

  test("secretStorageStatus is unavailable in the snapshot on a degraded machine (identity survives)", () => {
    // Write on an available machine, reopen with an unavailable probe.
    const writer = startService({ safeStorage: makeFakeSafeStorage() });
    writer.setProviderCredential("provider", "openai", "sk-degraded-boot");
    writer.close();
    const reader = startService({
      safeStorage: makeFakeSafeStorage({ available: false }),
      platform: "darwin",
    });
    const snapshot = reader.getBootstrapSnapshot();
    // Identity is decoupled from decryptability: it is still listed...
    expect(snapshot.configuredCredentials).toEqual(["openai"]);
    // ...but the status is unavailable so the renderer never treats descriptor
    // injection as authoritative.
    expect(snapshot.secretStorageStatus).toBe("unavailable");
    expect(JSON.stringify(snapshot)).not.toContain("sk-degraded-boot");
  });

  // ---- logging discipline (gate 7 red line #3) ----------------------------

  test("plaintext and ciphertext NEVER reach the logs", () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const PLAINTEXT = "sk-log-guard-secret-9f3";
    try {
      const service = startService({ safeStorage: makeFakeSafeStorage() });
      service.setProviderCredential("provider", "openai", PLAINTEXT);
      service.readDecryptedProviderSecret("provider", "openai");
      service.hasProviderCredential("provider", "openai");
      service.listProviderCredentialOwners();
      service.deleteProviderCredential("provider", "openai");
      // Trigger a couple of error paths too.
      try {
        service.setProviderCredential("provider", "openai", "");
      } catch (_e) {
        /* expected */
      }

      const allArgs = [
        ...logSpy.mock.calls,
        ...warnSpy.mock.calls,
        ...errorSpy.mock.calls,
      ]
        .flat()
        .map((a) => String(a))
        .join("\n");
      expect(allArgs).not.toContain(PLAINTEXT);
      expect(allArgs).not.toContain(SENTINEL_ENC_PREFIX + PLAINTEXT);
    } finally {
      logSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});

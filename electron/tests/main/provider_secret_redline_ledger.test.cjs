// Phase 4 (S6) — consolidated gate-7 red-line ledger (Phase 4 release gate).
//
// This suite is the single place pupu-llm-expert / the security reviewer can
// run to see the store-layer security invariants hold end to end against the
// REAL settings_storage service (node:sqlite + a deterministic fake
// safeStorage). It deliberately overlaps — and cross-references — the deeper
// per-slice suites; the depth lives there, the gate lives here.
//
// Red-line coverage map (phase4-descriptor-contract §7 / security gate 7):
//   #1 settings table / bootstrap never hold plaintext or ciphertext  → here + S1
//   #2 bootstrap configuredCredentials is identity-only               → here + S3
//   #3 set/get/migrate/delete/rotate logs leak no secret/ciphertext   → here + S1/S2
//   #4 decrypt-failure error message leaks no secret                  → unchain_provider_secret_byte_equivalence + S1
//   #5 fixtures are obvious sentinels, no real key                    → here (meta) + all suites
//   #6 migration marks complete only after a round-trip verify        → here + S2
//   #7 basic_text/unknown backend refuses ciphertext, reports degraded→ here + S1
//   #8 no IPC channel / handler ever returns a decrypted secret       → here (static) + S4/S6-main
//   #9 custom uses the dedicated channel, never generic api_key       → unchain_provider_secret_byte_equivalence + S4/S5
//
// EVERY secret in this file is an obvious SENTINEL (red line #5) — its presence
// in a log line, the settings table, a bootstrap snapshot, or a channel name is
// an immediate failure.

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
const { CHANNELS } = require("../../shared/channels");

// All sentinels carry the literal token "SENTINEL" so the whole file is
// trivially auditable as key-free (red line #5).
const SENTINEL = {
  openai: "sk-openai-SENTINEL-never-persist-1",
  anthropic: "sk-ant-SENTINEL-never-persist-22",
  custom: "hs-SENTINEL-never-persist-333",
};
const ALL_SENTINELS = Object.values(SENTINEL);

const SENTINEL_ENC_PREFIX = "enc::";
const makeFakeSafeStorage = (opts = {}) => {
  const {
    available = true,
    backend = "gnome_libsecret",
    corruptValues = new Set(),
  } = opts;
  const calls = { encrypt: 0, decrypt: 0, setUsePlainTextEncryption: 0 };
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
      const payload = corruptValues.has(str) ? `${str}::MANGLED` : str;
      return encode(payload);
    },
    decryptString: (buf) => {
      calls.decrypt += 1;
      const s = Buffer.from(buf).toString("utf8");
      if (!s.startsWith(SENTINEL_ENC_PREFIX)) throw new Error("not ciphertext");
      return Buffer.from(s.slice(SENTINEL_ENC_PREFIX.length), "base64").toString(
        "utf8",
      );
    },
  };
};

const fakeApp = (userDataDir) => ({
  getPath: (key) => {
    if (key === "userData") return userDataDir;
    throw new Error(`unexpected app.getPath(${key})`);
  },
});

const envelope = (credentials) => ({
  migrationVersion: SUPPORTED_PROVIDER_CREDENTIALS_MIGRATION_VERSION,
  credentials,
});

// Recursively collect every string leaf of the frozen CHANNELS map.
const flattenChannelStrings = (node, acc = []) => {
  if (typeof node === "string") {
    acc.push(node);
  } else if (node && typeof node === "object") {
    for (const value of Object.values(node)) flattenChannelStrings(value, acc);
  }
  return acc;
};

describeIfSqlite("provider secret red-line ledger (Phase 4 S6)", () => {
  let dir;
  let services;

  const makeService = ({ safeStorage, platform } = {}) => {
    const service = createSettingsStorageService({
      app: fakeApp(dir),
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
          "SELECT credential_kind, owner_id, ciphertext FROM provider_credentials",
        )
        .all();
    } finally {
      raw.close();
    }
  };

  const settingsTableJoined = () => {
    const raw = openRawDb();
    try {
      return raw
        .prepare("SELECT value_json FROM settings")
        .all()
        .map((r) => String(r.value_json))
        .join("\n");
    } finally {
      raw.close();
    }
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-s6-redline-"));
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

  // ---- #1 settings table / bootstrap never hold plaintext or ciphertext ----

  test("#1 a configured secret never lands in the settings table or the bootstrap snapshot", () => {
    const service = startService({ safeStorage: makeFakeSafeStorage() });
    service.setProviderCredential("provider", "openai", SENTINEL.openai);
    service.setProviderCredential(
      "custom_provider",
      "custom.hyperspace",
      SENTINEL.custom,
    );

    // Ciphertext lives ONLY in the dedicated table, in encrypted form.
    const rows = rawCredentialRows();
    expect(rows.length).toBe(2);
    for (const row of rows) {
      const stored = Buffer.from(row.ciphertext).toString("utf8");
      expect(stored.startsWith(SENTINEL_ENC_PREFIX)).toBe(true);
      for (const secret of ALL_SENTINELS) expect(stored).not.toContain(secret);
    }

    // The settings table holds neither plaintext nor ciphertext.
    const settings = settingsTableJoined();
    for (const secret of ALL_SENTINELS) expect(settings).not.toContain(secret);
    expect(settings).not.toContain(SENTINEL_ENC_PREFIX);

    // The bootstrap snapshot holds neither plaintext nor ciphertext.
    const bootstrapJson = JSON.stringify(service.getBootstrapSnapshot());
    for (const secret of ALL_SENTINELS) {
      expect(bootstrapJson).not.toContain(secret);
    }
    expect(bootstrapJson).not.toContain(SENTINEL_ENC_PREFIX);
  });

  // ---- #2 bootstrap configuredCredentials is identity-only -----------------

  test("#2 bootstrap exposes only the identity list, never a value or ciphertext", () => {
    const service = startService({ safeStorage: makeFakeSafeStorage() });
    service.setProviderCredential("provider", "openai", SENTINEL.openai);
    service.setProviderCredential("provider", "anthropic", SENTINEL.anthropic);
    service.setProviderCredential(
      "custom_provider",
      "custom.hyperspace",
      SENTINEL.custom,
    );

    const snapshot = service.getBootstrapSnapshot();
    // Identity list == the owner ids only, in a deterministic order.
    expect([...snapshot.configuredCredentials].sort()).toEqual([
      "anthropic",
      "custom.hyperspace",
      "openai",
    ]);
    expect(snapshot.secretStorageStatus).toBe("available");
    // No entry is a secret value.
    for (const id of snapshot.configuredCredentials) {
      expect(ALL_SENTINELS).not.toContain(id);
    }
  });

  // ---- #3 the whole lifecycle logs no secret / no ciphertext ---------------

  test("#3 set/get/migrate/delete/rotate produce no secret or ciphertext in the logs", () => {
    const spies = ["log", "info", "warn", "error", "debug"].map((level) =>
      jest.spyOn(console, level).mockImplementation(() => {}),
    );
    try {
      const service = startService({ safeStorage: makeFakeSafeStorage() });
      // set
      service.setProviderCredential("provider", "openai", SENTINEL.openai);
      // get
      service.readDecryptedProviderSecret("provider", "openai");
      // migrate
      service.migrateProviderCredentials(
        envelope({
          anthropic: SENTINEL.anthropic,
          custom: { hyperspace: SENTINEL.custom },
        }),
      );
      // rotate (upsert a new value on the same PK)
      service.setProviderCredential(
        "provider",
        "openai",
        `${SENTINEL.openai}-rotated`,
      );
      // delete
      service.deleteProviderCredential("provider", "openai");
    } finally {
      spies.forEach((spy) => spy.mockRestore());
    }

    const logged = spies
      .flatMap((spy) => spy.mock.calls)
      .flat()
      .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
      .join("\n");
    for (const secret of ALL_SENTINELS) expect(logged).not.toContain(secret);
    expect(logged).not.toContain(`${SENTINEL.openai}-rotated`);
    // No base64 ciphertext form leaked either.
    expect(logged).not.toContain(SENTINEL_ENC_PREFIX);
  });

  // ---- #6 migration completes only after a round-trip verify ---------------

  test("#6 a corrupt round-trip leaves that credential unmigrated (not complete)", () => {
    const service = startService({
      safeStorage: makeFakeSafeStorage({
        corruptValues: new Set([SENTINEL.anthropic]),
      }),
    });
    const result = service.migrateProviderCredentials(
      envelope({ openai: SENTINEL.openai, anthropic: SENTINEL.anthropic }),
    );

    // openai verifies and migrates; anthropic's decrypt != original → rolled
    // back, migration NOT complete.
    expect(result.ok).toBe(false);
    expect(result.migrated).toEqual(["openai"]);
    expect(result.failed).toEqual(["anthropic"]);
    expect(service.getProviderCredentialsMigrationMeta().state).toBe(
      "in_progress",
    );
    expect(service.hasProviderCredential("provider", "anthropic").present).toBe(
      false,
    );
    // openai round-tripped cleanly and is readable.
    expect(service.readDecryptedProviderSecret("provider", "openai")).toBe(
      SENTINEL.openai,
    );
  });

  test("#6 a clean round-trip marks the migration complete", () => {
    const service = startService({ safeStorage: makeFakeSafeStorage() });
    const result = service.migrateProviderCredentials(
      envelope({ openai: SENTINEL.openai }),
    );
    expect(result.status).toBe("complete");
    expect(service.getProviderCredentialsMigrationMeta().state).toBe("complete");
  });

  // ---- #7 basic_text / unknown backend refuses ciphertext ------------------

  test.each(["basic_text", "unknown", "kwallet4"])(
    "#7 Linux backend %s is refused — no ciphertext written, storage unavailable",
    (backend) => {
      const service = startService({
        safeStorage: makeFakeSafeStorage({ available: true, backend }),
        platform: "linux",
      });
      expect(service.getSecretStorageStatus()).toBe("unavailable");

      let caught = null;
      try {
        service.setProviderCredential("provider", "openai", SENTINEL.openai);
      } catch (error) {
        caught = error;
      }
      expect(caught).not.toBeNull();
      expect(caught.code).toBe("secret_storage_unavailable");
      // Fail-closed: nothing persisted.
      expect(rawCredentialRows().length).toBe(0);
      // The error message leaks no secret.
      expect(String(caught.message)).not.toContain(SENTINEL.openai);
    },
  );

  test("#7 gate-3 never invokes setUsePlainTextEncryption", () => {
    const safeStorage = makeFakeSafeStorage({
      available: true,
      backend: "basic_text",
    });
    safeStorage.setUsePlainTextEncryption = () => {
      safeStorage.calls.setUsePlainTextEncryption += 1;
    };
    const service = startService({ safeStorage, platform: "linux" });
    try {
      service.setProviderCredential("provider", "openai", SENTINEL.openai);
    } catch (_error) {
      // expected refusal
    }
    expect(safeStorage.calls.setUsePlainTextEncryption).toBe(0);
  });

  // ---- #8 no IPC channel / handler ever returns a decrypted secret ---------

  test("#8 no CHANNELS entry names a stored-secret read channel", () => {
    const channelStrings = flattenChannelStrings(CHANNELS);
    expect(channelStrings.length).toBeGreaterThan(0);
    // A secret-READ channel would return a stored provider secret to the
    // renderer — such a channel would carry one of these tokens. Note the
    // existing `unchain:validate-api-key` channel is a live-INPUT validation
    // (renderer hands main a key to test a connection; nothing stored is
    // returned) — the contract §5 out-of-scope path — so "api-key" alone is NOT
    // forbidden; a getter would.
    const forbidden = /(secret|credential|decrypt|reveal)/i;
    const forbiddenGetter = /(read|get|fetch|return)[-_]?(provider[-_]?)?(api[-_]?)?key/i;
    // Exact write-direction carve-out: migration plus the two steady-state
    // mutations legitimately contain "credential" but are INBOUND-ONLY. Their
    // handlers return status metadata, never a stored secret or ciphertext.
    // Every OTHER channel still must not match, so any future secret read
    // channel trips this test.
    const writeDirectionCarveOut = new Set([
      CHANNELS.SETTINGS_STORAGE.MIGRATE_PROVIDER_CREDENTIALS,
      CHANNELS.SETTINGS_STORAGE.SET_PROVIDER_CREDENTIAL,
      CHANNELS.SETTINGS_STORAGE.DELETE_PROVIDER_CREDENTIAL,
    ]);
    for (const channel of channelStrings) {
      if (writeDirectionCarveOut.has(channel)) continue;
      expect(channel).not.toMatch(forbidden);
      expect(channel).not.toMatch(forbiddenGetter);
    }
    // Keep the exception list exact and auditable. Even carved-out channels
    // must have a write verb and may never acquire read/get/decrypt semantics.
    expect([...writeDirectionCarveOut]).toEqual([
      "settings-storage:migrate-provider-credentials",
      "settings-storage:set-provider-credential",
      "settings-storage:delete-provider-credential",
    ]);
    const forbiddenReadDirection = /(read|get|fetch|return|decrypt|reveal)/i;
    for (const channel of writeDirectionCarveOut) {
      expect(channelStrings).toContain(channel);
      expect(channel).not.toMatch(forbiddenGetter);
      expect(channel).not.toMatch(forbiddenReadDirection);
    }
  });

  test("#8 the settings-storage IPC handler module never references the secret reader", () => {
    const handlerSource = fs.readFileSync(
      path.join(
        __dirname,
        "../../main/services/settings_storage/register_handlers.js",
      ),
      "utf8",
    );
    // The secret reader is a main-internal seam; it must not be wired to any
    // ipcMain handler.
    expect(handlerSource).not.toContain("readDecryptedProviderSecret");
    expect(handlerSource).not.toContain("provider_credentials");
  });

  test("#8 the reader is a real main-internal method (so #8 is a genuine guard)", () => {
    const service = startService({ safeStorage: makeFakeSafeStorage() });
    // It exists in-process (main can call it)...
    expect(typeof service.readDecryptedProviderSecret).toBe("function");
    // ...but it lives only on the service object, reachable solely by main —
    // the static channel/handler assertions above prove it never crosses IPC.
    service.setProviderCredential("provider", "openai", SENTINEL.openai);
    expect(service.readDecryptedProviderSecret("provider", "openai")).toBe(
      SENTINEL.openai,
    );
  });

  // ---- #5 fixtures are obvious sentinels -----------------------------------

  test("#5 every secret used in this ledger is an obvious sentinel (no real key)", () => {
    for (const secret of ALL_SENTINELS) {
      expect(secret).toContain("SENTINEL");
    }
  });
});

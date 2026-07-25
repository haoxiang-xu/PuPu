import {
  COMPUTER_USE_MIGRATION_MARKER_KEY,
  isComputerUsePrefsSqlMode,
  readComputerUsePreferenceRecord,
  writeComputerUsePreferenceRecord,
  clearComputerUsePreferenceRecord,
  flushComputerUsePreferenceWrites,
  resetComputerUsePreferencesForTests,
  validateConsentRecord,
  validateEnabledRecord,
  validateLocalBetaRecord,
} from "./computer_use_preferences_sql";

const ISO = "2026-07-24T10:00:00.000Z";
const consent = (overrides = {}) => ({
  version: 1,
  acceptedAt: ISO,
  ...overrides,
});
const enabled = (overrides = {}) => ({
  version: 1,
  enabled: true,
  updatedAt: ISO,
  ...overrides,
});

const installComputerUseApi = ({
  entries = {},
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
      computerUse: { entries },
      ...(storeMigrations ? { storeMigrations } : {}),
    })),
    migrateLegacy: jest.fn(() => Promise.resolve({ status: "complete" })),
    setNamespace: jest.fn(() => Promise.resolve({ ok: true })),
    deleteNamespace: jest.fn(() => Promise.resolve({ ok: true })),
    readComputerUsePreferences: jest.fn(() =>
      Promise.resolve({ ok: true, entries: {} }),
    ),
    setComputerUsePreference: jest.fn((key) =>
      Promise.resolve({ ok: true, key }),
    ),
    clearComputerUsePreference: jest.fn((key) =>
      Promise.resolve({ ok: true, key, cleared: true }),
    ),
    migrateLegacyComputerUse: jest.fn(() =>
      Promise.resolve({ status: "complete", digest: "d1", migratedAt: 1 }),
    ),
    ...overrides,
  };
  window.settingsStorageAPI = api;
  return api;
};

beforeEach(() => {
  window.localStorage.clear();
  resetComputerUsePreferencesForTests();
});

afterEach(() => {
  delete window.settingsStorageAPI;
  resetComputerUsePreferencesForTests();
});

describe("shape validators (fail closed)", () => {
  test("consent: shaped records pass at ANY int version; everything else is null", () => {
    expect(validateConsentRecord(consent())).toEqual(consent());
    expect(validateConsentRecord(consent({ version: 9 }))).toEqual(
      consent({ version: 9 }),
    );
    for (const bad of [
      null,
      "yes",
      [],
      { version: 1 },
      { acceptedAt: ISO },
      { version: 1.5, acceptedAt: ISO },
      { version: 1, acceptedAt: "not-a-date" },
      { version: 1, acceptedAt: 123 },
    ]) {
      expect(validateConsentRecord(bad)).toBeNull();
    }
  });

  test("enabled: requires int version + bool enabled + ISO updatedAt", () => {
    expect(validateEnabledRecord(enabled())).toEqual(enabled());
    for (const bad of [
      null,
      { version: 1, enabled: true }, // updatedAt required
      { version: 1, enabled: "yes", updatedAt: ISO },
      { version: "1", enabled: true, updatedAt: ISO },
      { version: 1, enabled: true, updatedAt: "nope" },
    ]) {
      expect(validateEnabledRecord(bad)).toBeNull();
    }
  });

  test("local beta: updatedAt optional (mirrors the looser legacy read gate)", () => {
    expect(validateLocalBetaRecord({ version: 1, enabled: true })).toEqual({
      version: 1,
      enabled: true,
    });
    expect(validateLocalBetaRecord(enabled())).toEqual(enabled());
    expect(
      validateLocalBetaRecord({ version: 1, enabled: 1 }),
    ).toBeNull();
    expect(
      validateLocalBetaRecord({ version: 1, enabled: true, updatedAt: "x" }),
    ).toBeNull();
  });
});

describe("mode selection", () => {
  test("no bridge → localStorage mode, mirror reads null", () => {
    expect(isComputerUsePrefsSqlMode()).toBe(false);
    expect(readComputerUsePreferenceRecord("consent")).toBeNull();
  });

  test("bridge without the snapshot computerUse section → degraded localStorage mode", () => {
    installComputerUseApi({
      overrides: {
        bootstrap: jest.fn(() => ({
          available: true,
          namespaces: {},
          revisions: {},
        })),
      },
    });
    expect(isComputerUsePrefsSqlMode()).toBe(false);
  });

  test("bridge + snapshot section → SQL mode, mirror seeded from the snapshot", () => {
    installComputerUseApi({ entries: { consent: consent() } });
    expect(isComputerUsePrefsSqlMode()).toBe(true);
    expect(readComputerUsePreferenceRecord("consent")).toEqual(consent());
    expect(readComputerUsePreferenceRecord("enabled")).toBeNull();
  });

  test("FAIL CLOSED: invalid snapshot entries never reach the mirror", () => {
    installComputerUseApi({
      entries: {
        consent: { version: 1, acceptedAt: "not-a-date" },
        enabled: "corrupt",
        local_beta_enabled: { version: 1, enabled: 1 },
      },
    });
    expect(isComputerUsePrefsSqlMode()).toBe(true);
    expect(readComputerUsePreferenceRecord("consent")).toBeNull();
    expect(readComputerUsePreferenceRecord("enabled")).toBeNull();
    expect(readComputerUsePreferenceRecord("local_beta_enabled")).toBeNull();
  });
});

describe("SQL mode writes", () => {
  test("write updates the mirror synchronously and queues the SQL persist", async () => {
    const api = installComputerUseApi();
    writeComputerUsePreferenceRecord("enabled", enabled());
    // read-your-write before the IPC resolves
    expect(readComputerUsePreferenceRecord("enabled")).toEqual(enabled());
    await flushComputerUsePreferenceWrites();
    expect(api.setComputerUsePreference).toHaveBeenCalledWith(
      "enabled",
      enabled(),
    );
    // post-migration writes do NOT touch the legacy key (SQL is authoritative)
    expect(window.localStorage.getItem("computer_use_enabled")).toBeNull();
  });

  test("clear removes the mirror record and queues the SQL clear", async () => {
    const api = installComputerUseApi({ entries: { consent: consent() } });
    clearComputerUsePreferenceRecord("consent");
    expect(readComputerUsePreferenceRecord("consent")).toBeNull();
    await flushComputerUsePreferenceWrites();
    expect(api.clearComputerUsePreference).toHaveBeenCalledWith("consent");
  });

  test("post-migration clear also removes the frozen legacy record (no resurrection in fallback sessions)", async () => {
    window.localStorage.setItem(
      COMPUTER_USE_MIGRATION_MARKER_KEY,
      JSON.stringify({ digest: "d1", completedAt: 1 }),
    );
    window.localStorage.setItem(
      "computer_use_consent",
      JSON.stringify(consent()),
    );
    const api = installComputerUseApi({ entries: { consent: consent() } });
    clearComputerUsePreferenceRecord("consent");
    expect(readComputerUsePreferenceRecord("consent")).toBeNull();
    expect(window.localStorage.getItem("computer_use_consent")).toBeNull();
    await flushComputerUsePreferenceWrites();
    expect(api.clearComputerUsePreference).toHaveBeenCalledWith("consent");
  });

  test("post-migration writes: only narrowing (enabled=false over an existing legacy record) writes through", async () => {
    const ISO2 = "2026-07-25T10:00:00.000Z";
    window.localStorage.setItem(
      COMPUTER_USE_MIGRATION_MARKER_KEY,
      JSON.stringify({ digest: "d1", completedAt: 1 }),
    );
    window.localStorage.setItem(
      "computer_use_enabled",
      JSON.stringify(enabled()),
    );
    installComputerUseApi({ entries: { enabled: enabled() } });
    // widening write: the frozen legacy copy is untouched
    writeComputerUsePreferenceRecord("enabled", enabled({ updatedAt: ISO2 }));
    expect(
      JSON.parse(window.localStorage.getItem("computer_use_enabled")),
    ).toEqual(enabled());
    // narrowing write: the legacy copy follows (fail-closed direction)
    const off = enabled({ enabled: false, updatedAt: ISO2 });
    writeComputerUsePreferenceRecord("enabled", off);
    expect(
      JSON.parse(window.localStorage.getItem("computer_use_enabled")),
    ).toEqual(off);
    // consent grants never write the legacy key post-migration
    writeComputerUsePreferenceRecord("consent", consent());
    expect(window.localStorage.getItem("computer_use_consent")).toBeNull();
    await flushComputerUsePreferenceWrites();
  });

  test("post-migration narrowing writes never CREATE a legacy record where none existed", async () => {
    installComputerUseApi({ entries: { enabled: enabled() } });
    writeComputerUsePreferenceRecord("enabled", enabled({ enabled: false }));
    expect(window.localStorage.getItem("computer_use_enabled")).toBeNull();
    await flushComputerUsePreferenceWrites();
  });

  test("a failed persist logs the code only and keeps the optimistic mirror", async () => {
    installComputerUseApi({
      overrides: {
        setComputerUsePreference: jest.fn(() =>
          Promise.reject(
            new Error("[settings_storage_unavailable] gone"),
          ),
        ),
      },
    });
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      writeComputerUsePreferenceRecord("enabled", enabled());
      await flushComputerUsePreferenceWrites();
      expect(readComputerUsePreferenceRecord("enabled")).toEqual(enabled());
      const logged = JSON.stringify(warnSpy.mock.calls);
      expect(logged).toContain("settings_storage_unavailable");
      expect(logged).not.toContain(ISO); // never record contents
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe("legacy migration", () => {
  test("legacy data + no marker → one migration envelope with the validated records", async () => {
    window.localStorage.setItem(
      "computer_use_consent",
      JSON.stringify(consent()),
    );
    window.localStorage.setItem("computer_use_enabled", "{corrupt");
    window.localStorage.setItem(
      "computer_use_local_beta_enabled",
      JSON.stringify({ version: 1, enabled: true }),
    );
    const api = installComputerUseApi();

    // pre-migration reads serve the legacy-seeded mirror
    expect(isComputerUsePrefsSqlMode()).toBe(true);
    expect(readComputerUsePreferenceRecord("consent")).toEqual(consent());
    expect(readComputerUsePreferenceRecord("enabled")).toBeNull();

    await flushComputerUsePreferenceWrites();
    expect(api.migrateLegacyComputerUse).toHaveBeenCalledTimes(1);
    const payload = api.migrateLegacyComputerUse.mock.calls[0][0];
    expect(payload.migrationVersion).toBe(1);
    // the corrupt enabled record is simply not in the payload (fail closed)
    expect(payload.records).toEqual({
      consent: consent(),
      local_beta_enabled: { version: 1, enabled: true },
    });
    // marker written on completion
    expect(
      JSON.parse(
        window.localStorage.getItem(COMPUTER_USE_MIGRATION_MARKER_KEY),
      ),
    ).toMatchObject({ digest: "d1" });
  });

  test("no legacy data → no migration, mirror seeds from the snapshot", async () => {
    const api = installComputerUseApi({ entries: { enabled: enabled() } });
    expect(readComputerUsePreferenceRecord("enabled")).toEqual(enabled());
    await flushComputerUsePreferenceWrites();
    expect(api.migrateLegacyComputerUse).not.toHaveBeenCalled();
  });

  test("marker present → no re-migration", async () => {
    window.localStorage.setItem(
      COMPUTER_USE_MIGRATION_MARKER_KEY,
      JSON.stringify({ digest: "d1", completedAt: 1 }),
    );
    window.localStorage.setItem(
      "computer_use_consent",
      JSON.stringify(consent()),
    );
    const api = installComputerUseApi({ entries: {} });
    // SQL (snapshot) is authoritative: the stale legacy record is NOT served
    expect(readComputerUsePreferenceRecord("consent")).toBeNull();
    await flushComputerUsePreferenceWrites();
    expect(api.migrateLegacyComputerUse).not.toHaveBeenCalled();
  });

  test("a stale marker over an unmigrated SQL side re-runs the migration (SQL state wins)", async () => {
    // settings.db was reset/replaced while the renderer marker survived:
    // marker-only logic would skip the import forever and the user's desired
    // state would silently stay lost.
    window.localStorage.setItem(
      COMPUTER_USE_MIGRATION_MARKER_KEY,
      JSON.stringify({ digest: "old", completedAt: 1 }),
    );
    window.localStorage.setItem(
      "computer_use_consent",
      JSON.stringify(consent()),
    );
    const api = installComputerUseApi({
      entries: {},
      storeMigrations: {
        computerUse: {
          state: "not_started",
          version: null,
          digest: null,
          migratedAt: null,
        },
      },
    });
    // pre-migration reads serve the validated legacy record
    expect(readComputerUsePreferenceRecord("consent")).toEqual(consent());
    await flushComputerUsePreferenceWrites();
    expect(api.migrateLegacyComputerUse).toHaveBeenCalledTimes(1);
    expect(
      api.migrateLegacyComputerUse.mock.calls[0][0].records.consent,
    ).toEqual(consent());
  });

  test("SQL-complete meta with a lost marker backfills the marker without a migration IPC; SQL truth wins", async () => {
    // legacy still says consented; SQL (complete meta, snapshot has no
    // consent row) says revoked — SQL wins without any round-trip.
    window.localStorage.setItem(
      "computer_use_consent",
      JSON.stringify(consent()),
    );
    const api = installComputerUseApi({
      entries: {},
      storeMigrations: {
        computerUse: {
          state: "complete",
          version: 1,
          digest: "sql-d",
          migratedAt: 9,
        },
      },
    });
    expect(readComputerUsePreferenceRecord("consent")).toBeNull();
    await flushComputerUsePreferenceWrites();
    expect(api.migrateLegacyComputerUse).not.toHaveBeenCalled();
    expect(
      JSON.parse(
        window.localStorage.getItem(COMPUTER_USE_MIGRATION_MARKER_KEY),
      ).digest,
    ).toBe("sql-d");
  });

  test("pre-migration writes go through to localStorage too (lossless degrade)", async () => {
    window.localStorage.setItem(
      "computer_use_consent",
      JSON.stringify(consent()),
    );
    let resolveMigration;
    installComputerUseApi({
      overrides: {
        migrateLegacyComputerUse: jest.fn(
          () =>
            new Promise((resolve) => {
              resolveMigration = resolve;
            }),
        ),
      },
    });
    expect(isComputerUsePrefsSqlMode()).toBe(true); // triggers init + queue
    writeComputerUsePreferenceRecord("enabled", enabled());
    // migration still pending → legacy write-through happened
    expect(
      JSON.parse(window.localStorage.getItem("computer_use_enabled")),
    ).toEqual(enabled());
    // let the queued migration op reach the (hanging) bridge call
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(typeof resolveMigration).toBe("function");
    resolveMigration({ status: "complete", digest: "d1", migratedAt: 1 });
    await flushComputerUsePreferenceWrites();
  });

  test("migration failure degrades to localStorage for the session (fail closed holds)", async () => {
    window.localStorage.setItem(
      "computer_use_consent",
      JSON.stringify(consent()),
    );
    installComputerUseApi({
      overrides: {
        migrateLegacyComputerUse: jest.fn(() =>
          Promise.reject(new Error("[digest_mismatch] mismatch")),
        ),
      },
    });
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(isComputerUsePrefsSqlMode()).toBe(true);
      await flushComputerUsePreferenceWrites();
      expect(isComputerUsePrefsSqlMode()).toBe(false);
      // marker NOT written → retried next boot
      expect(
        window.localStorage.getItem(COMPUTER_USE_MIGRATION_MARKER_KEY),
      ).toBeNull();
      // legacy record intact for the localStorage fallback readers
      expect(
        JSON.parse(window.localStorage.getItem("computer_use_consent")),
      ).toEqual(consent());
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("already-complete (marker lost) resyncs the mirror from SQL — revoked consent does not resurrect", async () => {
    window.localStorage.setItem(
      "computer_use_consent",
      JSON.stringify(consent()),
    );
    installComputerUseApi({
      overrides: {
        migrateLegacyComputerUse: jest.fn(() =>
          Promise.resolve({
            status: "already-complete",
            digest: "d1",
            migratedAt: 1,
          }),
        ),
        readComputerUsePreferences: jest.fn(() =>
          Promise.resolve({
            ok: true,
            entries: { enabled: enabled({ enabled: false }) },
          }),
        ),
      },
    });
    // pre-resolution reads still serve the legacy seed (known residual window)
    expect(readComputerUsePreferenceRecord("consent")).toEqual(consent());
    await flushComputerUsePreferenceWrites();
    // revoked consent is gone; SQL truth serves
    expect(readComputerUsePreferenceRecord("consent")).toBeNull();
    expect(readComputerUsePreferenceRecord("enabled")).toEqual(
      enabled({ enabled: false }),
    );
    // marker restored so the next boot seeds straight from SQL
    expect(
      JSON.parse(
        window.localStorage.getItem(COMPUTER_USE_MIGRATION_MARKER_KEY),
      ),
    ).toMatchObject({ digest: "d1" });
  });

  test("SECURITY: refused-stale-digest empties the mirror BEFORE the SQL re-read (fail closed window)", async () => {
    // Legacy claims consent; SQL authority says none — the wider legacy state
    // must disappear from sync reads the moment the refusal lands.
    window.localStorage.setItem(
      "computer_use_consent",
      JSON.stringify(consent()),
    );
    let resolveRead;
    const api = installComputerUseApi({
      overrides: {
        migrateLegacyComputerUse: jest.fn(() =>
          Promise.resolve({ status: "refused-stale-digest" }),
        ),
        readComputerUsePreferences: jest.fn(
          () =>
            new Promise((resolve) => {
              resolveRead = resolve;
            }),
        ),
      },
    });
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(readComputerUsePreferenceRecord("consent")).toEqual(consent());
      // let the refusal land while the SQL re-read is still pending
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(api.migrateLegacyComputerUse).toHaveBeenCalledTimes(1);
      expect(typeof resolveRead).toBe("function"); // re-read is in flight
      // fail-closed window: mirror not ready → read is null, NOT the legacy record
      expect(readComputerUsePreferenceRecord("consent")).toBeNull();
      resolveRead({ ok: true, entries: { enabled: enabled() } });
      await flushComputerUsePreferenceWrites();
      // re-seeded from SQL authority
      expect(readComputerUsePreferenceRecord("consent")).toBeNull();
      expect(readComputerUsePreferenceRecord("enabled")).toEqual(enabled());
      // marker NOT written (retry next boot is refused again, harmless)
      expect(
        window.localStorage.getItem(COMPUTER_USE_MIGRATION_MARKER_KEY),
      ).toBeNull();
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("unknown migration status degrades to localStorage", async () => {
    window.localStorage.setItem(
      "computer_use_consent",
      JSON.stringify(consent()),
    );
    installComputerUseApi({
      overrides: {
        migrateLegacyComputerUse: jest.fn(() =>
          Promise.resolve({ status: "who-knows" }),
        ),
      },
    });
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(isComputerUsePrefsSqlMode()).toBe(true);
      await flushComputerUsePreferenceWrites();
      expect(isComputerUsePrefsSqlMode()).toBe(false);
    } finally {
      warnSpy.mockRestore();
    }
  });
});

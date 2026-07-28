import {
  ENABLED_STORE_VERSION,
  clearComputerUseEnabled,
  isComputerUseEnabledPersisted,
  readComputerUseEnabledRecord,
  writeComputerUseEnabled,
} from "./computer_use_enabled_store";
import {
  beginComputerUsePreferencesSettingsReset,
  endComputerUsePreferencesSettingsReset,
  flushComputerUsePreferenceWrites,
  resetComputerUsePreferencesForTests,
} from "./computer_use_preferences_sql";

const STORAGE_KEY = "computer_use_enabled";

beforeEach(() => {
  window.localStorage.clear();
  resetComputerUsePreferencesForTests();
});

describe("computer_use_enabled_store — read/write roundtrip", () => {
  test("write then read returns the persisted record", () => {
    const written = writeComputerUseEnabled(true);
    expect(written).toMatchObject({
      version: ENABLED_STORE_VERSION,
      enabled: true,
    });
    expect(typeof written.updatedAt).toBe("string");

    const read = readComputerUseEnabledRecord();
    expect(read).toEqual(written);
    expect(isComputerUseEnabledPersisted()).toBe(true);
  });

  test("writing false persists an explicit OFF record", () => {
    writeComputerUseEnabled(false);
    expect(readComputerUseEnabledRecord()).toMatchObject({ enabled: false });
    expect(isComputerUseEnabledPersisted()).toBe(false);
  });

  test("clear removes the record and reads back OFF", () => {
    writeComputerUseEnabled(true);
    clearComputerUseEnabled();
    expect(readComputerUseEnabledRecord()).toBeNull();
    expect(isComputerUseEnabledPersisted()).toBe(false);
  });
});

describe("computer_use_enabled_store — fail-closed corruption handling", () => {
  test("absent record → OFF", () => {
    expect(readComputerUseEnabledRecord()).toBeNull();
    expect(isComputerUseEnabledPersisted()).toBe(false);
  });

  test("non-JSON garbage → OFF", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not json");
    expect(readComputerUseEnabledRecord()).toBeNull();
    expect(isComputerUseEnabledPersisted()).toBe(false);
  });

  test("missing version → OFF even if enabled:true", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ enabled: true, updatedAt: new Date().toISOString() }),
    );
    expect(readComputerUseEnabledRecord()).toBeNull();
    expect(isComputerUseEnabledPersisted()).toBe(false);
  });

  test("wrong type for enabled → OFF", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: ENABLED_STORE_VERSION,
        enabled: "yes",
        updatedAt: new Date().toISOString(),
      }),
    );
    expect(readComputerUseEnabledRecord()).toBeNull();
    expect(isComputerUseEnabledPersisted()).toBe(false);
  });

  test("invalid timestamp → OFF", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: ENABLED_STORE_VERSION,
        enabled: true,
        updatedAt: "not-a-date",
      }),
    );
    expect(readComputerUseEnabledRecord()).toBeNull();
    expect(isComputerUseEnabledPersisted()).toBe(false);
  });

  test("version mismatch → OFF (a bump invalidates stale enabled records)", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: ENABLED_STORE_VERSION + 1,
        enabled: true,
        updatedAt: new Date().toISOString(),
      }),
    );
    // Record is well-shaped, so it reads back...
    expect(readComputerUseEnabledRecord()).not.toBeNull();
    // ...but the version gate makes it NOT persisted-enabled (fail-closed).
    expect(isComputerUseEnabledPersisted()).toBe(false);
  });
});

describe("computer_use_enabled_store (SQL mode)", () => {
  const ISO = "2026-07-24T10:00:00.000Z";

  const installApi = (entries = {}, overrides = {}) => {
    const api = {
      bootstrap: jest.fn(() => ({
        available: true,
        degraded: false,
        namespaces: {},
        revisions: {},
        computerUse: { entries },
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

  afterEach(() => {
    delete window.settingsStorageAPI;
    resetComputerUsePreferencesForTests();
  });

  test("reads the SQL-backed desired state", () => {
    installApi({
      enabled: { version: ENABLED_STORE_VERSION, enabled: true, updatedAt: ISO },
    });
    expect(readComputerUseEnabledRecord()).toEqual({
      version: ENABLED_STORE_VERSION,
      enabled: true,
      updatedAt: ISO,
    });
    expect(isComputerUseEnabledPersisted()).toBe(true);
  });

  test("FAIL CLOSED: absent / corrupt / version-mismatched SQL records read as OFF", () => {
    installApi({});
    expect(readComputerUseEnabledRecord()).toBeNull();
    expect(isComputerUseEnabledPersisted()).toBe(false);

    resetComputerUsePreferencesForTests();
    installApi({ enabled: { version: ENABLED_STORE_VERSION, enabled: "yes" } });
    expect(readComputerUseEnabledRecord()).toBeNull();
    expect(isComputerUseEnabledPersisted()).toBe(false);

    resetComputerUsePreferencesForTests();
    installApi({
      enabled: {
        version: ENABLED_STORE_VERSION + 1,
        enabled: true,
        updatedAt: ISO,
      },
    });
    // shaped record reads back, but the version gate keeps it OFF
    expect(readComputerUseEnabledRecord()).not.toBeNull();
    expect(isComputerUseEnabledPersisted()).toBe(false);
  });

  test("write round-trips through the mirror and persists via the bridge", async () => {
    const api = installApi({});
    const written = writeComputerUseEnabled(true);
    expect(readComputerUseEnabledRecord()).toEqual(written);
    expect(isComputerUseEnabledPersisted()).toBe(true);

    writeComputerUseEnabled(false);
    expect(isComputerUseEnabledPersisted()).toBe(false);

    await flushComputerUsePreferenceWrites();
    expect(api.setComputerUsePreference).toHaveBeenCalledTimes(2);
    expect(api.setComputerUsePreference).toHaveBeenLastCalledWith(
      "enabled",
      expect.objectContaining({ enabled: false }),
    );
    // SQL is authoritative — the legacy key is untouched
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  test("a degraded reset barrier rejects enablement before legacy or sidecar callers can advance", async () => {
    const original = {
      version: ENABLED_STORE_VERSION,
      enabled: false,
      updatedAt: ISO,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(original));
    installApi(
      {},
      {
        migrateLegacyComputerUse: jest.fn(() =>
          Promise.reject(
            new Error("[settings_storage_unavailable] migrate failed"),
          ),
        ),
      },
    );
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await beginComputerUsePreferencesSettingsReset();
      const blocked = writeComputerUseEnabled(true);
      await expect(blocked.persistence).rejects.toMatchObject({
        code: "settings_reset_in_progress",
      });
      expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY))).toEqual(
        original,
      );
    } finally {
      endComputerUsePreferencesSettingsReset();
      warnSpy.mockRestore();
    }
  });

  test("clear clears via the bridge and reads back OFF", async () => {
    const api = installApi({
      enabled: { version: ENABLED_STORE_VERSION, enabled: true, updatedAt: ISO },
    });
    clearComputerUseEnabled();
    expect(readComputerUseEnabledRecord()).toBeNull();
    expect(isComputerUseEnabledPersisted()).toBe(false);
    await flushComputerUsePreferenceWrites();
    expect(api.clearComputerUsePreference).toHaveBeenCalledWith("enabled");
  });
});

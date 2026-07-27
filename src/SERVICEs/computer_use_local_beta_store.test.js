import {
  isComputerUseLocalBetaPersisted,
  writeComputerUseLocalBeta,
} from "./computer_use_local_beta_store";
import {
  flushComputerUsePreferenceWrites,
  resetComputerUsePreferencesForTests,
} from "./computer_use_preferences_sql";

const STORAGE_KEY = "computer_use_local_beta_enabled";

beforeEach(() => {
  window.localStorage.clear();
  resetComputerUsePreferencesForTests();
});

describe("computer_use_local_beta_store", () => {
  test("persists an explicit, versioned beta choice", () => {
    const record = writeComputerUseLocalBeta(true);
    expect(record).toMatchObject({ version: 1, enabled: true });
    expect(isComputerUseLocalBetaPersisted()).toBe(true);

    writeComputerUseLocalBeta(false);
    expect(isComputerUseLocalBetaPersisted()).toBe(false);
  });

  test("fails closed for absent, malformed, or stale records", () => {
    expect(isComputerUseLocalBetaPersisted()).toBe(false);
    window.localStorage.setItem(STORAGE_KEY, "{broken");
    expect(isComputerUseLocalBetaPersisted()).toBe(false);
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 2, enabled: true }),
    );
    expect(isComputerUseLocalBetaPersisted()).toBe(false);
  });
});

describe("computer_use_local_beta_store (SQL mode)", () => {
  const installApi = (entries = {}) => {
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
    };
    window.settingsStorageAPI = api;
    return api;
  };

  afterEach(() => {
    delete window.settingsStorageAPI;
    resetComputerUsePreferencesForTests();
  });

  test("reads the SQL-backed beta choice and persists writes via the bridge", async () => {
    const api = installApi({});
    expect(isComputerUseLocalBetaPersisted()).toBe(false);

    const record = writeComputerUseLocalBeta(true);
    expect(record).toMatchObject({ version: 1, enabled: true });
    expect(record.persistence).toBeInstanceOf(Promise);
    expect(Object.keys(record)).not.toContain("persistence");
    expect(isComputerUseLocalBetaPersisted()).toBe(true);

    writeComputerUseLocalBeta(false);
    expect(isComputerUseLocalBetaPersisted()).toBe(false);

    await record.persistence;
    await flushComputerUsePreferenceWrites();
    expect(api.setComputerUsePreference).toHaveBeenCalledTimes(2);
    expect(api.setComputerUsePreference.mock.calls[0][0]).toBe(
      "local_beta_enabled",
    );
    // SQL is authoritative — the legacy key is untouched
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  test("FAIL CLOSED: absent, malformed, or stale SQL records read as OFF", () => {
    installApi({ local_beta_enabled: { version: 2, enabled: true } });
    expect(isComputerUseLocalBetaPersisted()).toBe(false);

    resetComputerUsePreferencesForTests();
    installApi({ local_beta_enabled: "corrupt" });
    expect(isComputerUseLocalBetaPersisted()).toBe(false);

    resetComputerUsePreferencesForTests();
    installApi({ local_beta_enabled: { version: 1, enabled: true } });
    expect(isComputerUseLocalBetaPersisted()).toBe(true);
  });
});

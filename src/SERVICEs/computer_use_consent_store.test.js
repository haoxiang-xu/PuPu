import {
  CONSENT_VERSION,
  clearComputerUseConsent,
  hasValidComputerUseConsent,
  readComputerUseConsent,
  recordComputerUseConsent,
} from "./computer_use_consent_store";
import {
  flushComputerUsePreferenceWrites,
  resetComputerUsePreferencesForTests,
} from "./computer_use_preferences_sql";

const STORAGE_KEY = "computer_use_consent";

beforeEach(() => {
  window.localStorage.clear();
  resetComputerUsePreferencesForTests();
});

describe("computer_use_consent_store", () => {
  test("no record → null and invalid consent", () => {
    expect(readComputerUseConsent()).toBeNull();
    expect(hasValidComputerUseConsent()).toBe(false);
  });

  test("recordComputerUseConsent writes { version, acceptedAt } and validates", () => {
    const record = recordComputerUseConsent();

    expect(record.version).toBe(CONSENT_VERSION);
    expect(Number.isFinite(Date.parse(record.acceptedAt))).toBe(true);

    const persisted = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    expect(persisted).toEqual(record);
    expect(hasValidComputerUseConsent()).toBe(true);
  });

  test("version mismatch re-requires consent (gate returns false)", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: CONSENT_VERSION + 1,
        acceptedAt: new Date().toISOString(),
      }),
    );

    // The record is still shaped, but not valid at the current version.
    expect(readComputerUseConsent()).not.toBeNull();
    expect(hasValidComputerUseConsent()).toBe(false);
  });

  test("corrupted or malformed records are ignored", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not json");
    expect(readComputerUseConsent()).toBeNull();

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: "x", acceptedAt: 123 }),
    );
    expect(readComputerUseConsent()).toBeNull();
    expect(hasValidComputerUseConsent()).toBe(false);
  });

  test("clearComputerUseConsent removes the record", () => {
    recordComputerUseConsent();
    expect(hasValidComputerUseConsent()).toBe(true);

    clearComputerUseConsent();
    expect(readComputerUseConsent()).toBeNull();
    expect(hasValidComputerUseConsent()).toBe(false);
  });
});

describe("computer_use_consent_store (SQL mode)", () => {
  const ISO = "2026-07-24T10:00:00.000Z";

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

  test("reads the SQL-backed record and validates consent at the current version", () => {
    installApi({ consent: { version: CONSENT_VERSION, acceptedAt: ISO } });
    expect(readComputerUseConsent()).toEqual({
      version: CONSENT_VERSION,
      acceptedAt: ISO,
    });
    expect(hasValidComputerUseConsent()).toBe(true);
  });

  test("FAIL CLOSED: no SQL record / corrupt record reads as no consent", () => {
    installApi({});
    expect(readComputerUseConsent()).toBeNull();
    expect(hasValidComputerUseConsent()).toBe(false);

    resetComputerUsePreferencesForTests();
    installApi({ consent: { version: "x", acceptedAt: 123 } });
    expect(readComputerUseConsent()).toBeNull();
    expect(hasValidComputerUseConsent()).toBe(false);
  });

  test("FAIL CLOSED: a version mismatch still reads the record but never validates", () => {
    installApi({ consent: { version: CONSENT_VERSION + 1, acceptedAt: ISO } });
    // Same semantics as legacy: shaped record is returned...
    expect(readComputerUseConsent()).not.toBeNull();
    // ...but the version gate re-requires consent.
    expect(hasValidComputerUseConsent()).toBe(false);
  });

  test("recordComputerUseConsent persists via the bridge and validates immediately", async () => {
    const api = installApi({});
    const record = recordComputerUseConsent();
    expect(record.version).toBe(CONSENT_VERSION);
    // read-your-write through the mirror
    expect(hasValidComputerUseConsent()).toBe(true);
    await flushComputerUsePreferenceWrites();
    expect(api.setComputerUsePreference).toHaveBeenCalledWith(
      "consent",
      record,
    );
    // SQL is authoritative — the legacy key is untouched
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  test("clearComputerUseConsent clears via the bridge and reads fail closed", async () => {
    const api = installApi({ consent: { version: CONSENT_VERSION, acceptedAt: ISO } });
    expect(hasValidComputerUseConsent()).toBe(true);
    clearComputerUseConsent();
    expect(readComputerUseConsent()).toBeNull();
    expect(hasValidComputerUseConsent()).toBe(false);
    await flushComputerUsePreferenceWrites();
    expect(api.clearComputerUsePreference).toHaveBeenCalledWith("consent");
  });
});

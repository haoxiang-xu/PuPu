import {
  CONSENT_VERSION,
  clearComputerUseConsent,
  hasValidComputerUseConsent,
  readComputerUseConsent,
  recordComputerUseConsent,
} from "./computer_use_consent_store";

const STORAGE_KEY = "computer_use_consent";

beforeEach(() => {
  window.localStorage.clear();
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

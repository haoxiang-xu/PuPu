import {
  ENABLED_STORE_VERSION,
  clearComputerUseEnabled,
  isComputerUseEnabledPersisted,
  readComputerUseEnabledRecord,
  writeComputerUseEnabled,
} from "./computer_use_enabled_store";

const STORAGE_KEY = "computer_use_enabled";

beforeEach(() => {
  window.localStorage.clear();
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

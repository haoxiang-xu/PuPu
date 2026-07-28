import {
  formatBytes,
  readLocalStorageEntries,
  readLocalStorageEntriesAsync,
  readSettingsDbStats,
  isSettingsDbStatsAvailable,
} from "./storage_metrics";

const installDbStatsApi = (overrides = {}) => {
  const api = {
    // REQUIRED_METHODS so resolveApi() treats the bridge as present.
    bootstrap: jest.fn(() => ({ available: true, namespaces: {} })),
    migrateLegacy: jest.fn(),
    setNamespace: jest.fn(),
    deleteNamespace: jest.fn(),
    resetSettings: jest.fn(() => Promise.resolve({ ok: true })),
    getDbStats: jest.fn(() =>
      Promise.resolve({
        ok: true,
        sizeBytes: 8192,
        tables: [
          { name: "settings", rows: 3 },
          { name: "token_usage_records", rows: 10 },
        ],
      }),
    ),
    ...overrides,
  };
  window.settingsStorageAPI = api;
  return api;
};

describe("storage_metrics", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    delete window.settingsStorageAPI;
  });

  test("formatBytes handles boundary units", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1024 * 1024)).toBe("1.00 MB");
  });

  test("readLocalStorageEntries returns size-sorted entries", () => {
    window.localStorage.setItem("small", "a");
    window.localStorage.setItem("large", "abcdefghij");

    const entries = readLocalStorageEntries();

    expect(entries.length).toBe(2);
    expect(entries[0].key).toBe("large");
    expect(entries[0].size).toBeGreaterThan(entries[1].size);
  });

  test("readLocalStorageEntriesAsync returns size-sorted entries", async () => {
    window.localStorage.setItem("small", "a");
    window.localStorage.setItem("large", "abcdefghij");

    const entries = await readLocalStorageEntriesAsync({ timeBudgetMs: 0 });

    expect(entries.length).toBe(2);
    expect(entries[0].key).toBe("large");
    expect(entries[0].size).toBeGreaterThan(entries[1].size);
  });

  test("readSettingsDbStats returns null when the bridge is unavailable", async () => {
    // no window.settingsStorageAPI installed
    expect(isSettingsDbStatsAvailable()).toBe(false);
    await expect(readSettingsDbStats()).resolves.toBeNull();
  });

  test("readSettingsDbStats returns normalized metadata when the bridge is present", async () => {
    installDbStatsApi();
    expect(isSettingsDbStatsAvailable()).toBe(true);

    const stats = await readSettingsDbStats();
    expect(stats).toEqual({
      sizeBytes: 8192,
      tables: [
        { name: "settings", rows: 3 },
        { name: "token_usage_records", rows: 10 },
      ],
    });
  });

  test("readSettingsDbStats returns null when getDbStats rejects", async () => {
    installDbStatsApi({
      getDbStats: jest.fn(() => Promise.reject(new Error("boom"))),
    });
    await expect(readSettingsDbStats()).resolves.toBeNull();
  });

  test("readSettingsDbStats drops malformed table entries and clamps size", async () => {
    installDbStatsApi({
      getDbStats: jest.fn(() =>
        Promise.resolve({
          sizeBytes: -5,
          tables: [
            { name: "settings", rows: 2 },
            { name: 123, rows: 1 },
            { name: "x" },
            null,
          ],
        }),
      ),
    });
    const stats = await readSettingsDbStats();
    expect(stats).toEqual({
      sizeBytes: 0,
      tables: [{ name: "settings", rows: 2 }],
    });
  });
});

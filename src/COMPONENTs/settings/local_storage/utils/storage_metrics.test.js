import { formatBytes, readLocalStorageEntries } from "./storage_metrics";

describe("storage_metrics", () => {
  beforeEach(() => {
    window.localStorage.clear();
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
});

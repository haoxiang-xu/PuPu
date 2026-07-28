import { settingsStorageBridge } from "../../../../SERVICEs/bridges/settings_storage_bridge";

const getEstimatedByteSize = (str = "") => String(str).length * 2;

const sortEntriesBySize = (entries) => entries.sort((a, b) => b.size - a.size);

const waitForNextChunk = () =>
  new Promise((resolve) => {
    if (
      typeof window !== "undefined" &&
      typeof window.requestAnimationFrame === "function"
    ) {
      window.requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });

const getNow = () =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

export const formatBytes = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

// Phase 5 (plan §6-Phase5): read-only settings.db metadata for the "SQLite
// Settings database" storage category. Returns { sizeBytes, tables } — metadata
// ONLY, never a stored value or secret — or null when the bridge is
// unavailable (browser dev / Jest / pre-Phase-5 preload / degraded backend), in
// which case the caller hides or N/As the category. Never throws.
export const readSettingsDbStats = async () => {
  if (
    typeof settingsStorageBridge.isResetAndDbStatsAvailable === "function" &&
    !settingsStorageBridge.isResetAndDbStatsAvailable()
  ) {
    return null;
  }
  try {
    const stats = await settingsStorageBridge.getDbStats();
    if (!stats || typeof stats !== "object") return null;
    const sizeBytes =
      typeof stats.sizeBytes === "number" && stats.sizeBytes >= 0
        ? stats.sizeBytes
        : 0;
    const tables = Array.isArray(stats.tables)
      ? stats.tables
          .filter(
            (entry) =>
              entry &&
              typeof entry.name === "string" &&
              typeof entry.rows === "number",
          )
          .map((entry) => ({ name: entry.name, rows: entry.rows }))
      : [];
    return { sizeBytes, tables };
  } catch {
    return null;
  }
};

// Synchronous availability probe for the "SQLite Settings database" category
// so the section can hide immediately (no loading flash) in browser dev / Jest
// / a pre-Phase-5 preload rather than rendering then disappearing.
export const isSettingsDbStatsAvailable = () =>
  typeof settingsStorageBridge.isResetAndDbStatsAvailable === "function"
    ? settingsStorageBridge.isResetAndDbStatsAvailable()
    : false;

export const readLocalStorageEntries = () => {
  try {
    const entries = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (typeof key !== "string") continue;
      const value = localStorage.getItem(key) || "";
      const size = getEstimatedByteSize(key) + getEstimatedByteSize(value);
      entries.push({ key, size });
    }
    return sortEntriesBySize(entries);
  } catch {
    return [];
  }
};

export const readLocalStorageEntriesAsync = async ({
  signal,
  timeBudgetMs = 8,
} = {}) => {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (typeof key === "string") {
        keys.push(key);
      }
    }

    const entries = [];
    let sliceStart = getNow();
    for (let i = 0; i < keys.length; i++) {
      if (signal?.aborted) {
        return [];
      }
      const key = keys[i];
      const value = localStorage.getItem(key) || "";
      const size = getEstimatedByteSize(key) + getEstimatedByteSize(value);
      entries.push({ key, size });

      if (
        i < keys.length - 1 &&
        getNow() - sliceStart >= timeBudgetMs
      ) {
        await waitForNextChunk();
        sliceStart = getNow();
      }
    }

    return sortEntriesBySize(entries);
  } catch {
    return [];
  }
};

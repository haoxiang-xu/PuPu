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

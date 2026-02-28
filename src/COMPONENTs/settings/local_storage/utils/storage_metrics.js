const getByteSize = (str) => new Blob([str]).size;

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
      const value = localStorage.getItem(key) || "";
      const size = getByteSize(key) + getByteSize(value);
      entries.push({ key, size });
    }
    return entries.sort((a, b) => b.size - a.size);
  } catch {
    return [];
  }
};

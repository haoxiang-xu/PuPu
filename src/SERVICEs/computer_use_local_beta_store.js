const STORAGE_KEY = "computer_use_local_beta_enabled";
const VERSION = 1;

const storage = () =>
  typeof window !== "undefined" && window.localStorage
    ? window.localStorage
    : null;

export const isComputerUseLocalBetaPersisted = () => {
  try {
    const raw = JSON.parse(storage()?.getItem(STORAGE_KEY) || "null");
    return raw?.version === VERSION && raw?.enabled === true;
  } catch (_error) {
    return false;
  }
};

export const writeComputerUseLocalBeta = (enabled) => {
  const record = {
    version: VERSION,
    enabled: enabled === true,
    updatedAt: new Date().toISOString(),
  };
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch (_error) {
    // Fail closed on the next read if persistence is unavailable.
  }
  return record;
};

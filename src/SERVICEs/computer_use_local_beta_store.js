import {
  isComputerUsePrefsSqlMode,
  readComputerUsePreferenceRecord,
  writeComputerUsePreferenceRecord,
  isComputerUsePreferencesSettingsResetActive,
  validateLocalBetaRecord,
} from "./computer_use_preferences_sql";

const STORAGE_KEY = "computer_use_local_beta_enabled";
const PREF_KEY = "local_beta_enabled";
const VERSION = 1;

const storage = () =>
  typeof window !== "undefined" && window.localStorage
    ? window.localStorage
    : null;

// Phase 2 (S3): in Electron with the SQL preload bridge the record lives in
// the computer_use_preferences table (read from a bootstrap-seeded mirror);
// everywhere else the legacy localStorage path is byte-identical to pre-S3.
// Both paths FAIL CLOSED: absent / corrupt / stale records read as OFF.
export const isComputerUseLocalBetaPersisted = () => {
  if (isComputerUsePrefsSqlMode()) {
    const record = validateLocalBetaRecord(
      readComputerUsePreferenceRecord(PREF_KEY),
    );
    return record?.version === VERSION && record?.enabled === true;
  }
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
  const resetActive = isComputerUsePreferencesSettingsResetActive();
  if (resetActive || isComputerUsePrefsSqlMode()) {
    const persistence = writeComputerUsePreferenceRecord(PREF_KEY, record);
    Object.defineProperty(record, "persistence", {
      value: persistence,
      enumerable: false,
    });
    return record;
  }
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch (_error) {
    // Fail closed on the next read if persistence is unavailable.
  }
  return record;
};

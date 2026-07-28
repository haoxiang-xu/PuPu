/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  computer_use_enabled_store                                                    */
/*                                                                                */
/*  Persists the user's DESIRED (expected) computer-use enablement state.         */
/*                                                                                */
/*  This is only the expected state — server truth is whatever the sidecar        */
/*  reports via getComputerUseStatus(). localStorage says "the user wants it on"; */
/*  the running config is the authority for whether it is actually in effect.     */
/*                                                                                */
/*  Like computer_use_consent_store, this is intentionally its OWN localStorage   */
/*  key — NOT part of the shared / CTO-gated `settings` object — so the settings   */
/*  schema is untouched. (CTO-approved independent key, 2026-07-18.)               */
/*                                                                                */
/*  Shape: { version: <int>, enabled: <bool>, updatedAt: "<ISO-8601>" }           */
/*                                                                                */
/*  FAIL-CLOSED: any absent / corrupted / mis-shaped record reads back as OFF.    */
/*  A record that does not validate is treated as "not enabled", never as on.     */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

import {
  isComputerUsePrefsSqlMode,
  readComputerUsePreferenceRecord,
  writeComputerUsePreferenceRecord,
  clearComputerUsePreferenceRecord,
  isComputerUsePreferencesSettingsResetActive,
  validateEnabledRecord,
} from "./computer_use_preferences_sql";

const STORAGE_KEY = "computer_use_enabled";
const PREF_KEY = "enabled";

// Bump when the persisted shape changes in a way that invalidates old records.
export const ENABLED_STORE_VERSION = 1;

const hasLocalStorage = () =>
  typeof window !== "undefined" && !!window.localStorage;

/**
 * Read the raw enablement record, or null when absent / corrupted / mis-shaped.
 * A record is only returned when it is shaped
 * { version:int, enabled:bool, updatedAt:ISO }.
 *
 * Phase 2 (S3): in Electron with the SQL preload bridge the record lives in
 * the computer_use_preferences table (read from a bootstrap-seeded mirror);
 * everywhere else the legacy localStorage path below is byte-identical to
 * pre-S3. Both paths FAIL CLOSED: anything unusable reads back as OFF.
 */
export const readComputerUseEnabledRecord = () => {
  if (
    isComputerUsePreferencesSettingsResetActive() ||
    isComputerUsePrefsSqlMode()
  ) {
    return validateEnabledRecord(readComputerUsePreferenceRecord(PREF_KEY));
  }
  if (!hasLocalStorage()) return null;

  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    const record = validateEnabledRecord(raw);
    if (record) return record;
  } catch (_error) {
    // corrupted — treated as OFF
  }
  return null;
};

/**
 * The user's persisted desired state, coerced FAIL-CLOSED to a boolean.
 * Absent / corrupted / mis-shaped / version-mismatched → false (OFF).
 */
export const isComputerUseEnabledPersisted = () => {
  const record = readComputerUseEnabledRecord();
  return !!record && record.version === ENABLED_STORE_VERSION && record.enabled === true;
};

/**
 * Persist the desired enablement state at the current version with an ISO
 * timestamp. Returns the written record (also returned when localStorage is
 * unavailable, so a caller's in-memory flow stays consistent).
 */
export const writeComputerUseEnabled = (enabled) => {
  const record = {
    version: ENABLED_STORE_VERSION,
    enabled: Boolean(enabled),
    updatedAt: new Date().toISOString(),
  };

  if (
    isComputerUsePreferencesSettingsResetActive() ||
    isComputerUsePrefsSqlMode()
  ) {
    const persistence = writeComputerUsePreferenceRecord(PREF_KEY, record);
    // Preserve the long-standing synchronous record return while giving the
    // controller an explicit acknowledgement it can await before declaring
    // success or pushing the desired state to the sidecar.
    Object.defineProperty(record, "persistence", {
      value: persistence,
      enumerable: false,
    });
    return record;
  }
  if (hasLocalStorage()) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    } catch (_error) {
      // quota / serialization failure — keep the in-memory record
    }
  }
  return record;
};

/**
 * Remove any stored desired state. After clearing, reads are OFF.
 */
export const clearComputerUseEnabled = () => {
  if (
    isComputerUsePreferencesSettingsResetActive() ||
    isComputerUsePrefsSqlMode()
  ) {
    return clearComputerUsePreferenceRecord(PREF_KEY);
  }
  if (!hasLocalStorage()) return Promise.resolve();
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (_error) {
    // ignore
  }
  return Promise.resolve();
};

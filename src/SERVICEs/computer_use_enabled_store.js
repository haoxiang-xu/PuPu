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

const STORAGE_KEY = "computer_use_enabled";

// Bump when the persisted shape changes in a way that invalidates old records.
export const ENABLED_STORE_VERSION = 1;

const hasLocalStorage = () =>
  typeof window !== "undefined" && !!window.localStorage;

const isValidIsoTimestamp = (value) => {
  if (typeof value !== "string" || !value) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
};

/**
 * Read the raw enablement record, or null when absent / corrupted / mis-shaped.
 * A record is only returned when it is shaped
 * { version:int, enabled:bool, updatedAt:ISO }.
 */
export const readComputerUseEnabledRecord = () => {
  if (!hasLocalStorage()) return null;

  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    if (
      raw &&
      typeof raw === "object" &&
      Number.isInteger(raw.version) &&
      typeof raw.enabled === "boolean" &&
      isValidIsoTimestamp(raw.updatedAt)
    ) {
      return {
        version: raw.version,
        enabled: raw.enabled,
        updatedAt: raw.updatedAt,
      };
    }
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
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (_error) {
    // ignore
  }
};

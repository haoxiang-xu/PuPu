/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  computer_use_consent_store                                                    */
/*                                                                                */
/*  One-time, per-install informed consent for computer use.                      */
/*                                                                                */
/*  Anthropic requires obtaining the user's consent PRIOR to enabling computer    */
/*  use. This helper persists that consent. It is intentionally its OWN           */
/*  localStorage key — NOT part of the shared / CTO-gated `settings` object — so   */
/*  the settings schema is untouched.                                             */
/*                                                                                */
/*  Shape: { version: <int>, acceptedAt: "<ISO-8601>" }                            */
/*                                                                                */
/*  `version` is load-bearing: when the capability changes materially, bump       */
/*  CONSENT_VERSION so a stale record no longer counts as valid consent and the   */
/*  user is asked again. One-time per install (not per session — per-session      */
/*  prompting only trains reflexive clicking).                                    */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

import {
  isComputerUsePrefsSqlMode,
  readComputerUsePreferenceRecord,
  writeComputerUsePreferenceRecord,
  clearComputerUsePreferenceRecord,
  validateConsentRecord,
} from "./computer_use_preferences_sql";

const STORAGE_KEY = "computer_use_consent";
const PREF_KEY = "consent";

// Bump this when computer use changes in a way that warrants re-consent.
export const CONSENT_VERSION = 1;

const hasLocalStorage = () =>
  typeof window !== "undefined" && !!window.localStorage;

/**
 * Read the raw consent record, or null when absent / corrupted.
 * A record is only returned when it is shaped { version:int, acceptedAt:ISO }.
 *
 * Phase 2 (S3): in Electron with the SQL preload bridge the record lives in
 * the computer_use_preferences table (read from a bootstrap-seeded mirror);
 * everywhere else the legacy localStorage path below is byte-identical to
 * pre-S3. Both paths FAIL CLOSED: anything unusable reads as no consent.
 */
export const readComputerUseConsent = () => {
  if (isComputerUsePrefsSqlMode()) {
    // The mirror only holds validated records; re-validate anyway so the
    // fail-closed gate never depends on how the record got there.
    return validateConsentRecord(readComputerUsePreferenceRecord(PREF_KEY));
  }
  if (!hasLocalStorage()) return null;

  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    const record = validateConsentRecord(raw);
    if (record) return record;
  } catch (_error) {
    // corrupted — treated as no consent
  }
  return null;
};

/**
 * True only when a stored record exists AND its version matches the current
 * CONSENT_VERSION. A version mismatch (capability changed) re-requires consent.
 */
export const hasValidComputerUseConsent = () => {
  const record = readComputerUseConsent();
  return !!record && record.version === CONSENT_VERSION;
};

/**
 * Persist consent at the current version with an ISO timestamp.
 * Returns the written record (also returned when localStorage is unavailable,
 * so a caller's in-memory flow stays consistent).
 */
export const recordComputerUseConsent = () => {
  const record = {
    version: CONSENT_VERSION,
    acceptedAt: new Date().toISOString(),
  };

  if (isComputerUsePrefsSqlMode()) {
    writeComputerUsePreferenceRecord(PREF_KEY, record);
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
 * Remove any stored consent. Used on explicit reset (and available so a future
 * "turn off computer use" flow can also clear consent if desired).
 */
export const clearComputerUseConsent = () => {
  if (isComputerUsePrefsSqlMode()) {
    clearComputerUsePreferenceRecord(PREF_KEY);
    return;
  }
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (_error) {
    // ignore
  }
};

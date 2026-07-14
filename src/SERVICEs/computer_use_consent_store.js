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

const STORAGE_KEY = "computer_use_consent";

// Bump this when computer use changes in a way that warrants re-consent.
export const CONSENT_VERSION = 1;

const hasLocalStorage = () =>
  typeof window !== "undefined" && !!window.localStorage;

const isValidIsoTimestamp = (value) => {
  if (typeof value !== "string" || !value) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
};

/**
 * Read the raw consent record, or null when absent / corrupted.
 * A record is only returned when it is shaped { version:int, acceptedAt:ISO }.
 */
export const readComputerUseConsent = () => {
  if (!hasLocalStorage()) return null;

  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    if (
      raw &&
      typeof raw === "object" &&
      Number.isInteger(raw.version) &&
      isValidIsoTimestamp(raw.acceptedAt)
    ) {
      return { version: raw.version, acceptedAt: raw.acceptedAt };
    }
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
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (_error) {
    // ignore
  }
};

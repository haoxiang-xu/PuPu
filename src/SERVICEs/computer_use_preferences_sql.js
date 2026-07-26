// Shared SQL-mode machinery for the three computer use preference stores
// (Phase 2 / S3, plan §3.4):
//   - computer_use_consent_store.js        → key "consent"
//   - computer_use_enabled_store.js        → key "enabled"
//   - computer_use_local_beta_store.js     → key "local_beta_enabled"
//
// This module is an internal implementation detail of those three stores —
// nothing else may import it. One table, one bootstrap-seeded in-memory
// mirror, one FIFO write queue and ONE per-store migration covering all three
// keys, so whichever store is touched first migrates the whole family.
//
// SAFETY CONTRACT (this is a security surface — §3.4 "fail closed" is
// non-negotiable):
//   - Reads are synchronous (boot_sync runs early) and answer from the
//     mirror. A mirror that is not ready, has no record, or holds anything
//     that does not validate returns null — i.e. NOT consented / NOT enabled.
//     Nothing ever waits for the mirror by returning an open value.
//   - Records only carry the user's DESIRED state. The sidecar's runtime
//     status remains the actual-effect authority; this module never talks to
//     the sidecar.
//   - Migration failure degrades to localStorage, whose legacy fail-closed
//     readers hold unchanged. already-complete and refused-stale-digest both
//     mean SQL was authoritative before this session (and may have narrowed
//     since the legacy snapshot): the mirror is emptied first (fail closed)
//     and only then re-seeded from SQL.
//
// Logging: key names, counts and error codes only — never record contents.

import {
  settingsStorageBridge,
  isComputerUsePrefsBridgeAvailable,
  parseSettingsStorageErrorCode,
  getSessionBootstrapSnapshot,
  getSqlStoreMigrationMeta,
  resetSessionBootstrapSnapshotForTests,
} from "./bridges/settings_storage_bridge";
import { computeSettingsMigrationDigest } from "./settings_repository";

export const COMPUTER_USE_MIGRATION_MARKER_KEY =
  "pupu.computer_use_sql_migration.v1";

const COMPUTER_USE_MIGRATION_VERSION = 1;

// key → legacy localStorage key (must stay in sync with the three stores).
const LEGACY_STORAGE_KEYS = Object.freeze({
  consent: "computer_use_consent",
  enabled: "computer_use_enabled",
  local_beta_enabled: "computer_use_local_beta_enabled",
});
const PREF_KEYS = Object.freeze(Object.keys(LEGACY_STORAGE_KEYS));

const isObject = (v) => v != null && typeof v === "object" && !Array.isArray(v);

const hasLocalStorage = () =>
  typeof window !== "undefined" && !!window.localStorage;

const isValidIsoTimestamp = (value) => {
  if (typeof value !== "string" || !value) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
};

/* ─────────────────────── shape validators (fail closed) ─────────────────── */
// Byte-for-byte mirrors of the legacy readers' gates. The version GATE
// (CONSENT_VERSION / ENABLED_STORE_VERSION) stays in the stores, applied on
// read exactly like legacy: a shaped record with a mismatched version is
// still returned by the raw readers — it just never counts as consent /
// enabled.

export const validateConsentRecord = (raw) => {
  if (
    isObject(raw) &&
    Number.isInteger(raw.version) &&
    isValidIsoTimestamp(raw.acceptedAt)
  ) {
    return { version: raw.version, acceptedAt: raw.acceptedAt };
  }
  return null;
};

export const validateEnabledRecord = (raw) => {
  if (
    isObject(raw) &&
    Number.isInteger(raw.version) &&
    typeof raw.enabled === "boolean" &&
    isValidIsoTimestamp(raw.updatedAt)
  ) {
    return { version: raw.version, enabled: raw.enabled, updatedAt: raw.updatedAt };
  }
  return null;
};

// The legacy local-beta reader only gates version + enabled — updatedAt is
// optional (the writer always sets it; this mirrors the READ gate).
export const validateLocalBetaRecord = (raw) => {
  if (
    isObject(raw) &&
    Number.isInteger(raw.version) &&
    typeof raw.enabled === "boolean" &&
    (raw.updatedAt === undefined || isValidIsoTimestamp(raw.updatedAt))
  ) {
    return {
      version: raw.version,
      enabled: raw.enabled,
      ...(raw.updatedAt !== undefined ? { updatedAt: raw.updatedAt } : {}),
    };
  }
  return null;
};

const VALIDATORS = Object.freeze({
  consent: validateConsentRecord,
  enabled: validateEnabledRecord,
  local_beta_enabled: validateLocalBetaRecord,
});

const validateRecordForKey = (key, raw) => {
  const validator = VALIDATORS[key];
  return validator ? validator(raw) : null;
};

/* ───────────────────────────── module state ─────────────────────────────── */

let state = null;

const createInitialState = () => ({
  mode: "localStorage", // "sql" | "localStorage"
  degraded: false,
  lastErrorCode: null,
  migrated: false, // SQL is the authority (migration complete or unneeded)
  // While false, SQL-mode reads return null (fail closed). Only ever false
  // transiently after a refused-stale-digest, until the SQL re-seed lands.
  mirrorReady: false,
  // Null prototype: keys are fixed, but keep the same own-key discipline as
  // every other snapshot-fed map.
  mirrorEntries: Object.create(null),
  pendingWrites: 0,
  queueTail: Promise.resolve(),
});

// Single FIFO queue (migration first, then writes in order) — same pattern as
// the other Phase 2 stores.
const enqueue = (s, op) => {
  s.pendingWrites += 1;
  const opPromise = s.queueTail.then(() => op());
  s.queueTail = opPromise.then(
    () => {
      s.pendingWrites -= 1;
    },
    () => {
      s.pendingWrites -= 1;
    },
  );
  opPromise.catch(() => {});
  return opPromise;
};

const degradeToFallback = (s, errorCode) => {
  s.mode = "localStorage";
  s.degraded = true;
  if (errorCode) s.lastErrorCode = errorCode;
  s.mirrorEntries = Object.create(null);
  s.mirrorReady = false;
};

const readLegacyRaw = (key) => {
  if (!hasLocalStorage()) return null;
  try {
    return JSON.parse(
      window.localStorage.getItem(LEGACY_STORAGE_KEYS[key]) || "null",
    );
  } catch {
    return null; // corrupted — fail closed
  }
};

const seedMirrorFromEntries = (s, entries) => {
  s.mirrorEntries = Object.create(null);
  if (isObject(entries)) {
    for (const key of PREF_KEYS) {
      const record = validateRecordForKey(key, entries[key]);
      if (record) s.mirrorEntries[key] = record;
    }
  }
  s.mirrorReady = true;
};

const readMigrationMarker = () => {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(COMPUTER_USE_MIGRATION_MARKER_KEY) || "null",
    );
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const writeMigrationMarker = (digest, completedAt) => {
  try {
    window.localStorage.setItem(
      COMPUTER_USE_MIGRATION_MARKER_KEY,
      JSON.stringify({
        digest: digest || null,
        completedAt: completedAt || Date.now(),
      }),
    );
  } catch {
    // best-effort; SQL meta (computer_use_migration_state) stays authoritative
  }
};

// Re-seed the mirror from SQL inside a queued op. Used after a
// refused-stale-digest: SQL is the authority and the legacy seed may be WIDER
// (e.g. legacy says consented, SQL says not) — so the mirror is emptied
// (fail closed) BEFORE this await, never after.
const reloadMirrorFromSql = async (s) => {
  try {
    const result = await settingsStorageBridge.readComputerUsePreferences();
    if (state !== s || s.mode !== "sql") return;
    seedMirrorFromEntries(s, result && isObject(result.entries) ? result.entries : {});
  } catch (error) {
    if (state !== s) return;
    const code =
      parseSettingsStorageErrorCode(error) || "settings_storage_error";
    console.warn("[computer-use-prefs] SQL re-read failed:", code);
    // Mirror stays empty → reads keep failing closed for this session.
    s.mirrorReady = true;
  }
};

const runComputerUseMigration = async (s, records) => {
  if (state !== s) return;
  const payloadBase = {
    migrationVersion: COMPUTER_USE_MIGRATION_VERSION,
    records,
  };
  let digest = null;
  try {
    digest = await computeSettingsMigrationDigest(payloadBase);
  } catch {
    digest = null; // main recomputes; a missing claimed digest is safe
  }
  const payload = digest ? { ...payloadBase, digest } : payloadBase;
  try {
    const result = await settingsStorageBridge.migrateLegacyComputerUse(payload);
    if (state !== s) return;
    const status = result ? result.status : undefined;
    if (status === "complete") {
      writeMigrationMarker(result.digest || digest, result.migratedAt);
      s.migrated = true;
      if (result.droppedEntries > 0) {
        console.warn(
          `[computer-use-prefs] migration dropped ${result.droppedEntries} ` +
            "invalid entrie(s)",
        );
      }
    } else if (status === "already-complete") {
      // SQL was the authority BEFORE this session (marker lost, legacy
      // unchanged since the original import) and may have narrowed since —
      // e.g. consent revoked post-migration. The mirror was seeded from
      // legacy, so FAIL CLOSED first, then re-seed from SQL; keeping the
      // legacy-seeded mirror would resurrect revoked consent/enablement.
      writeMigrationMarker(result.digest || digest, result.migratedAt);
      s.migrated = true;
      s.mirrorEntries = Object.create(null);
      s.mirrorReady = false;
      await reloadMirrorFromSql(s);
    } else if (status === "refused-stale-digest") {
      // SQL already migrated from different legacy data — SQL is the
      // authority. FAIL CLOSED first (the legacy seed may be wider), then
      // re-seed from SQL.
      console.warn(
        "[computer-use-prefs] legacy migration refused (stale digest); " +
          "SQL stays authoritative",
      );
      s.migrated = true;
      s.mirrorEntries = Object.create(null);
      s.mirrorReady = false;
      await reloadMirrorFromSql(s);
    } else {
      console.warn(
        "[computer-use-prefs] legacy migration returned an unknown status; " +
          "degrading to localStorage fallback",
      );
      degradeToFallback(s, "migration_unknown_status");
    }
  } catch (error) {
    if (state !== s) return;
    const code =
      parseSettingsStorageErrorCode(error) || "settings_storage_error";
    console.warn("[computer-use-prefs] legacy migration failed:", code);
    degradeToFallback(s, code);
  }
};

const ensureInit = () => {
  if (state) return state;
  const s = createInitialState();
  state = s;
  if (!isComputerUsePrefsBridgeAvailable()) {
    // Browser dev / Jest / pre-S3 preload: legacy behavior, not degraded.
    return s;
  }
  // One session-shared bootstrap sendSync for every Phase 2 store — never a
  // per-store sendSync on hot-path first use (boot_sync reads early).
  const snapshot = getSessionBootstrapSnapshot();
  const computerUse =
    snapshot && snapshot.available === true && isObject(snapshot.computerUse)
      ? snapshot.computerUse
      : null;
  if (!computerUse || !isObject(computerUse.entries)) {
    // Bridge methods exist but the snapshot has no computerUse section —
    // degraded main process or version skew. Stay on localStorage.
    degradeToFallback(s, "bootstrap_missing_computer_use");
    return s;
  }
  s.mode = "sql";
  const hasLegacyData =
    hasLocalStorage() &&
    PREF_KEYS.some(
      (key) => window.localStorage.getItem(LEGACY_STORAGE_KEYS[key]) != null,
    );
  // Migration trigger consults BOTH sides (same arbitration as the toolkit
  // stores): a known SQL meta state overrules the local marker — a marker
  // can outlive a reset/replaced settings.db, and SQL already complete with
  // a lost marker just restores the marker. A null meta (older main
  // process) falls back to marker-only behavior. Safety direction holds
  // either way: re-import only re-establishes the user's own legacy desired
  // state, and every read stays fail-closed-validated.
  const sqlMeta = getSqlStoreMigrationMeta("computerUse");
  const sqlMigrated = sqlMeta !== null && sqlMeta.state === "complete";
  const shouldMigrate =
    hasLegacyData && (sqlMeta !== null ? !sqlMigrated : !readMigrationMarker());
  if (shouldMigrate) {
    // Pre-migration: legacy stays authoritative — mirror seeded from the
    // validated legacy records (anything invalid legacy-reads as fail-closed
    // null anyway) + write-through until the queued migration resolves.
    const legacyRecords = {};
    for (const key of PREF_KEYS) {
      const record = validateRecordForKey(key, readLegacyRaw(key));
      if (record) legacyRecords[key] = record;
    }
    seedMirrorFromEntries(s, legacyRecords);
    s.migrated = false;
    enqueue(s, () => runComputerUseMigration(s, legacyRecords));
  } else {
    s.migrated = true;
    seedMirrorFromEntries(s, computerUse.entries);
    if (sqlMigrated && !readMigrationMarker()) {
      writeMigrationMarker(sqlMeta.digest, sqlMeta.migratedAt);
    }
  }
  return s;
};

const enqueueSet = (s, key, record) => {
  enqueue(s, async () => {
    if (state !== s || s.mode !== "sql") {
      // Degraded after this write was queued (failed migration). Degradation
      // only happens pre-migration, where every write already went through
      // to localStorage — nothing to replay.
      return;
    }
    try {
      await settingsStorageBridge.setComputerUsePreference(key, record);
    } catch (error) {
      const code =
        parseSettingsStorageErrorCode(error) || "settings_storage_error";
      s.lastErrorCode = code;
      console.warn(`[computer-use-prefs] persist failed for "${key}":`, code);
    }
  });
};

const enqueueClear = (s, key) => {
  enqueue(s, async () => {
    if (state !== s || s.mode !== "sql") return;
    try {
      await settingsStorageBridge.clearComputerUsePreference(key);
    } catch (error) {
      const code =
        parseSettingsStorageErrorCode(error) || "settings_storage_error";
      s.lastErrorCode = code;
      console.warn(`[computer-use-prefs] clear failed for "${key}":`, code);
    }
  });
};

/* ──────────────────── surface consumed by the three stores ──────────────── */

/** True when this session persists computer use prefs to SQL (Electron, S3+). */
export const isComputerUsePrefsSqlMode = () => ensureInit().mode === "sql";

/**
 * Synchronous mirror read. null when the record is absent, invalid, or the
 * mirror is not ready — all of which the calling store treats as NOT
 * consented / NOT enabled (fail closed). Only meaningful in SQL mode.
 */
export const readComputerUsePreferenceRecord = (key) => {
  const s = ensureInit();
  if (s.mode !== "sql" || !s.mirrorReady) return null;
  return validateRecordForKey(key, s.mirrorEntries[key]);
};

// A record that turns a feature OFF narrows what any localStorage fallback
// reader may serve. Post-migration the legacy copy is otherwise frozen — but
// a frozen WIDER state would resurrect revoked enablement in a later
// degraded / old-preload session, so narrowing writes go through (never
// widening ones, so SQL stays the only authority that can turn anything on).
const isNarrowingRecord = (key, record) =>
  (key === "enabled" || key === "local_beta_enabled") &&
  isObject(record) &&
  record.enabled === false;

/**
 * Optimistic mirror write + queued SQL persist. While the migration is
 * pending, writes go through to localStorage too (legacy stays authoritative
 * so a failed migration loses nothing). After migration, only NARROWING
 * records (enabled=false over an existing legacy record) write through, so
 * the frozen legacy copy can never stay wider than the user's latest intent.
 */
export const writeComputerUsePreferenceRecord = (key, record) => {
  const s = ensureInit();
  if (s.mode !== "sql") return;
  s.mirrorEntries[key] = record;
  if (hasLocalStorage()) {
    try {
      const writeThrough =
        !s.migrated ||
        (isNarrowingRecord(key, record) &&
          window.localStorage.getItem(LEGACY_STORAGE_KEYS[key]) != null);
      if (writeThrough) {
        window.localStorage.setItem(
          LEGACY_STORAGE_KEYS[key],
          JSON.stringify(record),
        );
      }
    } catch {
      // quota — mirror + queued SQL write still carry the state
    }
  }
  enqueueSet(s, key, record);
};

/**
 * Optimistic mirror delete + queued SQL clear. Clears are always narrowing
 * (fail-closed direction), so they write through to the legacy key even
 * post-migration: a frozen legacy record would otherwise resurrect revoked
 * consent/enablement in a degraded or old-preload session that falls back to
 * localStorage.
 */
export const clearComputerUsePreferenceRecord = (key) => {
  const s = ensureInit();
  if (s.mode !== "sql") return;
  delete s.mirrorEntries[key];
  if (hasLocalStorage()) {
    try {
      window.localStorage.removeItem(LEGACY_STORAGE_KEYS[key]);
    } catch {
      // ignore
    }
  }
  enqueueClear(s, key);
};

/** Resolve when every queued computer-use operation has settled (tests/QA). */
export const flushComputerUsePreferenceWrites = async () => {
  const s = ensureInit();
  let tail;
  do {
    tail = s.queueTail;
    await tail;
  } while (state === s && tail !== s.queueTail);
};

// Reset-settings (plan §6-Phase5). SECURITY-RELEVANT: the consent/enabled
// mirror gates the computer-use auto-approval path, so its reset is fail-closed.
// After the main-process SQL transaction clears the computer_use_preferences
// table, the settings-reset coordination point (src/COMPONENTs/settings/
// local_storage) calls this once resetSettings() resolves to empty the SQL-mode
// in-memory mirror for the REST of the session — otherwise readComputerUseConsent()
// / readComputerUseEnabled() keep returning the pre-reset records (the agent
// could keep auto-approving on stale consent) until the next app launch. The
// mirror stays "ready" so cleared reads return the fail-closed default (null =
// NOT consented / NOT enabled), never a not-ready null. No-op when the store
// was never initialized (no mirror to clear) or is not SQL-backed (fallback
// reads hit the already-stripped localStorage directly). Never runs ensureInit().
export const resetComputerUsePreferencesMirrorForSettingsReset = () => {
  const s = state;
  if (!s || s.mode !== "sql") return;
  s.mirrorEntries = Object.create(null);
  s.mirrorReady = true;
};

/** Test-only: drop module state so the next call re-runs init. */
export const resetComputerUsePreferencesForTests = () => {
  state = null;
  resetSessionBootstrapSnapshotForTests();
};

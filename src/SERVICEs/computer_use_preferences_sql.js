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
let settingsResetBarrierActive = false;
let settingsQuitBarrierActive = false;

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
  // Last records acknowledged by SQL. Optimistic mutations never change this
  // map until their IPC succeeds, so a rejected narrowing operation can roll
  // back to exactly what the next bootstrap will serve.
  confirmedEntries: Object.create(null),
  // Exact legacy localStorage bytes last paired with an acknowledged SQL
  // mutation. Optimistic dual-kept writes are restored from here when their
  // SQL operation rejects, so a fallback session cannot revive a failed grant
  // or permanently retain a failed revocation.
  confirmedLegacyEntries: Object.create(null),
  pendingLegacyEntries: Object.create(null),
  latestMutationIds: Object.create(null),
  nextMutationId: 0,
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
  s.confirmedEntries = Object.create(null);
  s.confirmedLegacyEntries = Object.create(null);
  s.pendingLegacyEntries = Object.create(null);
  s.latestMutationIds = Object.create(null);
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
  const normalized = Object.create(null);
  if (isObject(entries)) {
    for (const key of PREF_KEYS) {
      const record = validateRecordForKey(key, entries[key]);
      if (record) normalized[key] = record;
    }
  }
  s.mirrorEntries = normalized;
  s.confirmedEntries = Object.assign(Object.create(null), normalized);
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
      s.confirmedEntries = Object.create(null);
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
      s.confirmedEntries = Object.create(null);
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

const restoreConfirmedEntry = (s, key) => {
  if (Object.prototype.hasOwnProperty.call(s.confirmedEntries, key)) {
    s.mirrorEntries[key] = s.confirmedEntries[key];
  } else {
    delete s.mirrorEntries[key];
  }
};

const readLegacyEntrySnapshot = (key) => {
  if (!hasLocalStorage()) return null;
  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEYS[key]);
    return { present: raw !== null, raw };
  } catch {
    return null;
  }
};

const legacyEntrySnapshotsEqual = (left, right) =>
  !!left &&
  !!right &&
  left.present === right.present &&
  (!left.present || left.raw === right.raw);

const restoreLegacyEntrySnapshot = (key, snapshot) => {
  if (!hasLocalStorage() || !snapshot) return false;
  try {
    if (snapshot.present) {
      window.localStorage.setItem(LEGACY_STORAGE_KEYS[key], snapshot.raw);
    } else {
      window.localStorage.removeItem(LEGACY_STORAGE_KEYS[key]);
    }
    return true;
  } catch {
    return false;
  }
};

const applyLegacyEntryMutation = (s, key, nextSnapshot) => {
  const current = readLegacyEntrySnapshot(key);
  if (!current || !nextSnapshot) return null;
  if (!Object.prototype.hasOwnProperty.call(s.confirmedLegacyEntries, key)) {
    s.confirmedLegacyEntries[key] = current;
  }
  if (!restoreLegacyEntrySnapshot(key, nextSnapshot)) return null;
  s.pendingLegacyEntries[key] = nextSnapshot;
  return { after: nextSnapshot };
};

const confirmLegacyEntryMutation = (s, key, legacyMutation) => {
  if (legacyMutation) {
    s.confirmedLegacyEntries[key] = legacyMutation.after;
  }
};

const settleLatestLegacyEntry = (s, key) => {
  const pending = s.pendingLegacyEntries[key];
  if (!pending) return;
  delete s.pendingLegacyEntries[key];
  const current = readLegacyEntrySnapshot(key);
  if (!legacyEntrySnapshotsEqual(current, pending)) {
    // A non-repository writer changed the legacy key after our optimistic
    // mutation. Never overwrite that newer external value during rollback.
    return;
  }
  restoreLegacyEntrySnapshot(key, s.confirmedLegacyEntries[key]);
};

const enqueueSet = (s, key, record, mutationId, legacyMutation) =>
  enqueue(s, async () => {
    if (state !== s || s.mode !== "sql") {
      // Degraded after this write was queued (failed migration). Degradation
      // only happens pre-migration, where every write already went through
      // to localStorage — nothing to replay.
      return;
    }
    try {
      const ack = await settingsStorageBridge.setComputerUsePreference(
        key,
        record,
      );
      if (state === s) {
        s.confirmedEntries[key] = record;
        confirmLegacyEntryMutation(s, key, legacyMutation);
        s.lastErrorCode = null;
        if (s.latestMutationIds[key] === mutationId) {
          s.mirrorEntries[key] = record;
          settleLatestLegacyEntry(s, key);
        }
      }
      return ack;
    } catch (error) {
      const code =
        parseSettingsStorageErrorCode(error) || "settings_storage_error";
      s.lastErrorCode = code;
      console.warn(`[computer-use-prefs] persist failed for "${key}":`, code);
      if (state === s && s.latestMutationIds[key] === mutationId) {
        restoreConfirmedEntry(s, key);
        settleLatestLegacyEntry(s, key);
      }
      throw error;
    }
  });

const enqueueClear = (s, key, mutationId, legacyMutation) =>
  enqueue(s, async () => {
    if (state !== s || s.mode !== "sql") return;
    try {
      const ack = await settingsStorageBridge.clearComputerUsePreference(key);
      if (state === s) {
        delete s.confirmedEntries[key];
        confirmLegacyEntryMutation(s, key, legacyMutation);
        s.lastErrorCode = null;
        if (s.latestMutationIds[key] === mutationId) {
          delete s.mirrorEntries[key];
          settleLatestLegacyEntry(s, key);
        }
      }
      return ack;
    } catch (error) {
      const code =
        parseSettingsStorageErrorCode(error) || "settings_storage_error";
      s.lastErrorCode = code;
      console.warn(`[computer-use-prefs] clear failed for "${key}":`, code);
      if (state === s && s.latestMutationIds[key] === mutationId) {
        restoreConfirmedEntry(s, key);
        settleLatestLegacyEntry(s, key);
      }
      throw error;
    }
  });

/* ──────────────────── surface consumed by the three stores ──────────────── */

/** True when this session persists computer use prefs to SQL (Electron, S3+). */
export const isComputerUsePrefsSqlMode = () => ensureInit().mode === "sql";

export const isComputerUsePreferencesSettingsResetActive = () =>
  settingsResetBarrierActive;

/** Non-sensitive persistence health for UI/diagnostics. */
export const getComputerUsePreferencesPersistenceStatus = () => {
  const s = ensureInit();
  return {
    mode: s.mode,
    pendingWrites: s.pendingWrites,
    lastErrorCode: s.lastErrorCode,
  };
};

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

const createSettingsResetBlockedPersistence = () => {
  const error = new Error(
    "[settings_reset_in_progress] computer-use preference write blocked",
  );
  error.code = "settings_reset_in_progress";
  const persistence = Promise.reject(error);
  persistence.catch(() => {});
  return persistence;
};

const createSettingsQuitBlockedPersistence = () => {
  const error = new Error(
    "[settings_quit_in_progress] computer-use preference write blocked",
  );
  error.code = "settings_quit_in_progress";
  const persistence = Promise.reject(error);
  persistence.catch(() => {});
  return persistence;
};

/**
 * Optimistic mirror write + queued SQL persist. While the migration is
 * pending, writes go through to localStorage too (legacy stays authoritative
 * so a failed migration loses nothing). After migration, only NARROWING
 * records (enabled=false over an existing legacy record) write through, so
 * the frozen legacy copy can never stay wider than the user's latest intent.
 */
export const writeComputerUsePreferenceRecord = (key, record) => {
  if (settingsQuitBarrierActive) {
    return createSettingsQuitBlockedPersistence();
  }
  const s = ensureInit();
  if (settingsResetBarrierActive) {
    return createSettingsResetBlockedPersistence();
  }
  if (s.mode !== "sql") return Promise.resolve();
  const mutationId = ++s.nextMutationId;
  s.latestMutationIds[key] = mutationId;
  s.mirrorEntries[key] = record;
  const currentLegacy = readLegacyEntrySnapshot(key);
  const writeThrough =
    !!currentLegacy &&
    (!s.migrated ||
      (isNarrowingRecord(key, record) && currentLegacy.present));
  let legacyMutation = null;
  if (writeThrough) {
    try {
      legacyMutation = applyLegacyEntryMutation(s, key, {
        present: true,
        raw: JSON.stringify(record),
      });
    } catch {
      // serialization/quota — mirror + queued SQL write still carry the state
    }
  }
  return enqueueSet(s, key, record, mutationId, legacyMutation);
};

/**
 * Optimistic mirror delete + queued SQL clear. Clears are always narrowing
 * (fail-closed direction), so they write through to the legacy key even
 * post-migration: a frozen legacy record would otherwise resurrect revoked
 * consent/enablement in a degraded or old-preload session that falls back to
 * localStorage.
 */
export const clearComputerUsePreferenceRecord = (key) => {
  if (settingsQuitBarrierActive) {
    return createSettingsQuitBlockedPersistence();
  }
  const s = ensureInit();
  if (settingsResetBarrierActive) {
    return createSettingsResetBlockedPersistence();
  }
  if (s.mode !== "sql") return Promise.resolve();
  const mutationId = ++s.nextMutationId;
  s.latestMutationIds[key] = mutationId;
  delete s.mirrorEntries[key];
  const legacyMutation = applyLegacyEntryMutation(s, key, {
    present: false,
    raw: null,
  });
  return enqueueClear(s, key, mutationId, legacyMutation);
};

/**
 * Admit a future narrowing clear into the preference FIFO now, but do not
 * remove authorization from any mirror or durable store until `prerequisite`
 * resolves. This is used by consent revocation: desired=false is queued first,
 * the sidecar must confirm OFF, and only then may consent be deleted. Because
 * the complete conditional clear already owns a FIFO slot, quit/reset drains
 * cannot destroy the renderer in the await-before-clear gap.
 */
export const clearComputerUsePreferenceRecordAfter = (
  key,
  prerequisite,
) => {
  if (settingsQuitBarrierActive) {
    return createSettingsQuitBlockedPersistence();
  }
  const s = ensureInit();
  if (settingsResetBarrierActive) {
    return createSettingsResetBlockedPersistence();
  }
  if (!PREF_KEYS.includes(key)) {
    return Promise.reject(
      Object.assign(new Error("invalid computer-use preference key"), {
        code: "invalid_preference_key",
      }),
    );
  }
  const mutationId = ++s.nextMutationId;
  s.latestMutationIds[key] = mutationId;

  return enqueue(s, async () => {
    try {
      await prerequisite;
    } catch (error) {
      if (state === s && s.latestMutationIds[key] === mutationId) {
        // The reserved clear never ran. Reconcile any older optimistic write
        // that settled while this later operation owned latestMutationIds.
        restoreConfirmedEntry(s, key);
        settleLatestLegacyEntry(s, key);
      }
      throw error;
    }
    if (state !== s) return;

    if (s.mode !== "sql") {
      try {
        if (hasLocalStorage()) {
          window.localStorage.removeItem(LEGACY_STORAGE_KEYS[key]);
        }
      } catch (_error) {
        // Legacy clear keeps its historical best-effort behavior.
      }
      return;
    }

    const legacyMutation = applyLegacyEntryMutation(s, key, {
      present: false,
      raw: null,
    });
    try {
      const ack = await settingsStorageBridge.clearComputerUsePreference(key);
      if (state === s) {
        delete s.confirmedEntries[key];
        confirmLegacyEntryMutation(s, key, legacyMutation);
        s.lastErrorCode = null;
        if (s.latestMutationIds[key] === mutationId) {
          delete s.mirrorEntries[key];
          settleLatestLegacyEntry(s, key);
        }
      }
      return ack;
    } catch (error) {
      const code =
        parseSettingsStorageErrorCode(error) || "settings_storage_error";
      s.lastErrorCode = code;
      console.warn(
        `[computer-use-prefs] conditional clear failed for "${key}":`,
        code,
      );
      if (state === s && s.latestMutationIds[key] === mutationId) {
        restoreConfirmedEntry(s, key);
        settleLatestLegacyEntry(s, key);
      }
      throw error;
    }
  });
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

export const beginComputerUsePreferencesSettingsReset = async () => {
  const s = ensureInit();
  settingsResetBarrierActive = true;
  let tail;
  do {
    tail = s.queueTail;
    await tail;
  } while (state === s && tail !== s.queueTail);
};

export const endComputerUsePreferencesSettingsReset = () => {
  settingsResetBarrierActive = false;
};

export const beginComputerUsePreferencesQuitDrain = async () => {
  settingsQuitBarrierActive = true;
  const s = state;
  if (!s) return;
  let tail;
  do {
    tail = s.queueTail;
    await tail;
  } while (state === s && tail !== s.queueTail);
};

export const endComputerUsePreferencesQuitDrain = () => {
  settingsQuitBarrierActive = false;
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
  s.confirmedEntries = Object.create(null);
  s.confirmedLegacyEntries = Object.create(null);
  s.pendingLegacyEntries = Object.create(null);
  s.latestMutationIds = Object.create(null);
  s.mirrorReady = true;
};

/** Test-only: drop module state so the next call re-runs init. */
export const resetComputerUsePreferencesForTests = () => {
  state = null;
  settingsResetBarrierActive = false;
  settingsQuitBarrierActive = false;
  resetSessionBootstrapSnapshotForTests();
};

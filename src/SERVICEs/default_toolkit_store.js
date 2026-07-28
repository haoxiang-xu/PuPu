// Default toolkit selection — Phase 2 (S2) dual-mode store.
//
// Modes (decided once per session, mirroring token_usage/storage.js):
// - "localStorage" (browser dev / Jest / degraded Electron): the exact legacy
//   behavior — every exported signature, normalize rule and default is
//   unchanged, so pre-Phase-2 tests keep passing untouched.
// - "sql" (Electron with the Phase 2 preload bridge): reads are a synchronous
//   hot path, so they answer from an in-memory mirror seeded BEFORE the first
//   read — from the bootstrap snapshot's toolkitPrefs section (SQL authority)
//   or, before the per-store migration completes, from the legacy store.
//   Writes update the mirror optimistically and queue a full-scope replace
//   over IPC. Failures roll back to the last SQL-confirmed value; callers can
//   optionally await a non-enumerable `persistence` promise on the result.
//
// Alias normalization (workspace → core etc., toolkit_id_aliases.js) stays
// renderer-only: payloads cross the IPC boundary already normalized and the
// main process only trims/caps/gates, so the two sides can never disagree.
//
// Per-store legacy migration (Phase 2 common contract rule 3): on first use,
// when no local marker exists and legacy data exists, the sanitized legacy
// scopes are sent through one idempotent, digest-guarded transaction. Until
// it resolves, reads AND writes keep hitting localStorage (mirror seeded from
// legacy + write-through), so a failed migration degrades losslessly.
//
// Logging: store name, counts and error codes only — never toolkit ids.

import { normalizeToolkitIdAlias } from "./toolkit_id_aliases";
import {
  settingsStorageBridge,
  isToolkitPrefsBridgeAvailable,
  parseSettingsStorageErrorCode,
  getSessionBootstrapSnapshot,
  getSqlStoreMigrationMeta,
  resetSessionBootstrapSnapshotForTests,
} from "./bridges/settings_storage_bridge";
import { computeSettingsMigrationDigest } from "./settings_repository";

const STORAGE_KEY = "default_toolkits";
export const DEFAULT_TOOLKITS_MIGRATION_MARKER_KEY =
  "pupu.default_toolkits_sql_migration.v1";

const MAX_IDS = 100;
const MAX_ID_LENGTH = 200;
const SCHEMA_VERSION = 2;
const TOOLKIT_PREFS_MIGRATION_VERSION = 1;
const GLOBAL_SCOPE = "global";
const DEFAULT_GLOBAL_TOOLKITS = Object.freeze(["core"]);

const isObject = (v) => v != null && typeof v === "object" && !Array.isArray(v);

const normalizeToolkitId = (value) =>
  normalizeToolkitIdAlias(value, { maxLength: MAX_ID_LENGTH });

const sanitizeIds = (ids) => {
  if (!Array.isArray(ids)) return [];
  const seen = new Set();
  const result = [];
  for (const id of ids) {
    const normalized = normalizeToolkitId(id);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= MAX_IDS) break;
  }
  return result;
};

const sanitizeScopes = (scopes) => {
  if (!scopes || typeof scopes !== "object") {
    return {};
  }
  const normalized = {};
  for (const [scopeKey, ids] of Object.entries(scopes)) {
    if (typeof scopeKey !== "string" || !scopeKey.trim()) continue;
    normalized[scopeKey] = sanitizeIds(ids);
  }
  return normalized;
};

const createDefaultStore = () => ({
  version: SCHEMA_VERSION,
  scopes: { [GLOBAL_SCOPE]: [...DEFAULT_GLOBAL_TOOLKITS] },
});

const writeStore = (store) => {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (_) {
    // quota exceeded — silent
  }
};

const readStore = () => {
  if (typeof window === "undefined" || !window.localStorage) {
    return createDefaultStore();
  }

  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    if (raw && typeof raw === "object" && typeof raw.scopes === "object") {
      const store = {
        version: SCHEMA_VERSION,
        scopes: sanitizeScopes(raw.scopes),
      };
      const hasGlobalScope = Object.prototype.hasOwnProperty.call(
        store.scopes,
        GLOBAL_SCOPE,
      );
      if (!hasGlobalScope) {
        store.scopes[GLOBAL_SCOPE] = [...DEFAULT_GLOBAL_TOOLKITS];
      }
      if (raw.version !== SCHEMA_VERSION || !hasGlobalScope) {
        writeStore(store);
      }
      return store;
    }
  } catch (_) {
    // corrupted — reset
  }

  const initialStore = createDefaultStore();
  writeStore(initialStore);
  return initialStore;
};

const readLegacySelectionWithoutRepair = (scopeKey) => {
  const fallback =
    scopeKey === GLOBAL_SCOPE ? [...DEFAULT_GLOBAL_TOOLKITS] : [];
  if (typeof window === "undefined" || !window.localStorage) return fallback;
  try {
    const raw = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) || "null",
    );
    if (!isObject(raw) || !isObject(raw.scopes)) return fallback;
    if (!Object.prototype.hasOwnProperty.call(raw.scopes, scopeKey)) {
      return fallback;
    }
    return sanitizeIds(raw.scopes[scopeKey]);
  } catch {
    return fallback;
  }
};

/* ─────────────────────── legacy (localStorage) mutations ─────────────────── */

const legacyGetDefaultToolkitSelection = (scopeKey) => {
  const store = readStore();
  return sanitizeIds(store.scopes[scopeKey]);
};

const legacySetDefaultToolkitEnabled = (scopeKey, toolkitId, enabled) => {
  const normalizedToolkitId = normalizeToolkitId(toolkitId);
  const store = readStore();
  const current = sanitizeIds(store.scopes[scopeKey]);
  if (!normalizedToolkitId) {
    return current;
  }

  let next;
  if (enabled) {
    next = current.includes(normalizedToolkitId)
      ? current
      : [...current, normalizedToolkitId];
  } else {
    next = current.filter((id) => id !== normalizedToolkitId);
  }

  store.scopes[scopeKey] = sanitizeIds(next);
  writeStore(store);
  return store.scopes[scopeKey];
};

const legacyRemoveInvalidToolkitIds = (scopeKey, validIds) => {
  const validSet = new Set(sanitizeIds(validIds));
  const store = readStore();
  const current = sanitizeIds(store.scopes[scopeKey]);
  const pruned = current.filter((id) => validSet.has(id));
  store.scopes[scopeKey] = pruned;
  writeStore(store);
  return pruned;
};

/* ───────────────────────────── SQL mode machinery ───────────────────────── */

// Scope keys the main process would reject outright (its trim/cap/"__proto__"
// gates). Writes for such keys stay renderer-local — exactly what legacy did.
const isSqlSafeScopeKey = (scopeKey) =>
  typeof scopeKey === "string" &&
  scopeKey.trim() === scopeKey &&
  scopeKey.length > 0 &&
  scopeKey.length <= MAX_ID_LENGTH &&
  scopeKey !== "__proto__";

// SQL-mode scope-key identity: the main process TRIMS scope keys
// (cleanToolkitPrefId) on direct writes AND on migration import, so the
// renderer must address the same scope by the same trimmed identity —
// otherwise a legacy " ws1 " scope migrates to "ws1" while untrimmed reads
// keep missing it. Trim-only, never dropped: a key the main process still
// rejects (over-long / "__proto__") stays renderer-local via
// isSqlSafeScopeKey. Fallback mode is untouched (legacy keeps raw keys).
const normalizeScopeKeyForSql = (scopeKey) =>
  typeof scopeKey === "string" ? scopeKey.trim() : scopeKey;

const readMigrationMarker = () => {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(DEFAULT_TOOLKITS_MIGRATION_MARKER_KEY) ||
        "null",
    );
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const writeMigrationMarker = (digest, completedAt) => {
  try {
    window.localStorage.setItem(
      DEFAULT_TOOLKITS_MIGRATION_MARKER_KEY,
      JSON.stringify({
        digest: digest || null,
        completedAt: completedAt || Date.now(),
      }),
    );
  } catch {
    // best-effort; SQL meta (default_toolkits_migration_state) stays authoritative
  }
};

let state = null;
let settingsResetBarrierActive = false;
let settingsQuitBarrierActive = false;

const createInitialState = () => ({
  mode: "localStorage", // "sql" | "localStorage"
  degraded: false,
  lastErrorCode: null,
  migrated: false, // SQL is the authority (migration complete or unneeded)
  // Null prototype: scope keys are arbitrary strings and must always land as
  // own keys (never a prototype write).
  mirrorScopes: Object.create(null),
  // Last SQL-acknowledged value and latest optimistic mutation are tracked
  // per scope. This lets independent scopes settle independently and lets a
  // queued operation rebase after a rejected predecessor.
  confirmedScopes: Object.create(null),
  latestMutationIds: Object.create(null),
  // Scope-local legacy checkpoints are only populated while migration is
  // pending. SQL success advances them; latest rejection restores them.
  confirmedLegacyScopes: Object.create(null),
  pendingLegacyScopes: Object.create(null),
  nextMutationId: 0,
  pendingWrites: 0,
  queueTail: Promise.resolve(),
});

// Single FIFO queue (migration first, then writes in order) — the same
// pattern as token_usage/storage.js.
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
  s.mirrorScopes = Object.create(null);
  s.confirmedScopes = Object.create(null);
  s.latestMutationIds = Object.create(null);
  // A failed migration leaves localStorage authoritative, including every
  // optimistic write made while it was pending.
  s.confirmedLegacyScopes = Object.create(null);
  s.pendingLegacyScopes = Object.create(null);
};

const seedMirrorFromScopes = (s, scopes) => {
  s.mirrorScopes = Object.create(null);
  s.confirmedScopes = Object.create(null);
  const sanitized = sanitizeScopes(scopes);
  for (const scopeKey of Object.keys(sanitized)) {
    // Trimmed identity (main-process parity). A trim collision resolves
    // last-wins — the same order the main-process migration import applies.
    const normalizedScopeKey = normalizeScopeKeyForSql(scopeKey);
    s.mirrorScopes[normalizedScopeKey] = [...sanitized[scopeKey]];
    s.confirmedScopes[normalizedScopeKey] = [...sanitized[scopeKey]];
  }
  // Legacy readStore() default: an absent global scope reads as ["core"].
  // Never injected for an explicitly-empty global (own key, [] value).
  if (s.mirrorScopes[GLOBAL_SCOPE] === undefined) {
    s.mirrorScopes[GLOBAL_SCOPE] = [...DEFAULT_GLOBAL_TOOLKITS];
    s.confirmedScopes[GLOBAL_SCOPE] = [...DEFAULT_GLOBAL_TOOLKITS];
  }
};

// Reload the mirror from SQL inside a queued op — used when SQL turns out to
// be the authority over data that differs from the legacy seed
// (refused-stale-digest): sync reads must never serve stale legacy state.
const reloadMirrorFromSql = async (s) => {
  const result = await settingsStorageBridge.readDefaultToolkits();
  if (state !== s || s.mode !== "sql") return;
  seedMirrorFromScopes(s, result && isObject(result.scopes) ? result.scopes : {});
};

const runDefaultToolkitsMigration = async (s, scopes) => {
  if (state !== s) return;
  const payloadBase = {
    migrationVersion: TOOLKIT_PREFS_MIGRATION_VERSION,
    scopes,
  };
  let digest = null;
  try {
    digest = await computeSettingsMigrationDigest(payloadBase);
  } catch {
    digest = null; // main recomputes; a missing claimed digest is safe
  }
  const payload = digest ? { ...payloadBase, digest } : payloadBase;
  try {
    const result =
      await settingsStorageBridge.migrateLegacyDefaultToolkits(payload);
    if (state !== s) return;
    const status = result ? result.status : undefined;
    if (status === "complete") {
      writeMigrationMarker(result.digest || digest, result.migratedAt);
      s.migrated = true;
      if (result.droppedEntries > 0) {
        console.warn(
          `[default-toolkit-store] migration dropped ${result.droppedEntries} ` +
            "invalid entrie(s)",
        );
      }
    } else if (status === "already-complete") {
      // SQL was the authority BEFORE this session (marker lost, legacy
      // unchanged since the original import) and may have diverged since —
      // e.g. a default toolkit the user disabled post-migration (SQL holds
      // explicit-empty). The mirror was seeded from legacy, so re-seed it
      // from SQL: the stale legacy selection must neither serve sync reads
      // nor get re-persisted over SQL by the next commitScope.
      writeMigrationMarker(result.digest || digest, result.migratedAt);
      s.migrated = true;
      await reloadMirrorFromSql(s);
    } else if (status === "refused-stale-digest") {
      // SQL already migrated from different legacy data — SQL is the
      // authority; resync the mirror so sync reads stop serving legacy state.
      console.warn(
        "[default-toolkit-store] legacy migration refused (stale digest); " +
          "SQL stays authoritative",
      );
      s.migrated = true;
      await reloadMirrorFromSql(s);
    } else {
      console.warn(
        "[default-toolkit-store] legacy migration returned an unknown status; " +
          "degrading to localStorage fallback",
      );
      degradeToFallback(s, "migration_unknown_status");
    }
  } catch (error) {
    if (state !== s) return;
    const code =
      parseSettingsStorageErrorCode(error) || "settings_storage_error";
    console.warn("[default-toolkit-store] legacy migration failed:", code);
    degradeToFallback(s, code);
  }
};

const ensureInit = () => {
  if (state) return state;
  const s = createInitialState();
  state = s;
  if (!isToolkitPrefsBridgeAvailable()) {
    // Browser dev / Jest / pre-Phase-2 preload: legacy behavior, not degraded.
    return s;
  }
  // One session-shared bootstrap sendSync for every Phase 2 store (the
  // repository holds its own) — never a per-store sendSync on hot-path
  // first use.
  const snapshot = getSessionBootstrapSnapshot();
  const prefs =
    snapshot && snapshot.available === true && isObject(snapshot.toolkitPrefs)
      ? snapshot.toolkitPrefs.defaultToolkits
      : null;
  if (!isObject(prefs) || !isObject(prefs.scopes)) {
    // Bridge methods exist but the snapshot has no toolkit prefs section —
    // degraded main process or version skew. Stay on localStorage.
    degradeToFallback(s, "bootstrap_missing_toolkit_prefs");
    return s;
  }
  s.mode = "sql";
  const hasLegacyData =
    typeof window !== "undefined" &&
    window.localStorage &&
    window.localStorage.getItem(STORAGE_KEY) != null;
  // Migration trigger consults BOTH sides. When the snapshot carries the
  // per-store SQL migration meta, that state is the authority: a marker can
  // outlive a reset/replaced settings.db (stale marker → re-migrate), and
  // SQL already complete with a lost marker just restores the marker. A null
  // meta (older main process) falls back to marker-only behavior.
  const sqlMeta = getSqlStoreMigrationMeta("defaultToolkits");
  const sqlMigrated = sqlMeta !== null && sqlMeta.state === "complete";
  const shouldMigrate =
    hasLegacyData && (sqlMeta !== null ? !sqlMigrated : !readMigrationMarker());
  if (shouldMigrate) {
    // Pre-migration: legacy stays authoritative (mirror seeded from it +
    // write-through) until the queued migration resolves.
    const legacyStore = readStore();
    seedMirrorFromScopes(s, legacyStore.scopes);
    s.migrated = false;
    enqueue(s, () =>
      runDefaultToolkitsMigration(s, sanitizeScopes(legacyStore.scopes)),
    );
  } else {
    s.migrated = true;
    seedMirrorFromScopes(s, prefs.scopes);
    if (sqlMigrated && !readMigrationMarker()) {
      writeMigrationMarker(sqlMeta.digest, sqlMeta.migratedAt);
    }
  }
  return s;
};

const applyScopeIntent = (ids, intent) => {
  const current = sanitizeIds(ids);
  if (intent.type === "set-enabled") {
    if (intent.enabled) {
      return current.includes(intent.toolkitId)
        ? current
        : sanitizeIds([...current, intent.toolkitId]);
    }
    return current.filter((id) => id !== intent.toolkitId);
  }
  if (intent.type === "retain-valid") {
    const validSet = new Set(intent.validIds);
    return current.filter((id) => validSet.has(id));
  }
  return current;
};

const hasOwn = (target, key) =>
  Object.prototype.hasOwnProperty.call(target, key);

const readLegacyScopeSnapshot = (scopeKey) => {
  if (typeof window === "undefined" || !window.localStorage) return null;
  const store = readStore();
  if (!hasOwn(store.scopes, scopeKey)) {
    return { present: false, ids: [] };
  }
  return { present: true, ids: sanitizeIds(store.scopes[scopeKey]) };
};

const legacyScopeSnapshotsEqual = (left, right) =>
  !!left &&
  !!right &&
  left.present === right.present &&
  left.ids.length === right.ids.length &&
  left.ids.every((id, index) => id === right.ids[index]);

const restoreLegacyScopeSnapshot = (scopeKey, snapshot) => {
  if (!snapshot) return false;
  const store = readStore();
  if (snapshot.present) {
    store.scopes[scopeKey] = [...snapshot.ids];
  } else {
    delete store.scopes[scopeKey];
  }
  writeStore(store);
  return true;
};

const applyLegacyScopeMutation = (s, scopeKey, ids) => {
  const current = readLegacyScopeSnapshot(scopeKey);
  if (!current) return false;
  if (!hasOwn(s.confirmedLegacyScopes, scopeKey)) {
    s.confirmedLegacyScopes[scopeKey] = current;
  }
  const after = { present: true, ids: [...ids] };
  if (!restoreLegacyScopeSnapshot(scopeKey, after)) return false;
  s.pendingLegacyScopes[scopeKey] = after;
  return true;
};

const confirmLegacyScopeIntent = (s, scopeKey, intent) => {
  if (!hasOwn(s.confirmedLegacyScopes, scopeKey)) return;
  const confirmed = s.confirmedLegacyScopes[scopeKey];
  s.confirmedLegacyScopes[scopeKey] = {
    present: true,
    ids: applyScopeIntent(confirmed.ids, intent),
  };
};

const settleLatestLegacyScope = (s, scopeKey) => {
  if (
    !hasOwn(s.pendingLegacyScopes, scopeKey) ||
    !hasOwn(s.confirmedLegacyScopes, scopeKey)
  ) {
    return;
  }
  const pending = s.pendingLegacyScopes[scopeKey];
  delete s.pendingLegacyScopes[scopeKey];
  const current = readLegacyScopeSnapshot(scopeKey);
  if (!legacyScopeSnapshotsEqual(current, pending)) {
    // Preserve a newer/external writer for this scope.
    return;
  }
  restoreLegacyScopeSnapshot(scopeKey, s.confirmedLegacyScopes[scopeKey]);
};

const enqueueReplaceScope = (
  s,
  scopeKey,
  intent,
  mutationId,
  wroteLegacy,
) =>
  enqueue(s, async () => {
    if (state !== s) return;
    if (s.mode !== "sql") {
      // Degraded after this write was queued (failed migration). Degradation
      // only happens pre-migration, where every write already went through
      // to localStorage — nothing to replay.
      return;
    }
    // Build the replace payload only after predecessors for this FIFO have
    // settled. Reusing the optimistic call-time array would make a later
    // success persist an earlier rejected enable/disable.
    const rebasedIds = applyScopeIntent(
      s.confirmedScopes[scopeKey],
      intent,
    );
    try {
      const ack = await settingsStorageBridge.replaceDefaultToolkitsScope(
        scopeKey,
        rebasedIds,
      );
      if (state === s) {
        s.confirmedScopes[scopeKey] = [...rebasedIds];
        if (wroteLegacy) {
          confirmLegacyScopeIntent(s, scopeKey, intent);
        }
        s.lastErrorCode = null;
        if (s.latestMutationIds[scopeKey] === mutationId) {
          s.mirrorScopes[scopeKey] = [...rebasedIds];
          settleLatestLegacyScope(s, scopeKey);
        }
      }
      return ack;
    } catch (error) {
      const code =
        parseSettingsStorageErrorCode(error) || "settings_storage_error";
      if (state === s) {
        s.lastErrorCode = code;
        if (s.latestMutationIds[scopeKey] === mutationId) {
          s.mirrorScopes[scopeKey] = sanitizeIds(
            s.confirmedScopes[scopeKey],
          );
          settleLatestLegacyScope(s, scopeKey);
        }
      }
      console.warn("[default-toolkit-store] scope persist failed:", code);
      throw error;
    }
  });

const commitScope = (s, scopeKey, ids, intent) => {
  s.mirrorScopes[scopeKey] = [...ids];
  let wroteLegacy = false;
  if (!s.migrated) {
    // Migration pending: localStorage remains the authority — write through
    // with the exact legacy mutation so a failed migration loses nothing.
    wroteLegacy = applyLegacyScopeMutation(s, scopeKey, ids);
  }
  let persistence = null;
  if (isSqlSafeScopeKey(scopeKey)) {
    const mutationId = ++s.nextMutationId;
    s.latestMutationIds[scopeKey] = mutationId;
    persistence = enqueueReplaceScope(
      s,
      scopeKey,
      intent,
      mutationId,
      wroteLegacy,
    );
  } else {
    console.warn(
      "[default-toolkit-store] scope key not persistable to SQL; " +
        "kept renderer-local",
    );
  }
  const result = [...ids];
  if (persistence) {
    // Preserve the historical enumerable array shape while allowing callers
    // that render an optimistic control to observe persistence failure.
    Object.defineProperty(result, "persistence", {
      value: persistence,
      enumerable: false,
    });
  }
  return result;
};

const createSettingsResetBlockedPersistence = () => {
  const error = new Error(
    "[settings_reset_in_progress] default toolkit write blocked",
  );
  error.code = "settings_reset_in_progress";
  const persistence = Promise.reject(error);
  // Preserve fire-and-forget compatibility for callers that only consume the
  // synchronous array result.
  persistence.catch(() => {});
  return persistence;
};

const createSettingsQuitBlockedPersistence = () => {
  const error = new Error(
    "[settings_quit_in_progress] default toolkit write blocked",
  );
  error.code = "settings_quit_in_progress";
  const persistence = Promise.reject(error);
  persistence.catch(() => {});
  return persistence;
};

const attachPersistence = (result, persistence) => {
  Object.defineProperty(result, "persistence", {
    value: persistence,
    enumerable: false,
  });
  return result;
};

/* ───────────────────────────── public surface ───────────────────────────── */

export const getDefaultToolkitSelection = (scopeKey = GLOBAL_SCOPE) => {
  const s = ensureInit();
  if (s.mode === "localStorage") {
    return legacyGetDefaultToolkitSelection(scopeKey);
  }
  return sanitizeIds(s.mirrorScopes[normalizeScopeKeyForSql(scopeKey)]);
};

export const setDefaultToolkitEnabled = (
  scopeKey = GLOBAL_SCOPE,
  toolkitId,
  enabled,
) => {
  if (settingsQuitBarrierActive) {
    const s = state;
    const current =
      !s || s.mode === "localStorage"
        ? readLegacySelectionWithoutRepair(scopeKey)
        : sanitizeIds(s.mirrorScopes[normalizeScopeKeyForSql(scopeKey)]);
    if (!normalizeToolkitId(toolkitId)) return current;
    return attachPersistence(
      [...current],
      createSettingsQuitBlockedPersistence(),
    );
  }
  const s = ensureInit();
  if (settingsResetBarrierActive) {
    const current =
      s.mode === "localStorage"
        ? readLegacySelectionWithoutRepair(scopeKey)
        : sanitizeIds(
            s.mirrorScopes[normalizeScopeKeyForSql(scopeKey)],
          );
    if (!normalizeToolkitId(toolkitId)) return current;
    return attachPersistence(
      [...current],
      createSettingsResetBlockedPersistence(),
    );
  }
  if (s.mode === "localStorage") {
    return legacySetDefaultToolkitEnabled(scopeKey, toolkitId, enabled);
  }
  const sqlScopeKey = normalizeScopeKeyForSql(scopeKey);
  const normalizedToolkitId = normalizeToolkitId(toolkitId);
  const current = sanitizeIds(s.mirrorScopes[sqlScopeKey]);
  if (!normalizedToolkitId) {
    return current;
  }

  const intent = {
    type: "set-enabled",
    toolkitId: normalizedToolkitId,
    enabled: !!enabled,
  };
  const next = applyScopeIntent(current, intent);
  return commitScope(s, sqlScopeKey, next, intent);
};

export const removeInvalidToolkitIds = (scopeKey = GLOBAL_SCOPE, validIds) => {
  if (settingsQuitBarrierActive) {
    const s = state;
    const current =
      !s || s.mode === "localStorage"
        ? readLegacySelectionWithoutRepair(scopeKey)
        : sanitizeIds(s.mirrorScopes[normalizeScopeKeyForSql(scopeKey)]);
    return attachPersistence(
      [...current],
      createSettingsQuitBlockedPersistence(),
    );
  }
  const s = ensureInit();
  if (settingsResetBarrierActive) {
    const current =
      s.mode === "localStorage"
        ? readLegacySelectionWithoutRepair(scopeKey)
        : sanitizeIds(
            s.mirrorScopes[normalizeScopeKeyForSql(scopeKey)],
          );
    return attachPersistence(
      [...current],
      createSettingsResetBlockedPersistence(),
    );
  }
  if (s.mode === "localStorage") {
    return legacyRemoveInvalidToolkitIds(scopeKey, validIds);
  }
  const sqlScopeKey = normalizeScopeKeyForSql(scopeKey);
  const sanitizedValidIds = sanitizeIds(validIds);
  const current = sanitizeIds(s.mirrorScopes[sqlScopeKey]);
  const intent = { type: "retain-valid", validIds: sanitizedValidIds };
  const pruned = applyScopeIntent(current, intent);
  return commitScope(s, sqlScopeKey, pruned, intent);
};

/** True when this session persists default toolkits to SQL (Electron, Phase 2+). */
export const isDefaultToolkitsSqlBacked = () => ensureInit().mode === "sql";

/** Resolve when every queued default-toolkit operation has settled (tests/QA). */
export const flushDefaultToolkitWrites = async () => {
  const s = ensureInit();
  let tail;
  do {
    tail = s.queueTail;
    await tail;
  } while (state === s && tail !== s.queueTail);
};

/**
 * Synchronously closes this store to new SQL mutations, then resolves after
 * every operation queued before the barrier has settled.
 */
export const beginDefaultToolkitSettingsReset = async () => {
  const s = ensureInit();
  settingsResetBarrierActive = true;
  let tail;
  do {
    tail = s.queueTail;
    await tail;
  } while (state === s && tail !== s.queueTail);
};

export const endDefaultToolkitSettingsReset = () => {
  settingsResetBarrierActive = false;
};

export const beginDefaultToolkitQuitDrain = async () => {
  settingsQuitBarrierActive = true;
  const s = state;
  if (!s) return;
  let tail;
  do {
    tail = s.queueTail;
    await tail;
  } while (state === s && tail !== s.queueTail);
};

export const endDefaultToolkitQuitDrain = () => {
  settingsQuitBarrierActive = false;
};

// Reset-settings (plan §6-Phase5). After the main-process SQL transaction
// clears the default_toolkits table, the settings-reset coordination point
// (src/COMPONENTs/settings/local_storage) calls this once resetSettings()
// resolves so the SQL-mode in-memory mirror is reseeded to the default scopes
// (global → ["core"]) for the REST of the session — otherwise reads keep
// serving the pre-reset selection until the next app launch. No-op when the
// store was never initialized (no mirror to clear) or is not SQL-backed
// (fallback reads hit the already-stripped localStorage directly). Never runs
// ensureInit(): resetting must not force a store into existence / trigger a
// bootstrap sendSync.
export const resetDefaultToolkitMirrorForSettingsReset = () => {
  const s = state;
  if (!s || s.mode !== "sql") return;
  seedMirrorFromScopes(s, {});
  s.latestMutationIds = Object.create(null);
  s.confirmedLegacyScopes = Object.create(null);
  s.pendingLegacyScopes = Object.create(null);
};

/** Test-only: drop module state so the next call re-runs init. */
export const resetDefaultToolkitStoreForTests = () => {
  state = null;
  settingsResetBarrierActive = false;
  settingsQuitBarrierActive = false;
  resetSessionBootstrapSnapshotForTests();
};

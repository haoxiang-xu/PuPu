// Toolkit/tool auto-approve — Phase 2 (S2) dual-mode store. SECURITY SURFACE:
// this store gates which tool confirmations are skipped, so every path (read,
// write, migration) must only ever narrow, never widen, the approved set —
// and the computer toolkit must never hold a cached approval
// (tool_confirmation_cache_policy.js; re-enforced by the main process).
//
// Modes (decided once per session, mirroring default_toolkit_store.js):
// - "localStorage" (browser dev / Jest / degraded Electron): the exact legacy
//   behavior — signatures, normalize rules and the computer-toolkit gate are
//   unchanged, so pre-Phase-2 tests keep passing untouched.
// - "sql" (Electron with the Phase 2 preload bridge): reads are a synchronous
//   hot path (checked before every tool confirmation), so they answer from an
//   in-memory mirror seeded BEFORE the first read — from the bootstrap
//   snapshot's toolkitPrefs section (SQL authority) or, before the per-store
//   migration completes, from the legacy store. Writes update the mirror and
//   queue a full replace of both tables over IPC.
//
// Alias normalization stays renderer-only (see default_toolkit_store.js).
//
// Logging: store name, counts and error codes only — never toolkit ids.

import { normalizeToolkitIdAlias } from "./toolkit_id_aliases";
import {
  isComputerToolkitId,
  isToolConfirmationCacheable,
} from "./tool_confirmation_cache_policy";
import {
  settingsStorageBridge,
  isToolkitPrefsBridgeAvailable,
  parseSettingsStorageErrorCode,
  getSessionBootstrapSnapshot,
  getSqlStoreMigrationMeta,
  resetSessionBootstrapSnapshotForTests,
} from "./bridges/settings_storage_bridge";
import { computeSettingsMigrationDigest } from "./settings_repository";

const STORAGE_KEY = "toolkit_auto_approve";
export const TOOLKIT_AUTO_APPROVE_MIGRATION_MARKER_KEY =
  "pupu.toolkit_auto_approve_sql_migration.v1";

const MAX_IDS = 100;
const MAX_ID_LENGTH = 200;
const SCHEMA_VERSION = 2;
const TOOLKIT_PREFS_MIGRATION_VERSION = 1;

const LEGACY_TOOL_NAME_TO_TOOLKIT_ID = Object.freeze({
  write_file: "core",
  delete_file: "core",
  move_file: "core",
  terminal_exec: "core",
});

const isObject = (v) => v != null && typeof v === "object" && !Array.isArray(v);

const normalizeToolkitId = (value) =>
  normalizeToolkitIdAlias(value, { maxLength: MAX_ID_LENGTH });

// Mirror of the main process's per-part gate (cleanToolkitPrefId in
// settings_storage/service.js): trimmed, non-empty, ≤ MAX_ID_LENGTH and not
// "__proto__". The renderer sanitize must be AT LEAST as strict — a single
// part the main process rejects would make replaceToolkitAutoApprove throw
// for the WHOLE payload, permanently breaking auto-approve persistence for
// the session (including writes that revoke other approvals).
const isSqlSafeIdPart = (value) =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= MAX_ID_LENGTH &&
  value !== "__proto__";

const buildToolKey = (toolkitId, toolName) => {
  const normalizedToolkitId = normalizeToolkitId(toolkitId);
  const normalizedToolName =
    typeof toolName === "string" ? toolName.trim() : "";
  if (
    !isSqlSafeIdPart(normalizedToolkitId) ||
    !isSqlSafeIdPart(normalizedToolName)
  ) {
    return "";
  }
  return `${normalizedToolkitId}:${normalizedToolName}`;
};

const sanitizeToolkitIds = (ids) => {
  if (!Array.isArray(ids)) return [];
  const seen = new Set();
  const result = [];
  for (const id of ids) {
    const normalized = normalizeToolkitId(id);
    if (
      !isSqlSafeIdPart(normalized) ||
      isComputerToolkitId(normalized) ||
      seen.has(normalized)
    ) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= MAX_IDS) break;
  }
  return result;
};

const sanitizeToolKeys = (keys) => {
  if (!Array.isArray(keys)) return [];
  const seen = new Set();
  const result = [];
  for (const key of keys) {
    if (typeof key !== "string") continue;
    const trimmed = key.trim();
    if (!trimmed || trimmed.length > MAX_ID_LENGTH * 2) continue;
    const separatorIndex = trimmed.indexOf(":");
    if (separatorIndex <= 0) continue;
    const toolkitId = trimmed.slice(0, separatorIndex);
    const toolName = trimmed.slice(separatorIndex + 1);
    if (!isToolConfirmationCacheable(toolkitId, toolName)) continue;
    const normalized = buildToolKey(toolkitId, toolName);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= MAX_IDS) break;
  }
  return result;
};

const migrateLegacyToolKeys = (tools) => {
  if (!Array.isArray(tools)) return [];
  const migrated = [];
  for (const toolName of tools) {
    if (typeof toolName !== "string") continue;
    const normalizedToolName = toolName.trim();
    const toolkitId = LEGACY_TOOL_NAME_TO_TOOLKIT_ID[normalizedToolName];
    const toolKey = buildToolKey(toolkitId, normalizedToolName);
    if (toolKey) {
      migrated.push(toolKey);
    }
  }
  return sanitizeToolKeys(migrated);
};

const createDefaultStore = () => ({
  version: SCHEMA_VERSION,
  toolkits: [],
  tools: [],
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
    if (raw && typeof raw === "object") {
      const store = {
        version: SCHEMA_VERSION,
        toolkits: sanitizeToolkitIds(raw.toolkits),
        tools:
          raw.version === SCHEMA_VERSION
            ? sanitizeToolKeys(raw.tools)
            : migrateLegacyToolKeys(raw.tools),
      };
      if (raw.version !== SCHEMA_VERSION) {
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

const readLegacyStoreSnapshot = () => {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return { present: raw !== null, raw };
  } catch {
    return null;
  }
};

const legacyStoreSnapshotsEqual = (left, right) =>
  !!left &&
  !!right &&
  left.present === right.present &&
  (!left.present || left.raw === right.raw);

const restoreLegacyStoreSnapshot = (snapshot) => {
  if (
    typeof window === "undefined" ||
    !window.localStorage ||
    !snapshot
  ) {
    return false;
  }
  try {
    if (snapshot.present) {
      window.localStorage.setItem(STORAGE_KEY, snapshot.raw);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    return true;
  } catch {
    return false;
  }
};

const storeFromLegacySnapshot = (snapshot) => {
  if (!snapshot || !snapshot.present) return createDefaultStore();
  try {
    const raw = JSON.parse(snapshot.raw || "null");
    if (raw && typeof raw === "object") {
      return {
        version: SCHEMA_VERSION,
        toolkits: sanitizeToolkitIds(raw.toolkits),
        tools:
          raw.version === SCHEMA_VERSION
            ? sanitizeToolKeys(raw.tools)
            : migrateLegacyToolKeys(raw.tools),
      };
    }
  } catch {
    // A corrupt legacy value cannot contribute an approval.
  }
  return createDefaultStore();
};

const narrowLegacyStoreSnapshot = (snapshot, toolkits, toolKeys) => {
  if (!snapshot || !snapshot.present) return snapshot;
  const legacy = storeFromLegacySnapshot(snapshot);
  const toolkitSet = new Set(toolkits);
  const toolKeySet = new Set(toolKeys);
  const narrowedToolkits = legacy.toolkits.filter((id) => toolkitSet.has(id));
  const narrowedTools = legacy.tools.filter((key) => toolKeySet.has(key));
  if (
    narrowedToolkits.length === legacy.toolkits.length &&
    narrowedTools.length === legacy.tools.length
  ) {
    return snapshot;
  }
  return {
    present: true,
    raw: JSON.stringify({
      version: SCHEMA_VERSION,
      toolkits: narrowedToolkits,
      tools: narrowedTools,
    }),
  };
};

/* ───────────────────────────── SQL mode machinery ───────────────────────── */

// "toolkitId:toolName" keys (legacy/internal shape) ↔ structured IPC entries.
// The split mirrors sanitizeToolKeys (first ":" separates the toolkit id).
const toolKeysToEntries = (keys) =>
  keys.map((key) => {
    const separatorIndex = key.indexOf(":");
    return {
      toolkitId: key.slice(0, separatorIndex),
      toolName: key.slice(separatorIndex + 1),
    };
  });

const entriesToToolKeys = (entries) => {
  if (!Array.isArray(entries)) return [];
  const keys = [];
  for (const entry of entries) {
    if (!isObject(entry)) continue;
    const key = buildToolKey(entry.toolkitId, entry.toolName);
    if (key) keys.push(key);
  }
  // Re-gated through sanitizeToolKeys: a computer-toolkit row smuggled into
  // SQL by other means must never become an approval (defense in depth).
  return sanitizeToolKeys(keys);
};

const readMigrationMarker = () => {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(
        TOOLKIT_AUTO_APPROVE_MIGRATION_MARKER_KEY,
      ) || "null",
    );
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const writeMigrationMarker = (digest, completedAt) => {
  try {
    window.localStorage.setItem(
      TOOLKIT_AUTO_APPROVE_MIGRATION_MARKER_KEY,
      JSON.stringify({
        digest: digest || null,
        completedAt: completedAt || Date.now(),
      }),
    );
  } catch {
    // best-effort; SQL meta (toolkit_auto_approve_migration_state) stays authoritative
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
  mirrorToolkits: [],
  mirrorTools: [], // "toolkitId:toolName" keys
  // Last replace-all payload acknowledged by SQL. Rejected optimistic changes
  // roll back here, keeping the current session aligned with the next boot.
  confirmedToolkits: [],
  confirmedTools: [],
  // Exact dual-kept legacy bytes paired with the latest acknowledged SQL
  // mutation. A rejected optimistic grant/revoke restores this snapshot so a
  // fallback session cannot diverge from the SQL-confirmed permission set.
  confirmedLegacyStore: null,
  pendingLegacyStore: null,
  latestMutationId: 0,
  nextMutationId: 0,
  pendingWrites: 0,
  queueTail: Promise.resolve(),
});

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
  s.mirrorToolkits = [];
  s.mirrorTools = [];
  s.confirmedToolkits = [];
  s.confirmedTools = [];
  s.confirmedLegacyStore = null;
  s.pendingLegacyStore = null;
  s.latestMutationId = 0;
};

const seedMirror = (s, toolkits, toolKeys) => {
  const normalizedToolkits = sanitizeToolkitIds(toolkits);
  const normalizedTools = sanitizeToolKeys(toolKeys);
  s.mirrorToolkits = normalizedToolkits;
  s.mirrorTools = normalizedTools;
  s.confirmedToolkits = [...normalizedToolkits];
  s.confirmedTools = [...normalizedTools];
};

// Reload the mirror from SQL inside a queued op — used when SQL was already
// authoritative BEFORE this session (already-complete / refused-stale-digest)
// but the mirror was seeded from legacy, which may be wider. The caller
// empties the mirror BEFORE this await (fail closed: no approvals during the
// round-trip); a failed re-read keeps it empty for the session rather than
// degrading to the possibly-wider legacy fallback.
const reloadMirrorFromSql = async (s) => {
  try {
    const result = await settingsStorageBridge.readToolkitAutoApprove();
    if (state !== s || s.mode !== "sql") return;
    seedMirror(
      s,
      result && Array.isArray(result.toolkits) ? result.toolkits : [],
      entriesToToolKeys(result ? result.tools : []),
    );
  } catch (error) {
    if (state !== s) return;
    const code =
      parseSettingsStorageErrorCode(error) || "settings_storage_error";
    console.warn("[toolkit-auto-approve-store] SQL re-read failed:", code);
    // Mirror stays empty → sync reads keep failing closed this session.
  }
};

const runToolkitAutoApproveMigration = async (s, toolkits, toolKeys) => {
  if (state !== s) return;
  const payloadBase = {
    migrationVersion: TOOLKIT_PREFS_MIGRATION_VERSION,
    toolkits,
    tools: toolKeysToEntries(toolKeys),
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
      await settingsStorageBridge.migrateLegacyToolkitAutoApprove(payload);
    if (state !== s) return;
    const status = result ? result.status : undefined;
    if (status === "complete") {
      writeMigrationMarker(result.digest || digest, result.migratedAt);
      s.migrated = true;
      if (result.droppedEntries > 0) {
        console.warn(
          `[toolkit-auto-approve-store] migration dropped ${result.droppedEntries} ` +
            "invalid or non-approvable entrie(s)",
        );
      }
    } else if (status === "already-complete") {
      // SQL was the authority BEFORE this session (marker lost, legacy
      // unchanged since the original import) and may have narrowed since —
      // e.g. an approval revoked post-migration. The mirror was seeded from
      // legacy, so FAIL CLOSED first, then re-seed from SQL; keeping the
      // legacy-seeded mirror would resurrect revoked approvals.
      writeMigrationMarker(result.digest || digest, result.migratedAt);
      s.migrated = true;
      seedMirror(s, [], []);
      await reloadMirrorFromSql(s);
    } else if (status === "refused-stale-digest") {
      console.warn(
        "[toolkit-auto-approve-store] legacy migration refused (stale digest); " +
          "SQL stays authoritative",
      );
      s.migrated = true;
      // FAIL CLOSED first: the legacy-seeded mirror may be wider than SQL
      // and must not keep serving approvals during the re-read round-trip.
      seedMirror(s, [], []);
      await reloadMirrorFromSql(s);
    } else {
      console.warn(
        "[toolkit-auto-approve-store] legacy migration returned an unknown " +
          "status; degrading to localStorage fallback",
      );
      degradeToFallback(s, "migration_unknown_status");
    }
  } catch (error) {
    if (state !== s) return;
    const code =
      parseSettingsStorageErrorCode(error) || "settings_storage_error";
    console.warn("[toolkit-auto-approve-store] legacy migration failed:", code);
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
  // One session-shared bootstrap sendSync for every Phase 2 store — never a
  // per-store sendSync on hot-path first use (isToolkitAutoApprove runs in
  // the chat tool-confirmation path).
  const snapshot = getSessionBootstrapSnapshot();
  const prefs =
    snapshot && snapshot.available === true && isObject(snapshot.toolkitPrefs)
      ? snapshot.toolkitPrefs.toolkitAutoApprove
      : null;
  if (!isObject(prefs) || !Array.isArray(prefs.toolkits)) {
    degradeToFallback(s, "bootstrap_missing_toolkit_prefs");
    return s;
  }
  s.mode = "sql";
  const hasLegacyData =
    typeof window !== "undefined" &&
    window.localStorage &&
    window.localStorage.getItem(STORAGE_KEY) != null;
  // Migration trigger consults BOTH sides (same arbitration as
  // default_toolkit_store): a known SQL meta state overrules the local
  // marker — a marker can outlive a reset/replaced settings.db, and SQL
  // already complete with a lost marker just restores the marker. A null
  // meta (older main process) falls back to marker-only behavior.
  const sqlMeta = getSqlStoreMigrationMeta("toolkitAutoApprove");
  const sqlMigrated = sqlMeta !== null && sqlMeta.state === "complete";
  const shouldMigrate =
    hasLegacyData && (sqlMeta !== null ? !sqlMigrated : !readMigrationMarker());
  if (shouldMigrate) {
    // Pre-migration: legacy stays authoritative (mirror seeded from it +
    // write-through) until the queued migration resolves.
    const legacyStore = readStore();
    seedMirror(s, legacyStore.toolkits, legacyStore.tools);
    s.migrated = false;
    // Freeze the import envelope now. The queued closure must not observe a
    // same-turn optimistic permission change before migration starts.
    const migrationToolkits = [...s.mirrorToolkits];
    const migrationTools = [...s.mirrorTools];
    enqueue(s, () =>
      runToolkitAutoApproveMigration(
        s,
        migrationToolkits,
        migrationTools,
      ),
    );
  } else {
    s.migrated = true;
    seedMirror(s, prefs.toolkits, entriesToToolKeys(prefs.tools));
    if (sqlMigrated && !readMigrationMarker()) {
      writeMigrationMarker(sqlMeta.digest, sqlMeta.migratedAt);
    }
  }
  return s;
};

const restoreConfirmedMirror = (s) => {
  s.mirrorToolkits = [...s.confirmedToolkits];
  s.mirrorTools = [...s.confirmedTools];
};

const applyLegacyStoreMutation = (s, store) => {
  const current = readLegacyStoreSnapshot();
  if (!current) return null;
  if (s.confirmedLegacyStore === null) {
    s.confirmedLegacyStore = current;
  }
  let raw;
  try {
    raw = JSON.stringify(store);
  } catch {
    return null;
  }
  const after = { present: true, raw };
  if (!restoreLegacyStoreSnapshot(after)) return null;
  s.pendingLegacyStore = after;
  return { after };
};

const confirmLegacyStoreForPersistedState = (s, toolkits, toolKeys) => {
  if (s.confirmedLegacyStore === null) {
    s.confirmedLegacyStore = readLegacyStoreSnapshot();
  }
  s.confirmedLegacyStore = narrowLegacyStoreSnapshot(
    s.confirmedLegacyStore,
    toolkits,
    toolKeys,
  );
};

const settleLatestLegacyStore = (s) => {
  const pending = s.pendingLegacyStore;
  if (!pending || s.confirmedLegacyStore === null) return;
  s.pendingLegacyStore = null;
  const current = readLegacyStoreSnapshot();
  if (!legacyStoreSnapshotsEqual(current, pending)) {
    // Do not overwrite an external/newer localStorage writer.
    return;
  }
  restoreLegacyStoreSnapshot(s.confirmedLegacyStore);
};

const applyAutoApproveIntent = (toolkits, toolKeys, intent) => {
  let nextToolkits = sanitizeToolkitIds(toolkits);
  let nextTools = sanitizeToolKeys(toolKeys);
  if (intent.enabled) {
    if (!nextToolkits.includes(intent.toolkitId)) {
      nextToolkits = [...nextToolkits, intent.toolkitId];
    }
    const toolSet = new Set(nextTools);
    for (const toolKey of intent.safeToolKeys) {
      toolSet.add(toolKey);
    }
    nextTools = [...toolSet];
  } else {
    nextToolkits = nextToolkits.filter((id) => id !== intent.toolkitId);
    const removePrefix = `${intent.toolkitId}:`;
    nextTools = nextTools.filter(
      (toolKey) => !toolKey.startsWith(removePrefix),
    );
  }
  return {
    toolkits: sanitizeToolkitIds(nextToolkits),
    tools: sanitizeToolKeys(nextTools),
  };
};

const enqueueReplaceAll = (s, intent, mutationId) => {
  return enqueue(s, async () => {
    if (state !== s) return;
    if (s.mode !== "sql") {
      // Degradation only happens pre-migration, where every write already
      // went through to localStorage — nothing to replay.
      return;
    }
    // Rebase this semantic operation only after every predecessor settles.
    // A captured optimistic replace-all payload could otherwise carry a
    // rejected predecessor into SQL when this operation succeeds.
    const rebased = applyAutoApproveIntent(
      s.confirmedToolkits,
      s.confirmedTools,
      intent,
    );
    const payload = {
      toolkits: rebased.toolkits,
      tools: toolKeysToEntries(rebased.tools),
    };
    try {
      const ack =
        await settingsStorageBridge.replaceToolkitAutoApprove(payload);
      if (state === s) {
        s.confirmedToolkits = [...rebased.toolkits];
        s.confirmedTools = [...rebased.tools];
        confirmLegacyStoreForPersistedState(
          s,
          rebased.toolkits,
          rebased.tools,
        );
        s.lastErrorCode = null;
        if (s.latestMutationId === mutationId) {
          s.mirrorToolkits = [...rebased.toolkits];
          s.mirrorTools = [...rebased.tools];
          settleLatestLegacyStore(s);
        }
      }
      return ack;
    } catch (error) {
      const code =
        parseSettingsStorageErrorCode(error) || "settings_storage_error";
      s.lastErrorCode = code;
      console.warn("[toolkit-auto-approve-store] persist failed:", code);
      if (state === s && s.latestMutationId === mutationId) {
        restoreConfirmedMirror(s);
        settleLatestLegacyStore(s);
      }
      throw error;
    }
  });
};

// Post-migration the legacy key is frozen — EXCEPT in the narrowing
// direction: approvals absent from the authoritative set are also dropped
// from the legacy copy, so a later degraded / old-preload session that falls
// back to localStorage cannot resurrect a revoked approval. Never adds
// anything (one-directional toward fail-closed, so no widening
// dual-authority can form), and never creates the legacy key.
const narrowLegacyStore = (s, toolkits, toolKeys) => {
  if (typeof window === "undefined" || !window.localStorage) return null;
  let hasLegacy = false;
  try {
    hasLegacy = window.localStorage.getItem(STORAGE_KEY) != null;
  } catch {
    return null;
  }
  if (!hasLegacy) return null;
  const legacy = readStore();
  const toolkitSet = new Set(toolkits);
  const toolKeySet = new Set(toolKeys);
  const narrowedToolkits = legacy.toolkits.filter((id) => toolkitSet.has(id));
  const narrowedTools = legacy.tools.filter((key) => toolKeySet.has(key));
  if (
    narrowedToolkits.length === legacy.toolkits.length &&
    narrowedTools.length === legacy.tools.length
  ) {
    return null;
  }
  return applyLegacyStoreMutation(s, {
    version: SCHEMA_VERSION,
    toolkits: narrowedToolkits,
    tools: narrowedTools,
  });
};

const commitMirror = (s, toolkits, toolKeys, intent) => {
  const mutationId = ++s.nextMutationId;
  s.latestMutationId = mutationId;
  s.mirrorToolkits = toolkits;
  s.mirrorTools = toolKeys;
  if (s.confirmedLegacyStore === null) {
    s.confirmedLegacyStore = readLegacyStoreSnapshot();
  }
  if (!s.migrated) {
    // Migration pending: localStorage remains the authority — write through
    // so a failed migration loses nothing.
    applyLegacyStoreMutation(s, {
      version: SCHEMA_VERSION,
      toolkits: [...toolkits],
      tools: [...toolKeys],
    });
  } else {
    narrowLegacyStore(s, toolkits, toolKeys);
  }
  return enqueueReplaceAll(s, intent, mutationId);
};

const createSettingsResetBlockedPersistence = () => {
  const error = new Error(
    "[settings_reset_in_progress] auto-approve write blocked",
  );
  error.code = "settings_reset_in_progress";
  const persistence = Promise.reject(error);
  persistence.catch(() => {});
  return persistence;
};

const createSettingsQuitBlockedPersistence = () => {
  const error = new Error(
    "[settings_quit_in_progress] auto-approve write blocked",
  );
  error.code = "settings_quit_in_progress";
  const persistence = Promise.reject(error);
  persistence.catch(() => {});
  return persistence;
};

const createResult = (toolkits, tools, persistence = null) => {
  const result = { toolkits, tools };
  if (persistence) {
    Object.defineProperty(result, "persistence", {
      value: persistence,
      enumerable: false,
    });
  }
  return result;
};

/* ───────────────────────────── public surface ───────────────────────────── */

export const isToolkitAutoApprove = (toolkitId) => {
  const normalizedToolkitId = normalizeToolkitId(toolkitId);
  if (!normalizedToolkitId) return false;
  const s = ensureInit();
  const toolkits =
    s.mode === "localStorage" ? readStore().toolkits : s.mirrorToolkits;
  return sanitizeToolkitIds(toolkits).includes(normalizedToolkitId);
};

export const isToolAutoApproved = (toolkitId, toolName) => {
  if (!isToolConfirmationCacheable(toolkitId, toolName)) return false;
  const toolKey = buildToolKey(toolkitId, toolName);
  if (!toolKey) return false;
  const s = ensureInit();
  const tools = s.mode === "localStorage" ? readStore().tools : s.mirrorTools;
  return sanitizeToolKeys(tools).includes(toolKey);
};

export const setToolkitAutoApprove = (toolkitId, enabled, toolNames = []) => {
  if (settingsQuitBarrierActive) {
    const s = state;
    const legacyStore =
      !s || s.mode === "localStorage"
        ? storeFromLegacySnapshot(readLegacyStoreSnapshot())
        : null;
    const currentToolkits = sanitizeToolkitIds(
      s && s.mode === "sql" ? s.mirrorToolkits : legacyStore.toolkits,
    );
    const currentTools = sanitizeToolKeys(
      s && s.mode === "sql" ? s.mirrorTools : legacyStore.tools,
    );
    if (!normalizeToolkitId(toolkitId)) {
      return { toolkits: currentToolkits, tools: currentTools };
    }
    return createResult(
      currentToolkits,
      currentTools,
      createSettingsQuitBlockedPersistence(),
    );
  }
  const s = ensureInit();
  const sqlMode = s.mode === "sql";
  const store = sqlMode
    ? null
    : settingsResetBarrierActive
      ? storeFromLegacySnapshot(readLegacyStoreSnapshot())
      : readStore();
  const normalizedToolkitId = normalizeToolkitId(toolkitId);
  let currentToolkits = sanitizeToolkitIds(
    sqlMode ? s.mirrorToolkits : store.toolkits,
  );
  let currentTools = sanitizeToolKeys(sqlMode ? s.mirrorTools : store.tools);

  if (!normalizedToolkitId) {
    return { toolkits: currentToolkits, tools: currentTools };
  }
  if (settingsResetBarrierActive) {
    return createResult(
      currentToolkits,
      currentTools,
      createSettingsResetBlockedPersistence(),
    );
  }

  const safeToolKeys = [];
  let droppedToolNames = 0;
  for (const toolName of Array.isArray(toolNames) ? toolNames : []) {
    const toolKey = buildToolKey(normalizedToolkitId, toolName);
    if (toolKey) {
      safeToolKeys.push(toolKey);
    } else if (typeof toolName === "string" && toolName.trim()) {
      // A present-but-ungateable name (over-long / "__proto__" — the parts
      // the main process would reject): dropped per-entry, because one bad
      // part would make the main process reject the WHOLE replace payload
      // and silently stop approval persistence for the session. Counted and
      // coded only — never logged by content.
      droppedToolNames += 1;
    }
  }
  if (droppedToolNames > 0) {
    console.warn(
      `[toolkit-auto-approve-store] dropped ${droppedToolNames} tool ` +
        "name(s) failing the per-field id gate " +
        "[invalid_toolkit_auto_approve_payload]",
    );
  }

  const intent = {
    toolkitId: normalizedToolkitId,
    enabled: !!enabled,
    safeToolKeys,
  };
  const optimistic = applyAutoApproveIntent(
    currentToolkits,
    currentTools,
    intent,
  );
  currentToolkits = optimistic.toolkits;
  currentTools = optimistic.tools;
  let persistence = null;
  if (sqlMode) {
    persistence = commitMirror(s, currentToolkits, currentTools, intent);
  } else {
    store.toolkits = currentToolkits;
    store.tools = currentTools;
    writeStore(store);
  }

  // Keep the existing enumerable return shape stable while allowing UI
  // callers to await the actual SQL outcome and undo optimistic controls.
  return createResult(currentToolkits, currentTools, persistence);
};

export const getAutoApproveToolkits = () => {
  const s = ensureInit();
  const toolkits =
    s.mode === "localStorage" ? readStore().toolkits : s.mirrorToolkits;
  return sanitizeToolkitIds(toolkits);
};

/** True when this session persists auto-approvals to SQL (Electron, Phase 2+). */
export const isToolkitAutoApproveSqlBacked = () => ensureInit().mode === "sql";

/** Non-sensitive, observable persistence health for UI/diagnostics. */
export const getToolkitAutoApprovePersistenceStatus = () => {
  const s = ensureInit();
  return {
    mode: s.mode,
    pendingWrites: s.pendingWrites,
    lastErrorCode: s.lastErrorCode,
  };
};

/** Resolve when every queued auto-approve operation has settled (tests/QA). */
export const flushToolkitAutoApproveWrites = async () => {
  const s = ensureInit();
  let tail;
  do {
    tail = s.queueTail;
    await tail;
  } while (state === s && tail !== s.queueTail);
};

export const beginToolkitAutoApproveSettingsReset = async () => {
  const s = ensureInit();
  settingsResetBarrierActive = true;
  let tail;
  do {
    tail = s.queueTail;
    await tail;
  } while (state === s && tail !== s.queueTail);
};

export const endToolkitAutoApproveSettingsReset = () => {
  settingsResetBarrierActive = false;
};

export const beginToolkitAutoApproveQuitDrain = async () => {
  settingsQuitBarrierActive = true;
  const s = state;
  if (!s) return;
  let tail;
  do {
    tail = s.queueTail;
    await tail;
  } while (state === s && tail !== s.queueTail);
};

export const endToolkitAutoApproveQuitDrain = () => {
  settingsQuitBarrierActive = false;
};

// Reset-settings (plan §6-Phase5). SECURITY-RELEVANT: this store gates which
// tool confirmations are skipped, so its reset is fail-closed. After the
// main-process SQL transaction clears the toolkit_auto_approve + tool_auto_approve
// tables, the settings-reset coordination point (src/COMPONENTs/settings/
// local_storage) calls this once resetSettings() resolves to empty the SQL-mode
// in-memory mirror for the REST of the session — otherwise the pre-reset
// approvals stay live (the agent could keep auto-approving on stale mirror
// state) until the next app launch. No-op when the store was never initialized
// (no mirror to clear) or is not SQL-backed (fallback reads hit the
// already-stripped localStorage directly). Never runs ensureInit().
export const resetToolkitAutoApproveMirrorForSettingsReset = () => {
  const s = state;
  if (!s || s.mode !== "sql") return;
  seedMirror(s, [], []);
  s.confirmedLegacyStore = null;
  s.pendingLegacyStore = null;
  s.latestMutationId = 0;
};

/** Test-only: drop module state so the next call re-runs init. */
export const resetToolkitAutoApproveStoreForTests = () => {
  state = null;
  settingsResetBarrierActive = false;
  settingsQuitBarrierActive = false;
  resetSessionBootstrapSnapshotForTests();
};

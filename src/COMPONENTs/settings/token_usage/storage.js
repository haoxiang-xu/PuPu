// Token usage storage — Phase 2 (S1) dual-mode store.
//
// Modes (decided once per session, mirroring src/SERVICEs/settings_repository.js):
// - "localStorage" (browser dev / Jest / degraded Electron): the exact legacy
//   behavior below — every exported signature, normalize rule and silent-error
//   rule is unchanged, so pre-Phase-2 tests keep passing untouched.
// - "sql" (Electron with the Phase 2 preload bridge): appends are queued
//   fire-and-forget IPC writes to userData/settings.db
//   (token_usage_records, plan §3.2); the synchronous read surface keeps its
//   signature and answers from the pre-migration legacy snapshot + this
//   session's append cache (compatibility floor), while the UI uses the new
//   async queryTokenUsage() to read SQL by date range.
//
// Per-store legacy migration (Phase 2 common contract rule 3): on first use,
// when no local marker exists and legacy records exist, the (pre-cleaned)
// legacy records are sent oldest-first through one idempotent, digest-guarded
// transaction. Until it resolves, appends wait behind it in the FIFO queue;
// a failed migration degrades this store to localStorage for the session.
//
// Logging: store name, counts and error codes only — never record contents.

import {
  settingsStorageBridge,
  isTokenUsageBridgeAvailable,
  parseSettingsStorageErrorCode,
  getSqlStoreMigrationMeta,
  resetSessionBootstrapSnapshotForTests,
} from "../../../SERVICEs/bridges/settings_storage_bridge";
import { computeSettingsMigrationDigest } from "../../../SERVICEs/settings_repository";

const STORAGE_KEY = "token_usage";
export const TOKEN_USAGE_MIGRATION_MARKER_KEY =
  "pupu.token_usage_sql_migration.v1";

const TOKEN_USAGE_MIGRATION_VERSION = 1;

// Mirrors TOKEN_USAGE_LIMITS in
// electron/main/services/settings_storage/service.js (§7.2). Used by the
// renderer-side pre-clean: the main-process import is all-or-nothing, so a
// record violating these gates must be quarantined here (kept in legacy,
// counted) instead of failing the whole migration.
const SQL_STRING_MAX_LENGTH = 256;
const SQL_MAX_TOKEN_VALUE = Number.MAX_SAFE_INTEGER;

const isObject = (v) => v != null && typeof v === "object" && !Array.isArray(v);

const toFinitePositiveNumber = (value) =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;

const normalizeTokenUsageRecord = (record) => {
  if (!isObject(record)) return null;

  let consumed_tokens = toFinitePositiveNumber(record.consumed_tokens);
  const input_tokens = toFinitePositiveNumber(record.input_tokens);
  const output_tokens = toFinitePositiveNumber(record.output_tokens);

  if (consumed_tokens <= 0 && (input_tokens > 0 || output_tokens > 0)) {
    consumed_tokens = input_tokens + output_tokens;
  }
  if (consumed_tokens <= 0) {
    return null;
  }

  return {
    timestamp: typeof record.timestamp === "number" ? record.timestamp : Date.now(),
    provider: typeof record.provider === "string" ? record.provider : "unknown",
    model: typeof record.model === "string" ? record.model : "unknown",
    model_id: typeof record.model_id === "string" ? record.model_id : "unknown",
    consumed_tokens,
    input_tokens,
    output_tokens,
    ...(toFinitePositiveNumber(record.cache_read_input_tokens) > 0
      ? { cache_read_input_tokens: toFinitePositiveNumber(record.cache_read_input_tokens) }
      : {}),
    ...(toFinitePositiveNumber(record.cache_creation_input_tokens) > 0
      ? { cache_creation_input_tokens: toFinitePositiveNumber(record.cache_creation_input_tokens) }
      : {}),
    ...(typeof record.max_context_window_tokens === "number" &&
    Number.isFinite(record.max_context_window_tokens)
      ? { max_context_window_tokens: record.max_context_window_tokens }
      : {}),
    ...(typeof record.chatId === "string" ? { chatId: record.chatId } : {}),
  };
};

const readRoot = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return isObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const writeRoot = (root) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(root));
  } catch {
    /* ignore */
  }
};

const legacyAppend = (normalized) => {
  const root = readRoot();
  if (!Array.isArray(root.records)) {
    root.records = [];
  }
  root.records.push(normalized);
  writeRoot(root);
};

const legacyReadRecords = () => {
  const root = readRoot();
  if (!Array.isArray(root.records)) {
    return [];
  }
  return root.records
    .map((record) => normalizeTokenUsageRecord(record))
    .filter(Boolean);
};

/* ───────────────────────────── SQL mode machinery ───────────────────────── */

const isSafeSqlTokenValue = (value) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= SQL_MAX_TOKEN_VALUE;

// Pre-clean a normalized record against the main process's §7.2 gates.
// Returns null when the record cannot be stored at all (unusable core field);
// optional fields that violate a gate are stripped, over-long strings clamped.
const toSqlSafeTokenUsageRecord = (normalized) => {
  if (!normalized) return null;
  if (
    !Number.isSafeInteger(normalized.timestamp) ||
    normalized.timestamp < 0
  ) {
    return null;
  }
  const record = { ...normalized };
  for (const field of ["consumed_tokens", "input_tokens", "output_tokens"]) {
    if (!isSafeSqlTokenValue(record[field])) return null;
  }
  for (const field of [
    "cache_read_input_tokens",
    "cache_creation_input_tokens",
    "max_context_window_tokens",
  ]) {
    if (record[field] !== undefined && !isSafeSqlTokenValue(record[field])) {
      delete record[field];
    }
  }
  for (const field of ["provider", "model", "model_id", "chatId"]) {
    if (
      typeof record[field] === "string" &&
      record[field].length > SQL_STRING_MAX_LENGTH
    ) {
      record[field] = record[field].slice(0, SQL_STRING_MAX_LENGTH);
    }
  }
  return record;
};

const readMigrationMarker = () => {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(TOKEN_USAGE_MIGRATION_MARKER_KEY) || "null",
    );
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const writeMigrationMarker = (digest, completedAt) => {
  try {
    localStorage.setItem(
      TOKEN_USAGE_MIGRATION_MARKER_KEY,
      JSON.stringify({
        digest: digest || null,
        completedAt: completedAt || Date.now(),
      }),
    );
  } catch {
    // best-effort; SQL meta (token_usage_migration_state) stays authoritative
  }
};

let state = null;

const createInitialState = () => ({
  mode: "localStorage", // "sql" | "localStorage"
  degraded: false,
  lastErrorCode: null,
  // sync-read compatibility floor (SQL mode only):
  legacySnapshot: [], // normalized legacy records captured at init
  sessionAppends: [], // normalized records appended this session
  pendingWrites: 0,
  queueTail: Promise.resolve(),
});

// Single FIFO queue (migration first, then writes/queries in order) — the
// same pattern as settings_repository.js.
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
  s.legacySnapshot = [];
  s.sessionAppends = [];
};

const runTokenUsageMigration = async (s, sqlSafeRecords) => {
  if (state !== s) return;
  const payloadBase = {
    migrationVersion: TOKEN_USAGE_MIGRATION_VERSION,
    records: sqlSafeRecords,
  };
  let digest = null;
  try {
    digest = await computeSettingsMigrationDigest(payloadBase);
  } catch {
    digest = null; // main recomputes; a missing claimed digest is safe
  }
  const payload = digest ? { ...payloadBase, digest } : payloadBase;
  try {
    const result = await settingsStorageBridge.migrateLegacyTokenUsage(payload);
    if (state !== s) return;
    const status = result ? result.status : undefined;
    if (status === "complete" || status === "already-complete") {
      writeMigrationMarker(result.digest || digest, result.migratedAt);
    } else if (status === "refused-stale-digest") {
      // SQL already migrated from different legacy data — SQL stays the
      // authority, no marker (mirrors the Phase 1B ruling). Retried and
      // re-refused on later boots; harmless.
      console.warn(
        "[token-usage-storage] legacy migration refused (stale digest); " +
          "SQL stays authoritative",
      );
    } else {
      // Unknown resolution = unknown migration outcome; staying in SQL mode
      // could make a partial store look authoritative later (§11B.2-1).
      console.warn(
        "[token-usage-storage] legacy migration returned an unknown status; " +
          "degrading to localStorage fallback",
      );
      degradeToFallback(s, "migration_unknown_status");
    }
  } catch (error) {
    if (state !== s) return;
    const code =
      parseSettingsStorageErrorCode(error) || "settings_storage_error";
    console.warn("[token-usage-storage] legacy migration failed:", code);
    degradeToFallback(s, code);
  }
};

const ensureInit = () => {
  if (state) return state;
  const s = createInitialState();
  state = s;
  if (!isTokenUsageBridgeAvailable()) {
    // Browser dev / Jest / pre-Phase-2 preload: legacy behavior, not degraded.
    return s;
  }
  s.mode = "sql";
  // Compatibility floor for the sync read surface: the legacy records (read
  // with the exact legacy semantics) + whatever this session appends.
  s.legacySnapshot = legacyReadRecords();
  // Migration trigger consults BOTH sides. When the bootstrap snapshot
  // carries the per-store SQL migration meta, that state is the authority:
  // a localStorage marker can outlive a reset/replaced settings.db, which
  // used to leave legacy records silently unimported forever (sync reads
  // showing legacy data while SQL queries show none). Conversely, SQL
  // already complete with a lost marker just restores the marker locally.
  // A null meta (older main process / snapshot section missing) falls back
  // to the marker-only behavior.
  const sqlMeta = getSqlStoreMigrationMeta("tokenUsage");
  const sqlMigrated = sqlMeta !== null && sqlMeta.state === "complete";
  if (sqlMigrated && !readMigrationMarker()) {
    writeMigrationMarker(sqlMeta.digest, sqlMeta.migratedAt);
  }
  const shouldMigrate =
    s.legacySnapshot.length > 0 &&
    (sqlMeta !== null ? !sqlMigrated : !readMigrationMarker());
  if (shouldMigrate) {
    const sqlSafeRecords = [];
    let quarantined = 0;
    for (const record of s.legacySnapshot) {
      const safe = toSqlSafeTokenUsageRecord(record);
      if (safe) {
        sqlSafeRecords.push(safe);
      } else {
        quarantined += 1;
      }
    }
    if (quarantined > 0) {
      console.warn(
        `[token-usage-storage] ${quarantined} legacy record(s) quarantined ` +
          "by the SQL pre-clean (left in localStorage)",
      );
    }
    enqueue(s, () => runTokenUsageMigration(s, sqlSafeRecords));
  }
  return s;
};

/* ───────────────────────────── public surface ───────────────────────────── */

/**
 * Append a single token-usage record. Synchronous, never throws — the SQL
 * write is queued fire-and-forget (failures are logged with their code).
 *
 * @param {{ timestamp: number, provider: string, model: string, model_id: string,
 *           consumed_tokens?: number, input_tokens?: number, output_tokens?: number,
 *           max_context_window_tokens?: number, chatId?: string }} record
 */
export const appendTokenUsageRecord = (record) => {
  const normalized = normalizeTokenUsageRecord(record);
  if (!normalized) {
    return;
  }
  const s = ensureInit();
  if (s.mode === "localStorage") {
    legacyAppend(normalized);
    return;
  }
  const sqlSafe = toSqlSafeTokenUsageRecord(normalized);
  if (!sqlSafe) {
    // Cannot be represented under the SQL §7.2 gates (e.g. NaN timestamp) —
    // dropped with a log; legacy is read-only in SQL mode.
    console.warn(
      "[token-usage-storage] append dropped: record failed the SQL pre-clean",
    );
    return;
  }
  s.sessionAppends.push(sqlSafe);
  enqueue(s, async () => {
    if (state !== s) return;
    if (s.mode !== "sql") {
      // Degraded after this append was queued (failed migration): honor the
      // write against the now-authoritative legacy backend.
      legacyAppend(sqlSafe);
      return;
    }
    try {
      await settingsStorageBridge.appendTokenUsage(sqlSafe);
    } catch (error) {
      const code =
        parseSettingsStorageErrorCode(error) || "settings_storage_error";
      s.lastErrorCode = code;
      console.warn("[token-usage-storage] append persist failed:", code);
    }
  });
};

/**
 * Return stored records (oldest-first). Synchronous compatibility surface:
 * in SQL mode it answers from the pre-migration legacy snapshot + this
 * session's appends — use queryTokenUsage() for the authoritative SQL read.
 */
export const readTokenUsageRecords = () => {
  const s = ensureInit();
  if (s.mode === "localStorage") {
    return legacyReadRecords();
  }
  return [...s.legacySnapshot, ...s.sessionAppends]
    .map((record) => normalizeTokenUsageRecord(record))
    .filter(Boolean);
};

/** Remove every record. */
export const clearTokenUsageRecords = () => {
  const s = ensureInit();
  if (s.mode === "localStorage") {
    writeRoot({ records: [] });
    return;
  }
  // Destructive user intent clears every copy: the session caches now, SQL
  // through the queue, and the (otherwise read-only) legacy key — so the
  // sync compatibility read cannot resurrect cleared records on next boot.
  s.legacySnapshot = [];
  s.sessionAppends = [];
  writeRoot({ records: [] });
  enqueue(s, async () => {
    if (state !== s) return;
    if (s.mode !== "sql") {
      writeRoot({ records: [] });
      return;
    }
    try {
      await settingsStorageBridge.clearTokenUsage();
    } catch (error) {
      const code =
        parseSettingsStorageErrorCode(error) || "settings_storage_error";
      s.lastErrorCode = code;
      console.warn("[token-usage-storage] clear persist failed:", code);
    }
  });
};

/** Return records whose timestamp falls within [startMs, endMs]. */
export const getTokenUsageByDateRange = (startMs, endMs) => {
  return readTokenUsageRecords().filter(
    (r) => r.timestamp >= startMs && r.timestamp <= endMs,
  );
};

const filterRecordsForQuery = (records, { startMs, endMs, limit, offset }) => {
  const result = records.filter(
    (r) =>
      (startMs === undefined || startMs === null || r.timestamp >= startMs) &&
      (endMs === undefined || endMs === null || r.timestamp <= endMs),
  );
  // Truncation parity with the SQL query (service.js queryTokenUsage):
  // OFFSET pages backwards from the NEWEST record and a limit keeps the
  // newest slice (recent data must never fall off first) — the returned
  // order stays oldest-first either way.
  const from = typeof offset === "number" && offset > 0 ? offset : 0;
  const max = typeof limit === "number" && limit >= 1 ? limit : undefined;
  if (from === 0 && max === undefined) return result;
  const end = Math.max(result.length - from, 0);
  const start = max === undefined ? 0 : Math.max(end - max, 0);
  return result.slice(start, end);
};

/**
 * Async range read for the UI (plan §3.2: date filtering runs as a SQL query,
 * never an unconditional full pull into the renderer). Resolves to an array of
 * records (oldest-first). When the range holds more records than the limit
 * (50k SQL default), the NEWEST records are kept and offset pages backwards
 * from the newest — recent usage never silently falls off. In fallback mode
 * it resolves from localStorage with the same range/truncation semantics.
 *
 * @param {{ startMs?: number, endMs?: number, limit?: number, offset?: number }} [query]
 */
export const queryTokenUsage = (query = {}) => {
  const s = ensureInit();
  const q = isObject(query) ? query : {};
  if (s.mode === "localStorage") {
    return Promise.resolve(filterRecordsForQuery(legacyReadRecords(), q));
  }
  // Queued behind pending appends/migration → read-your-writes ordering.
  return enqueue(s, async () => {
    if (state !== s || s.mode !== "sql") {
      return filterRecordsForQuery(legacyReadRecords(), q);
    }
    const result = await settingsStorageBridge.queryTokenUsage({
      startMs: q.startMs,
      endMs: q.endMs,
      limit: q.limit,
      offset: q.offset,
    });
    return result && Array.isArray(result.records) ? result.records : [];
  });
};

/** True when this session persists token usage to SQL (Electron, Phase 2+). */
export const isTokenUsageSqlBacked = () => ensureInit().mode === "sql";

/** Resolve when every queued token-usage operation has settled (tests/QA). */
export const flushTokenUsageWrites = async () => {
  const s = ensureInit();
  let tail;
  do {
    tail = s.queueTail;
    await tail;
  } while (state === s && tail !== s.queueTail);
};

/** Test-only: drop module state so the next call re-runs init. */
export const resetTokenUsageStorageForTests = () => {
  state = null;
  resetSessionBootstrapSnapshotForTests();
};

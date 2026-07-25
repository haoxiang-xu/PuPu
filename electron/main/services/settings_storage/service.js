// Settings storage Phase 1A/2 — main-process authority on SQLite
// (userData/settings.db, WAL). Plan:
// docs/architecture/settings-sqlite-migration-plan.md (§3.1/§3.2 schema,
// §5 legacy migration state machine, §7 limits + corruption policy).
//
// Phase 1A scope: schema init, bootstrap snapshot, namespace get/set/delete,
// legacy import. Phase 2 (S1) adds the token_usage_records structured store:
// append/query/clear plus its own per-store legacy migration (§3.2).
//
// Logging policy (plan §4.4): log namespace/store names and error codes only —
// never values or record contents.

const crypto = require("crypto");
const { createSettingsDb } = require("./db");

const DB_FILE_NAME = "settings.db";
// Database-level schema version. v2 = Phase 2 token_usage_records table +
// indexes. The per-row settings.schema_version stays at
// SETTINGS_ROW_SCHEMA_VERSION — namespace value shapes did not change.
const SCHEMA_VERSION = 2;
const SETTINGS_ROW_SCHEMA_VERSION = 1;
const SUPPORTED_LEGACY_MIGRATION_VERSION = 1;
const SUPPORTED_TOKEN_USAGE_MIGRATION_VERSION = 1;
const SUPPORTED_TOOLKIT_PREFS_MIGRATION_VERSION = 1;
const SUPPORTED_COMPUTER_USE_MIGRATION_VERSION = 1;

// Input limits (plan §7.2) — centralized constants, covered by tests.
const SETTINGS_STORAGE_LIMITS = Object.freeze({
  NAMESPACE_PATTERN: /^[a-z0-9_.-]+$/,
  NAMESPACE_MAX_LENGTH: 100,
  NAMESPACE_VALUE_MAX_BYTES: 1024 * 1024, // 1 MiB per namespace JSON
  MIGRATION_PAYLOAD_MAX_BYTES: 10 * 1024 * 1024, // 10 MiB total migration payload
});

// Token usage limits (plan §7.2: token counts finite / non-negative / within
// the safe-integer range, Unix-ms timestamps, capped string lengths; §3.2:
// queries are never an unconditional full pull — a default LIMIT always
// applies). Mirrored by the renderer-side pre-clean in
// src/COMPONENTs/settings/token_usage/storage.js.
const TOKEN_USAGE_LIMITS = Object.freeze({
  STRING_MAX_LENGTH: 256, // provider / model / model_id / chatId
  MAX_TOKEN_VALUE: Number.MAX_SAFE_INTEGER,
  QUERY_MAX_LIMIT: 50000,
  QUERY_DEFAULT_LIMIT: 50000,
});

// Toolkit preference limits (plan §3.3 + §7.2). Mirrors the legacy renderer
// caps (MAX_IDS / MAX_ID_LENGTH in default_toolkit_store.js and
// toolkit_auto_approve_store.js). Alias normalization (workspace → core etc.)
// stays renderer-only — the main process never alias-maps, it only trims,
// caps and gates, so the two sides can never normalize to different ids.
const TOOLKIT_PREFS_LIMITS = Object.freeze({
  ID_MAX_LENGTH: 200, // toolkit ids, tool names, scope keys
  MAX_IDS_PER_SCOPE: 100,
  MAX_SCOPES: 200,
  MAX_AUTO_APPROVE_TOOLKITS: 100,
  MAX_AUTO_APPROVE_TOOLS: 100,
});

// Security floor (plan §3.3): the computer toolkit must never hold a cached
// approval. Mirrors src/SERVICEs/tool_confirmation_cache_policy.js — enforced
// again here so nothing can widen the auto-approve surface through IPC.
const COMPUTER_TOOLKIT_ID = "builtin.computer";

// Computer use preference KV store (plan §3.4). This is a safety surface: a
// row only records the user's DESIRED state (the sidecar remains the runtime
// authority) and every read path fails closed — no row / corrupt row /
// version mismatch all read as "not consented / not enabled".
const COMPUTER_USE_PREF_KEYS = Object.freeze([
  "consent",
  "enabled",
  "local_beta_enabled",
]);
const COMPUTER_USE_LIMITS = Object.freeze({
  ISO_TIMESTAMP_MAX_LENGTH: 64, // acceptedAt / updatedAt ISO-8601 strings
  VALUE_MAX_BYTES: 4096, // per-key value_json cap (records are tiny)
});

// Secrets never enter the settings table or the bootstrap snapshot
// (plan §3.7 / Phase 1B completion bar). Stripped on write AND on read.
const SENSITIVE_MODEL_PROVIDER_KEYS = Object.freeze([
  "openai_api_key",
  "anthropic_api_key",
  "custom_provider_secrets",
]);
const MODEL_PROVIDERS_NAMESPACE = "model_providers";

const MIGRATION_STATE = Object.freeze({
  NOT_STARTED: "not_started",
  IN_PROGRESS: "in_progress",
  COMPLETE: "complete",
});

const META_KEYS = Object.freeze({
  SCHEMA_VERSION: "schema_version",
  LEGACY_MIGRATION_STATE: "legacy_migration_state",
  LEGACY_MIGRATION_VERSION: "legacy_migration_version",
  LEGACY_MIGRATION_DIGEST: "legacy_migration_digest",
  LEGACY_MIGRATED_AT: "legacy_migrated_at",
});

// Per-store migration meta for the token_usage structured store (plan §3.2 +
// Phase 2 common contract rule 3). Same state machine as the settings root.
const TOKEN_USAGE_META_KEYS = Object.freeze({
  STATE: "token_usage_migration_state",
  VERSION: "token_usage_migration_version",
  DIGEST: "token_usage_migration_digest",
  MIGRATED_AT: "token_usage_migrated_at",
});

// Per-store migration meta for the two Phase 2 toolkit preference stores
// (plan §3.3). Same four-key pattern and state machine as token_usage.
const DEFAULT_TOOLKITS_META_KEYS = Object.freeze({
  STATE: "default_toolkits_migration_state",
  VERSION: "default_toolkits_migration_version",
  DIGEST: "default_toolkits_migration_digest",
  MIGRATED_AT: "default_toolkits_migrated_at",
});
const TOOLKIT_AUTO_APPROVE_META_KEYS = Object.freeze({
  STATE: "toolkit_auto_approve_migration_state",
  VERSION: "toolkit_auto_approve_migration_version",
  DIGEST: "toolkit_auto_approve_migration_digest",
  MIGRATED_AT: "toolkit_auto_approve_migrated_at",
});

// Per-store migration meta for the computer use preference store (plan §3.4).
// One migration covers all three keys (single table, single envelope).
const COMPUTER_USE_META_KEYS = Object.freeze({
  STATE: "computer_use_migration_state",
  VERSION: "computer_use_migration_version",
  DIGEST: "computer_use_migration_digest",
  MIGRATED_AT: "computer_use_migrated_at",
});

// A SQL scope with zero rows is indistinguishable from an absent scope, but
// the legacy store distinguishes "global was explicitly emptied" ([] persists
// and reads as []) from "global was never set" (reads as the ["core"]
// default). The explicitly-empty scope keys live under this meta key so the
// read side can keep the exact legacy semantics without schema changes.
const DEFAULT_TOOLKITS_EMPTY_SCOPES_META_KEY =
  "default_toolkits_explicit_empty_scopes";

// Every statement is CREATE ... IF NOT EXISTS, so re-running the block is the
// v1 → v2 upgrade path: reopening a v1 database simply gains the Phase 2
// tables/indexes and the meta schema_version is bumped in init().
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  namespace      TEXT PRIMARY KEY,
  value_json     TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  updated_at     INTEGER NOT NULL,
  revision       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS token_usage_records (
  id                           INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp                    INTEGER NOT NULL,
  provider                     TEXT NOT NULL,
  model                        TEXT NOT NULL,
  model_id                     TEXT NOT NULL,
  consumed_tokens              INTEGER NOT NULL,
  input_tokens                 INTEGER NOT NULL DEFAULT 0,
  output_tokens                INTEGER NOT NULL DEFAULT 0,
  cache_read_input_tokens      INTEGER,
  cache_creation_input_tokens  INTEGER,
  max_context_window_tokens    INTEGER,
  chat_id                      TEXT
);

CREATE INDEX IF NOT EXISTS idx_token_usage_timestamp
  ON token_usage_records(timestamp);

CREATE INDEX IF NOT EXISTS idx_token_usage_provider_model
  ON token_usage_records(provider, model_id);

CREATE INDEX IF NOT EXISTS idx_token_usage_chat
  ON token_usage_records(chat_id);

CREATE TABLE IF NOT EXISTS default_toolkits (
  scope_key   TEXT NOT NULL,
  toolkit_id  TEXT NOT NULL,
  ord         INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (scope_key, toolkit_id)
);

CREATE TABLE IF NOT EXISTS toolkit_auto_approve (
  toolkit_id  TEXT PRIMARY KEY,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tool_auto_approve (
  toolkit_id  TEXT NOT NULL,
  tool_name   TEXT NOT NULL,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (toolkit_id, tool_name)
);

CREATE TABLE IF NOT EXISTS computer_use_preferences (
  key            TEXT PRIMARY KEY,
  value_json     TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
`;

// The code also rides in the message behind a stable "[<code>] " prefix:
// ipcMain.handle() rejections only carry error.message across the IPC
// boundary (error.code is stripped by Electron's serialization), so the
// renderer can parse the code back out of the message. The .code property
// stays for main-process callers.
const errorWithCode = (message, code) => {
  const error = new Error(`[${code}] ${message}`);
  error.code = code;
  return error;
};

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

// Stable canonical serialization (recursive key sort), mirroring JSON
// semantics for undefined members. The migration digest is ALWAYS recomputed
// from this — a renderer-supplied digest is verified, never trusted.
const canonicalize = (value) => {
  if (Array.isArray(value)) {
    return `[${value
      .map((item) => canonicalize(item === undefined ? null : item))
      .join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
      .join(",")}}`;
  }
  const json = JSON.stringify(value);
  return json === undefined ? "null" : json;
};

const computeLegacyMigrationDigest = (payload) => {
  const { digest: _claimed, ...digestInput } = isPlainObject(payload)
    ? payload
    : {};
  return crypto
    .createHash("sha256")
    .update(canonicalize(digestInput), "utf8")
    .digest("hex");
};

const stripModelProviderSecrets = (namespace, value) => {
  if (namespace !== MODEL_PROVIDERS_NAMESPACE || !isPlainObject(value)) {
    return value;
  }
  const clone = { ...value };
  for (const key of SENSITIVE_MODEL_PROVIDER_KEYS) {
    delete clone[key];
  }
  return clone;
};

// ---- token usage normalize + validation (plan §3.2: "保留现有 normalize
// 语义") -----------------------------------------------------------------
// Line-for-line mirror of the legacy renderer normalize in
// src/COMPONENTs/settings/token_usage/storage.js, followed by the SQL-side
// §7.2 gates (safe-integer Unix-ms timestamp, non-negative safe token counts,
// capped strings). Normalize semantics themselves are unchanged.

const toFinitePositiveNumber = (value) =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;

const normalizeTokenUsageRecordShape = (record) => {
  if (!isPlainObject(record)) return null;

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
    timestamp:
      typeof record.timestamp === "number" ? record.timestamp : Date.now(),
    provider: typeof record.provider === "string" ? record.provider : "unknown",
    model: typeof record.model === "string" ? record.model : "unknown",
    model_id: typeof record.model_id === "string" ? record.model_id : "unknown",
    consumed_tokens,
    input_tokens,
    output_tokens,
    ...(toFinitePositiveNumber(record.cache_read_input_tokens) > 0
      ? {
          cache_read_input_tokens: toFinitePositiveNumber(
            record.cache_read_input_tokens,
          ),
        }
      : {}),
    ...(toFinitePositiveNumber(record.cache_creation_input_tokens) > 0
      ? {
          cache_creation_input_tokens: toFinitePositiveNumber(
            record.cache_creation_input_tokens,
          ),
        }
      : {}),
    ...(typeof record.max_context_window_tokens === "number" &&
    Number.isFinite(record.max_context_window_tokens)
      ? { max_context_window_tokens: record.max_context_window_tokens }
      : {}),
    ...(typeof record.chatId === "string" ? { chatId: record.chatId } : {}),
  };
};

const isSafeTokenValue = (value) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= TOKEN_USAGE_LIMITS.MAX_TOKEN_VALUE;

// Normalize then gate. Throws [invalid_token_usage_record] — error messages
// carry field names only, never record contents.
const normalizeAndValidateTokenUsageRecord = (record) => {
  const normalized = normalizeTokenUsageRecordShape(record);
  if (!normalized) {
    throw errorWithCode(
      "token usage record has no usable token counts",
      "invalid_token_usage_record",
    );
  }
  if (
    !Number.isSafeInteger(normalized.timestamp) ||
    normalized.timestamp < 0
  ) {
    throw errorWithCode(
      "token usage record timestamp must be a non-negative Unix-ms safe integer",
      "invalid_token_usage_record",
    );
  }
  for (const field of [
    "consumed_tokens",
    "input_tokens",
    "output_tokens",
    "cache_read_input_tokens",
    "cache_creation_input_tokens",
    "max_context_window_tokens",
  ]) {
    if (normalized[field] === undefined) continue;
    if (!isSafeTokenValue(normalized[field])) {
      throw errorWithCode(
        `token usage record field "${field}" must be finite, non-negative ` +
          "and within the safe-integer range",
        "invalid_token_usage_record",
      );
    }
  }
  for (const field of ["provider", "model", "model_id", "chatId"]) {
    if (normalized[field] === undefined) continue;
    if (normalized[field].length > TOKEN_USAGE_LIMITS.STRING_MAX_LENGTH) {
      throw errorWithCode(
        `token usage record field "${field}" exceeds ` +
          `${TOKEN_USAGE_LIMITS.STRING_MAX_LENGTH} characters`,
        "invalid_token_usage_record",
      );
    }
  }
  return normalized;
};

// SQL row → legacy renderer record shape (chatId camelCase; optional fields
// present only when stored).
const tokenUsageRowToRecord = (row) => {
  const record = {
    timestamp: Number(row.timestamp),
    provider: row.provider,
    model: row.model,
    model_id: row.model_id,
    consumed_tokens: Number(row.consumed_tokens),
    input_tokens: Number(row.input_tokens),
    output_tokens: Number(row.output_tokens),
  };
  if (row.cache_read_input_tokens != null) {
    record.cache_read_input_tokens = Number(row.cache_read_input_tokens);
  }
  if (row.cache_creation_input_tokens != null) {
    record.cache_creation_input_tokens = Number(
      row.cache_creation_input_tokens,
    );
  }
  if (row.max_context_window_tokens != null) {
    record.max_context_window_tokens = Number(row.max_context_window_tokens);
  }
  if (row.chat_id != null) {
    record.chatId = row.chat_id;
  }
  return record;
};

// ---- toolkit preference validation (plan §3.3) ---------------------------
// The main process does NOT alias-normalize (renderer-only, see
// TOOLKIT_PREFS_LIMITS note). It trims, caps and gates. Returns null for
// anything unusable so migration can drop-and-count while direct writes throw.
const cleanToolkitPrefId = (value) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed.length > TOOLKIT_PREFS_LIMITS.ID_MAX_LENGTH ||
    // Same rationale as validateNamespace: "__proto__" as an object-map key
    // is a prototype-pollution hazard on any plain-object consumer.
    trimmed === "__proto__"
  ) {
    return null;
  }
  return trimmed;
};

const isComputerAutoApproveEntry = (toolkitId) =>
  toolkitId === COMPUTER_TOOLKIT_ID;

// ---- computer use preference validation (plan §3.4) ----------------------
// Shape gates mirror the renderer stores' fail-closed readers byte for byte:
// `version` stays inside the record (the renderer's CONSENT_VERSION /
// ENABLED_STORE_VERSION gate is applied on READ, exactly like legacy — a
// version-mismatched record is stored and returned, it just never counts as
// consent/enabled). Returns the picked record or null for anything unusable,
// so migration can drop-and-count while direct writes throw.

const isValidStoredIsoTimestamp = (value) =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= COMPUTER_USE_LIMITS.ISO_TIMESTAMP_MAX_LENGTH &&
  Number.isFinite(Date.parse(value));

const validateComputerUsePreferenceValue = (key, value) => {
  if (!isPlainObject(value) || !Number.isSafeInteger(value.version)) {
    return null;
  }
  if (key === "consent") {
    // Legacy shape { version:int, acceptedAt:ISO } — fields preserved as-is.
    if (
      !isValidStoredIsoTimestamp(value.acceptedAt) ||
      Object.keys(value).some((k) => k !== "version" && k !== "acceptedAt")
    ) {
      return null;
    }
    return { version: value.version, acceptedAt: value.acceptedAt };
  }
  if (key === "enabled" || key === "local_beta_enabled") {
    // Legacy shape { version:int, enabled:bool, updatedAt:ISO }. The legacy
    // local-beta reader never required updatedAt, so it stays optional there
    // (the writer always sets it; this only mirrors the legacy read gate).
    if (typeof value.enabled !== "boolean") return null;
    const requireUpdatedAt = key === "enabled";
    if (value.updatedAt === undefined) {
      if (requireUpdatedAt) return null;
    } else if (!isValidStoredIsoTimestamp(value.updatedAt)) {
      return null;
    }
    if (
      Object.keys(value).some(
        (k) => k !== "version" && k !== "enabled" && k !== "updatedAt",
      )
    ) {
      return null;
    }
    return {
      version: value.version,
      enabled: value.enabled,
      ...(value.updatedAt !== undefined ? { updatedAt: value.updatedAt } : {}),
    };
  }
  return null;
};

const createSettingsStorageService = ({ app, fs, path, sqlite } = {}) => {
  if (!app || !fs || !path || !sqlite) {
    throw new Error("createSettingsStorageService: missing dependencies");
  }

  let db = null;
  let dbPath = null;
  let degradedReason = null;

  const requireDb = () => {
    if (!db) {
      throw errorWithCode(
        degradedReason
          ? `settings storage unavailable (degraded: ${degradedReason})`
          : "settings storage service used before init()",
        "settings_storage_unavailable",
      );
    }
    return db;
  };

  // ---- validation ----------------------------------------------------------

  const validateNamespace = (namespace) => {
    if (
      typeof namespace !== "string" ||
      namespace.length === 0 ||
      namespace.length > SETTINGS_STORAGE_LIMITS.NAMESPACE_MAX_LENGTH ||
      !SETTINGS_STORAGE_LIMITS.NAMESPACE_PATTERN.test(namespace) ||
      // "__proto__" matches the pattern but assigns through the inherited
      // Object.prototype accessor on any plain-object map (local prototype
      // pollution): an acked write could never be read back from a snapshot.
      // Rejected outright. ("constructor" is safe — plain data property.)
      namespace === "__proto__"
    ) {
      throw errorWithCode(
        "invalid namespace: must match [a-z0-9_.-], length 1-" +
          `${SETTINGS_STORAGE_LIMITS.NAMESPACE_MAX_LENGTH}`,
        "invalid_namespace",
      );
    }
  };

  const serializeNamespaceValue = (namespace, value) => {
    if (value === undefined) {
      throw errorWithCode(
        `namespace "${namespace}": value must not be undefined`,
        "invalid_value",
      );
    }
    let json;
    try {
      json = JSON.stringify(value);
    } catch (_error) {
      throw errorWithCode(
        `namespace "${namespace}": value is not JSON-serializable`,
        "invalid_value",
      );
    }
    if (typeof json !== "string") {
      throw errorWithCode(
        `namespace "${namespace}": value is not JSON-serializable`,
        "invalid_value",
      );
    }
    if (
      Buffer.byteLength(json, "utf8") >
      SETTINGS_STORAGE_LIMITS.NAMESPACE_VALUE_MAX_BYTES
    ) {
      throw errorWithCode(
        `namespace "${namespace}": value exceeds ` +
          `${SETTINGS_STORAGE_LIMITS.NAMESPACE_VALUE_MAX_BYTES} bytes`,
        "value_too_large",
      );
    }
    return json;
  };

  // ---- primitive writers (always called inside a transaction) --------------

  const upsertMeta = (key, value) => {
    requireDb()
      .prepare(
        "INSERT INTO meta(key, value) VALUES (?, ?) " +
          "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(key, JSON.stringify(value === undefined ? null : value));
  };

  const readMetaValue = (key) => {
    const row = requireDb()
      .prepare("SELECT value FROM meta WHERE key = ?")
      .get(key);
    if (!row) return undefined;
    try {
      return JSON.parse(row.value);
    } catch (_error) {
      return undefined;
    }
  };

  // Upsert a settings row; revision is 0 on insert, previous+1 on update.
  const upsertNamespaceRow = (namespace, json, updatedAt) => {
    const existing = requireDb()
      .prepare("SELECT revision FROM settings WHERE namespace = ?")
      .get(namespace);
    const nextRevision = existing ? Number(existing.revision) + 1 : 0;
    requireDb()
      .prepare(
        "INSERT INTO settings(namespace, value_json, schema_version, updated_at, revision) " +
          "VALUES (?, ?, ?, ?, ?) " +
          "ON CONFLICT(namespace) DO UPDATE SET " +
          "value_json = excluded.value_json, " +
          "schema_version = excluded.schema_version, " +
          "updated_at = excluded.updated_at, " +
          "revision = excluded.revision",
      )
      .run(namespace, json, SETTINGS_ROW_SCHEMA_VERSION, updatedAt, nextRevision);
    return nextRevision;
  };

  // ---- migration meta ------------------------------------------------------

  const getMigrationMeta = () => {
    const state = readMetaValue(META_KEYS.LEGACY_MIGRATION_STATE);
    const version = readMetaValue(META_KEYS.LEGACY_MIGRATION_VERSION);
    const digest = readMetaValue(META_KEYS.LEGACY_MIGRATION_DIGEST);
    const migratedAt = readMetaValue(META_KEYS.LEGACY_MIGRATED_AT);
    return {
      state:
        state === MIGRATION_STATE.IN_PROGRESS ||
        state === MIGRATION_STATE.COMPLETE
          ? state
          : MIGRATION_STATE.NOT_STARTED,
      version: version === undefined ? null : version,
      digest: digest === undefined ? null : digest,
      migratedAt: migratedAt === undefined ? null : migratedAt,
    };
  };

  const getTokenUsageMigrationMeta = () => {
    const state = readMetaValue(TOKEN_USAGE_META_KEYS.STATE);
    const version = readMetaValue(TOKEN_USAGE_META_KEYS.VERSION);
    const digest = readMetaValue(TOKEN_USAGE_META_KEYS.DIGEST);
    const migratedAt = readMetaValue(TOKEN_USAGE_META_KEYS.MIGRATED_AT);
    return {
      state:
        state === MIGRATION_STATE.IN_PROGRESS ||
        state === MIGRATION_STATE.COMPLETE
          ? state
          : MIGRATION_STATE.NOT_STARTED,
      version: version === undefined ? null : version,
      digest: digest === undefined ? null : digest,
      migratedAt: migratedAt === undefined ? null : migratedAt,
    };
  };

  // Generic per-store meta reader for the Phase 2 toolkit preference stores —
  // same shape and state machine as getTokenUsageMigrationMeta (left as-is).
  const getStoreMigrationMetaFor = (metaKeys) => {
    const state = readMetaValue(metaKeys.STATE);
    const version = readMetaValue(metaKeys.VERSION);
    const digest = readMetaValue(metaKeys.DIGEST);
    const migratedAt = readMetaValue(metaKeys.MIGRATED_AT);
    return {
      state:
        state === MIGRATION_STATE.IN_PROGRESS ||
        state === MIGRATION_STATE.COMPLETE
          ? state
          : MIGRATION_STATE.NOT_STARTED,
      version: version === undefined ? null : version,
      digest: digest === undefined ? null : digest,
      migratedAt: migratedAt === undefined ? null : migratedAt,
    };
  };

  // ---- public API ----------------------------------------------------------

  const init = () => {
    if (db) return;
    try {
      const userDataDir = app.getPath("userData");
      dbPath = path.join(userDataDir, DB_FILE_NAME);
      db = createSettingsDb({ dbPath, sqlite });
      db.exec(SCHEMA_SQL);
      const storedSchemaVersion = readMetaValue(META_KEYS.SCHEMA_VERSION);
      if (
        storedSchemaVersion === undefined ||
        (typeof storedSchemaVersion === "number" &&
          storedSchemaVersion < SCHEMA_VERSION)
      ) {
        // Fresh database, or a v1 database reopened by this build: SCHEMA_SQL
        // above is fully idempotent (IF NOT EXISTS), so the upgrade is just
        // recording the new version. A stored version NEWER than ours is left
        // untouched (never downgrade a future database).
        db.tx(() => {
          upsertMeta(META_KEYS.SCHEMA_VERSION, SCHEMA_VERSION);
        });
      }
      degradedReason = null;
    } catch (error) {
      // Corruption policy (plan §7.3): NEVER delete the file; enter degraded
      // mode. The renderer keeps its localStorage fallback in Phase 1B.
      if (db) {
        try {
          db.close();
        } catch (_closeError) {
          // connection already unusable
        }
      }
      db = null;
      const fileExists = dbPath ? fs.existsSync(dbPath) : false;
      degradedReason = fileExists ? "open-failed" : "init-failed";
      console.error(
        "[settings-storage] init failed; entering degraded mode " +
          `(db file ${fileExists ? "left in place" : "not created"}):`,
        error.message,
      );
    }
  };

  const getBootstrapSnapshot = () => {
    if (!db) {
      return {
        available: false,
        degraded: true,
        reason: degradedReason || "not-initialized",
      };
    }
    const rows = db
      .prepare("SELECT namespace, value_json, revision FROM settings")
      .all();
    // Null-prototype maps: a "__proto__" row smuggled in by other means must
    // become an own key instead of silently replacing the maps' prototype
    // (prototype pollution / phantom namespaces). Structured clone over
    // sendSync handles null-prototype objects fine.
    const namespaces = Object.create(null);
    const revisions = Object.create(null);
    for (const row of rows) {
      let parsed;
      try {
        parsed = JSON.parse(row.value_json);
      } catch (_error) {
        // Single corrupt namespace must not take down the snapshot (§7.3).
        console.warn(
          "[settings-storage] skipping corrupt namespace in bootstrap:",
          row.namespace,
        );
        continue;
      }
      // Defensive re-strip on read: secrets must never reach the renderer via
      // the bootstrap snapshot even if a row was written by other means.
      namespaces[row.namespace] = stripModelProviderSecrets(
        row.namespace,
        parsed,
      );
      revisions[row.namespace] = Number(row.revision);
    }
    const schemaVersion = readMetaValue(META_KEYS.SCHEMA_VERSION);
    // Phase 2 (plan §3.3): the toolkit preference stores are synchronous hot
    // paths in the renderer, so their (tiny) tables ride the bootstrap
    // snapshot — the in-memory mirrors must be loaded before the first read
    // and sync IPC stays bootstrap-only. A failure here must not take down
    // the whole snapshot (§7.3): the stores then fall back to localStorage.
    let toolkitPrefs;
    try {
      toolkitPrefs = {
        defaultToolkits: { scopes: readDefaultToolkitsScopes() },
        toolkitAutoApprove: readToolkitAutoApproveState(),
      };
    } catch (error) {
      console.warn(
        "[settings-storage] toolkit prefs unavailable in bootstrap:",
        error.code || error.message,
      );
      toolkitPrefs = undefined;
    }
    // Phase 2 (plan §3.4): the computer use stores are synchronous hot paths
    // too (boot_sync reads them early), so their tiny KV table rides the
    // snapshot as well. Failure-isolated for the same §7.3 reason — the
    // stores then fall back to localStorage (whose fail-closed reads hold).
    let computerUse;
    try {
      computerUse = { entries: readComputerUsePreferenceEntries() };
    } catch (error) {
      console.warn(
        "[settings-storage] computer use prefs unavailable in bootstrap:",
        error.code || error.message,
      );
      computerUse = undefined;
    }
    // Phase 2 per-store migration meta rides the snapshot so the renderer
    // stores can arbitrate marker-vs-SQL migration state without extra IPC:
    // a localStorage marker can outlive a reset/replaced settings.db, and
    // when the two disagree the SQL side is the authority. Failure-isolated
    // like the sections above (§7.3) — without it the stores fall back to
    // marker-only behavior.
    let storeMigrations;
    try {
      storeMigrations = {
        tokenUsage: getTokenUsageMigrationMeta(),
        defaultToolkits: getStoreMigrationMetaFor(DEFAULT_TOOLKITS_META_KEYS),
        toolkitAutoApprove: getStoreMigrationMetaFor(
          TOOLKIT_AUTO_APPROVE_META_KEYS,
        ),
        computerUse: getStoreMigrationMetaFor(COMPUTER_USE_META_KEYS),
      };
    } catch (error) {
      console.warn(
        "[settings-storage] store migration meta unavailable in bootstrap:",
        error.code || error.message,
      );
      storeMigrations = undefined;
    }
    return {
      available: true,
      degraded: false,
      schemaVersion: schemaVersion === undefined ? SCHEMA_VERSION : schemaVersion,
      migration: getMigrationMeta(),
      namespaces,
      revisions,
      ...(toolkitPrefs !== undefined ? { toolkitPrefs } : {}),
      ...(computerUse !== undefined ? { computerUse } : {}),
      ...(storeMigrations !== undefined ? { storeMigrations } : {}),
    };
  };

  const setNamespace = (namespace, value, options = {}) => {
    requireDb();
    validateNamespace(namespace);
    // Write-side secret strip: keys listed in SENSITIVE_MODEL_PROVIDER_KEYS
    // never land in the settings table.
    const sanitized = stripModelProviderSecrets(namespace, value);
    const json = serializeNamespaceValue(namespace, sanitized);
    const expectedRevision =
      options && options.expectedRevision !== undefined
        ? options.expectedRevision
        : null;
    if (
      expectedRevision !== null &&
      (typeof expectedRevision !== "number" ||
        !Number.isInteger(expectedRevision) ||
        expectedRevision < 0)
    ) {
      throw errorWithCode(
        `namespace "${namespace}": expectedRevision must be a non-negative integer`,
        "invalid_expected_revision",
      );
    }
    const updatedAt = Date.now();
    return db.tx(() => {
      if (expectedRevision !== null) {
        const existing = db
          .prepare("SELECT revision FROM settings WHERE namespace = ?")
          .get(namespace);
        const currentRevision = existing ? Number(existing.revision) : null;
        if (currentRevision !== expectedRevision) {
          throw errorWithCode(
            `namespace "${namespace}": revision conflict`,
            "revision_conflict",
          );
        }
      }
      const revision = upsertNamespaceRow(namespace, json, updatedAt);
      return { ok: true, namespace, revision, updatedAt };
    });
  };

  const deleteNamespace = (namespace) => {
    requireDb();
    validateNamespace(namespace);
    const result = db
      .prepare("DELETE FROM settings WHERE namespace = ?")
      .run(namespace);
    return { ok: true, namespace, deleted: Number(result.changes) > 0 };
  };

  // Legacy localStorage import (plan §5.2-§5.4). Single transaction; failure
  // rolls back everything and the renderer's localStorage stays authoritative.
  const migrateLegacy = (payload) => {
    requireDb();
    if (!isPlainObject(payload)) {
      throw errorWithCode(
        "migrate-legacy: payload must be an object",
        "invalid_migration_payload",
      );
    }
    // Normalize through a JSON round-trip so the digest and the imported rows
    // are computed from the exact bytes JSON.stringify would store:
    // canonicalize() alone never invokes toJSON (a Date would digest as {}
    // while serializeNamespaceValue stores its ISO string), and a BigInt
    // would escape canonicalize as a bare TypeError without a code.
    let normalized;
    try {
      const roundTrip = JSON.stringify(payload);
      if (typeof roundTrip !== "string") {
        throw new Error("payload serialized to undefined");
      }
      normalized = JSON.parse(roundTrip);
    } catch (_error) {
      throw errorWithCode(
        "migrate-legacy: payload is not JSON-serializable",
        "invalid_value",
      );
    }
    if (!isPlainObject(normalized)) {
      throw errorWithCode(
        "migrate-legacy: payload must be an object",
        "invalid_migration_payload",
      );
    }
    if (normalized.migrationVersion !== SUPPORTED_LEGACY_MIGRATION_VERSION) {
      throw errorWithCode(
        "migrate-legacy: unsupported migrationVersion",
        "unsupported_migration_version",
      );
    }
    if (!isPlainObject(normalized.settingsRoot)) {
      throw errorWithCode(
        "migrate-legacy: settingsRoot must be an object",
        "invalid_migration_payload",
      );
    }
    // Phase 1A: the standalone region is accepted (payload shape + digest are
    // stable across phases) but NOT imported — standalone stores are Phase 2.
    if (
      normalized.standalone !== undefined &&
      !isPlainObject(normalized.standalone)
    ) {
      throw errorWithCode(
        "migrate-legacy: standalone must be an object when present",
        "invalid_migration_payload",
      );
    }

    // Total payload size gate (§7.2), computed over the canonical form.
    const { digest: claimedDigest, ...digestInput } = normalized;
    const canonical = canonicalize(digestInput);
    if (
      Buffer.byteLength(canonical, "utf8") >
      SETTINGS_STORAGE_LIMITS.MIGRATION_PAYLOAD_MAX_BYTES
    ) {
      throw errorWithCode(
        "migrate-legacy: payload exceeds " +
          `${SETTINGS_STORAGE_LIMITS.MIGRATION_PAYLOAD_MAX_BYTES} bytes`,
        "payload_too_large",
      );
    }

    // Digest is recomputed by the main process — never trusted from the
    // renderer. A claimed digest that disagrees is rejected outright.
    const digest = crypto
      .createHash("sha256")
      .update(canonical, "utf8")
      .digest("hex");
    if (claimedDigest !== undefined && claimedDigest !== null) {
      if (claimedDigest !== digest) {
        throw errorWithCode(
          "migrate-legacy: digest mismatch",
          "digest_mismatch",
        );
      }
    }

    const migration = getMigrationMeta();
    if (migration.state === MIGRATION_STATE.COMPLETE) {
      // SQL already holds authoritative data. Same version+digest → idempotent
      // success ("already-complete"); anything else → refuse to overwrite the
      // authority with stale localStorage ("refused-stale-digest"). The two
      // outcomes carry distinct status strings so callers never have to infer
      // the branch from the digestMatched boolean (kept for compatibility).
      const digestMatched =
        migration.version === SUPPORTED_LEGACY_MIGRATION_VERSION &&
        migration.digest === digest;
      return {
        status: digestMatched ? "already-complete" : "refused-stale-digest",
        alreadyComplete: true,
        digestMatched,
        digest,
      };
    }
    // not_started, or an in_progress residue from an interrupted run — both
    // are safe to (re)run: the import is a single transaction.

    const migratedAt = Date.now();
    const importedNamespaces = [];
    db.tx(() => {
      upsertMeta(
        META_KEYS.LEGACY_MIGRATION_STATE,
        MIGRATION_STATE.IN_PROGRESS,
      );
      // Unknown top-level namespaces are imported as-is (never dropped); every
      // entry must still pass the shared name/size validation — a violation
      // fails the whole migration and rolls back.
      for (const [namespace, value] of Object.entries(
        normalized.settingsRoot,
      )) {
        validateNamespace(namespace);
        const sanitized = stripModelProviderSecrets(namespace, value);
        const json = serializeNamespaceValue(namespace, sanitized);
        upsertNamespaceRow(namespace, json, migratedAt);
        importedNamespaces.push(namespace);
      }
      upsertMeta(
        META_KEYS.LEGACY_MIGRATION_VERSION,
        SUPPORTED_LEGACY_MIGRATION_VERSION,
      );
      upsertMeta(META_KEYS.LEGACY_MIGRATION_DIGEST, digest);
      upsertMeta(META_KEYS.LEGACY_MIGRATED_AT, migratedAt);
      upsertMeta(META_KEYS.LEGACY_MIGRATION_STATE, MIGRATION_STATE.COMPLETE);
    });
    return {
      status: "complete",
      ok: true,
      digest,
      migratedAt,
      importedNamespaces,
    };
  };

  // ---- Phase 2: token_usage structured store (plan §3.2) -------------------

  const insertTokenUsageRecord = (record) =>
    requireDb()
      .prepare(
        "INSERT INTO token_usage_records(" +
          "timestamp, provider, model, model_id, consumed_tokens, " +
          "input_tokens, output_tokens, cache_read_input_tokens, " +
          "cache_creation_input_tokens, max_context_window_tokens, chat_id) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        record.timestamp,
        record.provider,
        record.model,
        record.model_id,
        record.consumed_tokens,
        record.input_tokens,
        record.output_tokens,
        record.cache_read_input_tokens === undefined
          ? null
          : record.cache_read_input_tokens,
        record.cache_creation_input_tokens === undefined
          ? null
          : record.cache_creation_input_tokens,
        record.max_context_window_tokens === undefined
          ? null
          : record.max_context_window_tokens,
        record.chatId === undefined ? null : record.chatId,
      );

  const appendTokenUsage = (record) => {
    requireDb();
    const normalized = normalizeAndValidateTokenUsageRecord(record);
    const result = insertTokenUsageRecord(normalized);
    return { ok: true, id: Number(result.lastInsertRowid) };
  };

  // Range query returning records oldest-first (aggregation order), id as
  // the stable tiebreak. Never an unconditional full pull: a LIMIT always
  // applies (caller's, clamped to QUERY_MAX_LIMIT, or QUERY_DEFAULT_LIMIT).
  //
  // TRUNCATION SEMANTICS: the SQL scans newest-first (timestamp DESC), so
  // once a range holds more rows than the limit it is the OLDEST rows that
  // fall off — a usage dashboard must never silently lose recent data — and
  // OFFSET pages backwards from the newest row. The page is then reversed so
  // the returned array keeps the documented oldest-first order (identical to
  // the old ASC output whenever the range fits within the limit). Exact
  // whole-range aggregation past the cap is a future SQL-side-aggregation
  // item, deliberately out of scope here.
  const queryTokenUsage = (query) => {
    requireDb();
    const q = query === undefined || query === null ? {} : query;
    if (!isPlainObject(q)) {
      throw errorWithCode(
        "token usage query must be an object",
        "invalid_token_usage_query",
      );
    }
    const bounds = {};
    for (const field of ["startMs", "endMs"]) {
      if (q[field] === undefined || q[field] === null) continue;
      if (!Number.isSafeInteger(q[field])) {
        throw errorWithCode(
          `token usage query "${field}" must be a Unix-ms safe integer`,
          "invalid_token_usage_query",
        );
      }
      bounds[field] = q[field];
    }
    let limit = TOKEN_USAGE_LIMITS.QUERY_DEFAULT_LIMIT;
    if (q.limit !== undefined && q.limit !== null) {
      if (!Number.isSafeInteger(q.limit) || q.limit < 1) {
        throw errorWithCode(
          'token usage query "limit" must be a positive safe integer',
          "invalid_token_usage_query",
        );
      }
      limit = Math.min(q.limit, TOKEN_USAGE_LIMITS.QUERY_MAX_LIMIT);
    }
    let offset = 0;
    if (q.offset !== undefined && q.offset !== null) {
      if (!Number.isSafeInteger(q.offset) || q.offset < 0) {
        throw errorWithCode(
          'token usage query "offset" must be a non-negative safe integer',
          "invalid_token_usage_query",
        );
      }
      offset = q.offset;
    }

    const where = [];
    const params = [];
    if (bounds.startMs !== undefined) {
      where.push("timestamp >= ?");
      params.push(bounds.startMs);
    }
    if (bounds.endMs !== undefined) {
      where.push("timestamp <= ?");
      params.push(bounds.endMs);
    }
    const sql =
      "SELECT * FROM token_usage_records" +
      (where.length > 0 ? ` WHERE ${where.join(" AND ")}` : "") +
      " ORDER BY timestamp DESC, id DESC LIMIT ? OFFSET ?";
    const rows = db.prepare(sql).all(...params, limit, offset);
    rows.reverse(); // newest-first scan → documented oldest-first output
    return { ok: true, records: rows.map(tokenUsageRowToRecord) };
  };

  const clearTokenUsage = () => {
    requireDb();
    return db.tx(() => {
      const result = db.prepare("DELETE FROM token_usage_records").run();
      // Optional AUTOINCREMENT reset (§3.2). sqlite_sequence only exists once
      // an AUTOINCREMENT insert has happened — probe before deleting.
      const sequenceTable = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sqlite_sequence'",
        )
        .get();
      if (sequenceTable) {
        db.prepare("DELETE FROM sqlite_sequence WHERE name = ?").run(
          "token_usage_records",
        );
      }
      return { ok: true, cleared: Number(result.changes) };
    });
  };

  // Per-store legacy import (Phase 2 common contract rule 3, mirroring
  // migrateLegacy): one transaction, all-or-nothing — any invalid record rolls
  // the whole import back (the renderer pre-cleans, exactly like §11.2-1).
  // Legacy records carry no stable IDs, so the digest marker is the only
  // replay guard: a completed same-version+digest replay returns without
  // inserting anything (zero duplicates).
  const migrateLegacyTokenUsage = (payload) => {
    requireDb();
    if (!isPlainObject(payload)) {
      throw errorWithCode(
        "token-usage-migrate-legacy: payload must be an object",
        "invalid_migration_payload",
      );
    }
    // Same JSON round-trip normalization as migrateLegacy: digest and stored
    // values must be computed from the exact bytes JSON would persist.
    let normalized;
    try {
      const roundTrip = JSON.stringify(payload);
      if (typeof roundTrip !== "string") {
        throw new Error("payload serialized to undefined");
      }
      normalized = JSON.parse(roundTrip);
    } catch (_error) {
      throw errorWithCode(
        "token-usage-migrate-legacy: payload is not JSON-serializable",
        "invalid_value",
      );
    }
    if (!isPlainObject(normalized)) {
      throw errorWithCode(
        "token-usage-migrate-legacy: payload must be an object",
        "invalid_migration_payload",
      );
    }
    if (
      normalized.migrationVersion !== SUPPORTED_TOKEN_USAGE_MIGRATION_VERSION
    ) {
      throw errorWithCode(
        "token-usage-migrate-legacy: unsupported migrationVersion",
        "unsupported_migration_version",
      );
    }
    if (!Array.isArray(normalized.records)) {
      throw errorWithCode(
        "token-usage-migrate-legacy: records must be an array",
        "invalid_migration_payload",
      );
    }

    const { digest: claimedDigest, ...digestInput } = normalized;
    const canonical = canonicalize(digestInput);
    if (
      Buffer.byteLength(canonical, "utf8") >
      SETTINGS_STORAGE_LIMITS.MIGRATION_PAYLOAD_MAX_BYTES
    ) {
      throw errorWithCode(
        "token-usage-migrate-legacy: payload exceeds " +
          `${SETTINGS_STORAGE_LIMITS.MIGRATION_PAYLOAD_MAX_BYTES} bytes`,
        "payload_too_large",
      );
    }

    // Recomputed, never trusted (a claimed digest must agree).
    const digest = crypto
      .createHash("sha256")
      .update(canonical, "utf8")
      .digest("hex");
    if (claimedDigest !== undefined && claimedDigest !== null) {
      if (claimedDigest !== digest) {
        throw errorWithCode(
          "token-usage-migrate-legacy: digest mismatch",
          "digest_mismatch",
        );
      }
    }

    const migration = getTokenUsageMigrationMeta();
    if (migration.state === MIGRATION_STATE.COMPLETE) {
      const digestMatched =
        migration.version === SUPPORTED_TOKEN_USAGE_MIGRATION_VERSION &&
        migration.digest === digest;
      return {
        status: digestMatched ? "already-complete" : "refused-stale-digest",
        alreadyComplete: true,
        digestMatched,
        digest,
      };
    }

    const migratedAt = Date.now();
    let importedCount = 0;
    db.tx(() => {
      upsertMeta(TOKEN_USAGE_META_KEYS.STATE, MIGRATION_STATE.IN_PROGRESS);
      // Import preserves the payload's array order — legacy storage appended
      // chronologically, so index order IS oldest-first (§3.2).
      for (const record of normalized.records) {
        insertTokenUsageRecord(normalizeAndValidateTokenUsageRecord(record));
        importedCount += 1;
      }
      upsertMeta(
        TOKEN_USAGE_META_KEYS.VERSION,
        SUPPORTED_TOKEN_USAGE_MIGRATION_VERSION,
      );
      upsertMeta(TOKEN_USAGE_META_KEYS.DIGEST, digest);
      upsertMeta(TOKEN_USAGE_META_KEYS.MIGRATED_AT, migratedAt);
      upsertMeta(TOKEN_USAGE_META_KEYS.STATE, MIGRATION_STATE.COMPLETE);
    });
    return {
      status: "complete",
      ok: true,
      digest,
      migratedAt,
      importedCount,
    };
  };

  // ---- Phase 2: toolkit preference structured stores (plan §3.3) -----------

  const readEmptyScopeKeys = () => {
    const value = readMetaValue(DEFAULT_TOOLKITS_EMPTY_SCOPES_META_KEY);
    return Array.isArray(value)
      ? value.filter((key) => typeof key === "string")
      : [];
  };

  // Scopes maps use null prototypes on read: scope keys are caller-supplied
  // strings and must always become own keys (same rationale as the bootstrap
  // namespace maps).
  const readDefaultToolkitsScopes = () => {
    const rows = requireDb()
      .prepare(
        "SELECT scope_key, toolkit_id FROM default_toolkits " +
          "ORDER BY scope_key ASC, ord ASC, toolkit_id ASC",
      )
      .all();
    const scopes = Object.create(null);
    for (const row of rows) {
      if (scopes[row.scope_key] === undefined) scopes[row.scope_key] = [];
      scopes[row.scope_key].push(row.toolkit_id);
    }
    // Explicitly-emptied scopes read back as [] (legacy parity: an emptied
    // global selection must NOT resurrect the ["core"] default).
    for (const scopeKey of readEmptyScopeKeys()) {
      if (scopes[scopeKey] === undefined) scopes[scopeKey] = [];
    }
    return scopes;
  };

  const readDefaultToolkits = () => {
    requireDb();
    return { ok: true, scopes: readDefaultToolkitsScopes() };
  };

  // Full-scope replacement (the renderer computes the next selection against
  // its mirror; both tables are tiny). Invalid entries throw — the renderer
  // sanitizes before sending, so a violation here is a bug, never data.
  const replaceDefaultToolkitsScope = (scopeKey, toolkitIds) => {
    requireDb();
    const cleanScope = cleanToolkitPrefId(scopeKey);
    if (!cleanScope) {
      throw errorWithCode(
        "default-toolkits: scopeKey must be a non-empty string within " +
          `${TOOLKIT_PREFS_LIMITS.ID_MAX_LENGTH} characters`,
        "invalid_default_toolkits_payload",
      );
    }
    if (
      !Array.isArray(toolkitIds) ||
      toolkitIds.length > TOOLKIT_PREFS_LIMITS.MAX_IDS_PER_SCOPE
    ) {
      throw errorWithCode(
        "default-toolkits: toolkitIds must be an array of at most " +
          `${TOOLKIT_PREFS_LIMITS.MAX_IDS_PER_SCOPE} entries`,
        "invalid_default_toolkits_payload",
      );
    }
    const ids = [];
    const seen = new Set();
    for (const id of toolkitIds) {
      const clean = cleanToolkitPrefId(id);
      if (!clean) {
        throw errorWithCode(
          'default-toolkits: field "toolkitIds" contains an invalid entry',
          "invalid_default_toolkits_payload",
        );
      }
      if (seen.has(clean)) continue; // idempotent silent dedupe
      seen.add(clean);
      ids.push(clean);
    }
    const updatedAt = Date.now();
    return db.tx(() => {
      // Scope cap: EVERY write counts against MAX_SCOPES — including a
      // clearing write (ids = []), which otherwise appends the scope key to
      // the explicit-empty meta set without bound. "Tracked" scopes = scopes
      // with rows plus explicitly-emptied scopes; the target scope itself is
      // excluded, so rewriting or clearing an already-tracked scope always
      // passes.
      const emptyScopes = new Set(readEmptyScopeKeys());
      const trackedOtherScopes = new Set(
        db
          .prepare(
            "SELECT DISTINCT scope_key AS k FROM default_toolkits " +
              "WHERE scope_key <> ?",
          )
          .all(cleanScope)
          .map((row) => row.k),
      );
      for (const key of emptyScopes) {
        if (key !== cleanScope) trackedOtherScopes.add(key);
      }
      if (trackedOtherScopes.size >= TOOLKIT_PREFS_LIMITS.MAX_SCOPES) {
        throw errorWithCode(
          "default-toolkits: scope count exceeds " +
            `${TOOLKIT_PREFS_LIMITS.MAX_SCOPES}`,
          "invalid_default_toolkits_payload",
        );
      }
      db.prepare("DELETE FROM default_toolkits WHERE scope_key = ?").run(
        cleanScope,
      );
      ids.forEach((id, ord) => {
        db.prepare(
          "INSERT INTO default_toolkits(scope_key, toolkit_id, ord, updated_at) " +
            "VALUES (?, ?, ?, ?)",
        ).run(cleanScope, id, ord, updatedAt);
      });
      if (ids.length === 0) {
        emptyScopes.add(cleanScope);
      } else {
        emptyScopes.delete(cleanScope);
      }
      upsertMeta(DEFAULT_TOOLKITS_EMPTY_SCOPES_META_KEY, [...emptyScopes]);
      return { ok: true, scopeKey: cleanScope, toolkitIds: ids };
    });
  };

  const readToolkitAutoApproveState = () => {
    const toolkits = requireDb()
      .prepare("SELECT toolkit_id FROM toolkit_auto_approve ORDER BY rowid ASC")
      .all()
      .map((row) => row.toolkit_id);
    const tools = requireDb()
      .prepare(
        "SELECT toolkit_id, tool_name FROM tool_auto_approve ORDER BY rowid ASC",
      )
      .all()
      .map((row) => ({ toolkitId: row.toolkit_id, toolName: row.tool_name }));
    return { toolkits, tools };
  };

  const readToolkitAutoApprove = () => {
    requireDb();
    return { ok: true, ...readToolkitAutoApproveState() };
  };

  // Full replacement of both auto-approve tables in one transaction. This is
  // a security surface (plan §3.3: never widen the auto-approve scope): any
  // invalid entry — including anything referencing the computer toolkit —
  // rejects the whole write.
  const replaceToolkitAutoApprove = (payload) => {
    requireDb();
    const p = payload === undefined || payload === null ? {} : payload;
    if (!isPlainObject(p)) {
      throw errorWithCode(
        "toolkit-auto-approve: payload must be an object",
        "invalid_toolkit_auto_approve_payload",
      );
    }
    const rawToolkits = p.toolkits === undefined ? [] : p.toolkits;
    const rawTools = p.tools === undefined ? [] : p.tools;
    if (
      !Array.isArray(rawToolkits) ||
      rawToolkits.length > TOOLKIT_PREFS_LIMITS.MAX_AUTO_APPROVE_TOOLKITS ||
      !Array.isArray(rawTools) ||
      rawTools.length > TOOLKIT_PREFS_LIMITS.MAX_AUTO_APPROVE_TOOLS
    ) {
      throw errorWithCode(
        'toolkit-auto-approve: "toolkits" and "tools" must be arrays within ' +
          "their entry caps",
        "invalid_toolkit_auto_approve_payload",
      );
    }
    const toolkits = [];
    const seenToolkits = new Set();
    for (const id of rawToolkits) {
      const clean = cleanToolkitPrefId(id);
      if (!clean) {
        throw errorWithCode(
          'toolkit-auto-approve: field "toolkits" contains an invalid entry',
          "invalid_toolkit_auto_approve_payload",
        );
      }
      if (isComputerAutoApproveEntry(clean)) {
        throw errorWithCode(
          'toolkit-auto-approve: field "toolkits" contains a toolkit that ' +
            "can never be auto-approved",
          "invalid_toolkit_auto_approve_payload",
        );
      }
      if (seenToolkits.has(clean)) continue;
      seenToolkits.add(clean);
      toolkits.push(clean);
    }
    const tools = [];
    const seenTools = new Set();
    for (const entry of rawTools) {
      if (!isPlainObject(entry)) {
        throw errorWithCode(
          'toolkit-auto-approve: field "tools" contains an invalid entry',
          "invalid_toolkit_auto_approve_payload",
        );
      }
      const toolkitId = cleanToolkitPrefId(entry.toolkitId);
      const toolName = cleanToolkitPrefId(entry.toolName);
      if (!toolkitId || !toolName) {
        throw errorWithCode(
          'toolkit-auto-approve: field "tools" contains an invalid entry',
          "invalid_toolkit_auto_approve_payload",
        );
      }
      if (isComputerAutoApproveEntry(toolkitId)) {
        throw errorWithCode(
          'toolkit-auto-approve: field "tools" contains a tool that can ' +
            "never be auto-approved",
          "invalid_toolkit_auto_approve_payload",
        );
      }
      // In-memory dedup key only (never persisted). NUL cannot survive
      // cleanToolkitPrefId, so it is an unambiguous separator - kept as an
      // escape sequence: a raw 0x00 byte in the source makes file(1)/grep
      // treat this file as binary.
      const key = `${toolkitId}\u0000${toolName}`;
      if (seenTools.has(key)) continue;
      seenTools.add(key);
      tools.push({ toolkitId, toolName });
    }
    const updatedAt = Date.now();
    return db.tx(() => {
      db.prepare("DELETE FROM toolkit_auto_approve").run();
      db.prepare("DELETE FROM tool_auto_approve").run();
      for (const id of toolkits) {
        db.prepare(
          "INSERT INTO toolkit_auto_approve(toolkit_id, updated_at) VALUES (?, ?)",
        ).run(id, updatedAt);
      }
      for (const tool of tools) {
        db.prepare(
          "INSERT INTO tool_auto_approve(toolkit_id, tool_name, updated_at) " +
            "VALUES (?, ?, ?)",
        ).run(tool.toolkitId, tool.toolName, updatedAt);
      }
      return { ok: true, toolkits, tools };
    });
  };

  // Shared migration-envelope scaffold for the Phase 2 preference stores:
  // JSON round-trip normalization, version gate, canonical size gate and the
  // recomputed (never trusted) digest — identical to migrateLegacyTokenUsage.
  const normalizeStoreMigrationEnvelope = (payload, label, supportedVersion) => {
    if (!isPlainObject(payload)) {
      throw errorWithCode(
        `${label}: payload must be an object`,
        "invalid_migration_payload",
      );
    }
    let normalized;
    try {
      const roundTrip = JSON.stringify(payload);
      if (typeof roundTrip !== "string") {
        throw new Error("payload serialized to undefined");
      }
      normalized = JSON.parse(roundTrip);
    } catch (_error) {
      throw errorWithCode(
        `${label}: payload is not JSON-serializable`,
        "invalid_value",
      );
    }
    if (!isPlainObject(normalized)) {
      throw errorWithCode(
        `${label}: payload must be an object`,
        "invalid_migration_payload",
      );
    }
    if (normalized.migrationVersion !== supportedVersion) {
      throw errorWithCode(
        `${label}: unsupported migrationVersion`,
        "unsupported_migration_version",
      );
    }
    const { digest: claimedDigest, ...digestInput } = normalized;
    const canonical = canonicalize(digestInput);
    if (
      Buffer.byteLength(canonical, "utf8") >
      SETTINGS_STORAGE_LIMITS.MIGRATION_PAYLOAD_MAX_BYTES
    ) {
      throw errorWithCode(
        `${label}: payload exceeds ` +
          `${SETTINGS_STORAGE_LIMITS.MIGRATION_PAYLOAD_MAX_BYTES} bytes`,
        "payload_too_large",
      );
    }
    const digest = crypto
      .createHash("sha256")
      .update(canonical, "utf8")
      .digest("hex");
    if (claimedDigest !== undefined && claimedDigest !== null) {
      if (claimedDigest !== digest) {
        throw errorWithCode(`${label}: digest mismatch`, "digest_mismatch");
      }
    }
    return { normalized, digest };
  };

  const resolveCompletedStoreMigration = (metaKeys, digest, supportedVersion) => {
    const migration = getStoreMigrationMetaFor(metaKeys);
    if (migration.state !== MIGRATION_STATE.COMPLETE) return null;
    const digestMatched =
      migration.version === supportedVersion && migration.digest === digest;
    return {
      status: digestMatched ? "already-complete" : "refused-stale-digest",
      alreadyComplete: true,
      digestMatched,
      digest,
    };
  };

  // Per-store legacy import for default_toolkits. Unlike token_usage
  // (all-or-nothing), plan §3.3 rules these imports drop-and-count: unknown /
  // invalid entries are discarded with a diagnostic (counts only, never
  // contents) — a preference store must never fail its migration over one bad
  // entry, and dropping can only narrow, never widen, the imported state.
  const migrateLegacyDefaultToolkits = (payload) => {
    requireDb();
    const label = "default-toolkits-migrate-legacy";
    const { normalized, digest } = normalizeStoreMigrationEnvelope(
      payload,
      label,
      SUPPORTED_TOOLKIT_PREFS_MIGRATION_VERSION,
    );
    if (!isPlainObject(normalized.scopes)) {
      throw errorWithCode(
        `${label}: scopes must be an object`,
        "invalid_migration_payload",
      );
    }
    const completed = resolveCompletedStoreMigration(
      DEFAULT_TOOLKITS_META_KEYS,
      digest,
      SUPPORTED_TOOLKIT_PREFS_MIGRATION_VERSION,
    );
    if (completed) return completed;

    const migratedAt = Date.now();
    let importedScopes = 0;
    let importedIds = 0;
    let droppedEntries = 0;
    db.tx(() => {
      upsertMeta(DEFAULT_TOOLKITS_META_KEYS.STATE, MIGRATION_STATE.IN_PROGRESS);
      const emptyScopes = new Set(readEmptyScopeKeys());
      for (const [scopeKey, ids] of Object.entries(normalized.scopes)) {
        const cleanScope = cleanToolkitPrefId(scopeKey);
        if (!cleanScope || !Array.isArray(ids)) {
          droppedEntries += 1;
          continue;
        }
        if (importedScopes >= TOOLKIT_PREFS_LIMITS.MAX_SCOPES) {
          droppedEntries += 1;
          continue;
        }
        const validIds = [];
        const seen = new Set();
        for (const id of ids) {
          const clean = cleanToolkitPrefId(id);
          if (!clean) {
            droppedEntries += 1;
            continue;
          }
          if (seen.has(clean)) continue;
          if (validIds.length >= TOOLKIT_PREFS_LIMITS.MAX_IDS_PER_SCOPE) {
            droppedEntries += 1;
            continue;
          }
          seen.add(clean);
          validIds.push(clean);
        }
        db.prepare("DELETE FROM default_toolkits WHERE scope_key = ?").run(
          cleanScope,
        );
        validIds.forEach((id, ord) => {
          db.prepare(
            "INSERT INTO default_toolkits(scope_key, toolkit_id, ord, updated_at) " +
              "VALUES (?, ?, ?, ?)",
          ).run(cleanScope, id, ord, migratedAt);
        });
        // A scope present in the legacy payload with no importable ids reads
        // back as explicitly empty — exactly the legacy sanitize semantics
        // (sanitizeIds(garbage) === [] and [] persists as []).
        if (validIds.length === 0) {
          emptyScopes.add(cleanScope);
        } else {
          emptyScopes.delete(cleanScope);
        }
        importedScopes += 1;
        importedIds += validIds.length;
      }
      upsertMeta(DEFAULT_TOOLKITS_EMPTY_SCOPES_META_KEY, [...emptyScopes]);
      upsertMeta(
        DEFAULT_TOOLKITS_META_KEYS.VERSION,
        SUPPORTED_TOOLKIT_PREFS_MIGRATION_VERSION,
      );
      upsertMeta(DEFAULT_TOOLKITS_META_KEYS.DIGEST, digest);
      upsertMeta(DEFAULT_TOOLKITS_META_KEYS.MIGRATED_AT, migratedAt);
      upsertMeta(DEFAULT_TOOLKITS_META_KEYS.STATE, MIGRATION_STATE.COMPLETE);
    });
    if (droppedEntries > 0) {
      console.warn(
        `[settings-storage] default-toolkits migration dropped ${droppedEntries} ` +
          "invalid entrie(s)",
      );
    }
    return {
      status: "complete",
      ok: true,
      digest,
      migratedAt,
      importedScopes,
      importedIds,
      droppedEntries,
    };
  };

  // Per-store legacy import for toolkit/tool auto-approve. Security surface:
  // invalid entries AND anything referencing the computer toolkit are dropped
  // (never imported) with a count-only diagnostic — the import can only
  // narrow the auto-approve scope, never widen it.
  const migrateLegacyToolkitAutoApprove = (payload) => {
    requireDb();
    const label = "toolkit-auto-approve-migrate-legacy";
    const { normalized, digest } = normalizeStoreMigrationEnvelope(
      payload,
      label,
      SUPPORTED_TOOLKIT_PREFS_MIGRATION_VERSION,
    );
    if (!Array.isArray(normalized.toolkits) || !Array.isArray(normalized.tools)) {
      throw errorWithCode(
        `${label}: toolkits and tools must be arrays`,
        "invalid_migration_payload",
      );
    }
    const completed = resolveCompletedStoreMigration(
      TOOLKIT_AUTO_APPROVE_META_KEYS,
      digest,
      SUPPORTED_TOOLKIT_PREFS_MIGRATION_VERSION,
    );
    if (completed) return completed;

    const migratedAt = Date.now();
    let importedToolkits = 0;
    let importedTools = 0;
    let droppedEntries = 0;
    db.tx(() => {
      upsertMeta(
        TOOLKIT_AUTO_APPROVE_META_KEYS.STATE,
        MIGRATION_STATE.IN_PROGRESS,
      );
      db.prepare("DELETE FROM toolkit_auto_approve").run();
      db.prepare("DELETE FROM tool_auto_approve").run();
      const seenToolkits = new Set();
      for (const id of normalized.toolkits) {
        const clean = cleanToolkitPrefId(id);
        if (!clean || isComputerAutoApproveEntry(clean)) {
          droppedEntries += 1;
          continue;
        }
        if (seenToolkits.has(clean)) continue;
        if (
          seenToolkits.size >= TOOLKIT_PREFS_LIMITS.MAX_AUTO_APPROVE_TOOLKITS
        ) {
          droppedEntries += 1;
          continue;
        }
        seenToolkits.add(clean);
        db.prepare(
          "INSERT INTO toolkit_auto_approve(toolkit_id, updated_at) VALUES (?, ?)",
        ).run(clean, migratedAt);
        importedToolkits += 1;
      }
      const seenTools = new Set();
      for (const entry of normalized.tools) {
        const toolkitId = isPlainObject(entry)
          ? cleanToolkitPrefId(entry.toolkitId)
          : null;
        const toolName = isPlainObject(entry)
          ? cleanToolkitPrefId(entry.toolName)
          : null;
        if (!toolkitId || !toolName || isComputerAutoApproveEntry(toolkitId)) {
          droppedEntries += 1;
          continue;
        }
        // In-memory dedup key only (never persisted) - see the identical
        // separator note in replaceToolkitAutoApprove.
        const key = `${toolkitId}\u0000${toolName}`;
        if (seenTools.has(key)) continue;
        if (seenTools.size >= TOOLKIT_PREFS_LIMITS.MAX_AUTO_APPROVE_TOOLS) {
          droppedEntries += 1;
          continue;
        }
        seenTools.add(key);
        db.prepare(
          "INSERT INTO tool_auto_approve(toolkit_id, tool_name, updated_at) " +
            "VALUES (?, ?, ?)",
        ).run(toolkitId, toolName, migratedAt);
        importedTools += 1;
      }
      upsertMeta(
        TOOLKIT_AUTO_APPROVE_META_KEYS.VERSION,
        SUPPORTED_TOOLKIT_PREFS_MIGRATION_VERSION,
      );
      upsertMeta(TOOLKIT_AUTO_APPROVE_META_KEYS.DIGEST, digest);
      upsertMeta(TOOLKIT_AUTO_APPROVE_META_KEYS.MIGRATED_AT, migratedAt);
      upsertMeta(
        TOOLKIT_AUTO_APPROVE_META_KEYS.STATE,
        MIGRATION_STATE.COMPLETE,
      );
    });
    if (droppedEntries > 0) {
      console.warn(
        "[settings-storage] toolkit-auto-approve migration dropped " +
          `${droppedEntries} invalid or non-approvable entrie(s)`,
      );
    }
    return {
      status: "complete",
      ok: true,
      digest,
      migratedAt,
      importedToolkits,
      importedTools,
      droppedEntries,
    };
  };

  // ---- Phase 2: computer use preference KV store (plan §3.4) ---------------
  // Rows record the user's DESIRED state only — the sidecar's runtime status
  // stays the actual-effect authority (nothing here talks to the sidecar).
  // Every read path fails closed downstream: a missing/corrupt/mismatched row
  // simply yields no usable record.

  const requireComputerUsePrefKey = (key) => {
    if (!COMPUTER_USE_PREF_KEYS.includes(key)) {
      throw errorWithCode(
        "computer-use: key must be one of " +
          `${COMPUTER_USE_PREF_KEYS.join(", ")}`,
        "invalid_computer_use_preference",
      );
    }
    return key;
  };

  // Null-prototype entries map (same rationale as the bootstrap namespace
  // maps). Corrupt rows are skipped with a key-only warning — the renderer
  // then sees no record and fails closed (§7.3: never take the rest down).
  const readComputerUsePreferenceEntries = () => {
    const rows = requireDb()
      .prepare("SELECT key, value_json FROM computer_use_preferences")
      .all();
    const entries = Object.create(null);
    for (const row of rows) {
      if (!COMPUTER_USE_PREF_KEYS.includes(row.key)) continue;
      let parsed;
      try {
        parsed = JSON.parse(row.value_json);
      } catch (_error) {
        console.warn(
          "[settings-storage] skipping corrupt computer-use row:",
          row.key,
        );
        continue;
      }
      if (!isPlainObject(parsed)) continue;
      entries[row.key] = parsed;
    }
    return entries;
  };

  const readComputerUsePreferences = () => {
    requireDb();
    return { ok: true, entries: readComputerUsePreferenceEntries() };
  };

  const upsertComputerUsePreferenceRow = (key, record, updatedAt) => {
    requireDb()
      .prepare(
        "INSERT INTO computer_use_preferences(key, value_json, schema_version, updated_at) " +
          "VALUES (?, ?, ?, ?) " +
          "ON CONFLICT(key) DO UPDATE SET " +
          "value_json = excluded.value_json, " +
          "schema_version = excluded.schema_version, " +
          "updated_at = excluded.updated_at",
      )
      .run(key, JSON.stringify(record), record.version, updatedAt);
  };

  // Direct writes throw on any violation (the renderer stores construct the
  // records themselves — a violation here is a bug, never data). Error
  // messages carry the key and field names only, never record contents.
  const setComputerUsePreference = (key, value) => {
    requireDb();
    requireComputerUsePrefKey(key);
    const record = validateComputerUsePreferenceValue(key, value);
    if (!record) {
      throw errorWithCode(
        `computer-use: value for "${key}" is not a valid preference record`,
        "invalid_computer_use_preference",
      );
    }
    if (
      Buffer.byteLength(JSON.stringify(record), "utf8") >
      COMPUTER_USE_LIMITS.VALUE_MAX_BYTES
    ) {
      throw errorWithCode(
        `computer-use: value for "${key}" exceeds ` +
          `${COMPUTER_USE_LIMITS.VALUE_MAX_BYTES} bytes`,
        "invalid_computer_use_preference",
      );
    }
    const updatedAt = Date.now();
    return db.tx(() => {
      upsertComputerUsePreferenceRow(key, record, updatedAt);
      return { ok: true, key };
    });
  };

  const clearComputerUsePreference = (key) => {
    requireDb();
    requireComputerUsePrefKey(key);
    const result = db
      .prepare("DELETE FROM computer_use_preferences WHERE key = ?")
      .run(key);
    return { ok: true, key, cleared: Number(result.changes) > 0 };
  };

  // Per-store legacy import (plan §3.4): one envelope covers all three keys.
  // Drop-and-count like the toolkit prefs — an invalid record is simply not
  // imported (it would legacy-read as fail-closed anyway), so the import can
  // only narrow, never widen, the consented/enabled surface.
  const migrateLegacyComputerUse = (payload) => {
    requireDb();
    const label = "computer-use-migrate-legacy";
    const { normalized, digest } = normalizeStoreMigrationEnvelope(
      payload,
      label,
      SUPPORTED_COMPUTER_USE_MIGRATION_VERSION,
    );
    if (!isPlainObject(normalized.records)) {
      throw errorWithCode(
        `${label}: records must be an object`,
        "invalid_migration_payload",
      );
    }
    const completed = resolveCompletedStoreMigration(
      COMPUTER_USE_META_KEYS,
      digest,
      SUPPORTED_COMPUTER_USE_MIGRATION_VERSION,
    );
    if (completed) return completed;

    const migratedAt = Date.now();
    const importedKeys = [];
    let droppedEntries = 0;
    db.tx(() => {
      upsertMeta(COMPUTER_USE_META_KEYS.STATE, MIGRATION_STATE.IN_PROGRESS);
      // Full replace: the legacy payload is the complete desired state.
      db.prepare("DELETE FROM computer_use_preferences").run();
      for (const [key, value] of Object.entries(normalized.records)) {
        if (!COMPUTER_USE_PREF_KEYS.includes(key)) {
          droppedEntries += 1;
          continue;
        }
        const record = validateComputerUsePreferenceValue(key, value);
        if (!record) {
          droppedEntries += 1;
          continue;
        }
        upsertComputerUsePreferenceRow(key, record, migratedAt);
        importedKeys.push(key);
      }
      upsertMeta(
        COMPUTER_USE_META_KEYS.VERSION,
        SUPPORTED_COMPUTER_USE_MIGRATION_VERSION,
      );
      upsertMeta(COMPUTER_USE_META_KEYS.DIGEST, digest);
      upsertMeta(COMPUTER_USE_META_KEYS.MIGRATED_AT, migratedAt);
      upsertMeta(COMPUTER_USE_META_KEYS.STATE, MIGRATION_STATE.COMPLETE);
    });
    if (droppedEntries > 0) {
      console.warn(
        `[settings-storage] computer-use migration dropped ${droppedEntries} ` +
          "invalid entrie(s)",
      );
    }
    return {
      status: "complete",
      ok: true,
      digest,
      migratedAt,
      importedKeys,
      droppedEntries,
    };
  };

  // before-quit hook. WAL makes per-transaction durability sufficient — this
  // just releases the connection cleanly. Idempotent.
  const close = () => {
    if (!db) return;
    db.close();
    db = null;
  };

  return {
    init,
    getBootstrapSnapshot,
    setNamespace,
    deleteNamespace,
    migrateLegacy,
    appendTokenUsage,
    queryTokenUsage,
    clearTokenUsage,
    migrateLegacyTokenUsage,
    readDefaultToolkits,
    replaceDefaultToolkitsScope,
    migrateLegacyDefaultToolkits,
    readToolkitAutoApprove,
    replaceToolkitAutoApprove,
    migrateLegacyToolkitAutoApprove,
    readComputerUsePreferences,
    setComputerUsePreference,
    clearComputerUsePreference,
    migrateLegacyComputerUse,
    close,
  };
};

module.exports = {
  createSettingsStorageService,
  computeLegacyMigrationDigest,
  SETTINGS_STORAGE_LIMITS,
  TOKEN_USAGE_LIMITS,
  TOOLKIT_PREFS_LIMITS,
  COMPUTER_USE_LIMITS,
  COMPUTER_USE_PREF_KEYS,
  SENSITIVE_MODEL_PROVIDER_KEYS,
};

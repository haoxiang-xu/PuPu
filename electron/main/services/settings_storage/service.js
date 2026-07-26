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
// Phase 4 (S1) adds the provider_credentials table as a pure additive
// `CREATE TABLE IF NOT EXISTS` increment — same judgement as S2/S3/Phase 3,
// a new table does NOT bump SCHEMA_VERSION.
const SCHEMA_VERSION = 2;
const SETTINGS_ROW_SCHEMA_VERSION = 1;
const SUPPORTED_LEGACY_MIGRATION_VERSION = 1;
const SUPPORTED_TOKEN_USAGE_MIGRATION_VERSION = 1;
const SUPPORTED_TOOLKIT_PREFS_MIGRATION_VERSION = 1;
const SUPPORTED_COMPUTER_USE_MIGRATION_VERSION = 1;
const SUPPORTED_MCP_ICONS_MIGRATION_VERSION = 1;
// Phase 4 (S2): the provider-secret migration envelope version. Bumped only if
// the legacy→ciphertext migration contract changes shape.
const SUPPORTED_PROVIDER_CREDENTIALS_MIGRATION_VERSION = 1;

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

// Custom MCP icon asset store (plan §3.6). Icons are stored as FILES under
// userData/assets/mcp-icons; the asset_metadata table keeps only the metadata.
// The renderer never gets icon bytes in the bootstrap snapshot (they can be
// large) — it reads them on demand through the mcp-icon IPC channels.
//
// Content encoding is mime-dependent and MUST round-trip losslessly, because
// the renderer's ToolkitIcon reads png content as base64 but svg content as
// RAW UTF-8 text (src/COMPONENTs/toolkit/components/toolkit_icon.js). The file
// on disk always holds the decoded bytes; getMcpIconAsset re-encodes per mime
// so the returned `content` is byte-identical to what was stored.
const MCP_ICON_ASSET_OWNER_TYPE = "mcp_icon";
const MCP_ICON_MIME_EXT = Object.freeze({
  "image/png": "png",
  "image/svg+xml": "svg",
});
const MCP_ICON_LIMITS = Object.freeze({
  MAX_ENTRIES: 100, // mirrors the legacy MAX_ENTRIES cap
  // Decoded-byte ceiling: the legacy store capped content STRING length at
  // 400_000 (base64 for png, raw text for svg). 400_000 base64 chars decode to
  // ~300_000 bytes, so this decoded-byte cap is the equivalent-or-stricter
  // bound the plan §3.6 asks for, applied uniformly to the on-disk file size.
  MAX_DECODED_BYTES: 300_000,
  OWNER_ID_MAX_LENGTH: 200, // toolkit id length cap
  SANITIZED_FILENAME_MAX_LENGTH: 60, // sanitized-id prefix cap (plan §3.6)
});
// The assets directory lives under userData, split into path segments so the
// service joins them with the platform separator.
const MCP_ICONS_ASSETS_SEGMENTS = Object.freeze(["assets", "mcp-icons"]);
// Filename charset (plan §3.6): the sanitized toolkit-id prefix keeps only
// these characters; everything else becomes "_". The extension is decided by
// the validated mime — NEVER by user input.
// eslint-disable-next-line no-useless-escape
const MCP_ICON_FILENAME_SAFE_PATTERN = /[^a-z0-9._-]/g;
// Strict base64 (png content). Whitespace is stripped before the test.
const MCP_ICON_BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

// Per-store migration meta for the custom MCP icon store (plan §3.6). Same
// four-key state machine as the other Phase 2/3 stores.
const MCP_ICONS_META_KEYS = Object.freeze({
  STATE: "mcp_icons_migration_state",
  VERSION: "mcp_icons_migration_version",
  DIGEST: "mcp_icons_migration_digest",
  MIGRATED_AT: "mcp_icons_migrated_at",
});

// Secrets never enter the settings table or the bootstrap snapshot
// (plan §3.7 / Phase 1B completion bar). Stripped on write AND on read.
const SENSITIVE_MODEL_PROVIDER_KEYS = Object.freeze([
  "openai_api_key",
  "anthropic_api_key",
  "custom_provider_secrets",
]);
const MODEL_PROVIDERS_NAMESPACE = "model_providers";

// ---- Phase 4 (S1): provider credential ciphertext store ------------------
// (plan §3.7, phase4-cto-adr §3.4/S1, phase4-security-decision §3 gate 3.)
// Provider API keys live ENCRYPTED (Electron safeStorage BLOB) in a DEDICATED
// table — NEVER in the `settings` table, NEVER in the bootstrap snapshot,
// NEVER logged. Plaintext exists only transiently inside setProviderCredential
// (encrypt) and readDecryptedProviderSecret (decrypt — the narrow S4 injection
// seam, a main-internal method that is NEVER exposed over any IPC channel).
const PROVIDER_CREDENTIAL_KINDS = Object.freeze([
  "provider", // owner_id = "openai" | "anthropic"
  "custom_provider", // owner_id = "custom.<slug>"
]);
const PROVIDER_CREDENTIAL_LIMITS = Object.freeze({
  OWNER_ID_MAX_LENGTH: 200,
});
const SECRET_STORAGE_STATUS = Object.freeze({
  AVAILABLE: "available",
  UNAVAILABLE: "unavailable",
});
// Gate 3 (phase4-security-decision §3): on Linux, safeStorage is only trusted
// when the selected backend is a real OS keyring. `basic_text` (Electron's
// hardcoded-password fallback) and `unknown` are REFUSED — we never fall back
// to plaintext encryption and never call setUsePlainTextEncryption().
const SAFE_SECRET_STORAGE_LINUX_BACKENDS = Object.freeze(
  new Set(["gnome_libsecret", "kwallet", "kwallet5", "kwallet6"]),
);

// Per-store migration meta for the Phase 4 (S2) provider-secret migration
// (gate 4). Same four-key state machine as the other per-store migrations. The
// DIGEST here is computed over the credential IDENTITY set only (which
// providers/slugs are present) — NEVER over secret plaintext — so no
// secret-derived material is ever persisted to the meta table.
const PROVIDER_CREDENTIALS_META_KEYS = Object.freeze({
  STATE: "provider_credentials_migration_state",
  VERSION: "provider_credentials_migration_version",
  DIGEST: "provider_credentials_migration_digest",
  MIGRATED_AT: "provider_credentials_migrated_at",
});

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

CREATE TABLE IF NOT EXISTS asset_metadata (
  asset_id       TEXT PRIMARY KEY,
  owner_type     TEXT NOT NULL,
  owner_id       TEXT NOT NULL,
  relative_path  TEXT NOT NULL,
  mime_type      TEXT NOT NULL,
  byte_size      INTEGER NOT NULL,
  sha256         TEXT NOT NULL,
  updated_at     INTEGER NOT NULL,
  UNIQUE(owner_type, owner_id)
);

CREATE TABLE IF NOT EXISTS provider_credentials (
  credential_kind TEXT NOT NULL,
  owner_id        TEXT NOT NULL,
  ciphertext      BLOB NOT NULL,
  updated_at      INTEGER NOT NULL,
  PRIMARY KEY (credential_kind, owner_id)
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

// ---- custom MCP icon asset helpers (plan §3.6) ---------------------------
// Pure functions (no db/fs) — the file/SQL orchestration lives in the service
// closure below where fs/path/app are in scope.

const sha256Hex = (buffer) =>
  crypto.createHash("sha256").update(buffer).digest("hex");

// A stable per-owner asset_id (opaque, bounded). Derived only from the owner
// identity, so re-setting an owner's icon keeps the same primary key. The ":"
// separator is safe (owner_type is a fixed literal with no colon).
const mcpIconAssetId = (ownerId) =>
  sha256Hex(Buffer.from(`${MCP_ICON_ASSET_OWNER_TYPE}:${ownerId}`, "utf8"));

// Sanitize a toolkit id into the filename prefix: keep only the plan §3.6
// charset, replace the rest with "_", cap the length. Never trusted for
// directory structure — the resolved path is re-checked against the assets dir.
const sanitizeToolkitIdForFilename = (ownerId) => {
  const cleaned = String(ownerId)
    .replace(MCP_ICON_FILENAME_SAFE_PATTERN, "_")
    .slice(0, MCP_ICON_LIMITS.SANITIZED_FILENAME_MAX_LENGTH);
  return cleaned.length > 0 ? cleaned : "icon";
};

// Build the on-disk filename for an owner's icon. It embeds a short hash of the
// FULL owner id (guarantees distinct owners never collide on one file, even if
// their sanitized prefixes match — so deletes never orphan another owner's
// row: the plan's "不共享/各自文件" recommendation, made robust) plus a content
// hash (a content change yields a new filename, enabling write-new→rename→
// delete-old atomic replacement). The extension comes from the validated mime.
const buildMcpIconFilename = (ownerId, contentBytes, ext) => {
  const prefix = sanitizeToolkitIdForFilename(ownerId);
  const ownerHash = sha256Hex(Buffer.from(String(ownerId), "utf8")).slice(0, 8);
  const contentHash = sha256Hex(contentBytes).slice(0, 16);
  return `${prefix}-${ownerHash}-${contentHash}.${ext}`;
};

// Decode a renderer icon `content` into the on-disk bytes for its mime, or null
// when it cannot be represented. png content is base64 (strict-validated then
// round-trip-checked so lenient garbage is rejected); svg content is raw UTF-8
// text stored verbatim.
const decodeMcpIconBytes = (mime, content) => {
  if (typeof content !== "string" || content.length === 0) return null;
  if (mime === "image/png") {
    const compact = content.replace(/\s+/g, "");
    if (
      compact.length === 0 ||
      compact.length % 4 !== 0 ||
      !MCP_ICON_BASE64_PATTERN.test(compact)
    ) {
      return null;
    }
    const bytes = Buffer.from(compact, "base64");
    // Round-trip guard: Buffer's base64 decode is lenient, so re-encode and
    // require the canonical form to match the input — rejects malformed base64.
    if (bytes.length === 0 || bytes.toString("base64") !== compact) return null;
    return bytes;
  }
  if (mime === "image/svg+xml") {
    const bytes = Buffer.from(content, "utf8");
    return bytes.length > 0 ? bytes : null;
  }
  return null;
};

// Re-encode on-disk bytes back into the renderer `content` for its mime
// (inverse of decodeMcpIconBytes): png → base64, svg → raw UTF-8 text.
const encodeMcpIconContent = (mime, bytes) => {
  if (mime === "image/svg+xml") return bytes.toString("utf8");
  return bytes.toString("base64");
};

const createSettingsStorageService = ({
  app,
  fs,
  path,
  sqlite,
  // Phase 4 (S1): Electron's safeStorage, injected from index.js. OPTIONAL so
  // every pre-Phase-4 construction (and the existing test fleet) keeps working
  // — when absent the secret-storage subsystem simply reports "unavailable" and
  // every credential write fails closed (never plaintext).
  safeStorage,
  // Injected only for testability of the Linux gate-3 branch; defaults to the
  // real host platform. index.js never passes it.
  platform,
} = {}) => {
  if (!app || !fs || !path || !sqlite) {
    throw new Error("createSettingsStorageService: missing dependencies");
  }
  const resolvedPlatform =
    typeof platform === "string" && platform.length > 0
      ? platform
      : process.platform;

  let db = null;
  let dbPath = null;
  let degradedReason = null;
  // Absolute path to userData/assets/mcp-icons, set in init(). The directory is
  // created lazily on the first icon write (keeps init lean + degraded-safe).
  let mcpIconsDir = null;
  // Phase 4 (S1): whether encrypted provider-credential storage is usable on
  // this machine (gate 3). Set in init() by probeSecretStorage(); stays
  // "unavailable" until a successful probe. Never plaintext, never a key.
  let secretStorageStatus = SECRET_STORAGE_STATUS.UNAVAILABLE;

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

  // ---- Phase 4 (S1): safeStorage availability probe (gate 3) ---------------
  // Returns "available" only when safeStorage is genuinely usable:
  //   available === true AND (non-Linux OR Linux with a real keyring backend).
  // Explicitly refuses `basic_text`/`unknown` on Linux. NEVER calls
  // setUsePlainTextEncryption. Any thrown probe error → "unavailable"
  // (fail closed — an unusable probe must never be read as usable).
  const probeSecretStorage = () => {
    if (
      !safeStorage ||
      typeof safeStorage.isEncryptionAvailable !== "function"
    ) {
      return SECRET_STORAGE_STATUS.UNAVAILABLE;
    }
    let available = false;
    try {
      available = safeStorage.isEncryptionAvailable() === true;
    } catch (_error) {
      return SECRET_STORAGE_STATUS.UNAVAILABLE;
    }
    if (!available) return SECRET_STORAGE_STATUS.UNAVAILABLE;
    if (resolvedPlatform === "linux") {
      let backend = null;
      try {
        backend =
          typeof safeStorage.getSelectedStorageBackend === "function"
            ? safeStorage.getSelectedStorageBackend()
            : null;
      } catch (_error) {
        return SECRET_STORAGE_STATUS.UNAVAILABLE;
      }
      if (!SAFE_SECRET_STORAGE_LINUX_BACKENDS.has(backend)) {
        return SECRET_STORAGE_STATUS.UNAVAILABLE;
      }
    }
    return SECRET_STORAGE_STATUS.AVAILABLE;
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
      mcpIconsDir = path.join(userDataDir, ...MCP_ICONS_ASSETS_SEGMENTS);
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
      // Gate 3: probe encrypted-credential storage now that app is ready (the
      // caller runs init() inside app.whenReady()). No secret is touched here —
      // only the boolean availability of the OS keyring is inspected.
      secretStorageStatus = probeSecretStorage();
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
      secretStorageStatus = SECRET_STORAGE_STATUS.UNAVAILABLE;
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
        // Phase 3: only the icon migration META rides the snapshot — the icon
        // CONTENT is read on demand (getMcpIconAsset), never bootstrapped.
        mcpIcons: getStoreMigrationMetaFor(MCP_ICONS_META_KEYS),
        // Phase 4 (S7): the provider-credentials migration META lets the
        // renderer's migration trigger (provider_secret_migration.js) skip a
        // re-migration once SQL is complete. Identity-only, like every other
        // per-store meta here — NEVER a secret value or ciphertext. Because
        // legacy secrets are kept under dual-keep (never deleted in release N),
        // this meta is the sole across-boot idempotency signal: without it the
        // trigger would re-fire every launch.
        providerCredentials: getProviderCredentialsMigrationMeta(),
      };
    } catch (error) {
      console.warn(
        "[settings-storage] store migration meta unavailable in bootstrap:",
        error.code || error.message,
      );
      storeMigrations = undefined;
    }
    // Phase 4 (S3): the non-sensitive provider-credential existence signal.
    // configuredCredentials is the IDENTITY list (owner ids: "openai" |
    // "anthropic" | "custom.<slug>") of rows present in the
    // provider_credentials table — NEVER a secret value, NEVER ciphertext
    // (gate 7 red line #2). The renderer combines it with the legacy dual-keep
    // signal to decide whether descriptor-only secret injection (S4/S5) is
    // authoritative for a given provider. Failure-isolated like the sections
    // above (§7.3): a listing error yields [] so the renderer safely falls
    // back to the legacy secret path rather than losing the ability to inject.
    let configuredCredentials;
    try {
      configuredCredentials = listProviderCredentialOwners().owners.map(
        (owner) => owner.ownerId,
      );
    } catch (error) {
      console.warn(
        "[settings-storage] provider credential signal unavailable in bootstrap:",
        error.code || error.message,
      );
      configuredCredentials = [];
    }
    return {
      available: true,
      degraded: false,
      schemaVersion: schemaVersion === undefined ? SCHEMA_VERSION : schemaVersion,
      migration: getMigrationMeta(),
      namespaces,
      revisions,
      // Phase 4 (S3): safeStorage availability from the gate-3 probe plus the
      // non-sensitive configured-credential identity list. Both let the
      // renderer gate the S5 descriptor-injection path; no secret value or
      // ciphertext ever crosses this boundary.
      secretStorageStatus,
      configuredCredentials,
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

  // ---- Phase 3: custom MCP icon asset store (plan §3.6) --------------------
  // Icons live as files under userData/assets/mcp-icons; asset_metadata holds
  // only the metadata. The write order (write new file → upsert SQL → delete
  // old file) is recoverable: on SQL failure the just-written new file is
  // removed, so SQL is NEVER left pointing at a missing file and no orphan file
  // is left behind. Reads self-heal: a missing file drops the SQL row.

  const ensureMcpIconsDir = () => {
    if (!mcpIconsDir) {
      throw errorWithCode(
        "settings storage service used before init()",
        "settings_storage_unavailable",
      );
    }
    fs.mkdirSync(mcpIconsDir, { recursive: true });
    return mcpIconsDir;
  };

  // Resolve a stored relative filename to an absolute path and REJECT anything
  // that escapes the assets directory (defense in depth — the filename is
  // generated, but a hostile/corrupt stored relative_path must never traverse).
  const resolveMcpIconPath = (relativePath) => {
    if (!mcpIconsDir) {
      throw errorWithCode(
        "settings storage service used before init()",
        "settings_storage_unavailable",
      );
    }
    if (typeof relativePath !== "string" || relativePath.length === 0) {
      throw errorWithCode(
        "mcp-icon: relative path must be a non-empty string",
        "invalid_mcp_icon_path",
      );
    }
    const abs = path.resolve(mcpIconsDir, relativePath);
    const rel = path.relative(mcpIconsDir, abs);
    if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
      throw errorWithCode(
        "mcp-icon: resolved path escapes the assets directory",
        "invalid_mcp_icon_path",
      );
    }
    return abs;
  };

  // Clean/validate the owner id (the custom toolkit id). Throws on direct
  // writes (the renderer only ever sends mcp.custom.* ids — a violation is a
  // bug, never data); returns null for reads/migration so they can skip it.
  const cleanMcpIconOwnerId = (ownerId, { throwOnInvalid = true } = {}) => {
    const trimmed = typeof ownerId === "string" ? ownerId.trim() : "";
    if (
      !trimmed ||
      trimmed.length > MCP_ICON_LIMITS.OWNER_ID_MAX_LENGTH ||
      trimmed === "__proto__"
    ) {
      if (throwOnInvalid) {
        throw errorWithCode(
          "mcp-icon: toolkitId must be a non-empty string within " +
            `${MCP_ICON_LIMITS.OWNER_ID_MAX_LENGTH} characters`,
          "invalid_mcp_icon",
        );
      }
      return null;
    }
    return trimmed;
  };

  const safeUnlinkMcpIconFile = (relativePath) => {
    try {
      const abs = resolveMcpIconPath(relativePath);
      fs.unlinkSync(abs);
    } catch (error) {
      if (error && error.code === "ENOENT") return;
      // A file-delete failure is not fatal: the SQL row is already gone (delete
      // path) or replaced (set path), so nothing dangles. Warn with code only.
      console.warn(
        "[settings-storage] mcp-icon file unlink failed:",
        (error && error.code) || "unlink-failed",
      );
    }
  };

  // Atomically write bytes to absPath via a unique temp file + rename.
  const atomicWriteMcpIconFile = (absPath, bytes) => {
    const tmpPath =
      `${absPath}.tmp-${process.pid}-${Date.now()}-` +
      Math.random().toString(36).slice(2);
    try {
      fs.writeFileSync(tmpPath, bytes);
      fs.renameSync(tmpPath, absPath);
    } catch (error) {
      try {
        fs.unlinkSync(tmpPath);
      } catch (_cleanupError) {
        // temp file may not exist; surface the original error
      }
      throw error;
    }
  };

  // Decode + validate an icon value (mime + content) into { bytes, mime, ext,
  // sha }. Throws on direct writes; the migration path calls the underlying
  // helpers directly so it can drop-and-count instead.
  const validateMcpIconValue = (value) => {
    const mime = isPlainObject(value) ? value.mime : undefined;
    const content = isPlainObject(value) ? value.content : undefined;
    if (!MCP_ICON_MIME_EXT[mime]) {
      throw errorWithCode(
        "mcp-icon: mime must be image/png or image/svg+xml",
        "invalid_mcp_icon",
      );
    }
    const bytes = decodeMcpIconBytes(mime, content);
    if (!bytes) {
      throw errorWithCode(
        "mcp-icon: content is not decodable for its mime",
        "invalid_mcp_icon",
      );
    }
    if (bytes.length > MCP_ICON_LIMITS.MAX_DECODED_BYTES) {
      throw errorWithCode(
        `mcp-icon: decoded size exceeds ${MCP_ICON_LIMITS.MAX_DECODED_BYTES} bytes`,
        "mcp_icon_too_large",
      );
    }
    return { bytes, mime, ext: MCP_ICON_MIME_EXT[mime], sha: sha256Hex(bytes) };
  };

  const readMcpIconOwnerRow = (ownerId) =>
    requireDb()
      .prepare(
        "SELECT asset_id, relative_path FROM asset_metadata " +
          "WHERE owner_type = ? AND owner_id = ?",
      )
      .get(MCP_ICON_ASSET_OWNER_TYPE, ownerId);

  const countMcpIconOwners = () =>
    Number(
      requireDb()
        .prepare(
          "SELECT COUNT(*) AS c FROM asset_metadata WHERE owner_type = ?",
        )
        .get(MCP_ICON_ASSET_OWNER_TYPE).c,
    );

  const setMcpIconAsset = (toolkitId, value) => {
    requireDb();
    const ownerId = cleanMcpIconOwnerId(toolkitId);
    const { bytes, mime, ext, sha } = validateMcpIconValue(value);
    const filename = buildMcpIconFilename(ownerId, bytes, ext);
    const absPath = resolveMcpIconPath(filename);
    const updatedAt = Date.now();

    const existing = readMcpIconOwnerRow(ownerId);
    // Entry cap: only counts against a NEW owner (a re-set replaces in place).
    if (!existing && countMcpIconOwners() >= MCP_ICON_LIMITS.MAX_ENTRIES) {
      throw errorWithCode(
        `mcp-icon: entry cap of ${MCP_ICON_LIMITS.MAX_ENTRIES} reached`,
        "mcp_icon_cap_reached",
      );
    }
    const oldRelativePath = existing ? existing.relative_path : null;

    ensureMcpIconsDir();
    // 1. Write the new file first.
    atomicWriteMcpIconFile(absPath, bytes);
    // 2. Upsert SQL. On failure, remove the new file so SQL never points at a
    //    missing file and no orphan file is left behind — BUT only when the
    //    file we wrote is a fresh one. When identical content is re-set for an
    //    existing owner, buildMcpIconFilename is deterministic so filename ===
    //    oldRelativePath: the surviving (rolled-back) row still references that
    //    file, so unlinking it would strand the row and destroy a valid icon.
    //    Mirror the migration path's `keep = oldRelativePaths` guard.
    try {
      db.tx(() => {
        db.prepare(
          "INSERT INTO asset_metadata(asset_id, owner_type, owner_id, " +
            "relative_path, mime_type, byte_size, sha256, updated_at) " +
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?) " +
            "ON CONFLICT(owner_type, owner_id) DO UPDATE SET " +
            "asset_id = excluded.asset_id, " +
            "relative_path = excluded.relative_path, " +
            "mime_type = excluded.mime_type, " +
            "byte_size = excluded.byte_size, " +
            "sha256 = excluded.sha256, " +
            "updated_at = excluded.updated_at",
        ).run(
          mcpIconAssetId(ownerId),
          MCP_ICON_ASSET_OWNER_TYPE,
          ownerId,
          filename,
          mime,
          bytes.length,
          sha,
          updatedAt,
        );
      });
    } catch (error) {
      if (filename !== oldRelativePath) safeUnlinkMcpIconFile(filename);
      throw error;
    }
    // 3. Delete the previous file if the content (hence filename) changed.
    if (oldRelativePath && oldRelativePath !== filename) {
      safeUnlinkMcpIconFile(oldRelativePath);
    }
    return {
      ok: true,
      toolkitId: ownerId,
      relativePath: filename,
      mime,
      byteSize: bytes.length,
      sha256: sha,
    };
  };

  const getMcpIconAsset = (toolkitId) => {
    requireDb();
    const ownerId = cleanMcpIconOwnerId(toolkitId, { throwOnInvalid: false });
    if (!ownerId) return { ok: true, icon: null };
    const row = requireDb()
      .prepare(
        "SELECT relative_path, mime_type FROM asset_metadata " +
          "WHERE owner_type = ? AND owner_id = ?",
      )
      .get(MCP_ICON_ASSET_OWNER_TYPE, ownerId);
    if (!row) return { ok: true, icon: null };
    let absPath;
    try {
      absPath = resolveMcpIconPath(row.relative_path);
    } catch (_error) {
      // Corrupt/hostile stored path → self-heal by dropping the row.
      db.prepare(
        "DELETE FROM asset_metadata WHERE owner_type = ? AND owner_id = ?",
      ).run(MCP_ICON_ASSET_OWNER_TYPE, ownerId);
      return { ok: true, icon: null };
    }
    let bytes;
    try {
      bytes = fs.readFileSync(absPath);
    } catch (_error) {
      // File missing → self-heal: the SQL row must never outlive its file.
      db.prepare(
        "DELETE FROM asset_metadata WHERE owner_type = ? AND owner_id = ?",
      ).run(MCP_ICON_ASSET_OWNER_TYPE, ownerId);
      return { ok: true, icon: null };
    }
    return {
      ok: true,
      icon: {
        mime: row.mime_type,
        content: encodeMcpIconContent(row.mime_type, bytes),
      },
    };
  };

  const deleteMcpIconAsset = (toolkitId) => {
    requireDb();
    const ownerId = cleanMcpIconOwnerId(toolkitId, { throwOnInvalid: false });
    if (!ownerId) return { ok: true, deleted: false };
    const row = readMcpIconOwnerRow(ownerId);
    // SQL first, then the file (plan §3.6): once the row is gone nothing
    // dangles, so a subsequent file-delete failure only warns.
    const result = db
      .prepare(
        "DELETE FROM asset_metadata WHERE owner_type = ? AND owner_id = ?",
      )
      .run(MCP_ICON_ASSET_OWNER_TYPE, ownerId);
    if (row && row.relative_path) {
      safeUnlinkMcpIconFile(row.relative_path);
    }
    return { ok: true, deleted: Number(result.changes) > 0 };
  };

  const listMcpIconOwners = () => {
    requireDb();
    const rows = db
      .prepare(
        "SELECT owner_id, mime_type, byte_size, sha256, updated_at " +
          "FROM asset_metadata WHERE owner_type = ? " +
          "ORDER BY updated_at ASC, owner_id ASC",
      )
      .all(MCP_ICON_ASSET_OWNER_TYPE);
    return {
      ok: true,
      owners: rows.map((row) => ({
        toolkitId: row.owner_id,
        mime: row.mime_type,
        byteSize: Number(row.byte_size),
        sha256: row.sha256,
        updatedAt: Number(row.updated_at),
      })),
    };
  };

  // Per-store legacy import (plan §3.6). Drop-and-count like the toolkit prefs:
  // an invalid entry (bad mime / undecodable / oversize / bad id) is discarded
  // with a count-only diagnostic — an icon is a display asset, "宁缺勿滥". Files
  // are written BEFORE the SQL transaction; on any failure the files written
  // this run are removed (and db.tx rolls the rows back). A full replace means
  // any pre-existing files not re-referenced are unlinked after commit.
  const migrateMcpIconsLegacy = (payload) => {
    requireDb();
    const label = "mcp-icons-migrate-legacy";
    const { normalized, digest } = normalizeStoreMigrationEnvelope(
      payload,
      label,
      SUPPORTED_MCP_ICONS_MIGRATION_VERSION,
    );
    if (!isPlainObject(normalized.icons)) {
      throw errorWithCode(
        `${label}: icons must be an object`,
        "invalid_migration_payload",
      );
    }
    const completed = resolveCompletedStoreMigration(
      MCP_ICONS_META_KEYS,
      digest,
      SUPPORTED_MCP_ICONS_MIGRATION_VERSION,
    );
    if (completed) return completed;

    const migratedAt = Date.now();
    let droppedEntries = 0;
    const toInsert = [];
    const writtenFiles = [];
    // Pre-existing files (unlinked after a successful full-replace commit).
    const oldRelativePaths = db
      .prepare("SELECT relative_path FROM asset_metadata WHERE owner_type = ?")
      .all(MCP_ICON_ASSET_OWNER_TYPE)
      .map((row) => row.relative_path);

    try {
      ensureMcpIconsDir();
      for (const [rawId, value] of Object.entries(normalized.icons)) {
        const ownerId = cleanMcpIconOwnerId(rawId, { throwOnInvalid: false });
        const mime = isPlainObject(value) ? value.mime : undefined;
        const content = isPlainObject(value) ? value.content : undefined;
        if (!ownerId || !MCP_ICON_MIME_EXT[mime]) {
          droppedEntries += 1;
          continue;
        }
        const bytes = decodeMcpIconBytes(mime, content);
        if (!bytes || bytes.length > MCP_ICON_LIMITS.MAX_DECODED_BYTES) {
          droppedEntries += 1;
          continue;
        }
        if (toInsert.length >= MCP_ICON_LIMITS.MAX_ENTRIES) {
          droppedEntries += 1;
          continue;
        }
        const ext = MCP_ICON_MIME_EXT[mime];
        const filename = buildMcpIconFilename(ownerId, bytes, ext);
        const absPath = resolveMcpIconPath(filename);
        atomicWriteMcpIconFile(absPath, bytes);
        writtenFiles.push(filename);
        toInsert.push({
          ownerId,
          filename,
          mime,
          byteSize: bytes.length,
          sha: sha256Hex(bytes),
        });
      }
      db.tx(() => {
        upsertMeta(MCP_ICONS_META_KEYS.STATE, MIGRATION_STATE.IN_PROGRESS);
        // Full replace: the legacy payload is the complete desired state.
        db.prepare(
          "DELETE FROM asset_metadata WHERE owner_type = ?",
        ).run(MCP_ICON_ASSET_OWNER_TYPE);
        for (const entry of toInsert) {
          db.prepare(
            "INSERT INTO asset_metadata(asset_id, owner_type, owner_id, " +
              "relative_path, mime_type, byte_size, sha256, updated_at) " +
              "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          ).run(
            mcpIconAssetId(entry.ownerId),
            MCP_ICON_ASSET_OWNER_TYPE,
            entry.ownerId,
            entry.filename,
            entry.mime,
            entry.byteSize,
            entry.sha,
            migratedAt,
          );
        }
        upsertMeta(
          MCP_ICONS_META_KEYS.VERSION,
          SUPPORTED_MCP_ICONS_MIGRATION_VERSION,
        );
        upsertMeta(MCP_ICONS_META_KEYS.DIGEST, digest);
        upsertMeta(MCP_ICONS_META_KEYS.MIGRATED_AT, migratedAt);
        upsertMeta(MCP_ICONS_META_KEYS.STATE, MIGRATION_STATE.COMPLETE);
      });
    } catch (error) {
      // Roll back the files written this run (db.tx already rolled the rows).
      const keep = new Set(oldRelativePaths);
      for (const filename of writtenFiles) {
        if (!keep.has(filename)) safeUnlinkMcpIconFile(filename);
      }
      throw error;
    }
    // Commit succeeded: unlink pre-existing files no longer referenced.
    const referenced = new Set(toInsert.map((entry) => entry.filename));
    for (const relativePath of oldRelativePaths) {
      if (!referenced.has(relativePath)) safeUnlinkMcpIconFile(relativePath);
    }
    if (droppedEntries > 0) {
      console.warn(
        `[settings-storage] mcp-icons migration dropped ${droppedEntries} ` +
          "invalid entrie(s)",
      );
    }
    return {
      status: "complete",
      ok: true,
      digest,
      migratedAt,
      importedCount: toInsert.length,
      droppedEntries,
    };
  };

  // ---- Phase 4 (S1): provider credential ciphertext store ------------------
  // ALL methods below are MAIN-INTERNAL. readDecryptedProviderSecret is the
  // narrow seam S4 uses at the POST-to-Flask choke point; it — and none of
  // these — is ever placed on any IPC allowlist / bridge / channel.

  // Shared shape gate for (kind, ownerId). Throws [invalid_credential];
  // messages carry the kind/ownerId identity only — never a secret value.
  const validateCredentialTarget = (kind, ownerId) => {
    if (!PROVIDER_CREDENTIAL_KINDS.includes(kind)) {
      throw errorWithCode(
        `invalid credential kind: must be one of ${PROVIDER_CREDENTIAL_KINDS.join(
          ", ",
        )}`,
        "invalid_credential",
      );
    }
    if (
      typeof ownerId !== "string" ||
      ownerId.length === 0 ||
      ownerId.length > PROVIDER_CREDENTIAL_LIMITS.OWNER_ID_MAX_LENGTH ||
      // "__proto__" would assign through the inherited Object.prototype accessor
      // on any plain-object map built from listProviderCredentialOwners.
      ownerId === "__proto__"
    ) {
      throw errorWithCode(
        "invalid credential ownerId: must be a non-empty string within " +
          `${PROVIDER_CREDENTIAL_LIMITS.OWNER_ID_MAX_LENGTH} chars`,
        "invalid_credential",
      );
    }
  };

  // Encrypt + upsert a provider secret. Fails closed when secret storage is
  // unavailable (gate 3) — NEVER writes plaintext. The plaintext argument is
  // encrypted immediately and never logged / never returned.
  const setProviderCredential = (kind, ownerId, plaintext) => {
    requireDb();
    validateCredentialTarget(kind, ownerId);
    if (typeof plaintext !== "string" || plaintext.length === 0) {
      throw errorWithCode(
        "provider credential value must be a non-empty string",
        "invalid_credential",
      );
    }
    if (secretStorageStatus !== SECRET_STORAGE_STATUS.AVAILABLE) {
      throw errorWithCode(
        "encrypted credential storage is unavailable on this machine",
        "secret_storage_unavailable",
      );
    }
    let ciphertext;
    try {
      ciphertext = safeStorage.encryptString(plaintext);
    } catch (_error) {
      // Never surface the plaintext or the underlying crypto error detail.
      throw errorWithCode(
        "failed to encrypt provider credential",
        "secret_storage_unavailable",
      );
    }
    const updatedAt = Date.now();
    return db.tx(() => {
      db.prepare(
        "INSERT INTO provider_credentials(credential_kind, owner_id, ciphertext, updated_at) " +
          "VALUES (?, ?, ?, ?) " +
          "ON CONFLICT(credential_kind, owner_id) DO UPDATE SET " +
          "ciphertext = excluded.ciphertext, updated_at = excluded.updated_at",
      ).run(kind, ownerId, ciphertext, updatedAt);
      return { ok: true, kind, ownerId, updatedAt };
    });
  };

  // The narrow S4 injection seam. Decrypt a single credential to plaintext, or
  // null when there is no row / storage is unavailable / decryption fails. This
  // NEVER throws — a failed decrypt is read as "no key" (fail-closed read), so
  // the send-time assembly chain can never be crashed by it.
  const readDecryptedProviderSecret = (kind, ownerId) => {
    if (!db) return null;
    if (secretStorageStatus !== SECRET_STORAGE_STATUS.AVAILABLE) return null;
    if (
      !PROVIDER_CREDENTIAL_KINDS.includes(kind) ||
      typeof ownerId !== "string" ||
      ownerId.length === 0
    ) {
      return null;
    }
    let row;
    try {
      row = db
        .prepare(
          "SELECT ciphertext FROM provider_credentials " +
            "WHERE credential_kind = ? AND owner_id = ?",
        )
        .get(kind, ownerId);
    } catch (_error) {
      return null;
    }
    if (!row || row.ciphertext == null) return null;
    try {
      const plaintext = safeStorage.decryptString(Buffer.from(row.ciphertext));
      return typeof plaintext === "string" && plaintext.length > 0
        ? plaintext
        : null;
    } catch (_error) {
      return null;
    }
  };

  // Delete a credential row. Cleanup path — works regardless of secret storage
  // availability (an unavailable machine may still need to drop a stale row).
  const deleteProviderCredential = (kind, ownerId) => {
    requireDb();
    validateCredentialTarget(kind, ownerId);
    const result = db
      .prepare(
        "DELETE FROM provider_credentials WHERE credential_kind = ? AND owner_id = ?",
      )
      .run(kind, ownerId);
    return { ok: true, kind, ownerId, deleted: Number(result.changes) > 0 };
  };

  // Existence check — NEVER decrypts. Used by higher slices for gating.
  const hasProviderCredential = (kind, ownerId) => {
    requireDb();
    validateCredentialTarget(kind, ownerId);
    const row = db
      .prepare(
        "SELECT 1 AS present FROM provider_credentials " +
          "WHERE credential_kind = ? AND owner_id = ?",
      )
      .get(kind, ownerId);
    return { ok: true, kind, ownerId, present: !!row };
  };

  // Identity-only listing for S3's configuredCredentials signal: returns
  // { kind, ownerId, updatedAt } rows — NEVER the ciphertext, NEVER a secret.
  const listProviderCredentialOwners = () => {
    requireDb();
    const rows = db
      .prepare(
        "SELECT credential_kind, owner_id, updated_at FROM provider_credentials " +
          "ORDER BY credential_kind ASC, owner_id ASC",
      )
      .all();
    return {
      ok: true,
      owners: rows.map((row) => ({
        kind: row.credential_kind,
        ownerId: row.owner_id,
        updatedAt: Number(row.updated_at),
      })),
    };
  };

  const getSecretStorageStatus = () => secretStorageStatus;

  // Identity-only migration meta reader (S3 will ride this on the bootstrap
  // snapshot; kept main-internal here). Same shape as the other per-store
  // migration metas — never carries a secret or a ciphertext.
  const getProviderCredentialsMigrationMeta = () =>
    getStoreMigrationMetaFor(PROVIDER_CREDENTIALS_META_KEYS);

  // ---- Phase 4 (S2): provider secret migration + dual-keep + round-trip -----
  // (phase4-s2-brief, phase4-security-decision §3 gate 4, plan §11C per-store
  // protocol.) Moves the three legacy localStorage secrets (openai / anthropic
  // / custom.<slug>, passed IN as a payload — main cannot read renderer
  // localStorage) into the S1 ciphertext table.
  //
  //   * PER-CREDENTIAL judgement: each credential is encrypted, upserted and
  //     round-trip verified (readDecryptedProviderSecret === plaintext) INSIDE
  //     its own transaction. A failed round-trip rolls that one row back and
  //     leaves the credential on legacy — it is NOT counted complete, while the
  //     others still migrate (brief: "任一条往返失败 → 该条保留 legacy").
  //   * gate 3 fail-closed: secret storage unavailable → NO migration, legacy
  //     stays authoritative (zero regression). Never writes plaintext.
  //   * dual-keep: this method NEVER touches legacy localStorage (renderer-
  //     owned). After a complete migration legacy is kept as a read-only
  //     rollback mirror for release N; SQL ciphertext is always the read
  //     authority. Deleting legacy is an N+1 change, out of scope here.
  //   * idempotent replay: the digest over the credential IDENTITY set (never
  //     the secret values) drives resolveCompletedStoreMigration — a replay of
  //     an already-complete set is a no-op that writes nothing.
  //
  // SECRET DISCIPLINE: plaintext lives only transiently inside encrypt/verify;
  // it is never logged, never returned, and never hashed into persisted meta.
  const migrateProviderCredentials = (payload) => {
    const label = "provider-credentials-migrate";
    // gate 3: unavailable (or degraded db, which forces status unavailable) →
    // do not migrate. Legacy stays authoritative. This is a correct no-op, not
    // an error, so it returns a status rather than throwing.
    if (secretStorageStatus !== SECRET_STORAGE_STATUS.AVAILABLE) {
      return {
        status: "skipped-unavailable",
        secretStorageStatus,
        migratedCount: 0,
        failedCount: 0,
      };
    }
    requireDb();
    if (!isPlainObject(payload)) {
      throw errorWithCode(
        `${label}: payload must be an object`,
        "invalid_migration_payload",
      );
    }
    if (
      payload.migrationVersion !==
      SUPPORTED_PROVIDER_CREDENTIALS_MIGRATION_VERSION
    ) {
      throw errorWithCode(
        `${label}: unsupported migrationVersion`,
        "unsupported_migration_version",
      );
    }
    const credentials = isPlainObject(payload.credentials)
      ? payload.credentials
      : {};

    // Build the ordered target list (identity + plaintext). Only non-empty
    // string values are treated as a legacy secret worth migrating; anything
    // else is simply absent.
    const targets = [];
    const pushTarget = (kind, ownerId, id, value) => {
      if (typeof value === "string" && value.length > 0) {
        targets.push({ kind, ownerId, id, plaintext: value });
      }
    };
    pushTarget("provider", "openai", "openai", credentials.openai);
    pushTarget("provider", "anthropic", "anthropic", credentials.anthropic);
    const customMap = isPlainObject(credentials.custom)
      ? credentials.custom
      : {};
    for (const slug of Object.keys(customMap).sort()) {
      // "__proto__" is skipped up front — it would fail validateCredentialTarget
      // anyway, but never let it near a plain-object key path.
      if (slug === "__proto__") continue;
      pushTarget(
        "custom_provider",
        `custom.${slug}`,
        `custom.${slug}`,
        customMap[slug],
      );
    }

    // Digest over the IDENTITY set ONLY (sorted "kind:ownerId" list) — never
    // over secret values. Gives replay-idempotency on "which credentials were
    // migrated" without persisting any secret-derived bytes.
    const identityList = targets
      .map((t) => `${t.kind}:${t.ownerId}`)
      .sort();
    const digest = crypto
      .createHash("sha256")
      .update(canonicalize(identityList), "utf8")
      .digest("hex");

    // SQL is authority once COMPLETE: an already-complete replay of the same
    // identity set writes nothing (idempotent); a different set is refused so a
    // stale bulk migration can never clobber the now-authoritative ciphertext.
    const completed = resolveCompletedStoreMigration(
      PROVIDER_CREDENTIALS_META_KEYS,
      digest,
      SUPPORTED_PROVIDER_CREDENTIALS_MIGRATION_VERSION,
    );
    if (completed) return completed;

    const migratedAt = Date.now();
    const migrated = [];
    const failed = [];

    // Mark in_progress up front so an interrupted run leaves a recoverable
    // residue (not_started/in_progress both re-attempt on the next launch).
    db.tx(() => {
      upsertMeta(
        PROVIDER_CREDENTIALS_META_KEYS.STATE,
        MIGRATION_STATE.IN_PROGRESS,
      );
    });

    for (const target of targets) {
      try {
        // A malformed identity (bad slug / oversize owner) is dropped-and-kept
        // on legacy rather than failing the whole migration.
        validateCredentialTarget(target.kind, target.ownerId);
        let ciphertext;
        try {
          ciphertext = safeStorage.encryptString(target.plaintext);
        } catch (_encryptError) {
          failed.push(target.id);
          continue;
        }
        // Upsert + round-trip verify atomically. readDecryptedProviderSecret
        // sees the uncommitted row on this same connection; a mismatch throws,
        // db.tx rolls the row back, and the credential stays on legacy.
        db.tx(() => {
          db.prepare(
            "INSERT INTO provider_credentials(credential_kind, owner_id, ciphertext, updated_at) " +
              "VALUES (?, ?, ?, ?) " +
              "ON CONFLICT(credential_kind, owner_id) DO UPDATE SET " +
              "ciphertext = excluded.ciphertext, updated_at = excluded.updated_at",
          ).run(target.kind, target.ownerId, ciphertext, migratedAt);
          const check = readDecryptedProviderSecret(
            target.kind,
            target.ownerId,
          );
          if (check !== target.plaintext) {
            // Message carries NO secret — only the failure category.
            throw errorWithCode(
              `${label}: round-trip verification failed`,
              "secret_roundtrip_failed",
            );
          }
        });
        migrated.push(target.id);
      } catch (_error) {
        // Any per-credential failure (invalid target / encrypt / round-trip /
        // rollback) keeps that credential on legacy; never surfaces a secret.
        failed.push(target.id);
      }
    }

    // COMPLETE only when every present legacy secret migrated AND verified.
    // A partial run leaves STATE at in_progress with NO version/digest stamp,
    // so the next launch always re-attempts the failed credential(s).
    const complete = failed.length === 0;
    if (complete) {
      db.tx(() => {
        upsertMeta(
          PROVIDER_CREDENTIALS_META_KEYS.VERSION,
          SUPPORTED_PROVIDER_CREDENTIALS_MIGRATION_VERSION,
        );
        upsertMeta(PROVIDER_CREDENTIALS_META_KEYS.DIGEST, digest);
        upsertMeta(PROVIDER_CREDENTIALS_META_KEYS.MIGRATED_AT, migratedAt);
        upsertMeta(
          PROVIDER_CREDENTIALS_META_KEYS.STATE,
          MIGRATION_STATE.COMPLETE,
        );
      });
    }

    if (failed.length > 0) {
      // Count-only diagnostic — identity ids are not secrets, but we keep the
      // log to a bare count to stay well clear of the secret surface.
      console.warn(
        `[settings-storage] provider-credentials migration kept ${failed.length} ` +
          "credential(s) on legacy (round-trip not verified)",
      );
    }

    return {
      status: complete ? "complete" : "in-progress",
      ok: complete,
      digest,
      migratedAt,
      migratedCount: migrated.length,
      failedCount: failed.length,
      // Identity ids only (openai / anthropic / custom.<slug>) — never values.
      migrated,
      failed,
    };
  };

  // ---- Phase 5: reset settings + db stats (plan §6-Phase5) -----------------

  // The non-sensitive tables cleared by a settings reset. Deleting every
  // `settings` namespace row makes each converted store read back its own
  // DEFAULT_* on the next bootstrap; clearing the toolkit-preference and
  // computer-use tables returns those stores to their fail-closed / default
  // state. Wholly EXCLUDED (never cleared): provider_credentials (API key
  // ciphertext), token_usage_records (token history) and asset_metadata (MCP
  // icon metadata + the icon files on disk). The meta table is only PARTIALLY
  // preserved: its migration-state keys are kept (so a reset never triggers a
  // re-migration), but the one default_toolkits empty-scopes preference key is
  // cleared below — so `meta` is NOT reported as a wholly-preserved table in
  // the return value. The chats.db is a separate database entirely and is never
  // touched here.
  const RESET_SETTINGS_TABLES = Object.freeze([
    "settings",
    "default_toolkits",
    "toolkit_auto_approve",
    "tool_auto_approve",
    "computer_use_preferences",
  ]);

  // Reset every non-sensitive setting + preference in ONE transaction. A
  // failure rolls back the whole delete (the renderer's snapshot stays intact).
  // The return value carries per-table cleared row counts only — never a value.
  const resetSettings = () => {
    requireDb();
    return db.tx(() => {
      const cleared = {};
      for (const table of RESET_SETTINGS_TABLES) {
        const result = db.prepare(`DELETE FROM ${table}`).run();
        cleared[table] = Number(result.changes);
      }
      // The explicit-empty-scopes marker for default_toolkits is an app
      // preference (NOT migration state): a scope the user explicitly emptied
      // reads back as [] instead of the ["core"] default. Clear it too so a
      // reset genuinely returns to defaults. This is a single targeted meta
      // key — the migration-state meta keys are left untouched.
      db.prepare("DELETE FROM meta WHERE key = ?").run(
        DEFAULT_TOOLKITS_EMPTY_SCOPES_META_KEY,
      );
      return {
        ok: true,
        cleared,
        // Identity list of the tables a reset preserves WHOLLY (documentation
        // for callers/tests — never any value or secret). `meta` is omitted on
        // purpose: its migration-state keys survive, but the reset also clears
        // the default_toolkits empty-scopes key above, so the table is only
        // partially preserved and does not belong in a wholly-preserved list.
        preserved: Object.freeze([
          "provider_credentials",
          "token_usage_records",
          "asset_metadata",
        ]),
      };
    });
  };

  // Read-only settings.db metadata (plan §6-Phase5). Returns the on-disk byte
  // size (main file plus any WAL/SHM sidecars) and a per-table row count over a
  // fixed allow-list of table names. NEVER returns a stored value or a secret —
  // only COUNT(*) and file sizes. A per-table count failure yields rows:0 for
  // that table rather than taking down the whole call.
  const DB_STATS_TABLES = Object.freeze([
    "settings",
    "meta",
    "token_usage_records",
    "default_toolkits",
    "toolkit_auto_approve",
    "tool_auto_approve",
    "computer_use_preferences",
    "asset_metadata",
    "provider_credentials",
  ]);

  const getDbStats = () => {
    requireDb();
    let sizeBytes = 0;
    for (const suffix of ["", "-wal", "-shm"]) {
      try {
        const filePath = `${dbPath}${suffix}`;
        if (fs.existsSync(filePath)) {
          sizeBytes += Number(fs.statSync(filePath).size) || 0;
        }
      } catch (_error) {
        // a missing/unreadable sidecar just contributes 0 bytes
      }
    }
    const tables = DB_STATS_TABLES.map((name) => {
      let rows = 0;
      try {
        // Table name comes from the fixed allow-list above, never user input.
        const row = db.prepare(`SELECT COUNT(*) AS c FROM ${name}`).get();
        rows = row ? Number(row.c) : 0;
      } catch (_error) {
        rows = 0;
      }
      return { name, rows };
    });
    return { ok: true, sizeBytes, tables };
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
    setMcpIconAsset,
    getMcpIconAsset,
    deleteMcpIconAsset,
    listMcpIconOwners,
    migrateMcpIconsLegacy,
    // Phase 4 (S1): provider credential ciphertext store (main-internal only).
    setProviderCredential,
    readDecryptedProviderSecret,
    deleteProviderCredential,
    hasProviderCredential,
    listProviderCredentialOwners,
    getSecretStorageStatus,
    // Phase 4 (S2): legacy→ciphertext secret migration + dual-keep.
    migrateProviderCredentials,
    getProviderCredentialsMigrationMeta,
    // Phase 5: reset settings + read-only db stats (plan §6-Phase5).
    resetSettings,
    getDbStats,
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
  MCP_ICON_LIMITS,
  MCP_ICON_MIME_EXT,
  SENSITIVE_MODEL_PROVIDER_KEYS,
  PROVIDER_CREDENTIAL_KINDS,
  PROVIDER_CREDENTIAL_LIMITS,
  SECRET_STORAGE_STATUS,
  SAFE_SECRET_STORAGE_LINUX_BACKENDS,
  PROVIDER_CREDENTIALS_META_KEYS,
  SUPPORTED_PROVIDER_CREDENTIALS_MIGRATION_VERSION,
};

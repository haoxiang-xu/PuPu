// Memory V2 P0 — Vault control plane (storage / opaque handle / descriptor /
// grant ONLY). Security sign-off conditions (pupu-security-expert, conditional
// SIGN-OFF) baked in as invariants:
//   * NO generic resolver and NO plaintext-read IPC. Decryption exists only
//     inside the approved→executing sink path and plaintext is handed directly
//     to a closed, main-process executor; it is never returned to a caller.
//   * safeStorage unavailable → every deposit fails closed (never plaintext,
//     never setUsePlainTextEncryption).
//   * Linux `basic_text`/`unknown` safeStorage backends are REFUSED.
//   * The renderer can never decrypt: only ciphertext BLOBs are stored and
//     only non-secret descriptors/receipts ever leave this service.
//
// P0 follow-up hardening (approved, this patch):
//   * listDescriptors is SCOPE-BOUND: both scopeKind AND scopeId are required
//     and matched exactly. There is no global/partial enumeration path — a
//     caller can only ever see the descriptors of the one scope it names.
//   * grant is SCOPE-BOUND too: the caller must name the scope and the handle
//     is granted only if it belongs to that EXACT scope. A handle from another
//     scope is indistinguishable from a nonexistent one (same secret_not_found
//     code), so grant cannot be used as a cross-scope handle oracle.
//   * grants target a CLOSED sink-kind enum (see SINK_KINDS) — never a free
//     text grantee. An unknown sink kind is rejected outright.
//   * getStatus returns NO database row counts: control-plane availability
//     only, so status can never be used to count/probe stored secrets.
//   * vault_grants.handle is a real FOREIGN KEY ... ON DELETE CASCADE and
//     foreign-key enforcement is verified at init (fail closed to degraded
//     mode), so a grant can never outlive or dangle from its secret.
//
// The vault shares the settings.db FILE (userData/settings.db, WAL) through
// its own independent connection via createSettingsDb, but owns ONLY the
// five vault_* tables below. It never touches the settings tables, and
// settings reset (settings_storage resetSettings) never touches the vault.
//
// Logging policy: this module logs nothing on its own; handlers log the
// operation name + stable error code only. Error messages here are STATIC
// strings — they never embed user-supplied values.

const crypto = require("crypto");
const { createSettingsDb } = require("../settings_storage/db");
const { createVaultSinkBroker } = require("./sink_broker");
const {
  secretVariants,
  containsAnyVariant,
  redactVariants,
} = require("./secret_variants");

const DB_FILE_NAME = "settings.db";

// Opaque handle format (stable contract): "pvh1_" + 64 lowercase hex chars
// (32 random bytes = 256 bits, comfortably above the >=128-bit requirement).
// The "1" is the handle-format version so the format can evolve without
// ambiguity. Grants use the same scheme with a "pvg1_" prefix (128 bits).
const HANDLE_PREFIX = "pvh1_";
const HANDLE_RANDOM_BYTES = 32;
const HANDLE_PATTERN = /^pvh1_[0-9a-f]{64}$/;
const GRANT_ID_PREFIX = "pvg1_";
const GRANT_ID_RANDOM_BYTES = 16;
const GRANT_ID_PATTERN = /^pvg1_[0-9a-f]{32}$/;
const USE_INTENT_ID_PREFIX = "pvi1_";
const USE_INTENT_ID_PATTERN = /^pvi1_[0-9a-f]{32}$/;
const USE_RECEIPT_ID_PREFIX = "pvr1_";
const USE_RECEIPT_ID_PATTERN = /^pvr1_[0-9a-f]{32}$/;

const VAULT_USE_PROTOCOL_VERSION = 1;
const VAULT_USE_GLOBAL_SCOPE_ID = "local";
const VAULT_USE_INTENT_TTL_MS = 10 * 60 * 1000;
const VAULT_USE_MAX_HANDLES = 32;
const VAULT_USE_MAX_AUDIT_ARGUMENT_BYTES = 32 * 1024;
const VAULT_USE_MAX_RESULT_BYTES = 32 * 1024;
const VAULT_USE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,511}$/;
const VAULT_USE_OPERATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
// eslint-disable-next-line no-control-regex
const VAULT_USE_FIELD_PATTERN = /^[^\u0000-\u001f\u007f]{1,512}$/;
const VAULT_USE_HASH_PATTERN = /^[0-9a-f]{64}$/;
const VAULT_USE_REASON_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

const VAULT_USE_PREPARE_KEYS = Object.freeze([
  "version",
  "operation_id",
  "owner_chat_id",
  "session_id",
  "attempt_id",
  "run_id",
  "call_id",
  "sink_kind",
  "handles",
  "audit_arguments",
  "target_hash",
  "schema_fingerprint",
]);
const VAULT_USE_EXECUTE_KEYS = Object.freeze([
  ...VAULT_USE_PREPARE_KEYS,
  "intent_id",
  "interaction_id",
]);
const VAULT_USE_CANCEL_KEYS = Object.freeze([
  "version",
  "operation_id",
  "intent_id",
  "owner_chat_id",
  "session_id",
  "attempt_id",
  "run_id",
  "call_id",
  "interaction_id",
  "reason_code",
]);

const SCOPE_KINDS = Object.freeze(["chat", "user"]);

// CLOSED sink-kind enum. A grant does not name a free-text "grantee" — it
// names one of exactly these four controlled sinks, each of which is a
// consumption path whose executor must be implemented and reviewed explicitly.
// Anything else is rejected, so the renderer
// can never invent a sink and no unreviewed consumer can be granted.
//   computer_input      — typed into the computer-use input channel
//   shell_secret_env    — injected as an environment variable for one command
//   shell_secret_stdin  — piped to one command's stdin
//   mcp_schema_secret   — filled into a declared MCP tool-schema secret field
// Adding a member here is a security-review event, not a routine edit.
const SINK_KINDS = Object.freeze([
  "computer_input",
  "shell_secret_env",
  "shell_secret_stdin",
  "mcp_schema_secret",
]);
const SINK_KIND_SET = Object.freeze(new Set(SINK_KINDS));

// Input limits. scope_id / operationId are machine identifiers: ASCII-only,
// bounded, and "__proto__" is rejected outright (prototype-pollution hygiene
// for any plain-object consumer downstream). The label is the only
// human-facing field: Unicode is allowed but it is NFC-normalized, trimmed,
// control characters are rejected, and it is bounded both in code points and
// in UTF-8 bytes so a multi-byte label cannot balloon the row.
const MEMORY_VAULT_LIMITS = Object.freeze({
  SCOPE_ID_PATTERN: /^[A-Za-z0-9_.:-]{1,128}$/,
  OPERATION_ID_PATTERN: /^[A-Za-z0-9_.-]{8,128}$/,
  LABEL_MAX_CODE_POINTS: 120,
  LABEL_MAX_BYTES: 512,
  PLAINTEXT_MAX_BYTES: 64 * 1024,
});

const SECRET_STORAGE_STATUS = Object.freeze({
  AVAILABLE: "available",
  UNAVAILABLE: "unavailable",
});

// Same gate-3 judgement as settings_storage, probed INDEPENDENTLY here: on
// Linux only a real OS keyring backend is trusted. basic_text (Electron's
// hardcoded-password fallback) and unknown are refused — never plaintext.
const SAFE_SECRET_STORAGE_LINUX_BACKENDS = Object.freeze(
  new Set(["gnome_libsecret", "kwallet", "kwallet5", "kwallet6"]),
);

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_PATTERN = /[\u0000-\u001f\u007f-\u009f]/;

// ONLY these five tables (plus their indexes) — the vault must never create
// or alter any settings-storage table. All statements are IF NOT EXISTS so
// re-running is idempotent. No AUTOINCREMENT anywhere, so opening the vault
// on a fresh file adds exactly these entries to sqlite_master.
const VAULT_BASE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS vault_secrets (
  handle      TEXT PRIMARY KEY,
  scope_kind  TEXT NOT NULL,
  scope_id    TEXT NOT NULL,
  label       TEXT NOT NULL,
  ciphertext  BLOB NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vault_secrets_scope
  ON vault_secrets(scope_kind, scope_id);

CREATE TABLE IF NOT EXISTS vault_operation_receipts (
  operation_id TEXT PRIMARY KEY,
  op_kind      TEXT NOT NULL,
  receipt_hash TEXT NOT NULL,
  result_json  TEXT NOT NULL,
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS vault_use_intents (
  intent_id              TEXT PRIMARY KEY,
  operation_id           TEXT NOT NULL UNIQUE,
  request_hash           TEXT NOT NULL,
  owner_chat_id          TEXT NOT NULL,
  session_id             TEXT NOT NULL,
  attempt_id             TEXT NOT NULL,
  run_id                 TEXT NOT NULL,
  call_id                TEXT NOT NULL,
  sink_kind              TEXT NOT NULL,
  handles_json           TEXT NOT NULL,
  audit_arguments_hash   TEXT NOT NULL,
  target_hash            TEXT NOT NULL,
  schema_fingerprint     TEXT NOT NULL,
  descriptor_label       TEXT NOT NULL,
  descriptor_target      TEXT NOT NULL,
  interaction_id         TEXT,
  execute_operation_id   TEXT,
  cancel_operation_id    TEXT,
  status                 TEXT NOT NULL,
  expires_at             INTEGER NOT NULL,
  created_at             INTEGER NOT NULL,
  updated_at             INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vault_use_intents_interaction
  ON vault_use_intents(interaction_id)
  WHERE interaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vault_use_intents_status
  ON vault_use_intents(status, updated_at);

CREATE TABLE IF NOT EXISTS vault_use_receipts (
  receipt_id   TEXT PRIMARY KEY,
  intent_id    TEXT NOT NULL UNIQUE,
  status       TEXT NOT NULL,
  outcome_code TEXT NOT NULL,
  result_json  TEXT NOT NULL DEFAULT '{}',
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
`;

// vault_grants carries a DATABASE-ENFORCED foreign key: deleting a secret can
// never leave a dangling grant, even if a future code path forgets the
// application-level cascade. `sink_kind` replaces the old free-text grantee.
const VAULT_GRANTS_TABLE_SQL = (tableName) => `
CREATE TABLE ${tableName} (
  grant_id   TEXT PRIMARY KEY,
  handle     TEXT NOT NULL
             REFERENCES vault_secrets(handle) ON DELETE CASCADE,
  sink_kind  TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`;

const VAULT_GRANTS_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_vault_grants_handle
  ON vault_grants(handle);
`;

// Same error transport contract as settings_storage: the stable code rides in
// the message behind a "[<code>] " prefix (Electron strips error.code across
// ipcMain.handle) AND stays on .code for main-process callers. Messages are
// static — never payload-derived.
const errorWithCode = (message, code) => {
  const error = new Error(`[${code}] ${message}`);
  error.code = code;
  return error;
};

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

// Stable canonical serialization (recursive key sort) for the receipt
// fingerprint. The fingerprint input NEVER includes plaintext or anything
// derived from a secret — deposits fingerprint their non-secret identity
// fields only (enforced by construction: callers pass an explicit non-secret
// params object).
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

const sha256Hex = (text) =>
  crypto.createHash("sha256").update(text, "utf8").digest("hex");

const createMemoryVaultService = ({
  app,
  path,
  sqlite,
  // Electron safeStorage. OPTIONAL: absent → the vault opens fine but every
  // deposit fails closed with secret_storage_unavailable.
  safeStorage,
  // Native confirmation dependencies. `confirmUse` is a test-only seam; the
  // production caller injects Electron dialog + the current main window.
  dialog,
  getMainWindow,
  confirmUse,
  // TEST-ONLY construction seam for the closed sink executor map. Production
  // (electron/main/index.js) never passes this: it calls configureSinkExecutors
  // once, after settings init, with the reviewed worker registry. An ABSENT or
  // EMPTY value means "never configured" — it is NOT a configured-but-empty
  // registry, so every execution and every broker start fails closed.
  sinkExecutors = null,
  http,
  // Injected only for testability of the Linux gate branch; defaults to the
  // real host platform. index.js never passes it.
  platform,
} = {}) => {
  if (!app || !path || !sqlite) {
    throw new Error("createMemoryVaultService: missing dependencies");
  }
  const resolvedPlatform =
    typeof platform === "string" && platform.length > 0
      ? platform
      : process.platform;

  let db = null;
  let degradedReason = null;
  let secretStorageStatus = SECRET_STORAGE_STATUS.UNAVAILABLE;
  let sinkBroker = null;
  let sinkBrokerStartPromise = null;
  const confirmationInFlight = new Map();
  const executionInFlight = new Map();

  // ---- Sink executor registry (main-process-only, one-shot) ---------------
  //
  // configureSinkExecutors is deliberately NOT reachable from the renderer: it
  // is absent from register_handlers.js / MEMORY_VAULT_INVOKE_CHANNELS / the
  // preload bridge, and three test layers (handlers, ipc_channels, api_contract)
  // lock that. Registering an executor means "this function may receive
  // decrypted plaintext", so the only caller is main's startup assembly.
  //
  // One-shot by construction: a second call, or any call once the broker has
  // started accepting sidecar requests, is refused. That removes the swap
  // window in which an already-authenticated intent could be rerouted to a
  // different executor mid-flight.
  let sinkExecutorRegistry = null;
  let sinkExecutorMap = null;
  let sinkExecutorsConfigured = false;
  let sinkBrokerEverStarted = false;

  const normalizeSinkExecutorRegistry = (registry) => {
    if (
      registry === null ||
      typeof registry !== "object" ||
      Array.isArray(registry)
    ) {
      throw errorWithCode(
        "sink executor registry is invalid",
        "vault_sink_registry_invalid",
      );
    }
    // Two accepted shapes: the production registry object
    // ({executors, close}) produced by createVaultSinkExecutors, and a bare
    // sink_kind → fn map (the test seam). "executors" is not a sink kind, so
    // the two can never be confused.
    const isRegistryObject =
      typeof registry.executors === "object" && registry.executors !== null;
    const executors = isRegistryObject ? registry.executors : registry;
    const close = isRegistryObject ? registry.close : null;
    if (
      executors === null ||
      typeof executors !== "object" ||
      Array.isArray(executors) ||
      (close !== null && close !== undefined && typeof close !== "function")
    ) {
      throw errorWithCode(
        "sink executor registry is invalid",
        "vault_sink_registry_invalid",
      );
    }
    const entries = Object.entries(executors);
    if (entries.length === 0) {
      // A configured-but-empty registry would start a broker that can accept
      // and authenticate requests it can never serve. Refuse it outright.
      throw errorWithCode(
        "sink executor registry is empty",
        "vault_sink_registry_empty",
      );
    }
    for (const [sinkKind, executor] of entries) {
      if (!SINK_KIND_SET.has(sinkKind) || typeof executor !== "function") {
        throw errorWithCode(
          "sink executor registry is invalid",
          "vault_sink_registry_invalid",
        );
      }
    }
    return {
      executors: Object.freeze(Object.fromEntries(entries)),
      close: typeof close === "function" ? close : null,
    };
  };

  const configureSinkExecutors = (registry) => {
    // Broker-started is checked FIRST and reported as its own code: it is the
    // stronger invariant (an authenticated sidecar may already hold a prepared
    // intent), and keeping the two codes distinct makes both guards testable.
    if (sinkBrokerEverStarted) {
      throw errorWithCode(
        "sink executors cannot change after the broker has started",
        "vault_sink_executors_locked",
      );
    }
    if (sinkExecutorsConfigured) {
      throw errorWithCode(
        "sink executors are already configured",
        "vault_sink_executors_already_configured",
      );
    }
    const normalized = normalizeSinkExecutorRegistry(registry);
    sinkExecutorRegistry = normalized;
    sinkExecutorMap = normalized.executors;
    sinkExecutorsConfigured = true;
    return { ok: true, sinkKinds: Object.keys(normalized.executors).sort() };
  };

  // Synchronous, idempotent drain of every live worker process group. Must stay
  // synchronous: will-quit does not await promises.
  const drainSinkExecutors = () => {
    const close = sinkExecutorRegistry?.close;
    if (typeof close !== "function") return 0;
    try {
      return Number(close()) || 0;
    } catch (_error) {
      // Never surface a kill failure; the DB close below must still run.
      return 0;
    }
  };

  // The seam mirrors production exactly: an empty map is NOT a configuration
  // event, so `sinkExecutors: {}` leaves the service unconfigured and every
  // execution keeps failing closed without decrypting anything.
  if (sinkExecutors !== null && sinkExecutors !== undefined) {
    const seedIsEmptyMap =
      typeof sinkExecutors === "object" &&
      !Array.isArray(sinkExecutors) &&
      typeof sinkExecutors.executors !== "object" &&
      Object.keys(sinkExecutors).length === 0;
    if (!seedIsEmptyMap) configureSinkExecutors(sinkExecutors);
  }

  const requireDb = () => {
    if (!db) {
      throw errorWithCode(
        "memory vault is unavailable",
        "memory_vault_unavailable",
      );
    }
    return db;
  };

  // Independent, rigorous availability probe — mirrors the settings gate-3
  // judgement but shares no state with it. Any thrown probe error reads as
  // unavailable (fail closed).
  const probeSecretStorage = () => {
    if (
      !safeStorage ||
      typeof safeStorage.isEncryptionAvailable !== "function" ||
      typeof safeStorage.encryptString !== "function"
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

  const validateOperationId = (operationId) => {
    if (
      typeof operationId !== "string" ||
      !MEMORY_VAULT_LIMITS.OPERATION_ID_PATTERN.test(operationId) ||
      operationId === "__proto__"
    ) {
      throw errorWithCode(
        "operationId must match [A-Za-z0-9_.-], length 8-128",
        "invalid_operation_id",
      );
    }
  };

  const validateScopeKind = (scopeKind) => {
    if (!SCOPE_KINDS.includes(scopeKind)) {
      throw errorWithCode(
        'scopeKind must be "chat" or "user"',
        "invalid_scope_kind",
      );
    }
  };

  const validateScopeId = (scopeId) => {
    if (
      typeof scopeId !== "string" ||
      !MEMORY_VAULT_LIMITS.SCOPE_ID_PATTERN.test(scopeId) ||
      scopeId === "__proto__"
    ) {
      throw errorWithCode(
        "scopeId must match [A-Za-z0-9_.:-], length 1-128",
        "invalid_scope_id",
      );
    }
  };

  // Unicode label handling: NFC-normalize, trim, reject control characters,
  // bound by code points AND by UTF-8 bytes. Returns the normalized label
  // (the stored/displayed form) — validation and normalization are one step
  // so the two can never disagree.
  const normalizeAndValidateLabel = (label) => {
    if (typeof label !== "string") {
      throw errorWithCode("label must be a string", "invalid_label");
    }
    const normalized = label.normalize("NFC").trim();
    if (
      normalized.length === 0 ||
      CONTROL_CHARS_PATTERN.test(normalized) ||
      Array.from(normalized).length >
        MEMORY_VAULT_LIMITS.LABEL_MAX_CODE_POINTS ||
      Buffer.byteLength(normalized, "utf8") > MEMORY_VAULT_LIMITS.LABEL_MAX_BYTES
    ) {
      throw errorWithCode(
        "label must be non-empty, control-character free and within " +
          "the code-point/byte bounds",
        "invalid_label",
      );
    }
    return normalized;
  };

  const validatePlaintext = (plaintext) => {
    if (
      typeof plaintext !== "string" ||
      plaintext.length === 0 ||
      Buffer.byteLength(plaintext, "utf8") >
        MEMORY_VAULT_LIMITS.PLAINTEXT_MAX_BYTES
    ) {
      throw errorWithCode(
        "plaintext must be a non-empty string within the byte bound",
        "invalid_plaintext",
      );
    }
  };

  const validateHandle = (handle) => {
    if (typeof handle !== "string" || !HANDLE_PATTERN.test(handle)) {
      throw errorWithCode(
        "handle must match the pvh1_<64 hex> format",
        "invalid_handle",
      );
    }
  };

  // Closed enum, exact match, no normalization: a sink kind is either one of
  // the four reviewed sinks or the call is rejected. Case-folding or trimming
  // here would be an attack surface ("Computer_Input" must NOT be accepted).
  const validateSinkKind = (sinkKind) => {
    if (typeof sinkKind !== "string" || !SINK_KIND_SET.has(sinkKind)) {
      throw errorWithCode(
        "sinkKind must be one of the controlled vault sink kinds",
        "invalid_sink_kind",
      );
    }
  };

  const validateGrantId = (grantId) => {
    if (typeof grantId !== "string" || !GRANT_ID_PATTERN.test(grantId)) {
      throw errorWithCode(
        "grantId must match the pvg1_<32 hex> format",
        "invalid_grant_id",
      );
    }
  };

  const assertExactKeys = (value, expectedKeys) => {
    if (!isPlainObject(value)) {
      throw errorWithCode(
        "vault use payload must be an object",
        "invalid_vault_use_request",
      );
    }
    const actual = Object.keys(value).sort();
    const expected = [...expectedKeys].sort();
    if (
      actual.length !== expected.length ||
      actual.some((key, index) => key !== expected[index])
    ) {
      throw errorWithCode(
        "vault use payload fields do not match the protocol",
        "invalid_vault_use_request",
      );
    }
  };

  const normalizeUseId = (value, field, pattern = VAULT_USE_ID_PATTERN) => {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!pattern.test(normalized) || normalized === "__proto__") {
      throw errorWithCode(`${field} is invalid`, "invalid_vault_use_request");
    }
    return normalized;
  };

  const normalizeAuditArguments = (value) => {
    if (!isPlainObject(value)) {
      throw errorWithCode(
        "audit_arguments must be an object",
        "invalid_vault_use_request",
      );
    }
    let serialized;
    try {
      serialized = JSON.stringify(value);
    } catch (_error) {
      throw errorWithCode(
        "audit_arguments must be JSON serializable",
        "invalid_vault_use_request",
      );
    }
    if (
      typeof serialized !== "string" ||
      Buffer.byteLength(serialized, "utf8") >
        VAULT_USE_MAX_AUDIT_ARGUMENT_BYTES
    ) {
      throw errorWithCode(
        "audit_arguments exceeds the byte bound",
        "invalid_vault_use_request",
      );
    }
    try {
      return JSON.parse(serialized);
    } catch (_error) {
      throw errorWithCode(
        "audit_arguments must be JSON serializable",
        "invalid_vault_use_request",
      );
    }
  };

  const normalizeUseHandles = (value) => {
    if (
      !Array.isArray(value) ||
      value.length < 1 ||
      value.length > VAULT_USE_MAX_HANDLES
    ) {
      throw errorWithCode(
        "handles must be a non-empty bounded array",
        "invalid_vault_use_request",
      );
    }
    const fields = new Set();
    return value.map((item) => {
      assertExactKeys(item, ["field", "handle"]);
      const field = typeof item.field === "string" ? item.field.trim() : "";
      if (!VAULT_USE_FIELD_PATTERN.test(field) || fields.has(field)) {
        throw errorWithCode(
          "handle field is invalid or duplicated",
          "invalid_vault_use_request",
        );
      }
      validateHandle(item.handle);
      fields.add(field);
      return { field, handle: item.handle };
    });
  };

  const normalizePrepareIdentity = (payload, expectedKeys) => {
    assertExactKeys(payload, expectedKeys);
    if (payload.version !== VAULT_USE_PROTOCOL_VERSION) {
      throw errorWithCode(
        "vault use protocol version is unsupported",
        "invalid_vault_use_request",
      );
    }
    const normalized = {
      version: VAULT_USE_PROTOCOL_VERSION,
      operation_id: normalizeUseId(
        payload.operation_id,
        "operation_id",
        VAULT_USE_OPERATION_ID_PATTERN,
      ),
      owner_chat_id: normalizeUseId(payload.owner_chat_id, "owner_chat_id"),
      session_id: normalizeUseId(payload.session_id, "session_id"),
      attempt_id: normalizeUseId(payload.attempt_id, "attempt_id"),
      run_id: normalizeUseId(payload.run_id, "run_id"),
      call_id: normalizeUseId(payload.call_id, "call_id"),
      sink_kind: payload.sink_kind,
      handles: normalizeUseHandles(payload.handles),
      audit_arguments: normalizeAuditArguments(payload.audit_arguments),
      target_hash: normalizeUseId(
        payload.target_hash,
        "target_hash",
        VAULT_USE_HASH_PATTERN,
      ),
      schema_fingerprint: normalizeUseId(
        payload.schema_fingerprint,
        "schema_fingerprint",
        VAULT_USE_HASH_PATTERN,
      ),
    };
    validateSinkKind(normalized.sink_kind);
    return normalized;
  };

  const normalizePreparePayload = (payload) =>
    normalizePrepareIdentity(payload, VAULT_USE_PREPARE_KEYS);

  const normalizeExecutePayload = (payload) => {
    assertExactKeys(payload, VAULT_USE_EXECUTE_KEYS);
    const preparePayload = {};
    for (const key of VAULT_USE_PREPARE_KEYS) preparePayload[key] = payload[key];
    const identity = normalizePrepareIdentity(
      preparePayload,
      VAULT_USE_PREPARE_KEYS,
    );
    return {
      ...identity,
      intent_id: normalizeUseId(
        payload.intent_id,
        "intent_id",
        USE_INTENT_ID_PATTERN,
      ),
      interaction_id: normalizeUseId(
        payload.interaction_id,
        "interaction_id",
      ),
    };
  };

  const normalizeCancelPayload = (payload) => {
    assertExactKeys(payload, VAULT_USE_CANCEL_KEYS);
    if (payload.version !== VAULT_USE_PROTOCOL_VERSION) {
      throw errorWithCode(
        "vault use protocol version is unsupported",
        "invalid_vault_use_request",
      );
    }
    return {
      version: VAULT_USE_PROTOCOL_VERSION,
      operation_id: normalizeUseId(
        payload.operation_id,
        "operation_id",
        VAULT_USE_OPERATION_ID_PATTERN,
      ),
      intent_id: normalizeUseId(
        payload.intent_id,
        "intent_id",
        USE_INTENT_ID_PATTERN,
      ),
      owner_chat_id: normalizeUseId(payload.owner_chat_id, "owner_chat_id"),
      session_id: normalizeUseId(payload.session_id, "session_id"),
      attempt_id: normalizeUseId(payload.attempt_id, "attempt_id"),
      run_id: normalizeUseId(payload.run_id, "run_id"),
      call_id: normalizeUseId(payload.call_id, "call_id"),
      interaction_id: normalizeUseId(
        payload.interaction_id,
        "interaction_id",
      ),
      reason_code: normalizeUseId(
        payload.reason_code,
        "reason_code",
        VAULT_USE_REASON_PATTERN,
      ),
    };
  };

  // ---- crypto --------------------------------------------------------------

  const newHandle = () =>
    `${HANDLE_PREFIX}${crypto.randomBytes(HANDLE_RANDOM_BYTES).toString("hex")}`;

  const newGrantId = () =>
    `${GRANT_ID_PREFIX}${crypto
      .randomBytes(GRANT_ID_RANDOM_BYTES)
      .toString("hex")}`;

  const newUseIntentId = () =>
    `${USE_INTENT_ID_PREFIX}${crypto.randomBytes(16).toString("hex")}`;

  const newUseReceiptId = () =>
    `${USE_RECEIPT_ID_PREFIX}${crypto.randomBytes(16).toString("hex")}`;

  const encryptPlaintext = (plaintext) => {
    if (secretStorageStatus !== SECRET_STORAGE_STATUS.AVAILABLE) {
      throw errorWithCode(
        "encrypted secret storage is unavailable on this machine",
        "secret_storage_unavailable",
      );
    }
    let ciphertext;
    try {
      ciphertext = safeStorage.encryptString(plaintext);
    } catch (_error) {
      // A real crypto failure is stronger evidence than the probe: latch
      // unavailable for this session so we never loop into OS dialogs.
      secretStorageStatus = SECRET_STORAGE_STATUS.UNAVAILABLE;
      throw errorWithCode(
        "failed to encrypt secret",
        "secret_storage_unavailable",
      );
    }
    // Fail-closed output guard: the stored value must be a Buffer and must
    // not be the plaintext bytes themselves (a broken/spoofed safeStorage
    // must never let plaintext reach the database).
    if (
      !Buffer.isBuffer(ciphertext) ||
      ciphertext.length === 0 ||
      ciphertext.equals(Buffer.from(plaintext, "utf8"))
    ) {
      secretStorageStatus = SECRET_STORAGE_STATUS.UNAVAILABLE;
      throw errorWithCode(
        "secret storage produced an unusable ciphertext",
        "secret_storage_unavailable",
      );
    }
    return ciphertext;
  };

  const decryptCiphertextForSink = (ciphertext) => {
    if (
      secretStorageStatus !== SECRET_STORAGE_STATUS.AVAILABLE ||
      !safeStorage ||
      typeof safeStorage.decryptString !== "function"
    ) {
      throw errorWithCode(
        "encrypted secret storage is unavailable on this machine",
        "secret_storage_unavailable",
      );
    }
    let plaintext;
    try {
      plaintext = safeStorage.decryptString(Buffer.from(ciphertext));
    } catch (_error) {
      secretStorageStatus = SECRET_STORAGE_STATUS.UNAVAILABLE;
      throw errorWithCode(
        "failed to decrypt secret",
        "secret_storage_unavailable",
      );
    }
    if (
      typeof plaintext !== "string" ||
      plaintext.length === 0 ||
      Buffer.byteLength(plaintext, "utf8") >
        MEMORY_VAULT_LIMITS.PLAINTEXT_MAX_BYTES
    ) {
      secretStorageStatus = SECRET_STORAGE_STATUS.UNAVAILABLE;
      throw errorWithCode(
        "secret storage produced an unusable plaintext",
        "secret_storage_unavailable",
      );
    }
    return plaintext;
  };

  // ---- idempotent mutation harness ----------------------------------------
  // Every mutation requires an operationId. The receipt fingerprint is a
  // sha256 over {opKind, params} where params is an explicit NON-SECRET
  // object — plaintext never enters the hash input, so no secret-derived
  // material is ever persisted. Consequence (accepted, by security design):
  // two calls with the same operationId and same non-secret identity but
  // different plaintext are treated as a replay of the first.
  //
  // Replay: same operationId + same fingerprint → the stored result is
  // returned verbatim plus { replayed: true }, no re-execution. Same
  // operationId with a DIFFERENT fingerprint → operation_conflict.
  const runIdempotentMutation = (opKind, operationId, nonSecretParams, run) => {
    requireDb();
    validateOperationId(operationId);
    const receiptHash = sha256Hex(
      canonicalize({ opKind, params: nonSecretParams }),
    );
    const existing = db
      .prepare(
        "SELECT op_kind, receipt_hash, result_json " +
          "FROM vault_operation_receipts WHERE operation_id = ?",
      )
      .get(operationId);
    if (existing) {
      if (
        existing.op_kind !== opKind ||
        existing.receipt_hash !== receiptHash
      ) {
        throw errorWithCode(
          "operationId was already used by a different operation",
          "operation_conflict",
        );
      }
      let stored;
      try {
        stored = JSON.parse(existing.result_json);
      } catch (_error) {
        throw errorWithCode(
          "stored receipt is unreadable",
          "operation_conflict",
        );
      }
      return { ...stored, replayed: true };
    }
    return db.tx(() => {
      const result = run();
      db.prepare(
        "INSERT INTO vault_operation_receipts" +
          "(operation_id, op_kind, receipt_hash, result_json, created_at) " +
          "VALUES (?, ?, ?, ?, ?)",
      ).run(operationId, opKind, receiptHash, JSON.stringify(result), Date.now());
      return result;
    });
  };

  // ---- one-time sink use --------------------------------------------------

  const vaultUseRequestHash = (identity) =>
    sha256Hex(canonicalize(identity));

  const getUseIntent = (intentId) =>
    db
      .prepare("SELECT * FROM vault_use_intents WHERE intent_id = ?")
      .get(intentId);

  const getUseReceipt = (intentId) =>
    db
      .prepare("SELECT * FROM vault_use_receipts WHERE intent_id = ?")
      .get(intentId);

  const resolveUseHandleRows = ({
    ownerChatId,
    sinkKind,
    handles,
    requireGrant = false,
  }) =>
    handles.map(({ field, handle }) => {
      const row = db
        .prepare(
          "SELECT s.handle, s.label, s.ciphertext, s.scope_kind, s.scope_id " +
            "FROM vault_secrets s " +
            "WHERE s.handle = ? " +
            "AND ((s.scope_kind = 'chat' AND s.scope_id = ?) " +
            "OR (s.scope_kind = 'user' AND s.scope_id = ?))",
        )
        .get(handle, ownerChatId, VAULT_USE_GLOBAL_SCOPE_ID);
      const grant =
        row && requireGrant
          ? db
              .prepare(
                "SELECT grant_id FROM vault_grants " +
                  "WHERE handle = ? AND sink_kind = ? LIMIT 1",
              )
              .get(handle, sinkKind)
          : null;
      if (!row || (requireGrant && !grant)) {
        // Same error for a missing handle, wrong scope, missing grant or wrong
        // sink: the broker is not a handle/scope/grant existence oracle.
        throw errorWithCode(
          "a requested secret is unavailable for this sink",
          "vault_secret_unavailable",
        );
      }
      return { field, ...row };
    });

  const vaultUseDescriptorTarget = (identity) => {
    const candidate = identity.audit_arguments.target;
    if (
      typeof candidate === "string" &&
      candidate.trim().length > 0 &&
      candidate.trim().length <= 256 &&
      !CONTROL_CHARS_PATTERN.test(candidate.trim())
    ) {
      return candidate.trim();
    }
    const labels = {
      computer_input: "Computer secure input",
      shell_secret_env: "Shell environment",
      shell_secret_stdin: "Shell standard input",
      mcp_schema_secret: "Declared MCP secret field",
    };
    return labels[identity.sink_kind] || "Controlled tool sink";
  };

  const descriptorLabel = (rows) =>
    rows.map((row) => row.label).join(", ");

  const vaultUseIntentResponse = (row, replayed) => ({
    ok: true,
    version: VAULT_USE_PROTOCOL_VERSION,
    intent_id: row.intent_id,
    status: "pending_confirmation",
    descriptor: {
      label: row.descriptor_label,
      sink_kind: row.sink_kind,
      target: row.descriptor_target,
    },
    expires_at: Number(row.expires_at),
    replayed: Boolean(replayed),
  });

  const parseSafeReceiptResult = (receipt) => {
    try {
      return JSON.parse(receipt.result_json || "{}");
    } catch (_error) {
      throw errorWithCode(
        "vault use receipt is unreadable",
        "vault_intent_conflict",
      );
    }
  };

  const vaultUseReceiptResponse = (row, receipt, replayed) => ({
    ok: true,
    version: VAULT_USE_PROTOCOL_VERSION,
    intent_id: row.intent_id,
    status: receipt.status,
    receipt_id: receipt.receipt_id,
    result: parseSafeReceiptResult(receipt),
    replayed: Boolean(replayed),
  });

  const insertUseReceipt = (
    intentId,
    status,
    outcomeCode,
    resultJson,
    now,
  ) => {
    const existing = getUseReceipt(intentId);
    if (existing) return existing;
    const receiptId = newUseReceiptId();
    db.prepare(
      "INSERT INTO vault_use_receipts" +
        "(receipt_id, intent_id, status, outcome_code, result_json, created_at, updated_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(receiptId, intentId, status, outcomeCode, resultJson, now, now);
    return getUseReceipt(intentId);
  };

  const transitionUseIntent = (intentId, fromStatus, toStatus, now) => {
    const result = db
      .prepare(
        "UPDATE vault_use_intents SET status = ?, updated_at = ? " +
          "WHERE intent_id = ? AND status = ?",
      )
      .run(toStatus, now, intentId, fromStatus);
    if (Number(result.changes) !== 1) {
      throw errorWithCode(
        "vault use intent state changed concurrently",
        "vault_intent_conflict",
      );
    }
  };

  const ensureUseIntentGrants = (row, now) => {
    const handles = JSON.parse(row.handles_json);
    const resolved = resolveUseHandleRows({
      ownerChatId: row.owner_chat_id,
      sinkKind: row.sink_kind,
      handles,
    });
    for (const handleRow of resolved) {
      const existing = db
        .prepare(
          "SELECT grant_id FROM vault_grants " +
            "WHERE handle = ? AND sink_kind = ? LIMIT 1",
        )
        .get(handleRow.handle, row.sink_kind);
      if (!existing) {
        db.prepare(
          "INSERT INTO vault_grants(grant_id, handle, sink_kind, created_at) " +
            "VALUES (?, ?, ?, ?)",
        ).run(newGrantId(), handleRow.handle, row.sink_kind, now);
      }
    }
  };

  const markUseTerminal = (
    intentId,
    fromStatus,
    status,
    outcomeCode,
    resultJson = "{}",
  ) =>
    db.tx(() => {
      const now = Date.now();
      transitionUseIntent(intentId, fromStatus, status, now);
      return insertUseReceipt(
        intentId,
        status,
        outcomeCode,
        resultJson,
        now,
      );
    });

  const redactVaultResultString = (value, variants) =>
    redactVariants(value, variants);

  // Handles ride along as extra literals: they are not secrets, but a sink
  // result must not echo the caller's handle back into a shared surface.
  // The encoding coverage itself comes from ./secret_variants — the SAME
  // generator the sink worker's leak check and the deposit label guard use,
  // so a secret cannot be encoded past one guard while another catches it.
  const vaultResultRedactionVariants = (plaintexts, handles) =>
    secretVariants(plaintexts, handles);

  const sanitizeVaultExecutorResult = ({ result, plaintexts, handles }) => {
    const variants = vaultResultRedactionVariants(plaintexts, handles);
    const seen = new WeakSet();
    let visited = 0;
    const visit = (value, depth) => {
      visited += 1;
      if (visited > 4096 || depth > 32) {
        return { redacted: true, reason: "structure_limit" };
      }
      if (value === null || typeof value === "boolean") return value;
      if (typeof value === "string") {
        return redactVaultResultString(value, variants);
      }
      if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
      }
      if (Buffer.isBuffer(value) || ArrayBuffer.isView(value)) {
        return { redacted: true, reason: "binary_result" };
      }
      if (Array.isArray(value)) {
        if (seen.has(value)) return { redacted: true, reason: "cyclic_result" };
        seen.add(value);
        return value.map((item) => visit(item, depth + 1));
      }
      if (!isPlainObject(value)) {
        return { redacted: true, reason: "unsupported_result_type" };
      }
      if (seen.has(value)) return { redacted: true, reason: "cyclic_result" };
      seen.add(value);
      const output = {};
      let collision = 0;
      for (const [rawKey, item] of Object.entries(value)) {
        let key = redactVaultResultString(rawKey, variants);
        while (Object.prototype.hasOwnProperty.call(output, key)) {
          collision += 1;
          key = `redacted_key_${collision}`;
        }
        output[key] = visit(item, depth + 1);
      }
      return output;
    };

    const visitedResult = visit(result === undefined ? null : result, 0);
    const sanitized = isPlainObject(visitedResult)
      ? visitedResult
      : { value: visitedResult };
    let resultJson = JSON.stringify(sanitized);
    if (
      typeof resultJson !== "string" ||
      Buffer.byteLength(resultJson, "utf8") > VAULT_USE_MAX_RESULT_BYTES ||
      variants.some((variant) => variant && resultJson.includes(variant))
    ) {
      resultJson = JSON.stringify({
        redacted: true,
        reason: "result_safety_limit",
      });
    }
    return resultJson;
  };

  const vaultUseIdentityMatchesRow = (
    row,
    identity,
    { requirePrepareOperation = true } = {},
  ) => {
    const prepareIdentity = {};
    for (const key of VAULT_USE_PREPARE_KEYS) {
      prepareIdentity[key] = identity[key];
    }
    return (
      row.owner_chat_id === identity.owner_chat_id &&
      row.session_id === identity.session_id &&
      row.attempt_id === identity.attempt_id &&
      row.run_id === identity.run_id &&
      row.call_id === identity.call_id &&
      row.sink_kind === identity.sink_kind &&
      row.handles_json === JSON.stringify(identity.handles) &&
      row.audit_arguments_hash ===
        sha256Hex(canonicalize(identity.audit_arguments)) &&
      row.target_hash === identity.target_hash &&
      row.schema_fingerprint === identity.schema_fingerprint &&
      (!requirePrepareOperation ||
        (row.operation_id === identity.operation_id &&
          row.request_hash === vaultUseRequestHash(prepareIdentity)))
    );
  };

  const prepareUseIntent = (payload) => {
    requireDb();
    const identity = normalizePreparePayload(payload);
    const requestHash = vaultUseRequestHash(identity);
    const existing = db
      .prepare(
        "SELECT * FROM vault_use_intents WHERE operation_id = ?",
      )
      .get(identity.operation_id);
    if (existing) {
      if (!vaultUseIdentityMatchesRow(existing, identity)) {
        throw errorWithCode(
          "operation identity conflicts with an existing intent",
          "vault_intent_conflict",
        );
      }
      if (existing.status === "indeterminate") {
        throw errorWithCode(
          "vault use outcome is indeterminate",
          "vault_use_indeterminate",
        );
      }
      return vaultUseIntentResponse(existing, true);
    }

    const rows = resolveUseHandleRows({
      ownerChatId: identity.owner_chat_id,
      sinkKind: identity.sink_kind,
      handles: identity.handles,
    });
    const intentId = newUseIntentId();
    const now = Date.now();
    const expiresAt = now + VAULT_USE_INTENT_TTL_MS;
    const auditArgumentsHash = sha256Hex(
      canonicalize(identity.audit_arguments),
    );
    const label = descriptorLabel(rows);
    const target = vaultUseDescriptorTarget(identity);
    db.prepare(
      "INSERT INTO vault_use_intents(" +
        "intent_id, operation_id, request_hash, owner_chat_id, session_id, " +
        "attempt_id, run_id, call_id, sink_kind, handles_json, " +
        "audit_arguments_hash, target_hash, schema_fingerprint, " +
        "descriptor_label, descriptor_target, interaction_id, status, " +
        "expires_at, created_at, updated_at" +
        ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)",
    ).run(
      intentId,
      identity.operation_id,
      requestHash,
      identity.owner_chat_id,
      identity.session_id,
      identity.attempt_id,
      identity.run_id,
      identity.call_id,
      identity.sink_kind,
      JSON.stringify(identity.handles),
      auditArgumentsHash,
      identity.target_hash,
      identity.schema_fingerprint,
      label,
      target,
      "pending",
      expiresAt,
      now,
      now,
    );
    return vaultUseIntentResponse(getUseIntent(intentId), false);
  };

  const bindPreparedUseIntent = (payload = {}) => {
    requireDb();
    assertExactKeys(payload, [
      "intent_id",
      "interaction_id",
      "operation_id",
      "owner_chat_id",
      "session_id",
      "attempt_id",
      "run_id",
      "call_id",
    ]);
    const binding = {
      intent_id: normalizeUseId(
        payload.intent_id,
        "intent_id",
        USE_INTENT_ID_PATTERN,
      ),
      interaction_id: normalizeUseId(
        payload.interaction_id,
        "interaction_id",
      ),
      operation_id: normalizeUseId(
        payload.operation_id,
        "operation_id",
        VAULT_USE_OPERATION_ID_PATTERN,
      ),
      owner_chat_id: normalizeUseId(payload.owner_chat_id, "owner_chat_id"),
      session_id: normalizeUseId(payload.session_id, "session_id"),
      attempt_id: normalizeUseId(payload.attempt_id, "attempt_id"),
      run_id: normalizeUseId(payload.run_id, "run_id"),
      call_id: normalizeUseId(payload.call_id, "call_id"),
    };
    const row = getUseIntent(binding.intent_id);
    if (
      !row ||
      row.operation_id !== binding.operation_id ||
      row.owner_chat_id !== binding.owner_chat_id ||
      row.session_id !== binding.session_id ||
      row.attempt_id !== binding.attempt_id ||
      row.run_id !== binding.run_id ||
      row.call_id !== binding.call_id
    ) {
      throw errorWithCode(
        "interaction binding does not match the prepared intent",
        "vault_intent_conflict",
      );
    }
    if (row.interaction_id) {
      if (row.interaction_id !== binding.interaction_id) {
        throw errorWithCode(
          "intent is already bound to a different interaction",
          "vault_intent_conflict",
        );
      }
      return { handled: true, bound: true, replayed: true };
    }
    if (row.status !== "pending" || Number(row.expires_at) < Date.now()) {
      throw errorWithCode(
        "prepared intent cannot be bound",
        "vault_intent_conflict",
      );
    }
    const result = db
      .prepare(
        "UPDATE vault_use_intents SET interaction_id = ?, updated_at = ? " +
          "WHERE intent_id = ? AND interaction_id IS NULL AND status = 'pending'",
      )
      .run(binding.interaction_id, Date.now(), binding.intent_id);
    if (Number(result.changes) !== 1) {
      throw errorWithCode(
        "interaction binding changed concurrently",
        "vault_intent_conflict",
      );
    }
    return { handled: true, bound: true, replayed: false };
  };

  const showNativeUseConfirmation = async (row) => {
    const descriptor = {
      label: row.descriptor_label,
      sinkKind: row.sink_kind,
      target: row.descriptor_target,
    };
    if (typeof confirmUse === "function") {
      try {
        return (await confirmUse(descriptor)) === true;
      } catch (_error) {
        throw errorWithCode(
          "native confirmation is unavailable",
          "vault_confirmation_unavailable",
        );
      }
    }
    if (!dialog || typeof dialog.showMessageBox !== "function") {
      throw errorWithCode(
        "native confirmation is unavailable",
        "vault_confirmation_unavailable",
      );
    }
    const options = {
      type: "warning",
      title: "Allow secret use?",
      message: `Allow PuPu to use “${row.descriptor_label}” once?`,
      detail: `Destination: ${row.descriptor_target}`,
      buttons: ["Allow once", "Cancel"],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    };
    let result;
    try {
      const targetWindow =
        typeof getMainWindow === "function" ? getMainWindow() : null;
      result =
        targetWindow &&
        (typeof targetWindow.isDestroyed !== "function" ||
          !targetWindow.isDestroyed())
          ? await dialog.showMessageBox(targetWindow, options)
          : await dialog.showMessageBox(options);
    } catch (_error) {
      throw errorWithCode(
        "native confirmation is unavailable",
        "vault_confirmation_unavailable",
      );
    }
    return result && result.response === 0;
  };

  const confirmBoundUseIntent = async ({
    interactionId,
    rendererApproved,
  } = {}) => {
    requireDb();
    const normalizedInteractionId = normalizeUseId(
      interactionId,
      "interaction_id",
    );
    if (typeof rendererApproved !== "boolean") {
      throw errorWithCode(
        "renderer approval must be boolean",
        "invalid_vault_use_request",
      );
    }
    const initial = db
      .prepare(
        "SELECT * FROM vault_use_intents WHERE interaction_id = ?",
      )
      .get(normalizedInteractionId);
    if (!initial) return { handled: false, approved: rendererApproved };

    const existingFlight = confirmationInFlight.get(normalizedInteractionId);
    if (existingFlight) {
      if (existingFlight.rendererApproved !== rendererApproved) {
        throw errorWithCode(
          "confirmation decision changed concurrently",
          "vault_intent_conflict",
        );
      }
      return existingFlight.promise;
    }

    const decisionPromise = (async () => {
      let row = db
        .prepare(
          "SELECT * FROM vault_use_intents WHERE interaction_id = ?",
        )
        .get(normalizedInteractionId);
      if (!row) return { handled: false, approved: rendererApproved };
      if (row.status === "approved") {
        if (!rendererApproved) {
          throw errorWithCode(
            "confirmation decision conflicts with the stored approval",
            "vault_intent_conflict",
          );
        }
        return { handled: true, approved: true, status: "approved" };
      }
      if (row.status === "denied") {
        if (rendererApproved) {
          throw errorWithCode(
            "confirmation decision conflicts with the stored denial",
            "vault_intent_conflict",
          );
        }
        return { handled: true, approved: false, status: "denied" };
      }
      if (row.status !== "pending" || Number(row.expires_at) < Date.now()) {
        throw errorWithCode(
          "vault use intent is no longer confirmable",
          "vault_intent_conflict",
        );
      }

      if (!rendererApproved) {
        transitionUseIntent(row.intent_id, "pending", "denied", Date.now());
        return { handled: true, approved: false, status: "denied" };
      }

      const nativeApproved = await showNativeUseConfirmation(row);
      row = getUseIntent(row.intent_id);
      if (!row || row.status !== "pending") {
        throw errorWithCode(
          "vault use intent changed during confirmation",
          "vault_intent_conflict",
        );
      }
      const decisionTime = Date.now();
      if (nativeApproved) {
        db.tx(() => {
          // The native one-time decision is the first sink authorization for
          // captured secrets. No renderer/sidecar-supplied grant id is trusted.
          ensureUseIntentGrants(row, decisionTime);
          transitionUseIntent(
            row.intent_id,
            "pending",
            "approved",
            decisionTime,
          );
        });
      } else {
        transitionUseIntent(
          row.intent_id,
          "pending",
          "denied",
          decisionTime,
        );
      }
      return {
        handled: true,
        approved: nativeApproved,
        status: nativeApproved ? "approved" : "denied",
      };
    })();
    confirmationInFlight.set(normalizedInteractionId, {
      rendererApproved,
      promise: decisionPromise,
    });
    try {
      return await decisionPromise;
    } finally {
      if (
        confirmationInFlight.get(normalizedInteractionId)?.promise ===
        decisionPromise
      ) {
        confirmationInFlight.delete(normalizedInteractionId);
      }
    }
  };

  const isBoundUseInteraction = (interactionId) => {
    requireDb();
    const normalizedInteractionId = normalizeUseId(
      interactionId,
      "interaction_id",
    );
    return Boolean(
      db
        .prepare(
          "SELECT intent_id FROM vault_use_intents WHERE interaction_id = ?",
        )
        .get(normalizedInteractionId),
    );
  };

  const executeUseIntent = async (payload) => {
    requireDb();
    const identity = normalizeExecutePayload(payload);
    const row = getUseIntent(identity.intent_id);
    if (
      !row ||
      !vaultUseIdentityMatchesRow(row, identity, {
        requirePrepareOperation: false,
      }) ||
      row.interaction_id !== identity.interaction_id
    ) {
      throw errorWithCode(
        "execution identity does not match the approved intent",
        "vault_intent_conflict",
      );
    }
    if (
      row.execute_operation_id &&
      row.execute_operation_id !== identity.operation_id
    ) {
      throw errorWithCode(
        "execution operation conflicts with the stored intent",
        "vault_intent_conflict",
      );
    }
    const terminalReceipt = getUseReceipt(row.intent_id);
    if (row.status === "complete" && terminalReceipt) {
      return vaultUseReceiptResponse(row, terminalReceipt, true);
    }
    if (row.status === "indeterminate") {
      throw errorWithCode(
        "vault use outcome is indeterminate",
        "vault_use_indeterminate",
      );
    }
    if (row.status === "executing") {
      const existingFlight = executionInFlight.get(row.intent_id);
      if (existingFlight) return existingFlight;
      throw errorWithCode(
        "vault use is already executing",
        "vault_use_in_progress",
      );
    }
    if (row.status !== "approved") {
      throw errorWithCode(
        "vault use is not approved",
        "vault_intent_conflict",
      );
    }
    if (Number(row.expires_at) < Date.now()) {
      throw errorWithCode(
        "vault use intent expired",
        "vault_intent_conflict",
      );
    }
    const executor =
      sinkExecutorsConfigured &&
      Object.prototype.hasOwnProperty.call(sinkExecutorMap, row.sink_kind)
        ? sinkExecutorMap[row.sink_kind]
        : null;
    if (typeof executor !== "function") {
      // Crucially, no decryption occurs on this branch.
      throw errorWithCode(
        "no reviewed executor is registered for this sink",
        "vault_sink_unavailable",
      );
    }

    const executionPromise = (async () => {
      const executionStart = Date.now();
      const claimed = db
        .prepare(
          "UPDATE vault_use_intents " +
            "SET execute_operation_id = ?, status = 'executing', updated_at = ? " +
            "WHERE intent_id = ? AND status = 'approved' " +
            "AND (execute_operation_id IS NULL OR execute_operation_id = ?)",
        )
        .run(
          identity.operation_id,
          executionStart,
          row.intent_id,
          identity.operation_id,
        );
      if (Number(claimed.changes) !== 1) {
        throw errorWithCode(
          "vault use execution claim changed concurrently",
          "vault_intent_conflict",
        );
      }
      let effectStarted = false;
      try {
        const storedHandles = JSON.parse(row.handles_json);
        const handleRows = resolveUseHandleRows({
          ownerChatId: row.owner_chat_id,
          sinkKind: row.sink_kind,
          handles: storedHandles,
          requireGrant: true,
        });
        const secrets = handleRows.map((handleRow) => ({
          field: handleRow.field,
          plaintext: decryptCiphertextForSink(handleRow.ciphertext),
        }));
        effectStarted = true;
        // The executor is main-process-only. Its result crosses HTTP only after
        // recursive secret/handle redaction, type filtering and a 32KiB bound.
        const executorResult = await executor({
          intentId: row.intent_id,
          interactionId: row.interaction_id,
          ownerChatId: row.owner_chat_id,
          sessionId: row.session_id,
          attemptId: row.attempt_id,
          runId: row.run_id,
          callId: row.call_id,
          sinkKind: row.sink_kind,
          auditArguments: identity.audit_arguments,
          targetHash: row.target_hash,
          schemaFingerprint: row.schema_fingerprint,
          secrets,
        });
        const safeResultJson = sanitizeVaultExecutorResult({
          result: executorResult,
          plaintexts: secrets.map((item) => item.plaintext),
          handles: storedHandles.map((item) => item.handle),
        });
        const receipt = markUseTerminal(
          row.intent_id,
          "executing",
          "complete",
          "executed",
          safeResultJson,
        );
        return vaultUseReceiptResponse(
          getUseIntent(row.intent_id),
          receipt,
          false,
        );
      } catch (_error) {
        // Once executing has been persisted, any failure is treated as
        // indeterminate. Even a pre-effect decrypt failure stays fail-closed;
        // the `effectStarted` flag is intentionally not exposed or persisted.
        void effectStarted;
        try {
          const latest = getUseIntent(row.intent_id);
          if (latest && latest.status === "executing") {
            markUseTerminal(
              row.intent_id,
              "executing",
              "indeterminate",
              "execution_indeterminate",
            );
          }
        } catch (_stateError) {
          // The durable executing row is recovered to indeterminate at init.
        }
        throw errorWithCode(
          "vault use outcome is indeterminate",
          "vault_use_indeterminate",
        );
      }
    })();
    executionInFlight.set(row.intent_id, executionPromise);
    try {
      return await executionPromise;
    } finally {
      if (executionInFlight.get(row.intent_id) === executionPromise) {
        executionInFlight.delete(row.intent_id);
      }
    }
  };

  const cancelUseIntent = (payload) => {
    requireDb();
    const identity = normalizeCancelPayload(payload);
    const row = getUseIntent(identity.intent_id);
    if (
      !row ||
      row.owner_chat_id !== identity.owner_chat_id ||
      row.session_id !== identity.session_id ||
      row.attempt_id !== identity.attempt_id ||
      row.run_id !== identity.run_id ||
      row.call_id !== identity.call_id ||
      row.interaction_id !== identity.interaction_id
    ) {
      throw errorWithCode(
        "cancellation identity does not match the intent",
        "vault_intent_conflict",
      );
    }
    if (
      row.cancel_operation_id &&
      row.cancel_operation_id !== identity.operation_id
    ) {
      throw errorWithCode(
        "cancellation operation conflicts with the stored intent",
        "vault_intent_conflict",
      );
    }
    if (!row.cancel_operation_id) {
      const claimed = db
        .prepare(
          "UPDATE vault_use_intents SET cancel_operation_id = ?, updated_at = ? " +
            "WHERE intent_id = ? AND cancel_operation_id IS NULL",
        )
        .run(identity.operation_id, Date.now(), row.intent_id);
      if (Number(claimed.changes) !== 1) {
        throw errorWithCode(
          "cancellation operation changed concurrently",
          "vault_intent_conflict",
        );
      }
      row.cancel_operation_id = identity.operation_id;
    }
    const existingReceipt = getUseReceipt(row.intent_id);
    if (row.status === "cancelled" && existingReceipt) {
      return vaultUseReceiptResponse(row, existingReceipt, true);
    }
    if (row.status === "complete" && existingReceipt) {
      return vaultUseReceiptResponse(row, existingReceipt, true);
    }
    if (row.status === "indeterminate") {
      throw errorWithCode(
        "vault use outcome is indeterminate",
        "vault_use_indeterminate",
      );
    }
    if (row.status === "executing") {
      throw errorWithCode(
        "an executing vault use cannot be cancelled safely",
        "vault_use_in_progress",
      );
    }
    if (row.status === "denied") {
      return {
        ok: true,
        version: VAULT_USE_PROTOCOL_VERSION,
        intent_id: row.intent_id,
        status: "denied",
        replayed: true,
      };
    }
    if (row.status !== "pending" && row.status !== "approved") {
      throw errorWithCode(
        "vault use intent cannot be cancelled",
        "vault_intent_conflict",
      );
    }
    const receipt = markUseTerminal(
      row.intent_id,
      row.status,
      "cancelled",
      identity.reason_code,
    );
    return vaultUseReceiptResponse(getUseIntent(row.intent_id), receipt, false);
  };

  const recoverExecutingUseIntents = () => {
    const rows = db
      .prepare(
        "SELECT intent_id FROM vault_use_intents WHERE status = 'executing'",
      )
      .all();
    for (const row of rows) {
      markUseTerminal(
        row.intent_id,
        "executing",
        "indeterminate",
        "process_recovery_indeterminate",
      );
    }
  };

  // Main-process-only deletion hook for the durable chat deletion outbox.
  // Vault-use state is audit metadata, not the secret itself: deleting it must
  // never cascade into vault_secrets or vault_grants. A confirmation dialog or
  // sink effect that is currently in flight makes cleanup retryable instead of
  // racing a native decision / losing the durable result of a possible effect.
  // Otherwise intents and their receipts are hard-deleted together; this is
  // naturally idempotent and removes every owner_chat_id reference atomically.
  const deleteUseStateForOwnerChat = (ownerChatId) => {
    requireDb();
    const normalizedOwnerChatId = normalizeUseId(
      ownerChatId,
      "owner_chat_id",
    );
    const rows = db
      .prepare(
        "SELECT intent_id, interaction_id, status " +
          "FROM vault_use_intents WHERE owner_chat_id = ?",
      )
      .all(normalizedOwnerChatId);
    const hasInFlightUse = rows.some(
      (row) =>
        row.status === "executing" ||
        executionInFlight.has(row.intent_id) ||
        (row.interaction_id && confirmationInFlight.has(row.interaction_id)),
    );
    if (hasInFlightUse) {
      throw errorWithCode(
        "vault use cleanup must be retried after the active operation finishes",
        "vault_use_cleanup_in_progress",
      );
    }
    return db.tx(() => {
      const receiptResult = db
        .prepare(
          "DELETE FROM vault_use_receipts WHERE intent_id IN (" +
            "SELECT intent_id FROM vault_use_intents WHERE owner_chat_id = ?)",
        )
        .run(normalizedOwnerChatId);
      const intentResult = db
        .prepare("DELETE FROM vault_use_intents WHERE owner_chat_id = ?")
        .run(normalizedOwnerChatId);
      return {
        ok: true,
        ownerChatId: normalizedOwnerChatId,
        deletedIntents: Number(intentResult.changes),
        deletedReceipts: Number(receiptResult.changes),
      };
    });
  };

  // ---- public API ----------------------------------------------------------

  // Foreign-key enforcement is a SECURITY invariant here (the grant cascade),
  // not a nicety: if SQLite will not enforce it we refuse to open the vault
  // and fall into degraded mode rather than run with detachable grants.
  const assertForeignKeysEnforced = () => {
    const read = () => {
      try {
        const row = db.prepare("PRAGMA foreign_keys").get();
        return row ? Number(row.foreign_keys) === 1 : false;
      } catch (_error) {
        return false;
      }
    };
    if (read()) return;
    try {
      db.exec("PRAGMA foreign_keys = ON;");
    } catch (_error) {
      // fall through to the coded failure below
    }
    if (!read()) {
      throw errorWithCode(
        "foreign key enforcement is unavailable",
        "vault_integrity_unavailable",
      );
    }
  };

  const grantsSchemaIsCurrent = (columns) => {
    if (!columns.includes("sink_kind") || columns.includes("grantee")) {
      return false;
    }
    let foreignKeys = [];
    try {
      foreignKeys = db.prepare("PRAGMA foreign_key_list(vault_grants)").all();
    } catch (_error) {
      return false;
    }
    return foreignKeys.some(
      (fk) =>
        fk.table === "vault_secrets" &&
        fk.from === "handle" &&
        fk.to === "handle" &&
        String(fk.on_delete).toUpperCase() === "CASCADE",
    );
  };

  // Guarded, idempotent grants-table convergence. Memory V2 is UNSHIPPED, so
  // the only vault_grants tables in the wild are P0 preflight tables with the
  // old free-text `grantee` column and no foreign key. Those are rebuilt into
  // the hardened shape, carrying over ONLY rows that are already valid under
  // the new contract (live handle + recognized sink kind); a preflight grant
  // that cannot be expressed under the closed enum is dropped, which is safe
  // because a grant alone confers nothing without a freshly native-approved
  // intent and a registered sink executor. SECRETS ARE NEVER TOUCHED here.
  const ensureGrantsSchema = () => {
    const columns = db
      .prepare("PRAGMA table_info(vault_grants)")
      .all()
      .map((row) => row.name);

    if (columns.length === 0) {
      db.exec(VAULT_GRANTS_TABLE_SQL("vault_grants"));
      db.exec(VAULT_GRANTS_INDEX_SQL);
      return;
    }
    if (grantsSchemaIsCurrent(columns)) return;

    const sinkColumn = columns.includes("sink_kind")
      ? "sink_kind"
      : columns.includes("grantee")
        ? "grantee"
        : null;
    const carryable =
      sinkColumn !== null &&
      columns.includes("grant_id") &&
      columns.includes("handle") &&
      columns.includes("created_at");

    db.tx(() => {
      // The rebuild is atomic (DDL inside the transaction), so a leftover
      // scratch table should be impossible — drop it anyway so a half-migrated
      // file from any cause converges instead of latching into degraded mode.
      db.exec("DROP TABLE IF EXISTS vault_grants_rebuilt");
      db.exec(VAULT_GRANTS_TABLE_SQL("vault_grants_rebuilt"));
      if (carryable) {
        db.prepare(
          "INSERT INTO vault_grants_rebuilt" +
            "(grant_id, handle, sink_kind, created_at) " +
            `SELECT g.grant_id, g.handle, g.${sinkColumn}, g.created_at ` +
            "FROM vault_grants g " +
            "WHERE g.handle IN (SELECT handle FROM vault_secrets) " +
            `AND g.${sinkColumn} IN (${SINK_KINDS.map(() => "?").join(", ")})`,
        ).run(...SINK_KINDS);
      }
      db.exec("DROP TABLE vault_grants");
      db.exec("ALTER TABLE vault_grants_rebuilt RENAME TO vault_grants");
      db.exec(VAULT_GRANTS_INDEX_SQL);
    });
  };

  const ensureUseReceiptSchema = () => {
    const intentColumns = db
      .prepare("PRAGMA table_info(vault_use_intents)")
      .all()
      .map((row) => row.name);
    if (!intentColumns.includes("execute_operation_id")) {
      db.exec("ALTER TABLE vault_use_intents ADD COLUMN execute_operation_id TEXT");
    }
    if (!intentColumns.includes("cancel_operation_id")) {
      db.exec("ALTER TABLE vault_use_intents ADD COLUMN cancel_operation_id TEXT");
    }
    const columns = db
      .prepare("PRAGMA table_info(vault_use_receipts)")
      .all()
      .map((row) => row.name);
    if (!columns.includes("result_json")) {
      db.exec(
        "ALTER TABLE vault_use_receipts " +
          "ADD COLUMN result_json TEXT NOT NULL DEFAULT '{}'",
      );
    }
  };

  const init = () => {
    if (db) return;
    try {
      const userDataDir = app.getPath("userData");
      const dbPath = path.join(userDataDir, DB_FILE_NAME);
      db = createSettingsDb({ dbPath, sqlite });
      assertForeignKeysEnforced();
      db.exec(VAULT_BASE_SCHEMA_SQL);
      ensureGrantsSchema();
      ensureUseReceiptSchema();
      recoverExecutingUseIntents();
      degradedReason = null;
      secretStorageStatus = probeSecretStorage();
    } catch (error) {
      // Corruption policy mirrors settings_storage: NEVER delete the file;
      // enter degraded mode and fail every call with a stable code.
      if (db) {
        try {
          db.close();
        } catch (_closeError) {
          // connection already unusable
        }
      }
      db = null;
      secretStorageStatus = SECRET_STORAGE_STATUS.UNAVAILABLE;
      degradedReason = "vault-init-failed";
      console.error(
        "[memory-vault] init failed; entering degraded mode:",
        error.code || "uncoded_error",
      );
    }
  };

  // deposit — encrypt-and-store. Returns the opaque handle + descriptor
  // fields ONLY: never plaintext, never ciphertext.
  const deposit = (payload = {}) => {
    if (!isPlainObject(payload)) {
      throw errorWithCode("deposit payload must be an object", "invalid_payload");
    }
    requireDb();
    const { operationId, scopeKind, scopeId, label, plaintext } = payload;
    validateOperationId(operationId);
    validateScopeKind(scopeKind);
    validateScopeId(scopeId);
    const normalizedLabel = normalizeAndValidateLabel(label);
    validatePlaintext(plaintext);
    // The label is the ONE cleartext field a deposit carries. It is stored
    // unencrypted in vault_secrets, returned by listDescriptors (which needs
    // no secret authority), and hashed into the operation receipt. A label
    // that embeds the plaintext — in any supported encoding, at any position,
    // at any secret length — would therefore smuggle the secret into all
    // three cleartext surfaces at once. Reject before encryptPlaintext and
    // before runIdempotentMutation, so a rejected deposit leaves NO
    // ciphertext, NO row and NO receipt behind.
    //
    // The error is a fixed string with a stable code: it never echoes the
    // label, the plaintext, the matched variant or its offset, because the
    // caller that triggered this already holds the secret and anything more
    // specific would turn the guard itself into an oracle.
    if (containsAnyVariant(normalizedLabel, secretVariants([plaintext]))) {
      throw errorWithCode(
        "label must not contain the secret value",
        "invalid_label",
      );
    }
    // Fail closed BEFORE writing anything (and before the receipt): an
    // unavailable safeStorage means no row, no receipt, a coded rejection.
    const ciphertext = encryptPlaintext(plaintext);
    return runIdempotentMutation(
      "deposit",
      operationId,
      // NON-SECRET fingerprint input only — plaintext is deliberately absent.
      { scopeKind, scopeId, label: normalizedLabel },
      () => {
        const handle = newHandle();
        const now = Date.now();
        db.prepare(
          "INSERT INTO vault_secrets" +
            "(handle, scope_kind, scope_id, label, ciphertext, created_at, updated_at) " +
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
        ).run(handle, scopeKind, scopeId, normalizedLabel, ciphertext, now, now);
        return {
          ok: true,
          status: "stored",
          handle,
          scopeKind,
          scopeId,
          label: normalizedLabel,
          createdAt: now,
        };
      },
    );
  };

  // listDescriptors — non-secret descriptors only (no ciphertext column is
  // ever selected), and STRICTLY scope-bound: BOTH scopeKind and scopeId are
  // required and matched exactly (`=`, never LIKE/prefix). There is no
  // "list everything" and no partial filter — a missing or partial scope is a
  // coded rejection, so global enumeration of the vault is impossible through
  // this API.
  const listDescriptors = (filter = {}) => {
    requireDb();
    if (!isPlainObject(filter)) {
      throw errorWithCode("filter must be an object", "invalid_payload");
    }
    const { scopeKind, scopeId } = filter;
    validateScopeKind(scopeKind);
    validateScopeId(scopeId);
    const rows = db
      .prepare(
        "SELECT s.handle, s.scope_kind, s.scope_id, s.label, s.created_at, " +
          "s.updated_at, " +
          "(SELECT COUNT(*) FROM vault_grants g WHERE g.handle = s.handle) " +
          "AS grant_count " +
          "FROM vault_secrets s " +
          "WHERE s.scope_kind = ? AND s.scope_id = ? " +
          "ORDER BY s.created_at, s.handle",
      )
      .all(scopeKind, scopeId);
    return {
      ok: true,
      descriptors: rows.map((row) => ({
        handle: row.handle,
        scopeKind: row.scope_kind,
        scopeId: row.scope_id,
        label: row.label,
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
        grantCount: Number(row.grant_count),
      })),
    };
  };

  // deleteSecret — transactional cascade: grants for the handle are removed
  // in the same transaction as the secret row, and the surviving receipt is
  // non-secret (handle + counts only). The explicit DELETE is kept for the
  // revokedGrants count and as belt-and-braces; the ON DELETE CASCADE foreign
  // key is the authoritative guarantee that no grant can survive its secret.
  const deleteSecret = (payload = {}) => {
    if (!isPlainObject(payload)) {
      throw errorWithCode("delete payload must be an object", "invalid_payload");
    }
    requireDb();
    const { operationId, handle } = payload;
    validateOperationId(operationId);
    validateHandle(handle);
    return runIdempotentMutation("delete", operationId, { handle }, () => {
      const grantsResult = db
        .prepare("DELETE FROM vault_grants WHERE handle = ?")
        .run(handle);
      const secretResult = db
        .prepare("DELETE FROM vault_secrets WHERE handle = ?")
        .run(handle);
      return {
        ok: true,
        handle,
        deleted: Number(secretResult.changes) > 0,
        revokedGrants: Number(grantsResult.changes),
      };
    });
  };

  // grant — records that a CONTROLLED SINK KIND may be used for a handle. A
  // grant row alone confers nothing: each intent still needs native per-use
  // confirmation, exact identity binding and a reviewed registered executor.
  //
  // Scope binding: the caller must name the scope, and the handle is granted
  // only when it belongs to that EXACT (scopeKind, scopeId). A handle owned by
  // a different scope returns the SAME secret_not_found code as a nonexistent
  // one, so grant cannot be used as a cross-scope existence oracle.
  //
  // The result carries ONLY non-secret fields — every one of them was supplied
  // by the caller, plus the freshly minted grantId. Nothing is echoed back out
  // of the stored row (no label, no timestamps of the secret, no ciphertext).
  const grant = (payload = {}) => {
    if (!isPlainObject(payload)) {
      throw errorWithCode("grant payload must be an object", "invalid_payload");
    }
    requireDb();
    const { operationId, scopeKind, scopeId, handle, sinkKind } = payload;
    validateOperationId(operationId);
    validateScopeKind(scopeKind);
    validateScopeId(scopeId);
    validateHandle(handle);
    validateSinkKind(sinkKind);
    return runIdempotentMutation(
      "grant",
      operationId,
      { scopeKind, scopeId, handle, sinkKind },
      () => {
        const secret = db
          .prepare(
            "SELECT handle FROM vault_secrets " +
              "WHERE handle = ? AND scope_kind = ? AND scope_id = ?",
          )
          .get(handle, scopeKind, scopeId);
        if (!secret) {
          // Deliberately indistinguishable from "exists in another scope".
          throw errorWithCode(
            "no secret exists for the given handle in this scope",
            "secret_not_found",
          );
        }
        const grantId = newGrantId();
        const now = Date.now();
        db.prepare(
          "INSERT INTO vault_grants(grant_id, handle, sink_kind, created_at) " +
            "VALUES (?, ?, ?, ?)",
        ).run(grantId, handle, sinkKind, now);
        return {
          ok: true,
          grantId,
          handle,
          scopeKind,
          scopeId,
          sinkKind,
          createdAt: now,
        };
      },
    );
  };

  // revoke — removes a grant row. Revoking an unknown/already-revoked grant
  // succeeds with revoked:false (idempotent by construction, and the
  // operationId receipt additionally makes exact replays no-ops).
  const revoke = (payload = {}) => {
    if (!isPlainObject(payload)) {
      throw errorWithCode("revoke payload must be an object", "invalid_payload");
    }
    requireDb();
    const { operationId, grantId } = payload;
    validateOperationId(operationId);
    validateGrantId(grantId);
    return runIdempotentMutation("revoke", operationId, { grantId }, () => {
      const result = db
        .prepare("DELETE FROM vault_grants WHERE grant_id = ?")
        .run(grantId);
      return { ok: true, grantId, revoked: Number(result.changes) > 0 };
    });
  };

  const startSinkBroker = async () => {
    requireDb();
    // Never open an authenticated loopback listener the vault cannot serve.
    // An empty registry means every prepared intent would reach execute() only
    // to die at vault_sink_unavailable — so refuse to listen at all.
    if (!sinkExecutorsConfigured) {
      throw errorWithCode(
        "no reviewed sink executors are configured",
        "vault_sink_unavailable",
      );
    }
    if (sinkBroker?.getBootstrap()) {
      return sinkBroker.getBootstrap();
    }
    if (sinkBrokerStartPromise) return sinkBrokerStartPromise;
    if (!http || typeof http.createServer !== "function") {
      throw errorWithCode(
        "vault broker transport is unavailable",
        "vault_broker_unavailable",
      );
    }
    if (!sinkBroker) {
      sinkBroker = createVaultSinkBroker({
        http,
        crypto,
        onPrepare: prepareUseIntent,
        onExecute: executeUseIntent,
        onCancel: cancelUseIntent,
      });
    }
    sinkBrokerStartPromise = sinkBroker.start();
    try {
      const bootstrap = await sinkBrokerStartPromise;
      // Latch only on a real listener: a failed start must not permanently
      // lock configureSinkExecutors out.
      sinkBrokerEverStarted = true;
      return bootstrap;
    } finally {
      sinkBrokerStartPromise = null;
    }
  };

  const stopSinkBroker = async () => {
    const current = sinkBroker;
    sinkBroker = null;
    sinkBrokerStartPromise = null;
    if (current) await current.stop();
  };

  const getSinkBrokerBootstrap = () => {
    const bootstrap = sinkBroker?.getBootstrap();
    return bootstrap ? { ...bootstrap } : null;
  };

  // getStatus — control-plane availability ONLY. It deliberately reports NO
  // database row counts: a count is an unscoped observation of the whole
  // vault, so exposing it would hand any caller a cheap oracle for "does this
  // machine hold secrets / did that write land" across every scope. Callers
  // that legitimately need a number use the scope-bound listDescriptors.
  // Never throws.
  const getStatus = () => {
    if (!db) {
      return {
        ok: true,
        available: false,
        reason: degradedReason || "not-initialized",
        secretStorageStatus: SECRET_STORAGE_STATUS.UNAVAILABLE,
      };
    }
    return {
      ok: true,
      available: true,
      secretStorageStatus,
    };
  };

  // Shutdown order is a security requirement, not a style choice:
  //   1. stop the broker  — no new intent can be prepared/executed,
  //   2. drain executors  — SIGKILL every live worker process group SYNCHRONOUSLY
  //                         (will-quit does not await promises),
  //   3. close the DB     — only once nothing can still ask it to decrypt.
  // Closing the DB first would leave a worker holding plaintext while the
  // vault could no longer record or cancel its receipt.
  const close = () => {
    if (sinkBroker) void stopSinkBroker();
    drainSinkExecutors();
    confirmationInFlight.clear();
    executionInFlight.clear();
    if (db) {
      try {
        db.close();
      } catch (_error) {
        // connection already unusable
      }
      db = null;
    }
  };

  return {
    init,
    deposit,
    listDescriptors,
    deleteSecret,
    grant,
    revoke,
    prepareUseIntent,
    bindPreparedUseIntent,
    confirmBoundUseIntent,
    isBoundUseInteraction,
    executeUseIntent,
    cancelUseIntent,
    deleteUseStateForOwnerChat,
    // MAIN-PROCESS ONLY. Never registered as an IPC handler, never forwarded
    // through a preload bridge. See the registry comment above.
    configureSinkExecutors,
    startSinkBroker,
    stopSinkBroker,
    getSinkBrokerBootstrap,
    getStatus,
    close,
  };
};

module.exports = {
  createMemoryVaultService,
  MEMORY_VAULT_LIMITS,
  MEMORY_VAULT_SINK_KINDS: SINK_KINDS,
  MEMORY_VAULT_SCOPE_KINDS: SCOPE_KINDS,
  HANDLE_PATTERN,
  GRANT_ID_PATTERN,
  USE_INTENT_ID_PATTERN,
  USE_RECEIPT_ID_PATTERN,
  VAULT_USE_PROTOCOL_VERSION,
  VAULT_USE_GLOBAL_SCOPE_ID,
};

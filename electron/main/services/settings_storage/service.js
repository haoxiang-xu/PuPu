// Settings storage Phase 1A — main-process authority on SQLite
// (userData/settings.db, WAL). Plan:
// docs/architecture/settings-sqlite-migration-plan.md (§3.1 schema, §5 legacy
// migration state machine, §7 limits + corruption policy).
//
// Phase 1A scope: schema init, bootstrap snapshot, namespace get/set/delete,
// legacy import. Renderer business stores do NOT switch yet (that is Phase 1B).
//
// Logging policy (plan §4.4): log namespace names and error codes only — never
// namespace values.

const crypto = require("crypto");
const { createSettingsDb } = require("./db");

const DB_FILE_NAME = "settings.db";
const SCHEMA_VERSION = 1;
const SUPPORTED_LEGACY_MIGRATION_VERSION = 1;

// Input limits (plan §7.2) — centralized constants, covered by tests.
const SETTINGS_STORAGE_LIMITS = Object.freeze({
  NAMESPACE_PATTERN: /^[a-z0-9_.-]+$/,
  NAMESPACE_MAX_LENGTH: 100,
  NAMESPACE_VALUE_MAX_BYTES: 1024 * 1024, // 1 MiB per namespace JSON
  MIGRATION_PAYLOAD_MAX_BYTES: 10 * 1024 * 1024, // 10 MiB total migration payload
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
      .run(namespace, json, SCHEMA_VERSION, updatedAt, nextRevision);
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

  // ---- public API ----------------------------------------------------------

  const init = () => {
    if (db) return;
    try {
      const userDataDir = app.getPath("userData");
      dbPath = path.join(userDataDir, DB_FILE_NAME);
      db = createSettingsDb({ dbPath, sqlite });
      db.exec(SCHEMA_SQL);
      if (readMetaValue(META_KEYS.SCHEMA_VERSION) === undefined) {
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
    return {
      available: true,
      degraded: false,
      schemaVersion: schemaVersion === undefined ? SCHEMA_VERSION : schemaVersion,
      migration: getMigrationMeta(),
      namespaces,
      revisions,
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
    close,
  };
};

module.exports = {
  createSettingsStorageService,
  computeLegacyMigrationDigest,
  SETTINGS_STORAGE_LIMITS,
  SENSITIVE_MODEL_PROVIDER_KEYS,
};

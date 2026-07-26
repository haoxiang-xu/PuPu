/* global globalThis */
// Renderer settings repository — the single mode switch between SQLite-backed
// settings (Electron, Phase 1B+) and the legacy localStorage["settings"] root
// (browser dev / Jest / degraded Electron).
//
// Plan: docs/architecture/settings-sqlite-migration-plan.md (§2 authority
// model, §4.4 repository contract, §5 legacy migration state machine,
// §7 write queue + error policy, §11 frozen Phase 1A contracts).
//
// Contract (consumed by every converted store, T2-T5):
//   readSettingsRoot()                    sync, memory snapshot — do not mutate
//   readNamespace(namespace, fallback)    sync
//   replaceNamespace(namespace, value[, options])    Promise
//   updateNamespace(namespace, updater[, options])   Promise (local
//                                                    read-modify-write)
//     options.throwSyncWriteErrors — fallback mode only: a synchronous
//     localStorage write failure is rethrown synchronously instead of
//     rejecting. Opt-in for stores whose legacy writers called setItem bare
//     (runtime.js, appearance/storage.js) so quota errors keep propagating to
//     callers exactly as before the conversion. SQL mode ignores the option
//     (mutations there are asynchronous by design).
//   deleteNamespace(namespace)            Promise
//   subscribeSettings(listener)           returns unsubscribe
//   flushSettingsWrites()                 Promise, resolves when queue drains
//   getSettingsPersistenceStatus()        { mode, degraded, pendingWrites,
//                                           lastErrorCode, warnings,
//                                           secretStorageStatus,
//                                           configuredCredentials }
//
// Core semantics:
// - Getters are ALWAYS synchronous. SQL mode reads the in-memory snapshot;
//   fallback mode reads localStorage directly on every call (identical to the
//   pre-repository behavior, so existing store tests keep passing unchanged).
// - Mutations in SQL mode are optimistic: snapshot updates + subscriber
//   notification happen immediately, persistence goes through a single global
//   FIFO queue (same-namespace serialization for free), and a persistence
//   failure rolls the namespace back and notifies again. Failures are never
//   faked as success (§7.1).
// - The legacy migration is always the FIRST queued operation.
// - SQL mode never writes non-sensitive data to localStorage["settings"]
//   (§5.5 — no dual writes). The three provider secret fields are the
//   exception and live exclusively in settings_secret_adapter.js: this module
//   never reads them into its snapshot, never sends them over IPC, and
//   preserves them untouched when the fallback path rewrites the root.
// - Logs contain namespace names and error codes only — never values (§4.4).

import {
  settingsStorageBridge,
  parseSettingsStorageErrorCode,
} from "./bridges/settings_storage_bridge";
// NOTE (plan §6-Phase5): a settings reset must ALSO drop the structured stores'
// own SQL-mode in-memory mirrors (default toolkits, toolkit/tool auto-approve,
// computer-use consent) — they are seeded once from the bootstrap snapshot and
// never subscribe to this repository, so without an explicit reset they keep
// serving pre-reset consent / auto-approvals / default-toolkit selections for
// the rest of the session. That mirror-reset is orchestrated by the reset
// COORDINATION POINT (src/COMPONENTs/settings/local_storage) right after
// resetSettings() resolves — deliberately NOT here, so this low-level
// repository never reverse-depends on the higher-level stores (which already
// depend on it for computeSettingsMigrationDigest).

const SETTINGS_STORAGE_KEY = "settings";
export const SETTINGS_MIGRATION_MARKER_KEY = "pupu.settings_sql_migration.v1";

const SETTINGS_MIGRATION_VERSION = 1;
const MODEL_PROVIDERS_NAMESPACE = "model_providers";
const SENSITIVE_MODEL_PROVIDER_KEYS = Object.freeze([
  "openai_api_key",
  "anthropic_api_key",
  "custom_provider_secrets",
]);

// Phase 5 (plan §6-Phase5): the standalone non-sensitive legacy preference
// keys a settings reset strips from localStorage so a rollback to release N-1
// (where localStorage is authoritative again) does NOT revive stale settings.
// These mirror the STORAGE_KEY of each converted standalone store. The reset
// is a STRIP-clear, never localStorage.clear() — the secret fields (inside the
// `settings` root's model_providers namespace), the boot palette, the outbox
// keys and the uiTesting prefs (plan §1.3 exclusions) are all preserved.
// NOTE: `token_usage` is deliberately NOT listed here. The SQL reset preserves
// the token_usage_records table (token history is not a resettable preference),
// so the fallback path must likewise preserve its authoritative localStorage
// mirror — otherwise a reset would wipe usage history in fallback mode while
// keeping it in SQL mode. In SQL mode the localStorage `token_usage` key is a
// dead dual-kept mirror and harmlessly survives.
const LEGACY_RESETTABLE_STANDALONE_KEYS = Object.freeze([
  "default_toolkits",
  "toolkit_auto_approve",
  "computer_use_consent",
  "computer_use_enabled",
  "computer_use_local_beta_enabled",
  "agent_folder_tree_v1",
]);

// Mirrors SETTINGS_STORAGE_LIMITS in
// electron/main/services/settings_storage/service.js (§7.2). Used only for
// the boot-time pre-clean: a single illegal legacy key must be quarantined on
// this side, because the main-process import is all-or-nothing (§11.2-1).
const NAMESPACE_PATTERN = /^[a-z0-9_.-]{1,100}$/;
const NAMESPACE_VALUE_MAX_BYTES = 1024 * 1024;

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const hasOwn = (object, key) =>
  Object.prototype.hasOwnProperty.call(object, key);

const errorWithCode = (message, code) => {
  const error = new Error(`[${code}] ${message}`);
  error.code = code;
  return error;
};

const jsonClone = (value) => {
  const json = JSON.stringify(value);
  if (typeof json !== "string") {
    throw errorWithCode("value is not JSON-serializable", "invalid_value");
  }
  return JSON.parse(json);
};

const stripModelProviderSecrets = (value) => {
  if (!isPlainObject(value)) return value;
  const clone = { ...value };
  for (const key of SENSITIVE_MODEL_PROVIDER_KEYS) {
    delete clone[key];
  }
  return clone;
};

const toNullProtoMap = (source) => {
  const map = Object.create(null);
  if (isPlainObject(source) || (source && typeof source === "object")) {
    for (const key of Object.keys(source)) {
      map[key] = source[key];
    }
  }
  return map;
};

const hasLocalStorage = () =>
  typeof window !== "undefined" && !!window.localStorage;

const readLocalRoot = () => {
  if (!hasLocalStorage()) return {};
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(SETTINGS_STORAGE_KEY) || "{}",
    );
    return isPlainObject(parsed) ? parsed : {};
  } catch (_error) {
    return {};
  }
};

// ---------------------------------------------------------------------------
// canonical serialization + digest
// ---------------------------------------------------------------------------
// canonicalize() is a line-for-line mirror of the main-process implementation
// in electron/main/services/settings_storage/service.js — both sides MUST
// produce identical bytes for identical payloads (cross-implementation test
// in settings_repository.test.js keeps them locked together).

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

// Manual UTF-8 encoder: jest-environment-jsdom lacks TextEncoder, and the
// canonical string never contains lone surrogates (JSON.stringify escapes
// them since ES2019), so this matches Node's Buffer utf8 byte-for-byte.
const utf8Bytes = (str) => {
  const bytes = [];
  for (let i = 0; i < str.length; i += 1) {
    const code = str.codePointAt(i);
    if (code > 0xffff) i += 1;
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    } else if (code < 0x10000) {
      bytes.push(
        0xe0 | (code >> 12),
        0x80 | ((code >> 6) & 63),
        0x80 | (code & 63),
      );
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 63),
        0x80 | ((code >> 6) & 63),
        0x80 | (code & 63),
      );
    }
  }
  return new Uint8Array(bytes);
};

const utf8ByteLength = (str) => utf8Bytes(str).length;

const resolveSubtleCrypto = () => {
  if (
    typeof globalThis !== "undefined" &&
    globalThis.crypto &&
    globalThis.crypto.subtle
  ) {
    return globalThis.crypto.subtle;
  }
  if (typeof window !== "undefined" && window.crypto && window.crypto.subtle) {
    return window.crypto.subtle;
  }
  return null;
};

// sha256 hex over the canonical payload (minus any claimed digest field) —
// the renderer twin of computeLegacyMigrationDigest() in the main service.
// Returns null when WebCrypto is unavailable; the payload is then sent
// without a digest and the main process recomputes it (claimed digests are
// verified, never trusted, so omission is safe).
export const computeSettingsMigrationDigest = async (payload) => {
  const subtle = resolveSubtleCrypto();
  if (!subtle) return null;
  const { digest: _claimed, ...digestInput } = isPlainObject(payload)
    ? payload
    : {};
  // JSON round-trip first, mirroring the main process's migrateLegacy()
  // normalization (Dates → ISO strings etc.) before canonicalizing.
  const normalized = JSON.parse(JSON.stringify(digestInput));
  const canonical = canonicalize(normalized);
  const buffer = await subtle.digest("SHA-256", utf8Bytes(canonical));
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

// ---------------------------------------------------------------------------
// repository state
// ---------------------------------------------------------------------------

const listeners = new Set();
let state = null;

const createInitialState = () => ({
  mode: "localStorage", // "sql" | "localStorage"
  degraded: false,
  lastErrorCode: null,
  warnings: [], // { code, key?, errorCode? } — names/codes only, never values
  snapshot: null, // null-prototype namespace map (SQL mode only)
  revisions: Object.create(null),
  pendingWrites: 0,
  queueTail: Promise.resolve(),
  // Phase 4 (S3): non-sensitive secret-storage status carried on the degraded
  // channel. secretStorageStatus is the safeStorage gate-3 availability;
  // configuredCredentials is the provider_credentials identity list. Both are
  // captured from the bootstrap snapshot (SQL mode) and NEVER hold a secret
  // value or ciphertext.
  secretStorageStatus: "unavailable",
  configuredCredentials: [],
});

const notify = (namespace) => {
  listeners.forEach((listener) => {
    try {
      listener({ namespace });
    } catch (_error) {
      // listeners must not block the repository
    }
  });
};

const notifyMany = (namespaces) => {
  const seen = new Set();
  namespaces.forEach((namespace) => {
    if (seen.has(namespace)) return;
    seen.add(namespace);
    notify(namespace);
  });
};

// Single global FIFO write queue (§7.1). The returned promise carries the
// operation's real outcome to the caller; an internal no-op catch keeps
// ignored fire-and-forget rejections from surfacing as unhandled.
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
  const oldKeys = s.snapshot ? Object.keys(s.snapshot) : [];
  s.mode = "localStorage";
  s.degraded = true;
  if (errorCode) s.lastErrorCode = errorCode;
  s.snapshot = null;
  s.revisions = Object.create(null);
  notifyMany([...oldKeys, ...Object.keys(readLocalRoot())]);
};

// ---------------------------------------------------------------------------
// legacy pre-clean + migration (§5, §11.2-1, §11.5)
// ---------------------------------------------------------------------------

// The main-process import is all-or-nothing: one illegal top-level key (bad
// characters, "__proto__", oversize value) would permanently fail migration.
// Quarantine such keys on this side — they stay in localStorage, are recorded
// as warnings (key names only), and never enter the payload or the snapshot.
const readAndPrecleanLegacyRoot = (warnings) => {
  let raw = null;
  if (hasLocalStorage()) {
    try {
      raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    } catch (_error) {
      raw = null;
    }
  }
  let root = {};
  if (raw != null && raw !== "") {
    try {
      const parsed = JSON.parse(raw);
      if (isPlainObject(parsed)) {
        root = parsed;
      } else {
        warnings.push({ code: "legacy_root_invalid" });
      }
    } catch (_error) {
      warnings.push({ code: "legacy_root_corrupt" });
    }
  }
  const clean = Object.create(null);
  for (const key of Object.keys(root)) {
    if (key === "__proto__" || !NAMESPACE_PATTERN.test(key)) {
      warnings.push({ code: "legacy_key_quarantined", key });
      continue;
    }
    let value = root[key];
    if (key === MODEL_PROVIDERS_NAMESPACE) {
      if (isPlainObject(value)) {
        value = stripModelProviderSecrets(value);
      } else {
        // A tampered non-object branch (e.g. an array smuggling
        // {openai_api_key: …} elements) cannot be secret-stripped field by
        // field and is unusable by every consumer — replace it with {} so no
        // secret can reach the migration payload or the snapshot. The
        // original blob stays in localStorage untouched.
        warnings.push({ code: "legacy_model_providers_invalid", key });
        value = {};
      }
    }
    let json;
    try {
      json = JSON.stringify(value);
    } catch (_error) {
      warnings.push({ code: "legacy_value_unserializable", key });
      continue;
    }
    if (typeof json !== "string") {
      warnings.push({ code: "legacy_value_unserializable", key });
      continue;
    }
    if (utf8ByteLength(json) > NAMESPACE_VALUE_MAX_BYTES) {
      warnings.push({ code: "legacy_value_too_large", key });
      continue;
    }
    clean[key] = value;
  }
  return clean;
};

const writeMigrationMarker = (digest, completedAt) => {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.setItem(
      SETTINGS_MIGRATION_MARKER_KEY,
      JSON.stringify({
        digest: digest || null,
        completedAt: completedAt || Date.now(),
      }),
    );
  } catch (_error) {
    // marker is best-effort; migration state in SQL meta stays authoritative
  }
};

const rebuildSnapshotFromBootstrap = (s) => {
  const snapshot = settingsStorageBridge.bootstrap();
  if (!snapshot || snapshot.available === false || snapshot.degraded === true) {
    degradeToFallback(s, "settings_storage_unavailable");
    return;
  }
  const oldKeys = s.snapshot ? Object.keys(s.snapshot) : [];
  s.snapshot = toNullProtoMap(snapshot.namespaces || {});
  s.revisions = toNullProtoMap(snapshot.revisions || {});
  notifyMany([...oldKeys, ...Object.keys(s.snapshot)]);
};

const runLegacyMigration = async (s) => {
  if (state !== s) return; // repository was reset (tests)
  // Detached plain-object copy of the (pre-cleaned, secret-stripped) snapshot.
  const settingsRoot = {};
  for (const key of Object.keys(s.snapshot)) {
    settingsRoot[key] = s.snapshot[key];
  }
  // Phase 1B payload (§5.2): settingsRoot + reserved empty standalone region.
  const payloadBase = {
    migrationVersion: SETTINGS_MIGRATION_VERSION,
    settingsRoot,
    standalone: {},
  };
  let digest = null;
  try {
    digest = await computeSettingsMigrationDigest(payloadBase);
  } catch (_error) {
    digest = null;
  }
  const payload = digest ? { ...payloadBase, digest } : payloadBase;
  try {
    const result = await settingsStorageBridge.migrateLegacy(payload);
    if (state !== s) return;
    const status = result ? result.status : undefined;
    if (status === "complete" || status === "already-complete") {
      writeMigrationMarker(
        result.digest || digest,
        result.migratedAt || Date.now(),
      );
    } else if (status === "refused-stale-digest") {
      // SQL already holds newer authoritative data — do NOT write the marker;
      // rebuild the snapshot from SQL and notify subscribers (§11.5).
      s.warnings.push({ code: "migration_refused_stale_digest" });
      console.warn(
        "[settings-repository] legacy migration refused (stale digest); " +
          "rebuilding snapshot from SQL",
      );
      rebuildSnapshotFromBootstrap(s);
    } else {
      // An unrecognized resolution leaves the migration outcome unknown —
      // treat it exactly like a rejection: staying in SQL mode would let
      // later mutations persist rows while migration meta says not_started,
      // and the next bootstrap would then take that partial store as
      // authoritative (namespaces non-empty ⇒ SQL wins) and silently drop
      // every untouched legacy namespace.
      s.warnings.push({ code: "migration_unknown_status" });
      console.warn(
        "[settings-repository] legacy migration returned an unknown status; " +
          "degrading to localStorage fallback",
      );
      degradeToFallback(s, "migration_unknown_status");
    }
  } catch (error) {
    if (state !== s) return;
    const code = parseSettingsStorageErrorCode(error) || "settings_storage_error";
    // Any migration failure leaves localStorage authoritative (retry next
    // boot). Persisting later mutations to SQL before a completed migration
    // would make a partial SQL store look authoritative on the next bootstrap
    // (namespaces non-empty ⇒ SQL wins) and silently drop every other
    // namespace — so the whole session degrades to the localStorage backend.
    s.warnings.push({ code: "migration_failed", errorCode: code });
    console.warn("[settings-repository] legacy migration failed:", code);
    degradeToFallback(s, code);
  }
};

// ---------------------------------------------------------------------------
// lazy init (no import side effects)
// ---------------------------------------------------------------------------

const ensureInit = () => {
  if (state) return state;
  const s = createInitialState();
  state = s;
  if (!settingsStorageBridge.isAvailable()) {
    // Browser dev / Jest: plain localStorage fallback, not degraded.
    return s;
  }
  const snapshot = settingsStorageBridge.bootstrap();
  if (!snapshot || snapshot.available === false || snapshot.degraded === true) {
    s.degraded = true;
    s.lastErrorCode = "settings_storage_unavailable";
    console.warn(
      "[settings-repository] settings storage unavailable at bootstrap; " +
        "using localStorage fallback",
    );
    return s;
  }
  s.mode = "sql";
  // Phase 4 (S3): capture the non-sensitive secret-storage signals for the
  // status/degraded channel. Fail-closed defaults on a missing/malformed field
  // (older main process, or a snapshot that predates S3).
  s.secretStorageStatus =
    snapshot.secretStorageStatus === "available" ? "available" : "unavailable";
  s.configuredCredentials = Array.isArray(snapshot.configuredCredentials)
    ? snapshot.configuredCredentials.filter(
        (id) => typeof id === "string" && id.length > 0,
      )
    : [];
  // isPlainObject accepts null-prototype maps (it only rejects null/arrays).
  const namespaces = isPlainObject(snapshot.namespaces)
    ? snapshot.namespaces
    : {};
  const migrationComplete =
    !!snapshot.migration && snapshot.migration.state === "complete";
  const hasNamespaces = Object.keys(namespaces).length > 0;
  if (migrationComplete || hasNamespaces) {
    // SQL is authoritative — legacy localStorage values are ignored.
    s.snapshot = toNullProtoMap(namespaces);
    s.revisions = toNullProtoMap(snapshot.revisions || {});
    return s;
  }
  // Empty database on first boot after upgrade: seed the snapshot from the
  // legacy root and queue the migration as the first persistence operation.
  s.snapshot = readAndPrecleanLegacyRoot(s.warnings);
  enqueue(s, () => runLegacyMigration(s));
  return s;
};

// ---------------------------------------------------------------------------
// fallback (localStorage) write path — synchronous, legacy-identical
// ---------------------------------------------------------------------------

const writeLocalRoot = (root) => {
  window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(root));
};

// The repository never owns the three secret fields: incoming values are
// stripped of them and any secrets already stored are preserved verbatim, so
// a read-modify-write round trip through the repository can never erase what
// only settings_secret_adapter.js is allowed to touch.
const mergePreservedSecrets = (existingProviders, nextValue) => {
  const next = stripModelProviderSecrets(nextValue);
  if (!isPlainObject(next) || !isPlainObject(existingProviders)) return next;
  for (const key of SENSITIVE_MODEL_PROVIDER_KEYS) {
    if (hasOwn(existingProviders, key)) {
      next[key] = existingProviders[key];
    }
  }
  return next;
};

const fallbackSetNamespace = (s, namespace, value) => {
  if (!hasLocalStorage()) {
    throw errorWithCode(
      `namespace "${namespace}": localStorage is unavailable`,
      "localstorage_unavailable",
    );
  }
  const root = readLocalRoot();
  if (namespace === MODEL_PROVIDERS_NAMESPACE) {
    root[namespace] = mergePreservedSecrets(root[namespace], value);
  } else {
    root[namespace] = value;
  }
  try {
    writeLocalRoot(root);
  } catch (_error) {
    s.lastErrorCode = "localstorage_write_failed";
    throw errorWithCode(
      `namespace "${namespace}": localStorage write failed`,
      "localstorage_write_failed",
    );
  }
  notify(namespace);
  return { ok: true, namespace };
};

const fallbackDeleteNamespace = (s, namespace) => {
  if (!hasLocalStorage()) {
    throw errorWithCode(
      `namespace "${namespace}": localStorage is unavailable`,
      "localstorage_unavailable",
    );
  }
  const root = readLocalRoot();
  const existed = hasOwn(root, namespace);
  if (namespace === MODEL_PROVIDERS_NAMESPACE && isPlainObject(root[namespace])) {
    // Deleting the namespace must not destroy adapter-owned secrets: keep a
    // residual object holding only the secret fields (if any exist).
    const residual = {};
    for (const key of SENSITIVE_MODEL_PROVIDER_KEYS) {
      if (hasOwn(root[namespace], key)) {
        residual[key] = root[namespace][key];
      }
    }
    if (Object.keys(residual).length > 0) {
      root[namespace] = residual;
    } else {
      delete root[namespace];
    }
  } else {
    delete root[namespace];
  }
  try {
    writeLocalRoot(root);
  } catch (_error) {
    s.lastErrorCode = "localstorage_write_failed";
    throw errorWithCode(
      `namespace "${namespace}": localStorage write failed`,
      "localstorage_write_failed",
    );
  }
  notify(namespace);
  return { ok: true, namespace, deleted: existed };
};

// ---------------------------------------------------------------------------
// public API
// ---------------------------------------------------------------------------

export const readSettingsRoot = () => {
  const s = ensureInit();
  if (s.mode === "sql") {
    // Shallow copy so callers can't add/remove namespaces on the snapshot;
    // namespace values are shared references — do not mutate them.
    return { ...s.snapshot };
  }
  const root = readLocalRoot();
  if (isPlainObject(root[MODEL_PROVIDERS_NAMESPACE])) {
    root[MODEL_PROVIDERS_NAMESPACE] = stripModelProviderSecrets(
      root[MODEL_PROVIDERS_NAMESPACE],
    );
  }
  return root;
};

export const readNamespace = (namespace, fallback) => {
  const s = ensureInit();
  if (s.mode === "sql") {
    return hasOwn(s.snapshot, namespace) ? s.snapshot[namespace] : fallback;
  }
  const root = readLocalRoot();
  if (!hasOwn(root, namespace)) return fallback;
  return namespace === MODEL_PROVIDERS_NAMESPACE
    ? stripModelProviderSecrets(root[namespace])
    : root[namespace];
};

export const replaceNamespace = (namespace, value, options) => {
  const s = ensureInit();
  if (typeof namespace !== "string" || namespace.length === 0) {
    return Promise.reject(
      errorWithCode("namespace must be a non-empty string", "invalid_namespace"),
    );
  }
  if (namespace === "__proto__") {
    return Promise.reject(
      errorWithCode('"__proto__" is not a legal namespace', "invalid_namespace"),
    );
  }
  let cloned;
  try {
    cloned = jsonClone(value);
  } catch (error) {
    return Promise.reject(error);
  }
  // The model_providers namespace is structurally a plain object co-owned
  // with settings_secret_adapter. A non-object replacement can neither be
  // secret-stripped (SQL/IPC side) nor merge-preserve the adapter-owned
  // secret fields (fallback side) — writing it would erase what only the
  // adapter may touch, violating the "can never erase" guarantee. Reject it.
  if (namespace === MODEL_PROVIDERS_NAMESPACE && !isPlainObject(cloned)) {
    return Promise.reject(
      errorWithCode(
        'namespace "model_providers" value must be a plain object',
        "invalid_value",
      ),
    );
  }

  if (s.mode === "localStorage") {
    try {
      return Promise.resolve(fallbackSetNamespace(s, namespace, cloned));
    } catch (error) {
      if (
        options &&
        options.throwSyncWriteErrors &&
        error &&
        error.code === "localstorage_write_failed"
      ) {
        // Legacy-parity opt-in: the pre-repository writers of these stores
        // called localStorage.setItem bare, so quota errors propagated
        // synchronously to the caller. lastErrorCode is already recorded.
        throw error;
      }
      return Promise.reject(error);
    }
  }

  // SQL mode: optimistic snapshot update + queued IPC persistence.
  const written =
    namespace === MODEL_PROVIDERS_NAMESPACE
      ? stripModelProviderSecrets(cloned)
      : cloned;
  const hadPrev = hasOwn(s.snapshot, namespace);
  const prev = s.snapshot[namespace];
  s.snapshot[namespace] = written;
  notify(namespace);

  return enqueue(s, async () => {
    if (state !== s) return { ok: false, namespace };
    if (s.mode !== "sql") {
      // Degraded after this mutation was queued (failed migration):
      // honor the write against the now-authoritative localStorage backend.
      return fallbackSetNamespace(s, namespace, written);
    }
    try {
      const ack = await settingsStorageBridge.setNamespace(namespace, written);
      if (state === s && ack && typeof ack.revision === "number") {
        s.revisions[namespace] = ack.revision;
      }
      return ack;
    } catch (error) {
      if (state === s) {
        const code =
          parseSettingsStorageErrorCode(error) || "settings_storage_error";
        s.lastErrorCode = code;
        console.warn(
          "[settings-repository] persist failed:",
          namespace,
          code,
        );
        // Roll back only if no newer optimistic value superseded this one.
        if (s.snapshot[namespace] === written) {
          if (hadPrev) {
            s.snapshot[namespace] = prev;
          } else {
            delete s.snapshot[namespace];
          }
          notify(namespace);
        }
      }
      throw error;
    }
  });
};

export const updateNamespace = (namespace, updater, options) => {
  ensureInit();
  if (typeof updater !== "function") {
    return Promise.reject(
      errorWithCode("updater must be a function", "invalid_updater"),
    );
  }
  let next;
  try {
    const current = readNamespace(namespace, undefined);
    const base = current === undefined ? undefined : jsonClone(current);
    next = updater(base);
  } catch (error) {
    return Promise.reject(error);
  }
  return replaceNamespace(namespace, next, options);
};

export const deleteNamespace = (namespace) => {
  const s = ensureInit();
  if (typeof namespace !== "string" || namespace.length === 0) {
    return Promise.reject(
      errorWithCode("namespace must be a non-empty string", "invalid_namespace"),
    );
  }
  if (namespace === "__proto__") {
    return Promise.reject(
      errorWithCode('"__proto__" is not a legal namespace', "invalid_namespace"),
    );
  }

  if (s.mode === "localStorage") {
    try {
      return Promise.resolve(fallbackDeleteNamespace(s, namespace));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  const hadPrev = hasOwn(s.snapshot, namespace);
  const prev = s.snapshot[namespace];
  if (hadPrev) {
    delete s.snapshot[namespace];
    notify(namespace);
  }

  return enqueue(s, async () => {
    if (state !== s) return { ok: false, namespace };
    if (s.mode !== "sql") {
      return fallbackDeleteNamespace(s, namespace);
    }
    try {
      return await settingsStorageBridge.deleteNamespace(namespace);
    } catch (error) {
      if (state === s) {
        const code =
          parseSettingsStorageErrorCode(error) || "settings_storage_error";
        s.lastErrorCode = code;
        console.warn("[settings-repository] delete failed:", namespace, code);
        // Restore only if nothing re-created the namespace meanwhile.
        if (hadPrev && !hasOwn(s.snapshot, namespace)) {
          s.snapshot[namespace] = prev;
          notify(namespace);
        }
      }
      throw error;
    }
  });
};

// Phase 5 (plan §6-Phase5): strip the non-sensitive settings root + standalone
// preference keys from localStorage WITHOUT localStorage.clear(). The three
// provider-secret fields (adapter-owned) are preserved verbatim; the boot
// palette, outbox and uiTesting keys are never listed here so they survive.
const stripNonSensitiveLegacySettings = () => {
  if (!hasLocalStorage()) return;
  // settings root: keep only the adapter-owned secret fields (if any exist).
  try {
    const root = readLocalRoot();
    const providers = isPlainObject(root[MODEL_PROVIDERS_NAMESPACE])
      ? root[MODEL_PROVIDERS_NAMESPACE]
      : null;
    const residual = {};
    if (providers) {
      for (const key of SENSITIVE_MODEL_PROVIDER_KEYS) {
        if (hasOwn(providers, key)) {
          residual[key] = providers[key];
        }
      }
    }
    if (Object.keys(residual).length > 0) {
      writeLocalRoot({ [MODEL_PROVIDERS_NAMESPACE]: residual });
    } else {
      window.localStorage.removeItem(SETTINGS_STORAGE_KEY);
    }
  } catch (_error) {
    // best-effort: a strip failure must not abort the reset (SQL is already
    // the authority in SQL mode; the fallback path degrades gracefully)
  }
  for (const key of LEGACY_RESETTABLE_STANDALONE_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch (_error) {
      // best-effort per key
    }
  }
};

// Reset all non-sensitive settings + preferences to their defaults
// (plan §6-Phase5). In SQL mode this runs the main-process SQL reset
// transaction THROUGH the FIFO write queue, then strips the dual-kept legacy
// localStorage, then empties the in-memory snapshot and notifies subscribers so
// every converted store reads back its DEFAULT_*. In fallback mode (browser /
// Jest / degraded) it is the strip-clear alone. NEVER clears provider secrets,
// boot palette, outbox or uiTesting; NEVER localStorage.clear(). Provider API
// keys, token-usage history and MCP icons are preserved: in SQL mode they live
// in tables the reset transaction excludes; token-usage history's localStorage
// mirror is likewise excluded from the strip list so the fallback path
// preserves it too. The structured stores' in-memory mirrors are reset by the
// coordination point after this resolves (see the import note at the top).
export const resetSettings = async () => {
  const s = ensureInit();
  if (s.mode === "sql") {
    // Route the SQL reset THROUGH the same global FIFO queue every namespace
    // write uses, so it is serialized behind any already-queued setNamespace.
    // A direct (unqueued) reset raced with an in-flight write: the write could
    // land at the main process AFTER the reset's DELETE and survive it (then
    // reappear on the next bootstrap). Queued, the reset's DELETE cannot run
    // until every prior write has been acked; writes enqueued AFTER the reset
    // run after the DELETE, as intended.
    return enqueue(s, async () => {
      if (state !== s) return { ok: false };
      if (s.mode !== "sql") {
        // Degraded to fallback while this reset waited in the queue (a queued
        // migration failed): strip-clear the now-authoritative localStorage.
        const oldKeys = Object.keys(readLocalRoot());
        stripNonSensitiveLegacySettings();
        notifyMany([
          ...oldKeys,
          ...LEGACY_RESETTABLE_STANDALONE_KEYS,
          MODEL_PROVIDERS_NAMESPACE,
        ]);
        return { ok: true, mode: "localStorage" };
      }
      // If the SQL reset rejects, propagate and leave localStorage untouched so
      // the reset is all-or-nothing from the user's perspective.
      const result = await settingsStorageBridge.resetSettings();
      if (state !== s) return { ok: false };
      stripNonSensitiveLegacySettings();
      const oldKeys = s.snapshot ? Object.keys(s.snapshot) : [];
      s.snapshot = Object.create(null);
      s.revisions = Object.create(null);
      notifyMany([...oldKeys, MODEL_PROVIDERS_NAMESPACE]);
      return { ok: true, mode: "sql", result };
    });
  }
  // Fallback mode: strip-clear the non-sensitive legacy localStorage directly.
  const oldKeys = Object.keys(readLocalRoot());
  stripNonSensitiveLegacySettings();
  notifyMany([
    ...oldKeys,
    ...LEGACY_RESETTABLE_STANDALONE_KEYS,
    MODEL_PROVIDERS_NAMESPACE,
  ]);
  return { ok: true, mode: "localStorage" };
};

export const subscribeSettings = (listener) => {
  if (typeof listener !== "function") {
    return () => {};
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const flushSettingsWrites = async () => {
  const s = ensureInit();
  let tail;
  do {
    tail = s.queueTail;
    await tail;
  } while (state === s && tail !== s.queueTail);
};

export const getSettingsPersistenceStatus = () => {
  const s = ensureInit();
  return {
    mode: s.mode,
    degraded: s.degraded,
    pendingWrites: s.pendingWrites,
    lastErrorCode: s.lastErrorCode,
    warnings: s.warnings.map((warning) => ({ ...warning })),
    // Phase 4 (S3): non-sensitive secret-storage signals. A degraded backend
    // reports unavailable / [] regardless of the last captured snapshot
    // (fail-closed) — a degraded settings.db can serve no encrypted secret.
    secretStorageStatus: s.degraded ? "unavailable" : s.secretStorageStatus,
    configuredCredentials: s.degraded ? [] : [...s.configuredCredentials],
  };
};

// Test-only: drop all repository state so the next call re-runs init.
export const resetSettingsRepositoryForTests = () => {
  state = null;
  listeners.clear();
};

// —— Quit-time best-effort flush (plan §7.1: "App quit 前尽力
// flushSettingsWrites()") ——————————————————————————————————————————————
// In SQL mode every converted store commits fire-and-forget, so a mutation
// immediately followed by app quit could sit in the FIFO queue with its IPC
// invoke never dispatched. Mirrors the chat_storage_store.js beforeunload/
// pagehide wiring: kick the queue so any continuation whose predecessor has
// already settled gets its invoke onto the wire before the renderer dies.
// Known limit (recorded in the Phase 1B report): beforeunload cannot await —
// an op queued behind a still-in-flight async predecessor (e.g. the first-boot
// migration awaiting crypto.subtle/IPC) may still be lost; a hard guarantee
// needs a main-side drain, which would touch the frozen Phase 1A surface.
// Guards: never *initialize* the repository at teardown (that would run a
// sendSync bootstrap during quit), and no-op when the queue is empty.
const flushSettingsWritesOnUnload = () => {
  if (state === null || state.pendingWrites === 0) return;
  flushSettingsWrites().catch(() => {});
};

if (
  typeof window !== "undefined" &&
  typeof window.addEventListener === "function"
) {
  window.addEventListener("beforeunload", flushSettingsWritesOnUnload);
  window.addEventListener("pagehide", flushSettingsWritesOnUnload);
}

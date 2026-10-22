// Volatile credential mirror for synchronous renderer reads. Durable writes
// go only through provider_credential_persistence's encrypted native bridge.
// Import historical plaintext until a session edit or verified scrub owns it;
// native acknowledgement. Never serialize a new credential into localStorage.

import { getBootstrapClearedCredentials } from "./bridges/settings_storage_bridge";

const SETTINGS_STORAGE_KEY = "settings";
const MODEL_PROVIDERS_NAMESPACE = "model_providers";
let sessionSecrets = Object.create(null);
const sessionOwnedFields = new Set();

export const PROVIDER_SECRET_FIELDS = Object.freeze([
  "openai_api_key",
  "anthropic_api_key",
  "gemini_api_key",
]);
export const CUSTOM_PROVIDER_SECRETS_FIELD = "custom_provider_secrets";
export const SENSITIVE_MODEL_PROVIDER_FIELDS = Object.freeze([
  ...PROVIDER_SECRET_FIELDS,
  CUSTOM_PROVIDER_SECRETS_FIELD,
]);

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const hasLocalStorage = () =>
  typeof window !== "undefined" && !!window.localStorage;

const assertProviderSecretField = (field) => {
  if (!PROVIDER_SECRET_FIELDS.includes(field)) {
    throw new Error(
      `settings_secret_adapter: unknown provider secret field "${field}"`,
    );
  }
};

// Returns { root, writable, repairable }. A missing/empty key yields a fresh
// writable root; raw-but-corrupt (or non-object) JSON yields a non-writable
// read-only default so writes never destroy data we could not parse.
// `repairable` is false only when localStorage itself is missing — a corrupt
// root CAN be rebuilt from {} by a caller that opts into repair.
const readRootForSecrets = () => {
  if (!hasLocalStorage()) return { root: {}, writable: false, repairable: false };
  let raw = null;
  try {
    raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
  } catch (_error) {
    return { root: {}, writable: false, repairable: true };
  }
  if (raw == null || raw === "") return { root: {}, writable: true, repairable: true };
  try {
    const parsed = JSON.parse(raw);
    if (isPlainObject(parsed)) return { root: parsed, writable: true, repairable: true };
    return { root: {}, writable: false, repairable: true };
  } catch (_error) {
    return { root: {}, writable: false, repairable: true };
  }
};

const captureLegacySecrets = (root) => {
  const providers = root[MODEL_PROVIDERS_NAMESPACE];
  const cleared = new Set(getBootstrapClearedCredentials());
  for (const field of SENSITIVE_MODEL_PROVIDER_FIELDS) {
    if (sessionOwnedFields.has(field)) continue;
    if (isPlainObject(providers) && Object.prototype.hasOwnProperty.call(providers, field)) {
      sessionSecrets[field] = JSON.parse(JSON.stringify(providers[field]));
      if (field === CUSTOM_PROVIDER_SECRETS_FIELD && isPlainObject(sessionSecrets[field])) {
        for (const slug of Object.keys(sessionSecrets[field])) {
          if (cleared.has(`custom.${slug}`)) delete sessionSecrets[field][slug];
        }
      } else if (cleared.has(field.replace(/_api_key$/, ""))) {
        sessionSecrets[field] = "";
      }
    } else {
      delete sessionSecrets[field];
    }
  }
};

const hasLegacyCredential = (providers) => isPlainObject(providers) && (
  PROVIDER_SECRET_FIELDS.some((field) => typeof providers[field] === "string" && providers[field].length > 0) ||
  (isPlainObject(providers[CUSTOM_PROVIDER_SECRETS_FIELD]) &&
    Object.values(providers[CUSTOM_PROVIDER_SECRETS_FIELD]).some((value) => typeof value === "string" && value.length > 0))
);

export const hasLegacyProviderCredential = (id) => {
  const { root } = readRootForSecrets();
  const providers = root[MODEL_PROVIDERS_NAMESPACE];
  if (!isPlainObject(providers)) return false;
  const value = id.startsWith("custom.")
    ? providers[CUSTOM_PROVIDER_SECRETS_FIELD]?.[id.slice("custom.".length)]
    : providers[`${id}_api_key`];
  return typeof value === "string" && value.length > 0;
};

// Settings fallback writes cannot silently destroy an unacknowledged legacy
// credential. Refuse the write until migration can safely remove that copy.
// Even when the caller supplies a secret field, the returned root is redacted.
export const settingsRootWithoutProviderSecrets = (root) => {
  const { root: legacy } = readRootForSecrets();
  captureLegacySecrets(legacy);
  const legacyProviders = legacy[MODEL_PROVIDERS_NAMESPACE];
  if (hasLegacyCredential(legacyProviders)) {
    throw new Error("[provider_credential_migration_pending] secure credential migration must finish before rewriting legacy settings");
  }
  const next = { ...root };
  if (isPlainObject(next[MODEL_PROVIDERS_NAMESPACE])) {
    next[MODEL_PROVIDERS_NAMESPACE] = { ...next[MODEL_PROVIDERS_NAMESPACE] };
    for (const field of SENSITIVE_MODEL_PROVIDER_FIELDS) delete next[MODEL_PROVIDERS_NAMESPACE][field];
  }
  return next;
};

// IDs are native acknowledgement metadata, never secret values. Preserve any
// legacy field not acknowledged (including a failed migration) for next boot.
export const removeMigratedLegacyProviderSecrets = (configuredIds) => {
  const { root, writable } = readRootForSecrets();
  if (!writable) return false;
  captureLegacySecrets(root);
  const providers = root[MODEL_PROVIDERS_NAMESPACE];
  if (!isPlainObject(providers)) return true;
  const confirmed = new Set(configuredIds);
  for (const field of PROVIDER_SECRET_FIELDS) {
    const value = providers[field];
    if (typeof value !== "string" || !value || confirmed.has(field.replace(/_api_key$/, ""))) {
      delete providers[field];
    }
  }
  const custom = providers[CUSTOM_PROVIDER_SECRETS_FIELD];
  if (isPlainObject(custom)) {
    for (const slug of Object.keys(custom)) {
      if (typeof custom[slug] !== "string" || !custom[slug] || confirmed.has(`custom.${slug}`)) delete custom[slug];
    }
    if (!Object.keys(custom).length) delete providers[CUSTOM_PROVIDER_SECRETS_FIELD];
  } else {
    delete providers[CUSTOM_PROVIDER_SECRETS_FIELD];
  }
  // Only write if every legacy credential has a confirmed durable owner. A
  // partial acknowledgement cannot cause another plaintext reserialization.
  if (SENSITIVE_MODEL_PROVIDER_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(providers, field))) return false;
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(root));
    for (const field of SENSITIVE_MODEL_PROVIDER_FIELDS) sessionOwnedFields.add(field);
    return true;
  } catch (_error) {
    return false;
  }
};

const writeSecretField = (field, value, options) => {
  const repairCorruptRoot = !!(options && options.repairCorruptRoot);
  const { root, writable, repairable } = readRootForSecrets();
  if (!writable && !(repairCorruptRoot && repairable)) return false;
  captureLegacySecrets(root);
  sessionSecrets[field] = value;
  sessionOwnedFields.add(field);
  return true;
};

export const readProviderSecret = (field) => {
  assertProviderSecretField(field);
  const { root } = readRootForSecrets();
  captureLegacySecrets(root);
  const value = sessionSecrets[field];
  return typeof value === "string" ? value : "";
};

export const writeProviderSecret = (field, value) => {
  assertProviderSecretField(field);
  // Legacy parity: writeModelProviders spread the caller's patch into
  // model_providers verbatim, so a non-string value was stored as-is and
  // stayed inert (every reader type-checks; readProviderSecret returns ""
  // for non-strings). Coercing via String() would instead turn junk
  // (123, {…}) into a live-looking API key string that getStoredProviderApiKey
  // would inject into a request — never coerce, store verbatim.
  return writeSecretField(field, value);
};

export const readCustomProviderSecrets = () => {
  const { root } = readRootForSecrets();
  captureLegacySecrets(root);
  const value = sessionSecrets[CUSTOM_PROVIDER_SECRETS_FIELD];
  if (!isPlainObject(value)) return {};
  try {
    // Detached clone: callers must not be able to mutate stored data through
    // the returned reference.
    return JSON.parse(JSON.stringify(value));
  } catch (_error) {
    return {};
  }
};

// options.repairCorruptRoot — legacy custom_provider_store parity: its
// writers read the root through a catch-all that returned {} for a corrupt
// blob and then saved, clobbering the unparseable data but persisting the
// secret. Only custom_provider_store call sites opt in; the
// writeModelProviders passthrough keeps the default refuse-don't-clobber.
export const writeCustomProviderSecrets = (secrets, options) => {
  let normalized = {};
  if (isPlainObject(secrets)) {
    try {
      normalized = JSON.parse(JSON.stringify(secrets));
    } catch (_error) {
      return false;
    }
  }
  if (!isPlainObject(normalized)) normalized = {};
  return writeSecretField(CUSTOM_PROVIDER_SECRETS_FIELD, normalized, options);
};

export const resetProviderSecretSessionForTests = () => {
  sessionSecrets = Object.create(null);
  sessionOwnedFields.clear();
};

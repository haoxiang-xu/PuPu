// Isolated read/write path for the three provider secret fields that stay in
// localStorage["settings"] until Phase 4 (settings-sqlite-migration-plan §3.7):
//
//   model_providers.openai_api_key
//   model_providers.anthropic_api_key
//   model_providers.custom_provider_secrets
//
// These fields NEVER enter the settings repository memory snapshot, SQL, or
// logs. This adapter is their only reader/writer: it operates directly on the
// localStorage["settings"] root and touches nothing but these three fields —
// every other root namespace and every other model_providers field is
// preserved as-is.
//
// Failure semantics mirror the legacy model_providers storage helper: a
// corrupt/unparseable root means reads return defaults and writes are refused
// (never clobber a corrupt blob), and localStorage write errors are reported
// via the boolean return value instead of throwing. Exception: legacy
// custom_provider_store rebuilt a corrupt root from {} and saved anyway —
// writeCustomProviderSecrets takes an opt-in { repairCorruptRoot: true } so
// that call site keeps its legacy repair-and-clobber semantics.

const SETTINGS_STORAGE_KEY = "settings";
const MODEL_PROVIDERS_NAMESPACE = "model_providers";

export const PROVIDER_SECRET_FIELDS = Object.freeze([
  "openai_api_key",
  "anthropic_api_key",
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

const writeSecretField = (field, value, options) => {
  const repairCorruptRoot = !!(options && options.repairCorruptRoot);
  const { root, writable, repairable } = readRootForSecrets();
  if (!writable && !(repairCorruptRoot && repairable)) return false;
  const providers = isPlainObject(root[MODEL_PROVIDERS_NAMESPACE])
    ? root[MODEL_PROVIDERS_NAMESPACE]
    : {};
  providers[field] = value;
  root[MODEL_PROVIDERS_NAMESPACE] = providers;
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(root));
    return true;
  } catch (_error) {
    // Quota/serialization failure — report, never throw (legacy parity).
    return false;
  }
};

export const readProviderSecret = (field) => {
  assertProviderSecretField(field);
  const { root } = readRootForSecrets();
  const providers = root[MODEL_PROVIDERS_NAMESPACE];
  const value = isPlainObject(providers) ? providers[field] : undefined;
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
  const providers = root[MODEL_PROVIDERS_NAMESPACE];
  const value = isPlainObject(providers)
    ? providers[CUSTOM_PROVIDER_SECRETS_FIELD]
    : undefined;
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

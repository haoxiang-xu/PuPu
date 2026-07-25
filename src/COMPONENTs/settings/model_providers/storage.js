// model_providers storage — Phase 1B T5 split (settings-sqlite-migration-plan
// §3.7/§6-1B): non-sensitive fields live in the settings repository namespace
// "model_providers"; the three secret fields (openai_api_key,
// anthropic_api_key, custom_provider_secrets) stay in localStorage["settings"]
// behind settings_secret_adapter until Phase 4. Callers keep seeing ONE merged
// object on read, and writes are split internally — the repository never
// receives a secret field.

import {
  readNamespace,
  updateNamespace,
} from "../../../SERVICEs/settings_repository";
import {
  PROVIDER_SECRET_FIELDS,
  CUSTOM_PROVIDER_SECRETS_FIELD,
  SENSITIVE_MODEL_PROVIDER_FIELDS,
  readProviderSecret,
  writeProviderSecret,
  readCustomProviderSecrets,
  writeCustomProviderSecrets,
} from "../../../SERVICEs/settings_secret_adapter";

const MODEL_PROVIDERS_NAMESPACE = "model_providers";

const isObject = (value) =>
  value != null && typeof value === "object" && !Array.isArray(value);

export const readModelProviders = () => {
  const branch = readNamespace(MODEL_PROVIDERS_NAMESPACE, {});
  const merged = isObject(branch) ? { ...branch } : {};
  for (const field of PROVIDER_SECRET_FIELDS) {
    const value = readProviderSecret(field);
    if (value) {
      merged[field] = value;
    }
  }
  const customSecrets = readCustomProviderSecrets();
  if (Object.keys(customSecrets).length > 0) {
    merged[CUSTOM_PROVIDER_SECRETS_FIELD] = customSecrets;
  }
  return merged;
};

export const writeModelProviders = (data) => {
  const patch = isObject(data) ? data : {};
  const plainPatch = {};
  for (const key of Object.keys(patch)) {
    if (SENSITIVE_MODEL_PROVIDER_FIELDS.includes(key)) {
      continue;
    }
    plainPatch[key] = patch[key];
  }

  // Secret fields go through the adapter only (localStorage, Phase 4 boundary).
  for (const field of PROVIDER_SECRET_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(patch, field)) {
      writeProviderSecret(field, patch[field]);
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, CUSTOM_PROVIDER_SECRETS_FIELD)) {
    writeCustomProviderSecrets(patch[CUSTOM_PROVIDER_SECRETS_FIELD]);
  }

  // Non-sensitive fields merge into the repository namespace. Fire-and-forget
  // mirrors the legacy synchronous write's silent error handling (the
  // repository fallback still applies the write synchronously).
  if (Object.keys(plainPatch).length > 0) {
    updateNamespace(MODEL_PROVIDERS_NAMESPACE, (current) => ({
      ...(isObject(current) ? current : {}),
      ...plainPatch,
    })).catch(() => {});
  }
};

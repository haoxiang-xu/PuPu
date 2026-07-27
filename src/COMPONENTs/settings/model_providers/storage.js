// model_providers storage — Phase 1B T5 split (settings-sqlite-migration-plan
// §3.7/§6-1B): non-sensitive fields live in the settings repository namespace
// "model_providers"; the three secret fields (openai_api_key,
// anthropic_api_key, custom_provider_secrets) retain a legacy dual-keep copy in
// localStorage["settings"] behind settings_secret_adapter. Steady-state writes
// are also sent through the write-only safeStorage/SQL credential channel.
// Callers keep seeing ONE merged object on read, and the repository never
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
import {
  persistCustomProviderSecretsSnapshot,
  persistOfficialProviderSecret,
} from "../../../SERVICEs/provider_credential_persistence";

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
  const credentialWrites = [];
  for (const key of Object.keys(patch)) {
    if (SENSITIVE_MODEL_PROVIDER_FIELDS.includes(key)) {
      continue;
    }
    plainPatch[key] = patch[key];
  }

  // Persistence checks quit admission before it invokes each lazy legacy
  // dual-keep writer, then enqueues the acknowledged safeStorage/SQL mutation
  // in the same JavaScript turn. If the local write fails, SQL is unchanged.
  for (const field of PROVIDER_SECRET_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(patch, field)) {
      const previous = readProviderSecret(field);
      credentialWrites.push(
        persistOfficialProviderSecret(
          field,
          patch[field],
          () => writeProviderSecret(field, patch[field]),
          {
            restorePrevious: () => writeProviderSecret(field, previous),
            restoreCurrent: () =>
              writeProviderSecret(field, patch[field]),
          },
        ),
      );
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, CUSTOM_PROVIDER_SECRETS_FIELD)) {
    const previous = readCustomProviderSecrets();
    const next = isObject(patch[CUSTOM_PROVIDER_SECRETS_FIELD])
      ? patch[CUSTOM_PROVIDER_SECRETS_FIELD]
      : {};
    credentialWrites.push(
      persistCustomProviderSecretsSnapshot(
        previous,
        next,
        () => writeCustomProviderSecrets(next),
        (slug) => {
          const restoreFrom = (snapshot) => {
            const restored = readCustomProviderSecrets();
            if (Object.prototype.hasOwnProperty.call(snapshot, slug)) {
              restored[slug] = snapshot[slug];
            } else {
              delete restored[slug];
            }
            return writeCustomProviderSecrets(restored);
          };
          return {
            restorePrevious: () => restoreFrom(previous),
            restoreCurrent: () => restoreFrom(next),
          };
        },
      ),
    );
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

  // Existing callers may ignore the promise (legacy writes remain
  // synchronous), while settings UI callers await it before reporting durable
  // success. The resolved array contains status metadata only.
  return Promise.all(credentialWrites).then((results) => results.flat());
};

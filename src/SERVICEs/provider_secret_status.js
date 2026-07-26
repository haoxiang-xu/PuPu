// Provider secret EXISTENCE + injection-authority signals (Phase 4, S3).
//
// This module is the renderer's ONLY secret-adjacent decision surface for the
// Phase 4 descriptor-injection path (phase4-cto-adr §3.2-3.5,
// phase4-descriptor-contract §3.3-3.5). It exports exactly two booleans and
// NEVER returns, logs, or transports a secret value:
//
//   providerSecretConfigured(id)     — is a credential configured for `id`?
//     = the SQL bootstrap identity list includes `id`
//       OR a non-empty legacy localStorage secret exists for `id`.
//     The legacy OR closes the dual-keep transition-window regression where a
//     key that still lives only in localStorage (SQL ciphertext not yet
//     migrated) would otherwise read as "unconfigured" and never be sent.
//
//   secretInjectionAuthoritative(id) — may the renderer emit a descriptor
//     ONLY (steady state, main decrypts + injects) instead of reading the
//     legacy secret itself?
//     = safeStorage is "available" AND the SQL bootstrap identity list
//       includes `id`. Gated by secretStorageStatus so a degraded machine
//       (Linux basic_text / unavailable keyring) always falls back to the
//       legacy path (descriptor contract three-state matrix).
//
// `id` vocabulary (aligned with provider_credentials owner_id and the
// descriptor contract): "openai" | "anthropic" | "custom.<slug>".
//
// Legacy existence is probed through settings_secret_adapter — its only job
// here is a boolean presence check; the value is compared for emptiness inside
// this module and never handed back to any caller.

import {
  getBootstrapConfiguredCredentials,
  getBootstrapSecretStorageStatus,
} from "./bridges/settings_storage_bridge";
import {
  readProviderSecret,
  readCustomProviderSecrets,
} from "./settings_secret_adapter";

const CUSTOM_ID_PREFIX = "custom.";

// Maps a credential identity to its legacy localStorage secret field and
// returns whether a non-empty value is present. The secret value NEVER leaves
// this function (only its emptiness is observed) — the sole secret-adjacent
// legacy read in the renderer's injection-decision path.
const legacyHasSecret = (id) => {
  if (id === "openai") {
    return readProviderSecret("openai_api_key").length > 0;
  }
  if (id === "anthropic") {
    return readProviderSecret("anthropic_api_key").length > 0;
  }
  if (id.startsWith(CUSTOM_ID_PREFIX)) {
    const slug = id.slice(CUSTOM_ID_PREFIX.length);
    if (slug.length === 0) return false;
    const secrets = readCustomProviderSecrets();
    const value =
      secrets && typeof secrets === "object" ? secrets[slug] : undefined;
    return typeof value === "string" && value.length > 0;
  }
  return false;
};

/**
 * True when a credential is configured for `id` in EITHER the migrated SQL
 * store or the legacy localStorage dual-keep copy. Booleans only — never a
 * secret value.
 */
export const providerSecretConfigured = (id) => {
  if (typeof id !== "string" || id.length === 0) return false;
  if (getBootstrapConfiguredCredentials().includes(id)) return true;
  return legacyHasSecret(id);
};

/**
 * True when the renderer may emit a non-sensitive injection descriptor for
 * `id` (steady state) and let the main process decrypt + inject. Requires both
 * safeStorage availability AND a migrated SQL credential; otherwise the caller
 * must fall back to the legacy secret-injection path (descriptor contract
 * §3.5 three-state matrix). Booleans only — never a secret value.
 */
export const secretInjectionAuthoritative = (id) => {
  if (typeof id !== "string" || id.length === 0) return false;
  if (getBootstrapSecretStorageStatus() !== "available") return false;
  return getBootstrapConfiguredCredentials().includes(id);
};

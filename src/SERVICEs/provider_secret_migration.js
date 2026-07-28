// Phase 4 (S7): the renderer-side trigger that ACTIVATES provider secret
// migration. S1-S6 built the encrypted provider_credentials table, the main
// migrateProviderCredentials method, the bootstrap existence signals and the
// descriptor-injection path — but nothing ever handed the legacy localStorage
// secrets to main, so provider_credentials stayed empty and Phase 4 never
// switched on. This module closes that gap.
//
// It fires ONCE per session, early in renderer boot. It is the only place in
// the renderer that reads a legacy secret VALUE for transport (through the
// settings_secret_adapter), packs it into the migration payload, and hands it
// to the main process to be encrypted. The value only ever travels forward
// into main across the single write-direction channel — it is never logged and
// never returned to any caller.
//
// SECURITY / CONTRACT NOTES
//   * inbound-only: the payload carries plaintext to main; the resolved status
//     object carries no secret back. No read-direction secret channel exists.
//   * dual-keep: this NEVER deletes the legacy localStorage secret — deletion
//     is a separate N+1 change (descriptor contract §8). Legacy stays as the
//     read-only rollback mirror and keeps this session's sends working.
//   * fail-safe: every guard degrades to a silent no-op (browser/Jest, degraded
//     safeStorage, already-migrated, nothing to migrate). A failed migrate is
//     caught and logged by code only — it never throws into the boot path and
//     is simply retried on the next launch.
//   * steady-state deferral: a credential migrated THIS session only shows up
//     in configuredCredentials on the NEXT boot (the descriptor path activates
//     after a restart), so there is no need to refresh anything mid-session —
//     the legacy dual-keep path keeps injecting for the rest of this session.

import {
  settingsStorageBridge,
  isProviderCredentialsMigrationBridgeAvailable,
  getBootstrapSecretStorageStatus,
  getSqlStoreMigrationMeta,
  parseSettingsStorageErrorCode,
  resetSessionBootstrapSnapshotForTests,
} from "./bridges/settings_storage_bridge";
import {
  readProviderSecret,
  readCustomProviderSecrets,
} from "./settings_secret_adapter";

// Must equal the main-side SUPPORTED_PROVIDER_CREDENTIALS_MIGRATION_VERSION.
// A version mismatch is rejected by main (unsupported_migration_version).
const PROVIDER_CREDENTIALS_MIGRATION_VERSION = 1;

// The bootstrap storeMigrations key for provider credentials — must match the
// key the main process writes in getBootstrapSnapshot().storeMigrations.
const PROVIDER_CREDENTIALS_STORE_KEY = "providerCredentials";

// Session guard: the trigger runs at most once per renderer session regardless
// of how many times it is called (e.g. React StrictMode double-invoke, or a
// second boot component). Persistence-level idempotency is main's job; this
// just avoids duplicate IPC within one session.
let triggeredThisSession = false;

const nonEmptyString = (value) =>
  typeof value === "string" && value.length > 0;

// Build the { openai?, anthropic?, custom? } credentials envelope from the
// legacy localStorage secrets. Only non-empty string values travel; an empty
// field is simply absent. Returns null when there is nothing to migrate.
const buildLegacyCredentials = () => {
  const credentials = {};

  const openai = readProviderSecret("openai_api_key");
  if (nonEmptyString(openai)) credentials.openai = openai;

  const anthropic = readProviderSecret("anthropic_api_key");
  if (nonEmptyString(anthropic)) credentials.anthropic = anthropic;

  const customSecrets = readCustomProviderSecrets();
  const custom = {};
  if (customSecrets && typeof customSecrets === "object") {
    for (const slug of Object.keys(customSecrets)) {
      // Never let "__proto__" near a plain-object key path (main skips it too).
      if (slug === "__proto__") continue;
      const value = customSecrets[slug];
      if (nonEmptyString(value)) custom[slug] = value;
    }
  }
  if (Object.keys(custom).length > 0) credentials.custom = custom;

  return Object.keys(credentials).length > 0 ? credentials : null;
};

/**
 * Migrate the renderer's legacy provider secrets into the encrypted SQL store
 * exactly once per session, if and only if it is both possible and needed.
 *
 * Returns a Promise that resolves when the migrate IPC settles (or immediately
 * for any no-op branch). Fire-and-forget by design: callers do not await it and
 * it never rejects — a failure is logged by code and retried next launch.
 */
export const maybeMigrateProviderSecrets = () => {
  if (triggeredThisSession) return Promise.resolve();
  triggeredThisSession = true;

  // (1) No bridge (browser dev / Jest / pre-Phase-4 preload) → no-op. The
  //     renderer stays on the legacy localStorage secret path.
  if (!isProviderCredentialsMigrationBridgeAvailable()) {
    return Promise.resolve();
  }

  // (2) safeStorage not available (degraded / Linux fail-closed) → no-op. Main
  //     would refuse anyway (skipped-unavailable); do not even ship the secret.
  if (getBootstrapSecretStorageStatus() !== "available") {
    return Promise.resolve();
  }

  // (3) Already migrated (SQL meta complete) → no-op. This is the across-boot
  //     idempotency guard: legacy is kept under dual-keep so branch (4) never
  //     short-circuits for a configured user, making THIS the guard that stops
  //     the trigger re-firing every launch.
  const meta = getSqlStoreMigrationMeta(PROVIDER_CREDENTIALS_STORE_KEY);
  if (meta !== null && meta.state === "complete") {
    return Promise.resolve();
  }

  // (4) Nothing to migrate (no legacy secret present) → no-op.
  const credentials = buildLegacyCredentials();
  if (credentials === null) {
    return Promise.resolve();
  }

  const payload = {
    migrationVersion: PROVIDER_CREDENTIALS_MIGRATION_VERSION,
    credentials,
  };

  // Fire-and-forget. The resolved status object holds no secret; we do not act
  // on it (configuredCredentials only turns over on the next boot). A rejection
  // is logged by CODE only — never the payload — and retried next launch.
  return settingsStorageBridge
    .migrateProviderCredentials(payload)
    .then(() => {})
    .catch((error) => {
      const code =
        parseSettingsStorageErrorCode(error) || "settings_storage_error";
      console.warn("[provider-secret-migration] migration failed:", code);
    });
};

/** Test-only: forget the session trigger guard (and the bootstrap snapshot). */
export const resetProviderSecretMigrationForTests = () => {
  triggeredThisSession = false;
  resetSessionBootstrapSnapshotForTests();
};

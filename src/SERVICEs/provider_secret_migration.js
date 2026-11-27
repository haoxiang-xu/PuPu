// Cut over historical plaintext through the SAME per-identity write queue as
// settings edits. Old bulk metadata is not a credential presence signal:
// a failed rotation in an older version could delete an already-migrated row.
import {
  isProviderCredentialsWriteBridgeAvailable,
  isProviderCredentialsMigrationBridgeAvailable,
  getBootstrapClearedCredentials,
  getBootstrapSecretStorageStatus,
  resetSessionBootstrapSnapshotForTests,
} from "./bridges/settings_storage_bridge";
import {
  PROVIDER_SECRET_FIELDS,
  readProviderSecret,
  readCustomProviderSecrets,
  removeMigratedLegacyProviderSecrets,
} from "./settings_secret_adapter";
import {
  persistOfficialProviderSecret,
  persistCustomProviderSecret,
} from "./provider_credential_persistence";

let triggeredThisSession = false;

export const maybeMigrateProviderSecrets = () => {
  if (triggeredThisSession) return Promise.resolve();
  triggeredThisSession = true;
  // Capture before scrub. Readers keep their volatile mirror, including any
  // newer value already written this session.
  const official = PROVIDER_SECRET_FIELDS.map((field) => [field, readProviderSecret(field)]);
  const custom = readCustomProviderSecrets();
  if (!isProviderCredentialsWriteBridgeAvailable() || !isProviderCredentialsMigrationBridgeAvailable() ||
      getBootstrapSecretStorageStatus() !== "available") return Promise.resolve();

  const writes = [];
  for (const [field, value] of official) {
    if (value) {
      writes.push(persistOfficialProviderSecret(field, value, () => true, undefined, { legacyImport: true }));
    }
  }
  for (const slug of Object.keys(custom)) {
    if (slug === "__proto__") continue;
    const value = custom[slug];
    if (typeof value === "string" && value) {
      writes.push(persistCustomProviderSecret(slug, value, () => true, undefined, { legacyImport: true }));
    }
  }
  return Promise.all(writes).then(() => {
    // Native tombstones alone are sufficient to discard explicitly cleared
    // backups. Verified writes already scrub through the shared queue.
    if (!writes.length) removeMigratedLegacyProviderSecrets(getBootstrapClearedCredentials());
  }).catch(() => {
    // Never log a payload or raw error that might contain a credential.
    console.warn("[provider-secret-migration] secure migration incomplete");
  });
};

export const resetProviderSecretMigrationForTests = () => {
  triggeredThisSession = false;
  resetSessionBootstrapSnapshotForTests();
};

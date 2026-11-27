// Steady-state provider credential persistence.
//
// The caller supplies a lazy legacy localStorage writer. This module closes
// quit admission before invoking that writer in the same JavaScript turn,
// then serializes write-only SQL mutations per identity, applies an
// identity-only runtime authority overlay, and returns status metadata only.
// A boolean write result remains accepted for compatibility with older
// callers/tests. This module never reads, logs, hashes, or returns a
// credential value.

import {
  getBootstrapConfiguredCredentials,
  isProviderCredentialsWriteBridgeAvailable,
  parseSettingsStorageErrorCode,
  setRuntimeProviderCredentialPresence,
  setRuntimeProviderCredentialCleared,
  getBootstrapClearedCredentials,
  settingsStorageBridge,
} from "./bridges/settings_storage_bridge";
import { hasLegacyProviderCredential, removeMigratedLegacyProviderSecrets } from "./settings_secret_adapter";

const OFFICIAL_TARGETS = Object.freeze({
  gemini_api_key: Object.freeze({ id: "gemini", kind: "provider", ownerId: "gemini" }),
  openai_api_key: Object.freeze({
    id: "openai",
    kind: "provider",
    ownerId: "openai",
  }),
  anthropic_api_key: Object.freeze({
    id: "anthropic",
    kind: "provider",
    ownerId: "anthropic",
  }),
});

const writeTails = new Map();
const writeGenerations = new Map();
const confirmedSqlPresence = new Map();
const confirmedLegacyRestorers = new Map();
const verifiedCredentialIds = new Set();
let settingsQuitBarrierActive = false;

const getConfirmedSqlPresence = (id) => {
  if (!confirmedSqlPresence.has(id)) {
    confirmedSqlPresence.set(
      id,
      getBootstrapConfiguredCredentials().includes(id),
    );
  }
  return confirmedSqlPresence.get(id) === true;
};

const nextGeneration = (id) => {
  const next = (writeGenerations.get(id) || 0) + 1;
  writeGenerations.set(id, next);
  return next;
};

const resultFor = (target, fields) => ({
  id: target.id,
  kind: target.kind,
  ownerId: target.ownerId,
  ...fields,
});

const runLegacyWrite = (legacyWrite) => {
  if (typeof legacyWrite !== "function") {
    return legacyWrite === true;
  }
  try {
    return legacyWrite() === true;
  } catch (_error) {
    return false;
  }
};

const enqueueCredentialMutation = (
  target,
  plaintext,
  legacyWrite,
  legacyRestorers = {},
  options = {},
) => {
  // This check must precede the lazy writer. beginProviderCredentialQuitDrain
  // sets the flag synchronously, so a blocked mutation cannot touch the
  // legacy secret and never needs a rollback to recover from the quit race.
  if (settingsQuitBarrierActive) {
    return Promise.resolve(
      resultFor(target, {
        ok: false,
        status: "not-synced",
        errorCode: "settings_quit_in_progress",
      }),
    );
  }

  // Intentionally synchronous: once admission is open, the legacy mutation
  // completes before another renderer task can start a quit drain.
  const legacyWriteSucceeded = runLegacyWrite(legacyWrite);
  if (!legacyWriteSucceeded) {
    return Promise.resolve(
      resultFor(target, {
        ok: false,
        status: "unchanged",
        errorCode: "legacy_write_failed",
      }),
    );
  }

  getConfirmedSqlPresence(target.id);
  if (
    !confirmedLegacyRestorers.has(target.id) &&
    typeof legacyRestorers.restorePrevious === "function"
  ) {
    confirmedLegacyRestorers.set(
      target.id,
      legacyRestorers.restorePrevious,
    );
  }
  const generation = nextGeneration(target.id);
  // Pending writes fail closed: use the already-updated legacy copy until the
  // newest SQL mutation has an explicit durability ack.
  setRuntimeProviderCredentialPresence(target.id, false);

  const previous = writeTails.get(target.id) || Promise.resolve();
  const run = previous.then(async () => {
    const finishSuccess = (fields) => {
      if (typeof legacyRestorers.restoreCurrent === "function") {
        confirmedLegacyRestorers.set(
          target.id,
          legacyRestorers.restoreCurrent,
        );
      }
      if (writeGenerations.get(target.id) === generation) {
        confirmedLegacyRestorers.delete(target.id);
      }
      return resultFor(target, { ok: true, ...fields });
    };
    const finishFailure = (errorCode) => {
      let rollbackOk = true;
      if (writeGenerations.get(target.id) === generation) {
        const restore = confirmedLegacyRestorers.get(target.id);
        confirmedLegacyRestorers.delete(target.id);
        if (typeof restore === "function") {
          try {
            rollbackOk = restore() === true;
          } catch (_error) {
            rollbackOk = false;
          }
        }
        setRuntimeProviderCredentialPresence(
          target.id,
          getConfirmedSqlPresence(target.id),
        );
      }
      return resultFor(target, {
        ok: false,
        status: "not-synced",
        errorCode: rollbackOk ? errorCode : "legacy_rollback_failed",
      });
    };

    if (!isProviderCredentialsWriteBridgeAvailable()) {
      if (getConfirmedSqlPresence(target.id)) {
        return finishFailure("settings_storage_unavailable");
      }
      confirmedSqlPresence.set(target.id, false);
      if (plaintext.length === 0) {
        // A browser-only clear is durable only if the legacy root can really
        // be scrubbed. Otherwise preserve the prior value and report failure.
        if (hasLegacyProviderCredential(target.id) && !removeMigratedLegacyProviderSecrets([target.id])) {
          return finishFailure("settings_storage_unavailable");
        }
        return finishSuccess({ status: "deleted", deleted: true });
      }
      // Browser sessions can use the volatile value, but must never report a
      // durable/secure save without the native encrypted store.
      return {
        ...finishSuccess({ status: "session-only" }),
        ok: false,
        errorCode: "settings_storage_unavailable",
      };
    }

    try {
      if (plaintext.length === 0) {
        const response = await settingsStorageBridge.deleteProviderCredential(
          target.kind,
          target.ownerId,
        );
        if (!response || response.ok !== true) {
          throw new Error(
            "[credential_write_failed] provider credential delete was not acknowledged",
          );
        }
        confirmedSqlPresence.set(target.id, false);
        setRuntimeProviderCredentialCleared(target.id, true);
        removeMigratedLegacyProviderSecrets([...verifiedCredentialIds, ...getBootstrapClearedCredentials()]);
        return finishSuccess({
          status: "deleted",
          deleted: response.deleted === true,
        });
      }

      const response = options.legacyImport
        ? await settingsStorageBridge.migrateProviderCredentials({
          migrationVersion: 2,
          credentials: target.kind === "provider" ? { [target.ownerId]: plaintext }
            : { custom: { [target.ownerId.slice("custom.".length)]: plaintext } },
        })
        : await settingsStorageBridge.setProviderCredential(target.kind, target.ownerId, plaintext);
      if (options.legacyImport && response?.ok === true && response.status === "deleted") {
        confirmedSqlPresence.set(target.id, false);
        setRuntimeProviderCredentialPresence(target.id, false);
        setRuntimeProviderCredentialCleared(target.id, true);
        removeMigratedLegacyProviderSecrets([...verifiedCredentialIds, ...getBootstrapClearedCredentials()]);
        return finishSuccess({ status: "deleted" });
      }
      if (
        !response ||
        response.ok !== true ||
        response.status !== "stored"
      ) {
        throw new Error(
          "[credential_write_failed] provider credential write was not acknowledged",
        );
      }
      confirmedSqlPresence.set(target.id, true);
      verifiedCredentialIds.add(target.id);
      setRuntimeProviderCredentialCleared(target.id, false);
      if (writeGenerations.get(target.id) === generation) {
        setRuntimeProviderCredentialPresence(
          target.id,
          confirmedSqlPresence.get(target.id) === true,
        );
      }
      removeMigratedLegacyProviderSecrets([...verifiedCredentialIds, ...getBootstrapClearedCredentials()]);
      return finishSuccess({ status: "stored" });
    } catch (error) {
      return finishFailure(
        parseSettingsStorageErrorCode(error) || "credential_write_failed",
      );
    }
  });

  writeTails.set(target.id, run);
  run.finally(() => {
    if (writeTails.get(target.id) === run) {
      writeTails.delete(target.id);
    }
  });
  return run;
};

export const persistOfficialProviderSecret = (
  field,
  value,
  legacyWrite,
  legacyRestorers,
  options,
) => {
  const target = OFFICIAL_TARGETS[field];
  if (!target) {
    return Promise.resolve({
      ok: false,
      status: "unchanged",
      errorCode: "invalid_credential",
    });
  }
  const plaintext = typeof value === "string" ? value : "";
  return enqueueCredentialMutation(
    target,
    plaintext,
    legacyWrite,
    legacyRestorers,
    options,
  );
};

export const persistCustomProviderSecret = (
  slug,
  value,
  legacyWrite,
  legacyRestorers,
  options,
) => {
  const cleaned = typeof slug === "string" ? slug.trim() : "";
  if (!cleaned) {
    return Promise.resolve({
      ok: false,
      status: "unchanged",
      errorCode: "invalid_credential",
    });
  }
  const id = `custom.${cleaned}`;
  const plaintext = typeof value === "string" ? value : "";
  return enqueueCredentialMutation(
    { id, kind: "custom_provider", ownerId: id },
    plaintext,
    legacyWrite,
    legacyRestorers,
    options,
  );
};

export const persistCustomProviderSecretsSnapshot = (
  previous,
  next,
  legacyWrite,
  legacyRestorersForSlug,
) => {
  const before =
    previous && typeof previous === "object" && !Array.isArray(previous)
      ? previous
      : {};
  const after =
    next && typeof next === "object" && !Array.isArray(next) ? next : {};
  const slugs = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const id of getBootstrapConfiguredCredentials()) {
    if (id.startsWith("custom.") && id.length > "custom.".length) {
      slugs.add(id.slice("custom.".length));
    }
  }

  // The snapshot is one physical legacy write shared by every per-slug SQL
  // mutation. Resolve its lazy writer exactly once. When quit admission is
  // closed, leave it untouched; each per-slug enqueue below returns the
  // standard settings_quit_in_progress metadata without invoking a writer.
  const legacyWriteSucceeded = settingsQuitBarrierActive
    ? legacyWrite
    : runLegacyWrite(legacyWrite);
  return Promise.all(
    [...slugs].map((slug) =>
      persistCustomProviderSecret(
        slug,
        typeof after[slug] === "string" ? after[slug] : "",
        legacyWriteSucceeded,
        typeof legacyRestorersForSlug === "function"
          ? legacyRestorersForSlug(slug)
          : undefined,
      ),
    ),
  );
};

export const flushProviderCredentialWrites = async () => {
  while (writeTails.size > 0) {
    await Promise.all([...writeTails.values()]);
  }
};

export const beginProviderCredentialQuitDrain = async () => {
  settingsQuitBarrierActive = true;
  await flushProviderCredentialWrites();
};

export const endProviderCredentialQuitDrain = () => {
  settingsQuitBarrierActive = false;
};

/** Test-only: forget queue generations after all writes have settled. */
export const resetProviderCredentialPersistenceForTests = () => {
  writeTails.clear();
  writeGenerations.clear();
  confirmedSqlPresence.clear();
  confirmedLegacyRestorers.clear();
  verifiedCredentialIds.clear();
  settingsQuitBarrierActive = false;
};

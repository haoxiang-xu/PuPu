import { CHATS_STORAGE_KEY } from "./chat_storage_constants";
import { assertRecognizableLegacyChatStore } from "./chat_storage_migrate";

export const LEGACY_LOCALSTORAGE_KEY = CHATS_STORAGE_KEY;
export const MIGRATION_MARKER_KEY = `${CHATS_STORAGE_KEY}__migrated_to_ipc`;
export const PENDING_OPS_JOURNAL_KEY = `${CHATS_STORAGE_KEY}__pending_sql_ops`;

const MAX_PENDING_OPS_JOURNAL_BYTES = 4 * 1024 * 1024;
const MAX_PENDING_OPS_BATCHES = 512;
const MAX_PENDING_OPS_COUNT = 4096;
const MAX_WRITE_GUARD_EPOCH_CHARS = 128;
const RECOVERABLE_OP_TYPES = new Set([
  "put_tree_meta",
  "put_chat_meta",
  "put_messages",
  "delete_chats",
]);

const readLegacyFromLocalStorage = () => {
  if (typeof window === "undefined" || !window.localStorage) return null;
  let raw;
  try {
    raw = window.localStorage.getItem(LEGACY_LOCALSTORAGE_KEY);
  } catch (_error) {
    const error = new Error(
      "Legacy chat localStorage exists but could not be read; source left untouched",
    );
    error.code = "chat_legacy_source_unreadable";
    throw error;
  }
  if (raw === null) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_error) {
    const error = new Error(
      "Legacy chat localStorage exists but is not valid JSON; source left untouched",
    );
    error.code = "chat_legacy_source_unreadable";
    throw error;
  }
  return assertRecognizableLegacyChatStore(parsed);
};

const writeLegacyToLocalStorage = (payload) => {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(
      LEGACY_LOCALSTORAGE_KEY,
      JSON.stringify(payload),
    );
  } catch {
    // quota exceeded — swallow, renderer-level LRU already caps size
  }
};

const markMigrationDone = () => {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(
      MIGRATION_MARKER_KEY,
      new Date().toISOString(),
    );
  } catch {
    // ignore
  }
};

const isValidWriteGuard = (guard) =>
  !!guard &&
  typeof guard === "object" &&
  typeof guard.epoch === "string" &&
  guard.epoch.length > 0 &&
  guard.epoch.length <= MAX_WRITE_GUARD_EPOCH_CHARS &&
  guard.epoch.trim() === guard.epoch &&
  Number.isSafeInteger(guard.sequence) &&
  guard.sequence > 0;

const getPendingJournalEntryOps = (entry) => {
  if (Array.isArray(entry)) return entry;
  if (
    entry &&
    typeof entry === "object" &&
    isValidWriteGuard(entry.guard) &&
    Array.isArray(entry.ops) &&
    entry.ops.length > 0
  ) {
    return entry.ops;
  }
  return null;
};

const isValidPendingOpsJournal = (value) => {
  if (!Array.isArray(value) || value.length > MAX_PENDING_OPS_BATCHES) {
    return false;
  }
  let opCount = 0;
  for (const entry of value) {
    const ops = getPendingJournalEntryOps(entry);
    if (!ops) return false;
    opCount += ops.length;
    if (opCount > MAX_PENDING_OPS_COUNT) return false;
    for (const op of ops) {
      if (
        !op ||
        typeof op !== "object" ||
        !RECOVERABLE_OP_TYPES.has(op.type)
      ) {
        return false;
      }
    }
  }
  return true;
};

const readPendingOpsJournal = () => {
  if (typeof window === "undefined" || !window.localStorage) return [];
  const raw = window.localStorage.getItem(PENDING_OPS_JOURNAL_KEY);
  if (!raw) return [];
  if (raw.length * 2 > MAX_PENDING_OPS_JOURNAL_BYTES) {
    throw new Error("Chat storage recovery journal exceeds the size limit");
  }
  let value;
  try {
    value = JSON.parse(raw);
  } catch (_error) {
    throw new Error("Chat storage recovery journal is corrupt");
  }
  if (!isValidPendingOpsJournal(value)) {
    throw new Error("Chat storage recovery journal has an invalid payload");
  }
  return value;
};

const writePendingOpsJournal = (batches) => {
  if (typeof window === "undefined" || !window.localStorage) return false;
  if (!isValidPendingOpsJournal(batches)) {
    console.error("[chat-storage] refusing invalid recovery journal payload");
    return false;
  }
  let serialized;
  try {
    serialized = JSON.stringify(batches);
  } catch (error) {
    console.error("[chat-storage] failed to serialize recovery journal:", error);
    return false;
  }
  if (serialized.length * 2 > MAX_PENDING_OPS_JOURNAL_BYTES) {
    console.error("[chat-storage] recovery journal exceeds the size limit");
    return false;
  }
  try {
    window.localStorage.setItem(PENDING_OPS_JOURNAL_KEY, serialized);
    return true;
  } catch (error) {
    console.error("[chat-storage] failed to persist recovery journal:", error);
    return false;
  }
};

const clearPendingOpsJournal = () => {
  if (typeof window === "undefined" || !window.localStorage) return true;
  try {
    window.localStorage.removeItem(PENDING_OPS_JOURNAL_KEY);
    return true;
  } catch (error) {
    console.error("[chat-storage] failed to clear recovery journal:", error);
    return false;
  }
};

export const createChatStorageBackend = () => {
  const ipcApi =
    typeof window !== "undefined" && window.chatStorageAPI
      ? window.chatStorageAPI
      : null;

  const applyOpsSync = (ops) => {
    if (!ipcApi) return false;
    if (typeof ipcApi.applyOpsSync === "function") {
      ipcApi.applyOpsSync(ops);
      return true;
    }
    // Test/web adapters created before the sync-drain API can still provide a
    // genuinely synchronous applyOps implementation. Never mistake a Promise
    // for a durable unload acknowledgement.
    if (typeof ipcApi.applyOps === "function") {
      const result = ipcApi.applyOps(ops);
      if (result && typeof result.then === "function") {
        throw new Error("Chat storage sync drain is unavailable");
      }
      return true;
    }
    return false;
  };

  const readBootstrap = () => {
    if (!ipcApi) {
      return readLegacyFromLocalStorage();
    }

    // Establish DB health before replaying renderer recovery data. A corrupt
    // DB must remain byte-for-byte untouched for repair/export.
    let ipcSnapshot = ipcApi.bootstrap();
    const recoveryEntries = readPendingOpsJournal();
    if (recoveryEntries.length > 0) {
      // Pre-guard releases persisted arrays of ops. Replay those legacy
      // batches before guarded entries so upgrades never strand accepted work.
      const orderedRecoveryEntries = [
        ...recoveryEntries.filter((entry) => Array.isArray(entry)),
        ...recoveryEntries.filter((entry) => !Array.isArray(entry)),
      ];
      for (const entry of orderedRecoveryEntries) {
        if (!applyOpsSync(entry)) {
          throw new Error("Chat storage recovery sync drain is unavailable");
        }
      }
      // Validate the final snapshot before deleting the journal. A pre-guard
      // legacy clear failure must fail bootstrap closed; guarded entries can
      // remain physically stale because main atomically remembers their ids.
      ipcSnapshot = ipcApi.bootstrap();
      if (!clearPendingOpsJournal()) {
        const hasLegacyEntries = recoveryEntries.some((entry) =>
          Array.isArray(entry),
        );
        if (hasLegacyEntries) {
          throw new Error(
            "Chat storage recovery journal could not be cleared",
          );
        }
        // Guarded replay is recorded atomically with its SQL transaction.
        // A physical stale journal is therefore harmless: the next launch
        // skips it instead of regressing newer rows.
      }
    }
    if (ipcSnapshot) {
      return ipcSnapshot;
    }

    const alreadyMigrated =
      typeof window !== "undefined" &&
      window.localStorage &&
      window.localStorage.getItem(MIGRATION_MARKER_KEY);
    if (alreadyMigrated) {
      return null;
    }

    const legacy = readLegacyFromLocalStorage();
    if (!legacy) return null;

    try {
      // The preload bridge is synchronous for this one-time import and only
      // returns after the main-process transaction commits.
      ipcApi.write(legacy);
    } catch (error) {
      // Leave both the legacy payload and marker untouched.  Propagating the
      // failure prevents the renderer from treating an unreadable SQL store as
      // empty and issuing incremental writes against a partial migration.
      console.error("[chat-storage] legacy import failed:", error);
      throw error;
    }
    markMigrationDone();
    return legacy;
  };

  const persist = (store) => {
    if (ipcApi) {
      ipcApi.write(store);
      return;
    }
    writeLegacyToLocalStorage(store);
  };

  // v3 lazy-messages: single-chat sendSync read. Only meaningful on the IPC
  // path — in the localStorage fallback the store module keeps every message
  // in memory and must never call this (returns null so misuse is loud).
  const readMessages = (chatId) => {
    if (!ipcApi || typeof ipcApi.readMessages !== "function") {
      return null;
    }
    const rows = ipcApi.readMessages(chatId);
    if (!Array.isArray(rows)) {
      throw new Error("Chat storage readMessages returned an invalid payload");
    }
    return rows;
  };

  // v3 ops protocol: commit-acknowledged incremental writes. No-op in the
  // fallback build — persist() keeps writing the whole store there.
  const applyOps = (ops) => {
    if (!ipcApi || typeof ipcApi.applyOps !== "function") {
      return false;
    }
    try {
      const result = ipcApi.applyOps(ops);
      if (result && typeof result.then === "function") {
        return result.then(() => true);
      }
      return true;
    } catch (error) {
      return Promise.reject(error);
    }
  };

  return {
    readBootstrap,
    persist,
    readMessages,
    applyOps,
    applyOpsSync,
    writePendingOpsJournal,
    clearPendingOpsJournal,
  };
};

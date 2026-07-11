import { CHATS_STORAGE_KEY } from "./chat_storage_constants";

export const LEGACY_LOCALSTORAGE_KEY = CHATS_STORAGE_KEY;
export const MIGRATION_MARKER_KEY = `${CHATS_STORAGE_KEY}__migrated_to_ipc`;

const readLegacyFromLocalStorage = () => {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(LEGACY_LOCALSTORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
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

export const createChatStorageBackend = () => {
  const ipcApi =
    typeof window !== "undefined" && window.chatStorageAPI
      ? window.chatStorageAPI
      : null;

  const readBootstrap = () => {
    if (!ipcApi) {
      return readLegacyFromLocalStorage();
    }

    const ipcSnapshot = ipcApi.bootstrap();
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
      ipcApi.write(legacy);
    } catch {
      // if the write fails, we still hand legacy data back to the renderer
      // so at least the UI reflects it — migration will retry next boot
      return legacy;
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
    try {
      const rows = ipcApi.readMessages(chatId);
      return Array.isArray(rows) ? rows : [];
    } catch {
      return null;
    }
  };

  // v3 ops protocol: fire-and-forget incremental writes (spec §3). No-op in
  // the fallback build — persist() keeps writing the whole store there.
  const applyOps = (ops) => {
    if (!ipcApi || typeof ipcApi.applyOps !== "function") {
      return false;
    }
    ipcApi.applyOps(ops);
    return true;
  };

  return { readBootstrap, persist, readMessages, applyOps };
};

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

  return { readBootstrap, persist };
};

import { createIndexedDBStorageAdapter } from "../BUILTIN_COMPONENTs/mini_react/mini_storage";

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Attachment Payload Storage (IndexedDB)                                                                               */
/*                                                                                                                       */
/*  Persists base64 attachment payloads across page reloads. The in-memory Map in chat.js remains the hot cache;        */
/*  this store is the durable fallback. Entries decay after TTL_MS and are lazily deleted on read.                      */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const adapter = createIndexedDBStorageAdapter({
  dbName: "pupu_attachment_payloads",
  storeName: "payloads",
  version: 1,
});

/**
 * Persist an attachment payload to IndexedDB.
 * @param {string} id - The attachment ID (e.g. "att-<timestamp>-<rand>")
 * @param {object} payload - The raw payload object ({ type, source: { type, media_type, data, ... } })
 * @param {string} [name] - Optional human-readable filename for display in settings
 */
export const saveAttachmentPayload = async (id, payload, name = "") => {
  if (!id || !payload) return;
  try {
    await adapter.setItem(id, { payload, name, createdAt: Date.now() });
  } catch (_) {
    // Non-fatal — in-memory Map is still the active cache
  }
};

/**
 * Load a persisted attachment payload from IndexedDB.
 * Returns null if not found, expired, or on any error.
 * Lazily deletes expired entries.
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export const loadAttachmentPayload = async (id) => {
  if (!id) return null;
  try {
    const raw = await adapter.getItem(id);
    if (!raw) return null;

    let entry;
    try {
      entry = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (_) {
      return null;
    }

    if (!entry || typeof entry !== "object") return null;

    // Lazy TTL expiry
    if (
      typeof entry.createdAt === "number" &&
      Date.now() - entry.createdAt > TTL_MS
    ) {
      adapter.removeItem(id).catch(() => {});
      return null;
    }

    return entry.payload || null;
  } catch (_) {
    return null;
  }
};

/**
 * Delete a persisted attachment payload from IndexedDB.
 * @param {string} id
 */
export const deleteAttachmentPayload = async (id) => {
  if (!id) return;
  try {
    await adapter.removeItem(id);
  } catch (_) {
    // Non-fatal
  }
};

/**
 * List all persisted attachment entries (for display in settings).
 * Returns lightweight metadata — does NOT include base64 data.
 * @returns {Promise<Array<{ id: string, name: string, sizeBytes: number, createdAt: number }>>}
 */
export const listAttachmentEntries = () =>
  new Promise((resolve) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      resolve([]);
      return;
    }
    const req = window.indexedDB.open("pupu_attachment_payloads", 1);
    req.onerror = () => resolve([]);
    req.onsuccess = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("payloads")) {
        resolve([]);
        return;
      }
      const tx = db.transaction("payloads", "readonly");
      const store = tx.objectStore("payloads");
      const entries = [];
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = (ce) => {
        const cursor = ce.target.result;
        if (!cursor) {
          resolve(entries);
          return;
        }
        const val = cursor.value;
        const base64Data = val?.payload?.source?.data || "";
        const sizeBytes = Math.round(base64Data.length * 0.75);
        entries.push({
          id: cursor.key,
          name: val?.name || "",
          sizeBytes,
          createdAt: val?.createdAt || 0,
        });
        cursor.continue();
      };
      cursorReq.onerror = () => resolve(entries);
    };
  });

/**
 * Delete all persisted attachment payloads from IndexedDB.
 */
export const clearAllAttachmentPayloads = () =>
  new Promise((resolve) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      resolve();
      return;
    }
    const req = window.indexedDB.open("pupu_attachment_payloads", 1);
    req.onerror = () => resolve();
    req.onsuccess = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("payloads")) {
        resolve();
        return;
      }
      const tx = db.transaction("payloads", "readwrite");
      tx.objectStore("payloads").clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    };
  });

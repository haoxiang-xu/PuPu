const STORAGE_KEY = "pupu.durable_recovery_cancel_intents.v1";
const volatileIntentsByChatId = new Map();

const normalizedString = (value) =>
  typeof value === "string" ? value.trim() : "";

export const normalizeDurableRecoveryCancelIntent = (value) => {
  const chatId = normalizedString(value?.chatId || value?.chat_id);
  if (!chatId) {
    return null;
  }
  return {
    chatId,
    sessionId: normalizedString(value?.sessionId || value?.session_id),
    reason: normalizedString(value?.reason) || "user_stop",
    createdAt:
      Number.isFinite(Number(value?.createdAt)) && Number(value.createdAt) >= 0
        ? Number(value.createdAt)
        : Date.now(),
  };
};

const resolveStorage = (storage) => {
  if (storage) {
    return storage;
  }
  if (typeof window !== "undefined") {
    return window.localStorage;
  }
  return null;
};

export const readDurableRecoveryCancelIntents = (storage = null) => {
  const resolvedStorage = resolveStorage(storage);
  const deduplicated = new Map(volatileIntentsByChatId);
  if (!resolvedStorage) {
    return Array.from(deduplicated.values());
  }
  try {
    const parsed = JSON.parse(resolvedStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) {
      return Array.from(deduplicated.values());
    }
    parsed.forEach((item) => {
      const normalized = normalizeDurableRecoveryCancelIntent(item);
      if (normalized && !deduplicated.has(normalized.chatId)) {
        deduplicated.set(normalized.chatId, normalized);
      }
    });
    return Array.from(deduplicated.values());
  } catch (_error) {
    return Array.from(deduplicated.values());
  }
};

const writeDurableRecoveryCancelIntents = (entries, storage = null) => {
  const resolvedStorage = resolveStorage(storage);
  if (!resolvedStorage) {
    return false;
  }
  try {
    resolvedStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    return true;
  } catch (_error) {
    return false;
  }
};

export const getDurableRecoveryCancelIntent = (chatId, storage = null) => {
  const normalizedChatId = normalizedString(chatId);
  return (
    readDurableRecoveryCancelIntents(storage).find(
      (entry) => entry.chatId === normalizedChatId,
    ) || null
  );
};

export const enqueueDurableRecoveryCancelIntent = (
  intent,
  storage = null,
) => {
  const normalized = normalizeDurableRecoveryCancelIntent(intent);
  if (!normalized) {
    return null;
  }
  const entries = readDurableRecoveryCancelIntents(storage).filter(
    (entry) => entry.chatId !== normalized.chatId,
  );
  entries.push(normalized);
  if (writeDurableRecoveryCancelIntents(entries, storage)) {
    volatileIntentsByChatId.delete(normalized.chatId);
    return { ...normalized, outboxPersisted: true };
  }
  // Quota or storage availability must not turn Stop into a visual success.
  // Keep the intent for the lifetime of this renderer and continue retrying.
  volatileIntentsByChatId.set(normalized.chatId, normalized);
  return { ...normalized, outboxPersisted: false };
};

export const removeDurableRecoveryCancelIntent = (
  chatId,
  storage = null,
) => {
  const normalizedChatId = normalizedString(chatId);
  const volatileEntry = volatileIntentsByChatId.get(normalizedChatId) || null;
  const resolvedStorage = resolveStorage(storage);
  let persistedEntries = [];
  if (resolvedStorage) {
    try {
      const parsed = JSON.parse(resolvedStorage.getItem(STORAGE_KEY) || "[]");
      if (Array.isArray(parsed)) {
        persistedEntries = parsed
          .map(normalizeDurableRecoveryCancelIntent)
          .filter(Boolean);
      }
    } catch (_error) {
      // A corrupt/unreadable record is not a successful acknowledgement.
      return false;
    }
  }
  const nextPersistedEntries = persistedEntries.filter(
    (entry) => entry.chatId !== normalizedChatId,
  );
  const hadPersistedEntry =
    nextPersistedEntries.length !== persistedEntries.length;
  if (
    hadPersistedEntry &&
    !writeDurableRecoveryCancelIntents(nextPersistedEntries, storage)
  ) {
    if (volatileEntry) {
      volatileIntentsByChatId.set(normalizedChatId, volatileEntry);
    }
    return false;
  }
  const volatileRemoved = volatileIntentsByChatId.delete(normalizedChatId);
  return volatileRemoved || hadPersistedEntry;
};

export const DURABLE_RECOVERY_CANCEL_INTENT_STORAGE_KEY = STORAGE_KEY;

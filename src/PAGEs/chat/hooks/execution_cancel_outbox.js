const STORAGE_KEY = "pupu.execution_cancel_outbox.v1";
const MAX_ENTRIES = 64;

const normalizedString = (value) =>
  typeof value === "string" ? value.trim() : "";

const cancellationKey = (entry) =>
  `${entry.sessionId}\u0000${entry.attemptId}\u0000${entry.interactionId || ""}`;

export const normalizeExecutionCancelOutboxEntry = (value) => {
  const sessionId = normalizedString(value?.sessionId || value?.session_id);
  const attemptId = normalizedString(value?.attemptId || value?.attempt_id);
  if (!sessionId || !attemptId) {
    return null;
  }
  return {
    ownerChatId: normalizedString(
      value?.ownerChatId || value?.owner_chat_id,
    ),
    sessionId,
    attemptId,
    sourceAttemptId: normalizedString(
      value?.sourceAttemptId || value?.source_attempt_id,
    ),
    interactionId: normalizedString(
      value?.interactionId || value?.interaction_id,
    ),
    requestId: normalizedString(value?.requestId || value?.request_id),
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

export const readExecutionCancelOutbox = (storage = null) => {
  const resolvedStorage = resolveStorage(storage);
  if (!resolvedStorage) {
    return [];
  }
  try {
    const parsed = JSON.parse(resolvedStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) {
      return [];
    }
    const deduplicated = new Map();
    parsed.forEach((item) => {
      const normalized = normalizeExecutionCancelOutboxEntry(item);
      if (normalized) {
        deduplicated.set(
          cancellationKey(normalized),
          normalized,
        );
      }
    });
    return Array.from(deduplicated.values()).slice(-MAX_ENTRIES);
  } catch (_error) {
    return [];
  }
};

const writeExecutionCancelOutbox = (entries, storage = null) => {
  const resolvedStorage = resolveStorage(storage);
  if (!resolvedStorage) {
    return false;
  }
  try {
    resolvedStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(entries.slice(-MAX_ENTRIES)),
    );
    return true;
  } catch (_error) {
    return false;
  }
};

export const enqueueExecutionCancel = (identity, storage = null) => {
  const normalized = normalizeExecutionCancelOutboxEntry(identity);
  if (!normalized) {
    return null;
  }
  const currentEntries = readExecutionCancelOutbox(storage);
  const previous = currentEntries.find(
    (entry) => cancellationKey(entry) === cancellationKey(normalized),
  );
  if (
    previous?.ownerChatId &&
    normalized.ownerChatId &&
    previous.ownerChatId !== normalized.ownerChatId
  ) {
    return null;
  }
  const merged = previous
    ? {
        ...previous,
        ...normalized,
        ownerChatId: normalized.ownerChatId || previous.ownerChatId,
        sourceAttemptId:
          normalized.sourceAttemptId || previous.sourceAttemptId,
        interactionId:
          normalized.interactionId || previous.interactionId,
        requestId: normalized.requestId || previous.requestId,
        createdAt: Math.min(previous.createdAt, normalized.createdAt),
      }
    : normalized;
  const entries = currentEntries.filter(
    (entry) => cancellationKey(entry) !== cancellationKey(normalized),
  );
  entries.push(merged);
  writeExecutionCancelOutbox(entries, storage);
  // Persistence is best effort. A storage quota/security failure must never
  // prevent the immediate semantic cancellation and transport disconnect.
  return merged;
};

export const removeExecutionCancel = (
  sessionId,
  attemptId,
  interactionId = "",
  storage = null,
) => {
  const normalizedSessionId = normalizedString(sessionId);
  const normalizedAttemptId = normalizedString(attemptId);
  const normalizedInteractionId = normalizedString(interactionId);
  const entries = readExecutionCancelOutbox(storage);
  const nextEntries = entries.filter(
    (entry) =>
      !(
        entry.sessionId === normalizedSessionId &&
        entry.attemptId === normalizedAttemptId &&
        entry.interactionId === normalizedInteractionId
      ),
  );
  if (nextEntries.length !== entries.length) {
    return writeExecutionCancelOutbox(nextEntries, storage);
  }
  return false;
};

export const EXECUTION_CANCEL_OUTBOX_STORAGE_KEY = STORAGE_KEY;

const STORAGE_KEY = "pupu.logical_execution_cancel_outbox.v2";

const normalizedString = (value) =>
  typeof value === "string" ? value.trim() : "";

export const normalizeLogicalExecutionCancelOutboxEntry = (value) => {
  const sessionId = normalizedString(value?.sessionId || value?.session_id);
  const logicalExecutionId = normalizedString(
    value?.logicalExecutionId || value?.logical_execution_id,
  );
  if (!sessionId || !logicalExecutionId) {
    return null;
  }
  return {
    sessionId,
    logicalExecutionId,
    attemptId: normalizedString(value?.attemptId || value?.attempt_id),
    sourceAttemptId: normalizedString(
      value?.sourceAttemptId || value?.source_attempt_id,
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

export const readLogicalExecutionCancelOutbox = (storage = null) => {
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
      const normalized = normalizeLogicalExecutionCancelOutboxEntry(item);
      if (normalized) {
        deduplicated.set(
          `${normalized.sessionId}\u0000${normalized.logicalExecutionId}`,
          normalized,
        );
      }
    });
    return Array.from(deduplicated.values());
  } catch (_error) {
    return [];
  }
};

const writeLogicalExecutionCancelOutbox = (entries, storage = null) => {
  const resolvedStorage = resolveStorage(storage);
  if (!resolvedStorage) {
    return false;
  }
  try {
    resolvedStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(entries),
    );
    return true;
  } catch (_error) {
    return false;
  }
};

export const enqueueLogicalExecutionCancel = (identity, storage = null) => {
  const normalized = normalizeLogicalExecutionCancelOutboxEntry(identity);
  if (!normalized) {
    return null;
  }
  const currentEntries = readLogicalExecutionCancelOutbox(storage);
  const previous = currentEntries.find(
    (entry) =>
      entry.sessionId === normalized.sessionId &&
      entry.logicalExecutionId === normalized.logicalExecutionId,
  );
  const merged = previous
    ? {
        ...previous,
        ...normalized,
        attemptId: normalized.attemptId || previous.attemptId,
        sourceAttemptId:
          normalized.sourceAttemptId || previous.sourceAttemptId,
        requestId: normalized.requestId || previous.requestId,
        createdAt: Math.min(previous.createdAt, normalized.createdAt),
      }
    : normalized;
  const entries = currentEntries.filter(
    (entry) =>
      !(
        entry.sessionId === normalized.sessionId &&
        entry.logicalExecutionId === normalized.logicalExecutionId
      ),
  );
  entries.push(merged);
  return writeLogicalExecutionCancelOutbox(entries, storage) ? merged : null;
};

export const removeLogicalExecutionCancel = (
  sessionId,
  logicalExecutionId,
  storage = null,
) => {
  const normalizedSessionId = normalizedString(sessionId);
  const normalizedLogicalExecutionId = normalizedString(logicalExecutionId);
  const entries = readLogicalExecutionCancelOutbox(storage);
  const nextEntries = entries.filter(
    (entry) =>
      !(
        entry.sessionId === normalizedSessionId &&
        entry.logicalExecutionId === normalizedLogicalExecutionId
      ),
  );
  if (nextEntries.length !== entries.length) {
    return writeLogicalExecutionCancelOutbox(nextEntries, storage);
  }
  return false;
};

export const LOGICAL_EXECUTION_CANCEL_OUTBOX_STORAGE_KEY = STORAGE_KEY;

const STORAGE_KEY = "pupu.turn_mutation_outbox.v1";
const MAX_ENTRIES = 32;

const normalizedString = (value) =>
  typeof value === "string" ? value.trim() : "";

const resolveStorage = (storage) => {
  if (storage) return storage;
  if (typeof window !== "undefined") return window.localStorage;
  return null;
};

const stableMessageShape = (message) => ({
  id: normalizedString(message?.id),
  role: normalizedString(message?.role),
  content:
    typeof message?.content === "string"
      ? message.content
      : JSON.stringify(message?.content ?? null),
  status: normalizedString(message?.status),
  attachments: Array.isArray(message?.attachments)
    ? message.attachments.map((attachment) => normalizedString(attachment?.id))
    : [],
});

const fnv1a = (value) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

export const fingerprintTurnMutationMessages = (messages) =>
  fnv1a(
    JSON.stringify(
      (Array.isArray(messages) ? messages : []).map(stableMessageShape),
    ),
  );

export const createTurnMutationOperationId = (chatId) =>
  `turn-${normalizedString(chatId) || "chat"}-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`;

export const normalizeTurnMutationOutboxEntry = (value) => {
  const operationId = normalizedString(value?.operationId || value?.operation_id);
  const chatId = normalizedString(value?.chatId || value?.chat_id);
  const sessionId = normalizedString(value?.sessionId || value?.session_id);
  const kind = normalizedString(value?.kind);
  const targetMessageId = normalizedString(
    value?.targetMessageId || value?.target_message_id,
  );
  if (
    !operationId ||
    !chatId ||
    !sessionId ||
    !targetMessageId ||
    !["resend", "edit", "delete"].includes(kind)
  ) {
    return null;
  }
  return {
    operationId,
    chatId,
    sessionId,
    kind,
    targetMessageId,
    originalFingerprint: normalizedString(value?.originalFingerprint),
    baseFingerprint: normalizedString(value?.baseFingerprint),
    resultFingerprint: normalizedString(value?.resultFingerprint),
    baseMessageCount: Math.max(0, Number(value?.baseMessageCount) || 0),
    text: typeof value?.text === "string" ? value.text : "",
    extraToolkits: Array.isArray(value?.extraToolkits)
      ? value.extraToolkits.filter((item) => typeof item === "string")
      : [],
    composer:
      value?.composer && typeof value.composer === "object"
        ? value.composer
        : null,
    modelId: normalizedString(value?.modelId),
    threadId: normalizedString(value?.threadId),
    memoryNamespace: normalizedString(value?.memoryNamespace),
    forceMemoryEnabled: value?.forceMemoryEnabled === true,
    expectedCancelAttemptId: normalizedString(value?.expectedCancelAttemptId),
    expectedSessionRevision:
      value?.expectedSessionRevision !== null &&
      typeof value?.expectedSessionRevision !== "undefined" &&
      value?.expectedSessionRevision !== "" &&
      Number.isInteger(Number(value.expectedSessionRevision))
      ? Math.max(0, Number(value.expectedSessionRevision))
      : null,
    createdAt:
      Number.isFinite(Number(value?.createdAt)) && Number(value.createdAt) >= 0
        ? Number(value.createdAt)
        : Date.now(),
  };
};

export const readTurnMutationOutbox = (storage = null) => {
  const resolvedStorage = resolveStorage(storage);
  if (!resolvedStorage) return [];
  try {
    const parsed = JSON.parse(resolvedStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    const deduplicated = new Map();
    parsed.forEach((item) => {
      const normalized = normalizeTurnMutationOutboxEntry(item);
      if (normalized) deduplicated.set(normalized.operationId, normalized);
    });
    return Array.from(deduplicated.values()).slice(-MAX_ENTRIES);
  } catch (_error) {
    return [];
  }
};

const writeTurnMutationOutbox = (entries, storage = null) => {
  const resolvedStorage = resolveStorage(storage);
  if (!resolvedStorage) return false;
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

export const enqueueTurnMutation = (entry, storage = null) => {
  const normalized = normalizeTurnMutationOutboxEntry(entry);
  if (!normalized) return null;
  const currentEntries = readTurnMutationOutbox(storage);
  const replacesExisting = currentEntries.some(
    (item) => item.operationId === normalized.operationId,
  );
  if (!replacesExisting && currentEntries.length >= MAX_ENTRIES) {
    return null;
  }
  const entries = currentEntries.filter(
    (item) => item.operationId !== normalized.operationId,
  );
  entries.push(normalized);
  return writeTurnMutationOutbox(entries, storage) ? normalized : null;
};

export const removeTurnMutation = (operationId, storage = null) => {
  const normalizedOperationId = normalizedString(operationId);
  const entries = readTurnMutationOutbox(storage);
  const nextEntries = entries.filter(
    (entry) => entry.operationId !== normalizedOperationId,
  );
  if (nextEntries.length === entries.length) return false;
  return writeTurnMutationOutbox(nextEntries, storage);
};

export const TURN_MUTATION_OUTBOX_STORAGE_KEY = STORAGE_KEY;

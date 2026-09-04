const STORAGE_KEY = "pupu.queued_turn_outbox.v1";
const OUTBOX_VERSION = 2;
const MAX_ENTRIES = 64;
const MAX_ITEMS_PER_ENTRY = 64;
const MAX_PENDING_CLARIFIES = 64;
const MAX_PENDING_FYIS = 64;

const normalizedString = (value) =>
  typeof value === "string" ? value.trim() : "";

const resolveStorage = (storage) => {
  if (storage) return storage;
  if (typeof window !== "undefined") return window.localStorage;
  return null;
};

/* Memory V2 P0 secret gate. The ONLY disposition a persisted queued item may
   carry: the user explicitly approved sending this exact item as plain text.
   Any other value normalizes to "" (= not approved), so a hand-edited or
   pre-gate localStorage entry can never claim approval it never got. */
export const QUEUED_TURN_PLAIN_DISPOSITION = "plain_user_approved";

const normalizeQueuedTurnDisposition = (value) =>
  value === QUEUED_TURN_PLAIN_DISPOSITION ? QUEUED_TURN_PLAIN_DISPOSITION : "";

const normalizeQueuedTurnItems = (items, { rejectOverflow = false } = {}) => {
  const deduplicated = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const id = normalizedString(item?.id);
    const text = typeof item?.text === "string" ? item.text : "";
    const status = normalizedString(item?.status);
    if (!id || !text.trim() || !["queued", "relayed"].includes(status)) {
      continue;
    }
    const disposition = normalizeQueuedTurnDisposition(item?.disposition);
    deduplicated.set(id, {
      id,
      text,
      status,
      ...(disposition ? { disposition } : {}),
    });
  }
  if (rejectOverflow && deduplicated.size > MAX_ITEMS_PER_ENTRY) {
    return null;
  }
  return Array.from(deduplicated.values()).slice(0, MAX_ITEMS_PER_ENTRY);
};

const queueOwnerKey = (value) => {
  const chatId = normalizedString(value?.chatId || value?.chat_id);
  const attemptId = normalizedString(value?.attemptId || value?.attempt_id);
  const clientOperationId = normalizedString(
    value?.clientOperationId || value?.client_operation_id || value?.clientOpId,
  );
  if (!chatId || (!attemptId && !clientOperationId)) return "";
  return `${chatId}\u0000${attemptId ? `attempt:${attemptId}` : `client:${clientOperationId}`}`;
};

export const normalizeQueuedTurnOutboxEntry = (value) => {
  const chatId = normalizedString(value?.chatId || value?.chat_id);
  const attemptId = normalizedString(value?.attemptId || value?.attempt_id);
  const clientOperationId = normalizedString(
    value?.clientOperationId || value?.client_operation_id || value?.clientOpId,
  );
  const items = normalizeQueuedTurnItems(value?.items);
  if (!chatId || (!attemptId && !clientOperationId) || items.length === 0) {
    return null;
  }
  return {
    chatId,
    ...(attemptId ? { attemptId } : { clientOperationId }),
    items,
    updatedAt:
      Number.isFinite(Number(value?.updatedAt)) && Number(value.updatedAt) >= 0
        ? Number(value.updatedAt)
        : Date.now(),
  };
};

const normalizePendingClarify = (value) => {
  const chatId = normalizedString(value?.chatId || value?.chat_id);
  const sourceAttemptId = normalizedString(
    value?.sourceAttemptId || value?.source_attempt_id,
  );
  const clientOperationId = normalizedString(
    value?.clientOperationId || value?.client_operation_id || value?.clientOpId,
  );
  const id = normalizedString(value?.id);
  const text = typeof value?.text === "string" ? value.text : "";
  if (
    !chatId ||
    (!sourceAttemptId && !clientOperationId) ||
    !id ||
    !text.trim()
  ) {
    return null;
  }
  const disposition = normalizeQueuedTurnDisposition(value?.disposition);
  return {
    chatId,
    ...(sourceAttemptId ? { sourceAttemptId } : { clientOperationId }),
    id,
    text,
    ...(disposition ? { disposition } : {}),
    updatedAt:
      Number.isFinite(Number(value?.updatedAt)) && Number(value.updatedAt) >= 0
        ? Number(value.updatedAt)
        : Date.now(),
  };
};

const normalizePendingFyi = (value) => {
  const chatId = normalizedString(value?.chatId || value?.chat_id);
  const attemptId = normalizedString(value?.attemptId || value?.attempt_id);
  const messageId = normalizedString(value?.messageId || value?.message_id);
  const text = typeof value?.text === "string" ? value.text : "";
  const requestedChannel = normalizedString(
    value?.requestedChannel || value?.requested_channel,
  );
  const threadId = normalizedString(value?.threadId || value?.thread_id);
  if (
    !chatId ||
    !attemptId ||
    !messageId ||
    !text.trim() ||
    !requestedChannel ||
    !threadId
  ) {
    return null;
  }
  const disposition = normalizeQueuedTurnDisposition(value?.disposition);
  return {
    chatId,
    attemptId,
    messageId,
    text,
    requestedChannel,
    threadId,
    ...(disposition ? { disposition } : {}),
    updatedAt:
      Number.isFinite(Number(value?.updatedAt)) && Number(value.updatedAt) >= 0
        ? Number(value.updatedAt)
        : Date.now(),
  };
};

const readOutboxState = (storage = null) => {
  const resolvedStorage = resolveStorage(storage);
  if (!resolvedStorage) {
    return { version: OUTBOX_VERSION, queues: [], clarifies: [], fyis: [] };
  }
  try {
    const parsed = JSON.parse(resolvedStorage.getItem(STORAGE_KEY) || "[]");
    const rawQueues = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.queues)
        ? parsed.queues
        : [];
    const rawClarifies = Array.isArray(parsed?.clarifies)
      ? parsed.clarifies
      : [];
    const rawFyis = Array.isArray(parsed?.fyis) ? parsed.fyis : [];
    const queuesByOwner = new Map();
    rawQueues.forEach((item) => {
      const normalized = normalizeQueuedTurnOutboxEntry(item);
      const ownerKey = queueOwnerKey(normalized);
      if (normalized && ownerKey) queuesByOwner.set(ownerKey, normalized);
    });
    const clarifiesByChat = new Map();
    rawClarifies.forEach((item) => {
      const normalized = normalizePendingClarify(item);
      if (!normalized) return;
      const previous = clarifiesByChat.get(normalized.chatId);
      if (!previous || normalized.updatedAt >= previous.updatedAt) {
        clarifiesByChat.set(normalized.chatId, normalized);
      }
    });
    const fyisByIdentity = new Map();
    rawFyis.forEach((item) => {
      const normalized = normalizePendingFyi(item);
      if (!normalized) return;
      fyisByIdentity.set(
        `${normalized.chatId}\u0000${normalized.attemptId}\u0000${normalized.messageId}`,
        normalized,
      );
    });
    return {
      version: OUTBOX_VERSION,
      queues: Array.from(queuesByOwner.values()).slice(-MAX_ENTRIES),
      clarifies: Array.from(clarifiesByChat.values()).slice(
        -MAX_PENDING_CLARIFIES,
      ),
      fyis: Array.from(fyisByIdentity.values()).slice(-MAX_PENDING_FYIS),
    };
  } catch (_error) {
    return { version: OUTBOX_VERSION, queues: [], clarifies: [], fyis: [] };
  }
};

export const readQueuedTurnOutbox = (storage = null) =>
  readOutboxState(storage).queues;

const writeQueuedTurnOutbox = (state, storage = null) => {
  const resolvedStorage = resolveStorage(storage);
  if (!resolvedStorage) return false;
  try {
    resolvedStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: OUTBOX_VERSION,
        queues: state.queues,
        clarifies: state.clarifies,
        fyis: state.fyis,
      }),
    );
    return true;
  } catch (_error) {
    return false;
  }
};

export const createQueuedTurnClientOperationId = () => {
  const randomPart =
    typeof window !== "undefined" &&
    typeof window.crypto?.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `queue-op-${randomPart}`;
};

export const createPendingFyiMessageId = () => {
  const randomPart =
    typeof window !== "undefined" &&
    typeof window.crypto?.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `fyi-client-${randomPart}`;
};

export const readQueuedTurnsForAttempt = (
  chatId,
  attemptId,
  storage = null,
) => {
  const normalizedChatId = normalizedString(chatId);
  const normalizedAttemptId = normalizedString(attemptId);
  if (!normalizedChatId || !normalizedAttemptId) return null;
  return (
    readQueuedTurnOutbox(storage).find(
      (entry) =>
        entry.chatId === normalizedChatId &&
        entry.attemptId === normalizedAttemptId,
    ) || null
  );
};

export const readQueuedTurnsForClientOperation = (
  chatId,
  clientOperationId,
  storage = null,
) => {
  const normalizedChatId = normalizedString(chatId);
  const normalizedClientOperationId = normalizedString(clientOperationId);
  if (!normalizedChatId || !normalizedClientOperationId) return null;
  return (
    readQueuedTurnOutbox(storage).find(
      (entry) =>
        entry.chatId === normalizedChatId &&
        entry.clientOperationId === normalizedClientOperationId,
    ) || null
  );
};

export const readQueuedTurnsForChat = (chatId, storage = null) => {
  const normalizedChatId = normalizedString(chatId);
  if (!normalizedChatId) return [];
  return readQueuedTurnOutbox(storage).filter(
    (entry) => entry.chatId === normalizedChatId,
  );
};

const writeQueuedTurnsForOwner = (entry, storage = null) => {
  const normalized = normalizeQueuedTurnOutboxEntry(entry);
  const strictItems = normalizeQueuedTurnItems(entry?.items, {
    rejectOverflow: true,
  });
  if (!normalized || !strictItems || strictItems.length === 0) return null;
  normalized.items = strictItems;
  normalized.updatedAt = Date.now();

  const currentState = readOutboxState(storage);
  const ownerKey = queueOwnerKey(normalized);
  const replacesExisting = currentState.queues.some(
    (item) => queueOwnerKey(item) === ownerKey,
  );
  if (!replacesExisting && currentState.queues.length >= MAX_ENTRIES) {
    return null;
  }
  const nextState = {
    ...currentState,
    queues: [
      ...currentState.queues.filter(
        (item) => queueOwnerKey(item) !== ownerKey,
      ),
      normalized,
    ],
  };
  return writeQueuedTurnOutbox(nextState, storage) ? normalized : null;
};

export const writeQueuedTurnsForAttempt = (entry, storage = null) => {
  const chatId = normalizedString(entry?.chatId || entry?.chat_id);
  const attemptId = normalizedString(entry?.attemptId || entry?.attempt_id);
  if (!chatId || !attemptId) return null;
  const items = normalizeQueuedTurnItems(entry?.items, { rejectOverflow: true });
  if (!items) return null;
  if (items.length === 0) {
    removeQueuedTurnsForAttempt(chatId, attemptId, storage);
    return null;
  }
  return writeQueuedTurnsForOwner({ chatId, attemptId, items }, storage);
};

export const writeQueuedTurnsForClientOperation = (entry, storage = null) => {
  const chatId = normalizedString(entry?.chatId || entry?.chat_id);
  const clientOperationId = normalizedString(
    entry?.clientOperationId ||
      entry?.client_operation_id ||
      entry?.clientOpId,
  );
  if (!chatId || !clientOperationId) return null;
  const items = normalizeQueuedTurnItems(entry?.items, { rejectOverflow: true });
  if (!items) return null;
  if (items.length === 0) {
    removeQueuedTurnsForClientOperation(chatId, clientOperationId, storage);
    return null;
  }
  return writeQueuedTurnsForOwner(
    { chatId, clientOperationId, items },
    storage,
  );
};

const removeQueuedTurnsForOwner = (owner, storage = null) => {
  const ownerKey = queueOwnerKey(owner);
  if (!ownerKey) return false;
  const currentState = readOutboxState(storage);
  const nextQueues = currentState.queues.filter(
    (entry) => queueOwnerKey(entry) !== ownerKey,
  );
  if (nextQueues.length === currentState.queues.length) return false;
  return writeQueuedTurnOutbox(
    { ...currentState, queues: nextQueues },
    storage,
  );
};

export const removeQueuedTurnsForAttempt = (
  chatId,
  attemptId,
  storage = null,
) =>
  removeQueuedTurnsForOwner(
    {
      chatId: normalizedString(chatId),
      attemptId: normalizedString(attemptId),
    },
    storage,
  );

export const removeQueuedTurnsForClientOperation = (
  chatId,
  clientOperationId,
  storage = null,
) =>
  removeQueuedTurnsForOwner(
    {
      chatId: normalizedString(chatId),
      clientOperationId: normalizedString(clientOperationId),
    },
    storage,
  );

export const bindQueuedTurnOwnersToAttempt = (
  {
    chatId,
    targetAttemptId,
    sourceAttemptId = "",
    clientOperationIds = [],
    items,
  },
  storage = null,
) => {
  const normalizedChatId = normalizedString(chatId);
  const normalizedTargetAttemptId = normalizedString(targetAttemptId);
  const normalizedSourceAttemptId = normalizedString(sourceAttemptId);
  const normalizedClientOperationIds = new Set(
    (Array.isArray(clientOperationIds) ? clientOperationIds : [])
      .map(normalizedString)
      .filter(Boolean),
  );
  if (!normalizedChatId || !normalizedTargetAttemptId) return null;

  const currentState = readOutboxState(storage);
  const isSourceQueue = (entry) =>
    entry.chatId === normalizedChatId &&
    (entry.attemptId === normalizedTargetAttemptId ||
      (normalizedSourceAttemptId &&
        entry.attemptId === normalizedSourceAttemptId) ||
      normalizedClientOperationIds.has(entry.clientOperationId));
  const sourceQueues = currentState.queues.filter(isSourceQueue);
  const sourceItems = sourceQueues.flatMap((entry) => entry.items);
  const normalizedItems = normalizeQueuedTurnItems(
    items === undefined ? sourceItems : items,
    { rejectOverflow: true },
  );
  if (!normalizedItems) return null;

  const nextQueues = currentState.queues.filter((entry) => !isSourceQueue(entry));
  let boundQueue = null;
  if (normalizedItems.length > 0) {
    if (nextQueues.length >= MAX_ENTRIES) return null;
    boundQueue = {
      chatId: normalizedChatId,
      attemptId: normalizedTargetAttemptId,
      items: normalizedItems,
      updatedAt: Date.now(),
    };
    nextQueues.push(boundQueue);
  }

  const reboundClarifies = [];
  const nextClarifies = currentState.clarifies.map((clarify) => {
    const shouldBind =
      clarify.chatId === normalizedChatId &&
      (clarify.sourceAttemptId === normalizedSourceAttemptId ||
        normalizedClientOperationIds.has(clarify.clientOperationId));
    if (!shouldBind) return clarify;
    const rebound = {
      chatId: normalizedChatId,
      sourceAttemptId: normalizedTargetAttemptId,
      id: clarify.id,
      text: clarify.text,
      updatedAt: Date.now(),
    };
    reboundClarifies.push(rebound);
    return rebound;
  });

  const nextState = {
    ...currentState,
    queues: nextQueues,
    clarifies: nextClarifies,
  };
  if (!writeQueuedTurnOutbox(nextState, storage)) return null;
  return { queue: boundQueue, clarifies: reboundClarifies };
};

export const readPendingClarifyForChat = (chatId, storage = null) => {
  const normalizedChatId = normalizedString(chatId);
  if (!normalizedChatId) return null;
  return (
    readOutboxState(storage).clarifies.find(
      (entry) => entry.chatId === normalizedChatId,
    ) || null
  );
};

export const writePendingClarify = (entry, storage = null) => {
  const normalized = normalizePendingClarify(entry);
  if (!normalized) return null;
  normalized.updatedAt = Date.now();
  const currentState = readOutboxState(storage);
  const replacesExisting = currentState.clarifies.some(
    (item) => item.chatId === normalized.chatId,
  );
  if (!replacesExisting && currentState.clarifies.length >= MAX_PENDING_CLARIFIES) {
    return null;
  }
  const nextState = {
    ...currentState,
    clarifies: [
      ...currentState.clarifies.filter(
        (item) => item.chatId !== normalized.chatId,
      ),
      normalized,
    ],
  };
  return writeQueuedTurnOutbox(nextState, storage) ? normalized : null;
};

export const removePendingClarify = (chatId, id = "", storage = null) => {
  const normalizedChatId = normalizedString(chatId);
  const normalizedId = normalizedString(id);
  if (!normalizedChatId) return false;
  const currentState = readOutboxState(storage);
  const nextClarifies = currentState.clarifies.filter(
    (entry) =>
      entry.chatId !== normalizedChatId ||
      (normalizedId && entry.id !== normalizedId),
  );
  if (nextClarifies.length === currentState.clarifies.length) return false;
  return writeQueuedTurnOutbox(
    { ...currentState, clarifies: nextClarifies },
    storage,
  );
};

export const readPendingFyiOutbox = (storage = null) =>
  readOutboxState(storage).fyis;

export const readPendingFyisForAttempt = (
  chatId,
  attemptId,
  storage = null,
) => {
  const normalizedChatId = normalizedString(chatId);
  const normalizedAttemptId = normalizedString(attemptId);
  if (!normalizedChatId || !normalizedAttemptId) return [];
  return readOutboxState(storage).fyis.filter(
    (entry) =>
      entry.chatId === normalizedChatId &&
      entry.attemptId === normalizedAttemptId,
  );
};

export const writePendingFyi = (entry, storage = null) => {
  const normalized = normalizePendingFyi(entry);
  if (!normalized) return null;
  normalized.updatedAt = Date.now();
  const currentState = readOutboxState(storage);
  const isSame = (item) =>
    item.chatId === normalized.chatId &&
    item.attemptId === normalized.attemptId &&
    item.messageId === normalized.messageId;
  const replacesExisting = currentState.fyis.some(isSame);
  if (!replacesExisting && currentState.fyis.length >= MAX_PENDING_FYIS) {
    return null;
  }
  const nextState = {
    ...currentState,
    fyis: [...currentState.fyis.filter((item) => !isSame(item)), normalized],
  };
  return writeQueuedTurnOutbox(nextState, storage) ? normalized : null;
};

export const removePendingFyi = (
  chatId,
  attemptId,
  messageId,
  storage = null,
) => {
  const normalizedChatId = normalizedString(chatId);
  const normalizedAttemptId = normalizedString(attemptId);
  const normalizedMessageId = normalizedString(messageId);
  if (!normalizedChatId || !normalizedAttemptId || !normalizedMessageId) {
    return false;
  }
  const currentState = readOutboxState(storage);
  const nextFyis = currentState.fyis.filter(
    (entry) =>
      entry.chatId !== normalizedChatId ||
      entry.attemptId !== normalizedAttemptId ||
      entry.messageId !== normalizedMessageId,
  );
  if (nextFyis.length === currentState.fyis.length) return false;
  return writeQueuedTurnOutbox({ ...currentState, fyis: nextFyis }, storage);
};

export const removePendingFyisForAttempt = (
  chatId,
  attemptId,
  storage = null,
) => {
  const normalizedChatId = normalizedString(chatId);
  const normalizedAttemptId = normalizedString(attemptId);
  if (!normalizedChatId || !normalizedAttemptId) return false;
  const currentState = readOutboxState(storage);
  const nextFyis = currentState.fyis.filter(
    (entry) =>
      entry.chatId !== normalizedChatId ||
      entry.attemptId !== normalizedAttemptId,
  );
  if (nextFyis.length === currentState.fyis.length) return false;
  return writeQueuedTurnOutbox({ ...currentState, fyis: nextFyis }, storage);
};

export const migratePendingFyiForAttemptToQueue = (
  chatId,
  attemptId,
  storage = null,
) => {
  const normalizedChatId = normalizedString(chatId);
  const normalizedAttemptId = normalizedString(attemptId);
  if (!normalizedChatId || !normalizedAttemptId) return null;
  const currentState = readOutboxState(storage);
  const pending = currentState.fyis.filter(
    (entry) =>
      entry.chatId === normalizedChatId &&
      entry.attemptId === normalizedAttemptId,
  );
  if (pending.length === 0) return null;

  const existing = currentState.queues.find(
    (entry) =>
      entry.chatId === normalizedChatId &&
      entry.attemptId === normalizedAttemptId,
  );
  const items = normalizeQueuedTurnItems(
    [
      ...(existing?.items || []),
      ...pending.map((entry) => ({
        id: entry.messageId,
        text: entry.text,
        status: "queued",
        ...(entry.disposition ? { disposition: entry.disposition } : {}),
      })),
    ],
    { rejectOverflow: true },
  );
  if (!items) return null;

  const nextQueues = currentState.queues.filter(
    (entry) =>
      entry.chatId !== normalizedChatId ||
      entry.attemptId !== normalizedAttemptId,
  );
  if (!existing && nextQueues.length >= MAX_ENTRIES) return null;
  const queue = {
    chatId: normalizedChatId,
    attemptId: normalizedAttemptId,
    items,
    updatedAt: Date.now(),
  };
  nextQueues.push(queue);
  const nextState = {
    ...currentState,
    queues: nextQueues,
    fyis: currentState.fyis.filter(
      (entry) =>
        entry.chatId !== normalizedChatId ||
        entry.attemptId !== normalizedAttemptId,
    ),
  };
  return writeQueuedTurnOutbox(nextState, storage)
    ? { queue, migrated: pending }
    : null;
};

export const migratePendingFyiToQueue = (
  { chatId, attemptId, messageId },
  storage = null,
) => {
  const normalizedChatId = normalizedString(chatId);
  const normalizedAttemptId = normalizedString(attemptId);
  const normalizedMessageId = normalizedString(messageId);
  if (!normalizedChatId || !normalizedAttemptId || !normalizedMessageId) {
    return null;
  }
  const currentState = readOutboxState(storage);
  const pending = currentState.fyis.find(
    (entry) =>
      entry.chatId === normalizedChatId &&
      entry.attemptId === normalizedAttemptId &&
      entry.messageId === normalizedMessageId,
  );
  const existing = currentState.queues.find(
    (entry) =>
      entry.chatId === normalizedChatId &&
      entry.attemptId === normalizedAttemptId,
  );
  if (!pending) {
    return existing?.items.some((item) => item.id === normalizedMessageId)
      ? { queue: existing, migrated: [] }
      : null;
  }
  const items = normalizeQueuedTurnItems(
    [
      ...(existing?.items || []),
      {
        id: pending.messageId,
        text: pending.text,
        status: "queued",
        ...(pending.disposition ? { disposition: pending.disposition } : {}),
      },
    ],
    { rejectOverflow: true },
  );
  if (!items) return null;

  const nextQueues = currentState.queues.filter(
    (entry) =>
      entry.chatId !== normalizedChatId ||
      entry.attemptId !== normalizedAttemptId,
  );
  if (!existing && nextQueues.length >= MAX_ENTRIES) return null;
  const queue = {
    chatId: normalizedChatId,
    attemptId: normalizedAttemptId,
    items,
    updatedAt: Date.now(),
  };
  nextQueues.push(queue);
  const nextState = {
    ...currentState,
    queues: nextQueues,
    fyis: currentState.fyis.filter(
      (entry) =>
        entry.chatId !== normalizedChatId ||
        entry.attemptId !== normalizedAttemptId ||
        entry.messageId !== normalizedMessageId,
    ),
  };
  return writeQueuedTurnOutbox(nextState, storage)
    ? { queue, migrated: [pending] }
    : null;
};

export const resolvePendingFyiIntent = (
  { chatId, attemptId, messageId },
  storage = null,
) => {
  const normalizedChatId = normalizedString(chatId);
  const normalizedAttemptId = normalizedString(attemptId);
  const normalizedMessageId = normalizedString(messageId);
  if (!normalizedChatId || !normalizedAttemptId || !normalizedMessageId) {
    return null;
  }
  const currentState = readOutboxState(storage);
  const removedPending = currentState.fyis.filter(
    (entry) =>
      entry.chatId === normalizedChatId &&
      entry.attemptId === normalizedAttemptId &&
      entry.messageId === normalizedMessageId,
  );
  let removedQueuedFallback = false;
  const nextQueues = currentState.queues.flatMap((entry) => {
    if (
      entry.chatId !== normalizedChatId ||
      entry.attemptId !== normalizedAttemptId
    ) {
      return [entry];
    }
    const items = entry.items.filter((item) => {
      if (item.id !== normalizedMessageId) return true;
      removedQueuedFallback = true;
      return false;
    });
    return items.length > 0 ? [{ ...entry, items, updatedAt: Date.now() }] : [];
  });
  if (removedPending.length === 0 && !removedQueuedFallback) return null;
  const nextState = {
    ...currentState,
    queues: nextQueues,
    fyis: currentState.fyis.filter(
      (entry) =>
        entry.chatId !== normalizedChatId ||
        entry.attemptId !== normalizedAttemptId ||
        entry.messageId !== normalizedMessageId,
    ),
  };
  return writeQueuedTurnOutbox(nextState, storage)
    ? {
        removedPending,
        removedQueuedFallback,
        queue:
          nextQueues.find(
            (entry) =>
              entry.chatId === normalizedChatId &&
              entry.attemptId === normalizedAttemptId,
          ) || null,
      }
    : null;
};

export const transitionPendingClarifyToPendingFyi = (
  params = {},
  storage = null,
) => {
  const {
    chatId,
    clarifyId,
    attemptId,
    messageId,
    requestedChannel,
    threadId,
  } = params || {};
  const normalizedChatId = normalizedString(chatId);
  const normalizedClarifyId = normalizedString(clarifyId);
  const normalizedAttemptId = normalizedString(attemptId);
  const normalizedMessageId = normalizedString(messageId);
  const normalizedRequestedChannel = normalizedString(requestedChannel);
  const normalizedThreadId = normalizedString(threadId);
  if (
    !normalizedChatId ||
    !normalizedClarifyId ||
    !normalizedAttemptId ||
    !normalizedMessageId ||
    !["fyi", "btw"].includes(normalizedRequestedChannel) ||
    !normalizedThreadId
  ) {
    return null;
  }

  const currentState = readOutboxState(storage);
  const clarify = currentState.clarifies.find(
    (entry) =>
      entry.chatId === normalizedChatId &&
      entry.id === normalizedClarifyId,
  );
  if (!clarify) return null;
  const clarifyOwnerId = clarify.sourceAttemptId || clarify.clientOperationId;
  if (clarifyOwnerId !== normalizedAttemptId) return null;

  const hasIdentityConflict = currentState.fyis.some(
    (entry) =>
      entry.chatId === normalizedChatId &&
      entry.attemptId === normalizedAttemptId &&
      entry.messageId === normalizedMessageId,
  );
  if (hasIdentityConflict || currentState.fyis.length >= MAX_PENDING_FYIS) {
    return null;
  }

  const pendingFyi = {
    chatId: normalizedChatId,
    attemptId: normalizedAttemptId,
    messageId: normalizedMessageId,
    text: clarify.text,
    requestedChannel: normalizedRequestedChannel,
    threadId: normalizedThreadId,
    /* The secret-gate disposition rides along through every transition. If it
       were dropped here, an item the user explicitly approved would be purged
       as "ungated" on the next launch. */
    ...(clarify.disposition ? { disposition: clarify.disposition } : {}),
    updatedAt: Date.now(),
  };
  const nextState = {
    ...currentState,
    clarifies: currentState.clarifies.filter(
      (entry) =>
        entry.chatId !== normalizedChatId ||
        entry.id !== normalizedClarifyId,
    ),
    fyis: [...currentState.fyis, pendingFyi],
  };
  return writeQueuedTurnOutbox(nextState, storage) ? pendingFyi : null;
};

export const convertPendingFyiToClarify = (
  { chatId, attemptId, messageId, clarifyId },
  storage = null,
) => {
  const normalizedChatId = normalizedString(chatId);
  const normalizedAttemptId = normalizedString(attemptId);
  const normalizedMessageId = normalizedString(messageId);
  const normalizedClarifyId = normalizedString(clarifyId);
  if (
    !normalizedChatId ||
    !normalizedAttemptId ||
    !normalizedMessageId ||
    !normalizedClarifyId
  ) {
    return null;
  }
  const currentState = readOutboxState(storage);
  const pending = currentState.fyis.find(
    (entry) =>
      entry.chatId === normalizedChatId &&
      entry.attemptId === normalizedAttemptId &&
      entry.messageId === normalizedMessageId,
  );
  if (!pending) return null;
  if (currentState.clarifies.some((entry) => entry.chatId === normalizedChatId)) {
    return null;
  }
  if (currentState.clarifies.length >= MAX_PENDING_CLARIFIES) return null;
  const clarify = {
    chatId: normalizedChatId,
    sourceAttemptId: normalizedAttemptId,
    id: normalizedClarifyId,
    text: pending.text,
    ...(pending.disposition ? { disposition: pending.disposition } : {}),
    updatedAt: Date.now(),
  };
  const nextState = {
    ...currentState,
    clarifies: [...currentState.clarifies, clarify],
    fyis: currentState.fyis.filter(
      (entry) =>
        entry.chatId !== normalizedChatId ||
        entry.attemptId !== normalizedAttemptId ||
        entry.messageId !== normalizedMessageId,
    ),
  };
  return writeQueuedTurnOutbox(nextState, storage) ? clarify : null;
};

export const fallbackPendingClarifyToQueue = (
  { chatId, id },
  storage = null,
) => {
  const normalizedChatId = normalizedString(chatId);
  const normalizedId = normalizedString(id);
  if (!normalizedChatId || !normalizedId) return null;
  const currentState = readOutboxState(storage);
  const pending = currentState.clarifies.find(
    (entry) =>
      entry.chatId === normalizedChatId && entry.id === normalizedId,
  );
  if (!pending) return null;

  const owner = pending.sourceAttemptId
    ? { chatId: normalizedChatId, attemptId: pending.sourceAttemptId }
    : {
        chatId: normalizedChatId,
        clientOperationId: pending.clientOperationId,
      };
  const ownerKey = queueOwnerKey(owner);
  const existing = currentState.queues.find(
    (entry) => queueOwnerKey(entry) === ownerKey,
  );
  const nextItems = normalizeQueuedTurnItems(
    [
      ...(existing?.items || []),
      {
        id: pending.id,
        text: pending.text,
        status: "queued",
        ...(pending.disposition ? { disposition: pending.disposition } : {}),
      },
    ],
    { rejectOverflow: true },
  );
  if (!nextItems) return null;

  const nextQueues = currentState.queues.filter(
    (entry) => queueOwnerKey(entry) !== ownerKey,
  );
  if (!existing && nextQueues.length >= MAX_ENTRIES) return null;
  const queue = {
    ...owner,
    items: nextItems,
    updatedAt: Date.now(),
  };
  nextQueues.push(queue);
  const nextState = {
    ...currentState,
    queues: nextQueues,
    clarifies: currentState.clarifies.filter(
      (entry) =>
        entry.chatId !== normalizedChatId || entry.id !== normalizedId,
    ),
  };
  return writeQueuedTurnOutbox(nextState, storage)
    ? { queue, clarify: pending }
    : null;
};

export const removeQueuedTurnStateForChat = (chatId, storage = null) => {
  const normalizedChatId = normalizedString(chatId);
  if (!normalizedChatId) return false;
  const currentState = readOutboxState(storage);
  const nextState = {
    ...currentState,
    queues: currentState.queues.filter(
      (entry) => entry.chatId !== normalizedChatId,
    ),
    clarifies: currentState.clarifies.filter(
      (entry) => entry.chatId !== normalizedChatId,
    ),
    fyis: currentState.fyis.filter(
      (entry) => entry.chatId !== normalizedChatId,
    ),
  };
  if (
    nextState.queues.length === currentState.queues.length &&
    nextState.clarifies.length === currentState.clarifies.length &&
    nextState.fyis.length === currentState.fyis.length
  ) {
    return false;
  }
  return writeQueuedTurnOutbox(nextState, storage);
};

/**
 * purgeUngatedSecretOutboxEntries(looksLikeSecret, storage)
 *
 * Memory V2 P0 migration. Entries written BEFORE the renderer secret gate
 * existed can hold a plain-text credential in localStorage. Those entries are
 * DELETED — not quarantined, not rewritten, not moved to another key. Leaving
 * the plaintext in place under a "quarantined" flag would keep the exact
 * exposure this gate exists to remove, so removal is the whole point.
 *
 * An entry survives only if its text does not look like a credential, or if it
 * carries the plain_user_approved disposition (the user already made this
 * call explicitly for that item).
 *
 * `looksLikeSecret` is injected rather than imported so this SERVICE stays
 * free of a chat-hook dependency and the predicate is trivially stubbable.
 *
 * Returns { removedQueueItems, removedClarifies, removedFyis, chatIds } so the
 * caller can surface a STATIC notice. Nothing about the removed text — not a
 * length, not a prefix — is returned, because the caller must have nothing
 * quotable to render.
 */
export const purgeUngatedSecretOutboxEntries = (
  looksLikeSecret,
  storage = null,
) => {
  const empty = {
    removedQueueItems: 0,
    removedClarifies: 0,
    removedFyis: 0,
    chatIds: [],
  };
  if (typeof looksLikeSecret !== "function") return empty;
  const resolvedStorage = resolveStorage(storage);
  if (!resolvedStorage) return empty;

  const currentState = readOutboxState(storage);
  const affectedChatIds = new Set();
  let removedQueueItems = 0;
  let removedClarifies = 0;
  let removedFyis = 0;

  const isUngatedSecret = (entry) => {
    if (entry?.disposition === QUEUED_TURN_PLAIN_DISPOSITION) return false;
    let hit = false;
    try {
      hit = Boolean(looksLikeSecret(entry?.text));
    } catch (_error) {
      /* A throwing predicate must not silently keep plaintext around. */
      hit = true;
    }
    return hit;
  };

  const nextQueues = [];
  for (const entry of currentState.queues) {
    const keptItems = [];
    for (const item of entry.items) {
      if (isUngatedSecret(item)) {
        removedQueueItems += 1;
        affectedChatIds.add(entry.chatId);
        continue;
      }
      keptItems.push(item);
    }
    if (keptItems.length === entry.items.length) {
      nextQueues.push(entry);
    } else if (keptItems.length > 0) {
      nextQueues.push({ ...entry, items: keptItems });
    }
  }

  const nextClarifies = currentState.clarifies.filter((entry) => {
    if (!isUngatedSecret(entry)) return true;
    removedClarifies += 1;
    affectedChatIds.add(entry.chatId);
    return false;
  });

  const nextFyis = currentState.fyis.filter((entry) => {
    if (!isUngatedSecret(entry)) return true;
    removedFyis += 1;
    affectedChatIds.add(entry.chatId);
    return false;
  });

  if (removedQueueItems + removedClarifies + removedFyis === 0) return empty;

  writeQueuedTurnOutbox(
    {
      ...currentState,
      queues: nextQueues,
      clarifies: nextClarifies,
      fyis: nextFyis,
    },
    storage,
  );

  return {
    removedQueueItems,
    removedClarifies,
    removedFyis,
    chatIds: Array.from(affectedChatIds),
  };
};

export const QUEUED_TURN_OUTBOX_STORAGE_KEY = STORAGE_KEY;

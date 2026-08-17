const STORAGE_KEY = "pupu.turn_mutation_outbox.v1";
const MAX_ENTRIES = 32;

const normalizedString = (value) =>
  typeof value === "string" ? value.trim() : "";

const isPlainObject = (value) =>
  value != null && typeof value === "object" && !Array.isArray(value);

/**
 * Which memory subsystem a persisted turn mutation belongs to. CLOSED enum —
 * an entry is never "maybe V2".
 *
 * ABSENT === LEGACY, always. Entries written before Memory V2 existed have no
 * memoryMode field, and they described a V1 `replaceSessionMemory` intent; a
 * recovering hook must replay them exactly that way. Guessing V2 for them would
 * rebase a journal that was never the source of truth for that operation.
 */
export const TURN_MUTATION_MEMORY_MODES = Object.freeze({
  LEGACY: "legacy",
  V2: "v2",
});

const MEMORY_MODE_VALUES = new Set(
  Object.values(TURN_MUTATION_MEMORY_MODES),
);

/**
 * Which Context V2 rollout mode the chat was in WHEN THE USER ACTED. Frozen
 * into the row at enqueue time alongside the rebase payload, because it decides
 * whether the mutation has one leg (journal only) or two (journal + the
 * authoritative V1 replace that keeps shadow's model input equal to legacy).
 *
 * Frozen, not re-read: a session may flip shadow → active between enqueue and
 * recovery. Replaying the frozen V1 leg into an active session is harmless
 * (V1 is no longer model input there), whereas re-deciding from a fresh head
 * would make recovery non-deterministic and could skip a V1 write that the
 * pre-mutation model input still depends on.
 */
export const TURN_MUTATION_ADMISSION_MODES = Object.freeze({
  SHADOW: "shadow",
  ACTIVE: "active",
});

const ADMISSION_MODE_VALUES = new Set(
  Object.values(TURN_MUTATION_ADMISSION_MODES),
);

/**
 * Progress of the shadow-only V1 leg. "pending" is the PARTIAL state: the
 * journal rebase is already acked and durable, the V1 replace is not. A row
 * sitting in that state is what keeps the chat locked until the second leg
 * converges — it must never be inferred, only read back from storage.
 */
export const TURN_MUTATION_V1_MIRROR_STATES = Object.freeze({
  PENDING: "pending",
  APPLIED: "applied",
});

const V1_MIRROR_STATE_VALUES = new Set(
  Object.values(TURN_MUTATION_V1_MIRROR_STATES),
);

/* Durable retry state for the Context V2 turn-mutation leg. The attempt
   counter is a reservation count, not an in-memory callback count: it is
   persisted before the bridge call so a renderer remount cannot restart the
   budget or accidentally issue a third request. */
export const TURN_MUTATION_RETRY_STATUSES = Object.freeze({
  IDLE: "",
  ATTEMPTING: "attempting",
  WAITING: "waiting",
  IN_PROGRESS: "in_progress",
  QUARANTINED: "quarantined",
});

export const TURN_MUTATION_MAX_REPLAY_ATTEMPTS = 2;
export const TURN_MUTATION_RETRY_DELAY_MS = 250;

const RETRY_STATUS_VALUES = new Set(
  Object.values(TURN_MUTATION_RETRY_STATUSES),
);
const FAILURE_CODE_PATTERN = /^[a-z0-9_]{1,64}$/;

const normalizeRetryCount = (value, upperBound) => {
  if (value === null || typeof value === "undefined") return 0;
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric < 0) return upperBound;
  return Math.min(upperBound, numeric);
};

// Mirrors electron/main/services/unchain/service.js (which mirrors
// memory_v2_store._OWNER_ID_RE / _ID_RE). Validating here means a payload that
// main would reject as `context_v2_invalid_request` — a TERMINAL error that
// would silently discard the user's edit — never reaches the durable outbox in
// the first place.
const CONTEXT_V2_OWNER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const CONTEXT_V2_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,511}$/;
const CONTEXT_V2_OPERATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_PATTERN = /[\u0000-\u001f\u007f]/;
const CONTEXT_V2_REF_MAX_LENGTH = 1024;
const CONTEXT_V2_REBASE_REASONS = new Set(["resend", "edit", "delete"]);

/**
 * Normalize the FROZEN Context V2 rebase payload.
 *
 * Allowlist is exactly the seven fields the preload bridge forwards to
 * CONTEXT_V2.REBASE_SESSION: ownerChatId, sessionId, replacementHistory,
 * sourceGenerationId, expectedSessionRevision, operationId, reason. Anything
 * else on the input object is dropped, and a malformed field fails the whole
 * payload rather than being coerced — a half-valid rebase intent is not a
 * thing we are willing to persist.
 *
 * Key order is fixed so the persisted JSON round-trips byte-stably: a recovery
 * replay must send the IDENTICAL request so the sidecar's idempotency receipt
 * matches and returns the original result instead of creating a second
 * generation.
 *
 * `expectedSessionRevision: 0` is legal and load-bearing. The live sidecar
 * starts a session row at revision 1 (memory_v2_store `sessions.revision
 * INTEGER NOT NULL DEFAULT 1`) and only reports 0 when no session row exists,
 * so 0 is rare rather than the first-edit norm — but the value is persisted
 * verbatim either way, and a falsy check here would make any operation that
 * did carry 0 unrecoverable.
 */
export const normalizeContextV2RebasePayload = (value) => {
  if (!isPlainObject(value)) return null;
  const ownerChatId = normalizedString(value.ownerChatId);
  const sessionId = normalizedString(value.sessionId);
  const sourceGenerationId = normalizedString(value.sourceGenerationId);
  const operationId = normalizedString(value.operationId);
  const reason = normalizedString(value.reason).toLowerCase();
  if (!CONTEXT_V2_OWNER_ID_PATTERN.test(ownerChatId)) return null;
  if (!CONTEXT_V2_ID_PATTERN.test(sessionId)) return null;
  if (!CONTEXT_V2_ID_PATTERN.test(sourceGenerationId)) return null;
  if (!CONTEXT_V2_OPERATION_ID_PATTERN.test(operationId)) return null;
  if (!CONTEXT_V2_REBASE_REASONS.has(reason)) return null;
  const expectedSessionRevision = value.expectedSessionRevision;
  if (
    !Number.isSafeInteger(expectedSessionRevision) ||
    expectedSessionRevision < 0
  ) {
    return null;
  }
  if (!Array.isArray(value.replacementHistory)) return null;
  const replacementHistory = [];
  for (const item of value.replacementHistory) {
    if (!isPlainObject(item)) return null;
    if (item.role !== "user" && item.role !== "assistant") return null;
    if (typeof item.content !== "string") return null;
    // role/content ONLY — memory_v2_store.rebase_session rejects any other key.
    replacementHistory.push({ role: item.role, content: item.content });
  }
  return {
    ownerChatId,
    sessionId,
    replacementHistory,
    sourceGenerationId,
    expectedSessionRevision,
    operationId,
    reason,
  };
};

/**
 * Normalize the durable, NON-SECRET slice of a rebase ack.
 *
 * Only server-minted identifiers are kept: no history, no reason text, no
 * message content, no journal digest. This exists so a hook that crashes
 * between "server committed the rebase" and "local history committed" can tell
 * the difference on restart without asking the server again.
 */
export const normalizeContextV2RebaseAck = (value) => {
  if (!isPlainObject(value)) return null;
  const generationId = normalizedString(value.generationId);
  const sourceGenerationId = normalizedString(value.sourceGenerationId);
  const turnMutationEventRef = normalizedString(value.turnMutationEventRef);
  const sessionRevision = value.sessionRevision;
  if (!CONTEXT_V2_ID_PATTERN.test(generationId)) return null;
  if (!CONTEXT_V2_ID_PATTERN.test(sourceGenerationId)) return null;
  if (generationId === sourceGenerationId) return null;
  if (
    !turnMutationEventRef ||
    turnMutationEventRef.length > CONTEXT_V2_REF_MAX_LENGTH ||
    CONTROL_CHARS_PATTERN.test(turnMutationEventRef)
  ) {
    return null;
  }
  if (!Number.isSafeInteger(sessionRevision) || sessionRevision < 0) {
    return null;
  }
  return {
    generationId,
    sourceGenerationId,
    turnMutationEventRef,
    sessionRevision,
  };
};

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

  /* Unknown / absent memoryMode collapses to legacy — see the enum comment.
     A "v2" entry MUST carry a complete frozen payload that agrees with the
     entry's own identity; if it does not, the entry is rejected outright
     rather than downgraded, because running the V1 rewrite for a V2-managed
     session would desynchronize the canonical journal irreversibly. Rejecting
     drops the row on the next read, which is recoverable (the user retries);
     a wrong-subsystem rewrite is not. */
  const declaredMemoryMode = normalizedString(
    value?.memoryMode || value?.memory_mode,
  );
  const memoryMode = MEMORY_MODE_VALUES.has(declaredMemoryMode)
    ? declaredMemoryMode
    : TURN_MUTATION_MEMORY_MODES.LEGACY;
  let v2RebasePayload = null;
  let v2Ack = null;
  let admissionMode = null;
  let v1MirrorState = null;
  if (memoryMode === TURN_MUTATION_MEMORY_MODES.V2) {
    v2RebasePayload = normalizeContextV2RebasePayload(value?.v2RebasePayload);
    if (
      !v2RebasePayload ||
      v2RebasePayload.operationId !== operationId ||
      v2RebasePayload.ownerChatId !== chatId ||
      v2RebasePayload.sessionId !== sessionId ||
      v2RebasePayload.reason !== kind
    ) {
      return null;
    }
    v2Ack = normalizeContextV2RebaseAck(value?.v2Ack);
    /* An ack that does not belong to this frozen intent is dropped, not
       trusted: the operation then simply replays, and the sidecar's
       idempotency receipt makes that safe. */
    if (
      v2Ack &&
      (v2Ack.sourceGenerationId !== v2RebasePayload.sourceGenerationId ||
        v2Ack.sessionRevision <= v2RebasePayload.expectedSessionRevision)
    ) {
      v2Ack = null;
    }

    /* ── admissionMode / v1MirrorState, three rules ──────────────────────
       1. ABSENT admissionMode is a row written before the shadow dual-write
          existed. It replays REBASE-ONLY. Those rows never froze a V1
          snapshot, so inventing a V1 write for them would push a history
          nobody validated into short-term memory. Backward compatibility
          here is a safety property, not a courtesy.
       2. A SHADOW row without a valid v1MirrorState is rejected outright.
          The state is the only record of whether the second leg already ran;
          defaulting it to "pending" could re-run an applied replace, and
          defaulting it to "applied" would silently drop the leg entirely.
          Reject costs one retryable user intent — the alternatives corrupt.
       3. An ACTIVE row carrying V1 mirror fields has them STRIPPED, not
          rejected. Active is rebase-only by definition, so dropping the
          field yields exactly the correct behaviour; the field is extraneous
          rather than half-valid, and the payload allowlist above already
          drops extraneous keys the same way. A DECLARED-BUT-UNKNOWN
          admissionMode is different — that is corruption, and is rejected. */
    const declaredAdmissionMode = normalizedString(
      value?.admissionMode || value?.admission_mode,
    );
    if (declaredAdmissionMode) {
      if (!ADMISSION_MODE_VALUES.has(declaredAdmissionMode)) return null;
      admissionMode = declaredAdmissionMode;
      if (admissionMode === TURN_MUTATION_ADMISSION_MODES.SHADOW) {
        const declaredMirrorState = normalizedString(
          value?.v1MirrorState || value?.v1_mirror_state,
        );
        if (!V1_MIRROR_STATE_VALUES.has(declaredMirrorState)) return null;
        v1MirrorState = declaredMirrorState;
      }
    }
  }

  const retryStatusCandidate = normalizedString(value?.retryStatus);
  const retryStatus = RETRY_STATUS_VALUES.has(retryStatusCandidate)
    ? retryStatusCandidate
    : TURN_MUTATION_RETRY_STATUSES.IDLE;
  const lastFailureCodeCandidate = normalizedString(value?.lastFailureCode);
  const lastFailureCode = FAILURE_CODE_PATTERN.test(lastFailureCodeCandidate)
    ? lastFailureCodeCandidate
    : "";
  const retryAtCandidate = Number(value?.retryAt);

  return {
    operationId,
    chatId,
    sessionId,
    kind,
    memoryMode,
    v2RebasePayload,
    v2Ack,
    admissionMode,
    v1MirrorState,
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
    replayAttempts: normalizeRetryCount(
      value?.replayAttempts,
      TURN_MUTATION_MAX_REPLAY_ATTEMPTS,
    ),
    recoveryRequiredAttempts: normalizeRetryCount(
      value?.recoveryRequiredAttempts,
      TURN_MUTATION_MAX_REPLAY_ATTEMPTS,
    ),
    retryStatus,
    lastFailureCode,
    retryAt:
      Number.isFinite(retryAtCandidate) && retryAtCandidate >= 0
        ? retryAtCandidate
        : 0,
    createdAt:
      Number.isFinite(Number(value?.createdAt)) && Number(value.createdAt) >= 0
        ? Number(value.createdAt)
        : Date.now(),
  };
};

export const readTurnMutationOutboxState = (storage = null) => {
  let resolvedStorage = null;
  try {
    resolvedStorage = resolveStorage(storage);
  } catch (_error) {
    return { available: false, entries: [] };
  }
  if (!resolvedStorage) {
    return {
      available: typeof window === "undefined",
      entries: [],
    };
  }
  try {
    const parsed = JSON.parse(resolvedStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return { available: false, entries: [] };
    const deduplicated = new Map();
    for (const item of parsed) {
      const normalized = normalizeTurnMutationOutboxEntry(item);
      if (!normalized) return { available: false, entries: [] };
      deduplicated.set(normalized.operationId, normalized);
    }
    return {
      available: true,
      entries: Array.from(deduplicated.values()).slice(-MAX_ENTRIES),
    };
  } catch (_error) {
    return { available: false, entries: [] };
  }
};

export const readTurnMutationOutbox = (storage = null) =>
  readTurnMutationOutboxState(storage).entries;

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

const updateTurnMutationOutboxEntry = (
  operationId,
  updater,
  storage = null,
) => {
  const normalizedOperationId = normalizedString(operationId);
  if (!normalizedOperationId || typeof updater !== "function") return null;
  const snapshot = readTurnMutationOutboxState(storage);
  if (!snapshot.available) return null;
  const index = snapshot.entries.findIndex(
    (entry) => entry.operationId === normalizedOperationId,
  );
  if (index < 0) return null;
  const current = snapshot.entries[index];
  const updated = normalizeTurnMutationOutboxEntry(updater(current));
  if (!updated || updated.operationId !== current.operationId) return null;
  const nextEntries = snapshot.entries.slice();
  nextEntries[index] = updated;
  return writeTurnMutationOutbox(nextEntries, storage) ? updated : null;
};

/**
 * Reserve one Context V2 memory attempt before any bridge call is made.
 * Returning null means the row is absent, quarantined, still waiting, or its
 * two-call budget is already exhausted. No path here creates or resurrects a
 * row.
 */
export const reserveTurnMutationRetryAttempt = (
  operationId,
  { now = Date.now() } = {},
  storage = null,
) => {
  const normalizedNow = Number.isFinite(Number(now))
    ? Math.max(0, Number(now))
    : Date.now();
  return updateTurnMutationOutboxEntry(
    operationId,
    (entry) => {
      if (
        entry.retryStatus === TURN_MUTATION_RETRY_STATUSES.QUARANTINED ||
        (entry.retryStatus === TURN_MUTATION_RETRY_STATUSES.WAITING &&
          entry.retryAt > normalizedNow) ||
        entry.replayAttempts >= TURN_MUTATION_MAX_REPLAY_ATTEMPTS
      ) {
        return null;
      }
      return {
        ...entry,
        replayAttempts: entry.replayAttempts + 1,
        retryStatus: TURN_MUTATION_RETRY_STATUSES.ATTEMPTING,
        /* A reservation is not permission to schedule a retry. Only the
           successfully persisted WAITING outcome below may publish retryAt;
           otherwise an outcome write failure could turn this ATTEMPTING row
           into an unrecorded second bridge call. */
        retryAt: 0,
      };
    },
    storage,
  );
};

/** Persist the closed retry decision produced by the pure classifier. */
export const recordTurnMutationRetryOutcome = (
  operationId,
  { action = "", code = "", retryAt = 0 } = {},
  storage = null,
) => {
  const normalizedCode = normalizedString(code);
  const safeCode = FAILURE_CODE_PATTERN.test(normalizedCode)
    ? normalizedCode
    : "";
  const normalizedRetryAt = Number.isFinite(Number(retryAt))
    ? Math.max(0, Number(retryAt))
    : 0;
  return updateTurnMutationOutboxEntry(
    operationId,
    (entry) => {
      if (action === "retry") {
        return {
          ...entry,
          recoveryRequiredAttempts:
            safeCode === "context_v2_rebase_recovery_required"
              ? Math.min(
                  TURN_MUTATION_MAX_REPLAY_ATTEMPTS,
                  entry.recoveryRequiredAttempts + 1,
                )
              : entry.recoveryRequiredAttempts,
          retryStatus: TURN_MUTATION_RETRY_STATUSES.WAITING,
          lastFailureCode: safeCode,
          retryAt: normalizedRetryAt,
        };
      }
      if (action === "in_progress") {
        return {
          ...entry,
          replayAttempts: Math.max(0, entry.replayAttempts - 1),
          retryStatus: TURN_MUTATION_RETRY_STATUSES.IN_PROGRESS,
          lastFailureCode: safeCode,
          retryAt: 0,
        };
      }
      if (action === "quarantine") {
        return {
          ...entry,
          recoveryRequiredAttempts:
            safeCode === "context_v2_rebase_recovery_required"
              ? Math.min(
                  TURN_MUTATION_MAX_REPLAY_ATTEMPTS,
                  entry.recoveryRequiredAttempts + 1,
                )
              : entry.recoveryRequiredAttempts,
          retryStatus: TURN_MUTATION_RETRY_STATUSES.QUARANTINED,
          lastFailureCode: safeCode,
          retryAt: 0,
        };
      }
      return null;
    },
    storage,
  );
};

/** The only operation that grants a quarantined row a fresh two-call budget. */
export const clearTurnMutationRetryState = (
  operationId,
  storage = null,
) =>
  updateTurnMutationOutboxEntry(
    operationId,
    (entry) => ({
      ...entry,
      replayAttempts: 0,
      recoveryRequiredAttempts: 0,
      retryStatus: TURN_MUTATION_RETRY_STATUSES.IDLE,
      lastFailureCode: "",
      retryAt: 0,
    }),
    storage,
  );

export const enqueueTurnMutation = (entry, storage = null) => {
  const normalized = normalizeTurnMutationOutboxEntry(entry);
  if (!normalized) return null;
  const snapshot = readTurnMutationOutboxState(storage);
  if (!snapshot.available) return null;
  const currentEntries = snapshot.entries;
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

/**
 * Record the server's rebase ack against ONE existing operation.
 *
 * Compare-and-set semantics, deliberately narrow:
 *   * the operation must already exist in the outbox — this never re-creates a
 *     row, so an ack that arrives after the operation was completed or
 *     discarded is a no-op instead of a resurrection;
 *   * the entry must be memoryMode "v2" with a frozen payload;
 *   * the ack must belong to that exact frozen intent (same source generation,
 *     revision strictly advanced past the frozen expected revision);
 *   * a second, DIFFERENT ack for the same operation is refused rather than
 *     overwritten — two generations for one operation means something upstream
 *     is wrong and the durable record must not be quietly rewritten;
 *   * no other entry in the outbox is touched, and the session head is NEVER
 *     re-read here. The ack is the only new information.
 *
 * @returns the updated entry, or null when the CAS did not apply.
 */
export const recordTurnMutationRebaseAck = (
  operationId,
  ack,
  storage = null,
) => {
  const normalizedOperationId = normalizedString(operationId);
  if (!normalizedOperationId) return null;
  const normalizedAck = normalizeContextV2RebaseAck(ack);
  if (!normalizedAck) return null;
  const snapshot = readTurnMutationOutboxState(storage);
  if (!snapshot.available) return null;
  const entries = snapshot.entries;
  const index = entries.findIndex(
    (entry) => entry.operationId === normalizedOperationId,
  );
  if (index < 0) return null;
  const target = entries[index];
  if (
    target.memoryMode !== TURN_MUTATION_MEMORY_MODES.V2 ||
    !target.v2RebasePayload
  ) {
    return null;
  }
  if (
    normalizedAck.sourceGenerationId !==
      target.v2RebasePayload.sourceGenerationId ||
    normalizedAck.sessionRevision <=
      target.v2RebasePayload.expectedSessionRevision
  ) {
    return null;
  }
  if (
    target.v2Ack &&
    target.v2Ack.generationId !== normalizedAck.generationId
  ) {
    return null;
  }
  const nextEntries = entries.slice();
  nextEntries[index] = { ...target, v2Ack: normalizedAck };
  return writeTurnMutationOutbox(nextEntries, storage)
    ? nextEntries[index]
    : null;
};

/**
 * Mark the shadow V1 mirror leg as applied for ONE existing operation.
 *
 * Same compare-and-set discipline as recordTurnMutationRebaseAck, with one
 * extra precondition that encodes the leg ORDER: the row must already carry a
 * v2Ack. The journal is the system of record, so "V1 written but the journal
 * was not" is a state this outbox refuses to be able to represent — if it
 * could, a later reader would have no way to tell it apart from a completed
 * mutation.
 *
 *   * the operation must already exist (never resurrects a completed or
 *     discarded row);
 *   * it must be memoryMode "v2" with a frozen payload;
 *   * it must be admissionMode "shadow" — an active row has no V1 leg, and
 *     accepting one here would paper over a caller that wrote V1 on the live
 *     path;
 *   * it must already hold a verified v2Ack;
 *   * re-applying is a no-op success, so a duplicated (idempotent) V1 replay
 *     converges instead of failing.
 *
 * @returns the updated entry, or null when the CAS did not apply.
 */
export const recordTurnMutationV1MirrorApplied = (
  operationId,
  storage = null,
) => {
  const normalizedOperationId = normalizedString(operationId);
  if (!normalizedOperationId) return null;
  const snapshot = readTurnMutationOutboxState(storage);
  if (!snapshot.available) return null;
  const entries = snapshot.entries;
  const index = entries.findIndex(
    (entry) => entry.operationId === normalizedOperationId,
  );
  if (index < 0) return null;
  const target = entries[index];
  if (
    target.memoryMode !== TURN_MUTATION_MEMORY_MODES.V2 ||
    !target.v2RebasePayload ||
    target.admissionMode !== TURN_MUTATION_ADMISSION_MODES.SHADOW ||
    !target.v2Ack
  ) {
    return null;
  }
  if (target.v1MirrorState === TURN_MUTATION_V1_MIRROR_STATES.APPLIED) {
    return target;
  }
  const nextEntries = entries.slice();
  nextEntries[index] = {
    ...target,
    v1MirrorState: TURN_MUTATION_V1_MIRROR_STATES.APPLIED,
  };
  return writeTurnMutationOutbox(nextEntries, storage)
    ? nextEntries[index]
    : null;
};

export const removeTurnMutation = (operationId, storage = null) => {
  const normalizedOperationId = normalizedString(operationId);
  const snapshot = readTurnMutationOutboxState(storage);
  if (!snapshot.available) return false;
  const entries = snapshot.entries;
  const nextEntries = entries.filter(
    (entry) => entry.operationId !== normalizedOperationId,
  );
  if (nextEntries.length === entries.length) return false;
  return writeTurnMutationOutbox(nextEntries, storage);
};

export const TURN_MUTATION_OUTBOX_STORAGE_KEY = STORAGE_KEY;

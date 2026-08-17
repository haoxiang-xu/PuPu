/**
 * context_v2_turn_mutation — Memory V2 P0 turn-mutation seam (PURE helpers).
 *
 * A turn mutation (resend / edit / delete) rewrites the *visible* history of a
 * chat. Before Memory V2 that meant one V1 call: `replaceSessionMemory`. Under
 * Memory V2 the canonical history lives in the Context V2 journal, and the only
 * legal way to rewrite it is an immutable rebase:
 *
 *     contextV2Bridge.getSessionHead()  →  contextV2Bridge.rebaseSession()
 *
 * Everything in this module is a pure function so the admission rules, the
 * frozen payload projection and the ack contract can be tested without a React
 * tree, a bridge or a clock. The hook owns the I/O; this file owns the rules.
 *
 * ── Why fail-closed, never "fall back to V1" ──────────────────────────────
 * Once a chat is admitted to V2 (sticky admission row and/or a bootstrapped
 * journal), the journal is the record of truth. Silently rewriting V1 short-term
 * memory instead would leave the journal describing a conversation that no
 * longer exists — a divergence that no later phase can repair, because the
 * pre-mutation generation is already sealed. So the ONLY two paths that may run
 * the legacy V1 rewrite are:
 *   1. the enable_memory_v2 feature flag is OFF, or
 *   2. the session head says, unambiguously, that this chat has no V2 state at
 *      all (HTTP 404 `context_v2_not_found`, or an all-empty admission).
 * Every other shape — bootstrap pending/failed, bridge unavailable, read-only
 * degraded, a head we cannot fully parse — BLOCKS the mutation with a static
 * error and leaves local history untouched.
 *
 * ── The mutationReady / shadow reconciliation (READ BEFORE RETUNING) ──────
 * The sidecar's `mutation_ready` (memory_v2_store.session_head) is defined as
 *     session_exists AND target_mode=='active' AND effective_mode=='active'
 *     AND bootstrap_status=='complete' AND v2_bootstrapped
 * so it is STRUCTURALLY FALSE for every shadow-mode chat. `rebase_session`
 * itself has no such requirement — it only needs a live session row, a matching
 * revision and a matching current generation.
 *
 * A shadow chat still journals every turn, so its canonical journal MUST be
 * rebased when the user edits/resends/deletes; requiring `mutation_ready` there
 * would either block every mutation in shadow rollout (the default) or push us
 * back to V1 and desynchronize the journal. Therefore admission requires:
 *   * always: bootstrapped + complete + session exists + generation + revision,
 *   * additionally, when admissionMode === "active": the sidecar's own
 *     `mutationReady` must agree (belt and braces on the live path).
 * Do not "simplify" this to a bare `mutationReady` check without re-reading
 * memory_v2_store.session_head first.
 *
 * ── shadow writes BOTH legs; active writes ONLY the journal ───────────────
 * The signed definition of shadow is "record, but never change model input —
 * the model still reads V1". Under shadow the sidecar assembles the model's
 * context from renderer history + the V1 short-term session memory, so a
 * mutation that rebased ONLY the journal would leave the deleted/edited turn
 * alive in V1 and the model would keep seeing it. That is shadow changing
 * model input relative to legacy — precisely what shadow must not do, and it
 * would also poison the very A/B baseline shadow exists to produce.
 *
 * So a shadow mutation is a two-leg write, in this order and no other:
 *
 *   [1] V2 canonical rebase → verify ack → record ack   (journal first)
 *   [2] V1 authoritative replace → record v1MirrorState=applied
 *   [3] local commit / outbound run
 *
 * V2 leads because the journal is the system of record and its rebase has the
 * CAS / open-attempt fence / idempotency receipt guardrails. If V1 went first
 * and the rebase then hit a terminal conflict, the outbox row would be dropped
 * with V1 already mutated — an unrecoverable backwards drift.
 *
 * The two systems cannot be written atomically, so [1]-ok/[2]-failed is a real
 * state: the row stays PARTIAL (v2Ack recorded, v1MirrorState "pending"), and
 * NOTHING is committed locally and no request is sent — running a turn against
 * a dirty V1 memory is the exact drift being eliminated. The retained row keeps
 * `isTurnMutationBlocked` true for that chat, and recovery skips the rebase (it
 * already has the ack) and retries only the frozen V1 leg.
 *
 * `active` never touches V1 at all: there the journal IS the model input.
 */

const isPlainObject = (value) =>
  value != null && typeof value === "object" && !Array.isArray(value);

const readString = (value) => (typeof value === "string" ? value.trim() : "");

export const TURN_MUTATION_MEMORY_MODE = Object.freeze({
  LEGACY: "legacy",
  V2: "v2",
});

export const TURN_MUTATION_ADMISSION = Object.freeze({
  LEGACY: "legacy",
  V2: "v2",
  BLOCKED: "blocked",
});

/* Every user-visible string here is a fixed literal. A turn-mutation failure
   must never surface a server message, an error path, a payload excerpt or any
   conversation content — the sidecar's errors can carry request detail and the
   renderer is the last place that can stop it. */
export const CONTEXT_V2_TURN_MUTATION_MESSAGES = Object.freeze({
  UNAVAILABLE:
    "Memory is unavailable in this runtime, so this message change was not applied.",
  NOT_READY:
    "This chat's memory is still being prepared, so this message change was not applied. Please try again shortly.",
  IN_PROGRESS:
    "This chat is still finishing its previous run. This message change will be applied automatically.",
  FAILED: "This message change could not be applied. Please try again.",
  CONFLICT:
    "The conversation changed before this message change could be applied. Please try it again.",
  CONFLICT_MANUAL:
    "This message change conflicted with newer conversation state and needs manual review before it can be discarded.",
  QUARANTINED:
    "This message change is paused because memory could not be updated safely. Retry it, or discard it to restore your text.",
  PERSIST: "Unable to safely persist this message change. Please try again.",
});

const ADMISSION_MODES = new Set(["shadow", "active"]);

/**
 * Project renderer messages down to the EXACT shape the rebase allowlist
 * accepts.
 *
 * The allowlist is enforced three times, and this projection must satisfy all
 * three:
 *   * electron/main/services/unchain/service.js#requireContextV2ReplacementHistory
 *     rebuilds each message as `{role, content}` and rejects a null content;
 *   * the preload bridge forwards only the named rebase fields;
 *   * memory_v2_store.rebase_session rejects ANY key other than role/content
 *     ("replacement_history messages may contain only role and content"), plus
 *     any host path metadata or file:// URL.
 *
 * Consequences, all deliberate:
 *   * attachments are NOT carried (a single extra key fails the whole rebase),
 *     so an attachment-only message projects to empty content and is dropped —
 *     an empty user turn in the canonical journal would be worse;
 *   * ids, timestamps, meta, traceFrames, subagentFrames, interjections and
 *     composer state never leave the renderer;
 *   * the in-flight assistant placeholder (status === "streaming") is excluded.
 *
 * This is intentionally a SEPARATE helper from buildContextV2History: that one
 * feeds the sidecar's lazy bootstrap (which does accept attachments) and must
 * not be re-shaped to satisfy the stricter rebase contract.
 */
export const buildRebaseReplacementHistory = (messages) =>
  (Array.isArray(messages) ? messages : [])
    .filter(
      (message) =>
        isPlainObject(message) &&
        (message.role === "user" || message.role === "assistant") &&
        message.status !== "streaming",
    )
    .map((message) => ({
      role: message.role,
      content: typeof message.content === "string" ? message.content : "",
    }))
    .filter((entry) => entry.content.trim().length > 0);

/**
 * Decide which memory path a turn mutation must take.
 *
 * @param flagEnabled    enable_memory_v2
 * @param bridgeAvailable contextV2Bridge.isAvailable()
 * @param head           the getSessionHead result (main-normalized), or null
 * @param headErrorCode  the parsed error code when getSessionHead rejected
 * @param ownerChatId    the UI chat id the head was requested for
 * @param sessionId      the session id the head was requested for
 * @returns {{mode: string, reason: string, admissionMode?: string,
 *            sourceGenerationId?: string, expectedSessionRevision?: number}}
 *
 * On a V2 admission the head's own `admissionMode` is surfaced verbatim
 * ("shadow" | "active"). It is frozen into the outbox row at enqueue time and
 * decides whether the second, V1 leg of the write exists at all — so it must
 * come from this single head read and never be re-derived later.
 */
export const decideTurnMutationMemoryMode = ({
  flagEnabled = false,
  bridgeAvailable = false,
  head = null,
  headErrorCode = "",
  ownerChatId = "",
  sessionId = "",
} = {}) => {
  const blocked = (reason) => ({
    mode: TURN_MUTATION_ADMISSION.BLOCKED,
    reason,
  });
  const legacy = (reason) => ({ mode: TURN_MUTATION_ADMISSION.LEGACY, reason });

  if (flagEnabled !== true) return legacy("flag_off");
  if (bridgeAvailable !== true) return blocked("bridge_unavailable");

  const errorCode = readString(headErrorCode);
  if (errorCode) {
    /* 404 is the head contract's unambiguous "this chat has neither an
       admission row nor a session row" — the one server-confirmed Legacy
       signal. Anything else (unreachable, auth, invalid, unknown) is ambiguous
       and must not be read as "no V2 here". */
    return errorCode === "context_v2_not_found"
      ? legacy("session_absent")
      : blocked("head_failed");
  }

  if (!isPlainObject(head)) return blocked("head_missing");
  if (
    readString(head.ownerChatId) !== readString(ownerChatId) ||
    readString(head.sessionId) !== readString(sessionId)
  ) {
    return blocked("head_identity_mismatch");
  }
  /* Not part of today's head shape; checked defensively so that if the sidecar
     ever surfaces degradation on the head, it blocks instead of silently
     rebasing against a read-only journal. A genuinely read-only runtime also
     fails the rebase call itself, which is handled as retryable. */
  if (head.readOnlyDegraded === true) return blocked("read_only_degraded");

  const sticky = head.sticky === true;
  const bootstrapped = head.v2Bootstrapped === true;
  const sessionExists = head.sessionExists === true;
  const bootstrapStatus = readString(head.bootstrapStatus);
  const admissionMode = readString(head.admissionMode);
  const targetMode = readString(head.targetMode);
  const currentGenerationId = readString(head.currentGenerationId);

  if (!sticky && !bootstrapped && !sessionExists) {
    const unambiguouslyAbsent =
      bootstrapStatus === "" &&
      admissionMode === "" &&
      targetMode === "" &&
      currentGenerationId === "" &&
      readString(head.bootstrapErrorCode) === "" &&
      head.mutationReady !== true;
    return unambiguouslyAbsent
      ? legacy("session_absent")
      : blocked("ambiguous_admission");
  }

  if (bootstrapStatus === "pending") return blocked("bootstrap_pending");
  if (bootstrapStatus === "failed") return blocked("bootstrap_failed");
  if (bootstrapStatus !== "complete") return blocked("bootstrap_unknown");
  if (!bootstrapped) return blocked("not_bootstrapped");
  if (!sessionExists) return blocked("session_missing");
  if (!ADMISSION_MODES.has(admissionMode)) return blocked("admission_unknown");
  if (!ADMISSION_MODES.has(targetMode)) return blocked("target_mode_unknown");
  /* See the header note: mutation_ready is structurally false in shadow. */
  if (admissionMode === "active" && head.mutationReady !== true) {
    return blocked("mutation_not_ready");
  }
  if (!currentGenerationId) return blocked("generation_missing");
  if (
    !Number.isSafeInteger(head.sessionRevision) ||
    head.sessionRevision < 0
  ) {
    return blocked("revision_invalid");
  }

  return {
    mode: TURN_MUTATION_ADMISSION.V2,
    reason: admissionMode === "active" ? "active" : "shadow",
    /* Explicit, not re-derived from `reason`: the V1 mirror leg keys off this
       and a caller must never have to parse a human-facing reason string. */
    admissionMode: admissionMode === "active" ? "active" : "shadow",
    sourceGenerationId: currentGenerationId,
    /* Sent VERBATIM — never defaulted, never coerced. On the live sidecar a
       freshly created session row starts at revision 1 (memory_v2_store
       `sessions.revision INTEGER NOT NULL DEFAULT 1`), and session_head only
       reports 0 when there is no session row at all — a shape that cannot
       reach a V2 admission. 0 is nonetheless accepted and load-bearing here:
       any falsy check on this value would break the first edit of a session
       that ever does report it. */
    expectedSessionRevision: head.sessionRevision,
  };
};

/**
 * Build the FROZEN rebase payload. Constructed exactly once, at enqueue time,
 * from a single session head read — never rebuilt from live messages during
 * recovery, because "the conversation as it was when the user acted" is the
 * only history the frozen expectedSessionRevision / sourceGenerationId pair is
 * valid for.
 *
 * Returns null when any field is missing so the caller fails closed.
 */
export const buildContextV2RebasePayload = ({
  ownerChatId = "",
  sessionId = "",
  replacementHistory = null,
  sourceGenerationId = "",
  expectedSessionRevision = null,
  operationId = "",
  reason = "",
} = {}) => {
  const owner = readString(ownerChatId);
  const session = readString(sessionId);
  const generation = readString(sourceGenerationId);
  const operation = readString(operationId);
  const normalizedReason = readString(reason).toLowerCase();
  if (!owner || !session || !generation || !operation) return null;
  if (!["resend", "edit", "delete"].includes(normalizedReason)) return null;
  if (
    !Number.isSafeInteger(expectedSessionRevision) ||
    expectedSessionRevision < 0
  ) {
    return null;
  }
  if (!Array.isArray(replacementHistory)) return null;
  const history = [];
  for (const item of replacementHistory) {
    if (!isPlainObject(item)) return null;
    if (item.role !== "user" && item.role !== "assistant") return null;
    if (typeof item.content !== "string") return null;
    history.push({ role: item.role, content: item.content });
  }
  // Fixed key order → the persisted JSON round-trips byte-stably, so a replay
  // sends the identical request and hits the sidecar's idempotency receipt.
  return {
    ownerChatId: owner,
    sessionId: session,
    replacementHistory: history,
    sourceGenerationId: generation,
    expectedSessionRevision,
    operationId: operation,
    reason: normalizedReason,
  };
};

/**
 * A rebase is only "done" when the SERVER says so. This verifies the ack is the
 * receipt for OUR exact frozen intent — never a local fingerprint guess.
 *
 * Requires all four durable identity fields to line up:
 *   generationId (new, non-empty, different from the source),
 *   turnMutationEventRef (the journal audit event this mutation produced),
 *   sessionRevision (must have strictly advanced past the expected revision),
 *   sourceGenerationId (echoes the generation we rebased from).
 * A replayed receipt satisfies all of them, which is what makes retrying a
 * frozen payload safe.
 */
export const verifyContextV2RebaseAck = (ack, payload) => {
  if (!isPlainObject(ack) || !isPlainObject(payload)) return false;
  if (readString(ack.ownerChatId) !== payload.ownerChatId) return false;
  if (readString(ack.sessionId) !== payload.sessionId) return false;
  if (readString(ack.sourceGenerationId) !== payload.sourceGenerationId) {
    return false;
  }
  if (readString(ack.reason) !== payload.reason) return false;
  const generationId = readString(ack.generationId);
  if (!generationId) return false;
  if (generationId === payload.sourceGenerationId) return false;
  if (!readString(ack.turnMutationEventRef)) return false;
  if (!Number.isSafeInteger(ack.sessionRevision)) return false;
  if (ack.sessionRevision <= payload.expectedSessionRevision) return false;
  return true;
};

/** The non-secret slice of an ack that is safe to persist in the outbox. */
export const projectContextV2RebaseAck = (ack) => {
  if (!isPlainObject(ack)) return null;
  return {
    generationId: readString(ack.generationId),
    turnMutationEventRef: readString(ack.turnMutationEventRef),
    sourceGenerationId: readString(ack.sourceGenerationId),
    sessionRevision: Number.isSafeInteger(ack.sessionRevision)
      ? ack.sessionRevision
      : -1,
  };
};

/* Terminal = the frozen payload can NEVER succeed, so retrying it forever is
   pointless. Revision/generation conflicts are flagged `retryable` by the
   sidecar because a *recomputed* request could succeed — but ours is frozen, so
   from the renderer's side they are terminal. */
const TERMINAL_REBASE_ERROR_CODES = new Set([
  "context_v2_revision_conflict",
  "context_v2_generation_conflict",
  "context_v2_operation_conflict",
  "context_v2_attempt_generation_conflict",
  "context_v2_not_found",
  "context_v2_invalid_history",
  "context_v2_invalid_request",
  "context_v2_history_too_large",
  "context_v2_event_too_large",
  "context_v2_rebase_journal_incompatible",
]);

export const CONTEXT_V2_REBASE_IN_PROGRESS_CODE = "context_v2_rebase_in_progress";
export const CONTEXT_V2_REBASE_RECOVERY_REQUIRED_CODE =
  "context_v2_rebase_recovery_required";
export const CONTEXT_V2_REBASE_JOURNAL_INCOMPATIBLE_CODE =
  "context_v2_rebase_journal_incompatible";

export const TURN_MUTATION_RETRY_ACTIONS = Object.freeze({
  RETRY: "retry",
  IN_PROGRESS: "in_progress",
  QUARANTINE: "quarantine",
});

/**
 * Closed failure decision for one already-reserved bridge call.
 *
 * Every deterministic terminal result is quarantined rather than deleted so
 * the user's frozen intent remains recoverable. All other failures receive at
 * most one 250 ms retry; the second reserved call quarantines and schedules no
 * third call. `in_progress` is deliberately outside that budget because it is
 * a live-execution guard, not evidence that the journal is incompatible.
 */
export const resolveContextV2TurnMutationFailure = ({
  errorCode = "",
  replayAttempts = 0,
} = {}) => {
  const code = readString(errorCode);
  const attempts = Number.isSafeInteger(replayAttempts)
    ? Math.max(0, replayAttempts)
    : 0;
  if (code === CONTEXT_V2_REBASE_IN_PROGRESS_CODE) {
    return {
      action: TURN_MUTATION_RETRY_ACTIONS.IN_PROGRESS,
      delayMs: 0,
    };
  }
  if (
    TERMINAL_REBASE_ERROR_CODES.has(code) ||
    attempts >= 2
  ) {
    return {
      action: TURN_MUTATION_RETRY_ACTIONS.QUARANTINE,
      delayMs: 0,
    };
  }
  return {
    action: TURN_MUTATION_RETRY_ACTIONS.RETRY,
    delayMs: 250,
  };
};

/**
 * Unknown codes classify as RETRYABLE on purpose: keeping a durable intent that
 * turns out to be dead costs one stale outbox row, while dropping one that was
 * merely transient loses the user's edit.
 */
export const isTerminalContextV2RebaseError = (errorCode) =>
  TERMINAL_REBASE_ERROR_CODES.has(readString(errorCode));

const RUNTIME_UNAVAILABLE_CODES = new Set([
  "bridge_unavailable",
  "context_v2_unavailable",
  "context_v2_unreachable",
  "context_v2_missing_auth_token",
  "context_v2_rebase_unavailable",
]);

const NOT_READY_CODES = new Set([
  "admission_unknown",
  "ambiguous_admission",
  "bootstrap_failed",
  "bootstrap_pending",
  "bootstrap_unknown",
  "generation_missing",
  "head_failed",
  "head_identity_mismatch",
  "head_missing",
  "mutation_not_ready",
  "not_bootstrapped",
  "read_only_degraded",
  "revision_invalid",
  "session_missing",
  "target_mode_unknown",
]);

/**
 * Map an admission reason or a rebase error code to a STATIC user-facing
 * string. Callers must render only what this returns — never `error.message`,
 * which for a Context V2 rejection is built by the sidecar and can carry
 * request detail.
 */
export const contextV2TurnMutationMessage = (reasonOrCode) => {
  const code = readString(reasonOrCode);
  if (RUNTIME_UNAVAILABLE_CODES.has(code)) {
    return CONTEXT_V2_TURN_MUTATION_MESSAGES.UNAVAILABLE;
  }
  if (NOT_READY_CODES.has(code)) {
    return CONTEXT_V2_TURN_MUTATION_MESSAGES.NOT_READY;
  }
  if (code === CONTEXT_V2_REBASE_IN_PROGRESS_CODE) {
    return CONTEXT_V2_TURN_MUTATION_MESSAGES.IN_PROGRESS;
  }
  if (code === CONTEXT_V2_REBASE_RECOVERY_REQUIRED_CODE) {
    return CONTEXT_V2_TURN_MUTATION_MESSAGES.FAILED;
  }
  if (code === CONTEXT_V2_REBASE_JOURNAL_INCOMPATIBLE_CODE) {
    return CONTEXT_V2_TURN_MUTATION_MESSAGES.QUARANTINED;
  }
  if (TERMINAL_REBASE_ERROR_CODES.has(code)) {
    return CONTEXT_V2_TURN_MUTATION_MESSAGES.CONFLICT;
  }
  return CONTEXT_V2_TURN_MUTATION_MESSAGES.FAILED;
};

/* ── V1 mirror leg (shadow only) ──────────────────────────────────────────
   The second leg of a shadow mutation runs through the LEGACY V1 replace, so
   its failures arrive with V1/bridge error codes, not context_v2_* ones. They
   get their own mapping rather than being funnelled through
   contextV2TurnMutationMessage: that map would classify an unrelated V1 code
   as a rebase CONFLICT and tell the user the conversation moved when it did
   not. Everything unrecognised falls to FAILED — and, as everywhere on this
   seam, the sidecar's own message is never surfaced. */
const V1_MIRROR_UNAVAILABLE_CODES = new Set([
  "bridge_unavailable",
  "memory_unavailable",
  "runtime_unavailable",
  "unchain_unavailable",
  "unchain_unreachable",
]);

/** Generic code for a V1 mirror failure that reported no usable code. */
export const CONTEXT_V2_V1_MIRROR_ERROR_CODE = "context_v2_v1_mirror_failed";

export const contextV2V1MirrorMessage = (errorCode) =>
  V1_MIRROR_UNAVAILABLE_CODES.has(readString(errorCode))
    ? CONTEXT_V2_TURN_MUTATION_MESSAGES.UNAVAILABLE
    : CONTEXT_V2_TURN_MUTATION_MESSAGES.FAILED;

const contextV2TurnMutation = {
  buildContextV2RebasePayload,
  buildRebaseReplacementHistory,
  contextV2TurnMutationMessage,
  contextV2V1MirrorMessage,
  decideTurnMutationMemoryMode,
  isTerminalContextV2RebaseError,
  projectContextV2RebaseAck,
  resolveContextV2TurnMutationFailure,
  verifyContextV2RebaseAck,
};

export default contextV2TurnMutation;

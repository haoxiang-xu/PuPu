/**
 * Memory V2 P0 turn-mutation rules (PURE).
 *
 * These lock the three decisions that a later phase is most likely to "clean
 * up" and thereby break:
 *   1. the ONLY two Legacy outcomes are flag-off and a server-confirmed absent
 *      session — every other head shape blocks and never falls back to V1;
 *   2. the replacement-history projection matches the rebase allowlist EXACTLY
 *      (role + content, nothing else), which is enforced independently in
 *      electron main and in memory_v2_store.rebase_session;
 *   3. an ack is a server receipt, not a local guess.
 */
import {
  CONTEXT_V2_TURN_MUTATION_MESSAGES,
  CONTEXT_V2_V1_MIRROR_ERROR_CODE,
  TURN_MUTATION_ADMISSION,
  buildContextV2RebasePayload,
  buildRebaseReplacementHistory,
  contextV2TurnMutationMessage,
  contextV2V1MirrorMessage,
  decideTurnMutationMemoryMode,
  isTerminalContextV2RebaseError,
  projectContextV2RebaseAck,
  verifyContextV2RebaseAck,
} from "./context_v2_turn_mutation";

// A fully-admitted V2 head, shaped exactly like main's
// contextV2SessionHeadResponse() output.
const head = (overrides = {}) => ({
  ownerChatId: "chat-1",
  sessionId: "chat-1",
  admissionMode: "active",
  targetMode: "active",
  bootstrapStatus: "complete",
  bootstrapErrorCode: "",
  v2Bootstrapped: true,
  sticky: true,
  sessionExists: true,
  mutationReady: true,
  currentGenerationId: "ctx_generation_1",
  currentGenerationNo: 3,
  sessionRevision: 7,
  ...overrides,
});

const decide = (overrides = {}) =>
  decideTurnMutationMemoryMode({
    flagEnabled: true,
    bridgeAvailable: true,
    head: head(),
    ownerChatId: "chat-1",
    sessionId: "chat-1",
    ...overrides,
  });

const payload = (overrides = {}) =>
  buildContextV2RebasePayload({
    ownerChatId: "chat-1",
    sessionId: "chat-1",
    replacementHistory: [{ role: "user", content: "hi" }],
    sourceGenerationId: "ctx_generation_1",
    expectedSessionRevision: 7,
    operationId: "turn-chat-1-1700000000000-abcdef",
    reason: "edit",
    ...overrides,
  });

const ack = (overrides = {}) => ({
  ownerChatId: "chat-1",
  sessionId: "chat-1",
  generationId: "ctx_generation_2",
  sourceGenerationId: "ctx_generation_1",
  turnMutationEventRef: "pupu://context/event/ctx_evt_rebase_audit_a1",
  sessionRevision: 8,
  reason: "edit",
  ...overrides,
});

describe("buildRebaseReplacementHistory", () => {
  test("projects only role+content, matching the rebase allowlist exactly", () => {
    const result = buildRebaseReplacementHistory([
      {
        id: "u1",
        role: "user",
        content: "question",
        createdAt: 1,
        meta: { turnMutationOperationId: "op" },
        attachments: [{ id: "att-1", path: "/Users/red/secret.txt" }],
      },
      {
        id: "a1",
        role: "assistant",
        content: "answer",
        status: "done",
        traceFrames: [{ seq: 1 }],
        subagentFrames: [{ seq: 2 }],
        interjections: [{ id: "i1" }],
        composer: { commands: [] },
      },
    ]);
    expect(result).toEqual([
      { role: "user", content: "question" },
      { role: "assistant", content: "answer" },
    ]);
    // Any key beyond role/content fails the whole rebase server-side.
    result.forEach((entry) => {
      expect(Object.keys(entry).sort()).toEqual(["content", "role"]);
    });
  });

  test("excludes the streaming placeholder, non-chat roles and empty turns", () => {
    expect(
      buildRebaseReplacementHistory([
        { role: "user", content: "kept" },
        { role: "assistant", content: "partial", status: "streaming" },
        { role: "system", content: "not model history" },
        { role: "tool", content: "tool output" },
        // attachment-only message: no content survives the projection, and an
        // empty user turn must not enter the canonical journal.
        { role: "user", content: "   ", attachments: [{ id: "att-1" }] },
        null,
        "nope",
      ]),
    ).toEqual([{ role: "user", content: "kept" }]);
  });

  test("returns an empty array for non-array input", () => {
    expect(buildRebaseReplacementHistory(null)).toEqual([]);
    expect(buildRebaseReplacementHistory(undefined)).toEqual([]);
  });
});

describe("decideTurnMutationMemoryMode — legacy is a narrow door", () => {
  test("flag off is legacy and never touches the bridge", () => {
    expect(decideTurnMutationMemoryMode({ flagEnabled: false })).toEqual({
      mode: TURN_MUTATION_ADMISSION.LEGACY,
      reason: "flag_off",
    });
  });

  test("a 404 head is the one server-confirmed legacy signal", () => {
    expect(decide({ head: null, headErrorCode: "context_v2_not_found" })).toEqual(
      { mode: TURN_MUTATION_ADMISSION.LEGACY, reason: "session_absent" },
    );
  });

  test("an all-empty head (no admission, no session) is legacy", () => {
    expect(
      decide({
        head: head({
          admissionMode: "",
          targetMode: "",
          bootstrapStatus: "",
          bootstrapErrorCode: "",
          v2Bootstrapped: false,
          sticky: false,
          sessionExists: false,
          mutationReady: false,
          currentGenerationId: "",
          currentGenerationNo: 0,
          sessionRevision: 0,
        }),
      }).mode,
    ).toBe(TURN_MUTATION_ADMISSION.LEGACY);
  });
});

describe("decideTurnMutationMemoryMode — fail closed, never V1", () => {
  test.each([
    ["bridge unavailable", { bridgeAvailable: false }, "bridge_unavailable"],
    [
      "head transport failure",
      { head: null, headErrorCode: "context_v2_unreachable" },
      "head_failed",
    ],
    [
      "head auth failure",
      { head: null, headErrorCode: "context_v2_missing_auth_token" },
      "head_failed",
    ],
    ["head missing entirely", { head: null }, "head_missing"],
    ["head is not an object", { head: "nope" }, "head_missing"],
    [
      "head is for another session",
      { head: head({ sessionId: "other-session" }) },
      "head_identity_mismatch",
    ],
    [
      "head is for another chat",
      { head: head({ ownerChatId: "chat-2" }) },
      "head_identity_mismatch",
    ],
    [
      "read-only degraded runtime",
      { head: head({ readOnlyDegraded: true }) },
      "read_only_degraded",
    ],
    [
      "bootstrap pending",
      { head: head({ bootstrapStatus: "pending", v2Bootstrapped: false }) },
      "bootstrap_pending",
    ],
    [
      "bootstrap failed",
      {
        head: head({
          bootstrapStatus: "failed",
          v2Bootstrapped: false,
          bootstrapErrorCode: "context_v2_bootstrap_failed",
        }),
      },
      "bootstrap_failed",
    ],
    [
      "bootstrap status unknown",
      { head: head({ bootstrapStatus: "" }) },
      "bootstrap_unknown",
    ],
    [
      "sticky but not bootstrapped",
      { head: head({ v2Bootstrapped: false }) },
      "not_bootstrapped",
    ],
    [
      "admitted but session row gone",
      { head: head({ sessionExists: false }) },
      "session_missing",
    ],
    [
      "unknown admission mode",
      { head: head({ admissionMode: "partial" }) },
      "admission_unknown",
    ],
    [
      "unknown target mode",
      { head: head({ targetMode: "partial" }) },
      "target_mode_unknown",
    ],
    [
      "active but sidecar says not mutation-ready",
      { head: head({ mutationReady: false }) },
      "mutation_not_ready",
    ],
    [
      "no current generation",
      { head: head({ currentGenerationId: "" }) },
      "generation_missing",
    ],
    [
      "revision is not an integer",
      { head: head({ sessionRevision: 1.5 }) },
      "revision_invalid",
    ],
    [
      "revision is negative",
      { head: head({ sessionRevision: -1 }) },
      "revision_invalid",
    ],
    [
      "ambiguous partial admission",
      {
        head: head({
          sticky: false,
          v2Bootstrapped: false,
          sessionExists: false,
          bootstrapStatus: "pending",
          admissionMode: "",
          targetMode: "",
          currentGenerationId: "",
        }),
      },
      "ambiguous_admission",
    ],
  ])("%s blocks instead of falling back to V1", (_label, overrides, reason) => {
    const decision = decide(overrides);
    expect(decision.mode).toBe(TURN_MUTATION_ADMISSION.BLOCKED);
    expect(decision.reason).toBe(reason);
  });
});

describe("decideTurnMutationMemoryMode — V2 admission", () => {
  test("an active, bootstrapped, mutation-ready head is admitted", () => {
    expect(decide()).toEqual({
      mode: TURN_MUTATION_ADMISSION.V2,
      reason: "active",
      admissionMode: "active",
      sourceGenerationId: "ctx_generation_1",
      expectedSessionRevision: 7,
    });
  });

  test("shadow sticky is admitted so its canonical journal stays correct", () => {
    /* mutation_ready is STRUCTURALLY false in shadow (memory_v2_store requires
       target_mode == effective_mode == "active"), yet a shadow chat journals
       every turn — so the rebase must still run. Requiring mutationReady here
       would either block every mutation in shadow rollout or desynchronize the
       journal via a V1 fallback. */
    const decision = decide({
      head: head({
        admissionMode: "shadow",
        targetMode: "shadow",
        mutationReady: false,
      }),
    });
    expect(decision.mode).toBe(TURN_MUTATION_ADMISSION.V2);
    expect(decision.reason).toBe("shadow");
  });

  test("revision 0 is a legal expected revision", () => {
    const decision = decide({ head: head({ sessionRevision: 0 }) });
    expect(decision.mode).toBe(TURN_MUTATION_ADMISSION.V2);
    expect(decision.expectedSessionRevision).toBe(0);
  });

  /* admissionMode is the switch for the authoritative V1 mirror leg, so it is
     surfaced as its own field rather than being parsed back out of `reason`. */
  test("admissionMode is surfaced verbatim for both rollout modes", () => {
    expect(decide().admissionMode).toBe("active");
    expect(
      decide({
        head: head({
          admissionMode: "shadow",
          targetMode: "shadow",
          mutationReady: false,
        }),
      }).admissionMode,
    ).toBe("shadow");
  });

  test("a blocked or legacy decision carries no admissionMode", () => {
    expect(decide({ flagEnabled: false }).admissionMode).toBeUndefined();
    expect(
      decide({ head: head({ currentGenerationId: "" }) }).admissionMode,
    ).toBeUndefined();
  });
});

describe("contextV2V1MirrorMessage — shadow V1 leg failures", () => {
  test("a runtime-unavailable code reports UNAVAILABLE", () => {
    expect(contextV2V1MirrorMessage("bridge_unavailable")).toBe(
      CONTEXT_V2_TURN_MUTATION_MESSAGES.UNAVAILABLE,
    );
  });

  test("any other V1 code falls back to FAILED", () => {
    expect(
      contextV2V1MirrorMessage("unchain_session_memory_replace_failed"),
    ).toBe(CONTEXT_V2_TURN_MUTATION_MESSAGES.FAILED);
    expect(contextV2V1MirrorMessage("")).toBe(
      CONTEXT_V2_TURN_MUTATION_MESSAGES.FAILED,
    );
  });

  /* The V1 leg must NOT borrow the rebase map: a V1 code that happened to
     collide with a terminal rebase code would tell the user the conversation
     moved on when nothing of the sort happened. */
  test("it never reports a rebase CONFLICT for a V1 failure", () => {
    [
      "session_revision_conflict",
      "memory_replace_operation_conflict",
      "invalid_request",
      CONTEXT_V2_V1_MIRROR_ERROR_CODE,
    ].forEach((code) => {
      expect(contextV2V1MirrorMessage(code)).toBe(
        CONTEXT_V2_TURN_MUTATION_MESSAGES.FAILED,
      );
    });
  });
});

describe("buildContextV2RebasePayload", () => {
  test("emits exactly the seven allowlisted fields in a stable order", () => {
    const built = payload();
    expect(Object.keys(built)).toEqual([
      "ownerChatId",
      "sessionId",
      "replacementHistory",
      "sourceGenerationId",
      "expectedSessionRevision",
      "operationId",
      "reason",
    ]);
    // Byte-stable round trip → a replay hits the sidecar idempotency receipt.
    expect(JSON.stringify(built)).toBe(JSON.stringify(payload()));
  });

  test("accepts expectedSessionRevision 0 and an empty replacement history", () => {
    const built = payload({
      expectedSessionRevision: 0,
      replacementHistory: [],
    });
    expect(built.expectedSessionRevision).toBe(0);
    expect(built.replacementHistory).toEqual([]);
  });

  test("strips any field outside the allowlist", () => {
    const built = buildContextV2RebasePayload({
      ownerChatId: "chat-1",
      sessionId: "chat-1",
      replacementHistory: [
        { role: "user", content: "hi", attachments: [{ id: "att" }] },
      ],
      sourceGenerationId: "ctx_generation_1",
      expectedSessionRevision: 7,
      operationId: "turn-chat-1-1700000000000-abcdef",
      reason: "edit",
      memoryNamespace: "should-not-travel",
      options: { modelId: "openai:gpt-5" },
    });
    expect(built.replacementHistory[0]).toEqual({
      role: "user",
      content: "hi",
    });
    expect(built.memoryNamespace).toBeUndefined();
    expect(built.options).toBeUndefined();
  });

  test.each([
    ["missing owner", { ownerChatId: "" }],
    ["missing session", { sessionId: "" }],
    ["missing generation", { sourceGenerationId: "" }],
    ["missing operation", { operationId: "" }],
    ["unknown reason", { reason: "compact" }],
    ["null revision", { expectedSessionRevision: null }],
    ["negative revision", { expectedSessionRevision: -1 }],
    ["fractional revision", { expectedSessionRevision: 1.5 }],
    ["history is not an array", { replacementHistory: {} }],
    ["history has a bad role", { replacementHistory: [{ role: "system", content: "x" }] }],
    ["history has non-string content", { replacementHistory: [{ role: "user", content: 5 }] }],
  ])("returns null for %s", (_label, overrides) => {
    expect(payload(overrides)).toBeNull();
  });
});

describe("verifyContextV2RebaseAck", () => {
  test("accepts a well-formed receipt", () => {
    expect(verifyContextV2RebaseAck(ack(), payload())).toBe(true);
  });

  test.each([
    ["missing generationId", { generationId: "" }],
    ["generationId equal to the source", { generationId: "ctx_generation_1" }],
    ["missing turnMutationEventRef", { turnMutationEventRef: "" }],
    ["mismatched sourceGenerationId", { sourceGenerationId: "ctx_generation_9" }],
    ["mismatched owner", { ownerChatId: "chat-2" }],
    ["mismatched session", { sessionId: "other" }],
    ["mismatched reason", { reason: "delete" }],
    ["revision that did not advance", { sessionRevision: 7 }],
    ["revision that went backwards", { sessionRevision: 6 }],
    ["non-integer revision", { sessionRevision: "8" }],
  ])("rejects an ack with %s", (_label, overrides) => {
    expect(verifyContextV2RebaseAck(ack(overrides), payload())).toBe(false);
  });

  test("rejects a non-object ack or payload", () => {
    expect(verifyContextV2RebaseAck(null, payload())).toBe(false);
    expect(verifyContextV2RebaseAck(ack(), null)).toBe(false);
  });

  test("projects only server-minted identifiers for durable storage", () => {
    expect(
      projectContextV2RebaseAck({
        ...ack(),
        journalDigest: "deadbeef",
        eventRefs: ["pupu://context/event/one"],
        replacementHistoryHash: "hash",
      }),
    ).toEqual({
      generationId: "ctx_generation_2",
      turnMutationEventRef: "pupu://context/event/ctx_evt_rebase_audit_a1",
      sourceGenerationId: "ctx_generation_1",
      sessionRevision: 8,
    });
  });
});

describe("error classification and static messaging", () => {
  test.each([
    "context_v2_revision_conflict",
    "context_v2_generation_conflict",
    "context_v2_operation_conflict",
    "context_v2_attempt_generation_conflict",
    "context_v2_not_found",
    "context_v2_invalid_history",
    "context_v2_invalid_request",
    "context_v2_history_too_large",
    "context_v2_event_too_large",
  ])("%s is terminal for a frozen payload", (code) => {
    expect(isTerminalContextV2RebaseError(code)).toBe(true);
  });

  test.each([
    "context_v2_rebase_in_progress",
    "context_v2_unreachable",
    "context_v2_unavailable",
    "context_v2_missing_auth_token",
    "context_v2_redaction_failed",
    "context_v2_failed",
    "context_v2_ack_invalid",
    "some_future_code",
    "",
  ])("%s stays retryable so the durable intent survives", (code) => {
    expect(isTerminalContextV2RebaseError(code)).toBe(false);
  });

  test("messages are static and never echo server text or content", () => {
    expect(contextV2TurnMutationMessage("bridge_unavailable")).toBe(
      CONTEXT_V2_TURN_MUTATION_MESSAGES.UNAVAILABLE,
    );
    expect(contextV2TurnMutationMessage("bootstrap_pending")).toBe(
      CONTEXT_V2_TURN_MUTATION_MESSAGES.NOT_READY,
    );
    expect(contextV2TurnMutationMessage("mutation_not_ready")).toBe(
      CONTEXT_V2_TURN_MUTATION_MESSAGES.NOT_READY,
    );
    expect(contextV2TurnMutationMessage("context_v2_rebase_in_progress")).toBe(
      CONTEXT_V2_TURN_MUTATION_MESSAGES.IN_PROGRESS,
    );
    expect(contextV2TurnMutationMessage("context_v2_revision_conflict")).toBe(
      CONTEXT_V2_TURN_MUTATION_MESSAGES.CONFLICT,
    );
    // Anything unrecognised — including a server-supplied string — collapses
    // to a fixed literal rather than being surfaced.
    expect(
      contextV2TurnMutationMessage("/Users/red/db.sqlite is locked"),
    ).toBe(CONTEXT_V2_TURN_MUTATION_MESSAGES.FAILED);
    Object.values(CONTEXT_V2_TURN_MUTATION_MESSAGES).forEach((message) => {
      expect(message).not.toMatch(/[/\\]|\bhttp|pupu:\/\//);
    });
  });
});

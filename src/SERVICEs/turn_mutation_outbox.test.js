import {
  TURN_MUTATION_ADMISSION_MODES,
  TURN_MUTATION_MEMORY_MODES,
  TURN_MUTATION_OUTBOX_STORAGE_KEY,
  TURN_MUTATION_V1_MIRROR_STATES,
  createTurnMutationOperationId,
  enqueueTurnMutation,
  fingerprintTurnMutationMessages,
  normalizeContextV2RebaseAck,
  normalizeContextV2RebasePayload,
  normalizeTurnMutationOutboxEntry,
  readTurnMutationOutbox,
  readTurnMutationOutboxState,
  recordTurnMutationRebaseAck,
  recordTurnMutationV1MirrorApplied,
  removeTurnMutation,
} from "./turn_mutation_outbox";

const entry = (overrides = {}) => ({
  operationId: "turn-op-1",
  chatId: "chat-1",
  sessionId: "session-1",
  kind: "resend",
  targetMessageId: "user-1",
  originalFingerprint: "original",
  baseFingerprint: "base",
  baseMessageCount: 0,
  text: "hello",
  ...overrides,
});

const rebasePayload = (overrides = {}) => ({
  ownerChatId: "chat-1",
  sessionId: "session-1",
  replacementHistory: [{ role: "user", content: "hello" }],
  sourceGenerationId: "ctx_generation_1",
  expectedSessionRevision: 4,
  operationId: "turn-op-1",
  reason: "resend",
  ...overrides,
});

const v2Entry = (overrides = {}, payloadOverrides = {}) =>
  entry({
    memoryMode: "v2",
    v2RebasePayload: rebasePayload(payloadOverrides),
    ...overrides,
  });

const rebaseAck = (overrides = {}) => ({
  generationId: "ctx_generation_2",
  sourceGenerationId: "ctx_generation_1",
  turnMutationEventRef: "pupu://context/event/ctx_evt_rebase_audit_a1",
  sessionRevision: 5,
  ...overrides,
});

describe("turn mutation outbox", () => {
  beforeEach(() => window.localStorage.clear());

  test("persists and removes a normalized operation", () => {
    expect(enqueueTurnMutation(entry())).toEqual(
      expect.objectContaining({ operationId: "turn-op-1", kind: "resend" }),
    );
    expect(readTurnMutationOutbox()).toHaveLength(1);
    expect(removeTurnMutation("turn-op-1")).toBe(true);
    expect(readTurnMutationOutbox()).toEqual([]);
  });

  test("fails closed when persistence is unavailable", () => {
    const storage = {
      getItem: () => "[]",
      setItem: () => {
        throw new DOMException("quota", "QuotaExceededError");
      },
    };
    expect(enqueueTurnMutation(entry(), storage)).toBeNull();
  });

  test.each([
    [
      "storage read throws",
      {
        getItem: () => {
          throw new DOMException("blocked", "SecurityError");
        },
        setItem: jest.fn(),
      },
    ],
    [
      "stored JSON is corrupt",
      {
        getItem: () => "{not-json",
        setItem: jest.fn(),
      },
    ],
  ])("%s is unavailable, never an empty writable outbox", (_label, storage) => {
    expect(readTurnMutationOutboxState(storage)).toEqual({
      available: false,
      entries: [],
    });
    expect(enqueueTurnMutation(entry(), storage)).toBeNull();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  test("a non-renderer environment is an unlocked empty read, but still cannot write", () => {
    const descriptor = Object.getOwnPropertyDescriptor(global, "window");
    Object.defineProperty(global, "window", {
      configurable: true,
      value: undefined,
    });
    try {
      expect(readTurnMutationOutboxState()).toEqual({
        available: true,
        entries: [],
      });
      expect(enqueueTurnMutation(entry())).toBeNull();
    } finally {
      Object.defineProperty(global, "window", descriptor);
    }
  });

  test("fingerprint ignores timestamps but detects semantic message changes", () => {
    const first = [
      { id: "u1", role: "user", content: "hello", updatedAt: 1 },
    ];
    expect(
      fingerprintTurnMutationMessages([
        { ...first[0], updatedAt: 999 },
      ]),
    ).toBe(fingerprintTurnMutationMessages(first));
    expect(
      fingerprintTurnMutationMessages([{ ...first[0], content: "changed" }]),
    ).not.toBe(fingerprintTurnMutationMessages(first));
  });

  test("creates distinct operation ids", () => {
    expect(createTurnMutationOperationId("chat-1")).not.toBe(
      createTurnMutationOperationId("chat-1"),
    );
  });

  test("fails closed instead of evicting an unfinished entry at capacity", () => {
    for (let index = 0; index < 32; index += 1) {
      expect(
        enqueueTurnMutation(entry({ operationId: `turn-op-${index}` })),
      ).not.toBeNull();
    }
    expect(
      enqueueTurnMutation(entry({ operationId: "turn-op-overflow" })),
    ).toBeNull();
    expect(readTurnMutationOutbox()).toHaveLength(32);
    expect(readTurnMutationOutbox()[0].operationId).toBe("turn-op-0");
  });
});

describe("turn mutation outbox — memoryMode", () => {
  beforeEach(() => window.localStorage.clear());

  test("an entry without memoryMode is legacy, so old rows replay as V1", () => {
    // The pre-Memory-V2 shape. Guessing V2 for it would rebase a journal that
    // was never the source of truth for that operation.
    const stored = enqueueTurnMutation(entry());
    expect(stored.memoryMode).toBe(TURN_MUTATION_MEMORY_MODES.LEGACY);
    expect(stored.v2RebasePayload).toBeNull();
    expect(stored.v2Ack).toBeNull();
    expect(readTurnMutationOutbox()[0].memoryMode).toBe("legacy");
  });

  test("an unrecognised memoryMode collapses to legacy (closed enum)", () => {
    expect(
      normalizeTurnMutationOutboxEntry(entry({ memoryMode: "v3" })).memoryMode,
    ).toBe("legacy");
    expect(
      normalizeTurnMutationOutboxEntry(entry({ memoryMode: "" })).memoryMode,
    ).toBe("legacy");
  });

  test("a legacy entry ignores any stray v2 payload rather than adopting it", () => {
    const stored = enqueueTurnMutation(
      entry({ v2RebasePayload: rebasePayload(), v2Ack: rebaseAck() }),
    );
    expect(stored.memoryMode).toBe("legacy");
    expect(stored.v2RebasePayload).toBeNull();
    expect(stored.v2Ack).toBeNull();
  });

  test("a v2 entry persists the frozen payload and round-trips byte-stably", () => {
    const stored = enqueueTurnMutation(v2Entry());
    expect(stored.memoryMode).toBe("v2");
    expect(stored.v2RebasePayload).toEqual(rebasePayload());
    // A recovery replay must send the IDENTICAL request so the sidecar's
    // idempotency receipt matches instead of creating a second generation.
    const reread = readTurnMutationOutbox()[0];
    expect(JSON.stringify(reread.v2RebasePayload)).toBe(
      JSON.stringify(stored.v2RebasePayload),
    );
  });

  test("expectedSessionRevision 0 survives (a never-rebased session)", () => {
    const stored = enqueueTurnMutation(
      v2Entry({}, { expectedSessionRevision: 0 }),
    );
    expect(stored.v2RebasePayload.expectedSessionRevision).toBe(0);
    expect(readTurnMutationOutbox()[0].v2RebasePayload.expectedSessionRevision)
      .toBe(0);
  });

  test.each([
    ["no payload at all", { v2RebasePayload: null }],
    [
      "an operationId that disagrees with the entry",
      { v2RebasePayload: rebasePayload({ operationId: "turn-op-other" }) },
    ],
    [
      "an ownerChatId that disagrees with the entry",
      { v2RebasePayload: rebasePayload({ ownerChatId: "chat-2" }) },
    ],
    [
      "a sessionId that disagrees with the entry",
      { v2RebasePayload: rebasePayload({ sessionId: "session-2" }) },
    ],
    [
      "a reason that disagrees with the kind",
      { v2RebasePayload: rebasePayload({ reason: "delete" }) },
    ],
    [
      "a malformed revision",
      { v2RebasePayload: rebasePayload({ expectedSessionRevision: -1 }) },
    ],
    [
      "history with a forbidden extra role",
      {
        v2RebasePayload: rebasePayload({
          replacementHistory: [{ role: "system", content: "x" }],
        }),
      },
    ],
  ])(
    "a v2 entry with %s is rejected outright, never downgraded to legacy",
    (_label, overrides) => {
      // Downgrading would run the V1 rewrite against a V2-managed session and
      // desynchronize the canonical journal irreversibly.
      expect(
        normalizeTurnMutationOutboxEntry(v2Entry({ memoryMode: "v2", ...overrides })),
      ).toBeNull();
      expect(enqueueTurnMutation(v2Entry({ ...overrides }))).toBeNull();
    },
  );

  test("replacement history keeps only role/content", () => {
    const normalized = normalizeContextV2RebasePayload(
      rebasePayload({
        replacementHistory: [
          { role: "user", content: "hi", attachments: [{ id: "att" }], id: "u1" },
        ],
      }),
    );
    expect(normalized.replacementHistory).toEqual([
      { role: "user", content: "hi" },
    ]);
    expect(Object.keys(normalized.replacementHistory[0]).sort()).toEqual([
      "content",
      "role",
    ]);
  });

  test("payload identifiers are validated against the Context V2 charset", () => {
    // Anything main would reject as context_v2_invalid_request — a TERMINAL
    // error that silently discards the user's edit — is refused up front.
    expect(
      normalizeContextV2RebasePayload(rebasePayload({ ownerChatId: "chat 1" })),
    ).toBeNull();
    expect(
      normalizeContextV2RebasePayload(rebasePayload({ operationId: "short" })),
    ).toBeNull();
    expect(
      normalizeContextV2RebasePayload(
        rebasePayload({ sourceGenerationId: "gen/one" }),
      ),
    ).toBeNull();
  });
});

describe("turn mutation outbox — durable rebase ack (CAS)", () => {
  beforeEach(() => window.localStorage.clear());

  test("records the ack on the matching operation only", () => {
    enqueueTurnMutation(v2Entry());
    enqueueTurnMutation(
      v2Entry(
        { operationId: "turn-op-2", chatId: "chat-2" },
        { operationId: "turn-op-2", ownerChatId: "chat-2" },
      ),
    );

    const updated = recordTurnMutationRebaseAck("turn-op-1", rebaseAck());
    expect(updated.v2Ack).toEqual(rebaseAck());

    const entries = readTurnMutationOutbox();
    expect(entries.find((item) => item.operationId === "turn-op-1").v2Ack)
      .toEqual(rebaseAck());
    // Untouched sibling — the CAS never rewrites anything else.
    expect(entries.find((item) => item.operationId === "turn-op-2").v2Ack)
      .toBeNull();
  });

  test("never resurrects an operation that is no longer in the outbox", () => {
    expect(recordTurnMutationRebaseAck("turn-op-1", rebaseAck())).toBeNull();
    expect(readTurnMutationOutbox()).toEqual([]);
  });

  test("refuses an ack for a legacy entry", () => {
    enqueueTurnMutation(entry());
    expect(recordTurnMutationRebaseAck("turn-op-1", rebaseAck())).toBeNull();
    expect(readTurnMutationOutbox()[0].v2Ack).toBeNull();
  });

  test.each([
    ["a different source generation", { sourceGenerationId: "ctx_generation_9" }],
    ["a revision that did not advance", { sessionRevision: 4 }],
    ["a revision that went backwards", { sessionRevision: 3 }],
    ["no generation id", { generationId: "" }],
    ["a generation equal to the source", { generationId: "ctx_generation_1" }],
    ["no turn mutation event ref", { turnMutationEventRef: "" }],
    ["a non-integer revision", { sessionRevision: "5" }],
  ])("refuses an ack with %s", (_label, overrides) => {
    enqueueTurnMutation(v2Entry());
    expect(
      recordTurnMutationRebaseAck("turn-op-1", rebaseAck(overrides)),
    ).toBeNull();
    expect(readTurnMutationOutbox()[0].v2Ack).toBeNull();
  });

  test("re-recording the same ack is idempotent; a conflicting one is refused", () => {
    enqueueTurnMutation(v2Entry());
    expect(recordTurnMutationRebaseAck("turn-op-1", rebaseAck())).not.toBeNull();
    expect(recordTurnMutationRebaseAck("turn-op-1", rebaseAck())).not.toBeNull();
    expect(
      recordTurnMutationRebaseAck(
        "turn-op-1",
        rebaseAck({ generationId: "ctx_generation_3", sessionRevision: 6 }),
      ),
    ).toBeNull();
    expect(readTurnMutationOutbox()[0].v2Ack.generationId).toBe(
      "ctx_generation_2",
    );
  });

  test("the persisted ack carries only server-minted identifiers", () => {
    enqueueTurnMutation(v2Entry());
    recordTurnMutationRebaseAck("turn-op-1", {
      ...rebaseAck(),
      journalDigest: "deadbeef",
      replacementHistoryHash: "hash",
      reason: "resend",
    });
    const stored = readTurnMutationOutbox()[0].v2Ack;
    expect(Object.keys(stored).sort()).toEqual([
      "generationId",
      "sessionRevision",
      "sourceGenerationId",
      "turnMutationEventRef",
    ]);
    expect(JSON.stringify(stored)).not.toContain("deadbeef");
  });

  test("a stored ack that does not match the frozen intent is dropped on read", () => {
    enqueueTurnMutation(v2Entry());
    recordTurnMutationRebaseAck("turn-op-1", rebaseAck());
    // Simulate a rewritten / corrupted row: the ack no longer belongs to the
    // frozen payload, so it must not be trusted as "already applied".
    const raw = JSON.parse(
      window.localStorage.getItem(TURN_MUTATION_OUTBOX_STORAGE_KEY),
    );
    raw[0].v2RebasePayload.sourceGenerationId = "ctx_generation_7";
    window.localStorage.setItem(
      TURN_MUTATION_OUTBOX_STORAGE_KEY,
      JSON.stringify(raw),
    );
    expect(readTurnMutationOutbox()[0].v2Ack).toBeNull();
  });

  test("normalizeContextV2RebaseAck rejects a control-character ref", () => {
    expect(
      normalizeContextV2RebaseAck(
        rebaseAck({ turnMutationEventRef: "pupu://context/event/a b" }),
      ),
    ).toBeNull();
  });

  test("fails closed when persistence is unavailable", () => {
    const stored = enqueueTurnMutation(v2Entry());
    const storage = {
      getItem: () => JSON.stringify([stored]),
      setItem: () => {
        throw new DOMException("quota", "QuotaExceededError");
      },
    };
    expect(
      recordTurnMutationRebaseAck("turn-op-1", rebaseAck(), storage),
    ).toBeNull();
  });
});

/* ── admissionMode / v1MirrorState ───────────────────────────────────────────
   These two fields decide whether a durable row has ONE leg (journal only) or
   TWO (journal + the authoritative V1 replace that keeps shadow's model input
   equal to legacy). Getting the normalizer wrong either re-runs an applied V1
   write or silently drops the leg, so each rule gets its own case. */
const shadowEntry = (overrides = {}, payloadOverrides = {}) =>
  v2Entry(
    {
      admissionMode: TURN_MUTATION_ADMISSION_MODES.SHADOW,
      v1MirrorState: TURN_MUTATION_V1_MIRROR_STATES.PENDING,
      ...overrides,
    },
    payloadOverrides,
  );

describe("turn mutation outbox — admissionMode / v1MirrorState", () => {
  beforeEach(() => window.localStorage.clear());

  test("a shadow row freezes both fields and round-trips them", () => {
    const stored = enqueueTurnMutation(shadowEntry());
    expect(stored.admissionMode).toBe("shadow");
    expect(stored.v1MirrorState).toBe("pending");
    const reread = readTurnMutationOutbox()[0];
    expect(reread.admissionMode).toBe("shadow");
    expect(reread.v1MirrorState).toBe("pending");
  });

  test("an active row is rebase-only and carries no mirror state", () => {
    const stored = enqueueTurnMutation(
      v2Entry({ admissionMode: TURN_MUTATION_ADMISSION_MODES.ACTIVE }),
    );
    expect(stored.admissionMode).toBe("active");
    expect(stored.v1MirrorState).toBeNull();
  });

  // RULE 1 — backward compatibility. A row frozen before the dual-write
  // existed never captured a V1 snapshot, so inventing a V1 write for it would
  // push an unvalidated history into short-term memory.
  test("an old v2 row without admissionMode stays rebase-only, never rejected", () => {
    const stored = enqueueTurnMutation(v2Entry());
    expect(stored).not.toBeNull();
    expect(stored.memoryMode).toBe("v2");
    expect(stored.admissionMode).toBeNull();
    expect(stored.v1MirrorState).toBeNull();
  });

  test("an old v2 row with a stray mirror state still stays rebase-only", () => {
    const stored = enqueueTurnMutation(
      v2Entry({ v1MirrorState: TURN_MUTATION_V1_MIRROR_STATES.PENDING }),
    );
    expect(stored).not.toBeNull();
    expect(stored.admissionMode).toBeNull();
    expect(stored.v1MirrorState).toBeNull();
  });

  // RULE 2 — a shadow row's mirror state is the ONLY record of whether the
  // second leg ran. Defaulting it either re-runs or silently skips that leg.
  test.each([
    ["absent", {}],
    ["empty", { v1MirrorState: "" }],
    ["unrecognised", { v1MirrorState: "halfway" }],
    ["not a string", { v1MirrorState: 1 }],
  ])(
    "a shadow row with %s v1MirrorState is rejected outright",
    (_label, overrides) => {
      const candidate = v2Entry({
        admissionMode: TURN_MUTATION_ADMISSION_MODES.SHADOW,
        ...overrides,
      });
      expect(normalizeTurnMutationOutboxEntry(candidate)).toBeNull();
      expect(enqueueTurnMutation(candidate)).toBeNull();
      expect(readTurnMutationOutbox()).toEqual([]);
    },
  );

  // RULE 3 — an active row's mirror fields are extraneous, not half-valid:
  // stripping them yields exactly the correct rebase-only behaviour.
  test("an active row has stray V1 mirror fields stripped, not rejected", () => {
    const stored = enqueueTurnMutation(
      v2Entry({
        admissionMode: TURN_MUTATION_ADMISSION_MODES.ACTIVE,
        v1MirrorState: TURN_MUTATION_V1_MIRROR_STATES.PENDING,
      }),
    );
    expect(stored).not.toBeNull();
    expect(stored.admissionMode).toBe("active");
    expect(stored.v1MirrorState).toBeNull();
  });

  // A declared-but-unknown mode is corruption, which is a different thing
  // from the absent field of an old row.
  test("a declared but unknown admissionMode is rejected", () => {
    expect(
      normalizeTurnMutationOutboxEntry(v2Entry({ admissionMode: "hybrid" })),
    ).toBeNull();
  });

  test("a legacy row ignores admissionMode entirely", () => {
    const stored = enqueueTurnMutation(
      entry({
        admissionMode: TURN_MUTATION_ADMISSION_MODES.SHADOW,
        v1MirrorState: TURN_MUTATION_V1_MIRROR_STATES.PENDING,
      }),
    );
    expect(stored.memoryMode).toBe("legacy");
    expect(stored.admissionMode).toBeNull();
    expect(stored.v1MirrorState).toBeNull();
  });
});

describe("turn mutation outbox — V1 mirror CAS", () => {
  beforeEach(() => window.localStorage.clear());

  const acked = (overrides = {}) => {
    enqueueTurnMutation(shadowEntry(overrides));
    recordTurnMutationRebaseAck("turn-op-1", rebaseAck());
  };

  test("marks the mirror applied on the matching operation only", () => {
    acked();
    enqueueTurnMutation(
      shadowEntry(
        { operationId: "turn-op-2", chatId: "chat-2" },
        { operationId: "turn-op-2", ownerChatId: "chat-2" },
      ),
    );

    const updated = recordTurnMutationV1MirrorApplied("turn-op-1");
    expect(updated.v1MirrorState).toBe("applied");

    const entries = readTurnMutationOutbox();
    expect(
      entries.find((item) => item.operationId === "turn-op-1").v1MirrorState,
    ).toBe("applied");
    expect(
      entries.find((item) => item.operationId === "turn-op-2").v1MirrorState,
    ).toBe("pending");
  });

  test("never resurrects an operation that is no longer in the outbox", () => {
    expect(recordTurnMutationV1MirrorApplied("turn-op-1")).toBeNull();
    expect(readTurnMutationOutbox()).toEqual([]);
  });

  test("refuses a legacy row", () => {
    enqueueTurnMutation(entry());
    expect(recordTurnMutationV1MirrorApplied("turn-op-1")).toBeNull();
    expect(readTurnMutationOutbox()[0].v1MirrorState).toBeNull();
  });

  // Accepting this would paper over a caller that wrote V1 on the live path,
  // where the journal — not V1 — is the model input.
  test("refuses an active row, which has no V1 leg", () => {
    enqueueTurnMutation(
      v2Entry({ admissionMode: TURN_MUTATION_ADMISSION_MODES.ACTIVE }),
    );
    recordTurnMutationRebaseAck("turn-op-1", rebaseAck());
    expect(recordTurnMutationV1MirrorApplied("turn-op-1")).toBeNull();
    expect(readTurnMutationOutbox()[0].v1MirrorState).toBeNull();
  });

  test("refuses an old rebase-only row that never declared a mode", () => {
    enqueueTurnMutation(v2Entry());
    recordTurnMutationRebaseAck("turn-op-1", rebaseAck());
    expect(recordTurnMutationV1MirrorApplied("turn-op-1")).toBeNull();
  });

  /* Leg order, encoded in storage: "V1 written but the journal was not" must
     be unrepresentable, or a later reader cannot tell it from a completed
     mutation. */
  test("refuses to mark the mirror applied before the journal ack exists", () => {
    enqueueTurnMutation(shadowEntry());
    expect(recordTurnMutationV1MirrorApplied("turn-op-1")).toBeNull();
    expect(readTurnMutationOutbox()[0].v1MirrorState).toBe("pending");
  });

  test("re-applying is an idempotent no-op success", () => {
    acked();
    expect(recordTurnMutationV1MirrorApplied("turn-op-1")).not.toBeNull();
    const second = recordTurnMutationV1MirrorApplied("turn-op-1");
    expect(second.v1MirrorState).toBe("applied");
    expect(readTurnMutationOutbox()).toHaveLength(1);
  });

  test("fails closed when persistence is unavailable", () => {
    acked();
    const rows = JSON.parse(
      window.localStorage.getItem(TURN_MUTATION_OUTBOX_STORAGE_KEY),
    );
    const storage = {
      getItem: () => JSON.stringify(rows),
      setItem: () => {
        throw new DOMException("quota", "QuotaExceededError");
      },
    };
    expect(recordTurnMutationV1MirrorApplied("turn-op-1", storage)).toBeNull();
  });
});

import {
  createTurnMutationOperationId,
  enqueueTurnMutation,
  fingerprintTurnMutationMessages,
  readTurnMutationOutbox,
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

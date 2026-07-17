import {
  enqueueLogicalExecutionCancel,
  readLogicalExecutionCancelOutbox,
  removeLogicalExecutionCancel,
} from "./logical_execution_cancel_outbox";

describe("logical execution cancellation outbox", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("deduplicates by session and logical execution while refreshing attempt", () => {
    enqueueLogicalExecutionCancel({
      session_id: " chat-1 ",
      logical_execution_id: " logical-a ",
      attempt_id: " attempt-a1 ",
      createdAt: 10,
    });
    enqueueLogicalExecutionCancel({
      sessionId: "chat-1",
      logicalExecutionId: "logical-a",
      attemptId: "attempt-a2",
      requestId: "request-a2",
      createdAt: 20,
    });

    expect(readLogicalExecutionCancelOutbox()).toEqual([
      {
        sessionId: "chat-1",
        logicalExecutionId: "logical-a",
        attemptId: "attempt-a2",
        sourceAttemptId: "",
        requestId: "request-a2",
        reason: "user_stop",
        createdAt: 10,
      },
    ]);
  });

  test("survives reload identity loss and removes only one logical task", () => {
    enqueueLogicalExecutionCancel({
      sessionId: "chat-1",
      logicalExecutionId: "logical-a",
    });
    enqueueLogicalExecutionCancel({
      sessionId: "chat-1",
      logicalExecutionId: "logical-b",
      attemptId: "attempt-b1",
    });

    expect(readLogicalExecutionCancelOutbox()).toEqual([
      expect.objectContaining({
        sessionId: "chat-1",
        logicalExecutionId: "logical-a",
        attemptId: "",
      }),
      expect.objectContaining({
        sessionId: "chat-1",
        logicalExecutionId: "logical-b",
      }),
    ]);
    expect(removeLogicalExecutionCancel("chat-1", "logical-a")).toBe(true);
    expect(readLogicalExecutionCancelOutbox()).toEqual([
      expect.objectContaining({ logicalExecutionId: "logical-b" }),
    ]);
  });

  test("rejects unscoped legacy entries", () => {
    window.localStorage.setItem(
      "pupu.logical_execution_cancel_outbox.v2",
      JSON.stringify([{ sessionId: "chat-1", attemptId: "attempt-a1" }]),
    );
    expect(readLogicalExecutionCancelOutbox()).toEqual([]);
  });

  test("never evicts an unacknowledged Stop when more than 64 are queued", () => {
    for (let index = 0; index < 70; index += 1) {
      expect(
        enqueueLogicalExecutionCancel({
          sessionId: "chat-many",
          logicalExecutionId: `logical-${index}`,
          createdAt: index,
        }),
      ).not.toBeNull();
    }

    const entries = readLogicalExecutionCancelOutbox();
    expect(entries).toHaveLength(70);
    expect(entries[0].logicalExecutionId).toBe("logical-0");
    expect(entries[69].logicalExecutionId).toBe("logical-69");
  });

  test("reports storage failure instead of pretending Stop was persisted", () => {
    const failingStorage = {
      getItem: jest.fn(() => "[]"),
      setItem: jest.fn(() => {
        throw new Error("quota exceeded");
      }),
    };

    expect(
      enqueueLogicalExecutionCancel(
        {
          sessionId: "chat-quota",
          logicalExecutionId: "logical-quota",
        },
        failingStorage,
      ),
    ).toBeNull();
  });
});

import {
  enqueueExecutionCancel,
  readExecutionCancelOutbox,
  removeExecutionCancel,
} from "./execution_cancel_outbox";

describe("execution cancellation outbox", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("persists, normalizes, and deduplicates exact attempts", () => {
    enqueueExecutionCancel({
      session_id: " chat-1 ",
      attempt_id: " attempt-1 ",
      source_attempt_id: " source-1 ",
      reason: " user_stop ",
      createdAt: 10,
    });
    enqueueExecutionCancel({
      sessionId: "chat-1",
      attemptId: "attempt-1",
      requestId: "request-1",
      createdAt: 20,
    });

    expect(readExecutionCancelOutbox()).toEqual([
      {
        sessionId: "chat-1",
        attemptId: "attempt-1",
        sourceAttemptId: "source-1",
        requestId: "request-1",
        reason: "user_stop",
        createdAt: 10,
      },
    ]);
  });

  test("removes only the exact attempt", () => {
    enqueueExecutionCancel({ sessionId: "chat-1", attemptId: "attempt-1" });
    enqueueExecutionCancel({ sessionId: "chat-1", attemptId: "attempt-2" });

    expect(removeExecutionCancel("chat-1", "attempt-1")).toBe(true);
    expect(readExecutionCancelOutbox()).toEqual([
      expect.objectContaining({
        sessionId: "chat-1",
        attemptId: "attempt-2",
      }),
    ]);
  });

  test("fails closed on corrupt storage without inventing identities", () => {
    window.localStorage.setItem("pupu.execution_cancel_outbox.v1", "{broken");
    expect(readExecutionCancelOutbox()).toEqual([]);
  });

  test("storage write failure never blocks the immediate cancel identity", () => {
    const storage = {
      getItem: () => "[]",
      setItem: () => {
        throw new DOMException("quota", "QuotaExceededError");
      },
    };

    expect(
      enqueueExecutionCancel(
        { sessionId: "chat-1", attemptId: "attempt-1" },
        storage,
      ),
    ).toEqual(
      expect.objectContaining({
        sessionId: "chat-1",
        attemptId: "attempt-1",
      }),
    );
  });
});

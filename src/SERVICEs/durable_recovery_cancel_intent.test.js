import {
  enqueueDurableRecoveryCancelIntent,
  getDurableRecoveryCancelIntent,
  readDurableRecoveryCancelIntents,
  removeDurableRecoveryCancelIntent,
} from "./durable_recovery_cancel_intent";

describe("durable recovery cancel intents", () => {
  beforeEach(() => {
    window.localStorage.clear();
    removeDurableRecoveryCancelIntent("chat-a");
  });

  test("persists an unresolved checking-stage Stop by chat", () => {
    enqueueDurableRecoveryCancelIntent({
      chatId: "chat-a",
      sessionId: "",
      createdAt: 10,
    });
    enqueueDurableRecoveryCancelIntent({
      chatId: "chat-a",
      sessionId: "session-a",
      createdAt: 20,
    });

    expect(readDurableRecoveryCancelIntents()).toEqual([
      {
        chatId: "chat-a",
        sessionId: "session-a",
        reason: "user_stop",
        createdAt: 20,
      },
    ]);
    expect(getDurableRecoveryCancelIntent("chat-a")?.sessionId).toBe(
      "session-a",
    );
    expect(removeDurableRecoveryCancelIntent("chat-a")).toBe(true);
    expect(getDurableRecoveryCancelIntent("chat-a")).toBeNull();
  });

  test("keeps a volatile intent when persistent storage rejects the write", () => {
    const storage = {
      getItem: jest.fn(() => "[]"),
      setItem: jest.fn(() => {
        throw new Error("quota");
      }),
    };
    const intent = enqueueDurableRecoveryCancelIntent(
      { chatId: "chat-a" },
      storage,
    );
    expect(intent).toEqual(
      expect.objectContaining({
        chatId: "chat-a",
        outboxPersisted: false,
      }),
    );
    expect(getDurableRecoveryCancelIntent("chat-a", storage)).toEqual(
      expect.objectContaining({ chatId: "chat-a" }),
    );
    expect(removeDurableRecoveryCancelIntent("chat-a", storage)).toBe(true);
  });

  test("does not report removal success when a persisted marker cannot be cleared", () => {
    let value = "[]";
    let rejectWrites = false;
    const storage = {
      getItem: jest.fn(() => value),
      setItem: jest.fn((_key, nextValue) => {
        if (rejectWrites) {
          throw new Error("quota");
        }
        value = nextValue;
      }),
    };
    expect(
      enqueueDurableRecoveryCancelIntent(
        { chatId: "chat-a", sessionId: "session-a" },
        storage,
      )?.outboxPersisted,
    ).toBe(true);
    rejectWrites = true;
    expect(removeDurableRecoveryCancelIntent("chat-a", storage)).toBe(false);
    expect(getDurableRecoveryCancelIntent("chat-a", storage)).not.toBeNull();
    rejectWrites = false;
    expect(removeDurableRecoveryCancelIntent("chat-a", storage)).toBe(true);
  });
});

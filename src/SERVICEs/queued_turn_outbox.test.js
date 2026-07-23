import {
  QUEUED_TURN_OUTBOX_STORAGE_KEY,
  bindQueuedTurnOwnersToAttempt,
  convertPendingFyiToClarify,
  createPendingFyiMessageId,
  fallbackPendingClarifyToQueue,
  migratePendingFyiForAttemptToQueue,
  migratePendingFyiToQueue,
  readPendingClarifyForChat,
  readPendingFyisForAttempt,
  readQueuedTurnOutbox,
  readQueuedTurnsForAttempt,
  readQueuedTurnsForClientOperation,
  removePendingFyisForAttempt,
  removeQueuedTurnsForAttempt,
  resolvePendingFyiIntent,
  transitionPendingClarifyToPendingFyi,
  writePendingClarify,
  writePendingFyi,
  writeQueuedTurnsForAttempt,
  writeQueuedTurnsForClientOperation,
} from "./queued_turn_outbox";

const queuedItem = (id, text = id, status = "queued") => ({
  id,
  text,
  status,
});

const createCountingStorage = (initialState, { throwOnWrite = false } = {}) => {
  let rawValue = JSON.stringify(initialState);
  let readCount = 0;
  let writeCount = 0;
  return {
    storage: {
      getItem: () => {
        readCount += 1;
        return rawValue;
      },
      setItem: (_key, value) => {
        writeCount += 1;
        if (throwOnWrite) {
          throw new DOMException("quota", "QuotaExceededError");
        }
        rawValue = value;
      },
    },
    getRawValue: () => rawValue,
    getReadCount: () => readCount,
    getWriteCount: () => writeCount,
  };
};

const pendingClarifyState = ({ clarifies, fyis = [] }) => ({
  version: 2,
  queues: [],
  clarifies,
  fyis,
});

describe("queued turn outbox", () => {
  beforeEach(() => window.localStorage.clear());

  test("creates unique client-owned FYI message ids", () => {
    const ids = Array.from({ length: 16 }, () => createPendingFyiMessageId());

    expect(ids.every((id) => /^fyi-client-\S+$/.test(id))).toBe(true);
    expect(new Set(ids)).toHaveProperty("size", ids.length);
  });

  test("persists, replaces, and removes one exact chat attempt", () => {
    expect(
      writeQueuedTurnsForAttempt({
        chatId: "chat-a",
        attemptId: "attempt-1",
        items: [queuedItem("queue-1", "first")],
      }),
    ).toEqual(
      expect.objectContaining({ chatId: "chat-a", attemptId: "attempt-1" }),
    );
    writeQueuedTurnsForAttempt({
      chatId: "chat-a",
      attemptId: "attempt-1",
      items: [queuedItem("queue-2", "replacement", "relayed")],
    });

    expect(readQueuedTurnOutbox()).toHaveLength(1);
    expect(readQueuedTurnsForAttempt("chat-a", "attempt-1")?.items).toEqual([
      queuedItem("queue-2", "replacement", "relayed"),
    ]);
    expect(removeQueuedTurnsForAttempt("chat-a", "attempt-1")).toBe(true);
    expect(readQueuedTurnOutbox()).toEqual([]);
  });

  test("keeps chats and attempts isolated", () => {
    writeQueuedTurnsForAttempt({
      chatId: "chat-a",
      attemptId: "attempt-1",
      items: [queuedItem("a1")],
    });
    writeQueuedTurnsForAttempt({
      chatId: "chat-a",
      attemptId: "attempt-2",
      items: [queuedItem("a2")],
    });
    writeQueuedTurnsForAttempt({
      chatId: "chat-b",
      attemptId: "attempt-1",
      items: [queuedItem("b1")],
    });

    removeQueuedTurnsForAttempt("chat-a", "attempt-1");

    expect(readQueuedTurnsForAttempt("chat-a", "attempt-1")).toBeNull();
    expect(readQueuedTurnsForAttempt("chat-a", "attempt-2")?.items).toEqual([
      queuedItem("a2"),
    ]);
    expect(readQueuedTurnsForAttempt("chat-b", "attempt-1")?.items).toEqual([
      queuedItem("b1"),
    ]);
  });

  test("ignores malformed entries and unsafe queue items", () => {
    window.localStorage.setItem(
      QUEUED_TURN_OUTBOX_STORAGE_KEY,
      JSON.stringify([
        { chatId: "", attemptId: "attempt", items: [queuedItem("bad")] },
        {
          chatId: "chat-a",
          attemptId: "attempt-1",
          items: [
            queuedItem("valid", "keep"),
            queuedItem("", "missing id"),
            queuedItem("invalid-status", "drop", "sending"),
          ],
        },
      ]),
    );

    expect(readQueuedTurnOutbox()).toEqual([
      expect.objectContaining({
        chatId: "chat-a",
        attemptId: "attempt-1",
        items: [queuedItem("valid", "keep")],
      }),
    ]);
  });

  test("an empty snapshot clears only the exact attempt", () => {
    writeQueuedTurnsForAttempt({
      chatId: "chat-a",
      attemptId: "attempt-1",
      items: [queuedItem("a1")],
    });
    writeQueuedTurnsForAttempt({
      chatId: "chat-a",
      attemptId: "attempt-2",
      items: [queuedItem("a2")],
    });

    expect(
      writeQueuedTurnsForAttempt({
        chatId: "chat-a",
        attemptId: "attempt-1",
        items: [],
      }),
    ).toBeNull();
    expect(readQueuedTurnsForAttempt("chat-a", "attempt-1")).toBeNull();
    expect(readQueuedTurnsForAttempt("chat-a", "attempt-2")).not.toBeNull();
  });

  test("fails closed when persistence is unavailable", () => {
    const storage = {
      getItem: () => "[]",
      setItem: () => {
        throw new DOMException("quota", "QuotaExceededError");
      },
    };
    expect(
      writeQueuedTurnsForAttempt(
        {
          chatId: "chat-a",
          attemptId: "attempt-1",
          items: [queuedItem("a1")],
        },
        storage,
      ),
    ).toBeNull();
  });

  test("does not evict unfinished entries at capacity", () => {
    for (let index = 0; index < 64; index += 1) {
      expect(
        writeQueuedTurnsForAttempt({
          chatId: `chat-${index}`,
          attemptId: "attempt-1",
          items: [queuedItem(`queue-${index}`)],
        }),
      ).not.toBeNull();
    }
    expect(
      writeQueuedTurnsForAttempt({
        chatId: "chat-overflow",
        attemptId: "attempt-1",
        items: [queuedItem("overflow")],
      }),
    ).toBeNull();
    expect(readQueuedTurnOutbox()).toHaveLength(64);
    expect(readQueuedTurnsForAttempt("chat-0", "attempt-1")).not.toBeNull();
  });

  test("persists a pre-identity client operation and atomically binds it to the returned attempt", () => {
    writeQueuedTurnsForClientOperation({
      chatId: "chat-a",
      clientOperationId: "queue-op-1",
      items: [queuedItem("preidentity", "survive reload")],
    });
    writePendingClarify({
      chatId: "chat-a",
      clientOperationId: "queue-op-1",
      id: "clarify-1",
      text: "pick a channel later",
    });

    expect(
      bindQueuedTurnOwnersToAttempt({
        chatId: "chat-a",
        targetAttemptId: "attempt-1",
        clientOperationIds: ["queue-op-1"],
      }),
    ).toEqual(
      expect.objectContaining({
        queue: expect.objectContaining({ attemptId: "attempt-1" }),
        clarifies: [expect.objectContaining({ sourceAttemptId: "attempt-1" })],
      }),
    );
    expect(
      readQueuedTurnsForClientOperation("chat-a", "queue-op-1"),
    ).toBeNull();
    expect(readQueuedTurnsForAttempt("chat-a", "attempt-1")?.items).toEqual([
      queuedItem("preidentity", "survive reload"),
    ]);
    expect(readPendingClarifyForChat("chat-a")).toEqual(
      expect.objectContaining({
        id: "clarify-1",
        sourceAttemptId: "attempt-1",
      }),
    );
  });

  test("leaves client ownership unchanged when an atomic bind cannot write", () => {
    let rawValue = null;
    let failWrites = false;
    const storage = {
      getItem: () => rawValue,
      setItem: (_key, value) => {
        if (failWrites) throw new DOMException("quota", "QuotaExceededError");
        rawValue = value;
      },
    };
    writeQueuedTurnsForClientOperation(
      {
        chatId: "chat-a",
        clientOperationId: "queue-op-1",
        items: [queuedItem("preidentity", "survive failed bind")],
      },
      storage,
    );
    const beforeBind = rawValue;
    failWrites = true;

    expect(
      bindQueuedTurnOwnersToAttempt(
        {
          chatId: "chat-a",
          targetAttemptId: "attempt-1",
          clientOperationIds: ["queue-op-1"],
        },
        storage,
      ),
    ).toBeNull();
    expect(rawValue).toBe(beforeBind);
    expect(
      readQueuedTurnsForClientOperation("chat-a", "queue-op-1", storage),
    ).not.toBeNull();
    expect(
      readQueuedTurnsForAttempt("chat-a", "attempt-1", storage),
    ).toBeNull();
  });

  test("moves a parent attempt remainder to its successor without leaving stale ownership", () => {
    writeQueuedTurnsForAttempt({
      chatId: "chat-a",
      attemptId: "attempt-parent",
      items: [
        queuedItem("consumed", "already relayed", "relayed"),
        queuedItem("remainder", "belongs to successor"),
      ],
    });

    const bound = bindQueuedTurnOwnersToAttempt({
      chatId: "chat-a",
      sourceAttemptId: "attempt-parent",
      targetAttemptId: "attempt-successor",
      items: [queuedItem("remainder", "belongs to successor")],
    });

    expect(bound?.queue?.items).toEqual([
      queuedItem("remainder", "belongs to successor"),
    ]);
    expect(
      readQueuedTurnsForAttempt("chat-a", "attempt-parent"),
    ).toBeNull();
    expect(
      readQueuedTurnsForAttempt("chat-a", "attempt-successor")?.items,
    ).toEqual([queuedItem("remainder", "belongs to successor")]);
  });

  test("falls a durable clarify back to its exact queue in one state write", () => {
    writePendingClarify({
      chatId: "chat-a",
      sourceAttemptId: "attempt-1",
      id: "clarify-1",
      text: "keep this question",
    });

    expect(
      fallbackPendingClarifyToQueue({
        chatId: "chat-a",
        id: "clarify-1",
      }),
    ).toEqual(
      expect.objectContaining({
        queue: expect.objectContaining({
          chatId: "chat-a",
          attemptId: "attempt-1",
          items: [queuedItem("clarify-1", "keep this question")],
        }),
      }),
    );
    expect(readPendingClarifyForChat("chat-a")).toBeNull();
  });

  test("rejects a 65th item without truncating the durable snapshot", () => {
    const first64 = Array.from({ length: 64 }, (_unused, index) =>
      queuedItem(`queue-${index}`),
    );
    expect(
      writeQueuedTurnsForAttempt({
        chatId: "chat-a",
        attemptId: "attempt-1",
        items: first64,
      }),
    ).not.toBeNull();

    expect(
      writeQueuedTurnsForAttempt({
        chatId: "chat-a",
        attemptId: "attempt-1",
        items: [...first64, queuedItem("overflow")],
      }),
    ).toBeNull();
    expect(readQueuedTurnsForAttempt("chat-a", "attempt-1")?.items).toEqual(
      first64,
    );
  });

  test("atomically migrates pending FYIs into the exact attempt queue", () => {
    writeQueuedTurnsForAttempt({
      chatId: "chat-a",
      attemptId: "attempt-1",
      items: [queuedItem("queue-1", "already queued")],
    });
    writePendingFyi({
      chatId: "chat-a",
      attemptId: "attempt-1",
      messageId: "fyi-1",
      text: "do not lose this FYI",
      requestedChannel: "fyi",
      threadId: "thread-a",
    });

    const migrated = migratePendingFyiForAttemptToQueue(
      "chat-a",
      "attempt-1",
    );

    expect(migrated?.queue?.items).toEqual([
      queuedItem("queue-1", "already queued"),
      queuedItem("fyi-1", "do not lose this FYI"),
    ]);
    expect(readPendingFyisForAttempt("chat-a", "attempt-1")).toEqual([]);
  });

  test("migrates only the addressed FYI and leaves siblings pending", () => {
    for (const [messageId, text] of [
      ["fyi-1", "first"],
      ["fyi-2", "second"],
    ]) {
      writePendingFyi({
        chatId: "chat-a",
        attemptId: "attempt-1",
        messageId,
        text,
        requestedChannel: "auto",
        threadId: "thread-a",
      });
    }

    const migrated = migratePendingFyiToQueue({
      chatId: "chat-a",
      attemptId: "attempt-1",
      messageId: "fyi-1",
    });

    expect(migrated?.queue?.items).toEqual([queuedItem("fyi-1", "first")]);
    expect(readPendingFyisForAttempt("chat-a", "attempt-1")).toEqual([
      expect.objectContaining({ messageId: "fyi-2", text: "second" }),
    ]);
  });

  test("removes only pending FYIs owned by the exact stopped attempt", () => {
    for (const [attemptId, messageId] of [
      ["attempt-1", "fyi-1"],
      ["attempt-1", "fyi-2"],
      ["attempt-2", "fyi-3"],
    ]) {
      writePendingFyi({
        chatId: "chat-a",
        attemptId,
        messageId,
        text: messageId,
        requestedChannel: "fyi",
        threadId: "thread-a",
      });
    }

    expect(removePendingFyisForAttempt("chat-a", "attempt-1")).toBe(true);
    expect(readPendingFyisForAttempt("chat-a", "attempt-1")).toEqual([]);
    expect(readPendingFyisForAttempt("chat-a", "attempt-2")).toEqual([
      expect.objectContaining({ messageId: "fyi-3" }),
    ]);
  });

  test("an injected FYI removes both its pending intent and queued fallback", () => {
    writePendingFyi({
      chatId: "chat-a",
      attemptId: "attempt-1",
      messageId: "fyi-1",
      text: "inject me once",
      requestedChannel: "fyi",
      threadId: "thread-a",
    });
    migratePendingFyiToQueue({
      chatId: "chat-a",
      attemptId: "attempt-1",
      messageId: "fyi-1",
    });

    expect(
      resolvePendingFyiIntent({
        chatId: "chat-a",
        attemptId: "attempt-1",
        messageId: "fyi-1",
      }),
    ).toEqual(expect.objectContaining({ removedQueuedFallback: true }));
    expect(readQueuedTurnsForAttempt("chat-a", "attempt-1")).toBeNull();
    expect(readPendingFyisForAttempt("chat-a", "attempt-1")).toEqual([]);
  });

  test("atomically converts one auto-routed FYI intent into a clarify", () => {
    writePendingFyi({
      chatId: "chat-a",
      attemptId: "attempt-1",
      messageId: "fyi-1",
      text: "which route?",
      requestedChannel: "auto",
      threadId: "thread-a",
    });

    expect(
      convertPendingFyiToClarify({
        chatId: "chat-a",
        attemptId: "attempt-1",
        messageId: "fyi-1",
        clarifyId: "clarify-1",
      }),
    ).toEqual(
      expect.objectContaining({
        chatId: "chat-a",
        sourceAttemptId: "attempt-1",
        id: "clarify-1",
        text: "which route?",
      }),
    );
    expect(readPendingFyisForAttempt("chat-a", "attempt-1")).toEqual([]);
    expect(readPendingClarifyForChat("chat-a")).toEqual(
      expect.objectContaining({ id: "clarify-1" }),
    );
  });

  test.each([
    ["fyi", "sourceAttemptId", "attempt-1"],
    ["btw", "clientOperationId", "queue-op-1"],
  ])(
    "atomically transitions a durable clarify to one pending %s in one read and write",
    (requestedChannel, ownerField, ownerId) => {
      const state = createCountingStorage(
        pendingClarifyState({
          clarifies: [
            {
              chatId: "chat-a",
              [ownerField]: ownerId,
              id: "clarify-1",
              text: "durable clarify text",
              updatedAt: 10,
            },
          ],
        }),
      );

      expect(
        transitionPendingClarifyToPendingFyi(
          {
            chatId: " chat-a ",
            clarifyId: " clarify-1 ",
            attemptId: ` ${ownerId} `,
            messageId: " message-1 ",
            requestedChannel,
            threadId: " thread-a ",
          },
          state.storage,
        ),
      ).toEqual(
        expect.objectContaining({
          chatId: "chat-a",
          attemptId: ownerId,
          messageId: "message-1",
          text: "durable clarify text",
          requestedChannel,
          threadId: "thread-a",
        }),
      );
      expect(state.getReadCount()).toBe(1);
      expect(state.getWriteCount()).toBe(1);
      const persisted = JSON.parse(state.getRawValue());
      expect(persisted.clarifies).toEqual([]);
      expect(persisted.fyis).toEqual([
        expect.objectContaining({
          chatId: "chat-a",
          attemptId: ownerId,
          messageId: "message-1",
          text: "durable clarify text",
          requestedChannel,
          threadId: "thread-a",
        }),
      ]);
    },
  );

  test.each([
    ["wrong owner", { attemptId: "attempt-other" }],
    ["wrong clarify id", { clarifyId: "clarify-other" }],
    ["invalid channel", { requestedChannel: "auto" }],
    ["missing message id", { messageId: "" }],
    ["missing thread id", { threadId: "" }],
  ])("rejects %s without writing", (_label, override) => {
    const state = createCountingStorage(
      pendingClarifyState({
        clarifies: [
          {
            chatId: "chat-a",
            clientOperationId: "client-owner-1",
            id: "clarify-1",
            text: "keep durable",
            updatedAt: 10,
          },
        ],
      }),
    );
    const before = state.getRawValue();

    expect(
      transitionPendingClarifyToPendingFyi(
        {
          chatId: "chat-a",
          clarifyId: "clarify-1",
          attemptId: "client-owner-1",
          messageId: "message-1",
          requestedChannel: "fyi",
          threadId: "thread-a",
          ...override,
        },
        state.storage,
      ),
    ).toBeNull();
    expect(state.getWriteCount()).toBe(0);
    expect(state.getRawValue()).toBe(before);
  });

  test("rejects FYI capacity overflow without removing the clarify", () => {
    const fyis = Array.from({ length: 64 }, (_unused, index) => ({
      chatId: "other-chat",
      attemptId: "other-attempt",
      messageId: `existing-${index}`,
      text: `existing ${index}`,
      requestedChannel: "fyi",
      threadId: "thread-other",
      updatedAt: index,
    }));
    const state = createCountingStorage(
      pendingClarifyState({
        clarifies: [
          {
            chatId: "chat-a",
            sourceAttemptId: "attempt-1",
            id: "clarify-1",
            text: "keep durable",
            updatedAt: 100,
          },
        ],
        fyis,
      }),
    );
    const before = state.getRawValue();

    expect(
      transitionPendingClarifyToPendingFyi(
        {
          chatId: "chat-a",
          clarifyId: "clarify-1",
          attemptId: "attempt-1",
          messageId: "message-1",
          requestedChannel: "fyi",
          threadId: "thread-a",
        },
        state.storage,
      ),
    ).toBeNull();
    expect(state.getWriteCount()).toBe(0);
    expect(state.getRawValue()).toBe(before);
  });

  test("rejects an existing FYI identity and a duplicate transition without writing", () => {
    const clarify = {
      chatId: "chat-a",
      sourceAttemptId: "attempt-1",
      id: "clarify-1",
      text: "keep durable",
      updatedAt: 10,
    };
    const existingFyi = {
      chatId: "chat-a",
      attemptId: "attempt-1",
      messageId: "message-1",
      text: "existing intent",
      requestedChannel: "fyi",
      threadId: "thread-a",
      updatedAt: 11,
    };
    const conflictState = createCountingStorage(
      pendingClarifyState({ clarifies: [clarify], fyis: [existingFyi] }),
    );
    const params = {
      chatId: "chat-a",
      clarifyId: "clarify-1",
      attemptId: "attempt-1",
      messageId: "message-1",
      requestedChannel: "fyi",
      threadId: "thread-a",
    };

    expect(
      transitionPendingClarifyToPendingFyi(params, conflictState.storage),
    ).toBeNull();
    expect(conflictState.getWriteCount()).toBe(0);

    const duplicateState = createCountingStorage(
      pendingClarifyState({ clarifies: [clarify] }),
    );
    expect(
      transitionPendingClarifyToPendingFyi(params, duplicateState.storage),
    ).not.toBeNull();
    const afterFirstTransition = duplicateState.getRawValue();
    expect(duplicateState.getWriteCount()).toBe(1);
    expect(
      transitionPendingClarifyToPendingFyi(params, duplicateState.storage),
    ).toBeNull();
    expect(duplicateState.getWriteCount()).toBe(1);
    expect(duplicateState.getRawValue()).toBe(afterFirstTransition);
  });

  test("keeps the durable clarify unchanged when the atomic write throws", () => {
    const state = createCountingStorage(
      pendingClarifyState({
        clarifies: [
          {
            chatId: "chat-a",
            sourceAttemptId: "attempt-1",
            id: "clarify-1",
            text: "keep durable",
            updatedAt: 10,
          },
        ],
      }),
      { throwOnWrite: true },
    );
    const before = state.getRawValue();

    expect(
      transitionPendingClarifyToPendingFyi(
        {
          chatId: "chat-a",
          clarifyId: "clarify-1",
          attemptId: "attempt-1",
          messageId: "message-1",
          requestedChannel: "btw",
          threadId: "thread-a",
        },
        state.storage,
      ),
    ).toBeNull();
    expect(state.getWriteCount()).toBe(1);
    expect(state.getRawValue()).toBe(before);
  });

  test("leaves pending FYI storage unchanged when atomic migration cannot write", () => {
    let rawValue = null;
    let failWrites = false;
    const storage = {
      getItem: () => rawValue,
      setItem: (_key, value) => {
        if (failWrites) throw new DOMException("quota", "QuotaExceededError");
        rawValue = value;
      },
    };
    writePendingFyi(
      {
        chatId: "chat-a",
        attemptId: "attempt-1",
        messageId: "fyi-1",
        text: "keep durable",
        requestedChannel: "fyi",
        threadId: "thread-a",
      },
      storage,
    );
    const beforeMigration = rawValue;
    failWrites = true;

    expect(
      migratePendingFyiForAttemptToQueue(
        "chat-a",
        "attempt-1",
        storage,
      ),
    ).toBeNull();
    expect(rawValue).toBe(beforeMigration);
    expect(readPendingFyisForAttempt("chat-a", "attempt-1", storage)).toEqual([
      expect.objectContaining({ messageId: "fyi-1", text: "keep durable" }),
    ]);
  });

  test("keeps pending FYIs when their exact queue is already at capacity", () => {
    const first64 = Array.from({ length: 64 }, (_unused, index) =>
      queuedItem(`queue-${index}`),
    );
    writeQueuedTurnsForAttempt({
      chatId: "chat-a",
      attemptId: "attempt-1",
      items: first64,
    });
    writePendingFyi({
      chatId: "chat-a",
      attemptId: "attempt-1",
      messageId: "fyi-overflow",
      text: "keep pending",
      requestedChannel: "fyi",
      threadId: "thread-a",
    });

    expect(
      migratePendingFyiForAttemptToQueue("chat-a", "attempt-1"),
    ).toBeNull();
    expect(readQueuedTurnsForAttempt("chat-a", "attempt-1")?.items).toEqual(
      first64,
    );
    expect(readPendingFyisForAttempt("chat-a", "attempt-1")).toEqual([
      expect.objectContaining({ messageId: "fyi-overflow" }),
    ]);
  });
});

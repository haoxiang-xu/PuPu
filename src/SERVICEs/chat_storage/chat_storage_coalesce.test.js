/** @jest-environment jsdom */

// V3 ops world: writeStore no longer persists the whole store over IPC.
// Same-tick mutations coalesce into ONE applyOps (ops deduped by
// (type, chatId), last write wins) + ONE emit after the microtask flush.

describe("chat_storage microtask coalescing (IPC ops path)", () => {
  let bridgeApplyOps;
  let bridgeApplyOpsSync;
  let bridgeWrite;

  const getOps = (payload) =>
    Array.isArray(payload) ? payload : payload?.ops || [];

  const setupIpcBridge = () => {
    bridgeApplyOps = jest.fn();
    bridgeApplyOpsSync = jest.fn();
    bridgeWrite = jest.fn();
    window.chatStorageAPI = {
      bootstrap: () => null,
      write: bridgeWrite,
      readMessages: () => [],
      applyOps: bridgeApplyOps,
      applyOpsSync: bridgeApplyOpsSync,
    };
  };

  beforeEach(() => {
    jest.resetModules();
    window.localStorage.clear();
    delete window.chatStorageAPI;
    setupIpcBridge();
  });

  afterEach(() => {
    delete window.chatStorageAPI;
  });

  test("N sequential mutations produce 1 applyOps + 1 emit after microtask flush", async () => {
    const store = require("./chat_storage_store");

    // Trigger bootstrap seed (persists once via the "empty bootstrap" whole-store write)
    store.getChatsStore();
    expect(bridgeWrite).toHaveBeenCalledTimes(1);
    bridgeApplyOps.mockClear();

    const listener = jest.fn();
    const unsubscribe = store.subscribeChatsStore(listener);

    const a = store.createChatInSelectedContext({ title: "A" }, { source: "test" });
    const b = store.createChatInSelectedContext({ title: "B" }, { source: "test" });
    const c = store.createChatInSelectedContext({ title: "C" }, { source: "test" });

    // Before microtask: no ops sent, no emit
    expect(bridgeApplyOps).toHaveBeenCalledTimes(0);
    expect(listener).toHaveBeenCalledTimes(0);

    await Promise.resolve();

    expect(bridgeApplyOps).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);

    // The single applyOps batch carries each created chat's meta once and
    // exactly one tree meta (the latest one). Titled chats are not transient,
    // so nothing is cleaned up/deleted.
    const [payload] = bridgeApplyOps.mock.calls[0];
    const ops = getOps(payload);
    const metaIds = ops
      .filter((op) => op.type === "put_chat_meta")
      .map((op) => op.chatId);
    expect(metaIds).toEqual(
      expect.arrayContaining([a.chatId, b.chatId, c.chatId]),
    );
    expect(ops.filter((op) => op.type === "put_tree_meta")).toHaveLength(1);
    expect(ops.some((op) => op.type === "delete_chats")).toBe(false);

    // The single emit carries the latest store (all three chats exist)
    const [emittedStore, emittedEvent] = listener.mock.calls[0];
    const titles = Object.values(emittedStore.chatsById).map((chat) => chat.title);
    expect(titles).toEqual(expect.arrayContaining(["A", "B", "C"]));

    // Task 2 (spec §2): the coalesced emit carries the UNION dirty of all
    // same-tick writes — all three created chat ids, no deletions, and the
    // tree/active flags reflect the tick's real changes.
    expect(emittedEvent.dirty).toBeDefined();
    expect(emittedEvent.dirty.chatIds).toEqual(
      expect.arrayContaining([a.chatId, b.chatId, c.chatId]),
    );
    expect(emittedEvent.dirty.deletedChatIds).toEqual([]);
    expect(emittedEvent.dirty.treeChanged).toBe(true);
    expect(emittedEvent.dirty.activeChanged).toBe(true);

    unsubscribe();
  });

  test("flushStoreEmitSync forces immediate applyOps and emit", () => {
    const store = require("./chat_storage_store");
    store.getChatsStore();
    bridgeApplyOps.mockClear();

    const listener = jest.fn();
    store.subscribeChatsStore(listener);

    const created = store.createChatInSelectedContext(
      { title: "A" },
      { source: "test" },
    );
    expect(bridgeApplyOps).toHaveBeenCalledTimes(0);
    expect(listener).toHaveBeenCalledTimes(0);

    store.flushStoreEmitSync();

    expect(bridgeApplyOpsSync).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
    // Task 2: the sync-flushed emit carries the same dirty shape.
    const [, event] = listener.mock.calls[0];
    expect(event.dirty).toBeDefined();
    expect(event.dirty.chatIds).toContain(created.chatId);
    expect(event.dirty.deletedChatIds).toEqual([]);
    expect(event.dirty.treeChanged).toBe(true);
    expect(event.dirty.activeChanged).toBe(true);
  });

  test("database-locked unload batch is journalled and retried exactly", () => {
    const lockError = new Error("database is locked");
    bridgeApplyOpsSync
      .mockImplementationOnce(() => {
        throw lockError;
      })
      .mockImplementation(() => true);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const store = require("./chat_storage_store");
    store.getChatsStore();
    bridgeApplyOpsSync.mockClear();

    try {
      const created = store.createChatInSelectedContext(
        { title: "Survives lock" },
        { source: "test" },
      );

      // SQL failed, but the bounded local recovery journal is durable, so
      // shutdown may proceed without losing this batch.
      expect(store.flushStoreEmitSync()).toBe(true);
      expect(bridgeApplyOpsSync).toHaveBeenCalledTimes(1);
      const failedBatch = bridgeApplyOpsSync.mock.calls[0][0];
      expect(
        getOps(failedBatch).some(
          (op) => op.type === "put_chat_meta" && op.chatId === created.chatId,
        ),
      ).toBe(true);

      // Releasing the simulated lock and flushing again retries the exact
      // failed transaction rather than silently discarding it.
      expect(store.flushStoreEmitSync()).toBe(true);
      expect(bridgeApplyOpsSync).toHaveBeenCalledTimes(2);
      expect(bridgeApplyOpsSync.mock.calls[1][0]).toEqual(failedBatch);
    } finally {
      errorSpy.mockRestore();
    }
  });

  test("first async dispatch has a full write-ahead journal before its ack", async () => {
    let resolveFirstAck;
    const journalsAtDispatch = [];
    const { PENDING_OPS_JOURNAL_KEY } = require("./chat_storage_backend");
    bridgeApplyOps.mockImplementation((ops) => {
      journalsAtDispatch.push(
        window.localStorage.getItem(PENDING_OPS_JOURNAL_KEY),
      );
      if (bridgeApplyOps.mock.calls.length === 1) {
        return new Promise((resolve) => {
          resolveFirstAck = resolve;
        });
      }
      return true;
    });
    const store = require("./chat_storage_store");
    store.getChatsStore();
    bridgeApplyOps.mockClear();

    const created = store.createChatInSelectedContext(
      { title: "Write ahead" },
      { source: "test" },
    );
    await Promise.resolve();

    expect(bridgeApplyOps).toHaveBeenCalledTimes(1);
    const dispatchedBatch = bridgeApplyOps.mock.calls[0][0];
    expect(JSON.parse(journalsAtDispatch[0])).toEqual([dispatchedBatch]);
    expect(
      getOps(dispatchedBatch).some(
        (op) => op.type === "put_chat_meta" && op.chatId === created.chatId,
      ),
    ).toBe(true);

    // A later generation created while the first invoke is unacknowledged is
    // added to the full journal immediately, even though it cannot dispatch.
    const second = store.createChatInSelectedContext(
      { title: "Second generation" },
      { source: "test" },
    );
    await Promise.resolve();
    expect(bridgeApplyOps).toHaveBeenCalledTimes(1);
    const queuedJournal = JSON.parse(
      window.localStorage.getItem(PENDING_OPS_JOURNAL_KEY),
    );
    expect(queuedJournal).toHaveLength(2);
    expect(
      getOps(queuedJournal[1]).some(
        (op) => op.type === "put_chat_meta" && op.chatId === second.chatId,
      ),
    ).toBe(true);

    resolveFirstAck(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(bridgeApplyOps).toHaveBeenCalledTimes(2);
    expect(JSON.parse(journalsAtDispatch[1])).toEqual([
      bridgeApplyOps.mock.calls[1][0],
    ]);
    expect(window.localStorage.getItem(PENDING_OPS_JOURNAL_KEY)).toBeNull();
  });

  test("localStorage-unavailable first write sync-commits immediately", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const storageSpy = jest
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("localStorage unavailable");
      });
    const store = require("./chat_storage_store");
    store.getChatsStore();
    bridgeApplyOps.mockClear();

    try {
      store.createChatInSelectedContext(
        { title: "Wait for journal" },
        { source: "test" },
      );
      await Promise.resolve();
      expect(bridgeApplyOps).not.toHaveBeenCalled();
      expect(bridgeApplyOpsSync).toHaveBeenCalledTimes(1);
    } finally {
      storageSpy.mockRestore();
      expect(store.flushStoreEmitSync()).toBe(true);
      errorSpy.mockRestore();
    }
  });

  test("oversized first journal batch sync-commits instead of deadlocking autosave", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const store = require("./chat_storage_store");
    const { PENDING_OPS_JOURNAL_KEY } = require("./chat_storage_backend");
    const activeChatId = store.getChatsStore().activeChatId;
    bridgeApplyOps.mockClear();
    bridgeApplyOpsSync.mockClear();

    try {
      store.setChatMessages(
        activeChatId,
        Array.from({ length: 22 }, (_unused, index) => ({
          id: `oversized-${index}`,
          role: "user",
          content: "x".repeat(100000),
        })),
        { source: "test" },
      );
      await Promise.resolve();

      expect(bridgeApplyOps).not.toHaveBeenCalled();
      expect(bridgeApplyOpsSync).toHaveBeenCalledTimes(1);
      const guardedBatch = bridgeApplyOpsSync.mock.calls[0][0];
      expect(guardedBatch.guard.sequence).toBe(1);
      expect(
        getOps(guardedBatch).some(
          (op) =>
            op.type === "put_messages" &&
            op.chatId === activeChatId &&
            op.messages.length === 22,
        ),
      ).toBe(true);
      expect(window.localStorage.getItem(PENDING_OPS_JOURNAL_KEY)).toBeNull();
    } finally {
      errorSpy.mockRestore();
    }
  });

  test("SQL unload success can proceed while active journal cleanup retries", () => {
    const lockError = new Error("database is locked");
    bridgeApplyOpsSync
      .mockImplementationOnce(() => {
        throw lockError;
      })
      .mockImplementation(() => true);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const store = require("./chat_storage_store");
    const { PENDING_OPS_JOURNAL_KEY } = require("./chat_storage_backend");
    store.getChatsStore();
    bridgeApplyOpsSync.mockClear();

    try {
      store.createChatInSelectedContext(
        { title: "Journal clear gate" },
        { source: "test" },
      );

      // First unload cannot reach SQL, but the exact queue is journalled.
      expect(store.flushStoreEmitSync()).toBe(true);
      expect(window.localStorage.getItem(PENDING_OPS_JOURNAL_KEY)).not.toBeNull();

      const removeSpy = jest
        .spyOn(Storage.prototype, "removeItem")
        .mockImplementation(() => {
          throw new Error("localStorage temporarily unavailable");
        });
      try {
        // SQL is now durable, but allowing unload would leave a stale replay
        // source. Replaying it is idempotent, so DB success may allow unload.
        expect(store.flushStoreEmitSync()).toBe(true);
        expect(bridgeApplyOpsSync).toHaveBeenCalledTimes(2);

        // Empty queue still retries cleanup without reapplying SQL, but the
        // already committed DB remains a successful durability path.
        expect(store.flushStoreEmitSync()).toBe(true);
        expect(bridgeApplyOpsSync).toHaveBeenCalledTimes(2);
        expect(removeSpy).toHaveBeenCalledTimes(2);
      } finally {
        removeSpy.mockRestore();
      }

      expect(store.flushStoreEmitSync()).toBe(true);
      expect(window.localStorage.getItem(PENDING_OPS_JOURNAL_KEY)).toBeNull();
      expect(bridgeApplyOpsSync).toHaveBeenCalledTimes(2);
    } finally {
      errorSpy.mockRestore();
    }
  });

  test("SQL unload success wins when the initial journal write fails", () => {
    const store = require("./chat_storage_store");
    store.getChatsStore();
    bridgeApplyOpsSync.mockClear();
    const storageSpy = jest
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("quota exceeded");
      });
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      store.createChatInSelectedContext(
        { title: "SQL is enough" },
        { source: "test" },
      );
      expect(store.flushStoreEmitSync()).toBe(true);
      expect(bridgeApplyOpsSync).toHaveBeenCalledTimes(1);
    } finally {
      storageSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  test("a dirty guarded stale journal cannot block or regress later SQL", async () => {
    bridgeApplyOpsSync
      .mockImplementationOnce(() => {
        throw new Error("database is locked");
      })
      .mockImplementation(() => true);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const store = require("./chat_storage_store");
    const { PENDING_OPS_JOURNAL_KEY } = require("./chat_storage_backend");
    store.getChatsStore();
    bridgeApplyOps.mockClear();
    bridgeApplyOpsSync.mockClear();

    try {
      const first = store.createChatInSelectedContext(
        { title: "Old title" },
        { source: "test" },
      );
      expect(store.flushStoreEmitSync()).toBe(true);
      const staleJournal = window.localStorage.getItem(
        PENDING_OPS_JOURNAL_KEY,
      );
      expect(staleJournal).toContain(first.chatId);

      const setSpy = jest
        .spyOn(Storage.prototype, "setItem")
        .mockImplementation(() => {
          throw new Error("journal rewrite failed");
        });
      const removeSpy = jest
        .spyOn(Storage.prototype, "removeItem")
        .mockImplementation(() => {
          throw new Error("journal clear failed");
        });
      try {
        // The first generation commits to SQL, but its guarded physical
        // journal cannot be cleared.
        expect(store.flushStoreEmitSync()).toBe(true);
        store.setChatTitle(first.chatId, "New title", {
          source: "test",
        });
        await Promise.resolve();
        expect(bridgeApplyOps).not.toHaveBeenCalled();

        // Journal rewrite failure falls back to guarded sendSync immediately.
        // The old physical journal may remain, but main will skip its already
        // committed guard on restart instead of restoring "Old title".
        expect(bridgeApplyOpsSync).toHaveBeenCalledTimes(3);
        const newerBatch = bridgeApplyOpsSync.mock.calls[2][0];
        expect(
          getOps(newerBatch).some(
            (op) =>
              op.type === "put_chat_meta" &&
              op.chatId === first.chatId &&
              op.meta.title === "New title",
          ),
        ).toBe(true);
        expect(store.flushStoreEmitSync()).toBe(true);
        expect(bridgeApplyOpsSync).toHaveBeenCalledTimes(3);
        expect(window.localStorage.getItem(PENDING_OPS_JOURNAL_KEY)).toBe(
          staleJournal,
        );
      } finally {
        setSpy.mockRestore();
        removeSpy.mockRestore();
      }

      // Once localStorage recovers, the already committed guarded stale copy
      // is removed without another SQL write.
      expect(store.flushStoreEmitSync()).toBe(true);
      expect(bridgeApplyOpsSync).toHaveBeenCalledTimes(3);
      expect(window.localStorage.getItem(PENDING_OPS_JOURNAL_KEY)).toBeNull();
    } finally {
      errorSpy.mockRestore();
    }
  });

  test("beforeunload is cancelled when DB and recovery journal both fail", () => {
    const store = require("./chat_storage_store");
    store.getChatsStore();
    bridgeApplyOpsSync.mockImplementation(() => {
      throw new Error("database or disk is full");
    });
    const storageSpy = jest
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("quota exceeded");
      });
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      store.createChatInSelectedContext(
        { title: "Must not be dropped" },
        { source: "test" },
      );
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    } finally {
      storageSpy.mockRestore();
      bridgeApplyOpsSync.mockImplementation(() => true);
      store.flushStoreEmitSync();
      errorSpy.mockRestore();
    }
  });

  test("async lock failure retries with the original ordered batch", async () => {
    jest.useFakeTimers();
    const lockError = new Error("database is locked");
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const store = require("./chat_storage_store");
    store.getChatsStore();
    bridgeApplyOps.mockClear();
    bridgeApplyOps
      .mockRejectedValueOnce(lockError)
      .mockResolvedValue(true);

    try {
      store.createChatInSelectedContext(
        { title: "Async retry" },
        { source: "test" },
      );
      // Modern fake timers also virtualize queueMicrotask.
      jest.advanceTimersByTime(0);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      const failedBatch = bridgeApplyOps.mock.calls[0][0];
      expect(bridgeApplyOps).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(250);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(bridgeApplyOps).toHaveBeenCalledTimes(2);
      expect(bridgeApplyOps.mock.calls[1][0]).toEqual(failedBatch);
    } finally {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
      errorSpy.mockRestore();
    }
  });

  test.each(["resolve", "reject"])(
    "late async %s cannot remove a newer head after sync fallback",
    async (outcome) => {
      let resolveFirst;
      let rejectFirst;
      bridgeApplyOps
        .mockImplementationOnce(
          () =>
            new Promise((resolve, reject) => {
              resolveFirst = resolve;
              rejectFirst = reject;
            }),
        )
        .mockResolvedValue(true);
      const errorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const store = require("./chat_storage_store");
      store.getChatsStore();
      bridgeApplyOps.mockClear();
      bridgeApplyOpsSync.mockClear();

      try {
        store.createChatInSelectedContext(
          { title: "In flight" },
          { source: "test" },
        );
        await Promise.resolve();
        expect(bridgeApplyOps).toHaveBeenCalledTimes(1);
        const firstPayload = bridgeApplyOps.mock.calls[0][0];

        const setSpy = jest
          .spyOn(Storage.prototype, "setItem")
          .mockImplementation(() => {
            throw new Error("journal quota exceeded");
          });
        try {
          store.createChatInSelectedContext(
            { title: "Sync fallback" },
            { source: "test" },
          );
          await Promise.resolve();
        } finally {
          setSpy.mockRestore();
        }

        expect(bridgeApplyOpsSync).toHaveBeenCalledTimes(2);
        expect(bridgeApplyOpsSync.mock.calls[0][0]).toEqual(firstPayload);

        const newest = store.createChatInSelectedContext(
          { title: "Newest head" },
          { source: "test" },
        );
        await Promise.resolve();
        expect(bridgeApplyOps).toHaveBeenCalledTimes(1);

        if (outcome === "resolve") {
          resolveFirst(true);
        } else {
          rejectFirst(new Error("late async rejection"));
        }
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(bridgeApplyOps).toHaveBeenCalledTimes(2);
        const newestPayload = bridgeApplyOps.mock.calls[1][0];
        expect(newestPayload.guard.sequence).toBeGreaterThan(
          firstPayload.guard.sequence,
        );
        expect(
          getOps(newestPayload).some(
            (op) =>
              op.type === "put_chat_meta" && op.chatId === newest.chatId,
          ),
        ).toBe(true);
      } finally {
        errorSpy.mockRestore();
      }
    },
  );

  test("partial sync fallback dequeues only the committed prefix", async () => {
    let resolveFirst;
    bridgeApplyOps.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );
    bridgeApplyOpsSync
      .mockImplementationOnce(() => true)
      .mockImplementationOnce(() => {
        throw new Error("second sync transaction failed");
      })
      .mockImplementation(() => true);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const store = require("./chat_storage_store");
    store.getChatsStore();
    bridgeApplyOps.mockClear();
    bridgeApplyOpsSync.mockClear();

    try {
      store.createChatInSelectedContext(
        { title: "Committed prefix" },
        { source: "test" },
      );
      await Promise.resolve();
      expect(bridgeApplyOps).toHaveBeenCalledTimes(1);

      const setSpy = jest
        .spyOn(Storage.prototype, "setItem")
        .mockImplementation(() => {
          throw new Error("journal rewrite failed");
        });
      try {
        store.createChatInSelectedContext(
          { title: "Uncommitted tail" },
          { source: "test" },
        );
        await Promise.resolve();
      } finally {
        setSpy.mockRestore();
      }

      expect(bridgeApplyOpsSync).toHaveBeenCalledTimes(2);
      const committedPrefix = bridgeApplyOpsSync.mock.calls[0][0];
      const failedTail = bridgeApplyOpsSync.mock.calls[1][0];
      expect(failedTail.guard.sequence).toBeGreaterThan(
        committedPrefix.guard.sequence,
      );

      expect(store.flushStoreEmitSync()).toBe(true);
      expect(bridgeApplyOpsSync).toHaveBeenCalledTimes(3);
      expect(bridgeApplyOpsSync.mock.calls[2][0]).toEqual(failedTail);
      expect(bridgeApplyOpsSync.mock.calls[2][0]).not.toEqual(
        committedPrefix,
      );

      resolveFirst(true);
      await Promise.resolve();
      await Promise.resolve();
      expect(store.flushStoreEmitSync()).toBe(true);
      expect(bridgeApplyOpsSync).toHaveBeenCalledTimes(3);
    } finally {
      errorSpy.mockRestore();
    }
  });

  test("memory mirror stays consistent for synchronous reads between mutations", async () => {
    const store = require("./chat_storage_store");
    store.getChatsStore();
    bridgeApplyOps.mockClear();

    const created = store.createChatInSelectedContext(
      { title: "Alpha" },
      { source: "test" },
    );
    // Immediate synchronous read must see the new chat (memoryStore is updated in writeStore)
    const snapshot = store.getChatsStore();
    expect(snapshot.chatsById[created.chatId]).toBeDefined();
    expect(snapshot.chatsById[created.chatId].title).toBe("Alpha");

    await Promise.resolve();
    expect(bridgeApplyOps).toHaveBeenCalledTimes(1);
  });
});

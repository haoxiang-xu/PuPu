/** @jest-environment jsdom */

// V3 ops world: writeStore no longer persists the whole store over IPC.
// Same-tick mutations coalesce into ONE applyOps (ops deduped by
// (type, chatId), last write wins) + ONE emit after the microtask flush.

describe("chat_storage microtask coalescing (IPC ops path)", () => {
  let bridgeApplyOps;
  let bridgeWrite;

  const setupIpcBridge = () => {
    bridgeApplyOps = jest.fn();
    bridgeWrite = jest.fn();
    window.chatStorageAPI = {
      bootstrap: () => null,
      write: bridgeWrite,
      readMessages: () => [],
      applyOps: bridgeApplyOps,
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
    const [ops] = bridgeApplyOps.mock.calls[0];
    const metaIds = ops
      .filter((op) => op.type === "put_chat_meta")
      .map((op) => op.chatId);
    expect(metaIds).toEqual(
      expect.arrayContaining([a.chatId, b.chatId, c.chatId]),
    );
    expect(ops.filter((op) => op.type === "put_tree_meta")).toHaveLength(1);
    expect(ops.some((op) => op.type === "delete_chats")).toBe(false);

    // The single emit carries the latest store (all three chats exist)
    const [emittedStore] = listener.mock.calls[0];
    const titles = Object.values(emittedStore.chatsById).map((chat) => chat.title);
    expect(titles).toEqual(expect.arrayContaining(["A", "B", "C"]));

    unsubscribe();
  });

  test("flushStoreEmitSync forces immediate applyOps and emit", () => {
    const store = require("./chat_storage_store");
    store.getChatsStore();
    bridgeApplyOps.mockClear();

    const listener = jest.fn();
    store.subscribeChatsStore(listener);

    store.createChatInSelectedContext({ title: "A" }, { source: "test" });
    expect(bridgeApplyOps).toHaveBeenCalledTimes(0);
    expect(listener).toHaveBeenCalledTimes(0);

    store.flushStoreEmitSync();

    expect(bridgeApplyOps).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
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

/** @jest-environment jsdom */

describe("chat_storage microtask coalescing (IPC path)", () => {
  let bridgeWrite;

  const setupIpcBridge = () => {
    bridgeWrite = jest.fn();
    window.chatStorageAPI = {
      bootstrap: () => null,
      write: bridgeWrite,
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

  test("N sequential mutations produce 1 persist + 1 emit after microtask flush", async () => {
    const store = require("./chat_storage_store");

    // Trigger bootstrap seed (persists once to IPC via the "empty bootstrap" branch)
    store.getChatsStore();
    bridgeWrite.mockClear();

    const listener = jest.fn();
    const unsubscribe = store.subscribeChatsStore(listener);

    store.createChatInSelectedContext({ title: "A" }, { source: "test" });
    store.createChatInSelectedContext({ title: "B" }, { source: "test" });
    store.createChatInSelectedContext({ title: "C" }, { source: "test" });

    // Before microtask: no persist, no emit
    expect(bridgeWrite).toHaveBeenCalledTimes(0);
    expect(listener).toHaveBeenCalledTimes(0);

    await Promise.resolve();

    expect(bridgeWrite).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);

    // The single emit carries the latest store (chat C exists)
    const [emittedStore] = listener.mock.calls[0];
    const titles = Object.values(emittedStore.chatsById).map((c) => c.title);
    expect(titles).toEqual(expect.arrayContaining(["A", "B", "C"]));

    unsubscribe();
  });

  test("flushStoreEmitSync forces immediate persist and emit", () => {
    const store = require("./chat_storage_store");
    store.getChatsStore();
    bridgeWrite.mockClear();

    const listener = jest.fn();
    store.subscribeChatsStore(listener);

    store.createChatInSelectedContext({ title: "A" }, { source: "test" });
    expect(bridgeWrite).toHaveBeenCalledTimes(0);
    expect(listener).toHaveBeenCalledTimes(0);

    store.flushStoreEmitSync();

    expect(bridgeWrite).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("memory mirror stays consistent for synchronous reads between mutations", async () => {
    const store = require("./chat_storage_store");
    store.getChatsStore();
    bridgeWrite.mockClear();

    const created = store.createChatInSelectedContext(
      { title: "Alpha" },
      { source: "test" },
    );
    // Immediate synchronous read must see the new chat (memoryStore is updated in writeStore)
    const snapshot = store.getChatsStore();
    expect(snapshot.chatsById[created.chatId]).toBeDefined();
    expect(snapshot.chatsById[created.chatId].title).toBe("Alpha");

    await Promise.resolve();
    expect(bridgeWrite).toHaveBeenCalledTimes(1);
  });
});

/** @jest-environment jsdom */

describe("chat_storage setter no-op guards", () => {
  let bridgeWrite;

  const setupIpcBridge = () => {
    bridgeWrite = jest.fn();
    window.chatStorageAPI = {
      bootstrap: () => null,
      write: bridgeWrite,
    };
  };

  const createChat = (store) => {
    const created = store.createChatInSelectedContext(
      { title: "Test" },
      { source: "test" },
    );
    return created.chatId;
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

  test("setChatSelectedToolkits with identical array is a no-op (no persist, no emit)", async () => {
    const store = require("./chat_storage_store");
    const chatId = createChat(store);
    store.setChatSelectedToolkits(chatId, ["core", "workspace_toolkit"], {
      source: "test",
    });
    await Promise.resolve();
    bridgeWrite.mockClear();
    const listener = jest.fn();
    store.subscribeChatsStore(listener);

    store.setChatSelectedToolkits(chatId, ["core", "workspace_toolkit"], {
      source: "test",
    });

    await Promise.resolve();
    expect(bridgeWrite).toHaveBeenCalledTimes(0);
    expect(listener).toHaveBeenCalledTimes(0);
  });

  test("setChatSelectedToolkits with different array persists + emits once", async () => {
    const store = require("./chat_storage_store");
    const chatId = createChat(store);
    store.setChatSelectedToolkits(chatId, ["core"], { source: "test" });
    await Promise.resolve();
    bridgeWrite.mockClear();
    const listener = jest.fn();
    store.subscribeChatsStore(listener);

    store.setChatSelectedToolkits(chatId, ["core", "workspace_toolkit"], {
      source: "test",
    });

    await Promise.resolve();
    expect(bridgeWrite).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
    const snapshot = store.getChatsStore();
    expect(snapshot.chatsById[chatId].selectedToolkits).toEqual([
      "core",
      "workspace_toolkit",
    ]);
  });

  test("setChatAgentOrchestration with same mode is a no-op", async () => {
    const store = require("./chat_storage_store");
    const chatId = createChat(store);
    store.setChatAgentOrchestration(
      chatId,
      { mode: "developer_waiting_approval" },
      { source: "test" },
    );
    await Promise.resolve();
    bridgeWrite.mockClear();
    const listener = jest.fn();
    store.subscribeChatsStore(listener);

    store.setChatAgentOrchestration(
      chatId,
      { mode: "developer_waiting_approval" },
      { source: "test" },
    );

    await Promise.resolve();
    expect(bridgeWrite).toHaveBeenCalledTimes(0);
    expect(listener).toHaveBeenCalledTimes(0);
  });

  test("setChatSelectedWorkspaceIds with same ids is a no-op", async () => {
    const store = require("./chat_storage_store");
    const chatId = createChat(store);
    store.setChatSelectedWorkspaceIds(chatId, ["ws-a", "ws-b"], {
      source: "test",
    });
    await Promise.resolve();
    bridgeWrite.mockClear();
    const listener = jest.fn();
    store.subscribeChatsStore(listener);

    store.setChatSelectedWorkspaceIds(chatId, ["ws-a", "ws-b"], {
      source: "test",
    });

    await Promise.resolve();
    expect(bridgeWrite).toHaveBeenCalledTimes(0);
    expect(listener).toHaveBeenCalledTimes(0);
  });

  test("updateChatDraft with same text + no attachments change is a no-op", async () => {
    const store = require("./chat_storage_store");
    const chatId = createChat(store);
    store.updateChatDraft(
      chatId,
      { text: "hello", attachments: [] },
      { source: "test" },
    );
    await Promise.resolve();
    bridgeWrite.mockClear();
    const listener = jest.fn();
    store.subscribeChatsStore(listener);

    store.updateChatDraft(
      chatId,
      { text: "hello", attachments: [] },
      { source: "test" },
    );

    await Promise.resolve();
    expect(bridgeWrite).toHaveBeenCalledTimes(0);
    expect(listener).toHaveBeenCalledTimes(0);
  });

  test("updateChatDraft with changed text persists + emits once", async () => {
    const store = require("./chat_storage_store");
    const chatId = createChat(store);
    store.updateChatDraft(
      chatId,
      { text: "hello", attachments: [] },
      { source: "test" },
    );
    await Promise.resolve();
    bridgeWrite.mockClear();
    const listener = jest.fn();
    store.subscribeChatsStore(listener);

    store.updateChatDraft(
      chatId,
      { text: "hello world", attachments: [] },
      { source: "test" },
    );

    await Promise.resolve();
    expect(bridgeWrite).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
    const snapshot = store.getChatsStore();
    expect(snapshot.chatsById[chatId].draft.text).toBe("hello world");
  });

  test("setChatSessionBundle with all fields unchanged is a no-op", async () => {
    const store = require("./chat_storage_store");
    const chatId = createChat(store);
    store.setChatSessionBundle(
      chatId,
      {
        selectedToolkits: ["core"],
        agentOrchestration: { mode: "default" },
        selectedWorkspaceIds: ["ws-a"],
      },
      { source: "test" },
    );
    await Promise.resolve();
    bridgeWrite.mockClear();
    const listener = jest.fn();
    store.subscribeChatsStore(listener);

    store.setChatSessionBundle(
      chatId,
      {
        selectedToolkits: ["core"],
        agentOrchestration: { mode: "default" },
        selectedWorkspaceIds: ["ws-a"],
      },
      { source: "test" },
    );

    await Promise.resolve();
    expect(bridgeWrite).toHaveBeenCalledTimes(0);
    expect(listener).toHaveBeenCalledTimes(0);
  });

  test("setChatSessionBundle with one field changed persists + emits once", async () => {
    const store = require("./chat_storage_store");
    const chatId = createChat(store);
    store.setChatSessionBundle(
      chatId,
      {
        selectedToolkits: ["core"],
        agentOrchestration: { mode: "default" },
        selectedWorkspaceIds: ["ws-a"],
      },
      { source: "test" },
    );
    await Promise.resolve();
    bridgeWrite.mockClear();
    const listener = jest.fn();
    store.subscribeChatsStore(listener);

    store.setChatSessionBundle(
      chatId,
      {
        selectedToolkits: ["core", "workspace_toolkit"],
        agentOrchestration: { mode: "default" },
        selectedWorkspaceIds: ["ws-a"],
      },
      { source: "test" },
    );

    await Promise.resolve();
    expect(bridgeWrite).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
    const snapshot = store.getChatsStore();
    expect(snapshot.chatsById[chatId].selectedToolkits).toEqual([
      "core",
      "workspace_toolkit",
    ]);
  });

  test("setChatSessionBundle writes multiple fields in a single batch", async () => {
    const store = require("./chat_storage_store");
    const chatId = createChat(store);
    await Promise.resolve();
    bridgeWrite.mockClear();
    const listener = jest.fn();
    store.subscribeChatsStore(listener);

    store.setChatSessionBundle(
      chatId,
      {
        selectedToolkits: ["core"],
        agentOrchestration: { mode: "developer_waiting_approval" },
        selectedWorkspaceIds: ["ws-a", "ws-b"],
      },
      { source: "test" },
    );

    await Promise.resolve();
    expect(bridgeWrite).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
    const snapshot = store.getChatsStore();
    expect(snapshot.chatsById[chatId].selectedToolkits).toEqual(["core"]);
    expect(snapshot.chatsById[chatId].agentOrchestration).toEqual({
      mode: "developer_waiting_approval",
    });
    expect(snapshot.chatsById[chatId].selectedWorkspaceIds).toEqual([
      "ws-a",
      "ws-b",
    ]);
  });
});

const { createChatStorageBridge } = require(
  "../../preload/bridges/chat_storage_bridge",
);
const { CHANNELS } = require("../../shared/channels");

const makeFakeIpcRenderer = ({ syncReturn } = {}) => ({
  sendSync: jest.fn(() => syncReturn),
  send: jest.fn(),
});

describe("chatStorageAPI bridge", () => {
  test("bootstrap performs a synchronous IPC call and returns the payload", () => {
    const syncReturn = { activeChatId: "x" };
    const ipcRenderer = makeFakeIpcRenderer({ syncReturn });
    const api = createChatStorageBridge(ipcRenderer);

    const snapshot = api.bootstrap();

    expect(ipcRenderer.sendSync).toHaveBeenCalledWith(
      CHANNELS.CHAT_STORAGE.BOOTSTRAP_READ,
    );
    expect(snapshot).toEqual(syncReturn);
  });

  test("bootstrap returns null when IPC yields nothing", () => {
    const ipcRenderer = makeFakeIpcRenderer({ syncReturn: undefined });
    const api = createChatStorageBridge(ipcRenderer);
    expect(api.bootstrap()).toBeNull();
  });

  test("write fires send (no round-trip)", () => {
    const ipcRenderer = makeFakeIpcRenderer();
    const api = createChatStorageBridge(ipcRenderer);
    const payload = { chatsById: {} };

    api.write(payload);

    expect(ipcRenderer.send).toHaveBeenCalledWith(
      CHANNELS.CHAT_STORAGE.WRITE,
      payload,
    );
  });

  test("write swallows errors from ipcRenderer.send", () => {
    const ipcRenderer = {
      sendSync: () => null,
      send: jest.fn(() => {
        throw new Error("boom");
      }),
    };
    const api = createChatStorageBridge(ipcRenderer);
    expect(() => api.write({})).not.toThrow();
  });

  test("readMessages performs a synchronous IPC call with the chatId", () => {
    const messages = [{ role: "assistant", content: "yo" }];
    const ipcRenderer = makeFakeIpcRenderer({ syncReturn: messages });
    const api = createChatStorageBridge(ipcRenderer);

    const result = api.readMessages("chat-7");

    expect(ipcRenderer.sendSync).toHaveBeenCalledWith(
      CHANNELS.CHAT_STORAGE.READ_MESSAGES,
      "chat-7",
    );
    expect(result).toEqual(messages);
  });

  test("readMessages returns [] when IPC yields null/undefined", () => {
    const ipcRenderer = makeFakeIpcRenderer({ syncReturn: null });
    const api = createChatStorageBridge(ipcRenderer);
    expect(api.readMessages("chat-7")).toEqual([]);

    const ipcRenderer2 = makeFakeIpcRenderer({ syncReturn: undefined });
    const api2 = createChatStorageBridge(ipcRenderer2);
    expect(api2.readMessages("chat-7")).toEqual([]);
  });

  test("readMessages returns [] when ipcRenderer.sendSync throws", () => {
    const ipcRenderer = {
      sendSync: jest.fn(() => {
        throw new Error("boom");
      }),
      send: jest.fn(),
    };
    const api = createChatStorageBridge(ipcRenderer);
    expect(api.readMessages("chat-7")).toEqual([]);
  });

  test("applyOps fires send (no round-trip)", () => {
    const ipcRenderer = makeFakeIpcRenderer();
    const api = createChatStorageBridge(ipcRenderer);
    const ops = [{ type: "put_messages", chatId: "c1", messages: [] }];

    api.applyOps(ops);

    expect(ipcRenderer.send).toHaveBeenCalledWith(
      CHANNELS.CHAT_STORAGE.APPLY_OPS,
      ops,
    );
  });

  test("applyOps swallows errors from ipcRenderer.send", () => {
    const ipcRenderer = {
      sendSync: () => null,
      send: jest.fn(() => {
        throw new Error("boom");
      }),
    };
    const api = createChatStorageBridge(ipcRenderer);
    expect(() => api.applyOps([])).not.toThrow();
  });

  test("bridge surface is exactly { bootstrap, write, readMessages, applyOps }", () => {
    const api = createChatStorageBridge(makeFakeIpcRenderer());
    expect(Object.keys(api).sort()).toEqual(
      ["applyOps", "bootstrap", "readMessages", "write"].sort(),
    );
  });
});

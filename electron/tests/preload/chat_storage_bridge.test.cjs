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
});

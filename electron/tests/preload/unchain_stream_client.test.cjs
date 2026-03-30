const { CHANNELS } = require("../../shared/channels");
const {
  createMisoStreamClient,
} = require("../../preload/stream/unchain_stream_client");

const createMockIpcRenderer = () => {
  const listeners = new Map();

  const getBucket = (channel) => {
    if (!listeners.has(channel)) {
      listeners.set(channel, new Set());
    }
    return listeners.get(channel);
  };

  return {
    send: jest.fn(),
    on: jest.fn((channel, listener) => {
      getBucket(channel).add(listener);
    }),
    removeListener: jest.fn((channel, listener) => {
      getBucket(channel).delete(listener);
    }),
    emit(channel, envelope) {
      getBucket(channel).forEach((listener) => listener({}, envelope));
    },
  };
};

describe("unchain stream preload client", () => {
  test("startStream forwards events and auto-cleans on done", () => {
    const ipcRenderer = createMockIpcRenderer();
    const client = createMisoStreamClient(ipcRenderer);
    const onMeta = jest.fn();
    const onToken = jest.fn();
    const onDone = jest.fn();

    const handle = client.startStream({ message: "hi" }, { onMeta, onToken, onDone });

    expect(typeof handle.requestId).toBe("string");
    expect(ipcRenderer.send).toHaveBeenCalledWith(CHANNELS.MISO.STREAM_START, {
      requestId: handle.requestId,
      payload: { message: "hi" },
    });
    expect(client.__debug.getActiveListenerCount()).toBe(1);

    ipcRenderer.emit(CHANNELS.MISO.STREAM_EVENT, {
      requestId: handle.requestId,
      event: "meta",
      data: { hello: "world" },
    });
    ipcRenderer.emit(CHANNELS.MISO.STREAM_EVENT, {
      requestId: handle.requestId,
      event: "token",
      data: { delta: "abc" },
    });
    ipcRenderer.emit(CHANNELS.MISO.STREAM_EVENT, {
      requestId: handle.requestId,
      event: "done",
      data: { ok: true },
    });

    expect(onMeta).toHaveBeenCalledWith({ hello: "world" });
    expect(onToken).toHaveBeenCalledWith("abc");
    expect(onDone).toHaveBeenCalledWith({ ok: true });
    expect(client.__debug.getActiveListenerCount()).toBe(0);
  });

  test("cancelStream ignores invalid ids and cancels active stream", () => {
    const ipcRenderer = createMockIpcRenderer();
    const client = createMisoStreamClient(ipcRenderer);

    client.cancelStream("");
    expect(ipcRenderer.send).not.toHaveBeenCalled();

    const handle = client.startStream({}, {});
    client.cancelStream(handle.requestId);

    expect(ipcRenderer.send).toHaveBeenLastCalledWith(CHANNELS.MISO.STREAM_CANCEL, {
      requestId: handle.requestId,
    });
    expect(client.__debug.getActiveListenerCount()).toBe(0);
  });

  test("startStreamV2 forwards frame events and maps cancelled done to error", () => {
    const ipcRenderer = createMockIpcRenderer();
    const client = createMisoStreamClient(ipcRenderer);
    const onFrame = jest.fn();
    const onMeta = jest.fn();
    const onToken = jest.fn();
    const onDone = jest.fn();
    const onError = jest.fn();

    const handle = client.startStreamV2(
      { message: "hi" },
      { onFrame, onMeta, onToken, onDone, onError },
    );

    ipcRenderer.emit(CHANNELS.MISO.STREAM_EVENT, {
      requestId: handle.requestId,
      event: "frame",
      data: {
        type: "stream_started",
        thread_id: "t-1",
        payload: { model: "gpt" },
      },
    });

    ipcRenderer.emit(CHANNELS.MISO.STREAM_EVENT, {
      requestId: handle.requestId,
      event: "frame",
      data: {
        type: "token_delta",
        payload: { delta: "xyz" },
      },
    });

    ipcRenderer.emit(CHANNELS.MISO.STREAM_EVENT, {
      requestId: handle.requestId,
      event: "done",
      data: { cancelled: true },
    });

    expect(onFrame).toHaveBeenCalled();
    expect(onMeta).toHaveBeenCalledWith({ thread_id: "t-1", model: "gpt" });
    expect(onToken).toHaveBeenCalledWith("xyz");
    expect(onDone).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith({
      code: "cancelled",
      message: "Stream was cancelled",
    });
    expect(client.__debug.getActiveListenerCount()).toBe(0);
  });
});

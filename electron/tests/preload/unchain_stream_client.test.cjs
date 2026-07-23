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
    invoke: jest.fn(),
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
    expect(ipcRenderer.send).toHaveBeenCalledWith(CHANNELS.UNCHAIN.STREAM_START, {
      requestId: handle.requestId,
      payload: { message: "hi" },
    });
    expect(client.__debug.getActiveListenerCount()).toBe(1);

    ipcRenderer.emit(CHANNELS.UNCHAIN.STREAM_EVENT, {
      requestId: handle.requestId,
      event: "meta",
      data: { hello: "world" },
    });
    ipcRenderer.emit(CHANNELS.UNCHAIN.STREAM_EVENT, {
      requestId: handle.requestId,
      event: "token",
      data: { delta: "abc" },
    });
    ipcRenderer.emit(CHANNELS.UNCHAIN.STREAM_EVENT, {
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

    expect(ipcRenderer.send).toHaveBeenLastCalledWith(CHANNELS.UNCHAIN.STREAM_CANCEL, {
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

    ipcRenderer.emit(CHANNELS.UNCHAIN.STREAM_EVENT, {
      requestId: handle.requestId,
      event: "frame",
      data: {
        type: "stream_started",
        thread_id: "t-1",
        payload: { model: "gpt" },
      },
    });

    ipcRenderer.emit(CHANNELS.UNCHAIN.STREAM_EVENT, {
      requestId: handle.requestId,
      event: "frame",
      data: {
        type: "token_delta",
        payload: { delta: "xyz" },
      },
    });

    ipcRenderer.emit(CHANNELS.UNCHAIN.STREAM_EVENT, {
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

  test("does not expose startStreamV3", () => {
    const ipcRenderer = createMockIpcRenderer();
    const client = createMisoStreamClient(ipcRenderer);

    expect(client.startStreamV3).toBeUndefined();
    expect(CHANNELS.UNCHAIN.STREAM_START_V3).toBeUndefined();
  });

  test("startStreamV4 exposes execution identity and separates detach from cancel", () => {
    const ipcRenderer = createMockIpcRenderer();
    const client = createMisoStreamClient(ipcRenderer);
    const onRuntimeEvent = jest.fn();
    const onDone = jest.fn();

    const handle = client.startStreamV4(
      { threadId: "chat-1", message: "hi" },
      { onRuntimeEvent, onDone },
    );

    expect(handle.executionId).toBe("chat-1");
    expect(handle.attemptId).toBe(handle.requestId);
    expect(typeof handle.attachmentId).toBe("string");
    expect(typeof handle.detach).toBe("function");
    expect(typeof handle.disconnect).toBe("function");
    expect(ipcRenderer.send).toHaveBeenCalledWith(CHANNELS.UNCHAIN.STREAM_START_V4, {
      requestId: handle.requestId,
      attachmentId: handle.attachmentId,
      payload: {
        threadId: "chat-1",
        message: "hi",
        attempt_id: handle.requestId,
      },
    });
    expect(client.__debug.getActiveListenerCount()).toBe(1);

    ipcRenderer.emit(CHANNELS.UNCHAIN.STREAM_EVENT, {
      requestId: handle.requestId,
      event: "runtime_event",
      data: {
        schema_version: "v4",
        event_id: "evt-1",
        type: "step.delta",
        seq: 1,
      },
    });
    ipcRenderer.emit(CHANNELS.UNCHAIN.STREAM_EVENT, {
      requestId: handle.requestId,
      event: "done",
      data: { ok: true },
    });

    expect(onRuntimeEvent).toHaveBeenCalledWith({
      schema_version: "v4",
      event_id: "evt-1",
      type: "step.delta",
      seq: 1,
    });
    expect(onDone).toHaveBeenCalledWith({ ok: true });
    expect(client.__debug.getActiveListenerCount()).toBe(0);
  });

  test("detach keeps the execution alive while cancel still aborts transport", () => {
    const ipcRenderer = createMockIpcRenderer();
    const client = createMisoStreamClient(ipcRenderer);
    const detached = client.startStreamV4({ threadId: "chat-detach" }, {});

    detached.detach();

    expect(ipcRenderer.send).toHaveBeenLastCalledWith(
      CHANNELS.UNCHAIN.STREAM_DETACH,
      {
        requestId: detached.requestId,
        executionId: "chat-detach",
        attemptId: detached.attemptId,
        attachmentId: detached.attachmentId,
      },
    );
    expect(ipcRenderer.send).not.toHaveBeenCalledWith(
      CHANNELS.UNCHAIN.STREAM_CANCEL,
      expect.anything(),
    );
    expect(client.__debug.getActiveListenerCount()).toBe(0);

    const cancelled = client.startStreamV4({ threadId: "chat-cancel" }, {});
    cancelled.cancel();
    expect(ipcRenderer.send).toHaveBeenLastCalledWith(
      CHANNELS.UNCHAIN.STREAM_CANCEL,
      { requestId: cancelled.requestId },
    );
  });

  test("attachStreamV4 registers before replay and preserves exact identity", async () => {
    const ipcRenderer = createMockIpcRenderer();
    ipcRenderer.invoke.mockImplementation(async (channel, payload) => {
      expect(channel).toBe(CHANNELS.UNCHAIN.STREAM_ATTACH_V4);
      expect(payload).toMatchObject({
        requestId: "req-attach",
        executionId: "chat-attach",
        attemptId: "attempt-attach",
        attachmentId: expect.any(String),
        afterSeq: 7,
      });
      ipcRenderer.emit(CHANNELS.UNCHAIN.STREAM_EVENT, {
        requestId: payload.requestId,
        streamSeq: 8,
        event: "runtime_event",
        data: { type: "step.delta", event_id: "evt-replayed" },
      });
      return {
        ok: true,
        replayed_through_seq: 8,
        active: true,
        terminal: false,
      };
    });
    const client = createMisoStreamClient(ipcRenderer);
    const onRuntimeEvent = jest.fn();

    const handle = await client.attachStreamV4(
      {
        requestId: "req-attach",
        executionId: "chat-attach",
        attemptId: "attempt-attach",
        afterSeq: 7,
      },
      { onRuntimeEvent },
    );

    expect(onRuntimeEvent).toHaveBeenCalledWith(
      { type: "step.delta", event_id: "evt-replayed" },
      { streamSeq: 8 },
    );
    expect(handle).toMatchObject({
      requestId: "req-attach",
      executionId: "chat-attach",
      attemptId: "attempt-attach",
      attachmentId: expect.any(String),
      replayedThroughSeq: 8,
      active: true,
      terminal: false,
    });
    expect(client.__debug.getActiveListenerCount()).toBe(1);
    handle.detach();
    expect(client.__debug.getActiveListenerCount()).toBe(0);
  });

  test("attachStreamV4 waits for terminal replay delivery before returning a closed handle", async () => {
    const ipcRenderer = createMockIpcRenderer();
    ipcRenderer.invoke.mockImplementation(async (_channel, payload) => {
      setTimeout(() => {
        ipcRenderer.emit(CHANNELS.UNCHAIN.STREAM_EVENT, {
          requestId: payload.requestId,
          streamSeq: 1,
          event: "runtime_event",
          data: { type: "step.delta", event_id: "evt-terminal-replay" },
        });
        ipcRenderer.emit(CHANNELS.UNCHAIN.STREAM_EVENT, {
          requestId: payload.requestId,
          streamSeq: 2,
          event: "done",
          data: { finished_at: 123 },
        });
      }, 0);
      return {
        ok: true,
        replayed_through_seq: 2,
        active: false,
        terminal: true,
      };
    });
    const client = createMisoStreamClient(ipcRenderer);
    const onRuntimeEvent = jest.fn();
    const onDone = jest.fn();

    const handle = await client.attachStreamV4(
      {
        requestId: "req-terminal-replay",
        executionId: "chat-terminal-replay",
        attemptId: "attempt-terminal-replay",
      },
      { onRuntimeEvent, onDone },
    );

    expect(onRuntimeEvent).toHaveBeenCalledWith(
      { type: "step.delta", event_id: "evt-terminal-replay" },
      { streamSeq: 1 },
    );
    expect(onDone).toHaveBeenCalledWith({ finished_at: 123 });
    expect(handle).toMatchObject({
      replayedThroughSeq: 2,
      active: false,
      terminal: true,
    });
    expect(client.__debug.getActiveListenerCount()).toBe(0);
  });

  test("a stale V4 handle cannot remove the current listener for the same request", async () => {
    const ipcRenderer = createMockIpcRenderer();
    ipcRenderer.invoke.mockResolvedValue({
      ok: true,
      replayed_through_seq: 0,
      terminal: false,
    });
    const client = createMisoStreamClient(ipcRenderer);
    const firstRuntimeEvent = jest.fn();
    const currentRuntimeEvent = jest.fn();
    const identity = {
      requestId: "req-shared",
      executionId: "chat-shared",
      attemptId: "attempt-shared",
      afterSeq: 0,
    };

    const staleHandle = await client.attachStreamV4(identity, {
      onRuntimeEvent: firstRuntimeEvent,
    });
    const currentHandle = await client.attachStreamV4(identity, {
      onRuntimeEvent: currentRuntimeEvent,
    });

    expect(client.__debug.getActiveListenerCount()).toBe(1);
    staleHandle.detach();
    expect(client.__debug.getActiveListenerCount()).toBe(1);
    expect(ipcRenderer.send).toHaveBeenLastCalledWith(
      CHANNELS.UNCHAIN.STREAM_DETACH,
      {
        requestId: "req-shared",
        executionId: "chat-shared",
        attemptId: "attempt-shared",
        attachmentId: staleHandle.attachmentId,
      },
    );

    ipcRenderer.emit(CHANNELS.UNCHAIN.STREAM_EVENT, {
      requestId: "req-shared",
      streamSeq: 1,
      event: "runtime_event",
      data: { event_id: "evt-current", type: "step.delta" },
    });

    expect(firstRuntimeEvent).not.toHaveBeenCalled();
    expect(currentRuntimeEvent).toHaveBeenCalledWith(
      { event_id: "evt-current", type: "step.delta" },
      { streamSeq: 1 },
    );
    currentHandle.detach();
    expect(client.__debug.getActiveListenerCount()).toBe(0);
  });

  test("cancelExecution invokes semantic cancel without cleaning the listener", async () => {
    const ipcRenderer = createMockIpcRenderer();
    const ack = {
      status: "ok",
      execution_id: "chat-1",
      attempt_id: "attempt-1",
      disposition: "applied",
      state: "cancelled",
    };
    ipcRenderer.invoke.mockResolvedValue(ack);
    const client = createMisoStreamClient(ipcRenderer);
    const handle = client.startStreamV4({ threadId: "chat-1" }, {});

    await expect(
      client.cancelExecution({
        requestId: handle.requestId,
        executionId: handle.executionId,
        attemptId: handle.attemptId,
        reason: "user_stop",
      }),
    ).resolves.toBe(ack);

    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      CHANNELS.UNCHAIN.CANCEL_EXECUTION,
      {
        requestId: handle.requestId,
        executionId: "chat-1",
        attemptId: handle.requestId,
        reason: "user_stop",
      },
    );
    expect(client.__debug.getActiveListenerCount()).toBe(1);

    handle.disconnect();
    expect(ipcRenderer.send).toHaveBeenLastCalledWith(
      CHANNELS.UNCHAIN.STREAM_CANCEL,
      { requestId: handle.requestId },
    );
    expect(client.__debug.getActiveListenerCount()).toBe(0);
  });
});

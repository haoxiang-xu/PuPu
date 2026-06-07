import { act, renderHook } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { createStreamingMessageStore } from "./streaming_message_store";

const makeRafScheduler = () => {
  const callbacks = [];
  return {
    scheduler: (callback) => {
      callbacks.push(callback);
      return callbacks.length;
    },
    cancel: (id) => {
      callbacks[id - 1] = null;
    },
    flush: () => {
      const pending = callbacks.splice(0);
      pending.forEach((callback) => {
        if (typeof callback === "function") {
          callback();
        }
      });
    },
  };
};

describe("createStreamingMessageStore", () => {
  test("batches multiple appends in one scheduled notification", () => {
    const raf = makeRafScheduler();
    const store = createStreamingMessageStore({
      notifyScheduler: raf.scheduler,
      cancelScheduler: raf.cancel,
      chunkSize: 8,
    });
    const listener = jest.fn();
    store.begin({ chatId: "chat", messageId: "assistant" });
    store.subscribe({ chatId: "chat", messageId: "assistant" }, listener);

    store.append({ chatId: "chat", messageId: "assistant", delta: "Hello" });
    store.append({ chatId: "chat", messageId: "assistant", delta: ", world" });

    expect(listener).not.toHaveBeenCalled();
    expect(store.getText({ chatId: "chat", messageId: "assistant" })).toBe(
      "Hello, world",
    );

    act(() => {
      raf.flush();
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(
      store.getSnapshot({ chatId: "chat", messageId: "assistant" }),
    ).toMatchObject({
      textLength: 12,
      chunks: ["Hello, w", "orld"],
    });
  });

  test("flushNow synchronously notifies pending text", () => {
    const raf = makeRafScheduler();
    const store = createStreamingMessageStore({
      notifyScheduler: raf.scheduler,
      cancelScheduler: raf.cancel,
    });
    const listener = jest.fn();
    store.begin({ chatId: "chat", messageId: "assistant" });
    store.subscribe({ chatId: "chat", messageId: "assistant" }, listener);

    store.append({ chatId: "chat", messageId: "assistant", delta: "tail" });
    store.flushNow({ chatId: "chat", messageId: "assistant" });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getText({ chatId: "chat", messageId: "assistant" })).toBe(
      "tail",
    );

    act(() => {
      raf.flush();
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("materializeMessages writes active streaming text into message content", () => {
    const store = createStreamingMessageStore();
    const messages = [
      { id: "u", role: "user", content: "prompt" },
      {
        id: "a",
        role: "assistant",
        status: "streaming",
        content: "",
        streamingChunks: ["stale"],
      },
    ];
    store.begin({ chatId: "chat", messageId: "a" });
    store.append({ chatId: "chat", messageId: "a", delta: "fresh text" });

    const materialized = store.materializeMessages({
      chatId: "chat",
      messages,
    });

    expect(materialized[0]).toBe(messages[0]);
    expect(materialized[1]).toEqual({
      id: "a",
      role: "assistant",
      status: "streaming",
      content: "fresh text",
    });
    expect(materialized[1]).not.toHaveProperty("streamingChunks");
  });

  test("clear resets one message without affecting other active streams", () => {
    const store = createStreamingMessageStore();
    store.begin({ chatId: "chat", messageId: "a" });
    store.begin({ chatId: "chat", messageId: "b" });
    store.append({ chatId: "chat", messageId: "a", delta: "A" });
    store.append({ chatId: "chat", messageId: "b", delta: "B" });

    store.clear({ chatId: "chat", messageId: "a" });

    expect(store.getText({ chatId: "chat", messageId: "a" })).toBe("");
    expect(store.getText({ chatId: "chat", messageId: "b" })).toBe("B");
  });

  test("useSyncExternalStore subscribers update without a React message prop change", () => {
    const raf = makeRafScheduler();
    const store = createStreamingMessageStore({
      notifyScheduler: raf.scheduler,
      cancelScheduler: raf.cancel,
    });
    store.begin({ chatId: "chat", messageId: "a" });

    const useSnapshot = () =>
      useSyncExternalStore(
        (listener) =>
          store.subscribe({ chatId: "chat", messageId: "a" }, listener),
        () => store.getSnapshot({ chatId: "chat", messageId: "a" }),
      );

    const { result } = renderHook(() => useSnapshot());
    expect(result.current.textLength).toBe(0);

    store.append({ chatId: "chat", messageId: "a", delta: "external" });
    act(() => {
      raf.flush();
    });

    expect(result.current.textLength).toBe(8);
    expect(result.current.chunks).toEqual(["external"]);
  });
});

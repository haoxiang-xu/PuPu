import { finalizeStreamPersist } from "./finalize_stream_persist";
import {
  clearStreamFinalizedPersist,
  consumeStreamFinalizedPersist,
} from "./stream_persist_dedupe";

describe("finalizeStreamPersist", () => {
  afterEach(() => {
    clearStreamFinalizedPersist();
  });

  test("foreground: writes the final messages synchronously to storage", () => {
    const setChatMessages = jest.fn();
    const flushBackgroundPersist = jest.fn();
    const messages = [{ id: "m", content: "final", status: "done" }];

    const wrote = finalizeStreamPersist({
      storageApi: { setChatMessages },
      chatId: "c1",
      messages,
      isForeground: true,
      flushBackgroundPersist,
    });

    expect(wrote).toBe(true);
    expect(setChatMessages).toHaveBeenCalledWith("c1", messages, {
      source: "chat-page",
    });
    expect(flushBackgroundPersist).not.toHaveBeenCalled();
    // T3:成功写盘后按 (chatId, 引用) 打标,供 chat.js 的防抖 effect 去重
    expect(consumeStreamFinalizedPersist("c1", messages)).toBe(true);
  });

  test("background: does not mark the dedupe (foreground effect not involved)", () => {
    const messages = [{ id: "m" }];
    finalizeStreamPersist({
      storageApi: { setChatMessages: jest.fn() },
      chatId: "c2",
      messages,
      isForeground: false,
      flushBackgroundPersist: jest.fn(),
    });
    expect(consumeStreamFinalizedPersist("c2", messages)).toBe(false);
  });

  test("failed/guarded finalize does not mark the dedupe", () => {
    const messages = [{ id: "m" }];
    finalizeStreamPersist({
      storageApi: null,
      chatId: "c3",
      messages,
      isForeground: true,
      flushBackgroundPersist: jest.fn(),
    });
    expect(consumeStreamFinalizedPersist("c3", messages)).toBe(false);
  });

  test("background: delegates to flushBackgroundPersist with no direct write", () => {
    const setChatMessages = jest.fn();
    const flushBackgroundPersist = jest.fn();

    finalizeStreamPersist({
      storageApi: { setChatMessages },
      chatId: "c2",
      messages: [{ id: "m" }],
      isForeground: false,
      flushBackgroundPersist,
    });

    expect(flushBackgroundPersist).toHaveBeenCalledWith("c2");
    expect(setChatMessages).not.toHaveBeenCalled();
  });

  test("foreground guards: missing chatId or non-array messages do not write", () => {
    const setChatMessages = jest.fn();

    finalizeStreamPersist({
      storageApi: { setChatMessages },
      chatId: "",
      messages: [{ id: "m" }],
      isForeground: true,
      flushBackgroundPersist: jest.fn(),
    });
    finalizeStreamPersist({
      storageApi: { setChatMessages },
      chatId: "c",
      messages: null,
      isForeground: true,
      flushBackgroundPersist: jest.fn(),
    });

    expect(setChatMessages).not.toHaveBeenCalled();
  });
});

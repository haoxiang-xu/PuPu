import { finalizeStreamPersist } from "./finalize_stream_persist";

describe("finalizeStreamPersist", () => {
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

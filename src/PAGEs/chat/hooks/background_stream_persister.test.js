jest.mock("../../../SERVICEs/chat_storage", () => ({
  setChatMessages: jest.fn(),
}));

import { setChatMessages } from "../../../SERVICEs/chat_storage";
import {
  configureBackgroundPersister,
  scheduleBackgroundPersist,
  flushBackgroundPersist,
  cancelBackgroundPersist,
  flushAllBackgroundPersist,
  __resetBackgroundPersisterForTests,
} from "./background_stream_persister";

describe("background_stream_persister", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    setChatMessages.mockClear();
    __resetBackgroundPersisterForTests();
    configureBackgroundPersister({ intervalMs: 2000 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("coalesces many schedule calls into one write per interval", () => {
    for (let i = 0; i < 100; i++) {
      scheduleBackgroundPersist("chat-1", [{ id: "m", content: `hello${i}` }]);
    }
    expect(setChatMessages).not.toHaveBeenCalled();
    jest.advanceTimersByTime(2000);
    expect(setChatMessages).toHaveBeenCalledTimes(1);
    expect(setChatMessages).toHaveBeenCalledWith(
      "chat-1",
      [{ id: "m", content: "hello99" }],
      { source: "chat-page" },
    );
  });

  test("flushBackgroundPersist writes immediately and returns true", () => {
    scheduleBackgroundPersist("chat-1", [{ id: "m", content: "x" }]);
    const result = flushBackgroundPersist("chat-1");
    expect(result).toBe(true);
    expect(setChatMessages).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(5000);
    expect(setChatMessages).toHaveBeenCalledTimes(1);
  });

  test("flushBackgroundPersist returns false when nothing pending", () => {
    expect(flushBackgroundPersist("chat-1")).toBe(false);
    expect(setChatMessages).not.toHaveBeenCalled();
  });

  test("cancelBackgroundPersist drops pending write without calling storage", () => {
    scheduleBackgroundPersist("chat-1", [{ id: "m", content: "x" }]);
    expect(cancelBackgroundPersist("chat-1")).toBe(true);
    jest.advanceTimersByTime(5000);
    expect(setChatMessages).not.toHaveBeenCalled();
  });

  test("isolates timers across chatIds", () => {
    scheduleBackgroundPersist("chat-1", [{ id: "a", content: "1" }]);
    scheduleBackgroundPersist("chat-2", [{ id: "a", content: "2" }]);
    jest.advanceTimersByTime(2000);
    expect(setChatMessages).toHaveBeenCalledTimes(2);
    expect(setChatMessages).toHaveBeenCalledWith(
      "chat-1",
      [{ id: "a", content: "1" }],
      { source: "chat-page" },
    );
    expect(setChatMessages).toHaveBeenCalledWith(
      "chat-2",
      [{ id: "a", content: "2" }],
      { source: "chat-page" },
    );
  });

  test("flushAllBackgroundPersist writes every pending chat", () => {
    scheduleBackgroundPersist("chat-1", [{ id: "a", content: "1" }]);
    scheduleBackgroundPersist("chat-2", [{ id: "a", content: "2" }]);
    flushAllBackgroundPersist();
    expect(setChatMessages).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(5000);
    expect(setChatMessages).toHaveBeenCalledTimes(2);
  });

  test("ignores invalid chatId or messages", () => {
    scheduleBackgroundPersist("", [{ id: "a" }]);
    scheduleBackgroundPersist("chat-1", null);
    jest.advanceTimersByTime(2000);
    expect(setChatMessages).not.toHaveBeenCalled();
  });
});

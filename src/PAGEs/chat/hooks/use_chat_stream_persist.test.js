jest.mock("../../../SERVICEs/chat_storage", () => ({
  __esModule: true,
  setChatMessages: jest.fn(),
}));

import {
  scheduleBackgroundPersist,
  flushBackgroundPersist,
  __resetBackgroundPersisterForTests,
  configureBackgroundPersister,
} from "./background_stream_persister";
import { setChatMessages } from "../../../SERVICEs/chat_storage";

describe("background stream persist contract", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    setChatMessages.mockClear();
    __resetBackgroundPersisterForTests();
    configureBackgroundPersister({ intervalMs: 2000 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("100 token deltas produce at most one write within one interval", () => {
    let content = "";
    for (let i = 0; i < 100; i++) {
      content += `token${i} `;
      scheduleBackgroundPersist("chat-bg", [{ id: "m", content }]);
    }
    expect(setChatMessages).not.toHaveBeenCalled();
    jest.advanceTimersByTime(2000);
    expect(setChatMessages).toHaveBeenCalledTimes(1);
  });

  test("flush on stream end writes the final buffer immediately", () => {
    scheduleBackgroundPersist("chat-bg", [{ id: "m", content: "partial" }]);
    scheduleBackgroundPersist("chat-bg", [
      { id: "m", content: "final", status: "done" },
    ]);
    flushBackgroundPersist("chat-bg");
    expect(setChatMessages).toHaveBeenCalledTimes(1);
    expect(setChatMessages).toHaveBeenCalledWith(
      "chat-bg",
      [{ id: "m", content: "final", status: "done" }],
      { source: "chat-page" },
    );
    jest.advanceTimersByTime(5000);
    expect(setChatMessages).toHaveBeenCalledTimes(1);
  });
});

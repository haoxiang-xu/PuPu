jest.mock("../../../SERVICEs/chat_storage", () => ({
  setChatMessages: jest.fn(),
}));

import { setChatMessages } from "../../../SERVICEs/chat_storage";
import {
  configureBackgroundPersister,
  scheduleBackgroundPersist,
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
});

/** @jest-environment jsdom */

import { flushStoreEmitSync } from "../../../SERVICEs/chat_storage";
import { flushAllBackgroundPersist } from "./background_stream_persister";
import { flushChatWritesBeforeUnload } from "./use_chat_session_state";

jest.mock("../../../SERVICEs/chat_storage", () => ({
  bootstrapChatsStore: jest.fn(),
  cleanupTransientNewChatOnPageLeave: jest.fn(),
  flushStoreEmitSync: jest.fn(),
  getChatMessages: jest.fn(),
  getChatsStore: jest.fn(),
  setChatMessages: jest.fn(),
  setChatModel: jest.fn(),
  setChatSessionBundle: jest.fn(),
  setChatThreadId: jest.fn(),
  subscribeChatsStore: jest.fn(),
  updateChatDraft: jest.fn(),
}));

jest.mock("./background_stream_persister", () => ({
  cancelBackgroundPersist: jest.fn(),
  flushAllBackgroundPersist: jest.fn(),
}));

describe("chat beforeunload tail-write durability", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("drains again after background messages create ops", () => {
    const order = [];
    const flushDraft = jest.fn(() => {
      order.push("draft-tail-write");
    });
    const flushSessionBundle = jest.fn(() => {
      order.push("session-tail-write");
    });
    flushAllBackgroundPersist.mockImplementation(() => {
      order.push("background-tail-write");
    });
    flushStoreEmitSync.mockImplementation(() => {
      order.push("sync-drain");
      return true;
    });
    const event = {
      preventDefault: jest.fn(),
      returnValue: undefined,
    };

    expect(
      flushChatWritesBeforeUnload(event, {
        flushDraft,
        flushSessionBundle,
      }),
    ).toBe(true);
    expect(order).toEqual([
      "draft-tail-write",
      "session-tail-write",
      "background-tail-write",
      "sync-drain",
    ]);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.returnValue).toBeUndefined();
  });

  test("cancels unload when the post-tail-write SQL and journal drain fails", () => {
    const order = [];
    flushAllBackgroundPersist.mockImplementation(() => {
      order.push("background-tail-write");
    });
    flushStoreEmitSync.mockImplementation(() => {
      order.push("sync-drain-failed");
      return false;
    });
    const event = {
      preventDefault: jest.fn(),
      returnValue: undefined,
    };

    expect(flushChatWritesBeforeUnload(event)).toBe(false);
    expect(order).toEqual(["background-tail-write", "sync-drain-failed"]);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.returnValue).toBe("");
  });

  test("cancels unload and still drains queued ops when background flush throws", () => {
    flushAllBackgroundPersist.mockImplementation(() => {
      throw new Error("stream snapshot failed");
    });
    flushStoreEmitSync.mockReturnValue(true);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const event = {
      preventDefault: jest.fn(),
      returnValue: undefined,
    };

    try {
      expect(flushChatWritesBeforeUnload(event)).toBe(false);
      expect(flushStoreEmitSync).toHaveBeenCalledTimes(1);
      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(event.returnValue).toBe("");
      expect(errorSpy).toHaveBeenCalledWith(
        "[chat-storage] background tail flush failed:",
        expect.any(Error),
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  test("attempts every tail write and the final drain when a hook flush throws", () => {
    const order = [];
    const flushDraft = jest.fn(() => {
      order.push("draft-failed");
      throw new Error("draft snapshot failed");
    });
    const flushSessionBundle = jest.fn(() => {
      order.push("session-tail-write");
    });
    flushAllBackgroundPersist.mockImplementation(() => {
      order.push("background-tail-write");
    });
    flushStoreEmitSync.mockImplementation(() => {
      order.push("sync-drain");
      return true;
    });
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const event = {
      preventDefault: jest.fn(),
      returnValue: undefined,
    };

    try {
      expect(
        flushChatWritesBeforeUnload(event, {
          flushDraft,
          flushSessionBundle,
        }),
      ).toBe(false);
      expect(order).toEqual([
        "draft-failed",
        "session-tail-write",
        "background-tail-write",
        "sync-drain",
      ]);
      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(event.returnValue).toBe("");
    } finally {
      errorSpy.mockRestore();
    }
  });
});

import { act, renderHook } from "@testing-library/react";

import { getChatsStore } from "../../../SERVICEs/chat_storage";
import { useChatSessionState } from "./use_chat_session_state";

// T2(B 批):流式期间 defer draft persist。
// 归因证据:draft 的 250ms debounce 落盘 = 整库 persist(实测 53–80ms/次),
// 流式期间会顶在流式帧上形成长任务。
// 契约:非流式打字行为完全不变(250ms 后落盘);流式期间置 pending 不落盘,
// 流式结束后落盘一次;defer 期间内存态(React state)即时更新,draft 零丢失。

describe("useChatSessionState draft persist defer during streaming", () => {
  const EMPTY_ATTACHMENTS = [];

  beforeEach(() => {
    window.localStorage.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  const setup = () => {
    const activeStreamsRef = { current: new Map() };
    const { result } = renderHook(() =>
      useChatSessionState({
        draftAttachments: EMPTY_ATTACHMENTS,
        setDraftAttachments: jest.fn(),
        activeStreamsRef,
        setStreamError: jest.fn(),
      }),
    );
    return { result, activeStreamsRef };
  };

  const draftTextOf = (chatId) =>
    getChatsStore().chatsById[chatId]?.draft?.text;

  test("非流式:打字 250ms 后照常落盘(行为不变)", () => {
    const { result } = setup();
    const chatId = result.current.activeChatIdRef.current;

    act(() => {
      result.current.setInputValue("hello world");
    });
    act(() => {
      jest.advanceTimersByTime(250);
    });

    expect(draftTextOf(chatId)).toBe("hello world");
  });

  test("流式期间:draft 不落盘;流式结束后落盘一次", () => {
    const { result, activeStreamsRef } = setup();
    const chatId = result.current.activeChatIdRef.current;

    // 进入流式
    activeStreamsRef.current.set(chatId, { messages: [] });

    act(() => {
      result.current.setInputValue("typed during stream");
    });
    // 内存态即时更新(零丢失的前半句)
    expect(result.current.inputValue).toBe("typed during stream");

    act(() => {
      jest.advanceTimersByTime(250);
    });
    // 流式中:不落盘
    expect(draftTextOf(chatId)).not.toBe("typed during stream");

    act(() => {
      jest.advanceTimersByTime(2000);
    });
    // 依旧流式中:仍不落盘
    expect(draftTextOf(chatId)).not.toBe("typed during stream");

    // 流式结束
    activeStreamsRef.current.delete(chatId);
    act(() => {
      jest.advanceTimersByTime(300);
    });
    // done 后落盘(零丢失的后半句)
    expect(draftTextOf(chatId)).toBe("typed during stream");
  });

  test("defer 期间继续打字,done 后落的是最新值", () => {
    const { result, activeStreamsRef } = setup();
    const chatId = result.current.activeChatIdRef.current;

    activeStreamsRef.current.set(chatId, { messages: [] });

    act(() => {
      result.current.setInputValue("v1");
    });
    act(() => {
      jest.advanceTimersByTime(250);
    });
    act(() => {
      result.current.setInputValue("v1 v2");
    });
    act(() => {
      jest.advanceTimersByTime(250);
    });
    expect(draftTextOf(chatId)).not.toBe("v1 v2");

    activeStreamsRef.current.delete(chatId);
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(draftTextOf(chatId)).toBe("v1 v2");
  });
});

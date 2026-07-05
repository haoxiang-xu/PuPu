// C3(C 批性能):StreamingMessageStoreContext 的 Provider value 用 useMemo 稳定。
// 此前每次 ChatMessages 重渲染都新建 value 对象 → 所有订阅该 context 的 bubble
// 组件被迫重渲染,长会话下放大为整列表重渲染。
// 契约:chatId / streamingMessageStore / notifyStreamingContentCommitted 不变时,
// value 引用跨重渲染保持稳定。

import { render } from "@testing-library/react";
import { useContext } from "react";
import ChatMessages from "./chat_messages";
import { StreamingMessageStoreContext } from "../chat-bubble/components/streaming_message_store_context";
import { ConfigContext } from "../../CONTAINERs/config/context";

const capturedValues = [];

jest.mock("../chat-bubble/chat_bubble", () => ({
  __esModule: true,
  default: () => {
    // 探针:记录每次渲染时拿到的 context value 引用
    const { useContext } = require("react");
    const {
      StreamingMessageStoreContext,
    } = require("../chat-bubble/components/streaming_message_store_context");
    const value = useContext(StreamingMessageStoreContext);
    capturedValues.push(value);
    return null;
  },
}));

jest.mock("./components/message_minimap", () => ({
  __esModule: true,
  default: () => null,
}));

const renderChatMessages = (over = {}) => {
  const props = {
    chatId: "chat-1",
    messages: [{ id: "m-1", role: "user", content: "hi" }],
    isStreaming: false,
    streamingMessageStore: { subscribe: () => () => {} },
    ...over,
  };
  return render(
    <ConfigContext.Provider
      value={{ theme: {}, onThemeMode: "light_mode" }}
    >
      <ChatMessages {...props} />
    </ConfigContext.Provider>,
  );
};

describe("ChatMessages Provider value memo (C3)", () => {
  beforeAll(() => {
    // jsdom 未实现 Element.scrollTo(窗口 hook 挂载时会 scrollToBottom)
    if (!Element.prototype.scrollTo) {
      Element.prototype.scrollTo = function () {};
    }
  });

  beforeEach(() => {
    capturedValues.length = 0;
  });

  test("依赖不变时,重渲染不换 Provider value 引用", () => {
    const store = { subscribe: () => () => {} };
    const { rerender } = renderChatMessages({ streamingMessageStore: store });
    expect(capturedValues.length).toBeGreaterThan(0);
    const first = capturedValues[capturedValues.length - 1];

    // 换一个不相关 prop 的对象引用,强制 ChatMessages 重渲染(memo 失配)
    rerender(
      <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
        <ChatMessages
          chatId="chat-1"
          messages={[{ id: "m-1", role: "user", content: "hi" }]}
          isStreaming={false}
          streamingMessageStore={store}
          toolConfirmationUiStateById={{}}
        />
      </ConfigContext.Provider>,
    );
    const second = capturedValues[capturedValues.length - 1];

    expect(second).toBe(first);
    expect(second.chatId).toBe("chat-1");
    expect(second.store).toBe(store);
  });

  test("chatId 变化时 value 引用更新(依赖生效,不是永久冻结)", () => {
    const store = { subscribe: () => () => {} };
    renderChatMessages({ streamingMessageStore: store });
    const first = capturedValues[capturedValues.length - 1];

    renderChatMessages({ streamingMessageStore: store, chatId: "chat-2" });
    const second = capturedValues[capturedValues.length - 1];

    expect(second).not.toBe(first);
    expect(second.chatId).toBe("chat-2");
  });
});

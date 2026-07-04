import { render } from "@testing-library/react";
import { useMessageMinimap } from "./hooks/use_message_minimap";
import MessageMinimap from "./components/message_minimap";

// 真实 scroll host,供 MessageMinimap 的命令式 layout effect 完整跑起来。
const makeScrollHost = () => {
  const el = document.createElement("div");
  const inner = document.createElement("div");
  el.appendChild(inner);
  Object.defineProperty(el, "clientHeight", { value: 400, configurable: true });
  Object.defineProperty(el, "scrollHeight", { value: 2000, configurable: true });
  el.scrollTop = 0;
  document.body.appendChild(el);
  return el;
};

// hook + component 串起来:模拟 chat_messages.js 的真实接线,验证「流式追加 trace
// frame → segments 引用稳定 → MessageMinimap 大 effect 不重初始化」这条端到端保证。
const Harness = ({ messages, isStreaming, hostRef, nodeRefs }) => {
  const { segments, total, measure } = useMessageMinimap({
    chatId: "c1",
    messages,
    messageNodeRefs: nodeRefs,
    safeVisibleStart: 0,
    isStreaming,
  });
  return (
    <MessageMinimap
      messagesRef={hostRef}
      messageNodeRefs={nodeRefs}
      segments={segments}
      total={total}
      safeVisibleStart={0}
      measure={measure}
      scrollToMessageIndex={() => true}
      bottomViewportInset={0}
      isDark
      isStreaming={isStreaming}
    />
  );
};

afterEach(() => {
  document.body.innerHTML = "";
});

test("流式追加 trace frame 不重初始化 minimap effect(scroll 监听只挂一次)", () => {
  const el = makeScrollHost();
  const addSpy = jest.spyOn(el, "addEventListener");
  // 稳定的 ref 对象:messagesRef/messageNodeRefs 身份跨渲染不变(否则 effect 依赖变化会误重跑)
  const hostRef = { current: el };
  const nodeRefs = { current: new Map() };

  const msgsA = [
    { id: "m0", role: "user", content: "hello" },
    { id: "m1", role: "assistant", content: "hi" },
  ];
  const { rerender } = render(
    <Harness messages={msgsA} isStreaming hostRef={hostRef} nodeRefs={nodeRefs} />,
  );
  // 挂载期会挂 scroll 监听(chatId effect bump version 会带来一次额外重跑,属一次性成本)
  expect(
    addSpy.mock.calls.filter((c) => c[0] === "scroll").length,
  ).toBeGreaterThanOrEqual(1);

  addSpy.mockClear();
  // 追加 trace frame:全新数组、长度不变、首尾 id 不变(仅末条 content 变长)
  const msgsB = [msgsA[0], { ...msgsA[1], content: "hi there, more tokens" }];
  rerender(
    <Harness messages={msgsB} isStreaming hostRef={hostRef} nodeRefs={nodeRefs} />,
  );
  const scrollAddsAfter = addSpy.mock.calls.filter((c) => c[0] === "scroll").length;
  // effect 未重初始化 → 未 removeEventListener/addEventListener 重挂监听
  expect(scrollAddsAfter).toBe(0);
});

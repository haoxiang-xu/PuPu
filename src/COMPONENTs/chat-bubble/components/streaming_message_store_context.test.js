import { render, act, screen } from "@testing-library/react";
import { createStreamingMessageStore } from "../../../SERVICEs/streaming_message_store";
import { useStreamingHasLiveText } from "./streaming_message_store_context";

const CHAT = "chat-1";
const MSG = "msg-1";

let renderCount = 0;
const Probe = ({ store }) => {
  renderCount += 1;
  const has = useStreamingHasLiveText(store, CHAT, MSG);
  return <div data-testid="probe">{has ? "yes" : "no"}</div>;
};

const append = (store, delta) =>
  act(() => {
    store.append({ chatId: CHAT, messageId: MSG, delta });
    store.flushNow({ chatId: CHAT, messageId: MSG });
  });

describe("useStreamingHasLiveText", () => {
  beforeEach(() => {
    renderCount = 0;
  });

  test("false → true 只在首个非空白文本时翻转", () => {
    const store = createStreamingMessageStore();
    store.begin({ chatId: CHAT, messageId: MSG });
    render(<Probe store={store} />);
    expect(screen.getByTestId("probe").textContent).toBe("no");

    append(store, "   \n"); // 纯空白:不翻转
    expect(screen.getByTestId("probe").textContent).toBe("no");

    append(store, "hello");
    expect(screen.getByTestId("probe").textContent).toBe("yes");
  });

  test("翻转后继续 append 不再触发重渲染", () => {
    const store = createStreamingMessageStore();
    store.begin({ chatId: CHAT, messageId: MSG });
    render(<Probe store={store} />);
    append(store, "hello");
    const countAfterFlip = renderCount;

    append(store, " world");
    append(store, " again");
    expect(renderCount).toBe(countAfterFlip); // 布尔未变 → 零重渲染
  });

  test("store 为 null 时返回 false 且不抛", () => {
    const store = null;
    render(<Probe store={store} />);
    expect(screen.getByTestId("probe").textContent).toBe("no");
  });
});

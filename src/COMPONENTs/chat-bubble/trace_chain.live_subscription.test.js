import { act, render } from "@testing-library/react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import { createStreamingMessageStore } from "../../SERVICEs/streaming_message_store";
import { StreamingMessageStoreContext } from "./components/streaming_message_store_context";
import TraceChain from "./trace_chain";

jest.mock("../../BUILTIN_COMPONENTs/icon/icon", () => () => null);

// Pure capture mock: records every `items` array reference handed to Timeline so
// we can assert whether a streaming chunk commit rebuilt timelineItems. Rendered
// output is irrelevant here — these tests only inspect the items array identity
// and node keys. Kept in a separate file from trace_chain.test.js so that file's
// text-based assertions keep exercising the real Timeline (130-test baseline).
jest.mock("../../BUILTIN_COMPONENTs/timeline/timeline", () => {
  const calls = [];
  const MockTimeline = (props) => {
    calls.push(props.items);
    return <div data-testid="mock-timeline" data-count={props.items.length} />;
  };
  MockTimeline.__calls = calls;
  return { __esModule: true, default: MockTimeline };
});

// eslint-disable-next-line import/first
import Timeline from "../../BUILTIN_COMPONENTs/timeline/timeline";

const frame = ({ seq, type, payload = {}, ts = seq * 100 }) => ({
  seq,
  ts,
  type,
  payload,
});

const makeRafScheduler = () => {
  const callbacks = [];
  return {
    scheduler: (callback) => {
      callbacks.push(callback);
      return callbacks.length;
    },
    cancel: (id) => {
      callbacks[id - 1] = null;
    },
    flush: () => {
      const pending = callbacks.splice(0);
      pending.forEach((callback) => {
        if (typeof callback === "function") {
          callback();
        }
      });
    },
  };
};

const renderTraceChain = ({
  frames,
  status = "streaming",
  messageId = "assistant",
  streamingMessageStore = null,
}) =>
  render(
    <ConfigContext.Provider
      value={{
        theme: { color: "#222", font: { fontFamily: "sans-serif" } },
        onThemeMode: "light_mode",
      }}
    >
      <StreamingMessageStoreContext.Provider
        value={{
          chatId: "chat",
          store: streamingMessageStore,
          notifyStreamingContentCommitted: jest.fn(),
        }}
      >
        <TraceChain
          frames={frames}
          status={status}
          messageId={messageId}
        />
      </StreamingMessageStoreContext.Provider>
    </ConfigContext.Provider>,
  );

const lastItems = () =>
  Timeline.__calls.length > 0
    ? Timeline.__calls[Timeline.__calls.length - 1]
    : [];
const hasKey = (items, key) =>
  Array.isArray(items) && items.some((item) => item && item.key === key);

const makeStore = (raf) =>
  createStreamingMessageStore({
    notifyScheduler: raf.scheduler,
    cancelScheduler: raf.cancel,
  });

const appendFlush = (store, raf, delta) => {
  store.append({ chatId: "chat", messageId: "assistant", delta });
  act(() => {
    raf.flush();
  });
};

describe("TraceChain streaming live-text subscription", () => {
  beforeEach(() => {
    Timeline.__calls.length = 0;
  });

  test("流式中 chunk 提交不重建 timelineItems(items 引用稳定)", () => {
    const raf = makeRafScheduler();
    const store = makeStore(raf);
    store.begin({ chatId: "chat", messageId: "assistant" });

    renderTraceChain({
      frames: [
        frame({ seq: 1, type: "stream_started", payload: {} }),
        frame({
          seq: 2,
          type: "tool_call",
          payload: { call_id: "call-1", tool_name: "read_file", arguments: {} },
        }),
        frame({
          seq: 3,
          type: "tool_result",
          payload: { call_id: "call-1", result: { content: "ok" } },
        }),
      ],
      status: "streaming",
      messageId: "assistant",
      streamingMessageStore: store,
    });

    // First non-empty text: the boolean flips false→true, one rebuild allowed.
    appendFlush(store, raf, "hello");
    const callsAfterFlip = Timeline.__calls.length;
    const itemsAfterFlip = Timeline.__calls[callsAfterFlip - 1];

    // Subsequent pure-text chunk commits must NOT rebuild timelineItems.
    appendFlush(store, raf, "  world");
    appendFlush(store, raf, " again");
    appendFlush(store, raf, " and more");

    // Either Timeline was not called again, or the last items array is the very
    // same reference built at flip time (no rebuild). Collapse to a boolean so a
    // RED failure prints "false", not a pretty-formatted dump of the huge
    // React-element `items` arrays (which OOMs jest's diff serializer).
    const last = Timeline.__calls[Timeline.__calls.length - 1];
    const notCalledAgain = Timeline.__calls.length === callsAfterFlip;
    const sameItemsRef = last === itemsAfterFlip;
    expect(notCalledAgain || sameItemsRef).toBe(true);
  });

  test("流式无文本 → Thinking… 节点;首个非空白文本后 → Response 节点", () => {
    const raf = makeRafScheduler();
    const store = makeStore(raf);
    store.begin({ chatId: "chat", messageId: "assistant" });

    renderTraceChain({
      frames: [frame({ seq: 1, type: "stream_started", payload: {} })],
      status: "streaming",
      messageId: "assistant",
      streamingMessageStore: store,
    });

    expect(hasKey(lastItems(), "__streaming__")).toBe(true);
    expect(hasKey(lastItems(), "__streaming_content__")).toBe(false);

    appendFlush(store, raf, "hello");

    expect(hasKey(lastItems(), "__streaming_content__")).toBe(true);
    expect(hasKey(lastItems(), "__streaming__")).toBe(false);
  });

  test("纯空白首 delta 不触发 Thinking→Response 切换", () => {
    const raf = makeRafScheduler();
    const store = makeStore(raf);
    store.begin({ chatId: "chat", messageId: "assistant" });

    renderTraceChain({
      frames: [frame({ seq: 1, type: "stream_started", payload: {} })],
      status: "streaming",
      messageId: "assistant",
      streamingMessageStore: store,
    });

    appendFlush(store, raf, "  \n");

    expect(hasKey(lastItems(), "__streaming__")).toBe(true);
    expect(hasKey(lastItems(), "__streaming_content__")).toBe(false);
  });
});

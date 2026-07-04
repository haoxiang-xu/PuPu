import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import SeamlessMarkdown from "./seamless_markdown";
import CellSplitSpinner from "../../../BUILTIN_COMPONENTs/spinner/cell_split_spinner";

const EMPTY_SNAPSHOT = Object.freeze({
  version: 0,
  textLength: 0,
  chunks: Object.freeze([]),
  updatedAt: 0,
});

export const StreamingMessageStoreContext = createContext({
  chatId: "",
  store: null,
  notifyStreamingContentCommitted: null,
});

export const useStreamingMessageStoreContext = () =>
  useContext(StreamingMessageStoreContext);

export const useStreamingMessageSnapshot = (store, chatId, messageId) =>
  useSyncExternalStore(
    (listener) => {
      if (!store || typeof store.subscribe !== "function") {
        return () => {};
      }
      return store.subscribe({ chatId, messageId }, listener);
    },
    () => {
      if (!store || typeof store.getSnapshot !== "function") {
        return EMPTY_SNAPSHOT;
      }
      return store.getSnapshot({ chatId, messageId });
    },
    () => EMPTY_SNAPSHOT,
  );

// 只订阅"有无(非空白)直播文本"这个布尔量:useSyncExternalStore 用 Object.is 比较
// 快照,布尔值只在翻转时触发重渲染(每回合约一次),而非每个 chunk 提交。
// TraceChain 用它做 Thinking…/Response 切换与占位退场;每 chunk 的文本上屏由
// 自订阅的 StreamingMarkdownView 内部消化。
export const useStreamingHasLiveText = (store, chatId, messageId) =>
  useSyncExternalStore(
    (listener) => {
      if (!store || typeof store.subscribe !== "function") {
        return () => {};
      }
      return store.subscribe({ chatId, messageId }, listener);
    },
    () => {
      if (!store || typeof store.getSnapshot !== "function") {
        return false;
      }
      const snapshot = store.getSnapshot({ chatId, messageId });
      if (!snapshot || snapshot.textLength <= 0) {
        return false;
      }
      return snapshot.chunks.some(
        (chunk) => typeof chunk === "string" && chunk.trim().length > 0,
      );
    },
    () => false,
  );

export const StreamingMarkdownView = ({
  messageId,
  fallbackContent = "",
  fallbackChunks,
  fontSize,
  lineHeight,
  priority = "high",
  className,
  style,
  spinner = null,
}) => {
  const { chatId, store, notifyStreamingContentCommitted } =
    useStreamingMessageStoreContext();
  const snapshot = useStreamingMessageSnapshot(store, chatId, messageId);
  const fallbackChunkList = Array.isArray(fallbackChunks) ? fallbackChunks : [];
  const chunks =
    snapshot.textLength > 0 || snapshot.version > 0
      ? snapshot.chunks
      : fallbackChunkList;
  const content = useMemo(() => {
    if (chunks.length > 0) {
      return "";
    }
    return typeof fallbackContent === "string" ? fallbackContent : "";
  }, [chunks.length, fallbackContent]);
  const hasText =
    chunks.some((chunk) => typeof chunk === "string" && chunk.trim()) ||
    content.trim().length > 0;

  useLayoutEffect(() => {
    if (!hasText || typeof notifyStreamingContentCommitted !== "function") {
      return;
    }
    notifyStreamingContentCommitted();
  }, [hasText, notifyStreamingContentCommitted, snapshot.version]);

  if (!hasText) {
    return spinner;
  }

  return (
    <SeamlessMarkdown
      content={content}
      streamingChunks={chunks}
      status="streaming"
      fontSize={fontSize}
      lineHeight={lineHeight}
      priority={priority}
      className={className}
      style={style}
    />
  );
};

export const StreamingAssistantSpinner = () => (
  <div style={{ padding: "8px 0" }}>
    <CellSplitSpinner
      size={28}
      cells={5}
      speed={0.9}
      spread={1}
      stagger={120}
      spin={true}
      spinSpeed={0.6}
    />
  </div>
);

import {
  useRef,
  useEffect,
  useContext,
  useMemo,
  useState,
  useLayoutEffect,
  useCallback,
} from "react";
import ChatBubble from "../chat-bubble/chat_bubble";
import Button from "../../BUILTIN_COMPONENTs/input/button";
import { ConfigContext } from "../../CONTAINERs/config/context";
import logoDark from "./logo_dark_theme.png";
import logoLight from "./logo_light_theme.png";

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  EmptyChat — shown when there are no messages                                                                               */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const EmptyChat = () => {
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        userSelect: "none",
        pointerEvents: "none",
      }}
    >
      <img
        src={isDark ? logoDark : logoLight}
        alt="PuPu"
        draggable={false}
        style={{
          width: 160,
          opacity: 1,
        }}
      />
      <span
        style={{
          fontSize: 18,
          fontFamily: "Jost",
          fontWeight: 500,
          color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.3)",
          letterSpacing: "0.5px",
        }}
      >
        How can I help you today?
      </span>
    </div>
  );
};

const BOTTOM_FOLLOW_THRESHOLD = 24;

const ChatMessages = ({
  chatId,
  messages = [],
  isStreaming = false,
  onEdit,
  onCopy,
  onRegenerate,
  className = "scrollable",
  initialVisibleCount = 12,
  loadBatchSize = 6,
  topLoadThreshold = 80,
}) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const color = theme?.color || "#222";
  const messagesRef = useRef(null);
  const visibleStartRef = useRef(Math.max(0, messages.length - initialVisibleCount));
  const prependCompensationRef = useRef(null);
  const pendingScrollToBottomRef = useRef("auto");
  const activeChatIdRef = useRef(chatId);
  const [visibleStartIndex, setVisibleStartIndex] = useState(
    () => Math.max(0, messages.length - initialVisibleCount),
  );
  const [isAtBottom, setIsAtBottom] = useState(true);

  const safeVisibleStart = Math.max(
    0,
    Math.min(visibleStartIndex, messages.length),
  );
  const visibleMessages = useMemo(
    () => messages.slice(safeVisibleStart),
    [messages, safeVisibleStart],
  );

  const lastAssistantIndex = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index]?.role === "assistant") {
        return index;
      }
    }
    return -1;
  }, [messages]);

  const updateIsAtBottom = useCallback((el) => {
    const distance = el.scrollHeight - (el.scrollTop + el.clientHeight);
    setIsAtBottom(distance <= BOTTOM_FOLLOW_THRESHOLD);
  }, []);

  const loadOlderMessages = useCallback(() => {
    const el = messagesRef.current;
    if (!el) {
      return;
    }

    setVisibleStartIndex((previous) => {
      if (previous <= 0) {
        return 0;
      }
      const next = Math.max(0, previous - loadBatchSize);
      if (next === previous) {
        return previous;
      }

      prependCompensationRef.current = {
        previousScrollHeight: el.scrollHeight,
        previousScrollTop: el.scrollTop,
      };
      visibleStartRef.current = next;
      return next;
    });
  }, [loadBatchSize]);

  const handleScroll = useCallback(() => {
    const el = messagesRef.current;
    if (!el) {
      return;
    }

    updateIsAtBottom(el);

    if (
      el.scrollTop <= topLoadThreshold &&
      visibleStartRef.current > 0 &&
      !prependCompensationRef.current
    ) {
      loadOlderMessages();
    }
  }, [loadOlderMessages, topLoadThreshold, updateIsAtBottom]);

  const scrollToBottom = useCallback((behavior = "auto") => {
    const el = messagesRef.current;
    if (!el) {
      return;
    }

    el.scrollTo({ top: el.scrollHeight, behavior });
    setIsAtBottom(true);
  }, []);

  const handleBackToBottom = useCallback(() => {
    const nextStart = Math.max(0, messages.length - initialVisibleCount);
    const shouldAdjustWindow = nextStart !== visibleStartRef.current;
    visibleStartRef.current = nextStart;
    if (shouldAdjustWindow) {
      pendingScrollToBottomRef.current = "smooth";
      setVisibleStartIndex(nextStart);
      return;
    }

    scrollToBottom("smooth");
  }, [initialVisibleCount, messages.length, scrollToBottom]);

  useEffect(() => {
    visibleStartRef.current = visibleStartIndex;
  }, [visibleStartIndex]);

  useEffect(() => {
    if (activeChatIdRef.current === chatId) {
      return;
    }

    activeChatIdRef.current = chatId;
    const nextStart = Math.max(0, messages.length - initialVisibleCount);
    visibleStartRef.current = nextStart;
    setVisibleStartIndex(nextStart);
    setIsAtBottom(true);
    pendingScrollToBottomRef.current = "auto";
  }, [chatId, initialVisibleCount, messages.length]);

  useEffect(() => {
    if (messages.length > 0) {
      return;
    }

    visibleStartRef.current = 0;
    setVisibleStartIndex(0);
    setIsAtBottom(true);
    pendingScrollToBottomRef.current = "auto";
  }, [messages.length]);

  useLayoutEffect(() => {
    const el = messagesRef.current;
    if (!el || !prependCompensationRef.current) {
      return;
    }

    const { previousScrollHeight, previousScrollTop } = prependCompensationRef.current;
    const delta = el.scrollHeight - previousScrollHeight;
    el.scrollTop = previousScrollTop + delta;
    prependCompensationRef.current = null;
    updateIsAtBottom(el);
  }, [safeVisibleStart, updateIsAtBottom]);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) {
      return;
    }

    if (pendingScrollToBottomRef.current) {
      scrollToBottom(pendingScrollToBottomRef.current);
      pendingScrollToBottomRef.current = null;
      return;
    }

    if (isAtBottom) {
      scrollToBottom(isStreaming ? "auto" : "smooth");
    }
  }, [isAtBottom, isStreaming, messages, scrollToBottom, safeVisibleStart]);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el || prependCompensationRef.current || messages.length === 0) {
      return;
    }

    if (
      visibleStartRef.current > 0 &&
      el.scrollHeight <= el.clientHeight + topLoadThreshold
    ) {
      loadOlderMessages();
    }
  }, [loadOlderMessages, messages, safeVisibleStart, topLoadThreshold]);

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        position: "relative",
      }}
    >
      <div
        ref={messagesRef}
        className={className}
        onScroll={handleScroll}
        style={{
          height: "100%",
          overflowY: "auto",
          padding: "20px 0 8px",
          position: "relative",
          boxSizing: "border-box",
          scrollBehavior: "auto",
        }}
      >
        {messages.length === 0 ? (
          <EmptyChat />
        ) : (
          <div
            style={{
              width: "100%",
              minHeight: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 20,
            }}
          >
            {visibleMessages.map((msg, index) => {
              const messageIndex = safeVisibleStart + index;
              const isLastAssistant =
                msg.role === "assistant" && messageIndex === lastAssistantIndex;

              return (
                <div
                  key={msg.id}
                  style={{
                    width: "70%",
                    maxWidth: 800,
                    margin: "0 auto",
                    padding: "0 20px",
                    boxSizing: "border-box",
                  }}
                >
                  <ChatBubble
                    message={msg}
                    isLast={isLastAssistant}
                    onEdit={onEdit}
                    onCopy={onCopy}
                    onRegenerate={onRegenerate}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {messages.length > 0 && (
        <div
          style={{
            position: "absolute",
            // Align to chat input's right edge and keep a visible gap above input.
            right: "max(40px, calc(50% - 480px))",
            bottom: 22,
            zIndex: 2,
            opacity: !isAtBottom ? 1 : 0,
            transform: !isAtBottom ? "translateY(0)" : "translateY(8px)",
            transition:
              "opacity 0.22s ease, transform 0.22s cubic-bezier(0.22, 1, 0.36, 1)",
            pointerEvents: !isAtBottom ? "auto" : "none",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px",
              borderRadius: 18,
              backgroundColor: isDark
                ? "rgba(255,255,255,0.06)"
                : "rgba(0,0,0,0.05)",
              boxShadow: isDark
                ? "0 4px 24px rgba(0,0,0,0.32), 0 1px 3px rgba(0,0,0,0.16)"
                : "0 4px 24px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)",
              transition: "background-color 0.22s ease, box-shadow 0.22s ease",
              backdropFilter: "blur(6px)",
            }}
          >
            <Button
              prefix_icon="arrow_down"
              onClick={handleBackToBottom}
              style={{
                color,
                fontSize: 14,
                borderRadius: 16,
                paddingVertical: 8,
                paddingHorizontal: 8,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatMessages;

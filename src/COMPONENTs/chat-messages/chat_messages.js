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

const BOTTOM_FOLLOW_THRESHOLD = 24;
const PREVIOUS_MESSAGE_EPSILON = 6;
const TOP_EDGE_THRESHOLD = 2;

const ChatMessages = ({
  chatId,
  messages = [],
  isStreaming = false,
  onDeleteMessage,
  onResendMessage,
  onEditMessage,
  className = "scrollable",
  initialVisibleCount = 12,
  loadBatchSize = 6,
  topLoadThreshold = 80,
}) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const color = theme?.color || "#222";
  const attachPanelBg = isDark ? "rgb(30, 30, 30)" : "rgb(255, 255, 255)";
  const messagesRef = useRef(null);
  const messageNodeRefs = useRef(new Map());
  const lastScrollTopRef = useRef(0);
  const visibleStartRef = useRef(
    Math.max(0, messages.length - initialVisibleCount),
  );
  const prependCompensationRef = useRef(null);
  const pendingScrollToBottomRef = useRef("auto");
  const pendingJumpActionRef = useRef(null);
  const activeChatIdRef = useRef(chatId);
  const [visibleStartIndex, setVisibleStartIndex] = useState(() =>
    Math.max(0, messages.length - initialVisibleCount),
  );
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [isAtTop, setIsAtTop] = useState(true);

  const safeVisibleStart = Math.max(
    0,
    Math.min(visibleStartIndex, messages.length),
  );
  const visibleMessages = useMemo(
    () => messages.slice(safeVisibleStart),
    [messages, safeVisibleStart],
  );

  const updateIsAtBottom = useCallback((el) => {
    const distance = el.scrollHeight - (el.scrollTop + el.clientHeight);
    setIsAtBottom(distance <= BOTTOM_FOLLOW_THRESHOLD);
    setIsAtTop(el.scrollTop <= TOP_EDGE_THRESHOLD);
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

    const currentScrollTop = el.scrollTop;
    const isScrollingUp = currentScrollTop < lastScrollTopRef.current - 0.5;
    lastScrollTopRef.current = currentScrollTop;

    updateIsAtBottom(el);

    if (
      currentScrollTop <= topLoadThreshold &&
      isScrollingUp &&
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
    lastScrollTopRef.current = el.scrollHeight;
    setIsAtBottom(true);
    setIsAtTop(false);
  }, []);

  const scrollToTop = useCallback(
    (behavior = "smooth") => {
      const el = messagesRef.current;
      if (!el) {
        return;
      }
      el.scrollTo({ top: 0, behavior });
      lastScrollTopRef.current = 0;
      updateIsAtBottom(el);
    },
    [updateIsAtBottom],
  );

  const getSortedRenderedEntries = useCallback(() => {
    return [...messageNodeRefs.current.entries()]
      .filter(([, node]) => node)
      .sort((a, b) => a[0] - b[0]);
  }, []);

  const jumpToPreviousRenderedMessage = useCallback(
    (behavior = "smooth") => {
      const el = messagesRef.current;
      if (!el) {
        return false;
      }

      const thresholdTop = el.scrollTop - PREVIOUS_MESSAGE_EPSILON;
      let previousNode = null;

      for (const [, node] of getSortedRenderedEntries()) {
        if (node.offsetTop < thresholdTop) {
          previousNode = node;
          continue;
        }
        break;
      }

      if (!previousNode) {
        return false;
      }

      el.scrollTo({
        top: Math.max(0, previousNode.offsetTop - 12),
        behavior,
      });
      updateIsAtBottom(el);
      return true;
    },
    [getSortedRenderedEntries, updateIsAtBottom],
  );

  const handleBackToBottom = useCallback(() => {
    const nextStart = Math.max(0, messages.length - initialVisibleCount);
    const shouldAdjustWindow = nextStart !== visibleStartRef.current;
    visibleStartRef.current = nextStart;
    if (shouldAdjustWindow) {
      pendingScrollToBottomRef.current = "auto";
      setVisibleStartIndex(nextStart);
      return;
    }

    scrollToBottom("auto");
  }, [initialVisibleCount, messages.length, scrollToBottom]);

  const handleSkipToTop = useCallback(() => {
    pendingJumpActionRef.current = null;
    const shouldExpandWindow = visibleStartRef.current !== 0;
    visibleStartRef.current = 0;

    if (shouldExpandWindow) {
      pendingJumpActionRef.current = { type: "top", behavior: "smooth" };
      setVisibleStartIndex(0);
      return;
    }

    scrollToTop("smooth");
  }, [scrollToTop]);

  const handleJumpToPreviousMessage = useCallback(() => {
    if (jumpToPreviousRenderedMessage("smooth")) {
      return;
    }

    if (visibleStartRef.current > 0) {
      pendingJumpActionRef.current = { type: "previous", behavior: "smooth" };
      loadOlderMessages();
      return;
    }

    scrollToTop("smooth");
  }, [jumpToPreviousRenderedMessage, loadOlderMessages, scrollToTop]);

  useEffect(() => {
    visibleStartRef.current = visibleStartIndex;
  }, [visibleStartIndex]);

  useEffect(() => {
    if (activeChatIdRef.current === chatId) {
      return;
    }

    activeChatIdRef.current = chatId;
    lastScrollTopRef.current = 0;
    const nextStart = Math.max(0, messages.length - initialVisibleCount);
    visibleStartRef.current = nextStart;
    setVisibleStartIndex(nextStart);
    setIsAtBottom(true);
    setIsAtTop(true);
    pendingScrollToBottomRef.current = "auto";
  }, [chatId, initialVisibleCount, messages.length]);

  useEffect(() => {
    if (messages.length > 0) {
      return;
    }

    visibleStartRef.current = 0;
    lastScrollTopRef.current = 0;
    setVisibleStartIndex(0);
    setIsAtBottom(true);
    setIsAtTop(true);
    pendingScrollToBottomRef.current = "auto";
  }, [messages.length]);

  useLayoutEffect(() => {
    const el = messagesRef.current;
    if (!el) {
      return;
    }

    if (prependCompensationRef.current) {
      if (isAtBottom) {
        scrollToBottom("auto");
      } else {
        const { previousScrollHeight, previousScrollTop } =
          prependCompensationRef.current;
        const delta = el.scrollHeight - previousScrollHeight;
        el.scrollTop = previousScrollTop + delta;
        lastScrollTopRef.current = el.scrollTop;
      }
      prependCompensationRef.current = null;
      updateIsAtBottom(el);
    }

    const pendingAction = pendingJumpActionRef.current;
    if (!pendingAction) {
      return;
    }

    if (pendingAction.type === "top") {
      pendingJumpActionRef.current = null;
      scrollToTop(pendingAction.behavior || "smooth");
      return;
    }

    if (pendingAction.type === "previous") {
      const jumped = jumpToPreviousRenderedMessage(
        pendingAction.behavior || "smooth",
      );
      if (jumped) {
        pendingJumpActionRef.current = null;
        return;
      }

      if (visibleStartRef.current > 0) {
        loadOlderMessages();
        return;
      }

      pendingJumpActionRef.current = null;
      scrollToTop(pendingAction.behavior || "smooth");
    }
  }, [
    isAtBottom,
    jumpToPreviousRenderedMessage,
    loadOlderMessages,
    safeVisibleStart,
    scrollToBottom,
    scrollToTop,
    updateIsAtBottom,
  ]);

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
          padding: messages.length === 0 ? "0" : "20px 0 8px",
          position: "relative",
          boxSizing: "border-box",
          scrollBehavior: "auto",
        }}
      >
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
            return (
              <div
                key={msg.id}
                ref={(node) => {
                  if (node) {
                    messageNodeRefs.current.set(messageIndex, node);
                  } else {
                    messageNodeRefs.current.delete(messageIndex);
                  }
                }}
                style={{
                  width: "100%",
                  maxWidth: 680,
                  margin: "0 auto",
                  padding: "0 20px",
                  boxSizing: "border-box",
                }}
              >
                <ChatBubble
                  message={msg}
                  onDeleteMessage={onDeleteMessage}
                  onResendMessage={onResendMessage}
                  onEditMessage={onEditMessage}
                  disableActionButtons={isStreaming}
                />
              </div>
            );
          })}
        </div>
      </div>

      {messages.length > 0 && (
        <div
          style={{
            position: "absolute",
            // Match ChatInput right inset:
            // outer padding (20) + inner padding (20) when narrow,
            // and center-aligned maxWidth(780) inset when wide.
            right: "max(40px, calc(50% - 370px))",
            // Match the attach panel's floated distance to the input edge (padding=12).
            bottom: 12,
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
              gap: 4,
              padding: "3px",
              borderRadius: 16,
              backgroundColor: attachPanelBg,
              boxShadow: isDark
                ? "0 4px 24px rgba(0,0,0,0.32), 0 1px 3px rgba(0,0,0,0.16)"
                : "0 4px 24px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)",
              transition: "background-color 0.22s ease, box-shadow 0.22s ease",
            }}
          >
            {!isAtTop && (
              <>
                <Button
                  prefix_icon="skip_up"
                  onClick={handleSkipToTop}
                  style={{
                    color,
                    fontSize: 12,
                    iconSize: 12,
                    borderRadius: 14,
                    paddingVertical: 6,
                    paddingHorizontal: 6,
                  }}
                />
                <Button
                  prefix_icon="arrow_up"
                  onClick={handleJumpToPreviousMessage}
                  style={{
                    color,
                    fontSize: 12,
                    iconSize: 12,
                    borderRadius: 14,
                    paddingVertical: 6,
                    paddingHorizontal: 6,
                  }}
                />
              </>
            )}
            <Button
              prefix_icon="skip_down"
              onClick={handleBackToBottom}
              style={{
                color,
                fontSize: 12,
                iconSize: 12,
                borderRadius: 14,
                paddingVertical: 6,
                paddingHorizontal: 6,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatMessages;

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BOTTOM_FOLLOW_THRESHOLD,
  PREVIOUS_MESSAGE_EPSILON,
  TOP_EDGE_THRESHOLD,
} from "../constants";

const STREAMING_BOTTOM_FOLLOW_MS = 64;

export const useMessageWindowScroll = ({
  chat_id,
  messages,
  is_streaming,
  initial_visible_count,
  load_batch_size,
  top_load_threshold,
  boot_visible_count,
}) => {
  const effectiveBootCount =
    typeof boot_visible_count === "number" && boot_visible_count > 0
      ? Math.min(boot_visible_count, initial_visible_count)
      : initial_visible_count;
  const messagesRef = useRef(null);
  const messageNodeRefs = useRef(new Map());
  const lastScrollTopRef = useRef(0);
  const visibleStartRef = useRef(
    Math.max(0, messages.length - initial_visible_count),
  );
  const prependCompensationRef = useRef(null);
  const pendingScrollToBottomRef = useRef("auto");
  const pendingStreamingBottomFollowRef = useRef(null);
  const pendingJumpActionRef = useRef(null);
  const activeChatIdRef = useRef(chat_id);
  const isAtBottomRef = useRef(true);
  const streamingFollowEnabledRef = useRef(true);
  const userScrollIntentRef = useRef(false);

  const [visibleStartIndex, setVisibleStartIndex] = useState(() =>
    Math.max(0, messages.length - initial_visible_count),
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
    const nextIsAtBottom = distance <= BOTTOM_FOLLOW_THRESHOLD;
    isAtBottomRef.current = nextIsAtBottom;
    if (nextIsAtBottom) {
      streamingFollowEnabledRef.current = true;
      userScrollIntentRef.current = false;
    }
    setIsAtBottom(nextIsAtBottom);
    setIsAtTop(el.scrollTop <= TOP_EDGE_THRESHOLD);
    return nextIsAtBottom;
  }, []);

  const clearScheduledStreamingBottomFollow = useCallback(() => {
    if (pendingStreamingBottomFollowRef.current == null) {
      return;
    }
    clearTimeout(pendingStreamingBottomFollowRef.current);
    pendingStreamingBottomFollowRef.current = null;
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
      const next = Math.max(0, previous - load_batch_size);
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
  }, [load_batch_size]);

  const handleScroll = useCallback(() => {
    const el = messagesRef.current;
    if (!el) {
      return;
    }

    const currentScrollTop = el.scrollTop;
    const isScrollingUp = currentScrollTop < lastScrollTopRef.current - 0.5;
    lastScrollTopRef.current = currentScrollTop;

    const nextIsAtBottom = updateIsAtBottom(el);

    if (
      is_streaming &&
      userScrollIntentRef.current &&
      !nextIsAtBottom &&
      isScrollingUp
    ) {
      streamingFollowEnabledRef.current = false;
      clearScheduledStreamingBottomFollow();
    }

    if (
      currentScrollTop <= top_load_threshold &&
      isScrollingUp &&
      visibleStartRef.current > 0 &&
      !prependCompensationRef.current
    ) {
      loadOlderMessages();
    }
  }, [
    clearScheduledStreamingBottomFollow,
    is_streaming,
    loadOlderMessages,
    top_load_threshold,
    updateIsAtBottom,
  ]);

  const scrollToBottom = useCallback((behavior = "auto") => {
    const el = messagesRef.current;
    if (!el) {
      return;
    }

    const scrollHeight = el.scrollHeight;
    el.scrollTo({ top: scrollHeight, behavior });
    lastScrollTopRef.current = scrollHeight;
    isAtBottomRef.current = true;
    streamingFollowEnabledRef.current = true;
    userScrollIntentRef.current = false;
    setIsAtBottom(true);
    setIsAtTop(false);
  }, []);

  const handleUserScrollIntent = useCallback(() => {
    if (!is_streaming) {
      return;
    }
    userScrollIntentRef.current = true;
  }, [is_streaming]);

  const scheduleStreamingBottomFollow = useCallback(() => {
    if (pendingStreamingBottomFollowRef.current != null) {
      return;
    }
    pendingStreamingBottomFollowRef.current = setTimeout(() => {
      pendingStreamingBottomFollowRef.current = null;
      if (!streamingFollowEnabledRef.current) {
        return;
      }
      scrollToBottom("auto");
    }, STREAMING_BOTTOM_FOLLOW_MS);
  }, [scrollToBottom]);

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
    const nextStart = Math.max(0, messages.length - initial_visible_count);
    const shouldAdjustWindow = nextStart !== visibleStartRef.current;
    visibleStartRef.current = nextStart;
    if (shouldAdjustWindow) {
      pendingScrollToBottomRef.current = "auto";
      setVisibleStartIndex(nextStart);
      return;
    }

    scrollToBottom("auto");
  }, [initial_visible_count, messages.length, scrollToBottom]);

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

  const scrollToMessageIndex = useCallback(
    (index, behavior = "auto") => {
      const el = messagesRef.current;
      if (!el) {
        return;
      }
      const clamped = Math.max(0, Math.min(index, messages.length - 1));

      if (clamped >= visibleStartRef.current) {
        const node = messageNodeRefs.current.get(clamped);
        if (node) {
          el.scrollTo({ top: Math.max(0, node.offsetTop - 12), behavior });
          updateIsAtBottom(el);
          return;
        }
      }

      const nextStart = Math.max(0, clamped - load_batch_size);
      visibleStartRef.current = nextStart;
      pendingJumpActionRef.current = { type: "toIndex", index: clamped, behavior };
      setVisibleStartIndex(nextStart);
    },
    [messages.length, load_batch_size, updateIsAtBottom],
  );

  useEffect(() => {
    visibleStartRef.current = visibleStartIndex;
  }, [visibleStartIndex]);

  useEffect(() => {
    return () => clearScheduledStreamingBottomFollow();
  }, [clearScheduledStreamingBottomFollow]);

  useEffect(() => {
    if (activeChatIdRef.current === chat_id) {
      return;
    }

    activeChatIdRef.current = chat_id;
    lastScrollTopRef.current = 0;
    const bootStart = Math.max(0, messages.length - effectiveBootCount);
    const finalStart = Math.max(0, messages.length - initial_visible_count);
    visibleStartRef.current = bootStart;
    setVisibleStartIndex(bootStart);
    isAtBottomRef.current = true;
    streamingFollowEnabledRef.current = true;
    userScrollIntentRef.current = false;
    setIsAtBottom(true);
    setIsAtTop(true);
    pendingScrollToBottomRef.current = "auto";

    if (bootStart === finalStart) {
      return;
    }

    const expandToFinal = () => {
      if (activeChatIdRef.current !== chat_id) {
        return;
      }
      visibleStartRef.current = finalStart;
      setVisibleStartIndex(finalStart);
    };

    if (typeof window === "undefined") {
      expandToFinal();
      return;
    }

    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(expandToFinal, {
        timeout: 240,
      });
      return () => {
        if (typeof window.cancelIdleCallback === "function") {
          window.cancelIdleCallback(idleId);
        }
      };
    }

    const timerId = setTimeout(expandToFinal, 0);
    return () => clearTimeout(timerId);
  }, [chat_id, effectiveBootCount, initial_visible_count, messages.length]);

  useEffect(() => {
    if (messages.length > 0) {
      return;
    }

    visibleStartRef.current = 0;
    lastScrollTopRef.current = 0;
    setVisibleStartIndex(0);
    isAtBottomRef.current = true;
    streamingFollowEnabledRef.current = true;
    userScrollIntentRef.current = false;
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

    if (pendingAction.type === "toIndex") {
      const targetNode = messageNodeRefs.current.get(pendingAction.index);
      if (targetNode) {
        pendingJumpActionRef.current = null;
        el.scrollTo({
          top: Math.max(0, targetNode.offsetTop - 12),
          behavior: pendingAction.behavior || "auto",
        });
        updateIsAtBottom(el);
        return;
      }
      if (visibleStartRef.current > 0) {
        loadOlderMessages();
        return;
      }
      pendingJumpActionRef.current = null;
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

    if (is_streaming) {
      pendingScrollToBottomRef.current = null;
      if (streamingFollowEnabledRef.current) {
        scheduleStreamingBottomFollow();
      } else {
        clearScheduledStreamingBottomFollow();
      }
      return;
    }

    clearScheduledStreamingBottomFollow();

    if (pendingScrollToBottomRef.current) {
      scrollToBottom(pendingScrollToBottomRef.current);
      pendingScrollToBottomRef.current = null;
      return;
    }

    if (isAtBottom) {
      scrollToBottom(is_streaming ? "auto" : "smooth");
    }
  }, [
    clearScheduledStreamingBottomFollow,
    isAtBottom,
    is_streaming,
    messages,
    scheduleStreamingBottomFollow,
    scrollToBottom,
    safeVisibleStart,
  ]);

  useEffect(() => {
    const el = messagesRef.current;
    if (
      !el ||
      is_streaming ||
      prependCompensationRef.current ||
      messages.length === 0
    ) {
      return;
    }

    if (
      visibleStartRef.current > 0 &&
      el.scrollHeight <= el.clientHeight + top_load_threshold
    ) {
      loadOlderMessages();
    }
  }, [
    is_streaming,
    loadOlderMessages,
    messages,
    safeVisibleStart,
    top_load_threshold,
  ]);

  return {
    messagesRef,
    messageNodeRefs,
    safeVisibleStart,
    visibleMessages,
    isAtBottom,
    isAtTop,
    handleScroll,
    handleUserScrollIntent,
    handleBackToBottom,
    handleSkipToTop,
    handleJumpToPreviousMessage,
    scrollToMessageIndex,
  };
};

export default useMessageWindowScroll;

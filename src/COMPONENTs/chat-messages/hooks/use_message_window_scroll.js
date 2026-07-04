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
import { computeLandingTop } from "../message_viewport_geometry";

const STREAMING_BOTTOM_FOLLOW_MS = 64;
const LANDING_SETTLE_INTERVAL_MS = 50;
const LANDING_SETTLE_MAX_ATTEMPTS = 40;
const LANDING_TOP_EPSILON = 1;

export { computeLandingTop } from "../message_viewport_geometry";

export const useMessageWindowScroll = ({
  chat_id,
  messages,
  is_streaming,
  initial_visible_count,
  load_batch_size,
  top_load_threshold,
  boot_visible_count,
  bottom_viewport_inset = 0,
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
  const pendingStreamingBottomFollowTypeRef = useRef(null);
  const pendingJumpActionRef = useRef(null);
  const pendingLandingActionRef = useRef(null);
  const pendingLandingTimerRef = useRef(null);
  const pendingLandingObserverRef = useRef(null);
  const bottomSentinelRef = useRef(null);
  const activeChatIdRef = useRef(chat_id);
  const isAtBottomRef = useRef(true);
  const streamingFollowEnabledRef = useRef(true);
  const userScrollIntentRef = useRef(false);
  // 程序性滚动深度计数:每次内部 scrollTo/scrollTop 写(只在位置真的变了时)+1,
  // handleScroll 每消费一个 scroll 事件 -1。>0 时说明本次 scroll 是程序性产生的,
  // 只做测量、不改 follow/intent —— 否则吸底 rAF 自己产生的 scroll 会把用户的脱离重开。
  const programmaticScrollDepthRef = useRef(0);

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

  // 程序性滚动写:记录写前 scrollTop,执行写,只有当位置真的变了(会产生 scroll 事件)
  // 才 +1 计数。防"写了但值没变不产生 scroll 事件"导致计数泄漏、误吞下一次用户 scroll。
  const writeProgrammaticScroll = useCallback((el, apply) => {
    if (!el) {
      return;
    }
    const before = el.scrollTop;
    apply(el);
    if (el.scrollTop !== before) {
      programmaticScrollDepthRef.current += 1;
    }
  }, []);

  // 纯测量:只更新 isAtBottom/isAtTop 与 isAtBottomRef,不再改 follow/intent。
  // follow/intent 的状态迁移集中到 handleScroll 与显式动作里。
  const updateIsAtBottom = useCallback((el) => {
    const distance = el.scrollHeight - (el.scrollTop + el.clientHeight);
    const nextIsAtBottom = distance <= BOTTOM_FOLLOW_THRESHOLD;
    isAtBottomRef.current = nextIsAtBottom;
    setIsAtBottom(nextIsAtBottom);
    setIsAtTop(el.scrollTop <= TOP_EDGE_THRESHOLD);
    return nextIsAtBottom;
  }, []);

  const clearScheduledStreamingBottomFollow = useCallback(() => {
    if (pendingStreamingBottomFollowRef.current == null) {
      return;
    }
    if (
      pendingStreamingBottomFollowTypeRef.current === "raf" &&
      typeof window !== "undefined" &&
      typeof window.cancelAnimationFrame === "function"
    ) {
      window.cancelAnimationFrame(pendingStreamingBottomFollowRef.current);
    } else {
      clearTimeout(pendingStreamingBottomFollowRef.current);
    }
    pendingStreamingBottomFollowRef.current = null;
    pendingStreamingBottomFollowTypeRef.current = null;
  }, []);

  const clearLandingCorrection = useCallback(() => {
    if (pendingLandingTimerRef.current != null) {
      clearTimeout(pendingLandingTimerRef.current);
      pendingLandingTimerRef.current = null;
    }
    if (pendingLandingObserverRef.current) {
      pendingLandingObserverRef.current.disconnect();
      pendingLandingObserverRef.current = null;
    }
    pendingLandingActionRef.current = null;
  }, []);

  const beginExplicitScrollNavigation = useCallback(() => {
    clearLandingCorrection();
    clearScheduledStreamingBottomFollow();
    pendingScrollToBottomRef.current = null;
    isAtBottomRef.current = false;
    streamingFollowEnabledRef.current = false;
    userScrollIntentRef.current = true;
    setIsAtBottom(false);
  }, [clearLandingCorrection, clearScheduledStreamingBottomFollow]);

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

    // 区分程序性 / 用户滚动:程序性(吸底 rAF、scrollToBottom、landing、prepend 补偿等)
    // 产生的 scroll 事件只做测量,不改 follow/intent。
    const isProgrammatic = programmaticScrollDepthRef.current > 0;
    if (isProgrammatic) {
      programmaticScrollDepthRef.current -= 1;
    }

    const nextIsAtBottom = updateIsAtBottom(el);

    if (!isProgrammatic) {
      if (is_streaming && isScrollingUp && !nextIsAtBottom) {
        // 用户非程序性上滚(键盘翻页/拖选/触摸/滚轮补充)→ 流式期间立即脱离
        streamingFollowEnabledRef.current = false;
        userScrollIntentRef.current = true;
        clearScheduledStreamingBottomFollow();
      } else if (nextIsAtBottom) {
        // 用户主动滚回底部 → 恢复跟随(重新吸底只发生在这里与显式动作)
        streamingFollowEnabledRef.current = true;
        userScrollIntentRef.current = false;
      }
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

  const scrollToBottom = useCallback(
    (behavior = "auto") => {
      const el = messagesRef.current;
      if (!el) {
        return;
      }

      writeProgrammaticScroll(el, (node) => {
        node.scrollTo({ top: node.scrollHeight, behavior });
      });
      // 记录真实(clamped)scrollTop,而非 scrollHeight —— 真实 scrollTop 最大只到
      // scrollHeight-clientHeight,写 scrollHeight 会让后续事件被误判为"上滚"。
      lastScrollTopRef.current = el.scrollTop;
      isAtBottomRef.current = true;
      streamingFollowEnabledRef.current = true;
      userScrollIntentRef.current = false;
      setIsAtBottom(true);
      setIsAtTop(false);
    },
    [writeProgrammaticScroll],
  );

  const handleUserScrollIntent = useCallback(() => {
    clearLandingCorrection();
    if (!is_streaming) {
      return;
    }
    userScrollIntentRef.current = true;
  }, [clearLandingCorrection, is_streaming]);

  // 滚轮处理器:流式期间上滚(deltaY<0)立即脱离 —— 关跟随 + 取消 pending 吸底 rAF +
  // 置意图,不等 scroll 事件、不看 24px 阈值带(rAF 会在事件到达前把位置拍回底部)。
  const handleWheel = useCallback(
    (event) => {
      clearLandingCorrection();
      if (!is_streaming) {
        return;
      }
      const deltaY =
        event && typeof event.deltaY === "number" ? event.deltaY : 0;
      if (deltaY < 0) {
        streamingFollowEnabledRef.current = false;
        userScrollIntentRef.current = true;
        clearScheduledStreamingBottomFollow();
      }
    },
    [clearLandingCorrection, clearScheduledStreamingBottomFollow, is_streaming],
  );

  const scheduleStreamingBottomFollow = useCallback(() => {
    if (pendingStreamingBottomFollowRef.current != null) {
      return;
    }
    const follow = () => {
      pendingStreamingBottomFollowRef.current = null;
      pendingStreamingBottomFollowTypeRef.current = null;
      if (!streamingFollowEnabledRef.current) {
        return;
      }
      const el = messagesRef.current;
      if (!el) {
        return;
      }
      writeProgrammaticScroll(el, (node) => {
        node.scrollTop = Number.MAX_SAFE_INTEGER;
      });
      lastScrollTopRef.current = el.scrollTop;
      isAtBottomRef.current = true;
      setIsAtBottom(true);
      setIsAtTop(false);
    };

    if (
      typeof window !== "undefined" &&
      typeof window.requestAnimationFrame === "function"
    ) {
      pendingStreamingBottomFollowTypeRef.current = "raf";
      pendingStreamingBottomFollowRef.current =
        window.requestAnimationFrame(follow);
      return;
    }

    pendingStreamingBottomFollowTypeRef.current = "timeout";
    pendingStreamingBottomFollowRef.current = setTimeout(
      follow,
      STREAMING_BOTTOM_FOLLOW_MS,
    );
  }, [writeProgrammaticScroll]);

  const notifyStreamingContentCommitted = useCallback(() => {
    if (!is_streaming || !streamingFollowEnabledRef.current) {
      return;
    }
    scheduleStreamingBottomFollow();
  }, [is_streaming, scheduleStreamingBottomFollow]);

  const scrollToTop = useCallback(
    (behavior = "smooth") => {
      const el = messagesRef.current;
      if (!el) {
        return;
      }
      writeProgrammaticScroll(el, (node) => {
        node.scrollTo({ top: 0, behavior });
      });
      lastScrollTopRef.current = 0;
      updateIsAtBottom(el);
    },
    [updateIsAtBottom, writeProgrammaticScroll],
  );

  const scheduleLandingCorrection = useCallback(
    ({ index, within = 0, align = "top", initialTop }) => {
      clearLandingCorrection();

      const action = {
        index,
        within,
        align,
        lastTop: initialTop,
        attempts: 0,
      };
      pendingLandingActionRef.current = action;

      const tick = () => {
        if (pendingLandingTimerRef.current != null) {
          clearTimeout(pendingLandingTimerRef.current);
          pendingLandingTimerRef.current = null;
        }

        const current = pendingLandingActionRef.current;
        if (!current) {
          return;
        }

        const el = messagesRef.current;
        const targetNode = messageNodeRefs.current.get(current.index);
        if (!el || !targetNode) {
          clearLandingCorrection();
          return;
        }

        const nextTop = computeLandingTop({
          offsetTop: targetNode.offsetTop,
          within: current.within,
          align: current.align,
          viewportHeight: el.clientHeight,
          bottomInset: bottom_viewport_inset,
        });

        current.attempts += 1;
        if (Math.abs(nextTop - current.lastTop) > LANDING_TOP_EPSILON) {
          current.lastTop = nextTop;
          writeProgrammaticScroll(el, (node) => {
            node.scrollTo({ top: nextTop, behavior: "auto" });
          });
          lastScrollTopRef.current = el.scrollTop;
          updateIsAtBottom(el);
        }

        if (current.attempts >= LANDING_SETTLE_MAX_ATTEMPTS) {
          clearLandingCorrection();
          return;
        }

        pendingLandingTimerRef.current = setTimeout(
          tick,
          LANDING_SETTLE_INTERVAL_MS,
        );
      };

      const el = messagesRef.current;
      const targetNode = messageNodeRefs.current.get(index);
      if (
        typeof ResizeObserver !== "undefined" &&
        (targetNode || el?.firstElementChild)
      ) {
        const observer = new ResizeObserver(tick);
        if (targetNode) observer.observe(targetNode);
        if (el?.firstElementChild) observer.observe(el.firstElementChild);
        pendingLandingObserverRef.current = observer;
      }

      pendingLandingTimerRef.current = setTimeout(
        tick,
        LANDING_SETTLE_INTERVAL_MS,
      );
    },
    [
      bottom_viewport_inset,
      clearLandingCorrection,
      updateIsAtBottom,
      writeProgrammaticScroll,
    ],
  );

  const scrollToRenderedMessage = useCallback(
    ({ index, node, behavior = "auto", within = 0, align = "top", settle = true }) => {
      const el = messagesRef.current;
      if (!el || !node) {
        return false;
      }

      const top = computeLandingTop({
        offsetTop: node.offsetTop,
        within,
        align,
        viewportHeight: el.clientHeight,
        bottomInset: bottom_viewport_inset,
      });
      writeProgrammaticScroll(el, (host) => {
        host.scrollTo({ top, behavior });
      });
      lastScrollTopRef.current = el.scrollTop;
      updateIsAtBottom(el);
      // settle:false(拖动路径)跳过结算循环:每帧都重新落位,残留的 landing
      // correction 会在松手后把滚动位置拽回,与拖动竞态。点击路径保留 settle。
      if (settle) {
        scheduleLandingCorrection({ index, within, align, initialTop: top });
      }
      return true;
    },
    [
      bottom_viewport_inset,
      scheduleLandingCorrection,
      updateIsAtBottom,
      writeProgrammaticScroll,
    ],
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

      writeProgrammaticScroll(el, (node) => {
        node.scrollTo({
          top: Math.max(0, previousNode.offsetTop - 12),
          behavior,
        });
      });
      lastScrollTopRef.current = el.scrollTop;
      updateIsAtBottom(el);
      return true;
    },
    [getSortedRenderedEntries, updateIsAtBottom, writeProgrammaticScroll],
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

  // 返回是否"同步完成滚动":目标已在虚拟窗口内、节点已渲染 → true;
  // 需异步扩窗才能落位 → false。minimap 据此决定 pointerdown 是否进入拖动态。
  const scrollToMessageIndex = useCallback(
    (index, behavior = "auto", { within = 0, align = "top", settle = true } = {}) => {
      const el = messagesRef.current;
      if (!el) {
        return false;
      }
      const clamped = Math.max(0, Math.min(index, messages.length - 1));
      beginExplicitScrollNavigation();

      if (clamped >= visibleStartRef.current) {
        const node = messageNodeRefs.current.get(clamped);
        if (
          scrollToRenderedMessage({
            index: clamped,
            node,
            behavior,
            within,
            align,
            settle,
          })
        ) {
          return true;
        }
      }

      const nextStart = Math.max(0, clamped - load_batch_size);
      visibleStartRef.current = nextStart;
      pendingJumpActionRef.current = {
        type: "toIndex",
        index: clamped,
        behavior,
        within,
        align,
        settle,
      };
      setVisibleStartIndex(nextStart);
      return false;
    },
    [
      beginExplicitScrollNavigation,
      messages.length,
      load_batch_size,
      scrollToRenderedMessage,
    ],
  );

  useEffect(() => {
    visibleStartRef.current = visibleStartIndex;
  }, [visibleStartIndex]);

  useEffect(() => {
    return () => {
      clearScheduledStreamingBottomFollow();
      clearLandingCorrection();
    };
  }, [clearLandingCorrection, clearScheduledStreamingBottomFollow]);

  useEffect(() => {
    if (activeChatIdRef.current === chat_id) {
      return;
    }

    activeChatIdRef.current = chat_id;
    lastScrollTopRef.current = 0;
    clearLandingCorrection();
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
  }, [
    chat_id,
    clearLandingCorrection,
    effectiveBootCount,
    initial_visible_count,
    messages.length,
  ]);

  useEffect(() => {
    if (messages.length > 0) {
      return;
    }

    visibleStartRef.current = 0;
    lastScrollTopRef.current = 0;
    clearLandingCorrection();
    setVisibleStartIndex(0);
    isAtBottomRef.current = true;
    streamingFollowEnabledRef.current = true;
    userScrollIntentRef.current = false;
    setIsAtBottom(true);
    setIsAtTop(true);
    pendingScrollToBottomRef.current = "auto";
  }, [clearLandingCorrection, messages.length]);

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
        writeProgrammaticScroll(el, (node) => {
          node.scrollTop = previousScrollTop + delta;
        });
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
      if (
        scrollToRenderedMessage({
          index: pendingAction.index,
          node: targetNode,
          behavior: pendingAction.behavior || "auto",
          within: pendingAction.within ?? 0,
          align: pendingAction.align ?? "top",
          settle: pendingAction.settle ?? true,
        })
      ) {
        pendingJumpActionRef.current = null;
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
    scrollToRenderedMessage,
    scrollToTop,
    updateIsAtBottom,
    writeProgrammaticScroll,
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
    bottomSentinelRef,
    messageNodeRefs,
    safeVisibleStart,
    visibleMessages,
    isAtBottom,
    isAtTop,
    handleScroll,
    handleUserScrollIntent,
    handleWheel,
    notifyStreamingContentCommitted,
    handleBackToBottom,
    handleSkipToTop,
    handleJumpToPreviousMessage,
    scrollToMessageIndex,
  };
};

export default useMessageWindowScroll;

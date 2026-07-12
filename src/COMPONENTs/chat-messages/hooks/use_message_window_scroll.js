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
const LANDING_OBSERVER_MAX_MS = 2000;

// 双向窗口上限:窗口原本只增不减(loadOlderMessages 只减小 visibleStart,无对称卸载),
// 长会话滚到顶后 N 条全挂载、滚回底不释放 → "越用越卡"。收缩把 visibleStart 抬回
// messages.length - max_mounted_count,但只在「贴底跟随」时做(视口内容在窗口尾部,
// 抬起窗口头部不影响可见区),且经 trailing debounce 触发(滚动停止后 / 流式吸底落地后),
// 绝不在每个 scroll 事件里同步收缩。
// 初始仍只挂 12 条；40 是轻量短消息不足一屏时的自适应硬上限。重内容通常
// 12 条内就已可滚动，不会扩到 40；无论历史多长，DOM 都不会越过这个边界。
const DEFAULT_MAX_MOUNTED_COUNT = 40;
const WINDOW_TRIM_DEBOUNCE_MS = 200;

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
  max_mounted_count = DEFAULT_MAX_MOUNTED_COUNT,
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
  const pendingLandingExpiryTimerRef = useRef(null);
  const trimDebounceTimerRef = useRef(null);
  const windowShiftAnchorRef = useRef(null);
  // Target changes arm exactly one baseline measurement. The layout pass
  // consumes this flag once 12 rows are committed; a short target then grows
  // directly to the hard cap in one state update instead of 12→18→…→40.
  const adaptiveMeasurePendingRef = useRef(true);
  const smoothScrollActiveRef = useRef(false);
  const smoothScrollEndTimerRef = useRef(null);
  // 收缩读的是「最新」消息长度:吸底 follow 的 rAF/timer 回调可能在一次 append 之后才落地,
  // 若闭包捕获旧长度会漏收缩。用 ref 承载最新长度,让收缩逻辑与调度时机解耦。
  const messagesLengthRef = useRef(messages.length);
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
  const [mountedWindowCount, setMountedWindowCount] = useState(
    initial_visible_count,
  );
  const mountedWindowCountRef = useRef(initial_visible_count);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [isAtTop, setIsAtTop] = useState(true);

  // Event callbacks must only observe committed renderer state. Writing these
  // refs during render leaks values from a suspended/aborted concurrent render
  // into handlers that still belong to the previous committed tree.
  useLayoutEffect(() => {
    messagesLengthRef.current = messages.length;
    mountedWindowCountRef.current = mountedWindowCount;
  }, [messages.length, mountedWindowCount]);

  // 收缩上限有下限保护:不得小于 initial_visible_count —— 收缩到比初始窗口还小
  // 会跟开屏窗口语义打架(刚打开就收缩)。向上翻页把窗口顶过上限后滚回底再收缩
  // 属正常节奏(贴底 + 防抖才发生),不算抖动。
  const resolvedMaxMountedCount = Math.max(
    max_mounted_count,
    initial_visible_count,
  );
  const effectiveMountedCount = Math.min(
    resolvedMaxMountedCount,
    Math.max(1, mountedWindowCount),
  );

  const isChatSwitchPending = activeChatIdRef.current !== chat_id;
  const stateVisibleStart = isChatSwitchPending
    ? Math.max(0, messages.length - effectiveBootCount)
    : visibleStartIndex;
  const renderMountedCount = isChatSwitchPending
    ? effectiveBootCount
    : effectiveMountedCount;
  const shouldRenderLatestWindow =
    !isChatSwitchPending &&
    isAtBottomRef.current &&
    streamingFollowEnabledRef.current &&
    !userScrollIntentRef.current &&
    messages.length > stateVisibleStart + renderMountedCount;
  const renderVisibleStart = shouldRenderLatestWindow
    ? Math.max(0, messages.length - renderMountedCount)
    : stateVisibleStart;
  const safeVisibleStart = Math.max(
    0,
    Math.min(renderVisibleStart, messages.length),
  );
  const safeVisibleEnd = Math.min(
    messages.length,
    safeVisibleStart + renderMountedCount,
  );
  const visibleMessages = useMemo(
    () => messages.slice(safeVisibleStart, safeVisibleEnd),
    [messages, safeVisibleEnd, safeVisibleStart],
  );

  const clearProgrammaticSmoothScroll = useCallback(() => {
    smoothScrollActiveRef.current = false;
    if (smoothScrollEndTimerRef.current != null) {
      clearTimeout(smoothScrollEndTimerRef.current);
      smoothScrollEndTimerRef.current = null;
    }
  }, []);

  const holdProgrammaticSmoothScroll = useCallback(() => {
    smoothScrollActiveRef.current = true;
    if (smoothScrollEndTimerRef.current != null) {
      clearTimeout(smoothScrollEndTimerRef.current);
    }
    smoothScrollEndTimerRef.current = setTimeout(() => {
      smoothScrollEndTimerRef.current = null;
      smoothScrollActiveRef.current = false;
    }, 160);
  }, []);

  // 程序性滚动写:记录写前 scrollTop,执行写,只有当位置真的变了(会产生 scroll 事件)
  // 才 +1 计数。防"写了但值没变不产生 scroll 事件"导致计数泄漏、误吞下一次用户 scroll。
  const writeProgrammaticScroll = useCallback(
    (el, apply, behavior = "auto") => {
      if (!el) {
        return;
      }
      if (behavior === "smooth") {
        holdProgrammaticSmoothScroll();
      } else {
        clearProgrammaticSmoothScroll();
      }
      const before = el.scrollTop;
      apply(el);
      if (el.scrollTop !== before) {
        programmaticScrollDepthRef.current += 1;
      }
    },
    [clearProgrammaticSmoothScroll, holdProgrammaticSmoothScroll],
  );

  // 纯测量:只更新 isAtBottom/isAtTop 与 isAtBottomRef,不再改 follow/intent。
  // follow/intent 的状态迁移集中到 handleScroll 与显式动作里。
  const updateIsAtBottom = useCallback((el) => {
    const distance = el.scrollHeight - (el.scrollTop + el.clientHeight);
    const hasNewerMessages =
      visibleStartRef.current + effectiveMountedCount <
      messagesLengthRef.current;
    const nextIsAtBottom =
      !hasNewerMessages && distance <= BOTTOM_FOLLOW_THRESHOLD;
    isAtBottomRef.current = nextIsAtBottom;
    setIsAtBottom(nextIsAtBottom);
    setIsAtTop(
      visibleStartRef.current === 0 && el.scrollTop <= TOP_EDGE_THRESHOLD,
    );
    return nextIsAtBottom;
  }, [effectiveMountedCount]);

  const captureWindowShiftAnchor = useCallback((index) => {
    const el = messagesRef.current;
    const node = messageNodeRefs.current.get(index);
    if (!el || !node || !Number.isFinite(Number(node.offsetTop))) {
      windowShiftAnchorRef.current = null;
      return;
    }
    windowShiftAnchorRef.current = {
      index,
      viewportOffset: Number(node.offsetTop) - el.scrollTop,
    };
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
    if (pendingLandingExpiryTimerRef.current != null) {
      clearTimeout(pendingLandingExpiryTimerRef.current);
      pendingLandingExpiryTimerRef.current = null;
    }
    if (pendingLandingObserverRef.current) {
      pendingLandingObserverRef.current.disconnect();
      pendingLandingObserverRef.current = null;
    }
    pendingLandingActionRef.current = null;
  }, []);

  const beginExplicitScrollNavigation = useCallback(() => {
    clearProgrammaticSmoothScroll();
    clearLandingCorrection();
    clearScheduledStreamingBottomFollow();
    pendingScrollToBottomRef.current = null;
    isAtBottomRef.current = false;
    streamingFollowEnabledRef.current = false;
    userScrollIntentRef.current = true;
    setIsAtBottom(false);
  }, [
    clearProgrammaticSmoothScroll,
    clearLandingCorrection,
    clearScheduledStreamingBottomFollow,
  ]);

  const loadOlderMessages = useCallback(() => {
    const el = messagesRef.current;
    if (!el) {
      return;
    }
    const previous = visibleStartRef.current;
    if (previous <= 0) {
      return;
    }
    const targetMountedCount = Math.min(
      resolvedMaxMountedCount,
      initial_visible_count,
    );
    const next = Math.max(0, previous - load_batch_size);
    if (next === previous) {
      return;
    }

    if (previous < next + targetMountedCount) {
      // Every target window starts from the small baseline. The old first row
      // remains in that baseline and is kept at the same viewport offset.
      captureWindowShiftAnchor(previous);
    }
    adaptiveMeasurePendingRef.current = true;
    visibleStartRef.current = next;
    setMountedWindowCount(targetMountedCount);
    setVisibleStartIndex(next);
  }, [
    captureWindowShiftAnchor,
    initial_visible_count,
    load_batch_size,
    resolvedMaxMountedCount,
  ]);

  const loadNewerMessages = useCallback(() => {
    const currentLength = messagesLengthRef.current;
    const previous = visibleStartRef.current;
    const currentEnd = Math.min(
      currentLength,
      previous + effectiveMountedCount,
    );
    if (currentEnd >= currentLength) {
      return;
    }
    const targetMountedCount = Math.min(
      resolvedMaxMountedCount,
      initial_visible_count,
    );
    const retainedBeforeAnchor = Math.max(
      0,
      targetMountedCount - load_batch_size,
    );
    const next = Math.min(
      Math.max(0, currentLength - targetMountedCount),
      Math.max(0, currentEnd - retainedBeforeAnchor),
    );
    if (next === previous) {
      return;
    }

    const anchorIndex = currentEnd - 1;
    if (anchorIndex >= next) {
      captureWindowShiftAnchor(anchorIndex);
    }
    adaptiveMeasurePendingRef.current = true;
    visibleStartRef.current = next;
    setMountedWindowCount(targetMountedCount);
    setVisibleStartIndex(next);
  }, [
    captureWindowShiftAnchor,
    effectiveMountedCount,
    initial_visible_count,
    load_batch_size,
    resolvedMaxMountedCount,
  ]);

  const clearTrimDebounce = useCallback(() => {
    if (trimDebounceTimerRef.current != null) {
      clearTimeout(trimDebounceTimerRef.current);
      trimDebounceTimerRef.current = null;
    }
  }, []);

  // 向下收缩:只在贴底跟随时把 visibleStart 抬回 messages.length - 上限,复用既有
  // prependCompensation → layoutEffect 补偿路径(贴底时走 scrollToBottom("auto") 重新钉底,
  // 维持程序性滚动计数不变量)。任何可能与其它精密状态机竞态的时机(landing 结算 /
  // 待落位跳转 / 未消费的 prepend 补偿 / 用户已表达脱离意图 / 不在底部)
  // 一律跳过本轮收缩,存疑宁可不收。
  const trimMountedWindowToBottom = useCallback(() => {
    const el = messagesRef.current;
    if (!el) {
      return;
    }
    if (!isAtBottomRef.current) {
      return;
    }
    if (
      userScrollIntentRef.current ||
      prependCompensationRef.current ||
      pendingLandingActionRef.current ||
      pendingJumpActionRef.current
    ) {
      return;
    }
    const currentLength = messagesLengthRef.current;
    const currentStart = visibleStartRef.current;
    const mountedCount = currentLength - currentStart;
    if (mountedCount <= resolvedMaxMountedCount) {
      return;
    }
    const targetStart = currentLength - resolvedMaxMountedCount;
    if (targetStart <= currentStart) {
      return;
    }
    // 记录收缩前 scrollHeight/scrollTop,交给 layoutEffect 的补偿路径:贴底时重新钉底,
    // 补偿写通过 writeProgrammaticScroll(计入程序性滚动)不会误触发用户脱离。
    prependCompensationRef.current = {
      previousScrollHeight: el.scrollHeight,
      previousScrollTop: el.scrollTop,
    };
    visibleStartRef.current = targetStart;
    setVisibleStartIndex(targetStart);
  }, [resolvedMaxMountedCount]);

  const scheduleWindowTrim = useCallback(() => {
    clearTrimDebounce();
    trimDebounceTimerRef.current = setTimeout(() => {
      trimDebounceTimerRef.current = null;
      trimMountedWindowToBottom();
    }, WINDOW_TRIM_DEBOUNCE_MS);
  }, [clearTrimDebounce, trimMountedWindowToBottom]);

  const handleScroll = useCallback(() => {
    const el = messagesRef.current;
    if (!el) {
      return;
    }

    const currentScrollTop = el.scrollTop;
    const isScrollingUp = currentScrollTop < lastScrollTopRef.current - 0.5;
    const isScrollingDown = currentScrollTop > lastScrollTopRef.current + 0.5;
    lastScrollTopRef.current = currentScrollTop;
    const currentStart = visibleStartRef.current;
    const currentEnd = Math.min(
      messagesLengthRef.current,
      currentStart + effectiveMountedCount,
    );
    const firstRenderedNode = messageNodeRefs.current.get(currentStart);
    const lastRenderedNode = messageNodeRefs.current.get(currentEnd - 1);
    const nearWindowTop = firstRenderedNode
      ? currentScrollTop <= firstRenderedNode.offsetTop + top_load_threshold
      : currentScrollTop <= top_load_threshold;
    const renderedBottom = lastRenderedNode
      ? Number(lastRenderedNode.offsetTop) +
        Math.max(0, Number(lastRenderedNode.offsetHeight) || 0)
      : 0;
    const distanceToWindowBottom = renderedBottom
      ? renderedBottom - (currentScrollTop + el.clientHeight)
      : el.scrollHeight - (currentScrollTop + el.clientHeight);
    const nearWindowBottom = distanceToWindowBottom <= top_load_threshold;

    // 区分程序性 / 用户滚动:程序性(吸底 rAF、scrollToBottom、landing、prepend 补偿等)
    // 产生的 scroll 事件只做测量,不改 follow/intent。
    const isProgrammatic =
      programmaticScrollDepthRef.current > 0 ||
      smoothScrollActiveRef.current;
    if (programmaticScrollDepthRef.current > 0) {
      programmaticScrollDepthRef.current -= 1;
    }
    if (smoothScrollActiveRef.current) {
      holdProgrammaticSmoothScroll();
    }

    const nextIsAtBottom = updateIsAtBottom(el);

    if (!isProgrammatic) {
      // 真实用户滚动 = 用户已接管视口:取消在飞的落位结算循环(scheduleLandingCorrection)。
      // 否则它盯着 firstElementChild 的 ResizeObserver 会在随后的 prepend / 懒渲染 settle
      // 触发时,按已下移的 targetNode.offsetTop 重算落点并 scrollTo,把 scrollTop 一跳拽回
      // 旧跳转目标 —— 即用户上滚时偶发看到的"瞬移一段距离"。落位自身的 scrollTo 走
      // writeProgrammaticScroll(isProgrammatic=true),不会命中这里自取消;与 handleWheel /
      // handleUserScrollIntent 已有的清除保持一致,只是补上键盘/拖选等不经它们的上滚路径。
      if (pendingLandingActionRef.current) {
        clearLandingCorrection();
      }
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
      nearWindowTop &&
      !isProgrammatic &&
      isScrollingUp &&
      visibleStartRef.current > 0 &&
      !prependCompensationRef.current
    ) {
      loadOlderMessages();
    }

    if (
      nearWindowBottom &&
      !isProgrammatic &&
      isScrollingDown &&
      visibleStartRef.current + effectiveMountedCount <
        messagesLengthRef.current &&
      !windowShiftAnchorRef.current
    ) {
      loadNewerMessages();
    }

    // 滚动停止后(trailing debounce)再考虑向下收缩 —— 不在每个 scroll 事件里同步收缩。
    scheduleWindowTrim();
  }, [
    clearLandingCorrection,
    clearScheduledStreamingBottomFollow,
    is_streaming,
    holdProgrammaticSmoothScroll,
    loadOlderMessages,
    loadNewerMessages,
    effectiveMountedCount,
    scheduleWindowTrim,
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
      }, behavior);
      // 记录真实(clamped)scrollTop,而非 scrollHeight —— 真实 scrollTop 最大只到
      // scrollHeight-clientHeight,写 scrollHeight 会让后续事件被误判为"上滚"。
      lastScrollTopRef.current = el.scrollTop;
      isAtBottomRef.current = true;
      streamingFollowEnabledRef.current = true;
      userScrollIntentRef.current = false;
      setIsAtBottom(true);
      setIsAtTop(
        visibleStartRef.current === 0 &&
          el.scrollTop <= TOP_EDGE_THRESHOLD,
      );
    },
    [writeProgrammaticScroll],
  );

  const handlePointerInteraction = useCallback(() => {
    clearProgrammaticSmoothScroll();
    clearLandingCorrection();
  }, [clearLandingCorrection, clearProgrammaticSmoothScroll]);

  const handleUserScrollIntent = useCallback(() => {
    handlePointerInteraction();
    if (!is_streaming) {
      return;
    }
    userScrollIntentRef.current = true;
  }, [handlePointerInteraction, is_streaming]);

  // 滚轮处理器:流式期间上滚(deltaY<0)立即脱离 —— 关跟随 + 取消 pending 吸底 rAF +
  // 置意图,不等 scroll 事件、不看 24px 阈值带(rAF 会在事件到达前把位置拍回底部)。
  const handleWheel = useCallback(
    (event) => {
      const deltaY =
        event && typeof event.deltaY === "number" ? event.deltaY : 0;
      if (deltaY !== 0) {
        clearProgrammaticSmoothScroll();
      }
      // 边缘哑滚轮守卫:推不动视口的滚轮不构成"用户接管"。贴底后的向下滚轮
      // (典型为触控板惯性余量,可持续 1s+)本身滚不动任何东西,却会掐掉刚点的
      // to-top 落位 —— 即"底部按 to-top 有时失效"。贴顶向上同理。
      // 真实的反向接管(在底部向上滚)不受影响,照常取消。
      const el = messagesRef.current;
      const atBottomNoop =
        deltaY > 0 &&
        el &&
        el.scrollHeight - el.scrollTop - el.clientHeight <= 1;
      const atTopNoop = deltaY < 0 && el && el.scrollTop <= 0;

      if (!atBottomNoop && !atTopNoop) {
        clearLandingCorrection();
      }
      if (!is_streaming) {
        return;
      }
      if (deltaY < 0) {
        streamingFollowEnabledRef.current = false;
        userScrollIntentRef.current = true;
        clearScheduledStreamingBottomFollow();
      }
    },
    [
      clearLandingCorrection,
      clearProgrammaticSmoothScroll,
      clearScheduledStreamingBottomFollow,
      is_streaming,
    ],
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
      // 流式 append 把窗口撑过上限后,吸底落地的这一刻正好是安全收缩点(已贴底、
      // 已钉底),顺手收缩一次,避免流式期间挂载数单调增长。
      trimMountedWindowToBottom();
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
  }, [trimMountedWindowToBottom, writeProgrammaticScroll]);

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
      }, behavior);
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
        stableAttempts: 0,
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

        // smooth 在飞守卫:结算补正用 behavior:"auto" 直写,若在原生 smooth 动画
        // 进行中触发会掐断动画、瞬间钉到补正点(窗内 smooth 跳转也变瞬移)。
        // 动画在飞时不比较漂移、不消耗 attempts,只等下一个 tick;
        // smooth hold 下降沿(160ms 无滚动事件)之后照常补正,职责不变。
        if (smoothScrollActiveRef.current) {
          pendingLandingTimerRef.current = setTimeout(
            tick,
            LANDING_SETTLE_INTERVAL_MS,
          );
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
          current.stableAttempts = 0;
          writeProgrammaticScroll(el, (node) => {
            node.scrollTo({ top: nextTop, behavior: "auto" });
          });
          lastScrollTopRef.current = el.scrollTop;
          updateIsAtBottom(el);
        } else {
          current.stableAttempts += 1;
        }

        if (current.attempts >= LANDING_SETTLE_MAX_ATTEMPTS) {
          clearLandingCorrection();
          return;
        }

        // ResizeObserver remains armed for genuinely late image/Markdown
        // growth. Once three polls are stable, stop waking the main thread
        // every 50ms; a later observer callback restarts settling if needed.
        if (
          current.stableAttempts >= 3 &&
          pendingLandingObserverRef.current
        ) {
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

      pendingLandingExpiryTimerRef.current = setTimeout(() => {
        pendingLandingExpiryTimerRef.current = null;
        clearLandingCorrection();
      }, LANDING_OBSERVER_MAX_MS);
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
      }, behavior);
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
      }, behavior);
      lastScrollTopRef.current = el.scrollTop;
      updateIsAtBottom(el);
      return true;
    },
    [getSortedRenderedEntries, updateIsAtBottom, writeProgrammaticScroll],
  );

  const handleBackToBottom = useCallback(() => {
    // Back-to-bottom supersedes every older navigation contract. In
    // particular, a late ResizeObserver callback from a minimap landing must
    // never pull the viewport away from the bottom again.
    clearProgrammaticSmoothScroll();
    clearLandingCorrection();
    clearScheduledStreamingBottomFollow();
    clearTrimDebounce();
    pendingJumpActionRef.current = null;
    pendingScrollToBottomRef.current = null;
    windowShiftAnchorRef.current = null;
    prependCompensationRef.current = null;

    const nextStart = Math.max(
      0,
      messagesLengthRef.current - initial_visible_count,
    );
    const shouldAdjustWindow =
      nextStart !== visibleStartRef.current ||
      mountedWindowCountRef.current !== initial_visible_count;
    visibleStartRef.current = nextStart;
    isAtBottomRef.current = true;
    streamingFollowEnabledRef.current = true;
    userScrollIntentRef.current = false;
    setIsAtBottom(true);
    if (shouldAdjustWindow) {
      adaptiveMeasurePendingRef.current = true;
      pendingScrollToBottomRef.current = "auto";
      setMountedWindowCount(initial_visible_count);
      setVisibleStartIndex(nextStart);
      return;
    }

    scrollToBottom("auto");
  }, [
    clearLandingCorrection,
    clearProgrammaticSmoothScroll,
    clearScheduledStreamingBottomFollow,
    clearTrimDebounce,
    initial_visible_count,
    scrollToBottom,
  ]);

  const handleSkipToTop = useCallback(() => {
    beginExplicitScrollNavigation();
    pendingJumpActionRef.current = null;
    const currentStart = visibleStartRef.current;
    if (currentStart === 0) {
      scrollToTop("smooth");
      return;
    }

    visibleStartRef.current = 0;
    adaptiveMeasurePendingRef.current = true;
    pendingJumpActionRef.current = { type: "top", behavior: "auto" };
    setMountedWindowCount(initial_visible_count);
    setVisibleStartIndex(0);
  }, [
    beginExplicitScrollNavigation,
    initial_visible_count,
    scrollToTop,
  ]);

  const handleJumpToPreviousMessage = useCallback(() => {
    if (jumpToPreviousRenderedMessage("smooth")) {
      return;
    }

    if (visibleStartRef.current > 0) {
      pendingJumpActionRef.current = { type: "previous", behavior: "auto" };
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

      const winStart = visibleStartRef.current;
      const winEnd = winStart + mountedWindowCountRef.current;

      if (clamped >= winStart) {
        const node = messageNodeRefs.current.get(clamped);
        // 窗内可达性判定:目标虽已挂载,但期望落位 top 超出当前挂载内容的可滚
        // 上限、且窗口下方还有未挂载消息时,浏览器会把 scrollTop 钳在挂载底部
        // → 视口永远走不到目标 → ±1 步进死锁(点了没反应)。视为窗内不可达,
        // 落到下方移窗路径;贴真实底部(下方无未挂载消息)的合法钳制不受影响。
        const hasUnmountedNewer = winEnd < messages.length;
        const reachable =
          !node ||
          !hasUnmountedNewer ||
          computeLandingTop({
            offsetTop: node.offsetTop,
            within,
            align,
            viewportHeight: el.clientHeight,
            bottomInset: bottom_viewport_inset,
          }) <=
            el.scrollHeight - el.clientHeight;
        if (
          node &&
          reachable &&
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

      // 邻窗滑动:目标出窗不超过一个批次(pill ±1 连点的必然形态)时保留 smooth——
      // 先挂 pending(保留原 behavior),用 loadOlder/NewerMessages 移窗(自带
      // windowShiftAnchor 补偿)。消费端 layoutEffect 先执行 anchor 补偿块、后执行
      // pendingJumpAction 块(顺序不变量,勿重排):同一帧内先把视觉位移补回零,
      // 再从原位发起 smooth 落位 —— 跨窗强制 auto 所防的"smooth 跨越 DOM 替换
      // 边界"在此不会发生。远跳不满足邻窗条件,照旧走下方跨窗 auto(竞态防护保留)。
      if (behavior === "smooth") {
        const nearAbove =
          clamped < winStart && clamped >= winStart - load_batch_size;
        const nearBelowOrUnreachable =
          clamped >= winStart && clamped < winEnd + load_batch_size;
        if (nearAbove || nearBelowOrUnreachable) {
          pendingJumpActionRef.current = {
            type: "toIndex",
            index: clamped,
            behavior,
            within,
            align,
            settle,
          };
          if (nearAbove) {
            loadOlderMessages();
          } else {
            loadNewerMessages();
          }
          if (visibleStartRef.current !== winStart) {
            return false;
          }
          // 窗口没动(loader 边界钳制):清 pending,落回跨窗路径
          pendingJumpActionRef.current = null;
        }
      }

      const targetMountedCount = Math.min(
        resolvedMaxMountedCount,
        initial_visible_count,
      );
      const nextStart = Math.max(
        0,
        Math.min(
          clamped - load_batch_size,
          messages.length - targetMountedCount,
        ),
      );
      const landingAction = {
        type: "toIndex",
        index: clamped,
        // Cross-window navigation swaps the DOM first. A native smooth scroll
        // across that boundary races the replacement; only in-window targets
        // retain the caller's smooth behavior.
        behavior: "auto",
        within,
        align,
        settle,
      };
      adaptiveMeasurePendingRef.current = true;
      visibleStartRef.current = nextStart;
      pendingJumpActionRef.current = landingAction;
      setMountedWindowCount(targetMountedCount);
      setVisibleStartIndex(nextStart);
      return false;
    },
    [
      beginExplicitScrollNavigation,
      bottom_viewport_inset,
      messages.length,
      load_batch_size,
      loadNewerMessages,
      loadOlderMessages,
      initial_visible_count,
      resolvedMaxMountedCount,
      scrollToRenderedMessage,
    ],
  );

  // 视口页步进:±1 消息不可得(深读超屏消息,minimap PREV/NEXT 的 next===cur
  // 死区)时的退化动作。clamp 到真实 maxScroll;贴边隐藏由调用方的 pill 显隐兜底。
  const scrollViewportByPage = useCallback(
    (direction, behavior = "smooth") => {
      const el = messagesRef.current;
      if (!el) {
        return;
      }
      beginExplicitScrollNavigation();
      const page = Math.max(
        80,
        (el.clientHeight - bottom_viewport_inset) * 0.85,
      );
      const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
      const top = Math.max(
        0,
        Math.min(maxScroll, el.scrollTop + Math.sign(direction) * page),
      );
      writeProgrammaticScroll(
        el,
        (node) => {
          node.scrollTo({ top, behavior });
        },
        behavior,
      );
      lastScrollTopRef.current = el.scrollTop;
      updateIsAtBottom(el);
    },
    [
      beginExplicitScrollNavigation,
      bottom_viewport_inset,
      updateIsAtBottom,
      writeProgrammaticScroll,
    ],
  );

  useEffect(() => {
    visibleStartRef.current = visibleStartIndex;
  }, [visibleStartIndex]);

  useEffect(() => {
    return () => {
      clearScheduledStreamingBottomFollow();
      clearLandingCorrection();
      clearProgrammaticSmoothScroll();
      clearTrimDebounce();
    };
  }, [
    clearLandingCorrection,
    clearProgrammaticSmoothScroll,
    clearScheduledStreamingBottomFollow,
    clearTrimDebounce,
  ]);

  useLayoutEffect(() => {
    if (activeChatIdRef.current === chat_id) {
      return;
    }

    activeChatIdRef.current = chat_id;
    lastScrollTopRef.current = 0;
    clearScheduledStreamingBottomFollow();
    clearLandingCorrection();
    clearProgrammaticSmoothScroll();
    clearTrimDebounce();
    pendingJumpActionRef.current = null;
    pendingScrollToBottomRef.current = null;
    windowShiftAnchorRef.current = null;
    prependCompensationRef.current = null;
    programmaticScrollDepthRef.current = 0;
    const currentLength = messagesLengthRef.current;
    const bootStart = Math.max(0, currentLength - effectiveBootCount);
    adaptiveMeasurePendingRef.current = true;
    visibleStartRef.current = bootStart;
    setMountedWindowCount(effectiveBootCount);
    setVisibleStartIndex(bootStart);
    isAtBottomRef.current = true;
    streamingFollowEnabledRef.current = true;
    userScrollIntentRef.current = false;
    setIsAtBottom(true);
    setIsAtTop(true);
    if (messagesRef.current) {
      scrollToBottom("auto");
    } else {
      pendingScrollToBottomRef.current = "auto";
    }

    if (effectiveBootCount >= initial_visible_count) {
      return;
    }

    const expandToFinal = () => {
      if (activeChatIdRef.current !== chat_id) {
        return;
      }
      // A short target may already have expanded beyond the baseline in a
      // pre-paint layout pass. Never shrink 18/24/.../40 back to 12 here.
      if (mountedWindowCountRef.current >= initial_visible_count) {
        return;
      }
      const latestLength = messagesLengthRef.current;
      const finalStart = Math.max(0, latestLength - initial_visible_count);
      // boot(3 条)→ final(12 条)的扩窗是一次 prepend(旧消息补到顶部)。设
      // prependCompensation,让既有 layoutEffect 补偿路径在 paint 前处理:开会话时
      // isAtBottom 为 true → 走 scrollToBottom("auto") 钉底,消除 post-paint smooth 闪动。
      // messagesRef 为空时跳过(容错),交回浏览器 scroll anchoring。
      const el = messagesRef.current;
      if (el) {
        prependCompensationRef.current = {
          previousScrollHeight: el.scrollHeight,
          previousScrollTop: el.scrollTop,
        };
      }
      visibleStartRef.current = finalStart;
      setMountedWindowCount(initial_visible_count);
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
    clearProgrammaticSmoothScroll,
    clearScheduledStreamingBottomFollow,
    clearTrimDebounce,
    effectiveBootCount,
    initial_visible_count,
    scrollToBottom,
  ]);

  useLayoutEffect(() => {
    if (!shouldRenderLatestWindow) return;
    visibleStartRef.current = renderVisibleStart;
    pendingScrollToBottomRef.current = "auto";
    setVisibleStartIndex(renderVisibleStart);
  }, [renderVisibleStart, shouldRenderLatestWindow]);

  useEffect(() => {
    if (messages.length > 0) {
      return;
    }

    visibleStartRef.current = 0;
    lastScrollTopRef.current = 0;
    clearLandingCorrection();
    adaptiveMeasurePendingRef.current = true;
    setMountedWindowCount(initial_visible_count);
    setVisibleStartIndex(0);
    isAtBottomRef.current = true;
    streamingFollowEnabledRef.current = true;
    userScrollIntentRef.current = false;
    setIsAtBottom(true);
    setIsAtTop(true);
    pendingScrollToBottomRef.current = "auto";
  }, [clearLandingCorrection, initial_visible_count, messages.length]);

  useLayoutEffect(() => {
    const el = messagesRef.current;
    if (!el) {
      return;
    }

    if (pendingScrollToBottomRef.current) {
      const behavior = pendingScrollToBottomRef.current;
      pendingScrollToBottomRef.current = null;
      if (behavior === "auto") {
        writeProgrammaticScroll(el, (node) => {
          node.scrollTop = Number.MAX_SAFE_INTEGER;
        });
        lastScrollTopRef.current = el.scrollTop;
        isAtBottomRef.current = true;
        streamingFollowEnabledRef.current = true;
        userScrollIntentRef.current = false;
        setIsAtBottom(true);
        setIsAtTop(
          visibleStartRef.current === 0 &&
            el.scrollTop <= TOP_EDGE_THRESHOLD,
        );
      } else {
        scrollToBottom(behavior);
      }
    }

    if (windowShiftAnchorRef.current) {
      const { index, viewportOffset } = windowShiftAnchorRef.current;
      const anchorNode = messageNodeRefs.current.get(index);
      windowShiftAnchorRef.current = null;
      if (anchorNode) {
        const anchorTop = Math.max(0, anchorNode.offsetTop - viewportOffset);
        writeProgrammaticScroll(el, (node) => {
          node.scrollTop = anchorTop;
        });
        lastScrollTopRef.current = el.scrollTop;
        updateIsAtBottom(el);
        // Reuse the landing settle loop for async Markdown/code/image growth.
        // For top alignment computeLandingTop is offsetTop + within - 12;
        // this within value therefore preserves the captured viewport offset.
        scheduleLandingCorrection({
          index,
          within: 12 - viewportOffset,
          align: "top",
          initialTop: anchorTop,
        });
      }
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
      // 方向感知救援:目标在窗口下边界外且下方还有消息 → 向下移窗;目标在上方
      // → 向上移窗。旧实现只会 loadOlder 向上爬、爬到 0 放弃,向下的跳转会被丢失。
      const rescueStart = visibleStartRef.current;
      const rescueEnd = rescueStart + mountedWindowCountRef.current;
      if (
        pendingAction.index >= rescueEnd &&
        rescueEnd < messagesLengthRef.current
      ) {
        loadNewerMessages();
        return;
      }
      if (pendingAction.index < rescueStart && rescueStart > 0) {
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
    loadNewerMessages,
    loadOlderMessages,
    safeVisibleStart,
    safeVisibleEnd,
    scheduleLandingCorrection,
    scrollToBottom,
    scrollToRenderedMessage,
    scrollToTop,
    updateIsAtBottom,
    writeProgrammaticScroll,
  ]);

  useLayoutEffect(() => {
    const el = messagesRef.current;
    if (
      !el ||
      isChatSwitchPending ||
      !adaptiveMeasurePendingRef.current ||
      effectiveMountedCount < initial_visible_count ||
      effectiveMountedCount >= resolvedMaxMountedCount ||
      (visibleStartRef.current === 0 &&
        messagesLengthRef.current <= effectiveMountedCount) ||
      prependCompensationRef.current ||
      pendingJumpActionRef.current ||
      windowShiftAnchorRef.current
    ) {
      return;
    }

    // Consume this target's only synchronous measurement regardless of the
    // result. Heavy content keeps the 12-row baseline; short content performs
    // one bounded expansion straight to the cap. There is no per-batch loop,
    // idle chain, animation frame, or observer-driven growth.
    adaptiveMeasurePendingRef.current = false;
    if (el.scrollHeight <= el.clientHeight + top_load_threshold) {
      const nextCount = resolvedMaxMountedCount;
      const currentStart = visibleStartRef.current;
      const latestLength = messagesLengthRef.current;
      const nextStart = Math.min(
        currentStart,
        Math.max(0, latestLength - nextCount),
      );
      if (nextStart === currentStart && nextCount <= effectiveMountedCount) {
        return;
      }

      if (nextStart < currentStart) {
        if (isAtBottomRef.current) {
          prependCompensationRef.current = {
            previousScrollHeight: el.scrollHeight,
            previousScrollTop: el.scrollTop,
          };
        } else {
          const landingIndex = pendingLandingActionRef.current?.index;
          const anchorIndex = messageNodeRefs.current.get(landingIndex)
            ? landingIndex
            : currentStart;
          captureWindowShiftAnchor(anchorIndex);
        }
      }
      visibleStartRef.current = nextStart;
      setMountedWindowCount(nextCount);
      setVisibleStartIndex(nextStart);
    }
  }, [
    captureWindowShiftAnchor,
    effectiveMountedCount,
    initial_visible_count,
    isChatSwitchPending,
    resolvedMaxMountedCount,
    safeVisibleStart,
    top_load_threshold,
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

  return {
    messagesRef,
    bottomSentinelRef,
    messageNodeRefs,
    safeVisibleStart,
    safeVisibleEnd,
    visibleMessages,
    isAtBottom,
    isAtTop,
    handleScroll,
    handlePointerInteraction,
    handleUserScrollIntent,
    handleWheel,
    notifyStreamingContentCommitted,
    handleBackToBottom,
    handleSkipToTop,
    handleJumpToPreviousMessage,
    scrollToMessageIndex,
    scrollViewportByPage,
  };
};

export default useMessageWindowScroll;

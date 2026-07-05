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
// 分批扩窗:目标与当前窗口差距超过阈值时,不一帧扩到位,而是每个 idle(无则
// setTimeout 0)步进约 CHUNK_EXPAND_STEP 条,消灭"一帧挂载全部消息"的爆发。
// 阈值取 (3×load_batch_size) 与单步条数的较大者 —— 差距若不足一步,分批只会多一次
// idle 延迟、无批处理收益,直接一步扩窗即可。
const CHUNK_EXPAND_STEP = 40;
const CHUNK_EXPAND_THRESHOLD_MULT = 3;
const chunkExpandThreshold = (load_batch_size) =>
  Math.max(CHUNK_EXPAND_THRESHOLD_MULT * load_batch_size, CHUNK_EXPAND_STEP);

// 双向窗口上限:窗口原本只增不减(loadOlderMessages 只减小 visibleStart,无对称卸载),
// 长会话滚到顶后 N 条全挂载、滚回底不释放 → "越用越卡"。收缩把 visibleStart 抬回
// messages.length - max_mounted_count,但只在「贴底跟随」时做(视口内容在窗口尾部,
// 抬起窗口头部不影响可见区),且经 trailing debounce 触发(滚动停止后 / 流式吸底落地后),
// 绝不在每个 scroll 事件里同步收缩。
// 12 = 与初始窗口一致:贴底常驻的就是开屏那一窗,视口一次只显 2-5 条已够回看;
// 重内容单条可达数百 DOM 节点 + 每代码块一套滚动条实例,上限每多 1 条都是常驻成本。
// 更早的历史靠向上翻页按批加载(每批 ~27ms),回底后收缩回来。
const DEFAULT_MAX_MOUNTED_COUNT = 12;
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
  const chunkedExpandRef = useRef(null);
  const trimDebounceTimerRef = useRef(null);
  // 收缩读的是「最新」消息长度:吸底 follow 的 rAF/timer 回调可能在一次 append 之后才落地,
  // 若闭包捕获旧长度会漏收缩。用 ref 承载最新长度,让收缩逻辑与调度时机解耦。
  const messagesLengthRef = useRef(messages.length);
  messagesLengthRef.current = messages.length;
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

  // 收缩上限有下限保护:不得小于 initial_visible_count —— 收缩到比初始窗口还小
  // 会跟开屏窗口语义打架(刚打开就收缩)。向上翻页把窗口顶过上限后滚回底再收缩
  // 属正常节奏(贴底 + 防抖才发生),不算抖动。
  const resolvedMaxMountedCount = Math.max(
    max_mounted_count,
    initial_visible_count,
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

  // 取消进行中的分批扩窗(像 pendingLandingTimerRef 一样清理定时器 + 置空状态)。
  const clearChunkedExpand = useCallback(() => {
    const state = chunkedExpandRef.current;
    if (!state) {
      return;
    }
    chunkedExpandRef.current = null;
    if (state.timerId == null) {
      return;
    }
    if (
      state.idleType === "idle" &&
      typeof window !== "undefined" &&
      typeof window.cancelIdleCallback === "function"
    ) {
      window.cancelIdleCallback(state.timerId);
    } else {
      clearTimeout(state.timerId);
    }
  }, []);

  // 分批扩窗:从当前 visibleStart 逐步(每拍约 CHUNK_EXPAND_STEP 条)扩到 targetStart,
  // 每步设 prependCompensation 稳住视口;走到目标后挂上 landingAction 交回既有
  // pendingJumpAction 机制落位(type 保持 toIndex/top)。无 host 时退化为一步扩窗。
  const beginChunkedExpand = useCallback(
    (targetStart, landingAction) => {
      clearChunkedExpand();
      const el = messagesRef.current;
      if (!el) {
        visibleStartRef.current = targetStart;
        pendingJumpActionRef.current = landingAction;
        setVisibleStartIndex(targetStart);
        return;
      }

      const state = {
        targetStart,
        landingAction,
        timerId: null,
        idleType: null,
      };
      chunkedExpandRef.current = state;

      const step = () => {
        // 已被取消 / 被新跳转替换:忽略这一拍
        if (chunkedExpandRef.current !== state) {
          return;
        }
        state.timerId = null;
        const host = messagesRef.current;
        if (!host) {
          chunkedExpandRef.current = null;
          return;
        }
        const currentStart = visibleStartRef.current;
        const nextStart = Math.max(targetStart, currentStart - CHUNK_EXPAND_STEP);
        // 每步 prepend 补偿:补偿写 scrollTop 走 layoutEffect 的 writeProgrammaticScroll
        // 路径(计数为程序性滚动),视口稳定。
        prependCompensationRef.current = {
          previousScrollHeight: host.scrollHeight,
          previousScrollTop: host.scrollTop,
        };
        visibleStartRef.current = nextStart;
        const isFinal = nextStart <= targetStart;
        if (isFinal) {
          pendingJumpActionRef.current = landingAction;
          chunkedExpandRef.current = null;
        }
        setVisibleStartIndex(nextStart);
        if (!isFinal) {
          scheduleStep();
        }
      };

      const scheduleStep = () => {
        if (chunkedExpandRef.current !== state) {
          return;
        }
        if (
          typeof window !== "undefined" &&
          typeof window.requestIdleCallback === "function"
        ) {
          state.idleType = "idle";
          state.timerId = window.requestIdleCallback(step, { timeout: 240 });
        } else {
          state.idleType = "timeout";
          state.timerId = setTimeout(step, 0);
        }
      };

      scheduleStep();
    },
    [clearChunkedExpand],
  );

  const beginExplicitScrollNavigation = useCallback(() => {
    clearLandingCorrection();
    clearScheduledStreamingBottomFollow();
    clearChunkedExpand();
    pendingScrollToBottomRef.current = null;
    isAtBottomRef.current = false;
    streamingFollowEnabledRef.current = false;
    userScrollIntentRef.current = true;
    setIsAtBottom(false);
  }, [
    clearChunkedExpand,
    clearLandingCorrection,
    clearScheduledStreamingBottomFollow,
  ]);

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

  const clearTrimDebounce = useCallback(() => {
    if (trimDebounceTimerRef.current != null) {
      clearTimeout(trimDebounceTimerRef.current);
      trimDebounceTimerRef.current = null;
    }
  }, []);

  // 向下收缩:只在贴底跟随时把 visibleStart 抬回 messages.length - 上限,复用既有
  // prependCompensation → layoutEffect 补偿路径(贴底时走 scrollToBottom("auto") 重新钉底,
  // 维持程序性滚动计数不变量)。任何可能与其它精密状态机竞态的时机(进行中的分批扩窗 /
  // landing 结算 / 待落位跳转 / 未消费的 prepend 补偿 / 用户已表达脱离意图 / 不在底部)
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
      chunkedExpandRef.current ||
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

    // 滚动停止后(trailing debounce)再考虑向下收缩 —— 不在每个 scroll 事件里同步收缩。
    scheduleWindowTrim();
  }, [
    clearScheduledStreamingBottomFollow,
    is_streaming,
    loadOlderMessages,
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
    clearChunkedExpand();
    if (!is_streaming) {
      return;
    }
    userScrollIntentRef.current = true;
  }, [clearChunkedExpand, clearLandingCorrection, is_streaming]);

  // 滚轮处理器:流式期间上滚(deltaY<0)立即脱离 —— 关跟随 + 取消 pending 吸底 rAF +
  // 置意图,不等 scroll 事件、不看 24px 阈值带(rAF 会在事件到达前把位置拍回底部)。
  const handleWheel = useCallback(
    (event) => {
      clearLandingCorrection();
      clearChunkedExpand();
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
    [
      clearChunkedExpand,
      clearLandingCorrection,
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
    const currentStart = visibleStartRef.current;
    if (currentStart === 0) {
      scrollToTop("smooth");
      return;
    }

    const landingAction = { type: "top", behavior: "smooth" };
    // 长会话到顶:差距超阈值时分批扩窗(每拍约 40 条),否则保持原一步扩窗。
    if (currentStart > chunkExpandThreshold(load_batch_size)) {
      beginChunkedExpand(0, landingAction);
      return;
    }

    visibleStartRef.current = 0;
    pendingJumpActionRef.current = landingAction;
    setVisibleStartIndex(0);
  }, [beginChunkedExpand, load_batch_size, scrollToTop]);

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
      const landingAction = {
        type: "toIndex",
        index: clamped,
        behavior,
        within,
        align,
        settle,
      };
      // 远距离跳转:差距超阈值时分批扩窗,避免一帧渲染爆发;否则一步扩窗落位。
      if (
        visibleStartRef.current - nextStart >
        chunkExpandThreshold(load_batch_size)
      ) {
        beginChunkedExpand(nextStart, landingAction);
        return false;
      }

      visibleStartRef.current = nextStart;
      pendingJumpActionRef.current = landingAction;
      setVisibleStartIndex(nextStart);
      return false;
    },
    [
      beginChunkedExpand,
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
      clearChunkedExpand();
      clearTrimDebounce();
    };
  }, [
    clearChunkedExpand,
    clearLandingCorrection,
    clearScheduledStreamingBottomFollow,
    clearTrimDebounce,
  ]);

  useEffect(() => {
    if (activeChatIdRef.current === chat_id) {
      return;
    }

    activeChatIdRef.current = chat_id;
    lastScrollTopRef.current = 0;
    clearLandingCorrection();
    clearChunkedExpand();
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
    clearChunkedExpand,
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
    clearChunkedExpand();
    setVisibleStartIndex(0);
    isAtBottomRef.current = true;
    streamingFollowEnabledRef.current = true;
    userScrollIntentRef.current = false;
    setIsAtBottom(true);
    setIsAtTop(true);
    pendingScrollToBottomRef.current = "auto";
  }, [clearChunkedExpand, clearLandingCorrection, messages.length]);

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

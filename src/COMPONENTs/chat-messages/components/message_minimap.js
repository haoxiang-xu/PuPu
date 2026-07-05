import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import {
  colorWithAlpha,
  themeHighlightColor,
} from "../../../CONTAINERs/config/theme_highlight";
import {
  GAP,
  PAD,
  MIN_SEG,
  median,
  pickScale,
  slideOffset,
  visibleCounts,
  capCount,
  indexAtContentY,
  absScrollTop,
  dragScrollGeometry,
} from "../minimap_geometry";
import {
  computeMinimapFrame,
  findCurrentMessageIndex,
} from "../message_viewport_geometry";

const EASE = "cubic-bezier(.22,.61,.36,1)";
const LITE_MEASURE_INTERVAL_MS = 400; // 流式 lite 模式:定时 measure→recalc→update 的节拍
// tick DOM 上限(2026-07 C 批性能):超过时相邻消息按等量切分合并进同一 bucket,
// recalcGeometry/applyLayout 遍历 bucket 而非全量消息(长会话滚动帧成本不再随
// 消息总数线性涨)。N ≤ MAX_TICKS 时 bucket 退化为一消息一 tick,行为逐像素不变。
// 注意交互(点击/拖动)语义与 tick DOM 无关 —— 一直走 indexAtContentY 的逐消息
// content 坐标,不受 bucket 化影响。按消息数等量切分而非按内容坐标切分:后者会在
// 流式高度变化时反复重分桶,tick DOM 不稳定,违背 lite 模式的静默原则。
const MAX_TICKS = 100;
const TOP_INSET = 38; // 整条 minimap 顶部下移,避开窗口顶部可拖拽标题栏区域(否则 to-top 按钮点不到)
const INSET_BASE = 74; // 轨道上/下内边距:给两颗 pill(to-top/到底 + up1/down1,各高 24)让位
const INSET_COUNTS = 90; // 溢出时额外给计数标签让位

const PALETTE = {
  dark: {
    uOff: "rgba(255,255,255,0.13)", uOn: "rgba(255,255,255,0.50)",
    box: "rgba(255,255,255,0.28)", boxIdle: "rgba(255,255,255,0.12)",
    pillBg: "rgba(255,255,255,0.12)", pillFg: "rgba(255,255,255,0.85)",
    count: "rgba(255,255,255,0.40)",
  },
  light: {
    uOff: "rgba(0,0,0,0.12)", uOn: "rgba(0,0,0,0.42)",
    box: "rgba(0,0,0,0.25)", boxIdle: "rgba(0,0,0,0.10)",
    pillBg: "rgba(0,0,0,0.10)", pillFg: "rgba(0,0,0,0.70)",
    count: "rgba(0,0,0,0.40)",
  },
};

// PuPu 内置图标(icon_manifest.js)。fill-based,viewBox 24。
// arrow_up / arrow_down:上一条 / 下一条
const CH_UP =
  '<svg width="12" height="12" style="display:block" viewBox="0 0 24 24" fill="currentColor"><path d="M11.9999 10.8284L7.0502 15.7782L5.63599 14.364L11.9999 8L18.3639 14.364L16.9497 15.7782L11.9999 10.8284Z"/></svg>';
const CH_DOWN =
  '<svg width="12" height="12" style="display:block" viewBox="0 0 24 24" fill="currentColor"><path d="M11.9999 13.1714L16.9497 8.22168L18.3639 9.63589L11.9999 15.9999L5.63599 9.63589L7.0502 8.22168L11.9999 13.1714Z"/></svg>';
// skip_up / skip_down:到顶 / 到底
const CH_UP2 =
  '<svg width="12" height="12" style="display:block" viewBox="0 0 24 24" fill="currentColor"><path d="M12 13.9142L16.7929 18.7071L18.2071 17.2929L12 11.0858L5.79289 17.2929L7.20711 18.7071L12 13.9142ZM6 7L18 7V9L6 9L6 7Z"/></svg>';
const CH_DOWN2 =
  '<svg width="12" height="12" style="display:block" viewBox="0 0 24 24" fill="currentColor"><path d="M12 10.0858L7.20711 5.29291L5.79289 6.70712L12 12.9142L18.2071 6.70712L16.7929 5.29291L12 10.0858ZM18 17L6 17L6 15L18 15V17Z"/></svg>';

// 注入一次:隐藏聊天容器原生滚动条(inline 无法写伪元素)
let styleInjected = false;
const ensureStyle = () => {
  if (styleInjected || typeof document === "undefined") return;
  const el = document.createElement("style");
  el.textContent =
    ".chat-scroll-host{scrollbar-width:none;-ms-overflow-style:none;}" +
    ".chat-scroll-host::-webkit-scrollbar{width:0;height:0;display:none;}" +
    // 导航 pill:背景默认透明,hover 才浮出 + 轻微放大(纯 CSS,抗 React 重渲染)
    "[data-mm-pill]{background:transparent !important;transition:opacity .22s cubic-bezier(.22,.61,.36,1),background .18s cubic-bezier(.22,.61,.36,1),transform .18s cubic-bezier(.22,.61,.36,1);}" +
    "[data-mm-pill]:hover{transform:translateX(-50%) scale(1.12) !important;}" +
    "[data-mm-pill][data-dark=\"1\"]:hover{background:rgba(255,255,255,0.12) !important;}" +
    "[data-mm-pill][data-dark=\"0\"]:hover{background:rgba(0,0,0,0.10) !important;}";
  document.head.appendChild(el);
  styleInjected = true;
};

// 导航 pill:背景默认透明,hover 才浮出背景 + 轻微放大。hover 交互走注入的
// 纯 CSS([data-mm-pill]:hover),抗 React 重渲染。整体显隐(随到顶/到底)由父组件
// 命令式控制 nodeRef.style.opacity / pointerEvents。
const NavPill = ({ nodeRef, edge, offset, icon, C, isDark, onClick }) => (
  <div
    ref={nodeRef}
    data-mm-pill
    data-dark={isDark ? "1" : "0"}
    onClick={onClick}
    style={{
      position: "absolute",
      left: "50%",
      [edge]: offset,
      width: 16,
      height: 24,
      transform: "translateX(-50%) scale(1)",
      borderRadius: 100,
      color: C.pillFg,
      cursor: "pointer",
      opacity: 0,
      pointerEvents: "none",
    }}
  >
    <span
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        width: 12,
        height: 12,
        transform: "translate(-50%, -50%)",
      }}
      dangerouslySetInnerHTML={{ __html: icon }}
    />
  </div>
);

const MessageMinimap = ({
  messagesRef,
  messageNodeRefs,
  segments,
  total,
  safeVisibleStart,
  measure,
  scrollToMessageIndex,
  bottomViewportInset = 0,
  isDark,
  isStreaming = false,
}) => {
  const { theme } = useContext(ConfigContext);
  const highlightColor = themeHighlightColor(theme);
  const C = useMemo(() => {
    const base = PALETTE[isDark ? "dark" : "light"];
    return {
      ...base,
      aOff: colorWithAlpha(highlightColor, isDark ? 0.45 : 0.55),
      aOn: colorWithAlpha(highlightColor, isDark ? 0.95 : 1),
    };
  }, [highlightColor, isDark]);
  // bucket 化:k → { id, start, end, role }。N ≤ MAX_TICKS 时 start === end === k。
  // role 取 bucket 内(冻结)高度占比最大的角色,只影响 tick 配色。
  const buckets = useMemo(() => {
    const n = segments.length;
    const count = Math.min(n, MAX_TICKS);
    const out = new Array(count);
    for (let k = 0; k < count; k++) {
      const start = Math.floor((k * n) / count);
      const end = Math.floor(((k + 1) * n) / count) - 1;
      let role = segments[start].role;
      if (end > start) {
        let userH = 0;
        let otherH = 0;
        for (let i = start; i <= end; i++) {
          const h = segments[i].height || 1;
          if (segments[i].role === "user") userH += h;
          else otherH += h;
        }
        role = userH > otherH ? "user" : "assistant";
      }
      out[k] = { id: segments[start].id, start, end, role };
    }
    return out;
  }, [segments]);
  const stackRef = useRef(null);
  const miniRef = useRef(null);
  const innerRef = useRef(null);
  const boxRef = useRef(null);
  const topPillRef = useRef(null);
  const botPillRef = useRef(null);
  const upOnePillRef = useRef(null);
  const downOnePillRef = useRef(null);
  const cTopRef = useRef(null);
  const cBotRef = useRef(null);
  const tickRefs = useRef([]);
  const hideTimer = useRef(null);
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const dragStartYRef = useRef(0);
  const dragStateRef = useRef(null);
  const minimapApiRef = useRef(null);
  const settlingRef = useRef(false); // 松手归中动画期间,抑制积压的 onScroll 抢清 inner transition

  useEffect(() => {
    ensureStyle();
  }, []);

  // 有效高度:流式期间 segments 高度被冻结(use_message_minimap lite 模式不 bump),
  // 已渲染节点用真实 offsetHeight 覆盖过期值,让 box/tick/计数不漂 —— 全程不碰 React。
  // 段索引 i === 绝对消息索引 i(segments 覆盖全量 messages;messageNodeRefs 亦按绝对索引存)。
  const effectiveHeight = useCallback((i) => {
    const node = messageNodeRefs.current.get(i);
    const real = node ? node.offsetHeight : 0;
    return real > 0 ? real : segments[i].height;
  }, [messageNodeRefs, segments]);

  // 命令式更新:scale/off/box/highlight/counts/pill。不触发 React re-render。
  useLayoutEffect(() => {
    const el = messagesRef.current;
    const mini = miniRef.current;
    const inner = innerRef.current;
    const box = boxRef.current;
    if (!el || !mini || !inner || !box || !segments.length) return undefined;

    // effH/medH 会在每次 recalcGeometry 里用真实高度刷新(流式膨胀时滚动跟上)
    let effH = segments.map((s) => s.height);
    let medH = median(effH);

    // 关键:聊天容器的滚动坐标含 padding(上/下)与消息间 gap,而 segments 的
    // top 只是「高度累加」,两者差 padTop+padBottom+(n-1)*gap。必须把布局量量进来,
    // 让 cOffsets[i] === 真实 offsetTop[i]、cTotal === 真实 scrollHeight,框/刻度/
    // 计数才能与真实滚动位置严格对齐。padding/gap 从 DOM 量,不写死。
    let cOffsets = [];
    let cTotal = total;
    const measureLayout = () => {
      // 每轮刷新有效高度:流式中直播那条已膨胀,靠真实 offsetHeight 覆盖冻结值
      effH = segments.map((s, i) => effectiveHeight(i));
      medH = median(effH);
      const cs = window.getComputedStyle(el);
      const padTop = parseFloat(cs.paddingTop) || 0;
      const padBottom = parseFloat(cs.paddingBottom) || 0;
      const innerEl = el.firstElementChild;
      let gap = 0;
      if (innerEl) {
        const ics = window.getComputedStyle(innerEl);
        gap = parseFloat(ics.rowGap || ics.gap) || 0;
      }
      cOffsets = new Array(segments.length);
      let acc = padTop;
      for (let i = 0; i < segments.length; i++) {
        cOffsets[i] = acc;
        acc += effH[i] + gap;
      }
      cTotal = segments.length
        ? acc - gap + padBottom
        : padTop + padBottom;
    };

    // 把窗口相对的 el.scrollTop 换算成整段对话的绝对滚动量(虚拟化下必需)
    const computeAbsTop = () => {
      const firstNode = messageNodeRefs.current.get(safeVisibleStart);
      const firstTop = firstNode
        ? firstNode.offsetTop
        : cOffsets[safeVisibleStart] || 0;
      return absScrollTop({
        offsets: cOffsets,
        safeVisibleStart,
        scrollTop: el.scrollTop,
        firstNodeOffsetTop: firstTop,
      });
    };

    let scale = 1;
    let usable = 0;
    let MH = 0;
    let overflow = false;

    const recalcGeometry = () => {
      measureLayout();
      const stackH = mini.parentElement
        ? mini.parentElement.clientHeight
        : mini.clientHeight;
      const baseUsable = stackH - 2 * INSET_BASE - 2 * PAD;
      const willOverflow =
        pickScale({ total: cTotal, usable: baseUsable, medianHeight: medH, minSeg: MIN_SEG }) *
          cTotal >
        baseUsable + 1;
      const inset = willOverflow ? INSET_COUNTS : INSET_BASE;
      mini.style.top = `${inset}px`;
      mini.style.bottom = `${inset}px`;
      const trackH = mini.clientHeight;
      usable = trackH - 2 * PAD;
      scale = pickScale({ total: cTotal, usable, medianHeight: medH, minSeg: MIN_SEG });
      MH = cTotal * scale;
      overflow = MH > usable + 1;
      // 定位 ticks(真实 content 坐标 → minimap;高度用有效值,流式膨胀不漂)。
      // 遍历 bucket 而非全量消息;单消息 bucket 时 span === effH[i],逐像素同旧行为。
      tickRefs.current.forEach((tk, k) => {
        if (!tk) return;
        const b = buckets[k];
        if (!b) return;
        const span = cOffsets[b.end] + effH[b.end] - cOffsets[b.start];
        tk.style.top = `${PAD + cOffsets[b.start] * scale}px`;
        tk.style.height = `${Math.max(3, span * scale - 3)}px`;
      });
    };

    // 纯 DOM 写:给定绝对滚动量 absTop 与滑动偏移 off,渲染框/竖条/计数/pill。
    // 被动滚动与拖动共用(拖动传冻结的 off0,被动传 slideOffset 居中值)。
    const applyLayout = (absTop, off) => {
      const frame = computeMinimapFrame({
        absTop,
        viewportHeight: el.clientHeight,
        bottomInset: bottomViewportInset,
        scale,
        mapHeight: MH,
        usable,
        offset: off,
        pad: PAD,
        gap: GAP,
      });
      inner.style.transform = `translateY(${-off}px)`;
      box.style.top = `${frame.styleTop}px`;
      box.style.height = `${frame.visualHeight}px`;

      const vTop = frame.boxTop;
      const vBtm = vTop + frame.viewportHeight * scale;
      // 高亮遍历 bucket:单消息 bucket 时 y/yEnd 与旧的逐消息公式完全一致。
      tickRefs.current.forEach((tk, k) => {
        if (!tk) return;
        const b = buckets[k];
        if (!b) return;
        const y = cOffsets[b.start] * scale;
        const yEnd = (cOffsets[b.end] + effH[b.end]) * scale;
        const inView = yEnd > vTop && y < vBtm;
        tk.style.background = inView
          ? b.role === "user"
            ? C.uOn
            : C.aOn
          : b.role === "user"
          ? C.uOff
          : C.aOff;
      });

      const cTop = cTopRef.current;
      const cBot = cBotRef.current;
      if (overflow) {
        const { above, below } = visibleCounts({
          offsets: cOffsets,
          heights: effH,
          scale,
          off,
          usable,
        });
        cTop.textContent = capCount(above);
        cBot.textContent = capCount(below);
        cTop.style.opacity = above > 0 ? "1" : "0";
        cBot.style.opacity = below > 0 ? "1" : "0";
      } else {
        cTop.style.opacity = "0";
        cBot.style.opacity = "0";
      }

      const atTop = absTop <= 2;
      const atBottom = cTotal - (absTop + el.clientHeight) <= 24;
      const setPill = (ref, hidden) => {
        if (!ref.current) return;
        ref.current.style.opacity = hidden ? "0" : "1";
        ref.current.style.pointerEvents = hidden ? "none" : "auto";
      };
      setPill(topPillRef, atTop);
      setPill(upOnePillRef, atTop);
      setPill(botPillRef, atBottom);
      setPill(downOnePillRef, atBottom);
    };

    // 当前几何快照(供拖动在组件体里读)。off 为被动居中值,拖动按下时取作 off0。
    const getGeom = () => {
      const absTop = computeAbsTop();
      const frame = computeMinimapFrame({
        absTop,
        viewportHeight: el.clientHeight,
        bottomInset: bottomViewportInset,
        scale,
        mapHeight: MH,
        usable,
        offset: 0,
        pad: PAD,
        gap: GAP,
      });
      const off = slideOffset({
        boxTop: frame.boxTop,
        boxHeight: frame.boxHeight,
        usable,
        MH,
      });
      return {
        viewH: frame.viewportHeight,
        boxH: frame.boxHeight,
        absTop,
        boxTop: frame.boxTop,
        off,
        scale,
        usable,
        MH,
        cTotal,
      };
    };

    const update = () => {
      const viewH = el.clientHeight;
      const scrollable = el.scrollHeight - viewH > 1;
      if (stackRef.current) {
        stackRef.current.style.display = scrollable ? "" : "none";
      }
      if (!scrollable) return;
      const absTop = computeAbsTop();
      const frame = computeMinimapFrame({
        absTop,
        viewportHeight: viewH,
        bottomInset: bottomViewportInset,
        scale,
        mapHeight: MH,
        usable,
        offset: 0,
        pad: PAD,
        gap: GAP,
      });
      const off = slideOffset({
        boxTop: frame.boxTop,
        boxHeight: frame.boxHeight,
        usable,
        MH,
      });
      applyLayout(absTop, off);
    };

    // per-scroll 的 update 走 rAF 合并:一帧内多次 scroll 只跑一次 update(避免
    // 布局读被塞进 streaming store 的 DOM 写之后触发强制 reflow)。无 rAF 时退化为同步。
    let updateScheduled = null;
    const runScheduledUpdate = () => {
      updateScheduled = null;
      if (draggingRef.current || settlingRef.current) return;
      update();
    };
    const scheduleUpdate = () => {
      if (
        typeof window !== "undefined" &&
        typeof window.requestAnimationFrame === "function"
      ) {
        if (updateScheduled != null) return;
        updateScheduled = window.requestAnimationFrame(runScheduledUpdate);
      } else {
        update();
      }
    };
    const cancelScheduledUpdate = () => {
      if (updateScheduled == null) return;
      if (
        typeof window !== "undefined" &&
        typeof window.cancelAnimationFrame === "function"
      ) {
        window.cancelAnimationFrame(updateScheduled);
      }
      updateScheduled = null;
    };

    const showActive = () => {
      box.style.borderColor = C.box;
      box.style.opacity = "1";
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
    const scheduleHide = () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => {
        box.style.borderColor = C.boxIdle;
        box.style.opacity = "0.6";
      }, 1200);
    };
    // measure 移出滚动热路径:~120ms(或 rAF)节流,合并突发 scroll。
    // 拖动/松手归中期间冻结 measure —— 保证 segments 稳定、拖动坐标系不中途漂移。
    let measureScheduled = null;
    let measureScheduledType = null;
    const runMeasure = () => {
      measureScheduled = null;
      measureScheduledType = null;
      if (draggingRef.current || settlingRef.current) return;
      measure();
    };
    const scheduleMeasure = () => {
      if (draggingRef.current || settlingRef.current) return;
      if (measureScheduled != null) return;
      if (
        typeof window !== "undefined" &&
        typeof window.requestAnimationFrame === "function"
      ) {
        measureScheduledType = "raf";
        measureScheduled = window.requestAnimationFrame(runMeasure);
      } else {
        measureScheduledType = "timeout";
        measureScheduled = setTimeout(runMeasure, 120);
      }
    };
    const cancelMeasure = () => {
      if (measureScheduled == null) return;
      if (
        measureScheduledType === "raf" &&
        typeof window !== "undefined" &&
        typeof window.cancelAnimationFrame === "function"
      ) {
        window.cancelAnimationFrame(measureScheduled);
      } else {
        clearTimeout(measureScheduled);
      }
      measureScheduled = null;
      measureScheduledType = null;
    };

    const onScroll = () => {
      showActive();
      // lite 模式:流式期间只跳过昂贵的 scheduleMeasure —— measure 是 offsetHeight 全量读
      // → setVersion → React 重渲 → effect 重初始化风暴,必须移出热路径,交给下面的
      // ~400ms 定时器(直播文本膨胀不改 messages,靠定时器用真实高度覆盖缓存)。
      // update() 只是从既有几何做样式写(applyLayout),per-scroll 跑没问题:保留它让
      // 视口框/tick 高亮随手动滚动实时跟手,而不是随定时器跳格(2.5fps 卡顿)。
      if (!isStreaming) scheduleMeasure();
      if (!draggingRef.current && !settlingRef.current) scheduleUpdate();
      scheduleHide();
    };

    // isStreaming 从 true 翻 false 时 effect 依赖变化重跑,这里立即收敛一次全量
    // measure —— 吸收 lite 期间(定时器节拍之间)残留的高度漂移。流式中不在此测量,
    // 由定时器负责。
    if (!isStreaming) measure();
    recalcGeometry();
    // effect 重跑时:拖动中不 update(),避免"被动布局"抢掉拖动帧。
    if (!draggingRef.current) update();
    minimapApiRef.current = { applyLayout, getGeom, update, measure };

    el.addEventListener("scroll", onScroll, { passive: true });
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            if (draggingRef.current || settlingRef.current) return;
            // lite:流式期间 RO 不参与,几何由定时器驱动(避免直播膨胀触发的 RO 抖动)
            if (isStreaming) return;
            measure();
            recalcGeometry();
            update();
          })
        : null;
    if (ro) {
      ro.observe(el);
      if (el.firstElementChild) ro.observe(el.firstElementChild);
    }
    // lite 模式定时器:流式期间用真实 offsetHeight 定时覆盖高度缓存并重算几何,
    // 让 rail/框在正在生成的那条消息膨胀时持续跟上(scroll 热路径此时静默)。
    let liteMeasureTimer = null;
    if (isStreaming) {
      liteMeasureTimer = setInterval(() => {
        if (draggingRef.current || settlingRef.current) return;
        measure();
        recalcGeometry();
        update();
      }, LITE_MEASURE_INTERVAL_MS);
    }
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelMeasure();
      cancelScheduledUpdate();
      if (liteMeasureTimer != null) clearInterval(liteMeasureTimer);
      if (ro) ro.disconnect();
      if (hideTimer.current) clearTimeout(hideTimer.current);
      minimapApiRef.current = null;
    };
  }, [
    segments,
    buckets,
    total,
    C,
    measure,
    effectiveHeight,
    messagesRef,
    messageNodeRefs,
    safeVisibleStart,
    bottomViewportInset,
    isStreaming,
  ]);

  if (!segments.length) return null;

  // 真实 content 坐标(含 padding + gap)+ 当前绝对滚动量。drag / up-1 / down-1 共用,
  // 保证三者与 update() 显示用同一套坐标,不会互相错位。
  const computeContentGeom = () => {
    const el = messagesRef.current;
    const mini = miniRef.current;
    if (!el || !mini) return null;
    const cs = window.getComputedStyle(el);
    const padTop = parseFloat(cs.paddingTop) || 0;
    const padBottom = parseFloat(cs.paddingBottom) || 0;
    const innerEl = el.firstElementChild;
    let gap = 0;
    if (innerEl) {
      const ics = window.getComputedStyle(innerEl);
      gap = parseFloat(ics.rowGap || ics.gap) || 0;
    }
    const offsets = new Array(segments.length);
    let acc = padTop;
    for (let i = 0; i < segments.length; i++) {
      offsets[i] = acc;
      acc += effectiveHeight(i) + gap; // 流式膨胀:真实高度覆盖冻结值,拖动/点击落点不漂
    }
    const cTotal = segments.length ? acc - gap + padBottom : padTop + padBottom;
    const firstNode = messageNodeRefs.current.get(safeVisibleStart);
    const firstTop = firstNode ? firstNode.offsetTop : offsets[safeVisibleStart] || 0;
    const absTop = absScrollTop({
      offsets,
      safeVisibleStart,
      scrollTop: el.scrollTop,
      firstNodeOffsetTop: firstTop,
    });
    return { el, mini, offsets, cTotal, absTop };
  };

  const jumpToRatio = (clientY) => {
    const g = computeContentGeom();
    if (!g) return false;
    const heights = segments.map((s, i) => effectiveHeight(i));
    const medH = median(heights);
    const r = g.mini.getBoundingClientRect();
    const usable = g.mini.clientHeight - 2 * PAD;
    const scale = pickScale({ total: g.cTotal, usable, medianHeight: medH, minSeg: MIN_SEG });
    const MH = g.cTotal * scale;
    const frame = computeMinimapFrame({
      absTop: g.absTop,
      viewportHeight: g.el.clientHeight,
      bottomInset: bottomViewportInset,
      scale,
      mapHeight: MH,
      usable,
      offset: 0,
      pad: PAD,
      gap: GAP,
    });
    const off = slideOffset({
      boxTop: frame.boxTop,
      boxHeight: frame.boxHeight,
      usable,
      MH,
    });
    const rel = Math.min(Math.max(0, clientY - r.top - PAD), usable);
    const contentY = (rel + off) / scale;
    const index = indexAtContentY({ offsets: g.offsets, total: g.cTotal, contentY });
    // 保留块内偏移:点击位置距该消息顶部多少 content px。offsets[index] 与 node.offsetTop
    // 同为 content 绝对坐标,故落点 = node.offsetTop + within - 视口高/2 = contentY - 视口高/2,
    // 正好让手指点中的像素落到视口正中(贴顶/贴底时由 computeLandingTop 与 scrollTo 自身 clamp 兜住)。
    const within = contentY - g.offsets[index];
    // 点击跳转:保留 settle(结算落位);返回是否同步完成滚动(供 pointerdown 判定拖动态)
    return scrollToMessageIndex(index, "auto", { within, align: "center" });
  };

  // 拖动按下:捕获冻结 off0 与抓取偏移,使拖动起步框不跳(手指停在框上原位)。
  const beginDrag = (clientY) => {
    const api = minimapApiRef.current;
    const mini = miniRef.current;
    if (!api || !mini) return false;
    const g = api.getGeom();
    if (!(g.MH > 0) || g.scale <= 0) return false;
    // content 几何(offsets/cTotal)拖动期间不变,只在按下时量一次,dragTo 复用,
    // 避免每帧 getComputedStyle + 重建 offsets 数组(长对话 GC 压力)。
    const cg = computeContentGeom();
    if (!cg) return false;
    const r = mini.getBoundingClientRect();
    const cursorTrackY = clientY - r.top - PAD;
    const boxVisualTop0 = g.boxTop - g.off; // 框当前在轨道内的视觉顶
    dragStateRef.current = {
      off0: g.off,
      grabOffset: cursorTrackY - boxVisualTop0,
      trackTop: r.top,
      scale: g.scale,
      usable: g.usable,
      MH: g.MH,
      boxH: g.boxH,
      offsets: cg.offsets,
      cTotal: cg.cTotal,
    };
    return true;
  };
  // 阈值判定用 dragStartYRef(独立于 dragStateRef 的几何快照)。

  // 拖动移动:off 冻结,框锁窗口内跟手指;滚动 + 同步 applyLayout(不等异步 scroll)。
  const dragTo = (clientY) => {
    const st = dragStateRef.current;
    const api = minimapApiRef.current;
    if (!st || !api) return;
    const cursorTrackY = Math.min(
      Math.max(0, clientY - st.trackTop - PAD),
      st.usable,
    );
    const { absTop } = dragScrollGeometry({
      cursorTrackY,
      off0: st.off0,
      grabOffset: st.grabOffset,
      usable: st.usable,
      MH: st.MH,
      boxH: st.boxH,
      scale: st.scale,
    });
    const index = indexAtContentY({
      offsets: st.offsets,
      total: st.cTotal,
      contentY: absTop,
    });
    const within = absTop - st.offsets[index];
    // 拖动路径:settle:false —— 跳过 landing correction 结算循环,否则松手后残留的
    // 校正会在内容高度变化时把滚动位置拽回(最长 2s),与拖动竞态。
    scrollToMessageIndex(index, "auto", { within, align: "top", settle: false });
    api.applyLayout(absTop, st.off0); // 用冻结 off0 同步渲染,框跟手指
  };

  // 松手:框 ~140ms 平滑归中(off → slideOffset),滑出更多 node。
  const endDrag = () => {
    const st = dragStateRef.current;
    const api = minimapApiRef.current;
    const inner = innerRef.current;
    const box = boxRef.current;
    dragStateRef.current = null;
    if (!st || !api || !inner || !box) return;
    const g = api.getGeom();
    // 用 getGeom 的当前几何(g.usable/g.MH)与 g.boxTop/g.boxH 同源,避免拖动中途
    // resize 时 st 快照与当前几何混用导致归中偏差。
    const offPassive = slideOffset({
      boxTop: g.boxTop,
      boxHeight: g.boxH,
      usable: g.usable,
      MH: g.MH,
    });
    box.style.transition = ""; // 恢复 box 原 transition(JSX 内联已带 top .14s)
    inner.style.transition = `transform .14s ${EASE}`;
    settlingRef.current = true; // 抑制积压 onScroll 在动画期间抢清 inner transition
    api.applyLayout(g.absTop, offPassive);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    window.setTimeout(() => {
      settlingRef.current = false;
      if (innerRef.current) innerRef.current.style.transition = "";
      // 归中结束:补一次 measure + update,吸收拖动/归中期间被冻结的高度变化,
      // segments 与框回到最新真实几何。
      const api2 = minimapApiRef.current;
      if (api2) {
        if (api2.measure) api2.measure();
        if (api2.update) api2.update();
      }
    }, 200);
  };

  // 上一条 / 下一条:用统一的绝对 content 坐标定位当前视口顶部所在消息,
  // 避免虚拟窗口里只有部分节点已渲染时,按钮卡在半条消息或反复跳同一条。
  const scrollByMessages = (delta) => {
    const g = computeContentGeom();
    if (!g) return;
    const currentIdx = findCurrentMessageIndex({
      offsets: g.offsets,
      total: g.cTotal,
      contentY: g.absTop,
    });
    const next = Math.min(Math.max(0, currentIdx + delta), segments.length - 1);
    if (next !== currentIdx) scrollToMessageIndex(next, "smooth");
  };

  return (
    <div
      ref={stackRef}
      style={{
        position: "absolute",
        right: 0,
        top: TOP_INSET,
        /* the list now runs behind the floating input — keep the minimap
           track above it, like when the input was in-flow */
        bottom: bottomViewportInset,
        width: 22,
        zIndex: 2,
      }}
      data-mm-stack
    >
      <div
        ref={cTopRef}
        style={{
          position: "absolute",
          left: "50%",
          top: 64,
          transform: "translateX(-50%)",
          fontSize: 9,
          fontWeight: 600,
          color: C.count,
          opacity: 0,
          transition: "opacity .25s ease",
          whiteSpace: "nowrap",
          pointerEvents: "none",
        }}
      />
      <div
        ref={cBotRef}
        style={{
          position: "absolute",
          left: "50%",
          bottom: 64,
          transform: "translateX(-50%)",
          fontSize: 9,
          fontWeight: 600,
          color: C.count,
          opacity: 0,
          transition: "opacity .25s ease",
          whiteSpace: "nowrap",
          pointerEvents: "none",
        }}
      />

      <div
        ref={miniRef}
        data-mm-track
        style={{
          position: "absolute",
          right: 3,
          top: `${INSET_BASE}px`,
          bottom: `${INSET_BASE}px`,
          width: 16,
          overflow: "hidden",
          cursor: "pointer",
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          draggingRef.current = false;
          movedRef.current = false;
          dragStartYRef.current = e.clientY;
          const landedSync = jumpToRatio(e.clientY); // 按下即精确居中(恢复 issue#1 手感)
          // 仅当同步落位(目标在虚拟窗口内)才进入可拖动态;若为异步 deferred 扩窗跳转,
          // beginDrag 会捕获跳转前的旧几何 → 拖动起步瞬移,故此时按纯点击语义处理,不进入拖动。
          if (landedSync && beginDrag(e.clientY)) {
            // 捕获居中后几何,供可能的拖动
          } else {
            dragStateRef.current = null;
          }
        }}
        onPointerMove={(e) => {
          if (!dragStateRef.current) return;
          // 6px 阈值:正常点击的手抖不被误判为 drag(按下已居中,超阈值才接管为拖动)。
          if (!movedRef.current && Math.abs(e.clientY - dragStartYRef.current) < 6) return;
          if (!movedRef.current) {
            movedRef.current = true;
            draggingRef.current = true;
            settlingRef.current = false; // 若上次归中动画未结束,新拖动立即接管
            if (boxRef.current) boxRef.current.style.transition = "none";
            if (innerRef.current) innerRef.current.style.transition = "";
          }
          dragTo(e.clientY);
        }}
        onPointerUp={(e) => {
          const wasDrag = movedRef.current;
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
          }
          draggingRef.current = false;
          movedRef.current = false;
          if (wasDrag) endDrag();
          // 纯点击已在 onPointerDown 居中,松手无需再做
          dragStateRef.current = null;
        }}
        onPointerCancel={(e) => {
          // 系统中断(如触控板手势抢占):清理拖动状态,避免 draggingRef 卡死冻结 minimap。
          const wasDrag = movedRef.current;
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
          }
          draggingRef.current = false;
          movedRef.current = false;
          if (wasDrag) endDrag(); // 平滑归中并恢复 transition;非拖动则无副作用
          else dragStateRef.current = null;
        }}
      >
        <div ref={innerRef} style={{ position: "absolute", left: 0, right: 0, top: 0 }}>
          <div
            ref={boxRef}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              boxSizing: "border-box",
              borderRadius: 100,
              border: `1px solid ${C.boxIdle}`,
              opacity: 0.6,
              pointerEvents: "none",
              transition: `top .14s ${EASE}, height .14s ${EASE}, border-color .25s, opacity .3s`,
            }}
          />
          {buckets.map((b, k) => (
            <div
              key={b.id}
              data-mm-tick
              data-mm-role={b.role}
              data-mm-b0={b.start}
              data-mm-b1={b.end}
              ref={(n) => {
                tickRefs.current[k] = n;
              }}
              style={{
                position: "absolute",
                left: "50%",
                width: 4,
                transform: "translateX(-50%)",
                borderRadius: 100,
                background: b.role === "user" ? C.uOff : C.aOff,
                transition: `background .25s ${EASE}`,
              }}
            />
          ))}
        </div>
      </div>

      <NavPill nodeRef={topPillRef} edge="top" offset={8} icon={CH_UP2} C={C} isDark={isDark}
        onClick={() => scrollToMessageIndex(0, "smooth")} />
      <NavPill nodeRef={upOnePillRef} edge="top" offset={38} icon={CH_UP} C={C} isDark={isDark}
        onClick={() => scrollByMessages(-1)} />
      <NavPill nodeRef={downOnePillRef} edge="bottom" offset={38} icon={CH_DOWN} C={C} isDark={isDark}
        onClick={() => scrollByMessages(1)} />
      <NavPill nodeRef={botPillRef} edge="bottom" offset={8} icon={CH_DOWN2} C={C} isDark={isDark}
        onClick={() => {
          const el = messagesRef.current;
          if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
        }} />
    </div>
  );
};

export default MessageMinimap;

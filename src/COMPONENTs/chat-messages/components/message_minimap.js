import { useContext, useEffect, useLayoutEffect, useMemo, useRef } from "react";
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

  // 命令式更新:scale/off/box/highlight/counts/pill。不触发 React re-render。
  useLayoutEffect(() => {
    const el = messagesRef.current;
    const mini = miniRef.current;
    const inner = innerRef.current;
    const box = boxRef.current;
    if (!el || !mini || !inner || !box || !segments.length) return undefined;

    const heights = segments.map((s) => s.height);
    const medH = median(heights);

    // 关键:聊天容器的滚动坐标含 padding(上/下)与消息间 gap,而 segments 的
    // top 只是「高度累加」,两者差 padTop+padBottom+(n-1)*gap。必须把布局量量进来,
    // 让 cOffsets[i] === 真实 offsetTop[i]、cTotal === 真实 scrollHeight,框/刻度/
    // 计数才能与真实滚动位置严格对齐。padding/gap 从 DOM 量,不写死。
    let cOffsets = [];
    let cTotal = total;
    const measureLayout = () => {
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
        acc += segments[i].height + gap;
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
      // 定位 ticks(真实 content 坐标 → minimap)
      tickRefs.current.forEach((tk, i) => {
        if (!tk) return;
        const s = segments[i];
        tk.style.top = `${PAD + cOffsets[i] * scale}px`;
        tk.style.height = `${Math.max(3, s.height * scale - 3)}px`;
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
      tickRefs.current.forEach((tk, i) => {
        if (!tk) return;
        const s = segments[i];
        const y = cOffsets[i] * scale;
        const yEnd = y + s.height * scale;
        const inView = yEnd > vTop && y < vBtm;
        tk.style.background = inView
          ? s.role === "user"
            ? C.uOn
            : C.aOn
          : s.role === "user"
          ? C.uOff
          : C.aOff;
      });

      const cTop = cTopRef.current;
      const cBot = cBotRef.current;
      if (overflow) {
        const { above, below } = visibleCounts({
          offsets: cOffsets,
          heights,
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
    const onScroll = () => {
      measure();
      showActive();
      if (!draggingRef.current && !settlingRef.current) update();
      scheduleHide();
    };

    recalcGeometry();
    update();
    minimapApiRef.current = { applyLayout, getGeom };

    el.addEventListener("scroll", onScroll, { passive: true });
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            measure();
            recalcGeometry();
            update();
          })
        : null;
    if (ro) {
      ro.observe(el);
      if (el.firstElementChild) ro.observe(el.firstElementChild);
    }
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (ro) ro.disconnect();
      if (hideTimer.current) clearTimeout(hideTimer.current);
      minimapApiRef.current = null;
    };
  }, [
    segments,
    total,
    C,
    measure,
    messagesRef,
    messageNodeRefs,
    safeVisibleStart,
    bottomViewportInset,
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
      acc += segments[i].height + gap;
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
    if (!g) return;
    const heights = segments.map((s) => s.height);
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
    scrollToMessageIndex(index, "auto", { within, align: "center" });
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
    scrollToMessageIndex(index, "auto", { within, align: "top" });
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
        bottom: 0,
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
          jumpToRatio(e.clientY); // 按下即精确居中(恢复 issue#1 手感)
          if (!beginDrag(e.clientY)) dragStateRef.current = null; // 捕获居中后几何,供可能的拖动
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
          {segments.map((s, i) => (
            <div
              key={s.id}
              data-mm-tick
              data-mm-role={s.role}
              ref={(n) => {
                tickRefs.current[i] = n;
              }}
              style={{
                position: "absolute",
                left: "50%",
                width: 4,
                transform: "translateX(-50%)",
                borderRadius: 100,
                background: s.role === "user" ? C.uOff : C.aOff,
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

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
} from "../minimap_geometry";

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

    const update = () => {
      const viewH = el.clientHeight;
      // 内容撑不满视口(不可滚动)→ 整条 minimap 隐藏。没有「视口位置」可言,
      // 否则 box 高 = clientHeight*scale 会远超轨道、ticks 散乱(spec §7 边界)。
      const scrollable = el.scrollHeight - viewH > 1;
      if (stackRef.current) {
        stackRef.current.style.display = scrollable ? "" : "none";
      }
      if (!scrollable) return;
      const absTop = computeAbsTop();
      const boxH = Math.max(20, viewH * scale);
      // 框限制在内容范围 [0, MH-boxH] 内
      const boxTop = Math.min(Math.max(0, absTop * scale), Math.max(0, MH - boxH));
      const off = slideOffset({ boxTop, boxHeight: boxH, usable, MH });
      inner.style.transform = `translateY(${-off}px)`;
      box.style.top = `${PAD + boxTop - GAP}px`;
      box.style.height = `${boxH + 2 * GAP}px`;

      const vTop = boxTop;
      const vBtm = vTop + viewH * scale;
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
      const atBottom = cTotal - (absTop + viewH) <= 24;
      const setPill = (ref, hidden) => {
        if (!ref.current) return;
        ref.current.style.opacity = hidden ? "0" : "1";
        ref.current.style.pointerEvents = hidden ? "none" : "auto";
      };
      // 顶部两颗(到顶/上一条)在顶部时隐藏;底部两颗(下一条/到底)在底部时隐藏
      setPill(topPillRef, atTop);
      setPill(upOnePillRef, atTop);
      setPill(botPillRef, atBottom);
      setPill(downOnePillRef, atBottom);
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
      update();
      scheduleHide();
    };

    recalcGeometry();
    update();

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
    };
  }, [segments, total, C, measure, messagesRef, messageNodeRefs, safeVisibleStart]);

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
    const boxH = Math.max(20, g.el.clientHeight * scale);
    const off = slideOffset({ boxTop: g.absTop * scale, boxHeight: boxH, usable, MH });
    const rel = Math.min(Math.max(0, clientY - r.top - PAD), usable);
    const contentY = (rel + off) / scale;
    const index = indexAtContentY({ offsets: g.offsets, total: g.cTotal, contentY });
    scrollToMessageIndex(index, "auto");
  };

  // 上一条 / 下一条:基于「已渲染节点的真实 offsetTop」定位当前视口顶部所在消息,
  // 再跳到绝对 index ±1。必须用真实 DOM 坐标 —— 估算坐标在虚拟化窗口下会严重偏移
  // (cOffsets[safeVisibleStart] 与真实 scrollTop 不在同一基准),导致点一下跳飞。
  const scrollByMessages = (delta) => {
    const el = messagesRef.current;
    if (!el) return;
    const scrollTop = el.scrollTop;
    // messageNodeRefs: 绝对 index -> 节点。取最后一个 offsetTop <= scrollTop+EPS 的节点 = 当前顶部消息。
    // EPS 必须 >= scrollToMessageIndex 落点时留的 12px 上边距,否则刚跳到某条后它的
    // offsetTop 仍 > scrollTop,detection 认不出已到达该条 → 反复跳同一条、卡住。
    const entries = [...messageNodeRefs.current.entries()]
      .filter(([, node]) => node)
      .sort((a, b) => a[0] - b[0]);
    if (!entries.length) return;
    const EPS = 16;
    let currentIdx = entries[0][0];
    for (const [idx, node] of entries) {
      if (node.offsetTop <= scrollTop + EPS) currentIdx = idx;
      else break;
    }
    const next = Math.min(Math.max(0, currentIdx + delta), segments.length - 1);
    if (next !== currentIdx) scrollToMessageIndex(next, "smooth");
  };

  let dragging = false;

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
          dragging = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          jumpToRatio(e.clientY);
        }}
        onPointerMove={(e) => {
          if (dragging) jumpToRatio(e.clientY);
        }}
        onPointerUp={() => {
          dragging = false;
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

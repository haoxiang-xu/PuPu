import { useEffect, useLayoutEffect, useRef } from "react";
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
const END_GAP = 5; // 框到轨道上/下端的最小呼吸空间(px),避免 pill 圆角贴边
const TOP_INSET = 38; // 整条 minimap 顶部下移,避开窗口顶部可拖拽标题栏区域(否则 to-top 按钮点不到)
const INSET_BASE = 44; // 轨道上/下内边距:给 pill(top/bottom:14, 高 24 → 占到 38)+ 外侧 chevron 让位
const INSET_COUNTS = 60; // 溢出时额外给计数标签让位

const PALETTE = {
  dark: {
    uOff: "rgba(255,255,255,0.13)", uOn: "rgba(255,255,255,0.50)",
    aOff: "rgba(120,170,255,0.40)", aOn: "rgba(120,170,255,0.95)",
    box: "rgba(255,255,255,0.28)", boxIdle: "rgba(255,255,255,0.12)",
    pillBg: "rgba(255,255,255,0.12)", pillFg: "rgba(255,255,255,0.85)",
    count: "rgba(255,255,255,0.40)",
  },
  light: {
    uOff: "rgba(0,0,0,0.12)", uOn: "rgba(0,0,0,0.42)",
    aOff: "rgba(40,110,230,0.35)", aOn: "rgba(40,110,230,0.85)",
    box: "rgba(0,0,0,0.25)", boxIdle: "rgba(0,0,0,0.10)",
    pillBg: "rgba(0,0,0,0.10)", pillFg: "rgba(0,0,0,0.70)",
    count: "rgba(0,0,0,0.40)",
  },
};

const CH_UP =
  '<svg width="10" height="10" style="display:block" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 15 12 9 18 15"/></svg>';
const CH_DOWN =
  '<svg width="10" height="10" style="display:block" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

// 注入一次:隐藏聊天容器原生滚动条(inline 无法写伪元素)
let styleInjected = false;
const ensureStyle = () => {
  if (styleInjected || typeof document === "undefined") return;
  const el = document.createElement("style");
  el.textContent =
    ".chat-scroll-host{scrollbar-width:none;-ms-overflow-style:none;}" +
    ".chat-scroll-host::-webkit-scrollbar{width:0;height:0;display:none;}";
  document.head.appendChild(el);
  styleInjected = true;
};

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
  const C = PALETTE[isDark ? "dark" : "light"];
  const stackRef = useRef(null);
  const miniRef = useRef(null);
  const innerRef = useRef(null);
  const boxRef = useRef(null);
  const topPillRef = useRef(null);
  const botPillRef = useRef(null);
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
      topPillRef.current.style.opacity = atTop ? "0" : "1";
      topPillRef.current.style.pointerEvents = atTop ? "none" : "auto";
      botPillRef.current.style.opacity = atBottom ? "0" : "1";
      botPillRef.current.style.pointerEvents = atBottom ? "none" : "auto";
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

  const jumpToRatio = (clientY) => {
    const el = messagesRef.current;
    const mini = miniRef.current;
    if (!el || !mini) return;
    const r = mini.getBoundingClientRect();
    const heights = segments.map((s) => s.height);
    const medH = median(heights);
    // 与 update() 同一套真实 content 坐标(含 padding + gap)
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
    const usable = mini.clientHeight - 2 * PAD;
    const scale = pickScale({ total: cTotal, usable, medianHeight: medH, minSeg: MIN_SEG });
    const MH = cTotal * scale;
    const firstNode = messageNodeRefs.current.get(safeVisibleStart);
    const firstTop = firstNode ? firstNode.offsetTop : offsets[safeVisibleStart] || 0;
    const absTop = absScrollTop({
      offsets,
      safeVisibleStart,
      scrollTop: el.scrollTop,
      firstNodeOffsetTop: firstTop,
    });
    const boxH = Math.max(20, el.clientHeight * scale);
    const off = slideOffset({ boxTop: absTop * scale, boxHeight: boxH, usable, MH });
    const rel = Math.min(Math.max(0, clientY - r.top - PAD), usable);
    const contentY = (rel + off) / scale;
    const index = indexAtContentY({ offsets, total: cTotal, contentY });
    scrollToMessageIndex(index, "auto");
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
          top: 46,
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
          bottom: 46,
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

      <div
        ref={topPillRef}
        onClick={() => {
          scrollToMessageIndex(0, "smooth");
        }}
        style={{
          position: "absolute",
          left: "50%",
          top: 8,
          width: 16,
          height: 24,
          transform: "translateX(-50%)",
          borderRadius: 100,
          background: C.pillBg,
          color: C.pillFg,
          cursor: "pointer",
          opacity: 0,
          pointerEvents: "none",
          transition: "opacity .22s ease, background .2s",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: 10,
            height: 10,
            transform: "translate(-50%, -50%)",
          }}
          dangerouslySetInnerHTML={{ __html: CH_UP }}
        />
      </div>
      <div
        ref={botPillRef}
        onClick={() => {
          const el = messagesRef.current;
          if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
        }}
        style={{
          position: "absolute",
          left: "50%",
          bottom: 8,
          width: 16,
          height: 24,
          transform: "translateX(-50%)",
          borderRadius: 100,
          background: C.pillBg,
          color: C.pillFg,
          cursor: "pointer",
          opacity: 0,
          pointerEvents: "none",
          transition: "opacity .22s ease, background .2s",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: 10,
            height: 10,
            transform: "translate(-50%, -50%)",
          }}
          dangerouslySetInnerHTML={{ __html: CH_DOWN }}
        />
      </div>
    </div>
  );
};

export default MessageMinimap;

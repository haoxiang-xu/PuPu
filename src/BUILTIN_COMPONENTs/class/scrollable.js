import { useEffect, useContext } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import { Z } from "../layer/z_layers";

/**
 * Pure-overlay custom scrollbar — sibling-overlay approach.
 *
 * Thumbs live in a non-scrolling sibling div that floats over the scroll
 * container. They never become part of the scrollable content, so they
 * stay pinned to the visual edges at all times.
 *
 * Per-element config:
 *   data-sb-edge="N" — track margin at both ends (top/bottom for V, left/right for H).
 *   data-sb-edge-top/bottom/left/right="N" — optional per-side track margins.
 *   data-sb-wall="N" — distance from the outer wall (right for V, bottom for H).
 *                      Defaults to the element's edge if not set.
 */
/* An axis whose computed overflow clips cannot be scrolled by the user at all,
   so it must never grow a thumb — content overflowing that axis is a layout
   fact there, not a scroll range. */
const isClipped = (value) => value === "hidden" || value === "clip";

const Scrollable = () => {
  const { theme, onThemeMode } = useContext(ConfigContext);

  useEffect(() => {
    const sb = theme?.scrollable || {};
    const isDark = onThemeMode === "dark_mode";

    const COLOR_IDLE =
      sb.backgroundColor?.default ||
      (isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)");
    const COLOR_ACTIVE =
      sb.backgroundColor?.active ||
      (isDark ? "rgba(255,255,255,0.38)" : "rgba(0,0,0,0.3)");
    const DEFAULT_EDGE = sb.edge ?? 2;
    const THICK = 6;
    const MIN_THUMB = 24;
    const FADE_DELAY = 1000;

    /* ---- 1. Hide native scrollbars ---- */
    const styleEl = document.createElement("style");
    styleEl.textContent = `
      .scrollable {
        scrollbar-width: none !important;
        -ms-overflow-style: none !important;
      }
      .scrollable::-webkit-scrollbar {
        width: 0 !important;
        height: 0 !important;
        display: none !important;
      }
    `;
    document.head.appendChild(styleEl);

    /* ---- 2. Per-element management ---- */
    const managed = new Map();

    /* 共享 ResizeObserver(2026-07 C 批性能):全模块 1 个实例,回调按 target 分发。
       此前每个容器各建 1 个(observe container+parent),几十个滚动容器 = 几十个
       observer。target → Set<fn>,同一 target 可被多个订阅者共享(如共享 parent)。 */
    const resizeSubscribers = new Map();
    const sharedResizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver((entries) => {
            for (const entry of entries) {
              const subs = resizeSubscribers.get(entry.target);
              if (subs) subs.forEach((fn) => fn());
            }
          })
        : null;
    const observeResize = (target, fn) => {
      if (!sharedResizeObserver || !target) return;
      let subs = resizeSubscribers.get(target);
      if (!subs) {
        subs = new Set();
        resizeSubscribers.set(target, subs);
        sharedResizeObserver.observe(target);
      }
      subs.add(fn);
    };
    const unobserveResize = (target, fn) => {
      if (!sharedResizeObserver || !target) return;
      const subs = resizeSubscribers.get(target);
      if (!subs) return;
      subs.delete(fn);
      if (subs.size === 0) {
        resizeSubscribers.delete(target);
        sharedResizeObserver.unobserve(target);
      }
    };

    function getEdge(el) {
      const attr = el.getAttribute("data-sb-edge");
      return attr != null ? Number(attr) : DEFAULT_EDGE;
    }

    function getEdgeSide(el, side, fallback) {
      const attr = el.getAttribute(`data-sb-edge-${side}`);
      return attr != null ? Number(attr) : fallback;
    }

    function getWall(el, edge) {
      const attr = el.getAttribute("data-sb-wall");
      return attr != null ? Number(attr) : edge;
    }

    function makeThumb() {
      const el = document.createElement("div");
      Object.assign(el.style, {
        position: "absolute",
        borderRadius: "100px",
        backgroundColor: COLOR_IDLE,
        opacity: "0",
        pointerEvents: "auto",
        cursor: "grab",
        transition:
          "opacity 0.25s ease, " +
          "background-color 0.35s ease, " +
          "width 0.2s ease, " +
          "height 0.2s ease",
      });
      return el;
    }

    function attach(container) {
      if (managed.has(container)) return;

      const parent = container.parentElement;
      if (!parent) return;

      /* Ensure parent is a positioning context */
      const pcs = getComputedStyle(parent);
      if (pcs.position === "static") parent.style.position = "relative";

      /* Geometry attributes are re-read on every sync() so React can update
       * data-sb-* after mount (e.g. reserving space for a functional panel
       * whose height is only measured post-attach). */
      let edge = getEdge(container);
      let edgeTop = getEdgeSide(container, "top", edge);
      let edgeBottom = getEdgeSide(container, "bottom", edge);
      let edgeLeft = getEdgeSide(container, "left", edge);
      let edgeRight = getEdgeSide(container, "right", edge);
      let wall = getWall(container, edge);
      /* data-sb-persist — keep the scrollbar permanently visible (never fade). */
      const persist = container.getAttribute("data-sb-persist") != null;
      const restOpacity = persist ? "1" : "0";

      /* Create overlay — a non-scrolling sibling that sits on top */
      const overlay = document.createElement("div");
      Object.assign(overlay.style, {
        position: "absolute",
        top: "0",
        left: "0",
        width: "0",
        height: "0",
        overflow: "visible",
        pointerEvents: "none",
        /* 就地 append 到 parent 的命令式 overlay(不是 portal),必须盖过该
           容器内的一切内容,但不参与跨层竞争 —— 低于 APP_CHROME。迁移前的
           9999 与 modal 同值纯属巧合。 */
        zIndex: String(Z.SCROLL_OVERLAY),
      });
      parent.appendChild(overlay);

      /* Thumbs live inside overlay (outside the scroll container) */
      const vThumb = makeThumb();
      const hThumb = makeThumb();
      overlay.appendChild(vThumb);
      overlay.appendChild(hThumb);

      /* Persistent scrollbars start visible and never fade back to 0. */
      if (persist) {
        vThumb.style.opacity = restOpacity;
        hThumb.style.opacity = restOpacity;
      }

      let fadeTimer = null;
      let rafId = null;
      let settleTimerA = null;
      let settleTimerB = null;
      let hoveringV = false;
      let hoveringH = false;
      let scrolling = false;
      let mouseInside = false;

      /* ---- Positioning ---- */
      function sync() {
        /* refresh geometry attrs — cheap, and keeps late attribute updates live */
        edge = getEdge(container);
        edgeTop = getEdgeSide(container, "top", edge);
        edgeBottom = getEdgeSide(container, "bottom", edge);
        edgeLeft = getEdgeSide(container, "left", edge);
        edgeRight = getEdgeSide(container, "right", edge);
        wall = getWall(container, edge);

        /* Get container bounds relative to parent */
        const pRect = parent.getBoundingClientRect();
        const cRect = container.getBoundingClientRect();
        const ox = cRect.left - pRect.left;
        const oy = cRect.top - pRect.top;
        const cw = cRect.width;
        const ch = cRect.height;

        const sw = container.scrollWidth;
        const sh = container.scrollHeight;
        const clientW = container.clientWidth;
        const clientH = container.clientHeight;
        const st = container.scrollTop;
        const sl = container.scrollLeft;

        /* A container that deliberately clips an oversized child — e.g. a
           200%-wide slide track under overflowX:hidden — still reports
           scrollWidth > clientWidth. Drawing a thumb for it would be worse
           than merely dead: scrollLeft still moves a clipped axis
           programmatically, so dragging that thumb shoves the content out of
           place with no user-facing way to scroll it back. getComputedStyle
           runs only when a thumb would actually be drawn, so the common case
           (neither axis overflowing) stays free. */
        const overflowsV = sh > clientH + 1;
        const overflowsH = sw > clientW + 1;
        const flow =
          overflowsV || overflowsH ? getComputedStyle(container) : null;
        const hasV = overflowsV && !isClipped(flow.overflowY);
        const hasH = overflowsH && !isClipped(flow.overflowX);
        /* Constant thickness in every state. A hover/active size change shifts
           the thumb edges, so near a boundary the pointer crosses in and out →
           enter/leave flicker. Visual feedback comes from colour only. */
        const vThick = THICK;
        const hThick = THICK;

        /* Vertical thumb */
        if (hasV) {
          const trackH = ch - edgeTop - edgeBottom;
          const ratio = clientH / sh;
          const thumbH = Math.max(MIN_THUMB, ratio * trackH);
          const maxScroll = sh - clientH;
          const pct = maxScroll > 0 ? st / maxScroll : 0;
          Object.assign(vThumb.style, {
            display: "",
            top: oy + edgeTop + pct * (trackH - thumbH) + "px",
            left: ox + cw - wall - vThick + "px",
            height: thumbH + "px",
            width: vThick + "px",
          });
        } else {
          vThumb.style.display = "none";
        }

        /* Horizontal thumb */
        if (hasH) {
          const trackW = cw - edgeLeft - edgeRight;
          const ratio = clientW / sw;
          const thumbW = Math.max(MIN_THUMB, ratio * trackW);
          const maxScroll = sw - clientW;
          const pct = maxScroll > 0 ? sl / maxScroll : 0;
          Object.assign(hThumb.style, {
            display: "",
            top: oy + ch - wall - hThick + "px",
            left: ox + edgeLeft + pct * (trackW - thumbW) + "px",
            width: thumbW + "px",
            height: hThick + "px",
          });
        } else {
          hThumb.style.display = "none";
        }
      }

      function scheduleSync() {
        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(sync);
      }

      function showActive() {
        scrolling = true;
        vThumb.style.opacity = "1";
        vThumb.style.backgroundColor = COLOR_ACTIVE;
        hThumb.style.opacity = "1";
        hThumb.style.backgroundColor = COLOR_ACTIVE;
      }

      function scheduleHide() {
        clearTimeout(fadeTimer);
        fadeTimer = setTimeout(() => {
          scrolling = false;
          sync();
          if (!hoveringV && !hoveringH && !mouseInside) {
            vThumb.style.opacity = restOpacity;
            hThumb.style.opacity = restOpacity;
          }
          vThumb.style.backgroundColor = COLOR_IDLE;
          hThumb.style.backgroundColor = COLOR_IDLE;
        }, FADE_DELAY);
      }

      /* ---- Event handlers ---- */
      function onScroll() {
        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          sync();
          showActive();
          scheduleHide();
        });
      }

      function onContainerEnter() {
        mouseInside = true;
        scheduleSync();
        rafId = requestAnimationFrame(() => {
          sync();
          vThumb.style.opacity = "0.45";
          hThumb.style.opacity = "0.45";
          vThumb.style.backgroundColor = COLOR_IDLE;
          hThumb.style.backgroundColor = COLOR_IDLE;
        });
      }

      function onContainerLeave() {
        mouseInside = false;
        if (!scrolling && !hoveringV && !hoveringH) {
          vThumb.style.opacity = restOpacity;
          hThumb.style.opacity = restOpacity;
        }
      }

      function onVEnter() {
        hoveringV = true;
        sync();
        vThumb.style.opacity = "1";
        vThumb.style.backgroundColor = COLOR_ACTIVE;
      }
      function onVLeave() {
        hoveringV = false;
        if (!scrolling) {
          sync();
          vThumb.style.backgroundColor = COLOR_IDLE;
          if (!mouseInside) vThumb.style.opacity = restOpacity;
          else vThumb.style.opacity = "0.45";
        }
      }
      function onHEnter() {
        hoveringH = true;
        sync();
        hThumb.style.opacity = "1";
        hThumb.style.backgroundColor = COLOR_ACTIVE;
      }
      function onHLeave() {
        hoveringH = false;
        if (!scrolling) {
          sync();
          hThumb.style.backgroundColor = COLOR_IDLE;
          if (!mouseInside) hThumb.style.opacity = restOpacity;
          else hThumb.style.opacity = "0.45";
        }
      }

      /* ---- Drag support ---- */
      function makeDragger(thumb, axis) {
        let startPos = 0;
        let startScroll = 0;

        function onDown(e) {
          e.preventDefault();
          e.stopPropagation();
          startPos = axis === "v" ? e.clientY : e.clientX;
          startScroll =
            axis === "v" ? container.scrollTop : container.scrollLeft;
          thumb.style.cursor = "grabbing";
          document.body.style.cursor = "grabbing";
          document.addEventListener("mousemove", onMove);
          document.addEventListener("mouseup", onUp);
        }

        function onMove(e) {
          const delta = (axis === "v" ? e.clientY : e.clientX) - startPos;
          const cSize =
            axis === "v" ? container.clientHeight : container.clientWidth;
          const sSize =
            axis === "v" ? container.scrollHeight : container.scrollWidth;
          const startEdge = axis === "v" ? edgeTop : edgeLeft;
          const endEdge = axis === "v" ? edgeBottom : edgeRight;
          const trackLen = cSize - startEdge - endEdge;
          const thumbLen = Math.max(MIN_THUMB, (cSize / sSize) * trackLen);
          const ratio = (sSize - cSize) / (trackLen - thumbLen);
          if (axis === "v") container.scrollTop = startScroll + delta * ratio;
          else container.scrollLeft = startScroll + delta * ratio;
        }

        function onUp() {
          thumb.style.cursor = "grab";
          document.body.style.cursor = "";
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
        }

        thumb.addEventListener("mousedown", onDown);
        return () => {
          thumb.removeEventListener("mousedown", onDown);
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
          document.body.style.cursor = "";
        };
      }

      const cleanDragV = makeDragger(vThumb, "v");
      const cleanDragH = makeDragger(hThumb, "h");

      container.addEventListener("scroll", onScroll, { passive: true });
      container.addEventListener("input", onScroll, { passive: true });
      container.addEventListener("mouseenter", onContainerEnter);
      container.addEventListener("mouseleave", onContainerLeave);
      vThumb.addEventListener("mouseenter", onVEnter);
      vThumb.addEventListener("mouseleave", onVLeave);
      hThumb.addEventListener("mouseenter", onHEnter);
      hThumb.addEventListener("mouseleave", onHLeave);

      sync();
      /* Layout can settle after first paint (fonts/content/parent sizing), so re-sync shortly after mount. */
      scheduleSync();
      settleTimerA = setTimeout(scheduleSync, 64);
      settleTimerB = setTimeout(scheduleSync, 180);

      /* resize 监听走模块级共享 ResizeObserver(按 target 分发) */
      observeResize(container, scheduleSync);
      observeResize(parent, scheduleSync);

      /* 内容变更 → scheduleSync:cancelAnimationFrame + rAF 天然把同一帧内的
         多次 MutationObserver 回调合并成 1 次 sync(契约由 scrollable.test.js 锁死) */
      const contentMo = new MutationObserver(() => {
        scheduleSync();
      });
      contentMo.observe(container, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["style", "class"],
      });

      window.addEventListener("resize", scheduleSync, { passive: true });

      managed.set(container, {
        cleanup() {
          container.removeEventListener("scroll", onScroll);
          container.removeEventListener("input", onScroll);
          container.removeEventListener("mouseenter", onContainerEnter);
          container.removeEventListener("mouseleave", onContainerLeave);
          vThumb.removeEventListener("mouseenter", onVEnter);
          vThumb.removeEventListener("mouseleave", onVLeave);
          hThumb.removeEventListener("mouseenter", onHEnter);
          hThumb.removeEventListener("mouseleave", onHLeave);
          cleanDragV();
          cleanDragH();
          clearTimeout(fadeTimer);
          clearTimeout(settleTimerA);
          clearTimeout(settleTimerB);
          cancelAnimationFrame(rafId);
          unobserveResize(container, scheduleSync);
          unobserveResize(parent, scheduleSync);
          contentMo.disconnect();
          window.removeEventListener("resize", scheduleSync);
          overlay.remove();
        },
      });
    }

    function detach(el) {
      const e = managed.get(el);
      if (e) {
        e.cleanup();
        managed.delete(el);
      }
    }

    /* ---- 3. Auto-attach ---- */
    document.querySelectorAll(".scrollable").forEach(attach);

    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        /* Attribute change — class added/removed on existing node */
        if (m.type === "attributes" && m.target.nodeType === 1) {
          const el = m.target;
          if (el.classList?.contains("scrollable")) attach(el);
          else detach(el);
          continue;
        }
        /* Child list changes */
        for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;
          if (n.classList?.contains("scrollable")) attach(n);
          n.querySelectorAll?.(".scrollable").forEach(attach);
        }
        for (const n of m.removedNodes) {
          if (n.nodeType !== 1) continue;
          if (n.classList?.contains("scrollable")) detach(n);
          n.querySelectorAll?.(".scrollable").forEach(detach);
        }
      }
    });
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      document.head.removeChild(styleEl);
      mo.disconnect();
      managed.forEach((e) => e.cleanup());
      managed.clear();
      if (sharedResizeObserver) sharedResizeObserver.disconnect();
      resizeSubscribers.clear();
    };
  }, [theme, onThemeMode]);
};

export default Scrollable;

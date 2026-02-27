import { useEffect, useContext } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";

/**
 * Pure-overlay custom scrollbar — sibling-overlay approach.
 *
 * Thumbs live in a non-scrolling sibling div that floats over the scroll
 * container. They never become part of the scrollable content, so they
 * stay pinned to the visual edges at all times.
 *
 * Per-element config via data-sb-edge="N" (edge inset in px).
 */
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
    const IDLE_THICK = 4;
    const ACTIVE_THICK = 6;
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

    function getEdge(el) {
      const attr = el.getAttribute("data-sb-edge");
      return attr != null ? Number(attr) : DEFAULT_EDGE;
    }

    function makeThumb() {
      const el = document.createElement("div");
      Object.assign(el.style, {
        position: "absolute",
        borderRadius: "100px",
        backgroundColor: COLOR_IDLE,
        opacity: "0",
        pointerEvents: "auto",
        cursor: "default",
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

      const edge = getEdge(container);

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
        zIndex: "9999",
      });
      parent.appendChild(overlay);

      /* Thumbs live inside overlay (outside the scroll container) */
      const vThumb = makeThumb();
      const hThumb = makeThumb();
      overlay.appendChild(vThumb);
      overlay.appendChild(hThumb);

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

        const hasV = sh > clientH + 1;
        const hasH = sw > clientW + 1;
        const vThick = scrolling || hoveringV ? ACTIVE_THICK : IDLE_THICK;
        const hThick = scrolling || hoveringH ? ACTIVE_THICK : IDLE_THICK;

        /* Vertical thumb */
        if (hasV) {
          const trackH = ch - edge * 2;
          const ratio = clientH / sh;
          const thumbH = Math.max(MIN_THUMB, ratio * trackH);
          const maxScroll = sh - clientH;
          const pct = maxScroll > 0 ? st / maxScroll : 0;
          Object.assign(vThumb.style, {
            display: "",
            top: oy + edge + pct * (trackH - thumbH) + "px",
            left: ox + cw - edge - vThick + "px",
            height: thumbH + "px",
            width: vThick + "px",
          });
        } else {
          vThumb.style.display = "none";
        }

        /* Horizontal thumb */
        if (hasH) {
          const trackW = cw - edge * 2;
          const ratio = clientW / sw;
          const thumbW = Math.max(MIN_THUMB, ratio * trackW);
          const maxScroll = sw - clientW;
          const pct = maxScroll > 0 ? sl / maxScroll : 0;
          Object.assign(hThumb.style, {
            display: "",
            top: oy + ch - edge - hThick + "px",
            left: ox + edge + pct * (trackW - thumbW) + "px",
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
            vThumb.style.opacity = "0";
            hThumb.style.opacity = "0";
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
          vThumb.style.opacity = "0";
          hThumb.style.opacity = "0";
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
          if (!mouseInside) vThumb.style.opacity = "0";
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
          if (!mouseInside) hThumb.style.opacity = "0";
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
          document.addEventListener("mousemove", onMove);
          document.addEventListener("mouseup", onUp);
        }

        function onMove(e) {
          const delta = (axis === "v" ? e.clientY : e.clientX) - startPos;
          const cSize =
            axis === "v" ? container.clientHeight : container.clientWidth;
          const sSize =
            axis === "v" ? container.scrollHeight : container.scrollWidth;
          const trackLen = cSize - edge * 2;
          const thumbLen = Math.max(MIN_THUMB, (cSize / sSize) * trackLen);
          const ratio = (sSize - cSize) / (trackLen - thumbLen);
          if (axis === "v") container.scrollTop = startScroll + delta * ratio;
          else container.scrollLeft = startScroll + delta * ratio;
        }

        function onUp() {
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
        }

        thumb.addEventListener("mousedown", onDown);
        return () => thumb.removeEventListener("mousedown", onDown);
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

      const ro = new ResizeObserver(() => {
        scheduleSync();
      });
      ro.observe(container);
      ro.observe(parent);

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
          ro.disconnect();
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
    };
  }, [theme, onThemeMode]);
};

export default Scrollable;

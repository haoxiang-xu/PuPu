import { useEffect, useRef, useState } from "react";
import CommandMenu from "./command_menu";

/**
 * CommandPalettePanel — the "palette morph" (design D, Elevator Push motion).
 *
 * At rest this renders the attach pill row (children) in NORMAL FLOW with
 * zero extra chrome — the pill keeps its exact original shape (nothing wraps
 * or clips it). When `open`, a panel sharing the pill's own surface color
 * and 22px radius fades in BEHIND it and grows upward from the pill's
 * measured bounds; the pill is pushed down-and-out, a palette header (query
 * chip + key hints) drops into the same slot, and command rows cascade in.
 * Rows use radius 16 inside 6px padding — concentric with the panel's 22.
 *
 * Elevator Push: exits fast ease-in (~130ms); entrances longer decelerating
 * cubic(.22,1,.36,1) with staggered rows; the one spring is the query chip.
 */

const FALLBACK_H = 40; // pill row height fallback before measurement
const PANEL_RADIUS = 22; // matches the attach pill container
const ROW_STRIDE = 29; // CommandMenu bare row 28 + 1 gap
const MAX_ROWS = 6;
const PANEL_W = 280;
const BLEED = 6; // how far the panel extends past the pill bounds

const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
const EASE_IN = "cubic-bezier(0.4, 0, 1, 1)";
const EASE_SPRING = "cubic-bezier(0.34, 1.56, 0.64, 1)";

const CommandPalettePanel = ({
  open = false,
  query = "/",
  items = [],
  activeIndex = 0,
  onPick = () => {},
  onHover = null,
  isDark = false,
  surfaceBg,
  children,
}) => {
  /* double-rAF latch so mount-while-open still animates */
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    if (!open) {
      setEntered(false);
      return undefined;
    }
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [open]);
  const on = open && entered;

  /* measure the pill row's height so the header slot hugs its true bounds */
  const pillRef = useRef(null);
  const [pillH, setPillH] = useState(FALLBACK_H);
  useEffect(() => {
    const el = pillRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setPillH(Math.ceil(entry.contentRect.height) || FALLBACK_H);
      }
    });
    ro.observe(el);
    setPillH(Math.ceil(el.offsetHeight) || FALLBACK_H);
    return () => ro.disconnect();
  }, []);

  const headerH = pillH || FALLBACK_H;
  const listH = on ? Math.min(items.length, MAX_ROWS) * ROW_STRIDE + 8 : 0;
  /* left edge sits flush with the input/attach-panel left edge; width is
     content-driven (narrow), independent of the pill row's width — the pill
     is exiting during the morph anyway */
  const panelW = PANEL_W;

  /* translucent so the backdrop blur reads; alpha tuned to match the
     floating attach pill so open still reads as the same object */
  const panelBg =
    surfaceBg ||
    (isDark
      ? "rgba(var(--pupu-surface-rgb),0.85)"
      : "rgba(var(--pupu-surface-rgb),0.9)");
  const panelBorder = isDark
    ? "1px solid rgba(var(--pupu-text-rgb),0.10)"
    : "1px solid rgba(var(--pupu-text-rgb),0.09)";
  const hintColor = isDark ? "rgba(var(--pupu-text-rgb),0.35)" : "rgba(var(--pupu-text-rgb),0.38)";
  const chipBg = isDark ? "rgba(120,200,150,0.14)" : "rgba(40,150,80,0.12)";
  const chipColor = isDark ? "#9ad9a0" : "rgba(25,125,65,0.95)";

  return (
    <div
      data-command-palette=""
      data-open={on}
      style={{ position: "relative" }}
    >
      {/* the morphing panel — grows upward from the pill's bounds, BEHIND it */}
      <div
        aria-hidden={!on}
        style={{
          position: "absolute",
          left: 0,
          bottom: -BLEED,
          width: panelW,
          maxWidth: "calc(100vw - 40px)",
          height: headerH + BLEED * 2 + listH,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          overflow: "hidden",
          borderRadius: PANEL_RADIUS,
          backgroundColor: on ? panelBg : "transparent",
          border: on ? panelBorder : "1px solid transparent",
          ...(on
            ? {
                backdropFilter: "blur(20px) saturate(130%)",
                WebkitBackdropFilter: "blur(20px) saturate(130%)",
              }
            : {}),
          boxShadow: on
            ? isDark
              ? "0 10px 34px rgba(0,0,0,0.5)"
              : "0 10px 34px rgba(0,0,0,0.12)"
            : "none",
          transition: on
            ? "height 210ms cubic-bezier(0.3,1,0.35,1) 40ms, background-color 180ms ease, border-color 180ms ease, box-shadow 210ms ease"
            : "height 150ms cubic-bezier(0.4,0,0.6,1), background-color 130ms ease 40ms, border-color 130ms ease 40ms, box-shadow 130ms ease",
          zIndex: 1,
          pointerEvents: on ? "auto" : "none",
        }}
      >
        {/* command rows (above the header slot) */}
        <div style={{ minHeight: 0, overflow: "hidden" }}>
          {open && (
            <CommandMenu
              items={items}
              activeIndex={activeIndex}
              onPick={onPick}
              onHover={onHover}
              isDark={isDark}
              bare
              visible={on}
            />
          )}
        </div>

        {/* header slot spacer — same box the pill occupies */}
        <div
          style={{
            position: "relative",
            height: headerH + BLEED * 2,
            flex: "none",
          }}
        >
          {/* palette header — drops in from above, pinned to the bottom-left */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "flex-end",
              gap: 8,
              /* 13px insets so the 18px query chip (r9) nests concentric
                 inside the panel's 22px bottom-left corner: 9 + 13 = 22 */
              padding: "0 13px 13px",
              transform: on ? "translateY(0)" : "translateY(-11px)",
              opacity: on ? 1 : 0,
              pointerEvents: "none",
              transition: on
                ? `transform 220ms ${EASE_OUT} 70ms, opacity 220ms ${EASE_OUT} 70ms`
                : `transform 130ms ${EASE_IN}, opacity 130ms ${EASE_IN}`,
            }}
          >
            <span
              data-palette-query=""
              style={{
                boxSizing: "border-box",
                display: "inline-flex",
                alignItems: "center",
                height: 18,
                fontSize: 12.5,
                fontWeight: 600,
                color: chipColor,
                backgroundColor: chipBg,
                borderRadius: 9,
                padding: "0 8px",
                whiteSpace: "nowrap",
                transform: on ? "scale(1)" : "scale(0.85)",
                transition: on
                  ? `transform 200ms ${EASE_SPRING} 100ms`
                  : "transform 100ms ease-in",
              }}
            >
              {query || "/"}
            </span>
            <span
              style={{
                fontSize: 10.5,
                letterSpacing: "0.05em",
                color: hintColor,
                whiteSpace: "nowrap",
                userSelect: "none",
                WebkitUserSelect: "none",
              }}
            >
              COMMANDS · ↑↓ · ⏎ · esc
            </span>
          </div>
        </div>
      </div>

      {/* the pill row — normal flow, never wrapped/clipped at rest */}
      <div
        ref={pillRef}
        style={{
          position: "relative",
          zIndex: 2,
          transform: on ? "translateY(11px)" : "translateY(0)",
          opacity: on ? 0 : 1,
          filter: on ? "blur(3px)" : "none",
          pointerEvents: on ? "none" : "auto",
          transition: on
            ? `transform 130ms ${EASE_IN}, opacity 130ms ${EASE_IN}, filter 130ms linear`
            : `transform 180ms ${EASE_OUT} 50ms, opacity 180ms ${EASE_OUT} 50ms, filter 180ms linear 50ms`,
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default CommandPalettePanel;

import { useEffect, useState } from "react";
import CommandMenu from "./command_menu";

/**
 * CommandPalettePanel — the "palette morph" (design D, Elevator Push motion).
 *
 * Wraps the attach pill row (children). At rest it is chrome-less — the pill
 * row renders exactly as it always did. When `open`, the region morphs into a
 * command palette: a rounded panel fades in and grows UPWARD from the 38px
 * header slot, the pill row is pushed down-and-out (translateY + blur), a
 * palette header (query chip + key hints) drops in from above, and the
 * command rows cascade in top-down above the header.
 *
 * Elevator Push timings: exits are fast ease-in (~130ms); entrances are
 * longer decelerating cubic(.22,1,.36,1) with staggered rows; the single
 * springy overshoot is reserved for the query chip. Close is the fast
 * mirror. Mount-while-open still animates via a double-rAF "entered" latch.
 */

const HEADER_H = 38; // header slot height — matches the attach pill row
const ROW_H = 34;
const MAX_ROWS = 6;
const PANEL_W = 340;

const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
const EASE_IN = "cubic-bezier(0.4, 0, 1, 1)";
const EASE_SPRING = "cubic-bezier(0.34, 1.56, 0.64, 1)";

const CommandPalettePanel = ({
  open = false,
  query = "/",
  items = [],
  activeIndex = 0,
  onPick = () => {},
  isDark = false,
  children,
}) => {
  /* double-rAF latch: when the panel mounts already-open (e.g. no attach
     panel, so this only mounts on trigger), the first paint happens in the
     closed pose and transitions still fire */
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

  const listH = on ? Math.min(items.length, MAX_ROWS) * ROW_H + 10 : 0;

  const panelBg = isDark ? "#222420" : "#f7f8f5";
  const panelBorder = isDark
    ? "1px solid rgba(255,255,255,0.10)"
    : "1px solid rgba(0,0,0,0.09)";
  const hintColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.38)";
  const chipBg = isDark ? "rgba(120,200,150,0.14)" : "rgba(40,150,80,0.12)";
  const chipColor = isDark ? "#9ad9a0" : "rgba(25,125,65,0.95)";

  return (
    <div
      data-command-palette=""
      data-open={on}
      style={{ position: "relative", height: HEADER_H, minWidth: 1 }}
    >
      {/* the morphing panel — bottom-anchored, grows upward */}
      <div
        style={{
          position: "absolute",
          left: -6,
          bottom: -3,
          width: PANEL_W,
          maxWidth: "calc(100vw - 40px)",
          height: HEADER_H + listH,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          overflow: "hidden",
          borderRadius: 16,
          backgroundColor: on ? panelBg : "transparent",
          border: on ? panelBorder : "1px solid transparent",
          boxShadow: on
            ? isDark
              ? "0 10px 34px rgba(0,0,0,0.5)"
              : "0 10px 34px rgba(0,0,0,0.12)"
            : "none",
          transition: on
            ? `height 210ms cubic-bezier(0.3,1,0.35,1) 40ms, background-color 180ms ease, border-color 180ms ease, box-shadow 210ms ease`
            : `height 150ms cubic-bezier(0.4,0,0.6,1), background-color 130ms ease 40ms, border-color 130ms ease 40ms, box-shadow 130ms ease`,
          zIndex: 40,
        }}
      >
        {/* command rows (above the header) */}
        <div style={{ minHeight: 0, overflow: "hidden" }}>
          {open && (
            <CommandMenu
              items={items}
              activeIndex={activeIndex}
              onPick={onPick}
              isDark={isDark}
              bare
              visible={on}
            />
          )}
        </div>

        {/* header slot: pill row ⇄ palette header */}
        <div style={{ position: "relative", height: HEADER_H, flex: "none" }}>
          {/* old content — pushed down and out */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              padding: "3px 6px",
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
          {/* palette header — drops in from above */}
          <div
            aria-hidden={!on}
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "3px 10px",
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
                fontSize: 12.5,
                fontWeight: 600,
                color: chipColor,
                backgroundColor: chipBg,
                borderRadius: 5,
                padding: "1px 8px",
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
    </div>
  );
};

export default CommandPalettePanel;

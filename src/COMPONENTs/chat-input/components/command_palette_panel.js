import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import CommandMenu, { commandListCapHeight } from "./command_menu";
import Button from "../../../BUILTIN_COMPONENTs/input/button";

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
/* Row stride and the ten-row cap live in command_menu, which is what actually
   renders the rows — see commandListCapHeight. The list's height itself is
   measured, not computed (see listContentH below). */
const PANEL_W = 280;
const BLEED = 6; // how far the panel extends past the pill bounds
/* The thumb's distance from the panel's wall — the Select palette's value,
   so the two palettes read as one family. */
const SCROLLBAR_WALL = 2;

const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
const EASE_IN = "cubic-bezier(0.4, 0, 1, 1)";
const EASE_SPRING = "cubic-bezier(0.34, 1.56, 0.64, 1)";

/* The open morph's height transition: delay + duration. After this the frame
   stops easing on its own and simply follows the rows (see listH). */
const OPEN_HEIGHT_DELAY_MS = 40;
const OPEN_HEIGHT_MS = 210;
const OPEN_HEIGHT_TRANSITION = `height ${OPEN_HEIGHT_MS}ms cubic-bezier(0.3,1,0.35,1) ${OPEN_HEIGHT_DELAY_MS}ms`;
const CLOSE_HEIGHT_TRANSITION = "height 150ms cubic-bezier(0.4,0,0.6,1)";

const CommandPalettePanel = ({
  open = false,
  query = "/",
  items = [],
  activeIndex = 0,
  onPick = () => {},
  onHoverId = null,
  onVisibleChange = null,
  folderState = null,
  expandRef = null,
  onOrganize = null,
  organizeLabel = "",
  visibleRowCount = 0,
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

  /* The list's height is MEASURED, not computed from a row count. A folder
     toggled in the tree is Explorer's own 280ms height animation on the rows;
     a count-derived height changed at once, so the frame eased to its new
     size on its own clock while the rows folded on theirs — 86px of empty
     panel above the rows at the worst frame, rows chopped by a cap that had
     already snapped. Measuring the host makes the frame the rows' motion,
     nothing else. flushSync: a ResizeObserver runs after layout and before
     paint, and the frame has to land in the same paint as the rows it
     follows — a render scheduled for later paints one frame behind. */
  const listHostRef = useRef(null);
  const [listContentH, setListContentH] = useState(0);
  useEffect(() => {
    const el = listHostRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = Math.round(entry.contentRect.height);
        flushSync(() => setListContentH(h));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const listMaxH = commandListCapHeight({ bare: true });
  const listH = on ? listContentH : 0;

  /* Which motion owns the height. The open and close morphs ease it — the
     panel growing out of the pill and folding back into it. Once the open
     morph has settled, the height carries no transition at all, so the
     measured value above is applied as the rows move, frame for frame. */
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!on) {
      setSettled(false);
      return undefined;
    }
    const timer = setTimeout(
      () => setSettled(true),
      OPEN_HEIGHT_DELAY_MS + OPEN_HEIGHT_MS,
    );
    return () => clearTimeout(timer);
  }, [on]);
  const heightTransition = on
    ? settled
      ? null
      : OPEN_HEIGHT_TRANSITION
    : CLOSE_HEIGHT_TRANSITION;
  const panelTransition = [
    heightTransition,
    ...(on
      ? [
          "background-color 180ms ease",
          "border-color 180ms ease",
          "box-shadow 210ms ease",
        ]
      : [
          "background-color 130ms ease 40ms",
          "border-color 130ms ease 40ms",
          "box-shadow 130ms ease",
        ]),
  ]
    .filter(Boolean)
    .join(", ");
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
  /* the organize action sits in this same bar and speaks in the same voice as
     the hints — a shade stronger at rest so it reads as pressable, a wash on
     hover; it is an action among the panel's other panel-level things
     (↑↓ ⏎), which is why it lives here and not as a row in the list */
  const actionColor = isDark ? "rgba(var(--pupu-text-rgb),0.55)" : "rgba(var(--pupu-text-rgb),0.5)";
  const actionHoverBg = isDark ? "rgba(var(--pupu-text-rgb),0.08)" : "rgba(var(--pupu-text-rgb),0.06)";
  const actionActiveBg = isDark ? "rgba(var(--pupu-text-rgb),0.14)" : "rgba(var(--pupu-text-rgb),0.1)";
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
          transition: panelTransition,
          zIndex: 1,
          pointerEvents: on ? "auto" : "none",
        }}
      >
        {/* command rows (above the header slot). The outer div is the morph's
            reveal clip: it shrinks with the panel's height and hides what is
            not yet grown into view. The inner div — not the menu — is the
            scroll host, and its viewport is a fixed cap, so nothing scrolls
            it while the panel is still growing (a shrinking host asked the
            active row into view and opened the list 7px down). PuPu's
            scrollbar is the overlay thumb that `.scrollable` hangs on a
            container's parent, and its track is laid out here against the
            panel's own frame: it begins where the 22px corner begins (the
            host sits 1px inside the border) and stops the same distance
            short of the bottom. Boxed inside the panel with its own inset,
            the menu could only ever run the thumb from the corner down to
            the hint bar. */}
        <div style={{ minHeight: 0, overflow: "hidden" }}>
          <div
            ref={listHostRef}
            className="scrollable"
            data-command-list-scroll=""
            data-sb-edge={PANEL_RADIUS - 1}
            data-sb-wall={SCROLLBAR_WALL}
            style={{
              maxHeight: listMaxH,
              overflowY: "auto",
              overscrollBehavior: "contain",
            }}
          >
            {open && (
              <CommandMenu
                items={items}
                activeIndex={activeIndex}
                onPick={onPick}
                onHover={onHoverId}
                onVisibleChange={onVisibleChange}
                folderState={folderState}
                expandRef={expandRef}
                visibleRowCount={visibleRowCount}
                isDark={isDark}
                bare
                visible={on}
              />
            )}
          </div>
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
              {onOrganize ? "COMMANDS · ↑↓ · ⏎" : "COMMANDS · ↑↓ · ⏎ · esc"}
            </span>
            {onOrganize ? (
              /* The header is pointer-events:none (it is decorative — the
                 pill underneath owns the clicks at rest). This one child
                 re-enables them for itself. mousedown is cancelled on the
                 wrapper so the composer's textarea keeps focus: a blur would
                 close the palette before the click ever lands. */
              <span
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                style={{
                  marginLeft: "auto",
                  display: "inline-flex",
                  pointerEvents: "auto",
                }}
              >
                <Button
                  prefix_icon="list_settings"
                  label={organizeLabel}
                  onClick={onOrganize}
                  dom_props={{ "data-command-organize-action": "" }}
                  style={{
                    height: 18,
                    fontSize: 10.5,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    color: actionColor,
                    paddingVertical: 0,
                    paddingHorizontal: 8,
                    iconSize: 12,
                    gap: 5,
                    borderRadius: 9,
                    hoverBackgroundColor: actionHoverBg,
                    activeBackgroundColor: actionActiveBg,
                  }}
                />
              </span>
            ) : null}
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

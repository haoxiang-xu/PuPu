import { useEffect, useRef, useState } from "react";
import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";
import SlidingHighlight from "../../../BUILTIN_COMPONENTs/class/sliding_highlight";

/**
 * Queue UI — a compact segment that lives INSIDE the attach panel row.
 *
 * The segment reads: [queue icon] ×N [latest message text]. It carries NO
 * resting highlight — the sub-pill background appears on hover only.
 *
 * Hovering opens the queue panel above the row: a clone of the command
 * palette's language (design B) — same translucent blur(20px) surface,
 * radius 22, 8px inset, 28px rows with radius 14 (concentric), row-level
 * hover highlight, Elevator Push entrance (rows cascade at 130+i×35ms) —
 * plus the palette's bottom header slot: a green chip (queue ×N) and a
 * QUEUED hint. Undo is row-hover-revealed; relayed rows render green with a
 * ✓ in the icon slot and no Undo.
 *
 * attach_panel.js renders <QueueAttachSection> whenever the queue is
 * non-empty; there is no other home for the queued turns.
 */

const PANEL_W = 300;
const PANEL_RADIUS = 22; // matches the command palette panel
const PANEL_PAD = 8; // inset → row radius 14 keeps corners concentric
const ROW_H = 28;
const ROW_RADIUS = 14;
const SEG_H = 32; // matches the attach panel's sub-pill height
const EXPAND_DELAY = 120; // hover-intent: brief delay before the panel opens
const COLLAPSE_DELAY = 180; // grace period before it closes
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";

/* ── hover-intent hook: delayed expand, grace-period collapse ── */
const useHoverIntent = () => {
  const [hover, setHover] = useState(false);
  const timerRef = useRef(null);
  useEffect(() => () => clearTimeout(timerRef.current), []);
  const onMouseEnter = () => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setHover(true), EXPAND_DELAY);
  };
  const onMouseLeave = () => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setHover(false), COLLAPSE_DELAY);
  };
  const closeNow = () => {
    clearTimeout(timerRef.current);
    setHover(false);
  };
  return [hover, { onMouseEnter, onMouseLeave }, closeNow];
};

/* double-rAF latch so the panel mounted-on-hover still animates in */
const useEnteredLatch = (active) => {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    if (!active) {
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
  }, [active]);
  return entered;
};

/* ── summary content: [icon] ×N [latest text] ── */
export const QueueSummaryInline = ({ items = [], isDark = false }) => {
  const latest = items[items.length - 1];
  return (
    <>
      <span
        style={{
          flexShrink: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon
          src="queue_arrow"
          color={isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.45)"}
          style={{ width: 14, height: 14 }}
        />
      </span>
      {items.length > 1 && (
        <span
          data-queue-count=""
          style={{
            flexShrink: 0,
            fontSize: 10,
            fontWeight: 700,
            color: isDark ? "rgba(150,225,170,0.95)" : "rgba(25,130,70,0.9)",
          }}
        >
          ×{items.length}
        </span>
      )}
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 12,
          color: isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.8)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {latest?.text}
      </span>
    </>
  );
};

/* ── one row in the panel (command-menu row language) ── */
const QueueRow = ({
  item,
  isDark,
  onUndo,
  entered,
  delayMs,
  active,
  onActive,
  refCallback,
}) => {
  const relayed = item?.status === "relayed";
  const relayedColor = isDark
    ? "rgba(150,225,170,0.95)"
    : "rgba(25,130,70,0.9)";
  const undoColor = isDark
    ? "rgba(90, 160, 255, 0.95)"
    : "rgba(20, 110, 220, 0.9)";

  return (
    <div
      ref={refCallback}
      data-queue-row
      data-status={relayed ? "relayed" : "queued"}
      onMouseEnter={onActive}
      style={{
        boxSizing: "border-box",
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 8,
        height: ROW_H,
        padding: "0 8px",
        borderRadius: ROW_RADIUS,
        opacity: entered ? 1 : 0,
        transform: entered ? "translateY(0)" : "translateY(-9px)",
        transition: entered
          ? `transform 160ms ${EASE_OUT} ${delayMs}ms, opacity 160ms linear ${delayMs}ms`
          : "transform 110ms cubic-bezier(0.4,0,1,1), opacity 110ms cubic-bezier(0.4,0,1,1)",
      }}
    >
      <span
        style={{
          flexShrink: 0,
          width: 14,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {relayed ? (
          <span style={{ fontSize: 11, lineHeight: 1, color: relayedColor }}>
            ✓
          </span>
        ) : (
          <Icon
            src="queue_arrow"
            color={isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.4)"}
            style={{ width: 13, height: 13 }}
          />
        )}
      </span>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 12,
          lineHeight: "16px",
          color: relayed
            ? relayedColor
            : isDark
              ? "rgba(255,255,255,0.86)"
              : "rgba(0,0,0,0.82)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {item?.text}
      </span>
      {!relayed && (
        <button
          type="button"
          aria-label="Undo"
          onClick={() => onUndo(item.id)}
          style={{
            flexShrink: 0,
            border: "none",
            background: "transparent",
            padding: "2px 7px",
            margin: 0,
            fontSize: 10.5,
            fontWeight: 600,
            lineHeight: 1,
            borderRadius: 8,
            color: undoColor,
            cursor: "pointer",
            /* revealed on the active row (hover OR keyboard), always
               present for a11y */
            opacity: active ? 1 : 0,
            transition: "opacity 130ms ease",
          }}
        >
          Undo
        </button>
      )}
    </div>
  );
};

/* ── the queue panel: palette clone, header pinned at the bottom ── */
export const QueuePanel = ({
  items = [],
  onUndo = () => {},
  isDark = false,
  entered = true,
  activeIndex = -1,
  onActiveIndex = () => {},
  rowRefs,
}) => {
  const chipBg = isDark ? "rgba(120,200,150,0.14)" : "rgba(40,150,80,0.12)";
  const chipColor = isDark ? "#9ad9a0" : "rgba(25,125,65,0.95)";
  const hintColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.38)";
  const fallbackRowRefs = useRef([]);
  const refs = rowRefs || fallbackRowRefs;

  return (
    <div
      data-queue-panel=""
      style={{
        boxSizing: "border-box",
        position: "relative",
        width: PANEL_W,
        display: "flex",
        flexDirection: "column",
        gap: 1,
        padding: PANEL_PAD,
        borderRadius: PANEL_RADIUS,
        cornerShape: "squircle",
        backgroundColor: isDark
          ? "rgba(28,28,28,0.85)"
          : "rgba(252,252,252,0.9)",
        border: isDark
          ? "1px solid rgba(255,255,255,0.10)"
          : "1px solid rgba(0,0,0,0.09)",
        backdropFilter: "blur(20px) saturate(130%)",
        WebkitBackdropFilter: "blur(20px) saturate(130%)",
        boxShadow: isDark
          ? "0 10px 34px rgba(0,0,0,0.5)"
          : "0 10px 34px rgba(0,0,0,0.12)",
        opacity: entered ? 1 : 0,
        transform: entered
          ? "translateY(0) scale(1)"
          : "translateY(6px) scale(0.985)",
        transformOrigin: "bottom left",
        transition: entered
          ? "opacity 210ms cubic-bezier(0.3,1,0.35,1), transform 210ms cubic-bezier(0.3,1,0.35,1)"
          : "opacity 150ms cubic-bezier(0.4,0,0.6,1), transform 150ms cubic-bezier(0.4,0,0.6,1)",
      }}
    >
      {/* one hover/keyboard pill gliding between rows */}
      <SlidingHighlight
        refs={refs}
        index={activeIndex}
        color={isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.06)"}
        borderRadius={ROW_RADIUS}
        measureKey={`${items.length}|${entered}`}
      />

      {/* rows: oldest → newest, top-down cascade */}
      {items.map((item, index) => (
        <QueueRow
          key={item.id}
          item={item}
          isDark={isDark}
          onUndo={onUndo}
          entered={entered}
          delayMs={130 + index * 35}
          active={index === activeIndex}
          onActive={() => onActiveIndex(index)}
          refCallback={(el) => {
            refs.current[index] = el;
          }}
        />
      ))}

      {/* header slot at the bottom — the palette's chip + hint, queue-dyed.
          chip corner is concentric with the panel's bottom-left: the chip is
          an 18px pill (r9) inset 13px from the panel edge on both axes
          (8 panel pad + 5 header pad), and 9 + 13 = 22, the panel radius */}
      <div
        data-queue-panel-header=""
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "7px 6px 5px 5px",
        }}
      >
        <span
          style={{
            boxSizing: "border-box",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            height: 18,
            fontSize: 11.5,
            fontWeight: 600,
            color: chipColor,
            backgroundColor: chipBg,
            borderRadius: 9,
            padding: "0 8px",
            whiteSpace: "nowrap",
          }}
        >
          <Icon
            src="queue_arrow"
            color={chipColor}
            style={{ width: 11, height: 11 }}
          />
          queue ×{items.length}
        </span>
        <span
          style={{
            fontSize: 10,
            letterSpacing: "0.05em",
            color: hintColor,
            whiteSpace: "nowrap",
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
        >
          QUEUED · RUNS AFTER THIS TURN
        </span>
      </div>
    </div>
  );
};

/* ── the attach panel segment ── */
export const QueueAttachSection = ({
  items = [],
  onUndo = () => {},
  isDark = false,
  forceOpen = false,
  onForceOpenChange = () => {},
  highlightRing = false,
}) => {
  const [hoverOpen, hoverHandlers, closeNow] = useHoverIntent();
  const open = hoverOpen || forceOpen;
  const [segHover, setSegHover] = useState(false); // instant highlight
  const [activeIndex, setActiveIndex] = useState(-1);
  const entered = useEnteredLatch(open);
  const rowRefs = useRef([]);
  const stateRef = useRef({ items, activeIndex, onUndo });
  stateRef.current = { items, activeIndex, onUndo };

  useEffect(() => {
    if (!open) setActiveIndex(-1);
  }, [open]);

  /* keyboard-opened: start the pill on the first row */
  useEffect(() => {
    if (forceOpen) setActiveIndex((prev) => (prev < 0 ? 0 : prev));
  }, [forceOpen]);

  /* keyboard control while the panel is open: ↑↓ move the pill,
     Enter/Delete undo the active queued row, Esc closes. Keys are left
     alone while the user is typing in a text field — UNLESS the panel was
     opened by keyboard (forceOpen), where driving it is the intent. */
  useEffect(() => {
    if (!open) return undefined;
    const isTyping = () => {
      if (forceOpen) return false;
      const el = document.activeElement;
      return (
        el &&
        (el.tagName === "TEXTAREA" ||
          el.tagName === "INPUT" ||
          el.isContentEditable)
      );
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        closeNow();
        onForceOpenChange(false);
        return;
      }
      if (isTyping()) return;
      const { items: its, activeIndex: idx, onUndo: undo } = stateRef.current;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const delta = e.key === "ArrowDown" ? 1 : -1;
        setActiveIndex((prev) => {
          const total = its.length;
          if (!total) return -1;
          return prev < 0
            ? delta > 0
              ? 0
              : total - 1
            : (prev + delta + total) % total;
        });
        return;
      }
      if (e.key === "Enter" || e.key === "Delete" || e.key === "Backspace") {
        const item = its[idx];
        if (item && item.status !== "relayed") {
          e.preventDefault();
          undo(item.id);
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, forceOpen]);

  if (!Array.isArray(items) || items.length === 0) return null;

  return (
    <div
      data-queue-attach-section=""
      data-expanded={open}
      role="group"
      aria-label="Queued messages"
      {...hoverHandlers}
      style={{ position: "relative", display: "flex", alignItems: "center" }}
    >
      {/* the segment — NO resting highlight; sub-pill bg on hover only */}
      <div
        onMouseEnter={() => setSegHover(true)}
        onMouseLeave={() => setSegHover(false)}
        style={{
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          gap: 6,
          height: SEG_H,
          maxWidth: 200,
          padding: "0 10px",
          borderRadius: 999,
          backgroundColor:
            segHover || open || highlightRing
              ? isDark
                ? "rgba(255,255,255,0.07)"
                : "rgba(0,0,0,0.05)"
              : "transparent",
          transition: "background-color 160ms ease",
        }}
      >
        <QueueSummaryInline items={items} isDark={isDark} />
      </div>

      {/* hover: the palette-clone panel above the row; paddingBottom keeps
          the hover region contiguous across the visual gap */}
      {open && (
        <div
          style={{
            position: "absolute",
            left: 0,
            bottom: "100%",
            width: PANEL_W,
            paddingBottom: 8,
            zIndex: 40,
          }}
        >
          <QueuePanel
            items={items}
            onUndo={onUndo}
            isDark={isDark}
            entered={entered}
            activeIndex={activeIndex}
            onActiveIndex={setActiveIndex}
            rowRefs={rowRefs}
          />
        </div>
      )}
    </div>
  );
};

import { useEffect, useRef, useState } from "react";
import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";

/**
 * Steer queue UI — a compact segment that lives INSIDE the attach panel row.
 *
 * The segment reads: [steer icon] ×N [latest message text]. It carries NO
 * resting highlight — the sub-pill background appears on hover only.
 *
 * Hovering opens the steer panel above the row: a clone of the command
 * palette's language (design B) — same translucent blur(20px) surface,
 * radius 22, 8px inset, 28px rows with radius 14 (concentric), row-level
 * hover highlight, Elevator Push entrance (rows cascade at 130+i×35ms) —
 * plus the palette's bottom header slot: a green chip (steer ×N) and a
 * QUEUED hint. Undo is row-hover-revealed; relayed rows render green with a
 * ✓ in the icon slot and no Undo.
 *
 * attach_panel.js renders <SteerAttachSection> whenever the queue is
 * non-empty; there is no other home for the steer queue.
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
  return [hover, { onMouseEnter, onMouseLeave }];
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
export const SteerSummaryInline = ({ items = [], isDark = false }) => {
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
          src="steer_arrow"
          color={isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.45)"}
          style={{ width: 14, height: 14 }}
        />
      </span>
      {items.length > 1 && (
        <span
          data-steer-count=""
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
const SteerRow = ({ item, isDark, onUndo, entered, delayMs }) => {
  const [rowHover, setRowHover] = useState(false);
  const relayed = item?.status === "relayed";
  const relayedColor = isDark
    ? "rgba(150,225,170,0.95)"
    : "rgba(25,130,70,0.9)";
  const undoColor = isDark
    ? "rgba(90, 160, 255, 0.95)"
    : "rgba(20, 110, 220, 0.9)";

  return (
    <div
      data-steer-row
      data-status={relayed ? "relayed" : "queued"}
      onMouseEnter={() => setRowHover(true)}
      onMouseLeave={() => setRowHover(false)}
      style={{
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        gap: 8,
        height: ROW_H,
        padding: "0 8px",
        borderRadius: ROW_RADIUS,
        backgroundColor: rowHover
          ? isDark
            ? "rgba(255,255,255,0.10)"
            : "rgba(0,0,0,0.06)"
          : "transparent",
        opacity: entered ? 1 : 0,
        transform: entered ? "translateY(0)" : "translateY(-9px)",
        transition: entered
          ? `transform 160ms ${EASE_OUT} ${delayMs}ms, opacity 160ms linear ${delayMs}ms, background-color 130ms ease`
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
            src="steer_arrow"
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
            /* row-hover-revealed, like the mock — still clickable the moment
               the row is hovered, and always present for a11y */
            opacity: rowHover ? 1 : 0,
            transition: "opacity 130ms ease",
          }}
        >
          Undo
        </button>
      )}
    </div>
  );
};

/* ── the steer panel: palette clone, header pinned at the bottom ── */
export const SteerPanel = ({
  items = [],
  onUndo = () => {},
  isDark = false,
  entered = true,
}) => {
  const chipBg = isDark ? "rgba(120,200,150,0.14)" : "rgba(40,150,80,0.12)";
  const chipColor = isDark ? "#9ad9a0" : "rgba(25,125,65,0.95)";
  const hintColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.38)";

  return (
    <div
      data-steer-panel=""
      style={{
        boxSizing: "border-box",
        width: PANEL_W,
        display: "flex",
        flexDirection: "column",
        gap: 1,
        padding: PANEL_PAD,
        borderRadius: PANEL_RADIUS,
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
      {/* rows: oldest → newest, top-down cascade */}
      {items.map((item, index) => (
        <SteerRow
          key={item.id}
          item={item}
          isDark={isDark}
          onUndo={onUndo}
          entered={entered}
          delayMs={130 + index * 35}
        />
      ))}

      {/* header slot at the bottom — the palette's chip + hint, steer-dyed */}
      <div
        data-steer-panel-header=""
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "7px 6px 3px",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 11.5,
            fontWeight: 600,
            color: chipColor,
            backgroundColor: chipBg,
            borderRadius: 6,
            padding: "1px 8px",
            whiteSpace: "nowrap",
          }}
        >
          <Icon
            src="steer_arrow"
            color={chipColor}
            style={{ width: 11, height: 11 }}
          />
          steer ×{items.length}
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
export const SteerAttachSection = ({
  items = [],
  onUndo = () => {},
  isDark = false,
}) => {
  const [open, hoverHandlers] = useHoverIntent();
  const [segHover, setSegHover] = useState(false); // instant highlight
  const entered = useEnteredLatch(open);

  if (!Array.isArray(items) || items.length === 0) return null;

  return (
    <div
      data-steer-attach-section=""
      data-expanded={open}
      role="group"
      aria-label="Queued steer messages"
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
            segHover || open
              ? isDark
                ? "rgba(255,255,255,0.07)"
                : "rgba(0,0,0,0.05)"
              : "transparent",
          transition: "background-color 160ms ease",
        }}
      >
        <SteerSummaryInline items={items} isDark={isDark} />
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
          <SteerPanel
            items={items}
            onUndo={onUndo}
            isDark={isDark}
            entered={entered}
          />
        </div>
      )}
    </div>
  );
};

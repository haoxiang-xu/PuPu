import { useEffect, useRef, useState } from "react";
import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";

/**
 * Steer queue UI — a compact segment that lives INSIDE the attach panel row.
 *
 * The segment reads: [steer icon] ×N [latest message text]. Hovering it pops
 * the full queue above the panel as a fan of cards, each with Undo. Relayed
 * items (merged into the next turn) render green with a ✓ and no Undo.
 *
 * attach_panel.js renders <SteerAttachSection> whenever the queue is
 * non-empty; there is no other home for the steer queue.
 */

const CARD_W = 300;
const ROW_H = 32; // matches the attach panel's sub-pill height
const CARD_R = 12;
const CARD_GAP = 8;
const MS = 240;
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
const EXPAND_DELAY = 120; // hover-intent: brief delay before the fan opens
const COLLAPSE_DELAY = 180; // grace period before it closes

const surfaceOf = (isDark) =>
  isDark
    ? "var(--pupu-surface, rgba(30, 30, 30, 1))"
    : "var(--pupu-surface, rgba(255,255,255,1))";
const edgeOf = (isDark) =>
  isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";

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

/* double-rAF latch so the fan mounted-on-hover still animates in */
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

/* ── one full card in the fan ── */
const SteerFanCard = ({ item, isDark, onUndo, entered, delayMs }) => {
  const relayed = item?.status === "relayed";
  const relayedColor = isDark
    ? "rgba(150,225,170,0.95)"
    : "rgba(25,130,70,0.9)";
  return (
    <div
      data-steer-card
      data-status={relayed ? "relayed" : "queued"}
      style={{
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        gap: 8,
        minHeight: ROW_H,
        padding: "5px 5px 5px 10px",
        backgroundColor: surfaceOf(isDark),
        border: relayed
          ? isDark
            ? "1px solid rgba(120,210,150,0.6)"
            : "1px solid rgba(35,150,85,0.5)"
          : `1px solid ${edgeOf(isDark)}`,
        borderRadius: CARD_R,
        boxShadow: isDark
          ? "0 6px 18px rgba(0,0,0,0.4)"
          : "0 6px 18px rgba(0,0,0,0.08)",
        opacity: entered ? 1 : 0,
        transform: entered ? "none" : "translateY(8px) scale(0.97)",
        transition: `opacity ${MS}ms ${EASE} ${delayMs}ms, transform ${MS}ms ${EASE} ${delayMs}ms`,
      }}
    >
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
          color={
            relayed
              ? relayedColor
              : isDark
                ? "rgba(255,255,255,0.45)"
                : "rgba(0,0,0,0.4)"
          }
          style={{ width: 13, height: 13 }}
        />
      </span>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 12,
          lineHeight: 1.35,
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
        {relayed ? `✓ ${item?.text}` : item?.text}
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
            padding: "3px 7px",
            margin: 0,
            fontSize: 10,
            fontWeight: 600,
            lineHeight: 1,
            borderRadius: 6,
            color: "rgba(20, 110, 220, 0.9)",
            cursor: "pointer",
          }}
        >
          Undo
        </button>
      )}
    </div>
  );
};

/* ── the fan: a column of cards, oldest on top / newest at the bottom ── */
export const SteerFan = ({
  items = [],
  onUndo = () => {},
  isDark = false,
  entered = true,
}) => (
  <div
    data-steer-fan=""
    style={{ display: "flex", flexDirection: "column", gap: CARD_GAP }}
  >
    {items.map((item, index) => (
      <SteerFanCard
        key={item.id}
        item={item}
        isDark={isDark}
        onUndo={onUndo}
        entered={entered}
        /* stagger from the bottom (newest) upward */
        delayMs={40 + (items.length - 1 - index) * 35}
      />
    ))}
  </div>
);

/* ── the attach panel segment ── */
export const SteerAttachSection = ({
  items = [],
  onUndo = () => {},
  isDark = false,
}) => {
  const [hover, hoverHandlers] = useHoverIntent();
  const entered = useEnteredLatch(hover);

  if (!Array.isArray(items) || items.length === 0) return null;

  return (
    <div
      data-steer-attach-section=""
      data-expanded={hover}
      role="group"
      aria-label="Queued steer messages"
      {...hoverHandlers}
      style={{ position: "relative", display: "flex", alignItems: "center" }}
    >
      {/* the segment — sub-pill, same language as the model selector pill */}
      <div
        style={{
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          gap: 6,
          height: ROW_H,
          maxWidth: 200,
          padding: "0 10px",
          borderRadius: 999,
          backgroundColor: isDark
            ? "rgba(255,255,255,0.07)"
            : "rgba(0,0,0,0.05)",
        }}
      >
        <SteerSummaryInline items={items} isDark={isDark} />
      </div>

      {/* hover: full fan above the panel; paddingBottom keeps the hover
          region contiguous across the visual gap */}
      {hover && (
        <div
          style={{
            position: "absolute",
            left: 0,
            bottom: "100%",
            width: CARD_W,
            paddingBottom: 10,
            zIndex: 40,
          }}
        >
          <SteerFan
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

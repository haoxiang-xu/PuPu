import { useLayoutEffect, useRef, useState } from "react";

/**
 * SteerPile — a stack of queued /steer interjections anchored above the chat
 * input. The stacking + expand animation mirrors the app's toast pile
 * (BUILTIN_COMPONENTs/toast/toast_host.js) exactly:
 *
 * - Newest item is at the FRONT (index 0) of the collapsed deck; cards behind
 *   peek upward (translateY + scale-down). The 4th+ item folds into a "+N".
 * - On hover the deck expands into a vertical list with the newest at the
 *   BOTTOM (closest to the input) and older ones fanning upward.
 * - The whole pile is ONE contiguous hit region (an inner block whose height
 *   animates), so hovering the gaps between expanded cards never fires a
 *   spurious mouseleave — no expand/collapse flicker.
 *
 * Collapsed the pile sits at z-index 1, BEHIND the input (which is z-index 2
 * with an opaque surface), so the input occludes its lower part. On hover it
 * lifts to z-index 30, above the input. Renders nothing when `items` is empty.
 */

const MAX_VISIBLE = 3;
const ANIM_MS = 260;
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
const PEEK = 10; // collapsed: how far each card behind peeks up
const GAP = 8; // expanded: gap between cards
const SCALE_STEP = 0.05; // collapsed: scale-down per depth
const FALLBACK_H = 44; // height fallback before measurement
const OVERLAP = 10; // px the collapsed deck sinks behind the input's top edge

const SteerPile = ({ items = [], onUndo = () => {}, isDark = false }) => {
  const [expanded, setExpanded] = useState(false);
  const wrapRefs = useRef({});
  const [heights, setHeights] = useState({});

  const ordered = [...items].reverse(); // newest first (front = index 0)
  const visible = ordered.slice(0, MAX_VISIBLE);
  const overflow = Math.max(0, ordered.length - visible.length);

  const idKey = visible.map((item) => item.id).join(",");
  useLayoutEffect(() => {
    const next = {};
    visible.forEach((item) => {
      const el = wrapRefs.current[item.id];
      if (el) next[item.id] = el.offsetHeight;
    });
    setHeights(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey]);

  if (!Array.isArray(items) || items.length === 0) return null;

  const heightOf = (item) => heights[item.id] || FALLBACK_H;
  const count = visible.length;

  const expandedOffset = (index) => {
    let sum = 0;
    for (let k = 0; k < index; k += 1) sum += heightOf(visible[k]) + GAP;
    return sum;
  };

  const frontH = count ? heightOf(visible[0]) : 0;
  const collapsedTotal = frontH + Math.max(0, count - 1) * PEEK;
  const expandedTotal = count
    ? visible.reduce((sum, item) => sum + heightOf(item), 0) + (count - 1) * GAP
    : 0;
  const pileHeight = expanded ? expandedTotal : collapsedTotal;

  return (
    <div
      role="group"
      aria-label="Queued steer messages"
      data-expanded={expanded}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      style={{
        position: "absolute",
        left: "50%",
        transform: "translateX(-50%)",
        // Fixed anchor: sinks OVERLAP px behind the input's top edge so the
        // input occludes the deck's lower part when collapsed. The anchor never
        // moves; only the inner height animates — so no hover flicker.
        bottom: `calc(100% - ${OVERLAP}px)`,
        width: "calc(100% - 48px)",
        maxWidth: 560,
        zIndex: expanded ? 30 : 1,
        // ONE contiguous hit region across the whole (incl. expanded gaps) pile.
        pointerEvents: "auto",
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: pileHeight,
          transition: `height ${ANIM_MS}ms ${EASE}`,
        }}
      >
        {visible.map((item, index) => {
          const y = expanded ? -expandedOffset(index) : -index * PEEK;
          const scale = expanded ? 1 : 1 - index * SCALE_STEP;
          const hiddenCount = index === 0 ? overflow : 0;
          return (
            <div
              key={item.id}
              ref={(el) => {
                if (el) wrapRefs.current[item.id] = el;
                else delete wrapRefs.current[item.id];
              }}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 100 - index,
                transformOrigin: "bottom center",
                transform: `translateY(${y}px) scale(${scale})`,
                transition: `transform ${ANIM_MS}ms ${EASE}`,
              }}
            >
              <SteerCard
                item={item}
                expanded={expanded}
                isDark={isDark}
                onUndo={onUndo}
                hiddenCount={hiddenCount}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

const SteerCard = ({ item, expanded, isDark, onUndo, hiddenCount }) => {
  const relayed = item?.status === "relayed";

  // Collapsed cards are opaque so the deck reads as tucked behind the input;
  // expanded they float above content as a translucent, backdrop-blurred panel.
  const surfaceBg = expanded
    ? isDark
      ? "rgba(28,28,28,0.62)"
      : "rgba(255,255,255,0.66)"
    : isDark
      ? "var(--pupu-surface, rgba(30,30,30,0.98))"
      : "var(--pupu-surface, rgba(255,255,255,0.98))";
  const backdrop = expanded ? "blur(20px) saturate(180%)" : "none";
  const defaultBorder = isDark
    ? "1px solid rgba(255,255,255,0.10)"
    : "1px solid rgba(0,0,0,0.08)";
  const relayedBorder = isDark
    ? "1px solid rgba(120,210,150,0.6)"
    : "1px solid rgba(35,150,85,0.5)";
  const labelColor = isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)";
  const relayedColor = isDark ? "rgba(150,225,170,0.95)" : "rgba(25,130,70,0.9)";
  const textColor = isDark ? "rgba(255,255,255,0.86)" : "rgba(0,0,0,0.82)";
  const undoColor = isDark ? "rgba(140,190,255,0.9)" : "rgba(20,110,220,0.9)";
  const shadow = isDark
    ? "0 6px 18px rgba(0,0,0,0.4)"
    : "0 6px 18px rgba(0,0,0,0.08)";

  return (
    <div
      data-steer-card
      data-status={relayed ? "relayed" : "queued"}
      style={{
        boxSizing: "border-box",
        width: "100%",
        backgroundColor: surfaceBg,
        backdropFilter: backdrop,
        WebkitBackdropFilter: backdrop,
        border: relayed ? relayedBorder : defaultBorder,
        borderRadius: 10,
        padding: "5px 10px",
        boxShadow: shadow,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: 0.2,
            color: relayed ? relayedColor : labelColor,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {relayed ? "✓ Merged into next turn" : "Queued · runs after this turn"}
          {hiddenCount > 0 ? ` +${hiddenCount}` : ""}
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
              padding: "1px 3px",
              margin: 0,
              fontSize: 10,
              fontWeight: 500,
              color: undoColor,
              cursor: "pointer",
            }}
          >
            Undo
          </button>
        )}
      </div>
      <div
        style={{
          marginTop: 2,
          fontSize: 12,
          lineHeight: 1.35,
          color: textColor,
          overflow: "hidden",
          display: "-webkit-box",
          WebkitBoxOrient: "vertical",
          WebkitLineClamp: expanded ? 3 : 1,
          whiteSpace: expanded ? "normal" : "nowrap",
          textOverflow: "ellipsis",
        }}
      >
        {item?.text}
      </div>
    </div>
  );
};

export default SteerPile;

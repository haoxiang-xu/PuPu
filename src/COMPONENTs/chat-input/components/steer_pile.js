import { useState } from "react";

/**
 * SteerPile — input-anchored stack of queued /steer interjections.
 *
 * Default state: collapsed and tucked BEHIND the input (z-index below the
 * input, bottom edge overlapping the input's top edge by ~13px) — like a
 * stack of notes sitting in an outbox, only the front card's label row
 * peeking above the input. Cards behind the front one peek only their top
 * edge (translateY increasing, scale decreasing, opacity fading, z-index
 * descending); the 4th+ item is hidden and folded into a "+N" badge on the
 * front card's label.
 *
 * On hover/focus-within: the whole pile lifts above the input (z-index
 * raised above it) and expands into a vertical list with full cards.
 *
 * Renders nothing when `items` is empty.
 */

const MAX_VISIBLE = 3;
const COLLAPSE_OVERLAP = 10; // px the stack sinks into the input's top edge
const EXPAND_GAP = 10; // px gap above the input once expanded
const PEEK = 6; // px each card behind the front peeks upward (deck look)

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const SteerPile = ({ items = [], onUndo = () => {}, isDark = false }) => {
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);

  if (!Array.isArray(items) || items.length === 0) return null;

  const expanded = hovered || focusWithin;
  const visible = items.slice(0, MAX_VISIBLE);
  const hiddenCount = Math.max(0, items.length - MAX_VISIBLE);
  const reducedMotion = prefersReducedMotion();

  const transition = reducedMotion
    ? "none"
    : "transform 180ms cubic-bezier(0.2,0.8,0.3,1), opacity 180ms ease, bottom 180ms cubic-bezier(0.2,0.8,0.3,1)";

  return (
    <div
      role="group"
      aria-label="已排队的引导消息"
      data-expanded={expanded}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocusWithin(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setFocusWithin(false);
        }
      }}
      style={{
        position: "absolute",
        left: "50%",
        transform: "translateX(-50%)",
        width: "calc(100% - 48px)",
        maxWidth: 560,
        bottom: expanded
          ? `calc(100% + ${EXPAND_GAP}px)`
          : `calc(100% - ${COLLAPSE_OVERLAP}px)`,
        zIndex: expanded ? 30 : 1,
        display: "flex",
        flexDirection: "column",
        gap: expanded ? 8 : 0,
        transition,
      }}
    >
      {visible.map((item, index) => (
        <SteerCard
          key={item.id}
          item={item}
          index={index}
          expanded={expanded}
          isDark={isDark}
          onUndo={onUndo}
          hiddenCount={index === 0 ? hiddenCount : 0}
          transition={transition}
        />
      ))}
    </div>
  );
};

const SteerCard = ({
  item,
  index,
  expanded,
  isDark,
  onUndo,
  hiddenCount,
  transition,
}) => {
  const relayed = item?.status === "relayed";

  const surfaceBg = isDark
    ? "var(--pupu-surface, rgba(30,30,30,0.98))"
    : "var(--pupu-surface, rgba(255,255,255,0.98))";
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

  // Collapsed: front card (index 0) sits in-flow at the bottom; cards behind
  // are absolutely aligned to that bottom edge and shifted UPWARD a few px each,
  // peeking their top edges like a fanned deck so 3 layers read at a glance.
  const depthStyle = expanded
    ? {
        position: "relative",
        transform: "none",
        opacity: 1,
      }
    : {
        position: index === 0 ? "relative" : "absolute",
        left: 0,
        right: 0,
        bottom: index === 0 ? undefined : 0,
        transform: `translateY(${-index * PEEK}px) scale(${1 - index * 0.04})`,
        opacity: Math.max(0.55, 1 - index * 0.16),
      };

  return (
    <div
      data-steer-card
      data-status={relayed ? "relayed" : "queued"}
      style={{
        boxSizing: "border-box",
        backgroundColor: surfaceBg,
        border: relayed ? relayedBorder : defaultBorder,
        borderRadius: 10,
        padding: "5px 10px",
        boxShadow: shadow,
        zIndex: expanded ? undefined : MAX_VISIBLE - index,
        transition,
        ...depthStyle,
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

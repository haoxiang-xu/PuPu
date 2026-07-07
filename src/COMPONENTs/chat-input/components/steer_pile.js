import { useState } from "react";
import CardStack from "../../../BUILTIN_COMPONENTs/stack/card_stack";
import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";

/**
 * SteerPile — queued /steer interjections, rendered as a CardStack anchored
 * above the chat input.
 *
 * This is a thin wrapper: all stacking math (collapsed deck, hover fan,
 * contiguous hit region, expand lift) lives in the generic CardStack
 * primitive. This file only owns the steer semantics — newest-first display
 * order, the input anchoring (collapsed deck tucked behind the input,
 * lifting clear of it on expand), and the card visuals/labels.
 *
 * Renders nothing when `items` is empty.
 */

const OVERLAP = 10; // collapsed: px the deck sinks behind the input's top edge
const LIFT = 8; // expanded: px gap between the bottom card and the input's top

const SteerPile = ({
  items = [],
  onUndo = () => {},
  isDark = false,
  attachPanelOpen = false,
}) => {
  const [expanded, setExpanded] = useState(false);

  if (!Array.isArray(items) || items.length === 0) return null;

  const ordered = [...items].reverse(); // newest first (front card)

  return (
    <CardStack
      items={ordered}
      aria_label="Queued steer messages"
      expand_lift={OVERLAP + LIFT}
      collapse_delay_ms={180}
      on_expand_change={setExpanded}
      style={{
        position: "absolute",
        // Anchored by left+right insets (not left:50% + transform), so the RIGHT
        // edge stays pinned to its centered position while the LEFT edge can be
        // pushed in. Closed: equal insets reproduce the old centered layout
        // exactly (width caps at 560 on its own, since the insets grow on wide
        // viewports). Open: the left inset clears the left-anchored attach panel
        // so the deck and the attach controls never overlap — only the left edge
        // moves (the right edge stays put), and it slides rather than jumps.
        right: "max(24px, calc((100% - 560px) / 2))",
        left: attachPanelOpen
          ? "max(344px, calc((100% - 560px) / 2))"
          : "max(24px, calc((100% - 560px) / 2))",
        transition: "left 0.22s cubic-bezier(0.32, 1, 0.32, 1)",
        // Fixed vertical anchor sunk OVERLAP px behind the input's top edge:
        // collapsed, the input (z-index 2, opaque) occludes the deck's lower
        // part. The anchor NEVER moves vertically — CardStack lifts the cards on
        // expand instead, so hovering never flickers.
        bottom: `calc(100% - ${OVERLAP}px)`,
        zIndex: expanded ? 30 : 1,
      }}
      render_card={({ item, expanded: isExpanded, overflow }) => (
        <SteerCard
          item={item}
          expanded={isExpanded}
          isDark={isDark}
          onUndo={onUndo}
          hiddenCount={overflow}
        />
      )}
    />
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
  const iconColor = relayed
    ? relayedColor
    : isDark
      ? "rgba(255,255,255,0.55)"
      : "rgba(0,0,0,0.5)";
  const undoColor = "rgba(20, 110, 220, 0.9)";
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
        padding: "5px 5px 5px 10px",
        boxShadow: shadow,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            flexShrink: 0,
            marginTop: 0,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon
            src="steer_arrow"
            color={iconColor}
            style={{ width: 18, height: 18 }}
          />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
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
              {relayed
                ? "✓ Merged into next turn"
                : "Queued · runs after this turn"}
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
                  padding: "3px 7px",
                  margin: 0,
                  fontSize: 10,
                  fontWeight: 500,
                  lineHeight: 1,
                  borderRadius: 6,
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
      </div>
    </div>
  );
};

export default SteerPile;

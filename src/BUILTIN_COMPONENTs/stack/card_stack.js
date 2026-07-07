import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * CardStack — the generic "pile of cards" input-stack primitive.
 *
 * Owns ONLY the stacking math (shared by the toast pile and the steer pile,
 * and by anything stackable added later):
 * - collapsed deck: items[0] is the FRONT card, fully visible; cards behind
 *   peek upward (translateY + scale-down per depth); items beyond
 *   `max_visible` are hidden (the caller shows a "+N" via the `overflow`
 *   value passed to `render_card`)
 * - hover / focus-within expands the deck into a vertical fan (bottom-up)
 * - ONE contiguous hit region: an inner block whose height animates covers
 *   the whole pile including expanded gaps, so the cursor never falls off
 *   mid-animation (no expand/collapse flicker)
 * - optional `expand_lift`: extra px the whole fan lifts on expand (lets a
 *   caller tuck the collapsed deck behind an element, e.g. the chat input,
 *   and clear it once expanded)
 *
 * Deliberately NOT owned here: item semantics, card visuals, ordering
 * policy (pass items in display order), and anchoring/positioning (style
 * the root via `style` / react to `on_expand_change`).
 *
 * NOTE: candidate for upstreaming to mini_ui (PuPu-first primitive).
 */

const DEFAULT_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const CardStack = ({
  items = [],
  render_card,
  max_visible = 3,
  peek = 10,
  gap = 8,
  scale_step = 0.05,
  anim_ms = 260,
  ease = DEFAULT_EASE,
  expand_lift = 0,
  collapse_delay_ms = 0,
  fallback_height = 44,
  aria_label,
  style,
  on_expand_change = () => {},
}) => {
  const [expanded, setExpanded] = useState(false);
  const wrapRefs = useRef({});
  const [heights, setHeights] = useState({});
  const collapseTimerRef = useRef(null);

  useEffect(
    () => () => {
      if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    },
    [],
  );

  const visible = items.slice(0, max_visible);
  const overflow = Math.max(0, items.length - visible.length);

  const idKey = visible.map((item) => item?.id).join(",");
  useLayoutEffect(() => {
    const next = {};
    visible.forEach((item) => {
      const el = wrapRefs.current[item.id];
      if (el) next[item.id] = el.offsetHeight;
    });
    setHeights(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey]);

  if (!Array.isArray(items) || items.length === 0 || !render_card) return null;

  const reducedMotion = prefersReducedMotion();
  const animMs = reducedMotion ? 0 : anim_ms;

  const heightOf = (item) => heights[item.id] || fallback_height;
  const count = visible.length;

  const expandedOffset = (index) => {
    let sum = 0;
    for (let k = 0; k < index; k += 1) sum += heightOf(visible[k]) + gap;
    return sum;
  };

  const frontH = count ? heightOf(visible[0]) : 0;
  const collapsedTotal = frontH + Math.max(0, count - 1) * peek;
  const expandedTotal = count
    ? visible.reduce((sum, item) => sum + heightOf(item), 0) + (count - 1) * gap
    : 0;
  const pileHeight = expanded
    ? expandedTotal + expand_lift
    : collapsedTotal;

  const setExpandedBoth = (next) => {
    setExpanded(next);
    on_expand_change(next);
  };

  const cancelPendingCollapse = () => {
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
  };

  const expandNow = () => {
    cancelPendingCollapse();
    setExpandedBoth(true);
  };

  /* leaving collapses after a short grace period (cancelled on re-enter),
     so grazing the pile's edge doesn't snap it shut */
  const collapseSoon = () => {
    cancelPendingCollapse();
    if (collapse_delay_ms > 0) {
      collapseTimerRef.current = setTimeout(() => {
        collapseTimerRef.current = null;
        setExpandedBoth(false);
      }, collapse_delay_ms);
    } else {
      setExpandedBoth(false);
    }
  };

  return (
    <div
      role="group"
      aria-label={aria_label}
      data-card-stack=""
      data-expanded={expanded}
      onMouseEnter={expandNow}
      onMouseLeave={collapseSoon}
      onFocus={expandNow}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          collapseSoon();
        }
      }}
      style={{
        pointerEvents: "auto",
        ...style,
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: pileHeight,
          transition: `height ${animMs}ms ${ease}`,
        }}
      >
        {visible.map((item, index) => {
          const y = expanded
            ? -expandedOffset(index) - expand_lift
            : -index * peek;
          const scale = expanded ? 1 : 1 - index * scale_step;
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
                transition: `transform ${animMs}ms ${ease}`,
              }}
            >
              {render_card({
                item,
                index,
                expanded,
                overflow: index === 0 ? overflow : 0,
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CardStack;

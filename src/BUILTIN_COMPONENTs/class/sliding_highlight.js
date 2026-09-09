import { useEffect, useRef, useState } from "react";

/**
 * SlidingHighlight — ONE highlight block that glides between rows.
 *
 * Rendered inside a position:relative (scrollable) list container, it
 * follows the row at `refs.current[index]` by animating transform/size, so
 * hover reads as a single pill sliding up and down the list instead of
 * per-row fades. The target is resolved inside a layout effect (post-
 * commit), so re-rendered lists never leave it pinned to a stale node.
 * Measures offsetLeft/Width too, so indented rows (grouped options) get a
 * correctly sized pill.
 *
 * Position is measured relative to the HOST this block is rendered in — the
 * nearest positioned ancestor of the block itself — by walking the target's
 * offsetParent chain up to that host and summing the offsets along the way.
 * A row's own offsetParent is NOT necessarily the host: Explorer wraps each
 * folder's children in a position:relative branch (it carries the guide
 * line), so a nested row's offsetTop is measured from that branch, not from
 * the list. Reading offsetTop alone painted a nested row's highlight at
 * (list top + offset-within-branch) — the pill sat on the first row while
 * the pointer was three rows down. Layout offsets rather than bounding rects
 * on purpose: rows animate in with a translateY, and a rect taken
 * mid-entrance would bake that transform into the resting position.
 *
 * `measureKey` must change whenever the list's layout may have shifted for
 * the SAME index (filtering, group switch) so the position is re-measured.
 * First appearance snaps into place without sliding.
 *
 * Deliberately a PASSIVE effect (not layout): callback refs re-attach
 * during the commit in tree order, and this component renders before the
 * rows — a layout effect here would read the refs while they are still
 * detached and never find its target.
 */
const MAX_OFFSET_HOPS = 32;

const measureWithinHost = (target, host) => {
  let top = target.offsetTop;
  let left = target.offsetLeft;
  if (!host) return { top, left };

  let node = target.offsetParent;
  let hops = 0;
  while (node && node !== host && hops < MAX_OFFSET_HOPS) {
    top += node.offsetTop;
    left += node.offsetLeft;
    node = node.offsetParent;
    hops += 1;
  }
  if (node !== host) {
    /* The target is not inside this host at all — there is nothing to
       accumulate against, so keep the plain offsets, which is exactly what
       every caller saw before this walk existed. */
    return { top: target.offsetTop, left: target.offsetLeft };
  }
  return { top, left };
};

const SlidingHighlight = ({ refs, index, color, borderRadius, measureKey }) => {
  const [box, setBox] = useState(null);
  const hadBoxRef = useRef(false);
  /* The block is rendered even while it has nothing to show, so that this
     ref exists by the time the first measurement runs — its offsetParent is
     how the host is found. */
  const spanRef = useRef(null);

  useEffect(() => {
    const target =
      typeof index === "number" && index >= 0 ? refs?.current?.[index] : null;
    if (!target || !target.isConnected) {
      setBox(null);
      hadBoxRef.current = false;
      return;
    }
    const host = spanRef.current ? spanRef.current.offsetParent : null;
    const { top, left } = measureWithinHost(target, host);
    setBox({
      top,
      left,
      width: target.offsetWidth,
      height: target.offsetHeight,
      animate: hadBoxRef.current,
    });
    hadBoxRef.current = true;
  }, [refs, index, measureKey]);

  return (
    <span
      ref={spanRef}
      aria-hidden="true"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        transform: box ? `translate(${box.left}px, ${box.top}px)` : "none",
        width: box ? box.width : 0,
        height: box ? box.height : 0,
        opacity: box ? 1 : 0,
        borderRadius,
        backgroundColor: color,
        transition:
          box && box.animate
            ? "transform 200ms cubic-bezier(0.3, 1, 0.35, 1), width 200ms cubic-bezier(0.3, 1, 0.35, 1), height 200ms cubic-bezier(0.3, 1, 0.35, 1), background-color 150ms ease"
            : "none",
        pointerEvents: "none",
        zIndex: 0,
      }}
    />
  );
};

export default SlidingHighlight;

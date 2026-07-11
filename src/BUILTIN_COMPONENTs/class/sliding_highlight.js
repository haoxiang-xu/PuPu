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
 * `measureKey` must change whenever the list's layout may have shifted for
 * the SAME index (filtering, group switch) so the position is re-measured.
 * First appearance snaps into place without sliding.
 *
 * Deliberately a PASSIVE effect (not layout): callback refs re-attach
 * during the commit in tree order, and this component renders before the
 * rows — a layout effect here would read the refs while they are still
 * detached and never find its target.
 */
const SlidingHighlight = ({ refs, index, color, borderRadius, measureKey }) => {
  const [box, setBox] = useState(null);
  const hadBoxRef = useRef(false);

  useEffect(() => {
    const target =
      typeof index === "number" && index >= 0 ? refs?.current?.[index] : null;
    if (!target || !target.isConnected) {
      setBox(null);
      hadBoxRef.current = false;
      return;
    }
    setBox({
      top: target.offsetTop,
      left: target.offsetLeft,
      width: target.offsetWidth,
      height: target.offsetHeight,
      animate: hadBoxRef.current,
    });
    hadBoxRef.current = true;
  }, [refs, index, measureKey]);

  if (!box) return null;

  return (
    <span
      aria-hidden="true"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        transform: `translate(${box.left}px, ${box.top}px)`,
        width: box.width,
        height: box.height,
        borderRadius,
        backgroundColor: color,
        transition: box.animate
          ? "transform 200ms cubic-bezier(0.3, 1, 0.35, 1), width 200ms cubic-bezier(0.3, 1, 0.35, 1), height 200ms cubic-bezier(0.3, 1, 0.35, 1), background-color 150ms ease"
          : "none",
        pointerEvents: "none",
        zIndex: 0,
      }}
    />
  );
};

export default SlidingHighlight;

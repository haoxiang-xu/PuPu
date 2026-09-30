import { useEffect, useRef, useState } from "react";

// Hit area width; the pill sits inside it, leaving a gap from the panel edge.
const RESIZE_HANDLE_WIDTH = 12;
const PILL_WIDTH = 4;
const PILL_HEIGHT = 36;
// Hovered/dragging the pill stretches to the panel height minus this margin
// (top + bottom combined), reading as a full-height grab bar.
const PILL_ACTIVE_MARGIN = 16;
// Hovered / dragging: the canvas accent blue. At rest: a faint tint of the
// canvas foreground so the pill sits quietly against the background.
const PILL_ACTIVE_COLOR = "#4a5bd8";
const PILL_REST_COLOR_DARK = "rgba(255,255,255,0.12)";
const PILL_REST_COLOR_LIGHT = "rgba(0,0,0,0.1)";

/**
 * Drag strip floating just OUTSIDE a panel's inner edge, drawn as a small
 * pill centered vertically — neutral at rest, blue when hovered or dragged.
 * The parent positions it (via `style`:
 * left/right/top/bottom) and toggles `visible` with the panel, so it is
 * never clipped by the panel's own overflow.
 *
 * Owns only the pointer lifecycle: on pointerdown it starts tracking on
 * `window` and reports the horizontal delta from the press point through
 * `onDrag(dx)` on every move, then `onDragEnd()` once released. The parent
 * decides what the delta means (sign, clamp, persist).
 */
export default function PanelResizeHandle({
  style,
  visible = true,
  isDark,
  onDrag,
  onDragStart,
  onDragEnd,
  testId,
  pillTestId,
}) {
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);
  const onDragRef = useRef(onDrag);
  const onDragEndRef = useRef(onDragEnd);
  useEffect(() => {
    onDragRef.current = onDrag;
    onDragEndRef.current = onDragEnd;
  }, [onDrag, onDragEnd]);

  useEffect(() => {
    if (!dragging) return undefined;
    const handleMove = (e) => {
      if (onDragRef.current) onDragRef.current(e.clientX - startXRef.current);
    };
    const handleUp = () => {
      setDragging(false);
      if (onDragEndRef.current) onDragEndRef.current();
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
    };
  }, [dragging]);

  const active = hovered || dragging;

  return (
    <div
      data-testid={testId}
      role="separator"
      aria-orientation="vertical"
      onPointerDown={(e) => {
        if (e.button !== undefined && e.button !== 0) return;
        e.preventDefault();
        startXRef.current = e.clientX;
        setDragging(true);
        if (onDragStart) onDragStart();
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "absolute",
        width: RESIZE_HANDLE_WIDTH,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "col-resize",
        zIndex: 4,
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        transition: dragging ? "none" : "opacity 0.25s cubic-bezier(0.32,1,0.32,1)",
        WebkitAppRegion: "no-drag",
        touchAction: "none",
        ...style,
      }}
    >
      <div
        data-testid={pillTestId}
        style={{
          width: PILL_WIDTH,
          height: active ? `calc(100% - ${PILL_ACTIVE_MARGIN}px)` : PILL_HEIGHT,
          borderRadius: 999,
          backgroundColor: active
            ? PILL_ACTIVE_COLOR
            : isDark
              ? PILL_REST_COLOR_DARK
              : PILL_REST_COLOR_LIGHT,
          transition: dragging
            ? "none"
            : "background-color 0.15s ease, height 0.3s cubic-bezier(0.32,1,0.32,1)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

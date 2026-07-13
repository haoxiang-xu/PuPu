import { useEffect, useRef } from "react";
import { clampDockPos } from "./dock_position";

/**
 * ControlDock — draggable glass HUD hosting the selected runner's quick
 * controls (portaled in via <TestControls>). Drag from the grip only, so the
 * hosted controls stay clickable. Double-click the grip to reset to the
 * default bottom-center anchor. Position is owned by the parent (modal) and is
 * NOT transitioned, so it follows the pointer 1:1 with no lag.
 */
export default function ControlDock({
  isDark,
  pos,
  onPosChange,
  onContainerReady,
  hidden,
  reclampKey,
}) {
  const rootRef = useRef(null);
  const containerRef = useRef(null);
  const dragRef = useRef(null);

  // hand the portal target up once (onContainerReady must be stable)
  useEffect(() => {
    if (onContainerReady) onContainerReady(containerRef.current);
    return () => {
      if (onContainerReady) onContainerReady(null);
    };
  }, [onContainerReady]);

  // re-clamp a custom position after the modal resizes / content changes
  useEffect(() => {
    if (!pos) return undefined;
    const t = setTimeout(() => {
      const root = rootRef.current;
      if (!root || !root.offsetParent) return;
      const parent = root.offsetParent.getBoundingClientRect();
      const size = root.getBoundingClientRect();
      const clamped = clampDockPos(
        pos,
        { width: parent.width, height: parent.height },
        { width: size.width, height: size.height },
      );
      if (clamped && (clamped.x !== pos.x || clamped.y !== pos.y)) {
        onPosChange(clamped);
      }
    }, 340);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reclampKey]);

  const onGripDown = (e) => {
    const root = rootRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    dragRef.current = {
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {
      /* jsdom / unsupported */
    }
    e.preventDefault();
  };

  const onGripMove = (e) => {
    if (!dragRef.current) return;
    const root = rootRef.current;
    if (!root || !root.offsetParent) return;
    const parent = root.offsetParent.getBoundingClientRect();
    const size = root.getBoundingClientRect();
    const desired = {
      x: e.clientX - parent.left - dragRef.current.offsetX,
      y: e.clientY - parent.top - dragRef.current.offsetY,
    };
    onPosChange(
      clampDockPos(
        desired,
        { width: parent.width, height: parent.height },
        { width: size.width, height: size.height },
      ),
    );
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  const overlayBg = isDark
    ? "rgba(20, 20, 20, 0.72)"
    : "rgba(255, 255, 255, 0.78)";
  const overlayBorder = isDark
    ? "1px solid rgba(255,255,255,0.08)"
    : "1px solid rgba(0,0,0,0.08)";
  const overlayShadow = isDark
    ? "0 8px 32px rgba(0,0,0,0.5)"
    : "0 8px 32px rgba(0,0,0,0.1)";
  const gripColor = isDark ? "rgba(255,255,255,0.30)" : "rgba(0,0,0,0.30)";

  const anchored = pos
    ? { left: pos.x, top: pos.y, transform: "none" }
    : { left: "50%", bottom: 16, transform: "translateX(-50%)" };

  return (
    <div
      ref={rootRef}
      style={{
        position: "absolute",
        zIndex: 5,
        display: hidden ? "none" : "flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 10px 7px 6px",
        maxWidth: "min(560px, calc(100% - 32px))",
        maxHeight: 260,
        overflow: "auto",
        borderRadius: 12,
        background: overlayBg,
        border: overlayBorder,
        backdropFilter: "blur(16px) saturate(1.4)",
        WebkitBackdropFilter: "blur(16px) saturate(1.4)",
        boxShadow: overlayShadow,
        ...anchored,
      }}
    >
      <span
        onPointerDown={onGripDown}
        onPointerMove={onGripMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => onPosChange(null)}
        title="Drag to move · double-click to reset"
        style={{
          flex: "0 0 auto",
          alignSelf: "stretch",
          display: "flex",
          alignItems: "center",
          cursor: "grab",
          color: gripColor,
          fontSize: 13,
          letterSpacing: "-2px",
          padding: "0 2px",
          userSelect: "none",
          touchAction: "none",
        }}
      >
        ⠿
      </span>
      <div
        ref={containerRef}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      />
    </div>
  );
}

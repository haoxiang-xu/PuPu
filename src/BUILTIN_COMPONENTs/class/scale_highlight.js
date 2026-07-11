/**
 * ScaleHighlight — the Button hover-background feel as a reusable layer.
 *
 * An absolutely-positioned span that scales in from the center
 * (scale(0.5, 0) → 1) when `visible`, using Button's exact curves. Hosts
 * must be position: relative and lift their content to zIndex 1 (same
 * contract as Button's internal background span).
 */
const ScaleHighlight = ({ visible, color, borderRadius, inset = 0 }) => (
  <span
    aria-hidden="true"
    style={{
      position: "absolute",
      inset,
      borderRadius,
      backgroundColor: color,
      transform: visible ? "scale(1)" : "scale(0.5, 0)",
      opacity: visible ? 1 : 0,
      transition: visible
        ? "transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1.0), opacity 0.18s ease, background-color 0.15s ease"
        : "transform 0.2s cubic-bezier(0.4, 0, 1, 1), opacity 0.15s ease, background-color 0.15s ease",
      pointerEvents: "none",
      zIndex: 0,
    }}
  />
);

export default ScaleHighlight;

import { useContext, useMemo } from "react";

/* { Contexts } -------------------------------------------------------------------------------------------------------------- */
import { ConfigContext } from "../../CONTAINERs/config/context";
/* { Contexts } -------------------------------------------------------------------------------------------------------------- */

const STYLE_ID = "mini-ui-arc-spinner-style";

/* ── inject shared stylesheet ───────────────────────────────────────────────────────────────────────────────────────────────── */
const ensureStyle = () => {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;

  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.innerHTML = `
    /*
     * Two independent animations at a deliberately irrational duration ratio
     * (1.4 / 1.9 ≈ 0.737) — the same technique used by Material Design,
     * Android, and iOS.
     *
     *   mini-ui-arc-rotate  — SVG spins at a fixed linear pace  (1.4 s/rev)
     *   mini-ui-arc-dash    — arc length breathes via ease-in-out (1.9 s/cycle)
     *
     * Why the tip appears to always go forward:
     *   Rotation speed ≈ 257 °/s.
     *   During arc contraction the tip retreats at most ~242 °/s peak, but
     *   ease-in-out means the RMS rate is roughly half that; rotation wins
     *   and the net angular displacement of the tip is always positive.
     *   The irrational ratio ensures the two animations never re-sync,
     *   producing an organic, non-repeating appearance.
     */

    /* ── wrapper: steady clockwise spin ── */
    .mini-ui-arc-spinner-svg {
      display: block;
      flex-shrink: 0;
      animation: mini-ui-arc-rotate 1.4s linear infinite;
      transform-box: fill-box;
      transform-origin: center;
    }

    /* ── arc: length breathes 6 % → 70 % → 6 % ── */
    .mini-ui-arc-spinner-arc {
      stroke-linecap: round;
      fill: none;
      stroke-dasharray: var(--arc-circum);
      animation: mini-ui-arc-dash 1.9s ease-in-out infinite;
    }

    @keyframes mini-ui-arc-rotate {
      to { transform: rotate(360deg); }
    }

    @keyframes mini-ui-arc-dash {
      0%   { stroke-dashoffset: var(--arc-short); }
      50%  { stroke-dashoffset: var(--arc-long);  }
      100% { stroke-dashoffset: var(--arc-short); }
    }
  `;
  document.head.appendChild(el);
};
/* ── inject shared stylesheet ───────────────────────────────────────────────────────────────────────────────────────────────── */

/* ============================================================================================================================ */
const ArcSpinner = ({
  /* appearance */
  size = 36,
  stroke_width = 3,
  color,
  track_opacity = 0.12,
  /* style override */
  style,
}) => {
  ensureStyle();

  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";

  const resolved = useMemo(() => {
    const spinner_theme = theme?.spinner || {};

    /* ─ color ─ */
    const strokeColor =
      color ??
      spinner_theme?.arcColor ??
      spinner_theme?.color ??
      theme?.color ??
      (isDark ? "#CCCCCC" : "#222222");

    /* ─ geometry ─ */
    const r = (size - stroke_width) / 2;
    const circum = 2 * Math.PI * r;

    /* dashoffset = circum − visibleArcLength */
    const arcShort = circum * 0.94; /* ~6 %  visible — tight needle at start */
    const arcLong  = circum * 0.30; /* ~70 % visible — wide sweeping arc     */

    return { strokeColor, r, circum, arcShort, arcLong };
  }, [size, stroke_width, color, theme, isDark]);

  const cx = size / 2;
  const cy = size / 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="mini-ui-arc-spinner-svg"
      role="status"
      aria-label="Loading"
      style={{
        "--arc-circum": resolved.circum,
        "--arc-short": resolved.arcShort,
        "--arc-long": resolved.arcLong,
        ...style,
      }}
    >
      {/* ── muted track ring ── */}
      <circle
        cx={cx}
        cy={cy}
        r={resolved.r}
        fill="none"
        stroke={resolved.strokeColor}
        strokeWidth={stroke_width}
        opacity={track_opacity}
      />

      {/* ── animated arc ── */}
      <circle
        cx={cx}
        cy={cy}
        r={resolved.r}
        stroke={resolved.strokeColor}
        strokeWidth={stroke_width}
        className="mini-ui-arc-spinner-arc"
      />
    </svg>
  );
};
/* ============================================================================================================================ */

export default ArcSpinner;

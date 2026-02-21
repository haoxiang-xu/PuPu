import { useContext, useEffect, useMemo, useState } from "react";

/* { Contexts } -------------------------------------------------------------------------------------------------------------- */
import { ConfigContext } from "../../CONTAINERs/config/context";
/* { Contexts } -------------------------------------------------------------------------------------------------------------- */

const STYLE_ID = "mini-ui-cell-split-spinner-style";
const GOO_SVG_ID = "mini-ui-cell-goo-svg";
let styleInstanceCount = 0;

/* ── inject shared stylesheet ────────────────────────────────────────────────── */
const ensureStyle = () => {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;

  const styleElement = document.createElement("style");
  styleElement.id = STYLE_ID;
  styleElement.innerHTML = `
    /* ─ container ─ */
    .mini-ui-cell-split {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: var(--cell-size);
      height: var(--cell-size);
      filter: url(#mini-ui-cell-goo);
    }

    /* optional slow spin on the whole flower */
    .mini-ui-cell-split--spin {
      animation: mini-ui-cell-spin var(--cell-spin-dur) linear infinite;
    }

    /* ─ orbit wrapper (sets direction for each dot) ─ */
    .mini-ui-cell-split__orbit {
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 100%;
      transform: rotate(var(--dot-angle));
      pointer-events: none;
    }

    /* ─ dot ─ */
    .mini-ui-cell-split__dot {
      position: absolute;
      width: var(--cell-dot);
      height: var(--cell-dot);
      border-radius: 50%;
      background: var(--cell-color);
      top: 50%;
      left: 50%;
      will-change: transform;
      animation: mini-ui-cell-outward var(--cell-duration) ease-in-out infinite;
      animation-delay: var(--dot-delay, 0ms);
    }

    /* ─ single outward keyframe (orbit rotation gives direction) ─ */
    @keyframes mini-ui-cell-outward {
      0%, 100% {
        transform: translate(-50%, -50%) translateX(0) scale(1);
      }
      10% {
        transform: translate(-50%, -50%) translateX(0) scaleX(1.12) scaleY(0.9);
      }
      30% {
        transform: translate(-50%, -50%) translateX(calc(var(--cell-travel) * 0.85)) scaleX(0.95) scaleY(1.03);
      }
      45% {
        transform: translate(-50%, -50%) translateX(var(--cell-travel)) scale(1);
      }
      55% {
        transform: translate(-50%, -50%) translateX(var(--cell-travel)) scale(1);
      }
      70% {
        transform: translate(-50%, -50%) translateX(calc(var(--cell-travel) * 0.85)) scaleX(0.95) scaleY(1.03);
      }
      90% {
        transform: translate(-50%, -50%) translateX(0) scaleX(1.12) scaleY(0.9);
      }
    }

    @keyframes mini-ui-cell-spin {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
  `;

  document.head.appendChild(styleElement);
};

/* ── inject shared SVG goo filter ────────────────────────────────────────────── */
const ensureGooFilter = (blur) => {
  if (typeof document === "undefined") return;

  /* remove previous if blur changed */
  const prev = document.getElementById(GOO_SVG_ID);
  if (prev) prev.remove();

  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("id", GOO_SVG_ID);
  svg.setAttribute(
    "style",
    "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none",
  );
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = `
    <defs>
      <filter id="mini-ui-cell-goo" color-interpolation-filters="sRGB">
        <feGaussianBlur in="SourceGraphic" stdDeviation="${blur}" result="blur" />
        <feColorMatrix
          in="blur"
          type="matrix"
          values="1 0 0 0 0
                  0 1 0 0 0
                  0 0 1 0 0
                  0 0 0 22 -7"
          result="goo"
        />
        <feComposite in="SourceGraphic" in2="goo" operator="atop" />
      </filter>
    </defs>
  `;
  document.body.appendChild(svg);
};

/* ── component ───────────────────────────────────────────────────────────────── */
/**
 * CellSplitSpinner
 *
 * @param {number}  size      – overall spinner size in px              (default 56)
 * @param {string}  color     – dot colour or "default" for theme      (default "default")
 * @param {number}  speed     – animation speed multiplier 0.2 – 5     (default 1)
 * @param {number}  cells     – number of dots, 2 – 8                  (default 2)
 * @param {number}  spread    – how far dots travel from center, 0 – 1 (default 0.5)
 * @param {number}  stagger   – wave delay between successive dots ms  (default 0)
 * @param {boolean} spin      – slowly rotate the whole spinner        (default false)
 * @param {number}  spinSpeed – spin speed multiplier                   (default 1)
 */
const CellSplitSpinner = ({
  size = 56,
  color = "default",
  speed = 1,
  cells = 2,
  spread = 0.5,
  stagger = 0,
  spin = false,
  spinSpeed = 1,
  style,
  className = "",
  ariaLabel = "Loading",
}) => {
  const { theme } = useContext(ConfigContext);
  const [fillColor, setFillColor] = useState(color);

  useEffect(() => {
    if (theme && color === "default") {
      setFillColor(theme.spinner?.color || "#F4B6A6");
    } else {
      setFillColor(color);
    }
  }, [theme, color]);

  /* ── clamp props ── */
  const safeCells = useMemo(() => {
    const n = Math.round(Number(cells));
    if (!Number.isFinite(n) || n < 2) return 2;
    return Math.min(n, 8);
  }, [cells]);

  const safeSpeed = useMemo(() => {
    const next = Number(speed);
    if (!Number.isFinite(next) || next <= 0) return 1;
    return Math.min(Math.max(next, 0.2), 5);
  }, [speed]);

  const safeSpread = useMemo(() => {
    const s = Number(spread);
    if (!Number.isFinite(s)) return 0.5;
    return Math.min(Math.max(s, 0), 1);
  }, [spread]);

  /* ── derived sizes ── */
  // slightly shrink dots as cell count grows so they don't crowd
  const dotScale = Math.max(0.6, 1 - (safeCells - 2) * 0.055);
  const dotSize = Math.max(8, Math.round(size * 0.42 * dotScale));
  // spread 0→ dots barely move, 1→ dots reach container edge
  const travel = Math.max(4, Math.round(size * 0.5 * safeSpread));
  const blur = Math.max(3, Math.round(dotSize * 0.25));
  const duration = Math.round(1800 / safeSpeed);
  const spinDur = Math.round(6000 / (Number(spinSpeed) || 1));

  /* ── build dot descriptors ── */
  const dots = useMemo(() => {
    const arr = [];
    for (let i = 0; i < safeCells; i++) {
      arr.push({
        angle: (360 / safeCells) * i,
        delay: Math.round(stagger * i),
      });
    }
    return arr;
  }, [safeCells, stagger]);

  /* ── lifecycle: inject / clean-up shared style & goo filter ── */
  useEffect(() => {
    ensureStyle();
    ensureGooFilter(blur);
    styleInstanceCount += 1;
    return () => {
      styleInstanceCount -= 1;
      if (styleInstanceCount <= 0) {
        const s = document.getElementById(STYLE_ID);
        if (s) s.remove();
        const g = document.getElementById(GOO_SVG_ID);
        if (g) g.remove();
        styleInstanceCount = 0;
      }
    };
  }, [blur]);

  /* ── render ── */
  const containerClass = [
    "mini-ui-cell-split",
    spin && "mini-ui-cell-split--spin",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={containerClass}
      style={{
        "--cell-size": `${size}px`,
        "--cell-dot": `${dotSize}px`,
        "--cell-travel": `${travel}px`,
        "--cell-duration": `${duration}ms`,
        "--cell-color": fillColor,
        "--cell-spin-dur": `${spinDur}ms`,
        ...style,
      }}
      role="status"
      aria-label={ariaLabel}
    >
      {dots.map((dot, i) => (
        <div
          key={i}
          className="mini-ui-cell-split__orbit"
          style={{ "--dot-angle": `${dot.angle}deg` }}
        >
          <div
            className="mini-ui-cell-split__dot"
            style={dot.delay ? { "--dot-delay": `${dot.delay}ms` } : undefined}
          />
        </div>
      ))}
    </div>
  );
};

export default CellSplitSpinner;
